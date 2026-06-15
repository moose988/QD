// GET  /api/quote-payment?quoteRef=Q-YYYY-NNN -> internal payment summary
// POST /api/quote-payment { quoteRef, amount, date, method, note? } -> append payment
// Admin-only. Payment records are internal and must never be exposed by /q/.

import { getDb, admin } from '../firebase.js';
import { requireAdmin } from '../admin-auth.js';
import { getQuoteRefFromRequest, parseJsonBody, resolveQuoteByRef } from '../quote-admin.js';
import {
  applyPaymentToQuote,
  buildQuotePaymentView,
  normalizePaymentInput
} from '../quote-payments.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

function paymentFromBody(body = {}) {
  return normalizePaymentInput(body.payment && typeof body.payment === 'object' ? body.payment : body);
}

export default async function handler(req, res) {
  console.log('[quote-payment] hit', { method: req.method, url: req.url });
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  try {
    try {
      await requireAdmin(req);
    } catch (error) {
      console.warn('[quote-payment] auth failed:', error.message);
      return res.status(401).json({ error: error.message });
    }

    const body = req.method === 'POST' ? parseJsonBody(req) : {};
    const quoteRef = getQuoteRefFromRequest(req, body);
    if (!quoteRef) return res.status(400).json({ error: 'quoteRef is required' });

    const db = getDb();
    const resolved = await resolveQuoteByRef(db, quoteRef);
    if (!resolved) return res.status(404).json({ error: 'Quote not found' });

    if (req.method === 'GET') {
      return res.status(200).json(buildQuotePaymentView(resolved.id, resolved.data));
    }

    const payment = paymentFromBody(body);
    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(resolved.ref);
      if (!snap.exists) {
        const error = new Error('Quote not found');
        error.status = 404;
        throw error;
      }
      const quote = snap.data() || {};
      const nextQuote = applyPaymentToQuote(resolved.id, quote, payment, { on: payment.date });
      transaction.set(resolved.ref, {
        payments: nextQuote.payments,
        milestones: nextQuote.milestones,
        paid: nextQuote.paid,
        balance: nextQuote.balance,
        buildTotal: nextQuote.buildTotal,
        buildBalance: nextQuote.buildBalance,
        careOutstanding: nextQuote.careOutstanding,
        outstanding: nextQuote.outstanding,
        paymentStatus: nextQuote.paymentStatus,
        lastPaymentAt: payment.date,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return buildQuotePaymentView(resolved.id, nextQuote);
    });

    return res.status(201).json(result);
  } catch (error) {
    console.error('[quote-payment] unhandled error:', error);
    return res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
  }
}
