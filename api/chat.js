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
import { retrieve } from './_lib/retrieval.js';
import { buildSystemPrompt, detectLang, LEAD_TOOL } from './_lib/prompt.js';
import { getDb, admin } from './_lib/firebase.js';

// Start downloading the embedding model in the background as soon as the module loads.
warmup();

const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const MAX_HISTORY = 8; // last 8 messages (4 turns)

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

  try {
    // ─── 1. Embed query + retrieve ──────────────────────────────────────────
    const queryEmbedding = await embedQuery(message);
    const retrieved = await retrieve(queryEmbedding, { topK: 6, lang });

    // Tell the client what sources we used (optional, for transparency / citations)
    send({
      type: 'sources',
      items: retrieved.map(c => ({
        id: c.id,
        source: c.source,
        heading: c.heading,
        lang: c.lang,
        score: Math.round(c.score * 1000) / 1000,
      })),
    });

    // ─── 2. Build prompt ────────────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt({ lang, contextChunks: retrieved });

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
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const stream = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      tools: [LEAD_TOOL],
      tool_choice: 'auto',
      temperature: 0.4,
      max_tokens: 700,
      stream: true,
    });

    let fullText = '';
    const toolCallParts = {}; // index -> { name, args }

    for await (const chunk of stream) {
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
    let leadSaved = false;
    const db = getDb();

    for (const tc of Object.values(toolCallParts)) {
      if (tc.name === 'capture_lead' && tc.args) {
        try {
          const leadData = JSON.parse(tc.args);
          await db.collection('chatLeads').add({
            ...leadData,
            sessionId,
            sourceUrl: body?.pageUrl || '',
            userAgent: req.headers['user-agent'] || '',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'new',
          });
          leadSaved = true;
          send({ type: 'lead', saved: true });
        } catch (err) {
          console.error('[chat] failed to parse/save lead:', err);
        }
      }
    }

    // ─── 5. Log conversation turn ───────────────────────────────────────────
    try {
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
    } catch (err) {
      console.error('[chat] failed to log conversation:', err);
    }

    send({ type: 'done' });
    res.end();
  } catch (err) {
    console.error('[chat] error:', err);
    send({
      type: 'error',
      message: lang === 'ar'
        ? 'حدث خطأ. جرّب مرة أخرى أو راسلنا واتساب +971 50 534 9907.'
        : 'Something went wrong. Try again, or WhatsApp us at +971 50 534 9907.',
    });
    res.end();
  }
}
