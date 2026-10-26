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

// Consolidated endpoints must keep their public URLs working through rewrites.
for (const [source, destination] of [
  ['/api/quote-create', '/api/quote-save?__quoteRoute=quote-create'],
  ['/api/quote-from-estimate', '/api/quote-save?__quoteRoute=quote-create'],
  ['/api/quote-verify', '/api/quote-save?__quoteRoute=quote-verify'],
  ['/api/demo-deploy', '/api/demo?__demoRoute=deploy'],
  ['/api/demo-get', '/api/demo?__demoRoute=get'],
  ['/api/demo-verify', '/api/demo?__demoRoute=verify']
]) {
  assert.ok(
    rewrites.some((rewrite) => rewrite.source === source && rewrite.destination === destination),
    `${source} must rewrite to ${destination}`
  );
}

// Every function with explicit config in vercel.json must exist, and the removed ones must stay gone.
for (const file of Object.keys(vercel.functions || {})) {
  assert.ok(apiFiles.includes(path.basename(file)), `vercel.json configures ${file} but it does not exist`);
}
for (const gone of ['demo-deploy.js', 'demo-get.js', 'demo-verify.js', 'quote-create.js', 'quote-verify.js']) {
  assert.ok(!apiFiles.includes(gone), `${gone} was merged into a dispatcher and must not return as a top-level function`);
}

console.log('VERCEL FUNCTION BUDGET HOLDS');
