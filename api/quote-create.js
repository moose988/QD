// POST /api/quote-create  { submissionId } → { quote }
// Admin-only. Pre-fills from submission, generates passcode + quote number, persists.

import { getDb, admin } from './_lib/firebase.js';
import { requireAdmin } from './_lib/admin-auth.js';
import { generateQuoteId, generatePasscode, hashPasscode } from './_lib/quote-id.js';
import { getNextQuoteNumber } from './_lib/quote-counter.js';
import { prefillFromSubmission } from '../app/lib/quote-prefill.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try { await requireAdmin(req); } catch (e) { return res.status(401).json({ error: e.message }); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); } }
  const submissionId = (body?.submissionId || '').toString().trim();
  if (!submissionId) return res.status(400).json({ error: 'submissionId is required' });

  const db = getDb();

  // 1. Load submission
  const subSnap = await db.collection('projectSubmissions').doc(submissionId).get();
  if (!subSnap.exists) return res.status(404).json({ error: 'Submission not found' });
  const submission = subSnap.data();

  // 2. Reject if a quote already exists for this submission (admin should open it, not recreate)
  const existing = await db.collection('quotes').where('submissionId', '==', submissionId).limit(1).get();
  if (!existing.empty) {
    const doc = existing.docs[0];
    return res.status(409).json({ error: 'Quote already exists', existing: { id: doc.id, ...doc.data() } });
  }

  // 3. Pre-fill
  const draft = prefillFromSubmission(submission);

  // 4. Generate IDs and passcode
  const id = generateQuoteId();
  const passcodePlain = generatePasscode();
  const passcodeHash = hashPasscode(passcodePlain);
  const quoteNumber = await getNextQuoteNumber();

  // 5. Persist
  const now = admin.firestore.FieldValue.serverTimestamp();
  const quote = {
    quoteNumber,
    submissionId,
    status: 'draft',
    language: draft.language,
    validDays: 30,
    vatPercent: 5,
    customer: draft.customer,
    submissionSnapshot: draft.sourceSubmission,
    lineItems: draft.lineItems,
    pages: draft.pages,
    terms: { en: '50% upfront, 50% on delivery. Excludes hosting (we recommend Vercel free).', ar: '٥٠٪ مقدماً، ٥٠٪ عند التسليم. لا يشمل الاستضافة (نوصي بـ Vercel المجاني).' },
    notes: { en: '', ar: '' },
    passcodeHash,
    _passcodePlain: passcodePlain,
    createdAt: now,
    updatedAt: now,
    lastSentAt: null,
  };
  await db.collection('quotes').doc(id).set(quote);

  return res.status(201).json({ id, ...quote, passcodePlain });
}
