// POST /api/lead  { name, email, phone, sessionId, language, pageUrl } -> { ok: true, id }
// Captures a "pre-chat" lead the moment a visitor opens the chatbot and submits the
// name/email/phone gate — BEFORE the conversation starts — so the lead is never lost
// even if they disconnect mid-chat. Writes to the same `chatLeads` collection the bot's
// in-conversation capture uses, so these appear in the admin "Chat Leads" tab.
//
// No calendar/email side effects (that's /api/book). This only stores the lead.

import { getDb, admin } from './_lib/firebase.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    }
    body = body || {};

    const name = (body.name || '').toString().trim().slice(0, 120);
    const email = (body.email || '').toString().trim().slice(0, 200);
    const phone = (body.phone || '').toString().trim().slice(0, 60);

    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!isEmail(email)) return res.status(400).json({ error: 'a valid email is required' });

    const db = getDb();
    const ref = await db.collection('chatLeads').add({
      name,
      email,
      phone,
      // Mirror the shape the in-conversation capture uses so the admin renders it cleanly.
      contact: email || phone,
      contact_type: email ? 'email' : (phone ? 'whatsapp' : 'unknown'),
      business_type: '',
      project_brief: 'Pre-chat capture — visitor opened the assistant.',
      urgency: 'unknown',
      language: ['ar', 'zh', 'ru'].includes(body.language) ? body.language : 'en',
      source: 'chatbot-prechat',
      sessionId: (body.sessionId || '').toString().slice(0, 80),
      sourceUrl: (body.pageUrl || '').toString().slice(0, 400),
      userAgent: (req.headers['user-agent'] || '').toString().slice(0, 300),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'new',
    });

    return res.status(200).json({ ok: true, id: ref.id });
  } catch (error) {
    console.error('[lead] error:', error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
