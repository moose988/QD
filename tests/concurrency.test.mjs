// tests/concurrency.test.mjs
// Several people chatting at once on the Groq free tier. A fake Groq enforces a per-model
// tokens-per-minute cap exactly like the real one, sped up 40x (a "minute" is 1.5 s), with zero real
// tokens. Every user must get an answer, and the client must not waste time on rejected requests.

import test from 'node:test';
import assert from 'node:assert/strict';
import { startFakeGroq } from './helpers/fake-groq.mjs';
import { complete, loadChain } from '../api/_lib/llm.js';
import { ModelBudget } from '../api/_lib/quota.js';

const WINDOW_MS = 1500; // one simulated minute
const CAP = 8000; // tokens per model per window (Groq free tier)
const PROMPT = 2000;
const COMPLETION = 80;
const EST = 2300; // what chat.js estimates for a request

function makeGroqSim(cached = 0) {
  // `cached` prompt tokens are served from Groq's prompt cache and do not count toward the limits.
  const COST = PROMPT - cached + COMPLETION;
  const used = new Map();
  const stats = { ok: 0, rate429: 0, byModel: {} };
  const responder = (body) => {
    const model = body.model;
    const now = Date.now();
    const arr = (used.get(model) || []).filter(([t]) => now - t < WINDOW_MS);
    used.set(model, arr);
    const inWindow = arr.reduce((n, [, v]) => n + v, 0);
    if (inWindow + COST > CAP) {
      const wait = Math.max(50, WINDOW_MS - (now - arr[0][0]));
      stats.rate429 += 1;
      return { status: 429, scope: 'tpm', wait: `${(wait / 1000).toFixed(2)}s`, delayMs: 15 };
    }
    arr.push([now, COST]);
    stats.ok += 1;
    stats.byModel[model] = (stats.byModel[model] || 0) + 1;
    const remaining = CAP - inWindow - COST;
    const reset = arr.length ? WINDOW_MS - (now - arr[0][0]) : WINDOW_MS;
    return {
      reply: 'Sure, happy to help with that. What kind of business is it for?',
      usage: { prompt_tokens: PROMPT, completion_tokens: COMPLETION, total_tokens: PROMPT + COMPLETION, prompt_tokens_details: { cached_tokens: cached } },
      headers: { 'x-ratelimit-remaining-tokens': String(remaining), 'x-ratelimit-reset-tokens': `${(reset / 1000).toFixed(2)}s` },
      delayMs: 50, // model latency
    };
  };
  return { responder, stats };
}

async function simulate({ users, messagesPerUser, thinkMs, seed = 1, cached = 0 }) {
  const fake = await startFakeGroq();
  const sim = makeGroqSim(cached);
  fake.setResponder(sim.responder);
  const chainConfig = loadChain({ GROQ_API_KEY: 'k', GROQ_BASE_URL: fake.url, GROQ_MODEL: 'openai/gpt-oss-120b', GROQ_FALLBACK_MODELS: 'openai/gpt-oss-20b,qwen/qwen3.8-27b' });
  const budget = new ModelBudget({ limits: { tpm: CAP, tpd: 200000, rpd: 1000 }, minuteMs: WINDOW_MS });
  let rand = seed;
  const rnd = () => ((rand = (rand * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const latencies = [];
  let answered = 0;
  const failures = [];
  await Promise.all(Array.from({ length: users }, async (_, u) => {
    await new Promise((r) => setTimeout(r, rnd() * 120)); // people do not start in the same millisecond
    for (let m = 0; m < messagesPerUser; m += 1) {
      const startedAt = Date.now();
      try {
        await complete({
          messages: [{ role: 'user', content: 'restaurant; asks: offer' }],
          estTokens: EST,
          chainConfig,
          budgetTracker: budget,
          deadlineAt: Date.now() + 6000,
          attemptTimeoutMs: 3000,
          maxQueueWaitMs: 150, // 6 real seconds, scaled like the 40x faster simulated minute
        });
        answered += 1;
        latencies.push(Date.now() - startedAt);
      } catch (err) {
        failures.push(`${err.message || err}`.slice(0, 80));
      }
      await new Promise((r) => setTimeout(r, thinkMs[0] + rnd() * (thinkMs[1] - thinkMs[0])));
    }
  }));
  await fake.close();
  latencies.sort((a, b) => a - b);
  return { answered, failures, stats: sim.stats, p50: latencies[Math.floor(latencies.length * 0.5)] || 0, p95: latencies[Math.floor(latencies.length * 0.95)] || 0, total: users * messagesPerUser };
}

// A person reads the reply, thinks and types: 20-45 real seconds between messages = 500-1100 ms here.
const REALISTIC = [500, 1100];

test('3 people chatting at a realistic pace, cold prompt cache: at least 90% answered by a model', async () => {
  const r = await simulate({ users: 3, messagesPerUser: 10, thinkMs: REALISTIC });
  console.log('  3 users (realistic):', JSON.stringify({ answered: r.answered, of: r.total, rejected429: r.stats.rate429, p50ms: r.p50, p95ms: r.p95, byModel: r.stats.byModel }));
  assert.ok(r.answered / r.total >= 0.9, `only ${r.answered}/${r.total} answered by a model`);
  assert.ok(r.stats.rate429 <= 1, `too many wasted rate-limit rejections: ${r.stats.rate429}`);
  assert.ok(r.p95 < 400, `p95 too slow: ${r.p95} ms simulated (= ${Math.round(r.p95 * 40 / 1000)} s real)`);
});

test('2 people at a realistic pace', async () => {
  const r = await simulate({ users: 2, messagesPerUser: 12, thinkMs: REALISTIC, seed: 11 });
  console.log('  2 users (realistic):', JSON.stringify({ answered: r.answered, of: r.total, rejected429: r.stats.rate429, p95ms: r.p95 }));
  assert.equal(r.failures.length, 0, r.failures.join(' | '));
  assert.ok(r.stats.rate429 <= 1);
});

test('3 people typing at the very same instant (worst-case burst): nobody is rejected by the provider', async () => {
  const r = await simulate({ users: 3, messagesPerUser: 4, thinkMs: [150, 400], seed: 7 });
  console.log('  burst:', JSON.stringify({ answered: r.answered, of: r.total, rejected429: r.stats.rate429, p95ms: r.p95, byModel: r.stats.byModel }));
  assert.ok(r.stats.rate429 <= 1, `wasted rejections: ${r.stats.rate429}`);
  assert.ok(r.answered / r.total >= 0.5, `only ${r.answered}/${r.total} answered by a model`);
});

test('5 people chatting fast: past the free-tier ceiling, the overflow degrades instead of hammering the provider', async () => {
  const r = await simulate({ users: 5, messagesPerUser: 6, thinkMs: [300, 700], seed: 3 });
  console.log('  5 users (fast):', JSON.stringify({ answered: r.answered, of: r.total, notAnsweredByModel: r.failures.length, rejected429: r.stats.rate429, p95ms: r.p95 }));
  // The endpoint turns each "no model available" into an offline-mode reply, so nobody sees an error.
  assert.ok(r.stats.rate429 <= 2, `provider rejections: ${r.stats.rate429}`);
  assert.ok(r.answered / r.total >= 0.4, `only ${r.answered}/${r.total} answered by a model`);
});

// Groq does not count cached prompt tokens toward rate limits. The prompt is built with a static,
// identical first ~1,300 tokens so that, with traffic, most of every request is served from cache.
test('with prompt caching working (1,300 of 2,000 prompt tokens cached): 5 fast chatters, everyone answered, zero rejections', async () => {
  const r = await simulate({ users: 5, messagesPerUser: 8, thinkMs: [300, 700], seed: 3, cached: 1300 });
  console.log('  5 users (cached):', JSON.stringify({ answered: r.answered, of: r.total, rejected429: r.stats.rate429, p95ms: r.p95 }));
  assert.equal(r.failures.length, 0, r.failures.join(' | '));
  assert.equal(r.stats.rate429, 0);
});

test('with prompt caching, 3 people in a worst-case burst are all answered', async () => {
  const r = await simulate({ users: 3, messagesPerUser: 4, thinkMs: [150, 400], seed: 7, cached: 1300 });
  assert.equal(r.failures.length, 0, r.failures.join(' | '));
  assert.equal(r.stats.rate429, 0);
});
