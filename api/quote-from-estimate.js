// POST /api/quote-from-estimate { selection, clientName?, language? } -> { quote }
// Admin-only. Builds the estimate server-side, converts it to quote line items,
// generates passcode + quote number, and persists a standalone quote.

import { getDb, admin } from './_lib/firebase.js';
import { requireAdmin } from './_lib/admin-auth.js';
import { generateQuoteId, generatePasscode, hashPasscode } from './_lib/quote-id.js';
import { getNextQuoteNumber } from './_lib/quote-counter.js';
import { buildEstimate } from '../app/lib/pricing-model.js';
import { estimateToQuoteDraft } from '../app/lib/estimate-quote.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

export default async function handler(req, res) {
  console.log('[quote-from-estimate] hit', { method: req.method, url: req.url });
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let adminUser;
    try {
      adminUser = await requireAdmin(req);
    } catch (error) {
      console.warn('[quote-from-estimate] auth failed:', error.message);
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

    const selection = body?.selection && typeof body.selection === 'object' ? body.selection : {};
    const clientName = String(body?.clientName || '').trim();
    const language = body?.language === 'ar' ? 'ar' : 'en';
    const estimate = buildEstimate(selection);
    const draft = estimateToQuoteDraft(estimate, { clientName, language });
    if (!draft.lineItems.length) {
      return res.status(400).json({ error: 'Estimate has no billable lines' });
    }

    const id = generateQuoteId();
    const passcodePlain = generatePasscode();
    const passcodeHash = hashPasscode(passcodePlain);
    const quoteNumber = await getNextQuoteNumber();
    const now = admin.firestore.FieldValue.serverTimestamp();

    const quote = {
      quoteNumber,
      status: 'draft',
      language: draft.language,
      validDays: draft.validDays,
      vatPercent: draft.vatPercent,
      customer: draft.customer,
      estimateSnapshot: {
        selection,
        version: estimate.version,
        subtotal: estimate.subtotal,
        discountPercent: estimate.discountPercent,
        discountAmount: estimate.discountAmount,
        discountedSubtotal: estimate.discountedSubtotal,
        vatPercent: estimate.vatPercent,
        vat: estimate.vat,
        grandTotal: estimate.grandTotal,
        monthly: estimate.monthly,
        createdBy: adminUser.email || adminUser.uid || ''
      },
      lineItems: draft.lineItems,
      pages: draft.pages,
      terms: draft.terms,
      notes: draft.notes,
      passcodeHash,
      _passcodePlain: passcodePlain,
      createdAt: now,
      updatedAt: now,
      lastSentAt: null
    };

    const db = getDb();
    console.log('[quote-from-estimate] writing quote:', { id, quoteNumber, lines: quote.lineItems.length });
    await db.collection('quotes').doc(id).set(quote);
    const after = await db.collection('quotes').doc(id).get();
    return res.status(201).json({ id, ...after.data(), passcodePlain });
  } catch (error) {
    console.error('[quote-from-estimate] unhandled error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
