// POST /api/quote-create  { submissionId } -> { quote }
// POST /api/quote-create  { selection, clientName?, language? } -> { quote }  (pricing estimate)
// POST /api/quote-from-estimate rewrites here on Vercel (same body as estimate flow).
// Admin-only. Pre-fills from submission or estimate, generates passcode + quote number, persists.

import { getDb, admin } from '../firebase.js';
import { requireAdmin } from '../admin-auth.js';
import { generateQuoteId, generatePasscode, hashPasscode } from '../quote-id.js';
import { getNextQuoteNumber } from '../quote-counter.js';
import { buildQuoteSearchFields } from '../quote-admin.js';
import { buildDefaultMilestones } from '../collections.js';
import { buildQuotePaymentFields } from '../quote-payments.js';
import { prefillFromSubmission } from '../../../app/lib/quote-prefill.js';
import { createQuoteFromEstimate } from '../create-quote-from-estimate.js';


export function createQuoteHandler(deps = {}) {
 const {getDb: dbProvider = getDb, authenticate = requireAdmin, nextNumber = getNextQuoteNumber} = deps;
 return async function handler(req, res) {
  console.log('[quote-create] hit', { method: req.method, url: req.url });
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let adminUser;
    try {
      adminUser = await authenticate(req);
    } catch (error) {
      console.warn('[quote-create] auth failed:', error.message);
      return res.status(401).json({ error: error.message });
    }

    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON' });
      }
    }
    console.log('[quote-create] parsed body keys', Object.keys(body || {}));

    if (body?.custom === true) {
      const service = String(body.service || '').trim().slice(0, 120);
      const clientName = String(body.clientName || '').trim().slice(0, 120);
      if (!service || !clientName) return res.status(400).json({error:'Enter a client name and select a service.'});
      const id = generateQuoteId(), passcodePlain = generatePasscode(), quoteNumber = await nextNumber();
      const now = admin.firestore.FieldValue.serverTimestamp();
      const quote = { quoteNumber, status:'draft', language:'en', validDays:30, vatInclusive:true, vatPercent:0,
        customer:{businessName:clientName}, paymentSplit:50, serviceType:service, showClientLink:body.showClientLink === 'yes', lineItems:[], pages:[], terms:{en:'',ar:''}, notes:{en:`Service: ${service}`,ar:''}, remarks:'',
        passcodeHash:hashPasscode(passcodePlain), _passcodePlain:passcodePlain, payments:[], careMonthly:0, carePlanName:'', careCollected:[], careWaived:[], firstMonthFree:false, createdAt:now, updatedAt:now, lastSentAt:null };
      Object.assign(quote, buildQuotePaymentFields(id, quote), buildQuoteSearchFields(quote));
      quote.milestones = buildDefaultMilestones(quote.balance, [], quote.paymentSplit === 50 ? 50 : 30);
      await dbProvider().collection('quotes').doc(id).set(quote);
      return res.status(201).json({id, ...quote, passcodePlain});
    }

    const hasEstimateSelection = body?.selection && typeof body.selection === 'object';
    if (hasEstimateSelection) {
      try {
        const created = await createQuoteFromEstimate(body, adminUser);
        return res.status(201).json(created);
      } catch (error) {
        if (error.status === 400) return res.status(400).json({ error: error.message });
        throw error;
      }
    }

    const submissionId = (body?.submissionId || '').toString().trim();
    if (!submissionId) return res.status(400).json({ error: 'submissionId is required' });
    console.log('[quote-create] requested submissionId:', submissionId);

    const db = dbProvider();

    console.log('[quote-create] loading submission from Firestore');
    const subSnap = await db.collection('projectSubmissions').doc(submissionId).get();
    if (!subSnap.exists) return res.status(404).json({ error: 'Submission not found' });
    const submission = subSnap.data();

    console.log('[quote-create] checking for existing quote');
    const existing = await db.collection('quotes').where('submissionId', '==', submissionId).limit(1).get();
    if (!existing.empty) {
      const doc = existing.docs[0];
      console.log('[quote-create] quote already exists:', doc.id);
      return res.status(409).json({ error: 'Quote already exists', existing: { id: doc.id, ...doc.data() } });
    }

    const draft = prefillFromSubmission(submission);
    const id = generateQuoteId();
    const passcodePlain = generatePasscode();
    const passcodeHash = hashPasscode(passcodePlain);
    const quoteNumber = await nextNumber();

    const now = admin.firestore.FieldValue.serverTimestamp();
    const quote = {
      quoteNumber,
      paymentSplit: 50,
      submissionId,
      status: 'draft',
      language: draft.language,
      validDays: 30,
      vatInclusive: true,
      vatPercent: 0,
      customer: draft.customer,
      submissionSnapshot: draft.sourceSubmission,
      lineItems: draft.lineItems,
      pages: draft.pages,
      terms: {
        en: '50% upfront, 50% on delivery. Excludes hosting (we recommend Vercel free).',
        ar: '50% مقدماً، 50% عند التسليم. لا يشمل الاستضافة (نوصي بـ Vercel المجاني).'
      },
      notes: { en: '', ar: '' },
      remarks: '',
      passcodeHash,
      _passcodePlain: passcodePlain,
      payments: [],
      careMonthly: 149,
      carePlanName: 'Care Basic',
      careCollected: [],
      careWaived: [],
      firstMonthFree: false,
      createdAt: now,
      updatedAt: now,
      lastSentAt: null
    };
    Object.assign(quote, buildQuotePaymentFields(id, quote));
    Object.assign(quote, buildQuoteSearchFields(quote));
    quote.milestones = buildDefaultMilestones(quote.balance, [], quote.paymentSplit === 50 ? 50 : 30);

    console.log('[quote-create] writing quote:', { id, quoteNumber, lineItems: quote.lineItems?.length || 0 });
    await db.collection('quotes').doc(id).set(quote);
    console.log('[quote-create] created quote successfully:', id);

    return res.status(201).json({ id, ...quote, passcodePlain });
  } catch (error) {
    console.error('[quote-create] unhandled error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

}
export default createQuoteHandler();
