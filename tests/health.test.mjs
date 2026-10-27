// tests/health.test.mjs: offline tests for the health checks (fake Groq, fake Firestore).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KB_EXPECTED_SOURCES, checkEnv, checkGroq, checkKnowledgeBase, checkActivity, summarize, formatAlert, getConfiguredModels, withTimeout, usageIssues,
} from '../api/_lib/health.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const groqResponse = (ids, ok = true, status = 200) => async () => ({ ok, status, json: async () => ({ data: ids.map((id) => ({ id })) }) });

function fakeDb({ sources = KB_EXPECTED_SOURCES, total = 248, conversations = 3, leads = 1, fail = false } = {}) {
  const countOf = (n) => ({ get: async () => ({ data: () => ({ count: n }) }) });
  return {
    collection(name) {
      if (fail) throw new Error('firestore unavailable');
      if (name === 'kb_chunks') {
        return {
          count: () => countOf(total),
          where: (_field, _op, source) => ({ limit: () => ({ get: async () => ({ empty: !sources.includes(source) }) }) }),
        };
      }
      return { where: () => ({ count: () => countOf(name === 'chatLeads' ? leads : conversations) }) };
    },
  };
}

test('every knowledge/*.md file is in the expected KB source list', () => {
  const files = readdirSync(path.join(ROOT, 'knowledge')).filter((f) => f.endsWith('.md'));
  for (const f of files) assert.ok(KB_EXPECTED_SOURCES.includes(f), `${f} is not checked by the health endpoint`);
});

test('getConfiguredModels reads env and dedupes the primary from fallbacks', () => {
  assert.deepEqual(getConfiguredModels({ GROQ_MODEL: 'a', GROQ_FALLBACK_MODELS: 'a, b ,c' }), { primary: 'a', fallbacks: ['b', 'c'] });
  assert.equal(getConfiguredModels({}).primary, 'llama-3.3-70b-versatile');
});

test('checkEnv flags missing keys and accepts either Firebase credential form', () => {
  assert.equal(checkEnv({}).ok, false);
  assert.equal(checkEnv({ GROQ_API_KEY: 'k', FIREBASE_SERVICE_ACCOUNT: '{}' }).ok, true);
  assert.equal(checkEnv({ GROQ_API_KEY: 'k', FIREBASE_PROJECT_ID: 'p', FIREBASE_CLIENT_EMAIL: 'e', FIREBASE_PRIVATE_KEY: 'x' }).ok, true);
  assert.equal(checkEnv({ GROQ_API_KEY: 'k', FIREBASE_PROJECT_ID: 'p' }).ok, false);
});

test('checkGroq: healthy, missing primary (the incident we had), no fallbacks, bad key, network error', async () => {
  const ok = await checkGroq({ apiKey: 'k', primary: 'm1', fallbacks: ['m2'], fetchImpl: groqResponse(['m1', 'm2']) });
  assert.equal(ok.ok, true);

  const deadPrimary = await checkGroq({ apiKey: 'k', primary: 'llama-3.3-70b-versatile', fallbacks: ['m2'], fetchImpl: groqResponse(['m2']) });
  assert.equal(deadPrimary.ok, false);
  assert.match(deadPrimary.issues[0], /llama-3\.3-70b-versatile.*not available/);

  const noFallback = await checkGroq({ apiKey: 'k', primary: 'm1', fallbacks: ['x'], fetchImpl: groqResponse(['m1']) });
  assert.match(noFallback.issues.join(' '), /No fallback/);

  const badKey = await checkGroq({ apiKey: 'k', primary: 'm1', fallbacks: [], fetchImpl: groqResponse([], false, 401) });
  assert.match(badKey.issues[0], /HTTP 401/);

  const net = await checkGroq({ apiKey: 'k', primary: 'm1', fallbacks: [], fetchImpl: async () => { throw new Error('ECONNRESET'); } });
  assert.match(net.issues[0], /ECONNRESET/);

  assert.equal((await checkGroq({ apiKey: '', primary: 'm', fallbacks: [] })).ok, false);
});

test('checkKnowledgeBase flags missing sources and empty/unreachable Firestore', async () => {
  assert.equal((await checkKnowledgeBase({ db: fakeDb() })).ok, true);
  const missing = await checkKnowledgeBase({ db: fakeDb({ sources: KB_EXPECTED_SOURCES.filter((s) => s !== 'nfc.md' && s !== 'events.md') }) });
  assert.deepEqual(missing.missingSources, ['nfc.md', 'events.md']);
  assert.match(missing.issues[0], /build:kb/);
  assert.match((await checkKnowledgeBase({ db: fakeDb({ total: 0, sources: [] }) })).issues[0], /empty/);
  const down = await checkKnowledgeBase({ db: fakeDb({ fail: true }) });
  assert.equal(down.firestore, false);
});

test('checkActivity returns counts only', async () => {
  const a = await checkActivity({ db: fakeDb({ conversations: 7, leads: 2 }) });
  assert.deepEqual({ c: a.conversationsLast24h, l: a.leadsLast24h }, { c: 7, l: 2 });
  assert.deepEqual(Object.keys(a).sort(), ['conversationsLast24h', 'issues', 'leadsLast24h', 'ok']);
});

test('summarize: ok, degraded, down', () => {
  const healthy = { env: { groqKey: true, issues: [] }, groq: { primary: { available: true }, fallbacks: [{ available: true }], issues: [] }, knowledgeBase: { issues: [] } };
  assert.equal(summarize(healthy).status, 'ok');
  const kbMissing = { ...healthy, knowledgeBase: { issues: ['Knowledge base is missing: nfc.md'] } };
  assert.equal(summarize(kbMissing).status, 'degraded');
  const allModelsGone = { ...healthy, groq: { primary: { available: false }, fallbacks: [{ available: false }], issues: ['x'] } };
  assert.equal(summarize(allModelsGone).status, 'down');
  const noKey = { ...healthy, env: { groqKey: false, issues: ['no key'] } };
  assert.equal(summarize(noKey).status, 'down');
});

test('formatAlert lists issues and never includes secrets', () => {
  const text = formatAlert({ status: 'degraded', issues: ['Knowledge base is missing: nfc.md'], checkedAt: '2026-10-27T05:00:00Z' });
  assert.match(text, /DEGRADED/);
  assert.match(text, /nfc\.md/);
  assert.ok(!/sk-|gsk_|Bearer/i.test(text));
});

test('withTimeout rejects slow work', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 20, 'slow'), /slow timed out/);
  assert.equal(await withTimeout(Promise.resolve(5), 50, 'fast'), 5);
});

test('usageIssues warns at 80% of a model daily budget only', () => {
  assert.deepEqual(usageIssues({ models: { a: { billable: 100000 } } }), []);
  assert.match(usageIssues({ models: { 'openai/gpt-oss-120b': { billable: 170000 } } })[0], /85%/);
  assert.deepEqual(usageIssues({}), []);
});
