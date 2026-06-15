// POST /api/collections-collect { ref|id, type:'care'|'milestone', monthKey?, milestoneKey?, collectedOn?, method? }
// Admin-only collection action. Appends an internal payment and updates collection state.

import { getDb, admin } from '../firebase.js';
import { requireAdmin } from '../admin-auth.js';
import { getQuoteRefFromRequest, parseJsonBody, resolveQuoteByRef } from '../quote-admin.js';
import { buildQuoteCollectionPatch, buildQuoteFieldsAfterCollection, todayIso } from '../collections.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

export default async function handler(req, res) {
  console.log('[collections-collect] hit', { method: req.method, url: req.url });
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    try {
      await requireAdmin(req);
    } catch (error) {
      console.warn('[collections-collect] auth failed:', error.message);
      return res.status(401).json({ error: error.message });
    }

    const body = parseJsonBody(req);
    const quoteRef = getQuoteRefFromRequest(req, body);
    if (!quoteRef) return res.status(400).json({ error: 'ref or id is required' });

    const db = getDb();
    const resolved = await resolveQuoteByRef(db, quoteRef);
    if (!resolved) return res.status(404).json({ error: 'Quote not found' });

    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(resolved.ref);
      if (!snap.exists) {
        const error = new Error('Quote not found');
        error.status = 404;
        throw error;
      }
      const quote = snap.data() || {};
      const patch = buildQuoteCollectionPatch(quote, {
        ...body,
        collectedOn: body.collectedOn || todayIso()
      });
      const fields = buildQuoteFieldsAfterCollection(resolved.id, quote, patch);
      transaction.set(resolved.ref, {
        ...fields,
        lastPaymentAt: patch.payment.date,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return { ok: true, payment: patch.payment };
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('[collections-collect] unhandled error:', error);
    return res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
  }
}
