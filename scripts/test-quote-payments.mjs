import assert from 'node:assert/strict';

import {
  applyPaymentToQuote,
  buildQuotePaymentFields,
  buildQuotePaymentView,
  normalizePaymentInput,
  stripInternalPaymentFields
} from '../api/_lib/quote-payments.js';

const exampleQuote = {
  id: 'quote-doc-id',
  quoteNumber: 'Q-2026-015',
  ref: 'ALT-REF-1',
  lineItems: [{ qty: 1, unitPrice: 8120 }],
  pages: { price: 0 },
  vatPercent: 0,
  customer: { businessName: 'Test Client' },
  status: 'accepted'
};

assert.throws(
  () => normalizePaymentInput({ amount: 50, date: '2026-06-15', method: 'cash' }),
  /itemKey is required/
);

const normalized = normalizePaymentInput({
  itemKey: 'milestone:advance',
  amount: '500',
  date: '2026-06-15',
  method: 'card',
  note: '  Advance transfer  '
});

assert.deepEqual(normalized, {
  itemKey: 'milestone:advance',
  amount: 500,
  date: '2026-06-15',
  method: 'card',
  note: 'Advance transfer'
});

assert.throws(
  () => normalizePaymentInput({ itemKey: 'milestone:advance', amount: 0, date: '2026-06-15', method: 'cash' }),
  /amount must be greater than 0/
);
assert.throws(
  () => normalizePaymentInput({ itemKey: 'milestone:advance', amount: 50, date: '15-06-2026', method: 'cash' }),
  /date must use YYYY-MM-DD/
);
assert.throws(
  () => normalizePaymentInput({ itemKey: 'milestone:advance', amount: 50, date: '2026-06-15', method: '' }),
  /method is required/
);

const paidQuote = applyPaymentToQuote('quote-doc-id', exampleQuote, normalized);
const view = buildQuotePaymentView('quote-doc-id', paidQuote, { on: '2026-06-15' });
assert.equal(view.quoteRef, 'Q-2026-015');
assert.equal(view.total, 8120);
assert.equal(view.buildTotal, 8120);
assert.equal(view.paid, 500);
assert.equal(view.balance, 7620);
assert.equal(view.buildBalance, 7620);
assert.equal(view.status, 'Partial');
assert.deepEqual(view.schedule.map((item) => [item.itemKey, item.amount, item.paidAmount, item.remaining]), [
  ['milestone:advance', 2436, 500, 1936],
  ['milestone:final', 5684, 0, 5684]
]);
assert.deepEqual(view.payments, [
  { itemKey: 'milestone:advance', amount: 500, date: '2026-06-15', method: 'card', note: 'Advance transfer' }
]);
assert.equal(view.paid + view.balance, view.buildTotal);

const fields = buildQuotePaymentFields('quote-doc-id', paidQuote, { on: '2026-06-15' });
assert.equal(fields.paid, 500);
assert.equal(fields.balance, 7620);
assert.equal(fields.paymentStatus, 'Partial');
assert.equal(fields.milestones.find((item) => item.key === 'advance').paidAmount, 500);

const migrated = buildQuotePaymentView('quote-doc-id', {
  ...exampleQuote,
  payments: [{ amount: 500, date: '2026-06-15', method: 'cash', note: 'Legacy deposit' }]
}, { on: '2026-06-15' });
assert.deepEqual(migrated.payments, [
  { itemKey: 'milestone:advance', amount: 500, date: '2026-06-15', method: 'cash', note: 'Legacy deposit' }
]);
assert.equal(migrated.schedule.find((item) => item.itemKey === 'milestone:advance').remaining, 1936);
assert.equal(migrated.paid + migrated.balance, migrated.buildTotal);

const finalPaid = applyPaymentToQuote('quote-doc-id', paidQuote, {
  itemKey: 'milestone:final',
  amount: 5684,
  date: '2026-06-20',
  method: 'Bank transfer',
  note: ''
});
const fullyPaid = buildQuotePaymentView('quote-doc-id', applyPaymentToQuote('quote-doc-id', finalPaid, {
  itemKey: 'milestone:advance',
  amount: 1936,
  date: '2026-06-20',
  method: 'Bank transfer',
  note: ''
}), { on: '2026-06-20' });
assert.equal(fullyPaid.status, 'Paid');
assert.equal(fullyPaid.buildBalance, 0);
assert.equal(fullyPaid.paid, fullyPaid.buildTotal);

assert.deepEqual(
  stripInternalPaymentFields({
    quoteNumber: 'Q-2026-015',
    payments: [{ itemKey: 'milestone:advance', amount: 100 }],
    paid: 100,
    balance: 8020,
    paymentStatus: 'Partial',
    lastPaymentAt: '2026-06-10',
    milestones: [],
    customer: { businessName: 'Test Client' }
  }),
  {
    quoteNumber: 'Q-2026-015',
    customer: { businessName: 'Test Client' }
  }
);

console.log('QUOTE PAYMENT HELPERS HOLD');
