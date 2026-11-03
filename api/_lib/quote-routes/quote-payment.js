// GET  /api/quote-payment?quoteRef=Q-YYYY-NNN -> internal payment summary
// POST /api/quote-payment { quoteRef, amount, date, method, note? } -> append payment
// Admin-only. Payment records are internal and must never be exposed by /q/.

import { getDb, admin } from '../firebase.js';
import { requireAdmin } from '../admin-auth.js';
import { randomUUID } from 'node:crypto';
import { changeLedger } from '../../../app/lib/shared-ledger.js';
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

export function createQuotePaymentHandler({dbProvider = getDb, authenticate = requireAdmin} = {}) {
return async function handler(req, res) {
  console.log('[quote-payment] hit', { method: req.method, url: req.url });
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  try {
    try {
      var adminUser = await authenticate(req);
    } catch (error) {
      console.warn('[quote-payment] auth failed:', error.message);
      return res.status(401).json({ error: error.message });
    }

    const body = req.method === 'POST' ? parseJsonBody(req) : {};
    const quoteRef = getQuoteRefFromRequest(req, body);
    if (!quoteRef) return res.status(400).json({ error: 'quoteRef is required' });

    const db = dbProvider();
    const resolved = await resolveQuoteByRef(db, quoteRef);
    if (!resolved) return res.status(404).json({ error: 'Quote not found' });

    if (req.method === 'GET') {
      return res.status(200).json(buildQuotePaymentView(resolved.id, resolved.data));
    }

    const payment = paymentFromBody(body);
    const requestId = /^[a-zA-Z0-9-]{16,80}$/.test(body.requestId || '') ? body.requestId : randomUUID();
    const ledgerRef = db.collection('adminSharedLedger').doc('main');
    const receiptRef = db.collection('quotePaymentReceipts').doc(requestId);
    const auditRef = db.collection('adminActivityLogs').doc(`payment-${requestId}`);
    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(resolved.ref);
      const receipt = await transaction.get(receiptRef);
      const ledgerSnap = await transaction.get(ledgerRef);
      if (receipt.exists) { if (receipt.data().quoteId !== resolved.id || receipt.data().amount !== payment.amount || receipt.data().itemKey !== payment.itemKey || receipt.data().date !== payment.date || receipt.data().method !== payment.method) throw Object.assign(new Error('This payment request was already used with different details. Refresh and review the payment.'), {status:409}); return {view:buildQuotePaymentView(resolved.id,snap.data()), quoteNumber:snap.data()?.quoteNumber}; }
      if (!snap.exists) {
        const error = new Error('Quote not found');
        error.status = 404;
        throw error;
      }
      const quote = snap.data() || {};
      const nextQuote = applyPaymentToQuote(resolved.id, quote, payment, { on: payment.date });
      const actor = String(adminUser.email || '').toLowerCase();
      const ledger = ledgerSnap.exists ? ledgerSnap.data() : {shares:[0,0],entries:[],bills:[]};
      const fils = Math.round(payment.amount * 100);
      const updatedLedger = changeLedger(ledger,{type:'deposit',amount:fils,actor});
      const note = `Payment · ${quote.quoteNumber || resolved.id}${quote.customer?.businessName ? ` · ${quote.customer.businessName}` : ''}`;
      updatedLedger.entries = [{id:requestId,type:'deposit',amount:fils,note,actor,at:new Date().toISOString(),quoteId:resolved.id},...(ledger.entries || [])];
      transaction.set(ledgerRef,updatedLedger);
      transaction.set(receiptRef,{quoteId:resolved.id,amount:payment.amount,itemKey:payment.itemKey,date:payment.date,method:payment.method,actor});
      transaction.set(auditRef,{action:'recorded_payment',page:'admin',targetType:'quote',targetId:resolved.id,targetLabel:quote.quoteNumber || resolved.id,actorEmail:actor,actorUid:adminUser.uid || '',metadata:{amountAED:payment.amount,item:payment.itemKey,method:payment.method,sharedBank:'Deposited'},timestamp:admin.firestore.FieldValue.serverTimestamp()});
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
      return { view: buildQuotePaymentView(resolved.id, nextQuote), quoteNumber: quote.quoteNumber };
    });

    return res.status(201).json(result.view);
  } catch (error) {
    console.error('[quote-payment] unhandled error:', error);
    return res.status(error.status || 500).json({ error: error.message || 'Internal server error' });
  }
}

}
export default createQuotePaymentHandler();
