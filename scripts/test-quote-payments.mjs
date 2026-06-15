import assert from 'node:assert/strict';

import {
  buildQuotePaymentView,
  normalizePaymentInput,
  stripInternalPaymentFields
} from '../api/_lib/quote-payments.js';

const quote = {
  id: 'quote-doc-id',
  quoteNumber: 'Q-2026-015',
  ref: 'ALT-REF-1',
  lineItems: [
    { qty: 2, unitPrice: 100 },
    { qty: 1, unitPrice: 50 }
  ],
  pages: { price: 50 },
  vatPercent: 5,
  customer: { businessName: 'Test Client' },
  payments: [
    { amount: 100, date: '2026-06-10', method: 'cash', note: 'Deposit', ignored: true },
    { amount: '25.257', date: '2026-06-12', method: 'bank transfer' }
  ]
};

const normalized = normalizePaymentInput({
  amount: '150.755',
  date: '2026-06-15',
  method: 'card',
  note: '  Final transfer  '
});

assert.deepEqual(normalized, {
  amount: 150.76,
  date: '2026-06-15',
  method: 'card',
  note: 'Final transfer'
});

assert.throws(
  () => normalizePaymentInput({ amount: 0, date: '2026-06-15', method: 'cash' }),
  /amount must be greater than 0/
);
assert.throws(
  () => normalizePaymentInput({ amount: 50, date: '15-06-2026', method: 'cash' }),
  /date must use YYYY-MM-DD/
);
assert.throws(
  () => normalizePaymentInput({ amount: 50, date: '2026-06-15', method: '' }),
  /method is required/
);

const view = buildQuotePaymentView('quote-doc-id', quote);
assert.equal(view.quoteRef, 'Q-2026-015');
assert.equal(view.total, 315);
assert.equal(view.paid, 125.26);
assert.equal(view.balance, 189.74);
assert.equal(view.status, 'Partial');
assert.deepEqual(view.payments, [
  { amount: 100, date: '2026-06-10', method: 'cash', note: 'Deposit' },
  { amount: 25.26, date: '2026-06-12', method: 'bank transfer', note: '' }
]);

assert.equal(buildQuotePaymentView('x', { ...quote, payments: [] }).status, 'Unpaid');
assert.equal(buildQuotePaymentView('x', { ...quote, payments: [{ amount: 999, date: '2026-06-15', method: 'cash' }] }).status, 'Paid');

assert.deepEqual(
  stripInternalPaymentFields({
    quoteNumber: 'Q-2026-015',
    payments: [{ amount: 100 }],
    paid: 100,
    balance: 215,
    paymentStatus: 'Partial',
    lastPaymentAt: '2026-06-10',
    customer: { businessName: 'Test Client' }
  }),
  {
    quoteNumber: 'Q-2026-015',
    customer: { businessName: 'Test Client' }
  }
);

console.log('QUOTE PAYMENT HELPERS HOLD');
