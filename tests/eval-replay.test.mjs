// tests/eval-replay.test.mjs
// Replays real replies from earlier live eval rounds (synthetic test conversations, no visitor data)
// through the deterministic layers: the sanitizer must leave good replies intact, and the intent
// compressor must keep what each visitor message asked for.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeReply, claimsHandoff } from '../api/_lib/sanitize.js';
import { compressIntent, visibleEntities } from '../api/_lib/intent.js';
import { detectLang } from '../api/_lib/prompt.js';

const FIXTURES = JSON.parse(fs.readFileSync(new URL('./fixtures/eval-replies.json', import.meta.url), 'utf8'));

test('sanitizer keeps good eval replies intact and is idempotent on all of them', () => {
  assert.ok(FIXTURES.length > 50);
  for (const f of FIXTURES) {
    const lang = detectLang(f.user) || 'en';
    const once = sanitizeReply(f.bot, { lang, allowPhone: /contact|reach/i.test(f.user) });
    assert.equal(sanitizeReply(once, { lang, allowPhone: /contact|reach/i.test(f.user) }), once, f.bot);
    if (!f.failures.length) assert.ok(once.length >= f.bot.length * 0.7, `over-trimmed: ${f.bot} -> ${once}`);
  }
});

test('hand-off wording in eval replies is recognised by claimsHandoff', () => {
  const claims = FIXTURES.filter((f) => /pass this to the team|team will message|they'll message/i.test(f.bot));
  assert.ok(claims.length >= 2);
  for (const f of claims) assert.ok(claimsHandoff(f.bot), f.bot);
});

test('intent notes for eval visitor messages keep entities and script', () => {
  for (const f of FIXTURES) {
    const r = compressIntent(f.user);
    for (const e of visibleEntities(f.user)) assert.ok(r.text.includes(e), `${f.user} -> ${r.text}`);
    assert.equal(detectLang(r.text) || 'en', detectLang(f.user) || 'en', `${f.user} -> ${r.text}`);
  }
});
