// tests/helpers/fake-groq.mjs
// A local OpenAI-compatible stand-in for Groq: zero real tokens. Point GROQ_BASE_URL at it.
// Script it per test with server.queue(...behaviours) or a default responder; every request is recorded.
//
// Behaviours:
//   { reply: 'text', usage?, headers?, finish? }        200 chat.completion
//   { status: 429, scope: 'tpd'|'tpm', wait: '1m59.664s' }  Groq-style rate-limit error + headers
//   { status: 500 } / { status: 503 }                     server error
//   { status: 400, toolError: true }                      "Failed to call a function" tool_use_failed
//   { empty: true }                                       200 with empty content
//   { delayMs: 3000, ...anyOfTheAbove }                   slow response

import http from 'node:http';

export function groqRateLimitBody(model, scope = 'tpd', wait = '18m17.856s') {
  const label = { tpd: 'tokens per day (TPD)', tpm: 'tokens per minute (TPM)', rpd: 'requests per day (RPD)', rpm: 'requests per minute (RPM)' }[scope];
  return {
    error: {
      message: `Rate limit reached for model \`${model}\` in organization \`org_test\` service tier \`on_demand\` on ${label}: Limit 200000, Used 199652, Requested 2856. Please try again in ${wait}. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing`,
      type: 'tokens',
      code: 'rate_limit_exceeded',
    },
  };
}

export async function startFakeGroq({ defaultResponder = null } = {}) {
  const requests = [];
  const queue = [];
  let responder = defaultResponder || (() => ({ reply: 'We build websites and the systems behind them. What are you working on?' }));

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let body = {};
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    } catch {
      /* ignore */
    }
    const record = { url: req.url, headers: req.headers, body, at: Date.now() };
    requests.push(record);
    const b = queue.length ? queue.shift() : responder(body, record);
    if (b?.delayMs) await new Promise((r) => setTimeout(r, b.delayMs));
    if (res.destroyed) return;
    const model = body.model || 'unknown';
    const baseHeaders = {
      'content-type': 'application/json',
      'x-ratelimit-limit-requests': '1000',
      'x-ratelimit-remaining-requests': '990',
      'x-ratelimit-reset-requests': '2m59.56s',
      'x-ratelimit-limit-tokens': '8000',
      'x-ratelimit-remaining-tokens': '7000',
      'x-ratelimit-reset-tokens': '7.66s',
      ...(b?.headers || {}),
    };
    if (b?.status === 429) {
      const scope = b.scope || 'tpd';
      const wait = b.wait || (scope === 'tpd' ? '18m17.856s' : '1.2s');
      res.writeHead(429, { ...baseHeaders, 'retry-after': String(Math.ceil(parseFloat(wait) || 1)), 'x-ratelimit-remaining-tokens': '0' });
      return res.end(JSON.stringify(groqRateLimitBody(model, scope, wait)));
    }
    if (b?.status === 400 && b.toolError) {
      res.writeHead(400, baseHeaders);
      return res.end(JSON.stringify({ error: { message: 'Failed to call a function. Please adjust your prompt.', type: 'invalid_request_error', code: 'tool_use_failed' } }));
    }
    if (b?.status && b.status !== 200) {
      res.writeHead(b.status, baseHeaders);
      return res.end(JSON.stringify({ error: { message: b.message || 'upstream error', type: 'server_error' } }));
    }
    const content = b?.empty ? '' : (b?.reply ?? '');
    const usage = b?.usage || { prompt_tokens: 900, completion_tokens: 60, total_tokens: 960, prompt_tokens_details: { cached_tokens: 0 } };
    res.writeHead(200, baseHeaders);
    res.end(
      JSON.stringify({
        id: `chatcmpl-${requests.length}`,
        object: 'chat.completion',
        model,
        choices: [{ index: 0, message: { role: 'assistant', content, ...(b?.toolCalls ? { tool_calls: b.toolCalls } : {}) }, finish_reason: b?.finish || 'stop' }],
        usage,
      })
    );
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/openai/v1`,
    requests,
    queue: (...behaviours) => queue.push(...behaviours),
    setResponder: (fn) => {
      responder = fn;
    },
    reset: () => {
      requests.length = 0;
      queue.length = 0;
    },
    close: () => new Promise((r) => server.close(r)),
  };
}
