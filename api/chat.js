// api/chat.js
// QD Systems chatbot endpoint — Vercel Node serverless function.
//
// Pipeline (every step before the model call costs zero tokens):
//   1. Origin allowlist, per-IP / per-session rate limits, validation, language detection
//   2. Zero-token paths: bare greeting / thanks / emoji, cached generic first-turn answers
//   3. Compress the visitor message to an intent note, compact the history to 2 turns + a facts line
//   4. Server-owned hand-off decision (no tool call); the lead is saved in parallel with the model call
//   5. Retrieve top-K KB chunks (bundled snapshot; semantic when the embedder is ready, BM25 otherwise)
//   6. Build the prompt (static cacheable prefix first) and call the model chain under one deadline,
//      routed by remaining budget; if every model is limited or failing, answer from the KB (degraded)
//   7. Sanitize, settle the hand-off, send the reply, log the turn and real token usage in one batch
//
// Response format: Server-Sent Events (SSE) with JSON-encoded chunks:
//   data: {"type":"text","delta":"Hi"}
//   data: {"type":"sources","items":[{...}]}
//   data: {"type":"actions","items":[{...}]}
//   data: {"type":"lead","saved":true}
//   data: {"type":"done"}

import { embedQuery, embedderState, warmup } from './_lib/embed.js';
import { retrieve, retrieveLexical } from './_lib/retrieval.js';
import { buildSystemPrompt, detectLang, LEAD_TOOL } from './_lib/prompt.js';
import { detectActions, describeActions, getAction, MEANWHILE_LINE, ACTION_INTRO } from './_lib/actions.js';
import { sanitizeReply, hasHandoffIntent, claimsHandoff, stripHandoffClaims, ASK_WHAT } from './_lib/sanitize.js';
import { extractErrorDetails } from './_lib/groq-errors.js';
import { getDb, admin } from './_lib/firebase.js';
import { compressIntent, compressTurn } from './_lib/intent.js';
import { compactHistory, estimateMessagesTokens } from './_lib/token-budget.js';
import { complete, loadChain, budget, AllModelsFailed } from './_lib/llm.js';
import { RequestLimiter, checkOrigin, clientIp } from './_lib/quota.js';
import { recordUsage, incrementDailyUsage } from './_lib/usage.js';
import { quickReply, ReplyCache, cacheKey, isCacheable } from './_lib/quick-replies.js';
import { degradedReply } from './_lib/degraded.js';
import { decideHandoff, buildLead, handoffNote, HANDOFF_LINE, visitorContact, isUsableContact } from './_lib/handoff.js';

// Start loading the embedding model in the background as soon as the module loads.
warmup();

const DEFAULT_EMBED_MODEL = 'Xenova/multilingual-e5-small';
const MAX_HISTORY = 10; // last 10 messages (5 turns) are read; 2 turns go to the model verbatim
const MAX_ASSISTANT_CHARS = 600;
const EMBED_WAIT_READY_MS = 1500;
const EMBED_WAIT_COLD_MS = 3000;
const DEADLINE_MS = Number(process.env.CHAT_DEADLINE_MS) || 20000; // vercel.json maxDuration is 30 s
const DB_WRITE_TIMEOUT_MS = 4000;
// 'off' (default): the server decides the hand-off. 'intent': legacy capture_lead tool, attached only
// on turns with price/quote/start intent.
const LEAD_TOOL_MODE = process.env.CHAT_LEAD_TOOL === 'intent' ? 'intent' : 'off';
const DEPRECATED_GROQ_MODELS = {
  'mixtral-8x7b-32768': 'llama-3.3-70b-versatile',
  'llama3-70b-8192': 'llama-3.3-70b-versatile',
  'llama3-8b-8192': 'llama-3.1-8b-instant',
  'llama-3.1-70b-versatile': 'llama-3.3-70b-versatile',
  'llama-3.1-70b-specdec': 'llama-3.3-70b-specdec',
};

const limiter = new RequestLimiter();
const replyCache = new ReplyCache();
let _testDb; // tests inject a fake Firestore; undefined = real one

export function __setTestDb(db) {
  _testDb = db;
}

function withTimeout(promise, ms, label) {
  let timeoutId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`${label} timed out after ${ms}ms`);
      error.code = 'TIMEOUT';
      reject(error);
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

// Short or pronoun-y follow-ups ("how much is it?", "and for a clinic?") carry no
// topic on their own, so retrieval also looks at the previous user message.
const FOLLOW_UP_RE = /\b(it|that|this|those|them|they|its|and for|what about|how much|how long|price|cost)\b|كم|وماذا|وهل|وبالنسبة|هذا|هذه|ذلك|这个|那个|多少钱|多久|那么|этот|это|сколько|а для|а если/i;

function buildRetrievalQuery(message, history) {
  const msg = String(message || '').trim();
  const prevUser = [...history].reverse().find((m) => m.role === 'user')?.content;
  const needsContext = msg.length < 60 || FOLLOW_UP_RE.test(msg);
  if (!prevUser || !needsContext) return msg.slice(0, 600);
  return `${String(prevUser).slice(0, 250)} ${msg}`.slice(0, 400);
}

function sanitizeVisitor(raw, pageUrl) {
  const clean = (v, max) => String(v || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
  let page = '';
  try { page = new URL(String(pageUrl || '')).pathname.slice(0, 80); } catch { /* ignore */ }
  const v = {
    name: clean(raw?.name, 60),
    email: clean(raw?.email, 80),
    phone: clean(raw?.phone, 40),
    page,
  };
  return v.name || v.email || v.phone || v.page ? v : null;
}

function normalizeContactType(rawType, contactValue = '') {
  const type = String(rawType || '').trim().toLowerCase();
  const contact = String(contactValue || '').trim().toLowerCase();

  if (type === 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return 'email';
  if (type.includes('whatsapp') || type === 'wa' || type === 'whats app') return 'whatsapp';
  if (type.includes('phone') || type.includes('call') || type.includes('mobile') || type.includes('number') || type.includes('tel')) return 'phone';
  if (/^\+?[\d\s()\-]{7,}$/.test(contact)) return 'phone';
  return 'other';
}

function normalizeLeadData(leadData, lang) {
  const normalized = {
    ...leadData,
    name: typeof leadData?.name === 'string' ? leadData.name.trim() : '',
    contact: typeof leadData?.contact === 'string' ? leadData.contact.trim() : '',
    business_type: typeof leadData?.business_type === 'string' ? leadData.business_type.trim() : '',
    project_brief: typeof leadData?.project_brief === 'string' ? leadData.project_brief.trim() : '',
    urgency: typeof leadData?.urgency === 'string' ? leadData.urgency.trim().toLowerCase() : 'unknown',
    language: ['ar', 'zh', 'ru'].includes(lang) ? lang : 'en',
  };
  normalized.contact_type = normalizeContactType(leadData?.contact_type, normalized.contact);
  if (!['urgent', 'soon', 'exploring', 'unknown'].includes(normalized.urgency)) normalized.urgency = 'unknown';
  return normalized;
}

function makeStageTracker(send, emitDebug, startedAt = Date.now()) {
  let currentStage = 'request_received';
  return {
    mark(stage, meta = {}) {
      currentStage = stage;
      const elapsedMs = Date.now() - startedAt;
      const payload = { ...meta, elapsedMs };
      console.log(`[chat] stage=${stage} elapsed=${elapsedMs}ms`, payload);
      if (emitDebug) send({ type: 'debug', stage, meta: payload, at: new Date().toISOString() });
    },
    current() {
      return currentStage;
    },
  };
}

// Replies for requests the limiter turns away (no model call).
const LIMIT_TEXT = {
  burst: {
    en: "You're sending messages faster than I can keep up. Give it a few seconds and try again.",
    ar: 'الرسائل تصلني أسرع مما أستطيع الرد. انتظر ثواني قليلة وجرّب مرة أخرى.',
    zh: '消息来得有点快，我跟不上了。请稍等几秒再试。',
    ru: 'Сообщения приходят быстрее, чем я успеваю ответить. Подождите пару секунд и попробуйте снова.',
  },
  minute: {
    en: "That's a lot of messages in a short time. Give me a minute, then ask again.",
    ar: 'رسائل كثيرة في وقت قصير. امنحني دقيقة ثم اسأل مرة أخرى.',
    zh: '短时间内消息有点多，请一分钟后再问。',
    ru: 'Слишком много сообщений за короткое время. Подождите минуту и спросите снова.',
  },
  day: {
    en: "We've covered a lot today. The team can take it from here: you can pick a time for a free call.",
    ar: 'تكلمنا كثيراً اليوم. الفريق يقدر يكمل معك: تقدر تختار وقتاً لمكالمة مجانية.',
    zh: '今天我们聊了很多。接下来可以交给团队：你可以选一个免费通话的时间。',
    ru: 'Сегодня мы многое обсудили. Дальше поможет команда: можно выбрать время для бесплатного звонка.',
  },
};

export const config = {
  // Node runtime (transformers.js + firebase-admin). vercel.json sets maxDuration 30 s; DEADLINE_MS stays inside it.
  runtime: 'nodejs',
  maxDuration: 30,
};

export default async function handler(req, res) {
  const startedAt = Date.now();
  const deadlineAt = startedAt + DEADLINE_MS;

  // ─── CORS / origin allowlist ─────────────────────────────────────────────
  const origin = checkOrigin(req);
  if (origin.ok && origin.origin) {
    res.setHeader('Access-Control-Allow-Origin', origin.origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (!origin.ok) return res.status(403).json({ error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ─── Parse + validate ─────────────────────────────────────────────────────
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const message = (body?.message || '').toString().trim();
  const history = Array.isArray(body?.history) ? body.history.slice(-40) : [];
  const rawSessionId = (body?.sessionId || '').toString().slice(0, 64);
  const sessionId = rawSessionId || `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const pageLang = ['ar', 'zh', 'ru'].includes(body?.pageLang) ? body.pageLang : 'en';

  if (!message) return res.status(400).json({ error: 'message is required' });
  if (message.length > 2000) return res.status(400).json({ error: 'message too long (max 2000 chars)' });

  const lang = detectLang(message) || pageLang;
  const visitor = sanitizeVisitor(body?.visitor, body?.pageUrl);
  const gate = limiter.check({ ip: clientIp(req), sessionId: rawSessionId });

  // ─── SSE response setup ───────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if proxied

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };
  // Internal diagnostics only go to the browser when running locally.
  const isLocalDev = /^(localhost|127\.0\.0\.1)(:|$)/.test(String(req.headers.host || ''));
  const stage = makeStageTracker(send, isLocalDev, startedAt);
  const sendText = (text) => {
    for (const piece of text.match(/[\s\S]{1,32}(?:\s|$)/g) || [text]) send({ type: 'text', delta: piece });
  };
  // Once visible text went out, later failures (DB writes, etc.) must not surface as an error bubble.
  let hasStreamedText = false;
  stage.mark('request_received', { sessionId, messageLength: message.length, historyCount: history.length, pageLang, detectedLang: lang });

  if (!gate.ok) {
    stage.mark('rate_limited', { reason: gate.reason });
    const kind = gate.reason === 'session_day' || gate.reason === 'day' ? 'day' : gate.reason;
    if (kind === 'day') send({ type: 'actions', items: [getAction('book', lang)] });
    sendText(LIMIT_TEXT[kind][lang] || LIMIT_TEXT[kind].en);
    recordUsage({ path: 'blocked' });
    send({ type: 'done' });
    return res.end();
  }

  let usageEntry = { path: 'llm' };
  try {
    const replacement = DEPRECATED_GROQ_MODELS[String(process.env.GROQ_MODEL || '').trim()];
    if (replacement) console.warn(`[chat] GROQ_MODEL is deprecated, use "${replacement}"`);

    const cleanedHistory = history
      .filter((m) => m && m.role && m.content && ['user', 'assistant'].includes(m.role))
      .slice(-MAX_HISTORY)
      .map((m) => ({
        role: m.role,
        content: String(m.content).slice(0, m.role === 'assistant' ? MAX_ASSISTANT_CHARS : 1500),
      }));
    const userTexts = [...cleanedHistory.filter((m) => m.role === 'user').map((m) => m.content), message];
    const recentUserText = userTexts.slice(-3).join(' ');
    const actions = detectActions(message, lang);
    const firstTurn = !cleanedHistory.some((m) => m.role === 'user');

    let db = null;
    try {
      db = _testDb !== undefined ? _testDb : getDb();
    } catch (dbErr) {
      stage.mark('db_init_failed', { message: dbErr?.message || 'Unknown DB init error' });
    }

    // Saves a chat lead unless one was already captured for this session. The start form
    // already writes a 'chatbot-prechat' doc, which does not count as a captured chat lead.
    const persistLead = async (leadData) => {
      if (!db) return 'no_db';
      const existingLeads = await db.collection('chatLeads').where('sessionId', '==', sessionId).limit(10).get();
      if (existingLeads.docs.some((d) => d.data()?.source !== 'chatbot-prechat')) return 'duplicate';
      await db.collection('chatLeads').add({
        ...leadData,
        sessionId,
        sourceUrl: body?.pageUrl || '',
        userAgent: req.headers['user-agent'] || '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'new',
      });
      return 'saved';
    };

    let fullText = '';
    let retrieved = [];
    let retrievalMode = 'none';
    let usedModel = null;
    let toolCallParts = {};
    let leadSaved = false;
    let leadNewlySaved = false;
    let hd = { decision: 'none' };
    let cacheKeyForTurn = null;

    // ─── Zero-token paths ─────────────────────────────────────────────────
    const quick = actions.length ? null : quickReply({ message, history: cleanedHistory, lang, seed: `${sessionId}:${cleanedHistory.length}` });
    if (quick) {
      usageEntry = { path: 'quick' };
      fullText = quick.text;
      stage.mark('quick_reply', { kind: quick.kind });
    }

    if (!fullText) {
      // ─── Hand-off decision (server-owned) ──────────────────────────────
      const alreadyHandedOff = cleanedHistory.some((m) => m.role === 'assistant' && claimsHandoff(m.content));
      const lastAssistant = [...cleanedHistory].reverse().find((m) => m.role === 'assistant')?.content || '';
      hd = LEAD_TOOL_MODE === 'off' ? decideHandoff({ userTexts, visitor, alreadyHandedOff, lastAssistant }) : { decision: 'legacy' };
      if (hd.decision === 'handoff' && actions.some((x) => x.kind === 'book')) hd = { decision: 'none', reason: 'booking card is the action' };
      stage.mark('handoff_decided', { decision: hd.decision, reason: hd.reason });
      if (hd.decision === 'already') leadSaved = true;
      const leadPromise = hd.decision === 'handoff' && db
        ? withTimeout(persistLead(normalizeLeadData(buildLead({ userTexts, visitor, lang }), lang)), DB_WRITE_TIMEOUT_MS, 'Lead save').catch((err) => {
            stage.mark('lead_save_failed', { message: err?.message || 'lead save failed' });
            return 'failed';
          })
        : null;

      // ─── Cached generic first-turn answer ──────────────────────────────
      cacheKeyForTurn = firstTurn && hd.decision === 'none' && !actions.length ? cacheKey(message, lang) : null;
      const cached = replyCache.get(cacheKeyForTurn);
      if (cached) {
        usageEntry = { path: 'cache' };
        fullText = cached;
        stage.mark('cache_hit');
      }

      // ─── Compress the visitor message and the history ──────────────────
      const intent = compressIntent(message);
      const compact = compactHistory(cleanedHistory, { keepTurns: 2, assistantChars: 300, userTextsForFacts: userTexts, compressUser: compressTurn });

      if (!fullText) {
        // ─── Retrieval ─────────────────────────────────────────────────────
        const chainConfig = loadChain();
        const lean = budget.dayPressure(chainConfig.chain.map((c) => c.id)) > 0.8;
        const buttonOnly = actions.length > 0 && message.length < 120;
        const topK = lean || buttonOnly ? 2 : 4;
        const retrievalQuery = buildRetrievalQuery(message, cleanedHistory);
        const embedWait = Math.min(embedderState() === 'ready' ? EMBED_WAIT_READY_MS : EMBED_WAIT_COLD_MS, Math.max(0, deadlineAt - Date.now() - 8000));
        try {
          stage.mark('embedding_started', { state: embedderState(), timeoutMs: embedWait });
          const queryEmbedding = await withTimeout(embedQuery(retrievalQuery), embedWait, 'Embedding');
          retrieved = await retrieve(queryEmbedding, { topK, lang });
          // Adaptive top-K: drop chunks clearly weaker than the best match (keep at least two).
          const best = retrieved[0]?.score ?? 0;
          retrieved = retrieved.filter((c, i) => i < 2 || c.score >= best - 0.06);
          retrievalMode = 'semantic';
        } catch (embedErr) {
          stage.mark('embedding_skipped', { message: extractErrorDetails(embedErr).message });
          retrieved = await retrieveLexical(retrievalQuery, { topK, lang });
          retrievalMode = 'lexical';
        }
        stage.mark('retrieval_completed', { retrievedCount: retrieved.length, mode: retrievalMode });
        send({
          type: 'sources',
          items: retrieved.map((c) => ({ id: c.id, source: c.source, heading: c.heading, lang: c.lang, score: Math.round(c.score * 1000) / 1000, mode: retrievalMode })),
        });

        // ─── Prompt ────────────────────────────────────────────────────────
        const legacy = LEAD_TOOL_MODE === 'intent';
        const systemPrompt = buildSystemPrompt({
          lang,
          contextChunks: retrieved,
          visitor,
          recentUserText,
          actionsNote: describeActions(actions),
          useTool: legacy,
          factsLine: compact.factsLine,
          handoffNote: handoffNote(hd.decision),
          chunkChars: lean ? [420, 300] : null,
        });
        const messages = [{ role: 'system', content: systemPrompt }, ...compact.messages, { role: 'user', content: legacy ? message : intent.text }];
        const tools = legacy && hasHandoffIntent(recentUserText) ? [LEAD_TOOL] : null;
        const estTokens = estimateMessagesTokens(messages, tools);
        const simple = message.length < 80 && hd.decision === 'none' && cleanedHistory.length <= 4;
        stage.mark('prompt_built', { promptChars: systemPrompt.length, estTokens, compressed: intent.compressed, historyKept: compact.messages.length, lean, simple });

        // ─── Model call (or degraded answer) ───────────────────────────────
        try {
          const result = await complete({
            messages,
            tools,
            deadlineAt,
            estTokens,
            chainConfig,
            prefer: simple && chainConfig.small ? [chainConfig.small] : [],
            onStage: (name, meta) => stage.mark(name, meta),
          });
          fullText = result.text;
          usedModel = result.model;
          result.toolCalls.forEach((tc, i) => {
            toolCallParts[i] = { id: tc.id || '', name: tc.function?.name || '', args: tc.function?.arguments || '' };
          });
          usageEntry = { path: 'llm', model: result.model, ...result.usage };
          stage.mark('llm_completed', { model: result.model, usage: result.usage, attempts: result.attempts.length });
        } catch (err) {
          if (!(err instanceof AllModelsFailed)) throw err;
          const asks = (re) => re.test(message);
          const d = degradedReply({
            message: `${retrievalQuery} ${message}`,
            lang,
            chunks: retrieved,
            asksTime: asks(/how long|timeline|how fast|when|deliver|مدة|متى|كم يستغرق|多久|сроки|сколько времени/i),
            asksContact: asks(/contact|reach|whatsapp|phone|call|number|تواصل|رقم|联系|связаться|телефон/i),
            asksPrice: false,
          });
          fullText = d.text;
          if (hd.decision === 'ask_what') fullText = `${fullText} ${ASK_WHAT[lang] || ASK_WHAT.en}`;
          usageEntry = { path: 'degraded', reason: err.reason };
          stage.mark('degraded_reply', { reason: err.reason, matched: d.matched, attempts: err.attempts });
        }
      }

      // ─── Settle the server-owned hand-off ──────────────────────────────
      if (leadPromise) {
        const outcome = await leadPromise;
        leadSaved = outcome === 'saved' || outcome === 'duplicate';
        leadNewlySaved = outcome === 'saved';
        stage.mark('lead_settled', { outcome });
        if (leadNewlySaved) send({ type: 'lead', saved: true });
      }
    }

    if (actions.length) send({ type: 'actions', items: actions });

    const asksHowToReach = /contact|reach|whatsapp|phone|call|number|talk to|speak|تواصل|اتصل|واتساب|رقم|联系|电话|связаться|телефон|позвон/i.test(message);
    const asksTimeline = /how long|how fast|timeline|time frame|when (?:can|will)|deliver|ready by|tomorrow|tommorw|asap|urgent|days|hours|weeks|مدة|كم يستغرق|كم تستغرق|كم تأخذ|متى|多久|多长时间|什么时候|сколько времени|сроки|когда/i.test(userTexts.slice(-2).join(' '));
    fullText = sanitizeReply(fullText, { lang, allowedDigits: [visitor?.phone], allowPhone: asksHowToReach, allowTimeline: asksTimeline });
    // A button reply in the wrong language (e.g. English to an Arabic visitor) is replaced by a fixed local line.
    const SCRIPTS = { ar: /[؀-ۿ]/, zh: /[一-鿿]/, ru: /[Ѐ-ӿ]/ };
    if (fullText && SCRIPTS[lang] && !SCRIPTS[lang].test(fullText) && actions.length) {
      fullText = ACTION_INTRO[actions[0].kind]?.[lang] || fullText;
    }

    // ─── Legacy tool path (CHAT_LEAD_TOOL=intent) ─────────────────────────
    if (hd.decision === 'legacy') {
      for (const tc of Object.values(toolCallParts)) {
        if (tc.name !== 'capture_lead' || !tc.args) continue;
        try {
          const leadData = normalizeLeadData(JSON.parse(tc.args), lang);
          if (!isUsableContact(leadData.contact) && visitor) {
            const known = visitorContact(visitor);
            if (known) {
              leadData.contact = known;
              leadData.contact_type = normalizeContactType('', known);
            }
          }
          if (!leadData.name && visitor?.name) leadData.name = visitor.name;
          if (!leadData.business_type && (leadData.project_brief || '').length < 25) continue;
          if (!hasHandoffIntent(recentUserText) || !isUsableContact(leadData.contact) || !db) continue;
          const outcome = await withTimeout(persistLead(leadData), DB_WRITE_TIMEOUT_MS, 'Lead save');
          leadSaved = true;
          leadNewlySaved = outcome === 'saved';
          if (leadNewlySaved) send({ type: 'lead', saved: true });
        } catch (err) {
          stage.mark('lead_save_failed', { message: err?.message || 'Unknown lead save error' });
        }
      }
      if (!fullText.trim() && leadSaved) fullText = HANDOFF_LINE[lang] || HANDOFF_LINE.en;
      if (!fullText.trim()) fullText = ASK_WHAT[lang] || ASK_WHAT.en;
    }

    // Server decided to hand off and the lead is saved: make sure the reply says so.
    if (hd.decision === 'handoff' && leadSaved && fullText && !claimsHandoff(fullText)) {
      fullText = `${fullText} ${HANDOFF_LINE[lang] || HANDOFF_LINE.en}`;
    }
    // Never promise a hand-off that did not happen.
    if (fullText && !leadSaved && claimsHandoff(fullText)) {
      fullText = stripHandoffClaims(fullText, lang);
      stage.mark('handoff_claim_removed');
    }

    // After a hand-off to the team, point the visitor at our work while they wait.
    if (leadNewlySaved && fullText.trim()) {
      fullText += ` ${MEANWHILE_LINE[lang] || MEANWHILE_LINE.en}`;
      send({ type: 'actions', items: [{ ...getAction('demos', lang), auto: true }] });
    }

    if (usageEntry.path === 'llm' && cacheKeyForTurn && isCacheable({ history: cleanedHistory, decision: hd.decision, actions, message, reply: fullText, visitor })) {
      replyCache.set(cacheKeyForTurn, fullText);
    }

    // Send the settled reply.
    if (fullText.trim()) {
      hasStreamedText = true;
      sendText(fullText);
    }

    // ─── Usage + conversation log (one Firestore round trip) ─────────────
    const entry = recordUsage({ ...usageEntry, lang });
    console.log('[chat-usage]', JSON.stringify({ path: entry.path, model: entry.model || null, prompt: entry.prompt || 0, completion: entry.completion || 0, cached: entry.cached || 0, reasoning: entry.reasoning || 0, billable: entry.billable || 0, ms: Date.now() - startedAt, retrieval: retrievalMode, lang }));
    try {
      if (!db) throw new Error('Firestore unavailable (db init failed)');
      const FieldValue = admin.firestore.FieldValue;
      const convoRef = db.collection('chatConversations').doc(sessionId);
      const batch = db.batch();
      batch.set(
        convoRef,
        {
          lang,
          pageUrl: body?.pageUrl || '',
          messageCount: FieldValue.increment(2),
          lastMessage: message,
          lastResponse: fullText,
          lastUpdatedAt: FieldValue.serverTimestamp(),
          // Only set hasLead when a lead actually saved (increment(0) on a boolean would throw).
          ...(leadSaved && hd.decision !== 'already' ? { hasLead: true } : {}),
        },
        { merge: true }
      );
      batch.set(convoRef.collection('messages').doc(), { role: 'user', content: message, createdAt: FieldValue.serverTimestamp() });
      batch.set(convoRef.collection('messages').doc(), {
        role: 'assistant',
        content: fullText,
        sources: retrieved.map((c) => c.id),
        leadSaved,
        path: entry.path,
        ...(usedModel ? { model: usedModel } : {}),
        createdAt: FieldValue.serverTimestamp(),
      });
      incrementDailyUsage(batch, db, FieldValue, entry);
      await withTimeout(batch.commit(), DB_WRITE_TIMEOUT_MS, 'Conversation log');
      stage.mark('conversation_log_completed');
    } catch (err) {
      stage.mark('conversation_log_failed', { message: err?.message || 'Unknown conversation log error' });
    }

    stage.mark('handler_completed', { path: entry.path });
    send({ type: 'done' });
    res.end();
  } catch (err) {
    const errorDetails = extractErrorDetails(err);
    console.error('[chat] error:', errorDetails, err);
    if (hasStreamedText) {
      stage.mark('post_stream_error_suppressed', { message: errorDetails.message, code: errorDetails.code });
      send({ type: 'done' });
      return res.end();
    }
    send({
      type: 'error',
      message: {
        ar: 'عذراً، واجهتني مشكلة من جهتي. هل تعيد المحاولة بعد لحظات؟',
        zh: '抱歉，我这边出了点小问题。能请你稍后再试一次吗？',
        ru: 'Извините, у меня небольшая заминка. Попробуете ещё раз через минуту?',
        en: "Sorry, I'm having a hiccup on my side. Could you try that again in a moment?",
      }[lang] || "Sorry, I'm having a hiccup on my side. Could you try that again in a moment?",
      ...(isLocalDev ? { details: errorDetails.message, code: errorDetails.code, statusCode: errorDetails.statusCode, stage: stage.current() } : {}),
    });
    res.end();
  }
}
