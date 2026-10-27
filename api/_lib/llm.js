// api/_lib/llm.js
// One OpenAI-compatible client for every provider (Groq by default, more via config), with:
//   - a hard deadline for the whole request and a timeout per attempt (no silent SDK retries)
//   - routing by remaining budget (x-ratelimit headers, 429 cooldowns) and a preferred small model
//   - no sleeping on daily limits; at most one short wait on a per-minute limit
//   - real `usage` returned for accounting
//
// Config (env):
//   GROQ_API_KEY, GROQ_BASE_URL (default https://api.groq.com/openai/v1; tests point it at a fake server)
//   GROQ_MODEL, GROQ_FALLBACK_MODELS (comma list), GROQ_SMALL_MODEL (preferred for simple turns)
//   LLM_EXTRA_PROVIDERS  JSON list appended to the chain, keys read from the named env var, e.g.
//     [{"name":"cerebras","baseURL":"https://api.cerebras.ai/v1","apiKeyEnv":"CEREBRAS_API_KEY","models":["gpt-oss-120b"]}]
//   LLM_ATTEMPT_TIMEOUT_MS (default 9000)

import { classifyGroqError, extractErrorDetails } from './groq-errors.js';
import { ModelBudget, orderModels } from './quota.js';
import { normalizeUsage } from './usage.js';

export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b';
const DEFAULT_FALLBACKS = 'openai/gpt-oss-20b,qwen/qwen3.8-27b';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One budget tracker per instance, shared by all requests on it.
export const budget = new ModelBudget();

function groqBaseURL(raw) {
  const v = String(raw || '').trim().replace(/\/+$/, '');
  if (!v) return 'https://api.groq.com/openai/v1';
  // groq-sdk style values ("https://api.groq.com") get the OpenAI-compatible path.
  return /\/v\d+$/.test(v) ? v : `${v}/openai/v1`;
}

/**
 * Builds the provider list and the ordered model chain from env.
 * Each chain entry: { id, provider, model }. id is the model name for Groq, "provider:model" otherwise.
 */
export function loadChain(env = process.env) {
  const providers = new Map();
  const groqKey = String(env.GROQ_API_KEY || '').trim();
  if (groqKey) providers.set('groq', { name: 'groq', baseURL: groqBaseURL(env.GROQ_BASE_URL), apiKey: groqKey });
  const primary = String(env.GROQ_MODEL || '').trim() || DEFAULT_GROQ_MODEL;
  const fallbacks = String(env.GROQ_FALLBACK_MODELS ?? DEFAULT_FALLBACKS).split(',').map((m) => m.trim()).filter(Boolean);
  const chain = [];
  if (providers.has('groq')) for (const m of [primary, ...fallbacks]) if (!chain.some((c) => c.id === m)) chain.push({ id: m, provider: 'groq', model: m });

  let extra = [];
  try {
    extra = env.LLM_EXTRA_PROVIDERS ? JSON.parse(env.LLM_EXTRA_PROVIDERS) : [];
  } catch {
    console.warn('[llm] LLM_EXTRA_PROVIDERS is not valid JSON, ignored');
  }
  for (const p of Array.isArray(extra) ? extra : []) {
    const key = String(env[p?.apiKeyEnv] || '').trim();
    if (!p?.name || !p?.baseURL || !key || !Array.isArray(p.models)) continue;
    providers.set(p.name, { name: p.name, baseURL: String(p.baseURL).replace(/\/+$/, ''), apiKey: key });
    for (const m of p.models) chain.push({ id: `${p.name}:${m}`, provider: p.name, model: m });
  }
  const small = String(env.GROQ_SMALL_MODEL ?? 'openai/gpt-oss-20b').trim();
  return { providers, chain, small: chain.some((c) => c.id === small) ? small : null };
}

const isReasoning = (model) => /gpt-oss|qwen3|deepseek-r1|qwq/i.test(model);

/** Per-model request parameters: keep reasoning short and the reply cap tight (replies are 1-3 sentences). */
export function modelParams(entry, { maxTokens } = {}) {
  const m = entry.model;
  const p = {};
  if (/gpt-oss/i.test(m)) {
    p.reasoning_effort = 'low';
    if (entry.provider === 'groq') p.include_reasoning = false;
  } else if (/qwen3/i.test(m) && entry.provider === 'groq') {
    p.reasoning_effort = 'none';
  }
  // Reasoning tokens count against the completion cap, so reasoning models get more room.
  p.max_tokens = maxTokens || (isReasoning(m) ? 320 : 220);
  return p;
}

// Keep only complete sentences of a reply that hit the token cap.
export function trimToSentences(text) {
  const t = String(text || '').trim();
  const m = t.match(/^[\s\S]*[.?!؟。？！](?=\s|$)/u);
  return m ? m[0].trim() : '';
}

function headersToObject(h) {
  const out = {};
  if (h && typeof h.forEach === 'function') h.forEach((v, k) => { out[k.toLowerCase()] = v; });
  return out;
}

async function callOnce({ provider, entry, body, timeoutMs, fetchImpl }) {
  const res = await fetchImpl(`${provider.baseURL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({ model: entry.model, ...body }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const headers = headersToObject(res.headers);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const apiError = json?.error || null;
    const err = new Error(`${res.status} ${apiError?.message || text.slice(0, 300) || res.statusText}`);
    err.status = res.status;
    err.headers = headers;
    err.error = apiError ? { ...apiError, error: apiError } : undefined;
    err.code = apiError?.code || apiError?.type || null;
    throw err;
  }
  return { json, headers };
}

export class AllModelsFailed extends Error {
  constructor(reason, attempts) {
    super(`No model could answer (${reason})`);
    this.reason = reason; // 'rate' | 'deadline' | 'auth' | 'error' | 'no_models'
    this.attempts = attempts;
    this.status = 503;
  }
}

/**
 * Runs one chat completion through the chain.
 * Returns { text, toolCalls, model, usage, finishReason, attempts }.
 */
export async function complete({
  messages,
  tools = null,
  deadlineAt = Date.now() + 15000,
  prefer = [],
  estTokens = 0,
  chainConfig = loadChain(),
  fetchImpl = globalThis.fetch,
  budgetTracker = budget,
  onStage = () => {},
  attemptTimeoutMs = Number(process.env.LLM_ATTEMPT_TIMEOUT_MS) || 9000,
  temperature = 0.3,
} = {}) {
  const { providers, chain } = chainConfig;
  const attempts = [];
  if (!chain.length) throw new AllModelsFailed('no_models', attempts);

  const ids = chain.map((c) => c.id);
  const { order, skipped } = orderModels(ids, budgetTracker, { estTokens, prefer });
  for (const s of skipped) attempts.push({ model: s.model, outcome: 'skipped', scope: s.scope, retryInMs: s.retryInMs });
  if (!order.length) throw new AllModelsFailed('rate', attempts);

  const deadProviders = new Set();
  let sawRate = skipped.length > 0;
  let sawDeadline = false;
  let lastErrorKind = null;
  for (const id of order) {
    const entry = chain.find((c) => c.id === id);
    const provider = providers.get(entry.provider);
    if (!provider || deadProviders.has(entry.provider)) continue;
    let useTools = Boolean(tools);
    let maxTokens = null;
    let waitedOnce = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const remaining = deadlineAt - Date.now();
      if (remaining < 1500) {
        sawDeadline = true;
        break;
      }
      const timeoutMs = Math.min(attemptTimeoutMs, remaining - 300);
      const body = { messages, temperature, ...modelParams(entry, { maxTokens }), ...(useTools ? { tools, tool_choice: 'auto' } : {}) };
      const startedAt = Date.now();
      onStage('llm_attempt_started', { model: id, attempt, useTools, timeoutMs });
      try {
        const { json, headers } = await callOnce({ provider, entry, body, timeoutMs, fetchImpl });
        budgetTracker.recordHeaders(id, headers);
        const choice = json?.choices?.[0] || {};
        const msg = choice.message || {};
        let text = typeof msg.content === 'string' ? msg.content : '';
        const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
        const finishReason = choice.finish_reason || null;
        const usage = normalizeUsage(json?.usage);
        budgetTracker.recordUsage(id, usage.billable || usage.total);
        if (finishReason === 'length') text = trimToSentences(text);
        const ms = Date.now() - startedAt;
        if (!text.trim() && !toolCalls.length) {
          attempts.push({ model: id, outcome: finishReason === 'length' ? 'truncated' : 'empty', ms, usage });
          // Reasoning used the whole cap: one retry with more room, if time allows.
          if (finishReason === 'length' && !maxTokens && deadlineAt - Date.now() > 4000) {
            maxTokens = 600;
            continue;
          }
          break;
        }
        attempts.push({ model: id, outcome: 'ok', ms, usage, finishReason });
        return { text, toolCalls, model: id, usage, finishReason, attempts };
      } catch (err) {
        const ms = Date.now() - startedAt;
        const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
        const kind = timedOut ? 'timeout' : classifyGroqError(err);
        lastErrorKind = kind;
        const entryLog = { model: id, outcome: kind, ms, status: err?.status || null, message: extractErrorDetails(err).message.slice(0, 200) };
        attempts.push(entryLog);
        onStage('llm_attempt_failed', entryLog);
        if (kind === 'tool' && useTools) {
          useTools = false;
          continue;
        }
        if (kind === 'rate') {
          sawRate = true;
          const info = budgetTracker.recordRateLimit(id, err);
          entryLog.scope = info.scope;
          entryLog.waitMs = info.waitMs;
          // Only a short per-minute wait is worth it, once, and only inside the deadline.
          if (!waitedOnce && info.scope === 'tpm' && info.waitMs <= 1500 && deadlineAt - Date.now() > info.waitMs + 3000) {
            waitedOnce = true;
            await sleep(info.waitMs);
            continue;
          }
          break;
        }
        if (err?.status === 401 || err?.status === 403) {
          deadProviders.add(entry.provider);
          break;
        }
        break; // server, timeout, model, other: next model
      }
    }
  }
  const reason = sawDeadline ? 'deadline' : sawRate && (lastErrorKind === 'rate' || lastErrorKind === null) ? 'rate' : deadProviders.size ? 'auth' : 'error';
  throw new AllModelsFailed(reason, attempts);
}
