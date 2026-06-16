// PATCH /api/quote-save  { id, updates, markSent? } -> { quote }
// Admin-only. Whitelisted field updates. Optional markSent flips status to 'active' + sets lastSentAt.

import { getDb, admin } from './_lib/firebase.js';
import { requireAdmin } from './_lib/admin-auth.js';
import { buildQuoteSearchFields } from './_lib/quote-admin.js';
import { buildDefaultMilestones } from './_lib/collections.js';
import { getConsolidatedQuoteRoute, handleConsolidatedQuoteRoute } from './_lib/quote-consolidated-routes.js';
import { buildQuotePaymentFields } from './_lib/quote-payments.js';
import { logQuoteAudit } from './_lib/audit-log.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

// Fields the admin is allowed to update directly. Everything else is locked.
const ALLOWED = new Set([
  'language', 'validDays', 'vatPercent', 'vatInclusive',
  'customer', 'lineItems', 'pages', 'terms', 'notes',
  'careMonthly', 'carePlanName'
]);

export default async function handler(req, res) {
  const consolidatedRoute = getConsolidatedQuoteRoute(req);
  if (consolidatedRoute) {
    return handleConsolidatedQuoteRoute(consolidatedRoute, req, res);
  }

  console.log('[quote-save] hit', { method: req.method, url: req.url });
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  try {
    try {
      var adminUser = await requireAdmin(req);
    } catch (error) {
      console.warn('[quote-save] auth failed:', error.message);
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
    console.log('[quote-save] parsed body', body);

    const id = (body?.id || '').toString().trim();
    const updates = body?.updates || {};
    const markSent = body?.markSent === true;
    if (!id) return res.status(400).json({ error: 'id is required' });
    console.log('[quote-save] saving quote:', { id, markSent, updateKeys: Object.keys(updates) });

    const safe = {};
    for (const key of Object.keys(updates)) {
      if (ALLOWED.has(key)) safe[key] = updates[key];
    }
    if (Array.isArray(safe.lineItems)) {
      safe.lineItems = safe.lineItems.filter((line) => line?.catalogKey !== 'monthly-care');
    }
    if (safe.vatInclusive !== false) {
      safe.vatInclusive = true;
      safe.vatPercent = 0;
    }
    if (safe.careMonthly != null) safe.careMonthly = Math.max(0, Math.round(Number(safe.careMonthly) || 0));

    safe.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    if (markSent) {
      safe.status = 'sent';
      safe.lastSentAt = admin.firestore.FieldValue.serverTimestamp();
    }

    const db = getDb();
    const ref = db.collection('quotes').doc(id);
    console.log('[quote-save] loading quote before merge');
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Quote not found' });
    const existingQuote = snap.data() || {};
    const nextQuote = { ...existingQuote, ...safe };
    Object.assign(safe, buildQuotePaymentFields(id, nextQuote));
    Object.assign(safe, buildQuoteSearchFields(nextQuote));
    if (!Array.isArray(existingQuote.milestones)) {
      safe.milestones = buildDefaultMilestones(safe.balance);
    }

    console.log('[quote-save] writing merged updates');
    await ref.set(safe, { merge: true });
    await logQuoteAudit({
      action: markSent ? 'marked_sent' : 'update_quote',
      quoteId: id,
      quoteNumber: nextQuote.quoteNumber,
      actor: adminUser,
      details: markSent ? `Marked ${nextQuote.quoteNumber || id} as sent` : `Updated quote ${nextQuote.quoteNumber || id}`
    });

    if (markSent && existingQuote.submissionId) {
      console.log('[quote-save] marking submission as Quoted', { submissionId: existingQuote.submissionId });
      await db.collection('projectSubmissions').doc(existingQuote.submissionId).set({
        status: 'Quoted',
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }

    const after = await ref.get();
    console.log('[quote-save] save complete');
    return res.status(200).json({ id, ...after.data() });
  } catch (error) {
    console.error('[quote-save] unhandled error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
