// tests/chatbot-e2e.test.mjs
// Runs the real api/chat.js handler against a local fake Groq server and a fake Firestore:
// zero real tokens, no network. Covers routing, fallbacks, rate limits, degraded mode, deadlines,
// hand-off, cards, compression and 50 concurrent requests.

import test from 'node:test';
import assert from 'node:assert/strict';
import { startFakeGroq } from './helpers/fake-groq.mjs';
import { createFakeFirestore } from './helpers/fake-firestore.mjs';

const fake = await startFakeGroq();
Object.assign(process.env, {
  GROQ_API_KEY: 'test-key-not-real',
  GROQ_BASE_URL: fake.url,
  GROQ_MODEL: 'openai/gpt-oss-120b',
  GROQ_FALLBACK_MODELS: 'openai/gpt-oss-20b,qwen/qwen3.8-27b',
  GROQ_SMALL_MODEL: 'openai/gpt-oss-20b',
  CHAT_DISABLE_EMBEDDINGS: '1',
  CHAT_REPLY_CACHE_TTL_MS: '60000',
  // Never reach a real Firestore from tests, even if a .env.local is present.
  FIREBASE_PROJECT_ID: '',
  FIREBASE_CLIENT_EMAIL: '',
  FIREBASE_PRIVATE_KEY: '',
  FIREBASE_SERVICE_ACCOUNT: '',
});
const chat = await import('../api/chat.js');
const { budget } = await import('../api/_lib/llm.js');
const handler = chat.default;

let ipCounter = 0;
function call(body, { origin = 'https://qdsystems.ae', ip = null, method = 'POST' } = {}) {
  ipCounter += 1;
  const req = {
    method,
    headers: { host: 'qdsystems.ae', origin, 'x-forwarded-for': ip || `10.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`, 'user-agent': 'test' },
    body: { sessionId: `test-${ipCounter}-${Math.random().toString(36).slice(2, 7)}`, pageLang: 'en', pageUrl: 'https://qdsystems.ae/', visitor: { name: 'Sara', email: 'sara@example.com', phone: '' }, history: [], ...body },
  };
  return new Promise((resolve) => {
    const out = { status: 200, headers: {}, chunks: [], json: null };
    const res = {
      setHeader: (k, v) => { out.headers[k.toLowerCase()] = v; },
      status: (code) => { out.status = code; return res; },
      json: (data) => { out.json = data; resolve(finish(out)); return res; },
      write: (s) => { out.chunks.push(s); return true; },
      end: () => resolve(finish(out)),
    };
    handler(req, res);
  });
}

function finish(out) {
  const events = out.chunks.join('').split('\n\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
  return {
    ...out,
    events,
    text: events.filter((e) => e.type === 'text').map((e) => e.delta).join(''),
    cards: events.filter((e) => e.type === 'actions').flatMap((e) => e.items.map((i) => i.kind)),
    error: events.find((e) => e.type === 'error') || null,
    lead: events.some((e) => e.type === 'lead'),
  };
}

function resetAll() {
  fake.reset();
  fake.setResponder(() => ({ reply: 'We build websites and the systems behind them. What are you working on?' }));
  budget.models.clear();
  chat.__setTestDb(null);
}

test.after(() => fake.close());

test('normal turn: compressed note reaches the model, static prompt first, no tool schema, low max_tokens', async () => {
  resetAll();
  const r = await call({ message: 'hi, I have a restaurant. What can you offer?' });
  assert.equal(r.error, null);
  assert.ok(r.text.length > 10);
  assert.equal(fake.requests.length, 1);
  const sent = fake.requests[0].body;
  assert.equal(sent.messages.at(-1).content, 'restaurant; asks: offer');
  assert.ok(sent.messages[0].content.startsWith('You are the AI assistant on the QD Systems website.'));
  assert.ok(/VISITOR MESSAGES: a visitor turn may reach you as a compact note/.test(sent.messages[0].content));
  assert.equal(sent.tools, undefined);
  assert.ok(sent.max_tokens <= 320, `max_tokens ${sent.max_tokens}`);
  assert.equal(sent.reasoning_effort, 'low');
  assert.equal(sent.include_reasoning, false);
  assert.equal(r.headers['access-control-allow-origin'], 'https://qdsystems.ae');
});

test('simple turn prefers the small model; complex turn uses the primary', async () => {
  resetAll();
  await call({ message: 'do you do nfc for cafes?' });
  assert.equal(fake.requests[0].body.model, 'openai/gpt-oss-20b');
  fake.reset();
  await call({ message: 'I run three branches and need a website with online ordering plus a dashboard that shows orders from every branch in one place, can you do it?' });
  assert.equal(fake.requests[0].body.model, 'openai/gpt-oss-120b');
});

test('zero-token paths: greeting, thanks, emoji make no model call', async () => {
  resetAll();
  for (const message of ['hi', 'مرحبا', '你好', 'привет', '👍']) {
    const r = await call({ message });
    assert.ok(r.text.length > 5, message);
  }
  const t = await call({ message: 'thanks', history: [{ role: 'user', content: 'i need a website' }, { role: 'assistant', content: 'Sure, what kind of business?' }] });
  assert.ok(/welcome|any time|glad/i.test(t.text));
  assert.equal(fake.requests.length, 0);
});

test('generic first-turn question is answered from cache the second time', async () => {
  resetAll();
  const a = await call({ message: 'What do you build?' });
  const b = await call({ message: 'what do you build' });
  assert.equal(fake.requests.length, 1);
  assert.equal(a.text, b.text);
});

test('TPD 429 on the primary: falls back immediately, then skips the primary without calling it', async () => {
  resetAll();
  fake.queue({ status: 429, scope: 'tpd', wait: '18m17.856s' });
  const started = Date.now();
  const r = await call({ message: 'I run three branches and need a website with online ordering plus a dashboard for all of them' });
  assert.ok(Date.now() - started < 1500, 'no waiting on a daily limit');
  assert.equal(r.error, null);
  assert.deepEqual(fake.requests.map((q) => q.body.model), ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']);
  fake.reset();
  await call({ message: 'I run three branches and need a website with online ordering plus a dashboard for all of them, what would you suggest?' });
  assert.deepEqual(fake.requests.map((q) => q.body.model), ['openai/gpt-oss-20b']);
});

test('every model rate-limited: degraded KB answer, quickly, never an error bubble', async () => {
  resetAll();
  fake.setResponder(() => ({ status: 429, scope: 'tpd', wait: '1m59.664s' }));
  const started = Date.now();
  const r = await call({ message: 'can guests rsvp online and can i see seating?' });
  assert.ok(Date.now() - started < 2000);
  assert.equal(r.error, null);
  assert.ok(r.text.length > 20, r.text);
  assert.equal(fake.requests.length, 3);
  // Next request on this instance does not call the provider at all.
  fake.reset();
  const r2 = await call({ message: 'how does the guest list work for a wedding?' });
  assert.equal(fake.requests.length, 0);
  assert.ok(r2.text.length > 20);
  assert.ok(!/\+971|AED|\d+\s?hours/i.test(r2.text), r2.text);
});

test('degraded mode keeps cards and asks before the team hand-off', async () => {
  resetAll();
  const db = createFakeFirestore();
  chat.__setTestDb(db);
  fake.setResponder(() => ({ status: 503 }));
  const r = await call({ message: 'how much is a website for my restaurant?' });
  assert.equal(r.error, null);
  assert.ok(r.lead, 'lead saved quietly');
  assert.ok(/if you.d like[^.]*team/i.test(r.text), r.text); // the visitor is asked, not told
  assert.ok(!/will message|passed|pass this/i.test(r.text), r.text);
  assert.ok(!r.cards.includes('demos'), 'the demos card waits until they say yes');
  assert.equal(db.docsIn('chatLeads').length, 1);
  assert.equal(db.docsIn('chatLeads')[0].contactConsent, 'asked');
  const lead = db.docsIn('chatLeads')[0];
  assert.equal(lead.contact, 'sara@example.com');
  assert.equal(lead.business_type, 'restaurant');
  assert.ok(lead.project_brief.includes('how much is a website for my restaurant?'));
});

test('hand-off: price saves the lead quietly and ASKS; yes confirms with the demos card; no declines', async () => {
  resetAll();
  const db = createFakeFirestore();
  chat.__setTestDb(db);
  fake.setResponder(() => ({ reply: "It's custom, so it depends on what you need built." }));
  const vague = await call({ message: 'how much' });
  assert.ok(!/team/i.test(vague.text));
  assert.ok(/SERVER HANDOFF DECISION: not yet/.test(fake.requests.at(-1).body.messages[0].content));

  const sessionId = 'test-handoff-session';
  const h = [{ role: 'user', content: 'i have a restaurant' }, { role: 'assistant', content: 'A website with online ordering and NFC tags fit best.' }];
  // 1. price question: lead saved, reply asks, nothing is promised yet
  const ask = await call({ sessionId, message: 'whats the cost', history: h });
  assert.ok(ask.lead, 'lead saved at the price question');
  assert.match(ask.text, /if you.d like, I can have the team message you/i);
  assert.ok(!/will message|passed this|pass this/i.test(ask.text), ask.text);
  assert.ok(!ask.cards.includes('demos'));
  assert.equal(db.docsIn('chatLeads').length, 1);
  assert.equal(db.docsIn('chatLeads')[0].contactConsent, 'asked');

  // 1b. asked again before answering: no second offer, no second lead
  const h2 = [...h, { role: 'user', content: 'whats the cost' }, { role: 'assistant', content: ask.text }];
  const again = await call({ sessionId, message: 'and how much for the nfc tags?', history: h2 });
  assert.ok(!again.lead, 'no second lead');
  assert.ok(!/would you like|if you.d like/i.test(again.text), again.text);
  assert.equal(db.docsIn('chatLeads').length, 1);

  // 2. yes: fixed reply, no model call, demos card, consent recorded
  const before = fake.requests.length;
  const yes = await call({ sessionId, message: 'yes please', history: h2 });
  assert.equal(fake.requests.length, before, 'confirming costs no tokens');
  assert.equal(yes.text, 'Great, the team will message you soon. In the meantime, you can take a look at our work.');
  assert.ok(yes.cards.includes('demos'));
  assert.equal(db.docsIn('chatLeads')[0].contactConsent, 'yes');

  // 3. a different visitor says no: polite close, nothing promised, consent recorded
  resetAll();
  const db2 = createFakeFirestore();
  chat.__setTestDb(db2);
  fake.setResponder(() => ({ reply: "It's custom, so it depends on what you need built." }));
  const sid2 = 'test-handoff-no';
  const ask2 = await call({ sessionId: sid2, message: 'whats the cost', history: h });
  const no = await call({ sessionId: sid2, message: 'no thanks', history: [...h, { role: 'user', content: 'whats the cost' }, { role: 'assistant', content: ask2.text }] });
  assert.match(no.text, /No problem, I won.t pass it on/);
  assert.ok(!no.cards.includes('demos'));
  assert.equal(db2.docsIn('chatLeads')[0].contactConsent, 'no');
});

test('a "yes" that is not an answer to our offer does not trigger a hand-off', async () => {
  resetAll();
  const db = createFakeFirestore();
  chat.__setTestDb(db);
  fake.setResponder(() => ({ reply: 'Glad to hear it. What kind of business is it for?' }));
  const r = await call({ message: 'yes', history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hi, welcome to QD. How can I help you?' }] });
  assert.ok(!/will message/i.test(r.text), r.text);
  assert.equal(db.docsIn('chatLeads').length, 0);
});

test('model claims a hand-off that did not happen: claim is removed', async () => {
  resetAll();
  fake.setResponder(() => ({ reply: "We do websites. I'll pass this to the team and they'll message you soon." }));
  const r = await call({ message: 'what kind of websites do you make for clinics' });
  assert.ok(!/team/i.test(r.text), r.text);
});

test('server error and empty completion fall through the chain', async () => {
  resetAll();
  fake.queue({ status: 500 }, { empty: true });
  const r = await call({ message: 'I need a booking system for my salon with reminders and a dashboard, can you build that for us?' });
  assert.equal(r.error, null);
  assert.deepEqual(fake.requests.map((q) => q.body.model), ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b']);
  assert.equal(fake.requests[2].body.reasoning_effort, 'none');
});

test('slow provider: per-attempt timeout and overall deadline, then degraded', async () => {
  resetAll();
  process.env.LLM_ATTEMPT_TIMEOUT_MS = '700';
  fake.setResponder(() => ({ delayMs: 1500, reply: 'late' }));
  const started = Date.now();
  const r = await call({ message: 'I need an online store for my boutique with payments and delivery tracking, what do you suggest?' });
  delete process.env.LLM_ATTEMPT_TIMEOUT_MS;
  assert.ok(Date.now() - started < 4000, `took ${Date.now() - started}ms`);
  assert.equal(r.error, null);
  assert.ok(r.text.length > 10);
});

test('truncated reasoning reply keeps complete sentences only', async () => {
  resetAll();
  fake.queue({ reply: 'We can build that for your cafe. It would include a menu and', finish: 'length' });
  const r = await call({ message: 'I need a website with a digital menu for my cafe and online ordering, is that something you do?' });
  assert.equal(r.text, 'We can build that for your cafe.');
});

test('sanitizer still applies to model output (dashes, emoji, invented numbers)', async () => {
  resetAll();
  fake.queue({ reply: 'Sure — we build sites 🚀! Call +971 50 999 8888.' });
  const r = await call({ message: 'Can you build a website for my real estate agency with listings and a lead form?' });
  assert.ok(!/[—🚀!]/u.test(r.text), r.text);
  assert.ok(!/999 8888/.test(r.text));
});

test('origin allowlist: other sites are refused; localhost and same-origin pass', async () => {
  resetAll();
  const bad = await call({ message: 'hi there friend, what do you do' }, { origin: 'https://evil.example' });
  assert.equal(bad.status, 403);
  assert.equal(fake.requests.length, 0);
  const local = await call({ message: 'hi' }, { origin: 'http://localhost:3000' });
  assert.equal(local.status, 200);
});

test('per-IP burst limit answers without a model call', async () => {
  resetAll();
  const ip = '203.0.113.7';
  const results = [];
  for (let i = 0; i < 5; i += 1) results.push(await call({ message: `I need a website for my gym number ${i}, what can you do?` }, { ip }));
  assert.ok(results.slice(3).every((r) => /faster than I can keep up/.test(r.text)));
  assert.equal(fake.requests.length, 3);
});

test('history is compacted: two verbatim turns plus a facts line', async () => {
  resetAll();
  const history = [];
  const turns = ['hi, i have a restaurant in Dubai Marina', 'we have 25 tables', 'i want online ordering', 'and nfc tags on tables', 'what about reviews'];
  for (const t of turns) history.push({ role: 'user', content: t }, { role: 'assistant', content: 'That works well for a restaurant. '.repeat(5) });
  await call({ message: 'can you elaborate', history });
  const sent = fake.requests[0].body.messages;
  assert.equal(sent.filter((m) => m.role === 'user').length, 3);
  assert.ok(/CHAT SO FAR .*restaurant/.test(sent[0].content));
  assert.ok(sent.filter((m) => m.role === 'assistant').every((m) => m.content.length <= 300));
});

test('50 simultaneous requests all complete with a reply', async () => {
  resetAll();
  fake.setResponder(() => ({ delayMs: 50, reply: 'Happy to help with that. What kind of business is it for?' }));
  const started = Date.now();
  const results = await Promise.all(Array.from({ length: 50 }, (_, i) => call({ message: `I need a website with online booking for my clinic number ${i}` })));
  assert.ok(results.every((r) => r.status === 200 && !r.error && r.text.length > 5));
  assert.ok(Date.now() - started < 8000);
});
