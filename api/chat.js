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
import { getDb, admin } from './_lib/firebase.js';

// Start downloading the embedding model in the background as soon as the module loads.
warmup();

const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_EMBED_MODEL = 'Xenova/multilingual-e5-small';
const MAX_HISTORY = 8; // last 8 messages (4 turns)
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

function extractErrorDetails(err) {
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
    language: lang === 'ar' ? 'ar' : 'en',
  };

  normalized.contact_type = normalizeContactType(leadData?.contact_type, normalized.contact);

  if (!['urgent', 'soon', 'exploring', 'unknown'].includes(normalized.urgency)) {
    normalized.urgency = 'unknown';
  }

  return normalized;
}

function makeStageTracker(send) {
  let currentStage = 'request_received';
  const startedAt = Date.now();

  return {
    mark(stage, meta = {}) {
      currentStage = stage;
      const elapsedMs = Date.now() - startedAt;
      const payload = { ...meta, elapsedMs };
      console.log(`[chat] stage=${stage} elapsed=${elapsedMs}ms`, payload);
      send({ type: 'debug', stage, meta: payload, at: new Date().toISOString() });
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
  const pageLang = body?.pageLang === 'ar' ? 'ar' : 'en';

  if (!message) return res.status(400).json({ error: 'message is required' });
  if (message.length > 2000) return res.status(400).json({ error: 'message too long (max 2000 chars)' });

  const lang = detectLang(message) || pageLang;

  // ─── SSE response setup ───────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if proxied

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };
  const stage = makeStageTracker(send);
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
    // ─── 1. Embed query + retrieve ──────────────────────────────────────────
    let retrieved = [];
    let retrievalMode = 'semantic';
    try {
      stage.mark('embedding_started', {
        messageLength: message.length,
        lang,
        timeoutMs: EMBEDDING_TIMEOUT_MS,
      });
      const queryEmbedding = await withTimeout(embedQuery(message), EMBEDDING_TIMEOUT_MS, 'Embedding');
      stage.mark('embedding_completed', { dimensions: queryEmbedding?.length || 0 });
      stage.mark('retrieval_started', { mode: retrievalMode });
      retrieved = await retrieve(queryEmbedding, { topK: 6, lang });
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
      retrieved = await getFallbackContext(lang, 6);
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
    const systemPrompt = buildSystemPrompt({ lang, contextChunks: retrieved });
    stage.mark('prompt_build_completed', { promptLength: systemPrompt.length });

    const cleanedHistory = history
      .filter(m => m && m.role && m.content && ['user', 'assistant'].includes(m.role))
      .slice(-MAX_HISTORY)
      .map(m => ({ role: m.role, content: String(m.content).slice(0, 4000) }));

    const messages = [
      { role: 'system', content: systemPrompt },
      ...cleanedHistory,
      { role: 'user', content: message },
    ];

    // ─── 3. Stream Groq response ────────────────────────────────────────────
    stage.mark('groq_client_init_started');
    const groq = new Groq({ apiKey: groqApiKey });
    stage.mark('groq_client_init_completed');

    stage.mark('groq_stream_create_started', {
      model: groqModel,
      messageCount: messages.length,
    });
    const stream = await groq.chat.completions.create({
      model: groqModel,
      messages,
      tools: [LEAD_TOOL],
      tool_choice: 'auto',
      temperature: 0.4,
      max_tokens: 700,
      stream: true,
    });
    stage.mark('groq_stream_create_completed');

    let fullText = '';
    const toolCallParts = {}; // index -> { name, args }
    let chunkCount = 0;
    let lastChunkAt = Date.now();

    for await (const chunk of stream) {
      chunkCount += 1;
      lastChunkAt = Date.now();
      if (chunkCount === 1) {
        stage.mark('groq_stream_first_chunk_received');
      } else if (chunkCount % 25 === 0) {
        stage.mark('groq_stream_progress', { chunkCount });
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta || {};

      if (delta.content) {
        fullText += delta.content;
        send({ type: 'text', delta: delta.content });
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCallParts[idx]) toolCallParts[idx] = { name: '', args: '' };
          if (tc.function?.name) toolCallParts[idx].name = tc.function.name;
          if (tc.function?.arguments) toolCallParts[idx].args += tc.function.arguments;
        }
      }
    }

    // ─── 4. Persist lead if captured ────────────────────────────────────────
    stage.mark('groq_stream_completed', {
      chunkCount,
      responseLength: fullText.length,
      idleAfterLastChunkMs: Date.now() - lastChunkAt,
    });
    let leadSaved = false;
    let leadCaptured = false;
    const db = getDb();

    for (const tc of Object.values(toolCallParts)) {
      if (tc.name === 'capture_lead' && tc.args) {
        try {
          stage.mark('lead_save_started');
          leadCaptured = true;
          const leadData = normalizeLeadData(JSON.parse(tc.args), lang);
          await db.collection('chatLeads').add({
            ...leadData,
            sessionId,
            sourceUrl: body?.pageUrl || '',
            userAgent: req.headers['user-agent'] || '',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'new',
          });
          leadSaved = true;
          stage.mark('lead_save_completed');
          send({ type: 'lead', saved: true });
        } catch (err) {
          console.error('[chat] failed to parse/save lead:', err);
          stage.mark('lead_save_failed', { message: err?.message || 'Unknown lead save error' });
        }
      }
    }

    if (!fullText.trim() && leadSaved) {
      fullText = lang === 'ar'
        ? 'تم استلام بياناتك. سيتواصل معك فريق QD قريباً عبر وسيلة التواصل التي شاركتها.'
        : 'Thanks — we received your details. The QD team will reach out shortly using the contact method you shared.';
      send({ type: 'text', delta: fullText });
    } else if (!fullText.trim() && leadCaptured) {
      fullText = lang === 'ar'
        ? 'تم التقاط طلبك. إذا رغبت، أرسل اسمك وطريقة التواصل المفضلة وسيتابع معك فريق QD.'
        : 'I captured the request context. If you want, share your name and preferred contact method and the QD team can follow up.';
      send({ type: 'text', delta: fullText });
    }

    // ─── 5. Log conversation turn ───────────────────────────────────────────
    try {
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
          hasLead: leadSaved ? true : admin.firestore.FieldValue.increment(0),
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
    send({
      type: 'error',
      message: lang === 'ar'
        ? 'حدث خطأ. جرّب مرة أخرى أو راسلنا واتساب +971 50 534 9907.'
        : 'Something went wrong. Try again, or WhatsApp us at +971 50 534 9907.',
      details: errorDetails.message,
      code: errorDetails.code,
      statusCode: errorDetails.statusCode,
      stage: stage.current(),
    });
    res.end();
  }
}
