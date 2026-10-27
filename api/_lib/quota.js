// api/_lib/quota.js
// Protects the model quota. Everything is in-memory per function instance (best effort on serverless:
// Vercel fluid compute reuses an instance for concurrent and back-to-back requests, so this catches
// bursts; a cold instance starts empty and learns from its first rate-limit answer).
//
//   ModelBudget      what each model has left (x-ratelimit headers, 429 bodies, local usage ledger)
//   parseRateLimit   reads Groq's 429 text ("tokens per day (TPD) ... try again in 18m17.8s")
//   orderModels      routes to the model with budget left, skipping models in cooldown
//   RequestLimiter   per-IP / per-session sliding windows and burst detection
//   checkOrigin      origin allowlist for the browser widget

import { extractErrorDetails } from './groq-errors.js';

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const LIMITS = {
  tpm: num(process.env.GROQ_TPM_LIMIT, 8000),
  tpd: num(process.env.GROQ_TPD_LIMIT, 200000),
  rpd: num(process.env.GROQ_RPD_LIMIT, 1000),
};

// "2m59.56s", "7.66s", "517.5ms", "1h2m3s", "18m17.856s" -> milliseconds (NaN when unparseable).
export function parseDuration(value) {
  const s = String(value ?? '').trim();
  if (!s) return NaN;
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s) * 1000; // bare seconds (retry-after)
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let total = 0;
  let matched = '';
  for (const m of s.matchAll(re)) {
    const v = Number(m[1]);
    total += m[2] === 'h' ? v * 3600000 : m[2] === 'm' ? v * 60000 : m[2] === 's' ? v * 1000 : v;
    matched += m[0];
  }
  return matched && matched.length === s.replace(/\s+/g, '').length ? total : NaN;
}

function headerGet(headers, name) {
  if (!headers) return undefined;
  if (typeof headers.get === 'function') return headers.get(name) ?? undefined;
  return headers[name] ?? headers[name.toLowerCase()];
}

/**
 * Classifies a provider 429. scope: 'tpd' | 'tpm' | 'rpd' | 'rpm' | null; waitMs from the body or headers.
 * A daily limit with minutes to wait is never worth waiting for inside one chat request.
 */
export function parseRateLimit(err) {
  const { message } = extractErrorDetails(err);
  const text = String(message || '');
  const m = /on (tokens|requests) per (minute|day)\s*\((TPM|TPD|RPM|RPD)\)/i.exec(text);
  let scope = m ? m[3].toLowerCase() : null;
  const wait = /try again in\s+([\dhms.]+)/i.exec(text);
  let waitMs = wait ? parseDuration(wait[1].replace(/\.$/, '')) : NaN;
  if (!Number.isFinite(waitMs)) waitMs = parseDuration(headerGet(err?.headers, 'retry-after'));
  if (!Number.isFinite(waitMs)) waitMs = scope === 'tpd' || scope === 'rpd' ? 10 * 60000 : 2000;
  if (!scope) scope = waitMs > 120000 ? 'tpd' : 'tpm';
  const figures = /Limit\s+(\d+),\s*Used\s+(\d+),\s*Requested\s+(\d+)/i.exec(text);
  return {
    scope,
    waitMs,
    limit: figures ? Number(figures[1]) : null,
    used: figures ? Number(figures[2]) : null,
    requested: figures ? Number(figures[3]) : null,
  };
}

// ─── Per-model budget ────────────────────────────────────────────────────────
export class ModelBudget {
  constructor({ now = () => Date.now(), limits = LIMITS, minuteMs = 60000 } = {}) {
    this.now = now;
    this.limits = limits;
    this.minuteMs = minuteMs; // length of the provider's per-minute window (tests scale it down)
    this.models = new Map();
    this.inflight = new Map(); // model -> tokens reserved by requests that are still running
  }

  /**
   * Reserves a request's tokens on a model while it runs, so simultaneous visitors do not all see the
   * same 'budget left' and overshoot the per-minute cap together. Returns the release function.
   */
  reserve(model, tokens) {
    const n = Math.max(0, Number(tokens) || 0);
    this.inflight.set(model, (this.inflight.get(model) || 0) + n);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inflight.set(model, Math.max(0, (this.inflight.get(model) || 0) - n));
    };
  }

  inflightTokens(model) {
    return this.inflight.get(model) || 0;
  }

  get(model) {
    let s = this.models.get(model);
    if (!s) {
      s = { remainingTokens: null, tokensResetAt: 0, remainingRequests: null, requestsResetAt: 0, cooldownUntil: 0, cooldownScope: null, ledger: [] };
      this.models.set(model, s);
    }
    return s;
  }

  /** Reads x-ratelimit-* headers (remaining-tokens is per minute, remaining-requests per day). */
  recordHeaders(model, headers) {
    const s = this.get(model);
    const now = this.now();
    const rt = Number(headerGet(headers, 'x-ratelimit-remaining-tokens'));
    if (Number.isFinite(rt)) {
      s.remainingTokens = rt;
      const reset = parseDuration(headerGet(headers, 'x-ratelimit-reset-tokens'));
      s.tokensResetAt = now + (Number.isFinite(reset) ? reset : 60000);
    }
    const rr = Number(headerGet(headers, 'x-ratelimit-remaining-requests'));
    if (Number.isFinite(rr)) {
      s.remainingRequests = rr;
      const reset = parseDuration(headerGet(headers, 'x-ratelimit-reset-requests'));
      s.requestsResetAt = now + (Number.isFinite(reset) ? reset : 86400000);
      if (rr <= 0) this.cooldown(model, 'rpd', Number.isFinite(reset) ? reset : 600000);
    }
  }

  cooldown(model, scope, ms) {
    const s = this.get(model);
    const until = this.now() + Math.max(500, ms);
    if (until > s.cooldownUntil) {
      s.cooldownUntil = until;
      s.cooldownScope = scope;
    }
  }

  recordRateLimit(model, err) {
    const info = parseRateLimit(err);
    this.cooldown(model, info.scope, info.waitMs);
    if (info.scope === 'tpm') {
      const s = this.get(model);
      s.remainingTokens = 0;
      s.tokensResetAt = this.now() + info.waitMs;
    }
    return info;
  }

  /** Real usage from the provider response; kept for 24 h to estimate the daily budget. */
  recordUsage(model, totalTokens) {
    const s = this.get(model);
    const now = this.now();
    s.ledger.push([now, Math.max(0, Number(totalTokens) || 0)]);
    const dayAgo = now - 86400000;
    while (s.ledger.length && s.ledger[0][0] < dayAgo) s.ledger.shift();
    if (s.remainingTokens != null && now < s.tokensResetAt) s.remainingTokens = Math.max(0, s.remainingTokens - totalTokens);
  }

  usedToday(model) {
    const dayAgo = this.now() - 86400000;
    return this.get(model).ledger.reduce((n, [t, v]) => (t >= dayAgo ? n + v : n), 0);
  }

  usedLastMinute(model) {
    const minAgo = this.now() - this.minuteMs;
    return this.get(model).ledger.reduce((n, [t, v]) => (t >= minAgo ? n + v : n), 0);
  }

  /** ok | cooldown | short (not enough TPM left for this request right now) */
  status(model, estTokens = 0) {
    const s = this.get(model);
    const now = this.now();
    if (now < s.cooldownUntil) return { state: 'cooldown', scope: s.cooldownScope, retryInMs: s.cooldownUntil - now };
    const base = s.remainingTokens != null && now < s.tokensResetAt ? s.remainingTokens : this.limits.tpm - this.usedLastMinute(model);
    const minuteLeft = base - this.inflightTokens(model);
    if (estTokens && minuteLeft < estTokens) {
      // Without header data, assume the oldest usage in the last minute is what frees the room.
      const oldest = s.ledger.find(([t]) => t >= now - this.minuteMs);
      const retryInMs = s.tokensResetAt > now ? s.tokensResetAt - now : oldest ? Math.max(0, oldest[0] + this.minuteMs - now) : 1000;
      return { state: 'short', scope: 'tpm', retryInMs, minuteLeft };
    }
    return { state: 'ok', minuteLeft, dayUsed: this.usedToday(model) };
  }

  /** Share of the daily budget this instance has seen spent across the given models (0..1). */
  dayPressure(models) {
    if (!models.length) return 0;
    let used = 0;
    for (const m of models) used += this.usedToday(m);
    return used / (this.limits.tpd * models.length);
  }

  snapshot() {
    const out = {};
    const now = this.now();
    for (const [model, s] of this.models) {
      out[model] = {
        usedToday: this.usedToday(model),
        usedLastMinute: this.usedLastMinute(model),
        remainingTokensPerMinute: s.remainingTokens != null && now < s.tokensResetAt ? s.remainingTokens : null,
        remainingRequestsToday: s.remainingRequests,
        cooldown: now < s.cooldownUntil ? { scope: s.cooldownScope, retryInMs: s.cooldownUntil - now } : null,
      };
    }
    return out;
  }
}

/**
 * Orders the model chain for one request: preferred models first (the small model for simple turns),
 * models short of per-minute budget after those with room, models in cooldown dropped.
 */
export function orderModels(chain, budget, { estTokens = 0, prefer = [] } = {}) {
  const uniqChain = [...new Set([...prefer.filter((m) => chain.includes(m)), ...chain])];
  const ok = [];
  const short = [];
  const skipped = [];
  for (const m of uniqChain) {
    const st = budget.status(m, estTokens);
    if (st.state === 'ok') ok.push(m);
    else if (st.state === 'short') short.push(m);
    else skipped.push({ model: m, ...st });
  }
  return { order: [...ok, ...short], skipped };
}

// ─── Request limiter (abuse protection) ──────────────────────────────────────
export const REQUEST_LIMITS = {
  ipPerMinute: num(process.env.CHAT_IP_PER_MINUTE, 12),
  ipPerDay: num(process.env.CHAT_IP_PER_DAY, 150),
  sessionPerMinute: num(process.env.CHAT_SESSION_PER_MINUTE, 8),
  sessionPerDay: num(process.env.CHAT_SESSION_PER_DAY, 60),
  burstWindowMs: 2500,
  burstMax: 3,
};

export class RequestLimiter {
  constructor({ now = () => Date.now(), limits = REQUEST_LIMITS, maxKeys = 5000 } = {}) {
    this.now = now;
    this.limits = limits;
    this.maxKeys = maxKeys;
    this.hits = new Map();
  }

  _hits(key) {
    let h = this.hits.get(key);
    if (!h) {
      if (this.hits.size >= this.maxKeys) this._sweep(true);
      h = [];
      this.hits.set(key, h);
    }
    return h;
  }

  _sweep(force = false) {
    const dayAgo = this.now() - 86400000;
    for (const [k, h] of this.hits) {
      while (h.length && h[0] < dayAgo) h.shift();
      if (!h.length) this.hits.delete(k);
    }
    if (force && this.hits.size >= this.maxKeys) {
      // Drop the oldest half; memory stays bounded even under a flood of new keys.
      const keys = [...this.hits.keys()].slice(0, Math.ceil(this.hits.size / 2));
      for (const k of keys) this.hits.delete(k);
    }
  }

  /**
   * Records the attempt and returns { ok: true } or { ok: false, reason, retryInMs }.
   * reason: 'burst' | 'minute' | 'day' | 'session_day'
   */
  check({ ip = '', sessionId = '' } = {}) {
    const now = this.now();
    const L = this.limits;
    const count = (h, ms) => {
      let n = 0;
      for (let i = h.length - 1; i >= 0 && h[i] >= now - ms; i -= 1) n += 1;
      return n;
    };
    const ipHits = ip ? this._hits(`ip:${ip}`) : [];
    const sHits = sessionId ? this._hits(`s:${sessionId}`) : [];
    const verdict = (() => {
      if (ip && count(ipHits, L.burstWindowMs) >= L.burstMax) return { ok: false, reason: 'burst', retryInMs: L.burstWindowMs };
      if (sessionId && count(sHits, L.burstWindowMs) >= L.burstMax) return { ok: false, reason: 'burst', retryInMs: L.burstWindowMs };
      if (ip && count(ipHits, 60000) >= L.ipPerMinute) return { ok: false, reason: 'minute', retryInMs: 60000 };
      if (sessionId && count(sHits, 60000) >= L.sessionPerMinute) return { ok: false, reason: 'minute', retryInMs: 60000 };
      if (sessionId && count(sHits, 86400000) >= L.sessionPerDay) return { ok: false, reason: 'session_day', retryInMs: 86400000 };
      if (ip && count(ipHits, 86400000) >= L.ipPerDay) return { ok: false, reason: 'day', retryInMs: 86400000 };
      return { ok: true };
    })();
    // Rejected attempts still count, so hammering does not reopen the window.
    if (ip) ipHits.push(now);
    if (sessionId) sHits.push(now);
    if (Math.random() < 0.01) this._sweep();
    return verdict;
  }
}

export function clientIp(req) {
  const h = req?.headers || {};
  const fwd = String(h['x-vercel-forwarded-for'] || h['x-forwarded-for'] || h['x-real-ip'] || '').split(',')[0].trim();
  return (fwd || req?.socket?.remoteAddress || '').slice(0, 64);
}

// ─── Origin allowlist ────────────────────────────────────────────────────────
const DEFAULT_ORIGINS = ['https://qdsystems.ae', 'https://www.qdsystems.ae'];

/**
 * Decides whether a browser origin may use the chat API. Allowed: the configured list
 * (CHAT_ALLOWED_ORIGINS, comma separated, defaults to qdsystems.ae and www), localhost / 127.0.0.1 on
 * any port, and same-origin requests (Origin host equals the Host header, e.g. a preview deployment).
 * No Origin header (curl, server-side) is allowed but still rate limited: browsers always send one on POST.
 */
export function checkOrigin(req, { allowed = null } = {}) {
  const origin = String(req?.headers?.origin || '').trim();
  if (!origin) return { ok: true, origin: '' };
  const list = allowed || [
    ...DEFAULT_ORIGINS,
    ...String(process.env.CHAT_ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean),
  ];
  let url;
  try {
    url = new URL(origin);
  } catch {
    return { ok: false, origin };
  }
  if (list.includes(url.origin)) return { ok: true, origin: url.origin };
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname)) return { ok: true, origin: url.origin };
  const host = String(req?.headers?.host || '').toLowerCase();
  if (host && url.host.toLowerCase() === host) return { ok: true, origin: url.origin };
  return { ok: false, origin: url.origin };
}
