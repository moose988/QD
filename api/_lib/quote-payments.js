import { computeTotals } from '../../app/lib/quote-totals.js';

const PAYMENT_INTERNAL_FIELDS = new Set([
  'payments',
  'paid',
  'balance',
  'paymentStatus',
  'lastPaymentAt'
]);

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function normalizePaymentInput(input = {}) {
  const amount = roundMoney(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('amount must be greater than 0');
    error.status = 400;
    throw error;
  }

  const date = String(input.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const error = new Error('date must use YYYY-MM-DD');
    error.status = 400;
    throw error;
  }

  const method = String(input.method || '').trim();
  if (!method) {
    const error = new Error('method is required');
    error.status = 400;
    throw error;
  }

  return {
    amount,
    date,
    method,
    note: String(input.note || '').trim()
  };
}

export function normalizeStoredPayment(input = {}) {
  const amount = roundMoney(input.amount);
  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
    date: String(input.date || '').trim(),
    method: String(input.method || '').trim(),
    note: String(input.note || '').trim()
  };
}

export function normalizePaymentList(payments = []) {
  if (!Array.isArray(payments)) return [];
  return payments
    .map((payment) => normalizeStoredPayment(payment))
    .filter((payment) => payment.amount > 0);
}

export function getQuotePaymentStatus(paid, balance) {
  if (paid <= 0) return 'Unpaid';
  if (balance <= 0) return 'Paid';
  return 'Partial';
}

export function buildQuotePaymentView(id, quote = {}) {
  const payments = normalizePaymentList(quote.payments);
  const totals = computeTotals(quote.lineItems, quote.vatPercent, quote.pages?.price);
  const total = roundMoney(totals.grandTotal);
  const paid = roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0));
  const balance = roundMoney(Math.max(0, total - paid));

  return {
    id,
    quoteRef: String(quote.quoteNumber || quote.ref || quote.quoteRef || id || '').trim(),
    quoteNumber: quote.quoteNumber || '',
    customer: quote.customer || null,
    createdAt: quote.createdAt || null,
    lastSentAt: quote.lastSentAt || null,
    workflowStatus: quote.status || 'draft',
    remarks: quote.remarks || '',
    passcodePlain: quote._passcodePlain || '',
    goLiveDate: quote.goLiveDate || '',
    billingDay: quote.billingDay || 0,
    careMonthly: quote.careMonthly || 0,
    careCollected: Array.isArray(quote.careCollected) ? quote.careCollected : [],
    milestones: Array.isArray(quote.milestones) ? quote.milestones : [],
    total,
    paid,
    balance,
    status: getQuotePaymentStatus(paid, balance),
    paymentStatus: getQuotePaymentStatus(paid, balance),
    payments
  };
}

export function buildQuotePaymentFields(id, quote = {}) {
  const view = buildQuotePaymentView(id, quote);
  return {
    payments: view.payments,
    paid: view.paid,
    balance: view.balance,
    paymentStatus: view.status
  };
}

export function stripInternalPaymentFields(quote = {}) {
  const safe = { ...quote };
  for (const field of PAYMENT_INTERNAL_FIELDS) {
    delete safe[field];
  }
  return safe;
}
