// scripts/lib/embed.mjs
// Wrapper around @xenova/transformers for the multilingual-e5 family.
// E5 models REQUIRE prefixes:
//   "passage: ..." when embedding documents (indexing)
//   "query: ..."   when embedding user queries
// Cosine similarity is the metric.

import { pipeline } from '@xenova/transformers';

const MODEL = process.env.EMBED_MODEL || 'Xenova/multilingual-e5-base';

let _extractor = null;

async function getExtractor() {
  if (!_extractor) {
    console.log(`[embed] Loading model ${MODEL} (first run downloads ~280MB)...`);
    _extractor = await pipeline('feature-extraction', MODEL, {
      quantized: true, // smaller, faster, basically same quality for retrieval
    });
    console.log('[embed] Model loaded.');
  }
  return _extractor;
}

/**
 * Mean-pool the token embeddings into a single vector, then L2-normalize.
 * @xenova/transformers already returns last_hidden_state; we pool ourselves.
 */
function meanPool(output) {
  const data = output.data;
  const [batch, seqLen, hidden] = output.dims;
  // batch is always 1 here
  const pooled = new Float32Array(hidden);
  for (let i = 0; i < seqLen; i++) {
    for (let j = 0; j < hidden; j++) {
      pooled[j] += data[i * hidden + j];
    }
  }
  for (let j = 0; j < hidden; j++) pooled[j] /= seqLen;
  // L2 normalize
  let norm = 0;
  for (let j = 0; j < hidden; j++) norm += pooled[j] * pooled[j];
  norm = Math.sqrt(norm) || 1;
  for (let j = 0; j < hidden; j++) pooled[j] /= norm;
  return Array.from(pooled);
}

export async function embedPassage(text) {
  const extractor = await getExtractor();
  const output = await extractor(`passage: ${text}`, {
    pooling: 'none',
    normalize: false,
  });
  return meanPool(output);
}

export async function embedQuery(text) {
  const extractor = await getExtractor();
  const output = await extractor(`query: ${text}`, {
    pooling: 'none',
    normalize: false,
  });
  return meanPool(output);
}

export function cosineSim(a, b) {
  // Both vectors are L2-normalized, so cosine = dot product.
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export const EMBED_DIM = 768; // multilingual-e5-base
export const EMBED_MODEL_NAME = MODEL;
