// api/_lib/retrieval.js
// Knowledge-base retrieval. Chunks come from the bundled snapshot (api/_lib/kb-snapshot.js, built by
// scripts/build-kb-snapshot.mjs) so a cold start needs no Firestore read; Firestore `kb_chunks` is the
// fallback when the snapshot is missing or KB_SOURCE=firestore. Similarity is brute-force cosine
// (fine for a few thousand chunks). A BM25 lexical ranker covers the moments when the embedding model
// is not loaded yet (cold start) or is disabled.

import { getDb } from './firebase.js';
import { cosineSim } from './embed.js';

let _cache = null;
let _cacheTime = 0;
let _source = 'none';
const TTL_MS = 5 * 60 * 1000;

async function loadSnapshot() {
  if (process.env.KB_SOURCE === 'firestore') return null;
  try {
    const { KB_ROWS, KB_META } = await import('./kb-snapshot.js');
    if (!Array.isArray(KB_ROWS) || !KB_ROWS.length) return null;
    const chunks = KB_ROWS.map(([id, source, lang, heading, text, b64]) => {
      const buf = Buffer.from(b64, 'base64');
      return { id, source, lang, heading, text, embedding: new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4) };
    });
    console.log('[retrieval] loaded kb snapshot', { count: chunks.length, model: KB_META?.model, hash: KB_META?.hash });
    return chunks;
  } catch (err) {
    console.warn('[retrieval] kb snapshot unavailable, falling back to Firestore:', err?.message || err);
    return null;
  }
}

export async function loadChunks() {
  if (_cache && (_source === 'snapshot' || Date.now() - _cacheTime < TTL_MS)) return _cache;

  const startedAt = Date.now();
  const snap = await loadSnapshot();
  if (snap) {
    _cache = snap;
    _source = 'snapshot';
    _cacheTime = Date.now();
    _lexical = null;
    return _cache;
  }

  const db = getDb();
  const docs = await db.collection('kb_chunks').get();
  _cache = docs.docs.map((d) => {
    const data = d.data();
    return { id: d.id, source: data.source, lang: data.lang, heading: data.heading, text: data.text, embedding: data.embedding };
  });
  _source = 'firestore';
  _cacheTime = Date.now();
  _lexical = null;
  console.log('[retrieval] loaded kb chunks from firestore', { count: _cache.length, elapsedMs: Date.now() - startedAt });
  return _cache;
}

export function kbSource() {
  return _source;
}

/**
 * Retrieve top-K chunks for a query embedding.
 * Boosts language-matched chunks slightly so AR queries prefer AR sources.
 */
export async function retrieve(queryEmbedding, { topK = 6, lang = 'en', minScore = 0.55 } = {}) {
  const chunks = await loadChunks();
  if (!chunks.length) return [];

  const scored = chunks.map((c) => {
    let score = cosineSim(queryEmbedding, c.embedding);
    // Same-language preference: +0.04 if matching, -0.02 otherwise
    if (c.lang === lang) score += 0.04;
    else score -= 0.02;
    return { ...c, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Filter weak matches but always keep at least 3 for context
  const above = scored.filter((c) => c.score >= minScore);
  return above.length >= 3 ? above.slice(0, topK) : scored.slice(0, Math.max(topK, 4));
}

// ─── Lexical (BM25) ranking ──────────────────────────────────────────────────
let _lexical = null;

export function lexTokens(text) {
  const t = String(text || '').toLowerCase();
  const out = [];
  for (const m of t.matchAll(/[\u4e00-\u9fff]+|[^\s\p{P}\p{S}\u4e00-\u9fff]+/gu)) {
    const w = m[0];
    if (/[一-鿿]/u.test(w)) {
      const chars = [...w];
      if (chars.length === 1) out.push(w);
      for (let i = 0; i < chars.length - 1; i += 1) out.push(chars[i] + chars[i + 1]);
    } else if (w.length > 1) {
      // Light stemming: plural and Arabic article, so "restaurants" ~ "restaurant", "المطعم" ~ "مطعم".
      out.push(w.replace(/^(?:ال|وال|بال|لل)(?=\p{L}{2})/u, '').replace(/(?<=\p{L}{3})(?:es|s)$/u, ''));
    }
  }
  return out;
}

function buildLexicalIndex(chunks) {
  const docs = chunks.map((c) => {
    const tf = new Map();
    for (const w of lexTokens(`${c.heading} ${c.heading} ${c.text}`)) tf.set(w, (tf.get(w) || 0) + 1);
    let len = 0;
    for (const n of tf.values()) len += n;
    return { tf, len };
  });
  const df = new Map();
  for (const d of docs) for (const w of d.tf.keys()) df.set(w, (df.get(w) || 0) + 1);
  const avgLen = docs.reduce((n, d) => n + d.len, 0) / Math.max(1, docs.length);
  return { docs, df, avgLen, n: docs.length };
}

/** BM25 top-K over chunk text. Scores are mapped into the same rough range as cosine scores. */
export async function retrieveLexical(query, { topK = 4, lang = 'en' } = {}) {
  const chunks = await loadChunks();
  if (!chunks.length) return [];
  if (!_lexical || _lexical.n !== chunks.length) _lexical = buildLexicalIndex(chunks);
  const { docs, df, avgLen, n } = _lexical;
  const terms = [...new Set(lexTokens(query))];
  const k1 = 1.2;
  const b = 0.75;
  const scored = chunks.map((c, i) => {
    const d = docs[i];
    let s = 0;
    for (const w of terms) {
      const f = d.tf.get(w);
      if (!f) continue;
      const idf = Math.log(1 + (n - df.get(w) + 0.5) / (df.get(w) + 0.5));
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avgLen)));
    }
    if (c.lang === lang) s *= 1.25;
    return { c, s };
  });
  scored.sort((a, b2) => b2.s - a.s);
  const best = scored[0]?.s || 0;
  const pool = scored.filter((x) => x.c.lang === lang);
  const ranked = best > 0 ? scored : pool.length ? pool : scored;
  return ranked.slice(0, topK).map(({ c, s }) => ({ ...c, score: best > 0 ? 0.5 + 0.4 * (s / best) : 0.01 }));
}

export function invalidateCache() {
  _cache = null;
  _lexical = null;
  _source = 'none';
}
