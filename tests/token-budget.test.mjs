// tests/token-budget.test.mjs
// Token-free tests for message compression, intent notes, history compaction, quota/rate-limit
// handling, usage accounting, quick replies, hand-off decisions and the degraded (no-LLM) reply.

import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { compressMessage, estimateTokens, compactHistory, extractFacts, COMPRESS_TRIGGER_CHARS } from '../api/_lib/token-budget.js';
import { compressIntent, visibleEntities } from '../api/_lib/intent.js';
import { parseDuration, parseRateLimit, ModelBudget, orderModels, RequestLimiter, checkOrigin } from '../api/_lib/quota.js';
import { summarizeUsage, normalizeUsage } from '../api/_lib/usage.js';
import { quickReply, cacheKey, isCacheable } from '../api/_lib/quick-replies.js';
import { decideHandoff, buildLead } from '../api/_lib/handoff.js';
import { degradedReply } from '../api/_lib/degraded.js';
import { trimToSentences, loadChain, modelParams } from '../api/_lib/llm.js';
import { INTENT_EXAMPLES } from './fixtures/intent-examples.mjs';

const RUNS = { numRuns: 600 };
const scriptOf = (t) => (/[؀-ۿ]/u.test(t) ? 'ar' : /[一-鿿]/u.test(t) ? 'zh' : /[Ѐ-ӿ]/u.test(t) ? 'ru' : null);

// Realistic visitor text: words in four scripts, numbers, dates, emails, URLs, punctuation, emoji.
const word = fc.oneof(
  fc.constantFrom('i', 'have', 'a', 'restaurant', 'need', 'website', 'how', 'much', 'nfc', 'tags', 'wedding', 'guests', 'dashboard', 'please', 'thanks', 'hi', 'the', 'we', 'online', 'ordering', 'Dubai', 'sharjah', 'clinic', 'not', "don't", 'mat3am', '3andi'),
  fc.constantFrom('عندي', 'مطعم', 'موقع', 'كم', 'السعر', 'أحتاج', 'زفاف', 'مرحبا', '餐厅', '网站', '多少钱', '你好', 'ресторан', 'сайт', 'сколько', 'стоит', 'привет'),
  fc.integer({ min: 0, max: 99999 }).map(String),
  fc.constantFrom('14 November', '2026-11-14', '4 pm', 'sara@example.com', 'https://qdsystems.ae/x', '+971 50 461 1123', 'AED 5,000', '👍', '!!', '?', '.', ',', '؟', '。'),
);
const visitorText = fc.array(word, { minLength: 1, maxLength: 400 }).map((ws) => ws.join(' '));
const digitRuns = (t) => [...t.matchAll(/\p{Nd}+/gu)].map((m) => m[0]);
const emails = (t) => [...t.matchAll(/[^\s@]+@[^\s@]+\.[a-z]{2,}/giu)].map((m) => m[0]);

// ─── compressMessage ─────────────────────────────────────────────────────────
test('compressMessage: never longer, keeps every digit run, email and URL, keeps the script, idempotent', () => {
  fc.assert(fc.property(visitorText, (text) => {
    const out = compressMessage(text);
    assert.ok(out.length <= text.length);
    for (const d of digitRuns(text)) assert.ok(out.includes(d), `lost digits ${d}`);
    for (const e of emails(text)) assert.ok(out.includes(e), `lost email ${e}`);
    for (const u of text.match(/https?:\/\/\S+/g) || []) assert.ok(out.includes(u), `lost url ${u}`);
    assert.equal(scriptOf(out), scriptOf(text));
    assert.equal(compressMessage(out), out);
    if (out !== text) assert.ok(out.length <= COMPRESS_TRIGGER_CHARS);
  }), RUNS);
});

test('compressMessage never throws on arbitrary Unicode', () => {
  fc.assert(fc.property(fc.string({ unit: 'binary', maxLength: 2000 }), (text) => {
    const out = compressMessage(text);
    assert.equal(typeof out, 'string');
    assert.ok(out.length <= text.length);
    assert.equal(compressMessage(out), out);
  }), RUNS);
});

test('compressMessage: a 1,500-char rambling message keeps the ask and the facts', () => {
  const ramble = `Hi there, hope you are well! So I have been thinking about this for a while. I run a small restaurant in Dubai Marina with about 25 tables. ${'Honestly things are busy and my staff are always confused about phone orders. '.repeat(12)}We want to open a second branch around 14 November. My email is owner@example.com. How much would a website with online ordering cost and how long would it take? Thanks so much in advance!`;
  assert.ok(ramble.length > 1200);
  const out = compressMessage(ramble);
  assert.ok(out.length <= COMPRESS_TRIGGER_CHARS);
  for (const keep of ['restaurant', '25 tables', '14 November', 'owner@example.com', 'How much']) assert.ok(out.includes(keep), keep);
  assert.ok(estimateTokens(out) < estimateTokens(ramble) / 2);
});

// ─── compressIntent ──────────────────────────────────────────────────────────
test('compressIntent: example table (40+ real-style messages)', () => {
  assert.ok(INTENT_EXAMPLES.length >= 40);
  for (const ex of INTENT_EXAMPLES) {
    const r = compressIntent(ex.say);
    if (ex.raw) assert.equal(r.compressed, false, `should pass through: ${ex.say} -> ${r.text}`);
    if (r.compressed) for (const m of ex.must || []) assert.ok(r.text.toLowerCase().includes(m.toLowerCase()), `${ex.say} -> ${r.text} lacks ${m}`);
    assert.ok(r.text.length <= ex.say.length);
  }
  assert.equal(compressIntent('hi, I have a restaurant. What can you offer?').text, 'restaurant; asks: offer');
});

test('compressIntent: never longer, keeps numbers/dates/emails/URLs and script, idempotent, never throws', () => {
  fc.assert(fc.property(fc.oneof(visitorText, fc.string({ unit: 'binary', maxLength: 300 })), (text) => {
    const r = compressIntent(text);
    assert.equal(typeof r.text, 'string');
    assert.ok(r.text.length <= text.length);
    for (const e of visibleEntities(text)) assert.ok(r.text.includes(e), `lost ${e} from ${text}`);
    if (scriptOf(text)) assert.equal(scriptOf(r.text), scriptOf(text));
    assert.equal(compressIntent(r.text).text, r.text);
  }), RUNS);
});

// ─── history + facts ─────────────────────────────────────────────────────────
test('compactHistory keeps the last two turns and summarizes the rest into facts', () => {
  const h = [];
  for (const t of ['hi i have a clinic in Sharjah', 'i need a website', 'with online booking', 'how much', 'and how long']) h.push({ role: 'user', content: t }, { role: 'assistant', content: 'x'.repeat(900) });
  const c = compactHistory(h, { keepTurns: 2, assistantChars: 300 });
  assert.equal(c.messages.filter((m) => m.role === 'user').length, 2);
  assert.ok(c.messages.every((m) => m.content.length <= 300));
  assert.ok(/business: clinic/.test(c.factsLine) && /website/.test(c.factsLine) && /pricing/.test(c.factsLine), c.factsLine);
});

test('extractFacts: business, date, guests, urgency in several languages', () => {
  const f = extractFacts(["i'm planning a wedding for around 200 guests on 14 November", 'need it asap']);
  assert.equal(f.guests, '200');
  assert.equal(f.date, '14 November');
  assert.equal(f.urgency, 'urgent');
  assert.equal(extractFacts(['عندي مطعم']).business, 'مطعم');
  assert.equal(extractFacts(['我有一家餐厅']).business, '餐厅');
});

test('estimateTokens is script-aware and monotone', () => {
  assert.ok(estimateTokens('你好你好你好你好') > estimateTokens('hello hello'));
  fc.assert(fc.property(fc.string({ maxLength: 300 }), fc.string({ maxLength: 300 }), (a, b) => {
    assert.ok(estimateTokens(a + b) >= estimateTokens(a));
  }), RUNS);
});

// ─── quota / rate limits ─────────────────────────────────────────────────────
test('parseDuration and parseRateLimit read Groq formats', () => {
  assert.equal(parseDuration('2m59.56s'), 179560);
  assert.equal(parseDuration('7.66s'), 7660);
  assert.equal(parseDuration('517.5ms'), 517.5);
  assert.equal(parseDuration('3'), 3000);
  const tpd = parseRateLimit({ status: 429, message: 'Rate limit reached for model `x` in organization `o` service tier `on_demand` on tokens per day (TPD): Limit 200000, Used 199652, Requested 2856. Please try again in 18m17.856s. Need more tokens?' });
  assert.equal(tpd.scope, 'tpd');
  assert.equal(tpd.waitMs, 1097856);
  assert.equal(tpd.used, 199652);
  const tpm = parseRateLimit({ status: 429, message: 'on tokens per minute (TPM): Limit 8000, Used 7000, Requested 1500. Please try again in 1.2s.' });
  assert.equal(tpm.scope, 'tpm');
  assert.equal(tpm.waitMs, 1200);
  fc.assert(fc.property(fc.anything(), (err) => {
    const r = parseRateLimit(err);
    assert.ok(Number.isFinite(r.waitMs) && r.waitMs > 0);
  }), RUNS);
});

test('ModelBudget routes around cooldowns and short per-minute budget', () => {
  let now = 1_000_000;
  const b = new ModelBudget({ now: () => now });
  const chain = ['big', 'small', 'qwen'];
  b.recordRateLimit('big', { status: 429, message: 'on tokens per day (TPD): Limit 1, Used 1, Requested 1. Please try again in 10m.' });
  b.recordHeaders('small', { 'x-ratelimit-remaining-tokens': '500', 'x-ratelimit-reset-tokens': '30s' });
  const o = orderModels(chain, b, { estTokens: 1200 });
  assert.deepEqual(o.order, ['qwen', 'small']);
  assert.equal(o.skipped[0].model, 'big');
  now += 11 * 60000;
  assert.deepEqual(orderModels(chain, b, { estTokens: 1200, prefer: ['small'] }).order, ['small', 'big', 'qwen']);
});

test('RequestLimiter: burst, per-minute and per-session-day caps', () => {
  let now = 0;
  const l = new RequestLimiter({ now: () => now, limits: { ipPerMinute: 5, ipPerDay: 20, sessionPerMinute: 4, sessionPerDay: 5, burstWindowMs: 2000, burstMax: 3 } });
  assert.ok(l.check({ ip: 'a', sessionId: 's' }).ok);
  assert.ok(l.check({ ip: 'a', sessionId: 's' }).ok);
  assert.ok(l.check({ ip: 'a', sessionId: 's' }).ok);
  assert.equal(l.check({ ip: 'a', sessionId: 's' }).reason, 'burst');
  now += 5000;
  assert.equal(l.check({ ip: 'a', sessionId: 's' }).reason, 'minute');
  now += 61000 * 3;
  assert.equal(l.check({ ip: 'a', sessionId: 's' }).reason, 'session_day');
  assert.ok(l.check({ ip: 'b', sessionId: 't' }).ok);
});

test('checkOrigin: allowlist, localhost, same-origin, others refused', () => {
  const req = (origin, host = 'qdsystems.ae') => ({ headers: { origin, host } });
  assert.ok(checkOrigin(req('https://qdsystems.ae')).ok);
  assert.ok(checkOrigin(req('https://www.qdsystems.ae')).ok);
  assert.ok(checkOrigin(req('http://localhost:3000')).ok);
  assert.ok(checkOrigin(req('https://qd-web-git-x.vercel.app', 'qd-web-git-x.vercel.app')).ok);
  assert.ok(!checkOrigin(req('https://evil.example')).ok);
  assert.ok(!checkOrigin(req('null')).ok);
  assert.ok(checkOrigin({ headers: {} }).ok);
});

// ─── usage ───────────────────────────────────────────────────────────────────
test('normalizeUsage and summarizeUsage: cached tokens are not billable, capacity per day', () => {
  const u = normalizeUsage({ prompt_tokens: 2000, completion_tokens: 100, total_tokens: 2100, prompt_tokens_details: { cached_tokens: 1300 } });
  assert.equal(u.billable, 800);
  const now = Date.parse('2026-10-27T12:00:00Z');
  const s = summarizeUsage([{ at: now - 1000, model: 'm', ...u, path: 'llm' }, { at: now - 500, path: 'quick' }], { now, limits: { tpd: 200000, tpm: 8000 } });
  assert.equal(s.requests, 2);
  assert.equal(s.byPath.quick, 1);
  assert.equal(s.capacity.perModelPerDay, 250);
  assert.equal(s.capacity.perModelPerMinute, 10);
});

// ─── quick replies + cache ───────────────────────────────────────────────────
test('quickReply: greetings and thanks in four languages, never for real questions', () => {
  for (const [m, lang] of [['hi', 'en'], ['Hello there!', 'en'], ['مرحبا', 'ar'], ['你好', 'zh'], ['привет', 'ru'], ['👍', 'en']]) assert.ok(quickReply({ message: m, lang })?.text, m);
  assert.equal(quickReply({ message: 'thanks', lang: 'en' }).kind, 'thanks');
  for (const m of ['hi, i need a website', 'how much', 'hello can you help with nfc', 'ok', 'not sure']) assert.equal(quickReply({ message: m, lang: 'en' }), null, m);
  const h = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hi, welcome to QD. What can I help you with?' }];
  assert.equal(quickReply({ message: 'hello', history: h, lang: 'en' }), null, 'a second greeting goes to the model');
});

test('reply cache only stores generic, impersonal first turns', () => {
  assert.equal(cacheKey('What do you build?', 'en'), cacheKey('what do you build', 'en'));
  assert.ok(isCacheable({ message: 'What do you build?', reply: 'Websites and systems.', visitor: { name: 'Sara Ali' } }));
  assert.ok(!isCacheable({ message: 'What do you build?', reply: 'Hi Sara, websites.', visitor: { name: 'Sara Ali' } }));
  assert.ok(!isCacheable({ message: 'x', reply: 'y', history: [{ role: 'user', content: 'a' }] }));
  assert.ok(!isCacheable({ message: 'x', reply: 'y', decision: 'handoff' }));
});

// ─── hand-off ────────────────────────────────────────────────────────────────
test('decideHandoff: intent + project + contact', () => {
  const v = { name: 'Sara', email: 'sara@example.com' };
  assert.equal(decideHandoff({ userTexts: ['how much'], visitor: v }).decision, 'ask_what');
  assert.equal(decideHandoff({ userTexts: ['how much is a website'], visitor: v }).decision, 'handoff');
  assert.equal(decideHandoff({ userTexts: ['how much', 'a website for my restaurant'], visitor: v }).decision, 'handoff');
  assert.equal(decideHandoff({ userTexts: ['i have a restaurant', 'whats the cost'], visitor: v, lastAssistant: 'A website with online ordering fits best.' }).decision, 'handoff');
  assert.equal(decideHandoff({ userTexts: ['i have a restaurant', 'whats the cost'], visitor: v }).decision, 'ask_what');
  assert.equal(decideHandoff({ userTexts: ['how much is a website'], visitor: null }).decision, 'no_contact');
  assert.equal(decideHandoff({ userTexts: ['do you do nfc'], visitor: v }).decision, 'none');
  assert.equal(decideHandoff({ userTexts: ['how much is a website'], visitor: v, alreadyHandedOff: true }).decision, 'already');
  const lead = buildLead({ userTexts: ['i have a cafe', 'how much for nfc tags, asap'], visitor: { name: 'Sara', phone: '+971 50 000 0000' } });
  assert.equal(lead.business_type, 'cafe');
  assert.equal(lead.urgency, 'urgent');
  assert.ok(lead.project_brief.includes('nfc tags'));
});

// ─── degraded mode ───────────────────────────────────────────────────────────
test('degradedReply only uses KB sentences, filters prices/phones/timelines, answers in the visitor language', async () => {
  const { retrieveLexical } = await import('../api/_lib/retrieval.js');
  for (const [q, lang] of [['can guests rsvp online', 'en'], ['هل يمكن للضيوف تأكيد الحضور', 'ar'], ['客人可以在线回复出席吗', 'zh'], ['гости могут подтвердить участие онлайн', 'ru']]) {
    const chunks = await retrieveLexical(q, { topK: 4, lang });
    const r = degradedReply({ message: q, lang, chunks });
    assert.ok(r.text.length > 10, q);
    assert.equal(scriptOf(r.text) || 'en', lang, `${q} -> ${r.text}`);
    if (r.matched) assert.ok(chunks.some((c) => c.text.replace(/\s+/g, ' ').includes(r.text.split(/(?<=[.?!؟。])\s*/u)[0].slice(0, 20))), 'sentence comes from the KB');
    assert.ok(!/\+971|AED|\$\d/i.test(r.text));
  }
  const none = degradedReply({ message: 'tell me a joke', lang: 'en', chunks: [] });
  assert.equal(none.matched, false);
});

// ─── model client helpers ────────────────────────────────────────────────────
test('trimToSentences, loadChain and modelParams', () => {
  assert.equal(trimToSentences('One. Two and'), 'One.');
  assert.equal(trimToSentences('no end'), '');
  const c = loadChain({ GROQ_API_KEY: 'k', GROQ_MODEL: 'openai/gpt-oss-120b', GROQ_FALLBACK_MODELS: 'openai/gpt-oss-20b', LLM_EXTRA_PROVIDERS: JSON.stringify([{ name: 'other', baseURL: 'https://example.invalid/v1', apiKeyEnv: 'OTHER_KEY', models: ['m1'] }]), OTHER_KEY: 'x' });
  assert.deepEqual(c.chain.map((e) => e.id), ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'other:m1']);
  assert.equal(c.providers.get('groq').baseURL, 'https://api.groq.com/openai/v1');
  assert.equal(loadChain({}).chain.length, 0, 'no key, no models');
  assert.equal(modelParams({ provider: 'groq', model: 'qwen/qwen3.8-27b' }).reasoning_effort, 'none');
  assert.ok(modelParams({ provider: 'groq', model: 'llama-3.1-8b-instant' }).max_tokens <= 220);
});

// ─── KB snapshot freshness ───────────────────────────────────────────────────
test('kb-snapshot.js matches the current knowledge files (run node scripts/build-kb-snapshot.mjs after edits)', async () => {
  const { loadKnowledgeChunks, hashChunks } = await import('../scripts/build-kb-snapshot.mjs');
  const { KB_META, KB_ROWS } = await import('../api/_lib/kb-snapshot.js');
  const chunks = await loadKnowledgeChunks();
  assert.equal(KB_ROWS.length, chunks.length);
  assert.equal(KB_META.hash, hashChunks(chunks), 'knowledge/ changed: rebuild the snapshot');
  assert.equal(Buffer.from(KB_ROWS[0][5], 'base64').length, KB_META.dim * 4);
});
