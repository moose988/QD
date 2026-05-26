// api/_lib/embed.js
// Server-side query embedding using @xenova/transformers in the Vercel function.
// Model is cached in module scope, so cold start pays the load cost once.

import { pipeline, env as xenovaEnv } from '@xenova/transformers';

// Don't download models to local fs — Vercel functions have a small ephemeral fs.
// transformers.js will cache models in /tmp by default which works on warm invocations.
xenovaEnv.allowLocalModels = false;
xenovaEnv.useBrowserCache = false;

const MODEL = process.env.EMBED_MODEL || 'Xenova/multilingual-e5-base';

let _extractorPromise = null;

function getExtractor() {
  if (!_extractorPromise) {
    const startedAt = Date.now();
    console.log(`[embed] initializing extractor for model=${MODEL}`);
    _extractorPromise = pipeline('feature-extraction', MODEL, { quantized: true });
    _extractorPromise
      .then(() => {
        console.log(`[embed] extractor ready model=${MODEL} in ${Date.now() - startedAt}ms`);
      })
      .catch((error) => {
        console.error(`[embed] extractor init failed model=${MODEL}:`, error?.message || error);
        _extractorPromise = null;
      });
  }
  return _extractorPromise;
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
  console.log(`[embed] query embedded in ${Date.now() - startedAt}ms`, {
    model: MODEL,
    textLength: text.length,
  });
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
