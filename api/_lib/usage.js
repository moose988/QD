// api/_lib/usage.js
// Token usage accounting for the chatbot. Each model call reports the provider's real `usage`
// (prompt, completion, cached, reasoning tokens); chat.js records one entry per request here, logs a
// structured `[chat-usage]` line, and adds the numbers to Firestore chatUsage/{YYYY-MM-DD} so the owner
// can see real tokens per day across all instances.
//
// Pure exports for reporting (e.g. api/health.js):
//   summarizeUsage(entries, { now, limits })  -> per-day / per-model totals and capacity estimates
//   summarizeDailyDoc(doc, { limits })        -> the same view from a chatUsage/{day} Firestore doc

const DAY_MS = 86400000;

export function dayKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Normalizes an OpenAI-compatible `usage` object (Groq adds prompt_tokens_details / completion_tokens_details). */
export function normalizeUsage(usage) {
  const u = usage || {};
  const prompt = Number(u.prompt_tokens) || 0;
  const completion = Number(u.completion_tokens) || 0;
  const cached = Number(u.prompt_tokens_details?.cached_tokens ?? u.cached_tokens) || 0;
  const reasoning = Number(u.completion_tokens_details?.reasoning_tokens ?? u.reasoning_tokens) || 0;
  const total = Number(u.total_tokens) || prompt + completion;
  // Groq: cached input tokens do not count toward rate limits.
  return { prompt, completion, cached, reasoning, total, billable: Math.max(0, total - cached) };
}

/**
 * entries: [{ at, model, prompt, completion, cached, reasoning, total, billable, path }]
 * path: 'llm' | 'quick' | 'cache' | 'degraded' | 'blocked'
 * Pure: depends only on its arguments.
 */
export function summarizeUsage(entries = [], { now = Date.now(), limits = { tpd: 200000, tpm: 8000 } } = {}) {
  const today = dayKey(now);
  const byModel = {};
  const byPath = {};
  let requests = 0;
  let billable = 0;
  let total = 0;
  let cached = 0;
  let lastMinute = 0;
  for (const e of entries) {
    if (!e || dayKey(e.at) !== today) continue;
    requests += 1;
    byPath[e.path || 'llm'] = (byPath[e.path || 'llm'] || 0) + 1;
    if (!e.model) continue;
    const m = (byModel[e.model] ||= { calls: 0, prompt: 0, completion: 0, cached: 0, reasoning: 0, total: 0, billable: 0 });
    m.calls += 1;
    for (const k of ['prompt', 'completion', 'cached', 'reasoning', 'total', 'billable']) m[k] += Number(e[k]) || 0;
    billable += Number(e.billable) || 0;
    total += Number(e.total) || 0;
    cached += Number(e.cached) || 0;
    if (now - e.at < 60000) lastMinute += Number(e.billable) || 0;
  }
  const llmCalls = Object.values(byModel).reduce((n, m) => n + m.calls, 0);
  const perCall = llmCalls ? billable / llmCalls : 0;
  const models = Object.keys(byModel);
  const dailyCapacityPerModel = perCall ? Math.floor(limits.tpd / perCall) : null;
  return {
    day: today,
    requests,
    byPath,
    llmCalls,
    tokens: { total, billable, cached },
    avgBillablePerLlmCall: Math.round(perCall),
    lastMinuteBillable: lastMinute,
    byModel,
    capacity: {
      perModelPerDay: dailyCapacityPerModel,
      perModelPerMinute: perCall ? Math.floor(limits.tpm / perCall) : null,
      remainingTodayByModel: Object.fromEntries(models.map((m) => [m, Math.max(0, limits.tpd - byModel[m].billable)])),
    },
  };
}

/** Same view from a Firestore chatUsage/{day} document written by incrementDailyUsage. */
export function summarizeDailyDoc(doc = {}, { limits = { tpd: 200000 } } = {}) {
  const models = doc.models || {};
  const out = {};
  for (const [key, m] of Object.entries(models)) {
    const billable = Number(m.billable) || 0;
    out[key] = { calls: Number(m.calls) || 0, billable, cached: Number(m.cached) || 0, remaining: Math.max(0, limits.tpd - billable), avgPerCall: m.calls ? Math.round(billable / m.calls) : 0 };
  }
  return { day: doc.day || null, requests: Number(doc.requests) || 0, paths: doc.paths || {}, models: out };
}

// ─── In-memory ledger for this instance ──────────────────────────────────────
const _entries = [];

export function recordUsage(entry) {
  const e = { at: Date.now(), ...entry };
  _entries.push(e);
  const cutoff = Date.now() - 2 * DAY_MS;
  while (_entries.length && (_entries[0].at < cutoff || _entries.length > 20000)) _entries.shift();
  return e;
}

export function usageSnapshot(opts) {
  return summarizeUsage(_entries, opts);
}

// Firestore keys cannot contain '/' or '.', model ids do ("openai/gpt-oss-120b").
export function modelKey(model) {
  return String(model || 'none').replace(/[/.]/g, '_');
}

/**
 * Adds one request to chatUsage/{day} inside an existing Firestore batch (no extra round trip).
 * `FieldValue` is admin.firestore.FieldValue.
 */
export function incrementDailyUsage(batch, db, FieldValue, entry) {
  const ref = db.collection('chatUsage').doc(dayKey(entry.at || Date.now()));
  const inc = (n) => FieldValue.increment(Number(n) || 0);
  const data = { day: dayKey(entry.at || Date.now()), requests: inc(1), paths: { [entry.path || 'llm']: inc(1) }, updatedAt: FieldValue.serverTimestamp() };
  if (entry.model) {
    data.models = {
      [modelKey(entry.model)]: { calls: inc(1), prompt: inc(entry.prompt), completion: inc(entry.completion), cached: inc(entry.cached), billable: inc(entry.billable) },
    };
  }
  batch.set(ref, data, { merge: true });
}
