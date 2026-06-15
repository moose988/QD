import { computeTotals } from '../../app/lib/quote-totals.js';
import { buildQuotePaymentFields, getQuotePaymentStatus, roundMoney } from './quote-payments.js';

export const QUOTE_WORKFLOW_STATUSES = ['draft', 'sent', 'accepted', 'paid', 'declined'];

const PUBLIC_INTERNAL_FIELDS = new Set([
  'passcodeHash',
  '_passcodePlain',
  'submissionId',
  'estimateSnapshot',
  'payments',
  'paid',
  'balance',
  'paymentStatus',
  'lastPaymentAt',
  'lastSentAt',
  'remarks',
  'status',
  'quoteNumberLower',
  'businessNameLower'
]);

export function parseJsonBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try {
    return JSON.parse(req.body);
  } catch {
    const error = new Error('Invalid JSON');
    error.status = 400;
    throw error;
  }
}

export function getQueryParam(req, key) {
  if (req.query?.[key] != null) return Array.isArray(req.query[key]) ? req.query[key][0] : req.query[key];
  const url = new URL(req.url || '/', 'http://localhost');
  return url.searchParams.get(key);
}

export function getQuoteRefFromRequest(req, body = {}) {
  return String(
    body.quoteRef
    || body.ref
    || body.id
    || getQueryParam(req, 'quoteRef')
    || getQueryParam(req, 'ref')
    || getQueryParam(req, 'id')
    || ''
  ).trim();
}

export function normalizeQuoteWorkflowStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  const migrated = normalized === 'active' ? 'sent' : normalized;
  if (!QUOTE_WORKFLOW_STATUSES.includes(migrated)) {
    const error = new Error(`Invalid quote status: ${status}`);
    error.status = 400;
    throw error;
  }
  return migrated;
}

export function getQuoteWorkflowStatus(quote = {}) {
  try {
    return normalizeQuoteWorkflowStatus(quote.status || 'draft');
  } catch {
    return 'draft';
  }
}

export function buildQuoteSearchFields(quote = {}) {
  return {
    quoteNumberLower: String(quote.quoteNumber || '').trim().toLowerCase(),
    businessNameLower: String(quote.customer?.businessName || '').trim().toLowerCase()
  };
}

export function buildQuoteListRow(id, quote = {}) {
  const total = roundMoney(computeTotals(quote.lineItems, quote.vatPercent, quote.pages?.price).grandTotal);
  const derived = buildQuotePaymentFields(id, quote);
  const paid = Number.isFinite(Number(quote.paid)) ? roundMoney(quote.paid) : derived.paid;
  const balance = Number.isFinite(Number(quote.balance)) ? roundMoney(quote.balance) : roundMoney(Math.max(0, total - paid));
  const paymentStatus = quote.paymentStatus || getQuotePaymentStatus(paid, balance);

  return {
    id,
    quoteNumber: quote.quoteNumber || '',
    businessName: quote.customer?.businessName || '',
    createdAt: quote.createdAt || null,
    total,
    status: getQuoteWorkflowStatus(quote),
    paid,
    balance,
    paymentStatus,
    lastSentAt: quote.lastSentAt || null,
    remarks: String(quote.remarks || '')
  };
}

export function quoteMatchesSearch(row, search) {
  const q = String(search || '').trim().toLowerCase();
  if (!q) return true;
  return String(row.quoteNumber || '').toLowerCase().includes(q)
    || String(row.businessName || '').toLowerCase().includes(q);
}

async function queryFirstQuote(db, field, value) {
  const snap = await db.collection('quotes').where(field, '==', value).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ref: doc.ref, data: doc.data() || {} };
}

export async function resolveQuoteByRef(db, quoteRef) {
  const ref = String(quoteRef || '').trim();
  if (!ref) return null;

  const byId = await db.collection('quotes').doc(ref).get();
  if (byId.exists) {
    return { id: byId.id, ref: byId.ref, data: byId.data() || {} };
  }

  const values = Array.from(new Set([ref, ref.toUpperCase(), ref.toLowerCase()]));
  const fields = ['quoteNumber', 'ref', 'quoteRef', 'quoteNumberLower'];
  for (const value of values) {
    for (const field of fields) {
      const found = await queryFirstQuote(db, field, field === 'quoteNumberLower' ? value.toLowerCase() : value);
      if (found) return found;
    }
  }

  return null;
}

export function sanitizePublicQuote(quote = {}) {
  const safe = { ...quote };
  for (const key of Object.keys(safe)) {
    if (key.startsWith('_') || PUBLIC_INTERNAL_FIELDS.has(key)) delete safe[key];
  }
  return safe;
}
