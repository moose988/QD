// api/_lib/groq-errors.js
// Classifies model-provider failures so the chat endpoint can retry, fall back, or give up cleanly.

export function extractErrorDetails(err) {
  const details =
    err?.error?.message ||
    err?.response?.error?.message ||
    err?.message ||
    'Unknown error';

  return {
    message: details,
    code: err?.code || err?.error?.type || null,
    statusCode: err?.status || err?.statusCode || err?.response?.status || 500,
  };
}

export function classifyGroqError(err) {
  const status = err?.status || err?.statusCode || err?.response?.status || 0;
  const { message, code } = extractErrorDetails(err);
  if (code === 'tool_use_failed' || err?.error?.error?.code === 'tool_use_failed' || /tool call|tool_use_failed|parse tool/i.test(message)) return 'tool';
  if (status === 429) return 'rate';
  if (status >= 500) return 'server';
  if (status === 404 || /model/i.test(message)) return 'model';
  if (!status) return 'server'; // network-level failure
  return 'other';
}

// Groq says things like "try again in 517.5ms", "1.2s" or "1m59.664s".
export function retryAfterMs(err) {
  const header = Number(err?.headers?.['retry-after']);
  if (Number.isFinite(header) && header > 0) return header * 1000;
  const m = /try again in (?:(\d+)m)?\s*([\d.]+)\s*(ms|s)\b/i.exec(extractErrorDetails(err).message || '');
  if (m) {
    const minutes = m[1] ? Number(m[1]) * 60000 : 0;
    return minutes + Number(m[2]) * (m[3].toLowerCase() === 's' ? 1000 : 1);
  }
  return 1500;
}
