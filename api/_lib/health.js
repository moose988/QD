// api/_lib/health.js
// Token-free health checks for the chatbot and its dependencies. Each check takes its dependencies
// as arguments (fetch, db, clock) so it can be tested without network access.

// Every knowledge/*.md file must be uploaded to Firestore (npm run build:kb) or the chatbot
// silently answers without it.
export const KB_EXPECTED_SOURCES = [
  'company.md',
  'services.md',
  'services-detailed.md',
  'nfc.md',
  'events.md',
  'faq.md',
  'process.md',
  'sales-playbook.md',
];

export const DEFAULT_FALLBACK_MODELS = ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];

export function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function getConfiguredModels(env = process.env) {
  const primary = String(env.GROQ_MODEL || 'llama-3.3-70b-versatile').trim();
  const fallbacks = String(env.GROQ_FALLBACK_MODELS || DEFAULT_FALLBACK_MODELS.join(','))
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
    .filter((m) => m !== primary);
  return { primary, fallbacks };
}

export function checkEnv(env = process.env) {
  const has = (name) => Boolean(String(env[name] || '').trim());
  const firebase = (has('FIREBASE_PROJECT_ID') && has('FIREBASE_CLIENT_EMAIL') && has('FIREBASE_PRIVATE_KEY')) || has('FIREBASE_SERVICE_ACCOUNT');
  const issues = [];
  if (!has('GROQ_API_KEY')) issues.push('GROQ_API_KEY is not set: the chatbot cannot answer.');
  if (!firebase) issues.push('Firebase credentials are not set: knowledge search, leads and conversation logs will fail.');
  return { ok: issues.length === 0, groqKey: has('GROQ_API_KEY'), firebase, zoho: has('ZOHO_SMTP_USER') && has('ZOHO_SMTP_PASS'), cronSecret: has('CRON_SECRET'), issues };
}

// Lists the models the Groq key can use (a free call, no tokens) and checks the configured ones exist.
export async function checkGroq({ apiKey, primary, fallbacks, fetchImpl = fetch, timeoutMs = 6000 }) {
  if (!apiKey) return { ok: false, issues: ['Groq check skipped: no API key.'] };
  try {
    const res = await withTimeout(fetchImpl('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${apiKey}` } }), timeoutMs, 'Groq models');
    if (!res.ok) return { ok: false, status: res.status, issues: [`Groq returned HTTP ${res.status} for the model list (key invalid or service down).`] };
    const body = await res.json();
    const available = new Set((body?.data || []).map((m) => m.id));
    const state = (id) => ({ id, available: available.has(id) });
    const primaryState = state(primary);
    const fallbackStates = fallbacks.map(state);
    const issues = [];
    if (!primaryState.available) issues.push(`Primary model "${primary}" is not available on this Groq account. Update GROQ_MODEL.`);
    if (fallbackStates.length && !fallbackStates.some((f) => f.available)) issues.push('No fallback model is available, so a rate limit on the primary would leave the chatbot without an answer.');
    return { ok: issues.length === 0, primary: primaryState, fallbacks: fallbackStates, modelCount: available.size, issues };
  } catch (err) {
    return { ok: false, issues: [`Groq check failed: ${err.message}`] };
  }
}

// Confirms Firestore answers and that every expected knowledge file is uploaded.
export async function checkKnowledgeBase({ db, expected = KB_EXPECTED_SOURCES, timeoutMs = 8000 }) {
  try {
    const col = db.collection('kb_chunks');
    const countSnap = await withTimeout(col.count().get(), timeoutMs, 'kb_chunks count');
    const total = countSnap.data().count;
    const present = await Promise.all(expected.map(async (source) => {
      const snap = await withTimeout(col.where('source', '==', source).limit(1).get(), timeoutMs, `kb source ${source}`);
      return [source, !snap.empty];
    }));
    const missing = present.filter(([, ok]) => !ok).map(([source]) => source);
    const issues = [];
    if (total === 0) issues.push('Knowledge base is empty: run npm run build:kb.');
    else if (missing.length) issues.push(`Knowledge base is missing: ${missing.join(', ')}. Run npm run build:kb.`);
    return { ok: issues.length === 0, firestore: true, totalChunks: total, missingSources: missing, issues };
  } catch (err) {
    return { ok: false, firestore: false, issues: [`Firestore check failed: ${err.message}`] };
  }
}

// Counts only: no conversation text or personal data is read.
export async function checkActivity({ db, now = new Date(), timeoutMs = 8000 }) {
  try {
    const since = new Date(now.getTime() - 24 * 3600 * 1000);
    const [convs, leads] = await Promise.all([
      withTimeout(db.collection('chatConversations').where('lastUpdatedAt', '>=', since).count().get(), timeoutMs, 'conversation count'),
      withTimeout(db.collection('chatLeads').where('createdAt', '>=', since).count().get(), timeoutMs, 'lead count'),
    ]);
    return { ok: true, conversationsLast24h: convs.data().count, leadsLast24h: leads.data().count, issues: [] };
  } catch (err) {
    return { ok: false, issues: [`Activity check failed: ${err.message}`] };
  }
}

// ok = nothing wrong; degraded = answers may be worse but the chatbot still runs; down = it cannot answer.
export function summarize(report) {
  const issues = Object.values(report).flatMap((section) => section?.issues || []);
  const cannotAnswer = report.env?.groqKey === false
    || (report.groq && report.groq.primary && !report.groq.primary.available && !(report.groq.fallbacks || []).some((f) => f.available));
  const status = cannotAnswer ? 'down' : issues.length ? 'degraded' : 'ok';
  return { status, issues };
}

export function formatAlert({ status, issues, checkedAt }) {
  return [
    `QD chatbot health check: ${status.toUpperCase()} (${checkedAt})`,
    '',
    ...issues.map((issue) => `- ${issue}`),
    '',
    'Details: sign in to the admin and open /api/health, or run the check from the terminal.',
  ].join('\n');
}

// Warns when any model has used 80% or more of its daily token allowance (per-model data from usage.js).
export function usageIssues(today, dailyLimit = 200000) {
  const issues = [];
  for (const [model, m] of Object.entries(today?.models || {})) {
    const fraction = (Number(m.billable) || 0) / dailyLimit;
    if (fraction >= 0.8) issues.push(`${model} has used ${Math.round(fraction * 100)}% of its daily token budget; replies will move to backup models or offline mode soon.`);
  }
  // Caching is what lets the free tier serve several people at once; zero cached tokens after many calls means the prefix is not caching.
  for (const [model, m] of Object.entries(today?.models || {})) {
    if ((Number(m.calls) || 0) >= 20 && !Number(m.cached)) issues.push(`${model}: no cached prompt tokens after ${m.calls} calls, so capacity is about 3x lower than designed (check that the static prompt prefix is unchanged between requests).`);
  }
  return issues;
}
