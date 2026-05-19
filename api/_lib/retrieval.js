// api/_lib/retrieval.js
// Loads all KB chunks from Firestore (cached per-instance for 5 min),
// then does brute-force cosine similarity against the query embedding.
// Works fine up to ~10k chunks; QD's KB is well under 200.

import { getDb } from './firebase.js';
import { cosineSim } from './embed.js';

let _cache = null;
let _cacheTime = 0;
const TTL_MS = 5 * 60 * 1000;

export async function loadChunks() {
  if (_cache && Date.now() - _cacheTime < TTL_MS) return _cache;
  const db = getDb();
  const snap = await db.collection('kb_chunks').get();
  _cache = snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      source: data.source,
      lang: data.lang,
      heading: data.heading,
      text: data.text,
      embedding: data.embedding,
    };
  });
  _cacheTime = Date.now();
  return _cache;
}

/**
 * Retrieve top-K chunks for a query embedding.
 * Boosts language-matched chunks slightly so AR queries prefer AR sources.
 */
export async function retrieve(queryEmbedding, { topK = 6, lang = 'en', minScore = 0.55 } = {}) {
  const chunks = await loadChunks();
  if (!chunks.length) return [];

  const scored = chunks.map(c => {
    let score = cosineSim(queryEmbedding, c.embedding);
    // Same-language preference: +0.04 if matching, -0.02 otherwise
    if (c.lang === lang) score += 0.04;
    else score -= 0.02;
    return { ...c, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Filter weak matches but always keep at least 3 for context
  const above = scored.filter(c => c.score >= minScore);
  const final = above.length >= 3 ? above.slice(0, topK) : scored.slice(0, Math.max(topK, 4));

  return final;
}

export function invalidateCache() {
  _cache = null;
}
