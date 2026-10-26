// api/chat.js
// QD Systems chatbot endpoint — Vercel Node serverless function.
//
// Pipeline:
//   1. Validate request, detect language
//   2. Embed user query (multilingual-e5)
//   3. Retrieve top-K relevant chunks from Firestore (cosine sim, cached)
//   4. Build bilingual system prompt with retrieved context
//   5. Stream Llama 3.3 70B response from Groq (with capture_lead tool)
//   6. If tool was called, persist lead to chatLeads collection
//   7. Append message + response to chatConversations doc
//
// Response format: Server-Sent Events (SSE) with JSON-encoded chunks:
//   data: {"type":"text","delta":"Hi"}
//   data: {"type":"sources","items":[{...}]}
//   data: {"type":"lead","saved":true}
//   data: {"type":"done"}

import Groq from 'groq-sdk';
import { embedQuery, warmup } from './_lib/embed.js';
import { retrieve, loadChunks } from './_lib/retrieval.js';
import { buildSystemPrompt, detectLang, LEAD_TOOL } from './_lib/prompt.js';
import { detectActions, describeActions, getAction, MEANWHILE_LINE, ACTION_INTRO } from './_lib/actions.js';
import { sanitizeReply, hasHandoffIntent, claimsHandoff, stripHandoffClaims } from './_lib/sanitize.js';
import { extractErrorDetails, classifyGroqError, retryAfterMs } from './_lib/groq-errors.js';
import { getDb, admin } from './_lib/firebase.js';

// Start downloading the embedding model in the background as soon as the module loads.
warmup();

const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_EMBED_MODEL = 'Xenova/multilingual-e5-small';
const MAX_HISTORY = 10; // last 10 messages (5 turns)
const MAX_ASSISTANT_CHARS = 600;
const EMBEDDING_TIMEOUT_MS = 3500;
const DEPRECATED_GROQ_MODELS = {
  'mixtral-8x7b-32768': 'llama-3.3-70b-versatile',
  'llama3-70b-8192': 'llama-3.3-70b-versatile',
  'llama3-8b-8192': 'llama-3.1-8b-instant',
  'llama-3.1-70b-versatile': 'llama-3.3-70b-versatile',
  'llama-3.1-70b-specdec': 'llama-3.3-70b-specdec',
};

function getRequiredChatConfig() {
  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  if (!groqApiKey) {
    const error = new Error(
      'GROQ_API_KEY is missing. Set it in the active environment before calling /api/chat.'
    );
    error.statusCode = 500;
    throw error;
  }

  const groqModel = process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
  const replacement = DEPRECATED_GROQ_MODELS[groqModel];
  if (replacement) {
    const error = new Error(
      `GROQ_MODEL "${groqModel}" is deprecated. Use "${replacement}" instead.`
    );
    error.statusCode = 500;
    throw error;
  }

  return { groqApiKey, groqModel };
}


const FALLBACK_MODELS = (process.env.GROQ_FALLBACK_MODELS || 'openai/gpt-oss-20b,qwen/qwen3.8-27b')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));



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
  if (!prevUser || !needsContext) return msg;
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

async function getFallbackContext(lang, limit = 6) {
  const chunks = await loadChunks();
  const matchingLang = chunks.filter((chunk) => chunk.lang === lang);
  const pool = matchingLang.length ? matchingLang : chunks;
  return pool.slice(0, limit).map((chunk, index) => ({
    ...chunk,
    score: typeof chunk.score === 'number' ? chunk.score : 0.01 - (index * 0.001),
  }));
}

function normalizeContactType(rawType, contactValue = '') {
  const type = String(rawType || '').trim().toLowerCase();
  const contact = String(contactValue || '').trim().toLowerCase();

  if (type === 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return 'email';

  if (
    type.includes('whatsapp') ||
    type === 'wa' ||
    type === 'whats app'
  ) {
    return 'whatsapp';
  }

  if (
    type.includes('phone') ||
    type.includes('call') ||
    type.includes('mobile') ||
    type.includes('number') ||
    type.includes('tel')
  ) {
    return 'phone';
  }

  if (/^\+?[\d\s()\-]{7,}$/.test(contact)) {
    return 'phone';
  }

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

  if (!['urgent', 'soon', 'exploring', 'unknown'].includes(normalized.urgency)) {
    normalized.urgency = 'unknown';
  }

  return normalized;
}

// A lead is only "real" if the visitor actually gave a reachable contact.
// The model sometimes calls capture_lead the instant it hears a business type
// (e.g. "a restaurant") with an empty contact — we must NOT save/confirm those.
function isUsableContact(contact) {
  const c = String(contact || '').trim();
  if (!c) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return true; // email
  const digits = c.replace(/\D/g, '');
  return digits.length >= 7; // phone / whatsapp
}

function makeStageTracker(send, emitDebug) {
  let currentStage = 'request_received';
  const startedAt = Date.now();

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

export const config = {
  // Use Node runtime (we need transformers.js + firebase-admin)
  runtime: 'nodejs',
  // Vercel Hobby: 10s. Pro: 60s. Stream tokens fast.
  maxDuration: 30,
};

export default async function handler(req, res) {
  // ─── CORS / preflight ────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ─── Parse + validate ─────────────────────────────────────────────────────
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }

  const message = (body?.message || '').toString().trim();
  const history = Array.isArray(body?.history) ? body.history : [];
  const sessionId = (body?.sessionId || '').toString().slice(0, 64) || `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const pageLang = ['ar', 'zh', 'ru'].includes(body?.pageLang) ? body.pageLang : 'en';

  if (!message) return res.status(400).json({ error: 'message is required' });
  if (message.length > 2000) return res.status(400).json({ error: 'message too long (max 2000 chars)' });

  const lang = detectLang(message) || pageLang;
  const visitor = sanitizeVisitor(body?.visitor, body?.pageUrl);

  // ─── SSE response setup ───────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if proxied

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };
  // Internal diagnostics only go to the browser when running locally (or explicitly requested).
  const isLocalDev = /^(localhost|127\.0\.0\.1)(:|$)/.test(String(req.headers.host || ''));
  const stage = makeStageTracker(send, isLocalDev);
  // Tracks whether we've already streamed visible text to the client. Once true,
  // any later failure (DB writes, etc.) must NOT surface as a user-facing error
  // bubble — the answer already arrived, so we close the stream cleanly instead.
  let hasStreamedText = false;
  stage.mark('request_received', {
    sessionId,
    messageLength: message.length,
    historyCount: history.length,
    pageLang,
    detectedLang: lang,
  });

  try {
    stage.mark('handler_started', { method: req.method });
    const { groqApiKey, groqModel } = getRequiredChatConfig();
    stage.mark('env_checked', {
      groqModel,
      embedModel: process.env.EMBED_MODEL || DEFAULT_EMBED_MODEL,
      hasGroqApiKey: Boolean(groqApiKey),
    });
    const cleanedHistory = history
      .filter(m => m && m.role && m.content && ['user', 'assistant'].includes(m.role))
      .slice(-MAX_HISTORY)
      .map(m => ({
        role: m.role,
        content: String(m.content).slice(0, m.role === 'assistant' ? MAX_ASSISTANT_CHARS : 1500),
      }));
    const retrievalQuery = buildRetrievalQuery(message, cleanedHistory);
    const recentUserText = [...cleanedHistory.filter(m => m.role === 'user').slice(-2).map(m => m.content), message].join(' ');

    // ─── 1. Embed query + retrieve ──────────────────────────────────────────
    let retrieved = [];
    let retrievalMode = 'semantic';
    try {
      stage.mark('embedding_started', {
        messageLength: message.length,
        lang,
        timeoutMs: EMBEDDING_TIMEOUT_MS,
      });
      const queryEmbedding = await withTimeout(embedQuery(retrievalQuery), EMBEDDING_TIMEOUT_MS, 'Embedding');
      stage.mark('embedding_completed', { dimensions: queryEmbedding?.length || 0 });
      stage.mark('retrieval_started', { mode: retrievalMode });
      retrieved = await retrieve(queryEmbedding, { topK: 4, lang });
      stage.mark('retrieval_completed', { retrievedCount: retrieved.length, mode: retrievalMode });
    } catch (embedErr) {
      retrievalMode = 'fallback';
      const details = extractErrorDetails(embedErr);
      stage.mark('embedding_failed', {
        message: details.message,
        code: details.code,
        statusCode: details.statusCode,
      });
      stage.mark('fallback_context_started', { lang });
      retrieved = await getFallbackContext(lang, 8);
      stage.mark('fallback_context_completed', { retrievedCount: retrieved.length, mode: retrievalMode });
    }

    // Tell the client what sources we used (optional, for transparency / citations)
    send({
      type: 'sources',
      items: retrieved.map(c => ({
        id: c.id,
        source: c.source,
        heading: c.heading,
        lang: c.lang,
        score: Math.round(c.score * 1000) / 1000,
        mode: retrievalMode,
      })),
    });

    // ─── 2. Build prompt ────────────────────────────────────────────────────
    stage.mark('prompt_build_started');
    const actions = detectActions(message, lang);
    const systemPrompt = buildSystemPrompt({ lang, contextChunks: retrieved, visitor, recentUserText, actionsNote: describeActions(actions) });
    stage.mark('prompt_build_completed', { promptLength: systemPrompt.length });

    const messages = [
      { role: 'system', content: systemPrompt },
      ...cleanedHistory,
      { role: 'user', content: message },
    ];

    // ─── 3. Stream Groq response ────────────────────────────────────────────
    stage.mark('groq_client_init_started');
    const groq = new Groq({ apiKey: groqApiKey });
    stage.mark('groq_client_init_completed');

    let fullText = '';
    let toolCallParts = {}; // index -> { id, name, args }
    let chunkCount = 0;
    let lastChunkAt = Date.now();
    let usedModel = groqModel;
    let useTools = true;
    let completed = false;
    let lastErr = null;
    const modelChain = [groqModel, ...FALLBACK_MODELS.filter((m) => m !== groqModel)];
    const reasoningFor = (m) => (String(m).includes('gpt-oss') ? { reasoning_effort: 'low' } : {});

    // The reply is buffered, cleaned and only then sent: replies are 1-3 sentences, so this costs
    // almost nothing, and it lets us guarantee the parts that must never slip through.
    outer: for (const model of modelChain) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          fullText = '';
          toolCallParts = {};
          stage.mark('groq_stream_create_started', { model, attempt, useTools, messageCount: messages.length });
          const stream = await groq.chat.completions.create({
            model,
            messages,
            ...(useTools ? { tools: [LEAD_TOOL], tool_choice: 'auto' } : {}),
            ...reasoningFor(model),
            temperature: 0.3,
            max_tokens: 450,
            stream: true,
          });
          stage.mark('groq_stream_create_completed', { model });

          for await (const chunk of stream) {
            chunkCount += 1;
            lastChunkAt = Date.now();
            if (chunkCount === 1) stage.mark('groq_stream_first_chunk_received');
            const delta = chunk.choices?.[0]?.delta || {};
            if (delta.content) fullText += delta.content;
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallParts[idx]) toolCallParts[idx] = { id: '', name: '', args: '' };
                if (tc.id) toolCallParts[idx].id = tc.id;
                if (tc.function?.name) toolCallParts[idx].name = tc.function.name;
                if (tc.function?.arguments) toolCallParts[idx].args += tc.function.arguments;
              }
            }
          }
          if (!fullText.trim() && !Object.values(toolCallParts).some((t) => t.name)) {
            const emptyErr = new Error('Model returned an empty completion');
            emptyErr.status = 502;
            throw emptyErr;
          }
          completed = true;
          usedModel = model;
          break outer;
        } catch (err) {
          lastErr = err;
          const kind = classifyGroqError(err);
          stage.mark('groq_attempt_failed', { model, attempt, kind, message: extractErrorDetails(err).message });
          if (kind === 'tool' && useTools) { useTools = false; continue; }
          if (kind === 'rate') {
            const wait = retryAfterMs(err);
            if (attempt === 0 && wait <= 2500) { await sleep(wait); continue; }
            continue outer;
          }
          continue outer; // server / model / other: try the next model
        }
      }
    }
    if (!completed) throw lastErr || new Error('No model could answer');

    if (actions.length) send({ type: 'actions', items: actions });

    const asksHowToReach = /contact|reach|whatsapp|phone|call|number|talk to|speak|تواصل|اتصل|واتساب|رقم|联系|电话|связаться|телефон|позвон/i.test(message);
    fullText = sanitizeReply(fullText, { lang, allowedDigits: [visitor?.phone], allowPhone: asksHowToReach });
    // A button reply in the wrong language (e.g. English to an Arabic visitor) is replaced by a fixed local line.
    const SCRIPTS = { ar: /[\u0600-\u06FF]/, zh: /[\u4e00-\u9fff]/, ru: /[\u0400-\u04FF]/ };
    if (fullText && SCRIPTS[lang] && !SCRIPTS[lang].test(fullText) && actions.length) {
      fullText = ACTION_INTRO[actions[0].kind]?.[lang] || fullText;
    }
    // The reply is held back until lead handling is settled, so we never promise a hand-off that did not happen.

    // ─── 4. Persist lead if captured ────────────────────────────────────────
    stage.mark('groq_stream_completed', {
      chunkCount,
      responseLength: fullText.length,
      idleAfterLastChunkMs: Date.now() - lastChunkAt,
    });
    let leadSaved = false;
    let leadNewlySaved = false;
    let leadVague = false;
    let leadNoIntent = false;
    let leadCaptured = false;     // model tried to capture
    let leadIncomplete = false;   // ...but with no usable contact
    let leadBusiness = '';        // business type, if it told us one
    // Initialize Firestore defensively. The answer has already streamed to the
    // user; a DB-init failure here must never turn into a user-facing error.
    let db = null;
    try {
      db = getDb();
    } catch (dbErr) {
      console.error('[chat] getDb failed (answer already delivered):', dbErr);
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

    for (const tc of Object.values(toolCallParts)) {
      if (tc.name === 'capture_lead' && tc.args) {
        try {
          leadCaptured = true;
          const leadData = normalizeLeadData(JSON.parse(tc.args), lang);
          // Visitors already gave name + contact in the start form; use it when the model leaves it blank.
          if (!isUsableContact(leadData.contact) && visitor) {
            const known = isUsableContact(visitor.phone) ? visitor.phone : (isUsableContact(visitor.email) ? visitor.email : '');
            if (known) {
              leadData.contact = known;
              leadData.contact_type = normalizeContactType('', known);
            }
          }
          if (!leadData.name && visitor?.name) leadData.name = visitor.name;
          leadBusiness = leadData.business_type || '';
          // Nothing concrete about what they want yet (e.g. a bare "how much"): don't hand off.
          if (!leadData.business_type && (leadData.project_brief || '').length < 25) {
            leadVague = true;
            stage.mark('lead_skipped_vague');
            continue;
          }
          if (!hasHandoffIntent(recentUserText)) {
            leadNoIntent = true;
            stage.mark('lead_skipped_no_intent');
            continue;
          }

          // Hard guard: only persist + confirm when there's a real contact.
          // Otherwise the model jumped the gun (e.g. on "a restaurant") and we
          // must keep the conversation going instead of dead-ending it.
          if (!isUsableContact(leadData.contact)) {
            leadIncomplete = true;
            stage.mark('lead_skipped_no_contact', { business: leadBusiness });
            continue;
          }
          if (!db) {
            stage.mark('lead_skipped_no_db');
            continue;
          }
          const outcome = await persistLead(leadData);
          if (outcome === 'duplicate') {
            leadSaved = true;
            stage.mark('lead_already_saved');
            continue;
          }
          leadSaved = true;
          leadNewlySaved = true;
          stage.mark('lead_save_completed');
          send({ type: 'lead', saved: true });
        } catch (err) {
          console.error('[chat] failed to parse/save lead:', err);
          stage.mark('lead_save_failed', { message: err?.message || 'Unknown lead save error' });
        }
      }
    }

    // If the model only called the lead tool and wrote nothing, finish the tool
    // round-trip so it writes a real reply (answering the question) instead of a canned line.
    if (!fullText.trim() && (leadSaved || leadCaptured)) {
      const leadCall = Object.values(toolCallParts).find((t) => t.name === 'capture_lead');
      if (leadCall) {
        try {
          stage.mark('tool_followup_started');
          const callId = leadCall.id || 'call_capture_lead';
          const toolNote = leadSaved
            ? 'Saved. The team will message the visitor soon. Now reply to the visitor in the same language: answer their last question first (stay brief, no figures), then say the team will message them soon.'
            : leadNoIntent
              ? 'No hand-off needed yet. Reply in the same language: just answer their last question briefly and naturally. Do not mention the team and do not point to our work.'
              : leadVague
                ? "Not handed off yet: you don't know what they want built. Reply in the same language: say pricing is custom and depends on what they need, then ask in one short sentence what they're looking to build. Do not mention the team and do not point to our work."
                : leadIncomplete
                  ? 'Not saved: no usable contact yet. Reply naturally and ask how the team should reach them.'
                  : 'Noted. Reply to the visitor in the same language: answer their last question first (stay brief, no figures), then say the team will follow up. Do NOT ask for contact details.';
          const followUp = await groq.chat.completions.create({
            model: usedModel,
            messages: [
              ...messages,
              { role: 'assistant', content: null, tool_calls: [{ id: callId, type: 'function', function: { name: 'capture_lead', arguments: leadCall.args || '{}' } }] },
              { role: 'tool', tool_call_id: callId, content: toolNote },
            ],
            ...reasoningFor(usedModel),
            temperature: 0.3,
            max_tokens: 300,
          });
          const cleaned = sanitizeReply(followUp.choices?.[0]?.message?.content || '', { lang, allowedDigits: [visitor?.phone] });
          if (cleaned) fullText += cleaned;
          stage.mark('tool_followup_completed', { responseLength: fullText.length });
        } catch (followErr) {
          stage.mark('tool_followup_failed', { message: followErr?.message || 'follow-up failed' });
        }
      }
    }

    // Only show the "we got your details" confirmation when a REAL lead saved.
    if (!fullText.trim() && leadSaved) {
      fullText = {
        ar: 'حوّلت طلبك للفريق، وسيراسلونك قريباً.',
        zh: '我已经把这个转给团队了，他们很快会联系你。',
        ru: 'Передал это команде, они скоро свяжутся с вами.',
        en: "I've passed this to the team, and they'll message you soon.",
      }[lang] || "I've passed this to the team, and they'll message you soon.";
    } else if (!fullText.trim() && leadIncomplete) {
      // Model tried to capture before we had a contact — ask naturally and keep going.
      const biz = leadBusiness.trim();
      fullText = {
        ar: `تمام${biz ? `، ${biz} مجال نعرفه جيداً` : ''}. كيف أفضل أن يتواصل معك الفريق، واتساب أو هاتف أو بريد؟`,
        zh: `好的${biz ? `，${biz}是我们熟悉的领域` : ''}。你更希望团队通过 WhatsApp、电话还是邮箱联系你？`,
        ru: `Хорошо${biz ? `, ${biz} нам хорошо знаком` : ''}. Как вам удобнее, чтобы команда связалась: WhatsApp, телефон или почта?`,
        en: `Sounds good${biz ? `, ${biz} is something we know well` : ''}. How would you like the team to reach you: WhatsApp, phone or email?`,
      }[lang] || 'Sounds good. How would you like the team to reach you: WhatsApp, phone or email?';
    }

    // Never promise a hand-off that did not happen. If the reply says the team will follow up but
    // no lead was saved (the model skipped the tool), do it here when it is legitimate; otherwise
    // remove the promise.
    if (fullText && !leadSaved && claimsHandoff(fullText)) {
      const contact = isUsableContact(visitor?.phone) ? visitor.phone : (isUsableContact(visitor?.email) ? visitor.email : '');
      const userWordCount = [...cleanedHistory.filter((m) => m.role === 'user').map((m) => m.content), message].join(' ').split(/\s+/).filter(Boolean).length;
      if (contact && db && hasHandoffIntent(recentUserText) && userWordCount >= 8) {
        try {
          const selfLead = normalizeLeadData({
            name: visitor?.name || '',
            contact,
            contact_type: '',
            business_type: '',
            project_brief: recentUserText.slice(0, 300),
            urgency: 'unknown',
          }, lang);
          const outcome = await persistLead(selfLead);
          if (outcome === 'saved' || outcome === 'duplicate') {
            leadSaved = true;
            leadNewlySaved = outcome === 'saved';
            stage.mark('lead_saved_by_server', { outcome });
            if (outcome === 'saved') send({ type: 'lead', saved: true });
          }
        } catch (selfErr) {
          stage.mark('lead_server_save_failed', { message: selfErr?.message || 'save failed' });
        }
      }
      if (!leadSaved) {
        fullText = stripHandoffClaims(fullText, lang);
        stage.mark('handoff_claim_removed');
      }
    }

    // After a hand-off to the team, point the visitor at our work while they wait.
    if (leadNewlySaved && fullText.trim()) {
      fullText += ` ${MEANWHILE_LINE[lang] || MEANWHILE_LINE.en}`;
      send({ type: 'actions', items: [getAction('demos', lang)] });
    }

    // Send the settled reply.
    if (fullText.trim()) {
      hasStreamedText = true;
      for (const piece of fullText.match(/[\s\S]{1,32}(?:\s|$)/g) || [fullText]) send({ type: 'text', delta: piece });
    }

    // ─── 5. Log conversation turn ───────────────────────────────────────────
    try {
      if (!db) throw new Error('Firestore unavailable (db init failed)');
      stage.mark('conversation_log_started');
      const convoRef = db.collection('chatConversations').doc(sessionId);
      await convoRef.set(
        {
          lang,
          pageUrl: body?.pageUrl || '',
          messageCount: admin.firestore.FieldValue.increment(2),
          lastMessage: message,
          lastResponse: fullText,
          lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          // Only set hasLead when a lead actually saved. (Writing increment(0)
          // on a turn after the field is already boolean `true` throws in
          // Firestore and would silently kill all later conversation logging.)
          ...(leadSaved ? { hasLead: true } : {}),
        },
        { merge: true }
      );
      await convoRef.collection('messages').add({
        role: 'user',
        content: message,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await convoRef.collection('messages').add({
        role: 'assistant',
        content: fullText,
        sources: retrieved.map(c => c.id),
        leadSaved,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      stage.mark('conversation_log_completed');
    } catch (err) {
      console.error('[chat] failed to log conversation:', err);
      stage.mark('conversation_log_failed', { message: err?.message || 'Unknown conversation log error' });
    }

    stage.mark('handler_completed');
    send({ type: 'done' });
    res.end();
  } catch (err) {
    const errorDetails = extractErrorDetails(err);
    console.error('[chat] error:', errorDetails, err);
    // If we already streamed a visible answer, don't tack on a scary error
    // bubble — the user got their reply. Close the stream cleanly instead.
    if (hasStreamedText) {
      stage.mark('post_stream_error_suppressed', {
        message: errorDetails.message,
        code: errorDetails.code,
      });
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
