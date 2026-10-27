// api/_lib/embed.js
// Server-side query embedding using @xenova/transformers in the Vercel function.
// Model is cached in module scope, so cold start pays the load cost once.

import { pipeline, env as xenovaEnv } from '@xenova/transformers';

// Don't download models to local fs — Vercel functions have a small ephemeral fs.
// transformers.js will cache models in /tmp by default which works on warm invocations.
xenovaEnv.allowLocalModels = false;
xenovaEnv.useBrowserCache = false;

const MODEL = process.env.EMBED_MODEL || 'Xenova/multilingual-e5-small';

let _extractorPromise = null;
let _state = 'idle'; // idle | loading | ready | failed | disabled
const DISABLED = process.env.CHAT_DISABLE_EMBEDDINGS === '1';

function getExtractor() {
  if (DISABLED) {
    _state = 'disabled';
    return Promise.reject(Object.assign(new Error('Embeddings disabled (CHAT_DISABLE_EMBEDDINGS=1)'), { code: 'EMBED_DISABLED' }));
  }
  if (!_extractorPromise) {
    const startedAt = Date.now();
    _state = 'loading';
    console.log(`[embed] initializing extractor for model=${MODEL}`);
    _extractorPromise = pipeline('feature-extraction', MODEL, { quantized: true });
    _extractorPromise
      .then(() => {
        _state = 'ready';
        console.log(`[embed] extractor ready model=${MODEL} in ${Date.now() - startedAt}ms`);
      })
      .catch((error) => {
        _state = 'failed';
        console.error(`[embed] extractor init failed model=${MODEL}:`, error?.message || error);
        _extractorPromise = null;
      });
  }
  return _extractorPromise;
}

// 'ready' means a query embeds in a few ms; anything else means the caller should not wait long.
export function embedderState() {
  return DISABLED ? 'disabled' : _state;
}

function meanPool(output) {
  const data = output.data;
  const [, seqLen, hidden] = output.dims;
  const pooled = new Float32Array(hidden);
  for (let i = 0; i < seqLen; i++) {
    for (let j = 0; j < hidden; j++) {
      pooled[j] += data[i * hidden + j];
    }
  }
  for (let j = 0; j < hidden; j++) pooled[j] /= seqLen;
  let norm = 0;
  for (let j = 0; j < hidden; j++) norm += pooled[j] * pooled[j];
  norm = Math.sqrt(norm) || 1;
  for (let j = 0; j < hidden; j++) pooled[j] /= norm;
  return Array.from(pooled);
}

export async function embedQuery(text) {
  const startedAt = Date.now();
  const extractor = await getExtractor();
  const output = await extractor(`query: ${text}`, { pooling: 'none', normalize: false });
  const ms = Date.now() - startedAt;
  if (ms > 50) console.log(`[embed] query embedded in ${ms}ms`, { model: MODEL, textLength: text.length });
  return meanPool(output);
}

export function cosineSim(a, b) {
  // Both vectors are L2-normalized — cosine = dot product.
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

// Warm the model proactively (call at module load to start the download in background)
export function warmup() {
  getExtractor().catch(() => { /* swallow — first real call will retry */ });
}
