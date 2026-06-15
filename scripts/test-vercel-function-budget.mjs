import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const apiFiles = (await readdir(path.join(root, 'api')))
  .filter((file) => file.endsWith('.js'))
  .sort();
const vercel = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
const rewrites = Array.isArray(vercel.rewrites) ? vercel.rewrites : [];

assert.ok(
  apiFiles.length <= 12,
  `Vercel Hobby allows at most 12 top-level api/*.js functions, found ${apiFiles.length}: ${apiFiles.join(', ')}`
);

for (const source of [
  '/api/quotes',
  '/api/quote-update',
  '/api/quote-payment',
  '/api/collections',
  '/api/collections-collect',
  '/api/collections-digest'
]) {
  assert.ok(
    rewrites.some((rewrite) => rewrite.source === source && String(rewrite.destination || '').startsWith('/api/quote-save?')),
    `${source} must rewrite to the consolidated quote-save function`
  );
}

console.log('VERCEL FUNCTION BUDGET HOLDS');
