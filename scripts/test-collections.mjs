import assert from 'node:assert/strict';

import {
  applyPaymentToQuote,
  buildDefaultMilestones,
  buildQuotePaymentView
} from '../api/_lib/quote-payments.js';
import {
  buildCollectionsSummary,
  buildQuoteCollectionPatch,
  clampBillingDay,
  monthKeyFromDate
} from '../api/_lib/collections.js';

assert.equal(clampBillingDay(31, 2026, 0), 31);
assert.equal(clampBillingDay(31, 2026, 1), 28);
assert.equal(clampBillingDay(31, 2028, 1), 29);
assert.equal(monthKeyFromDate('2026-08-07'), '2026-08');

const quote = {
  id: 'quote-a',
  quoteNumber: 'Q-2026-010',
  status: 'accepted',
  customer: { businessName: 'Sea Land' },
  lineItems: [{ qty: 1, unitPrice: 8120 }],
  pages: { price: 0 },
  vatPercent: 0,
  goLiveDate: '2026-06-07',
  billingDay: 7,
  careMonthly: 149,
  milestones: buildDefaultMilestones(8120)
};

assert.deepEqual(quote.milestones.map((milestone) => [milestone.key, milestone.amount, milestone.paidAmount]), [
  ['advance', 2436, 0],
  ['final', 5684, 0]
]);

const partlyPaid = applyPaymentToQuote('quote-a', quote, {
  itemKey: 'milestone:advance',
  amount: 500,
  date: '2026-08-07',
  method: 'Bank transfer',
  note: 'Advance part'
});
const view = buildQuotePaymentView('quote-a', partlyPaid, { on: '2026-08-07' });
assert.equal(view.paid, 500);
assert.equal(view.buildBalance, 7620);
assert.equal(view.schedule.find((item) => item.itemKey === 'milestone:advance').remaining, 1936);
assert.equal(view.paid + view.buildBalance, view.buildTotal);

const summary = buildCollectionsSummary([{ id: quote.id, ...partlyPaid }], '2026-08-07');
assert.equal(summary.buckets.overdue.items.some((item) => item.amount > item.outstanding), false);
assert.equal(summary.buckets.dueToday.items.find((item) => item.itemKey === 'milestone:advance').amount, 1936);
assert.equal(summary.buckets.dueToday.items.find((item) => item.itemKey === 'milestone:advance').remaining, 1936);
assert.equal(summary.buckets.dueToday.items.find((item) => item.itemKey === 'milestone:advance').dueDate, '2026-08-07');
assert.equal(summary.buckets.overdue.items.find((item) => item.itemKey === 'milestone:final').amount, 5684);
assert.equal(summary.buckets.overdue.items.find((item) => item.itemKey === 'care:2026-06').amount, 149);
assert.equal(summary.buckets.overdue.items.find((item) => item.itemKey === 'care:2026-07').amount, 149);
assert.equal(summary.buckets.dueToday.items.every((item) => item.amount <= item.outstanding), true);

const carePatch = buildQuoteCollectionPatch(quote, {
  itemKey: 'care:2026-08',
  amount: 149,
  collectedOn: '2026-08-07',
  method: 'Bank transfer'
});
assert.equal(carePatch.payment.itemKey, 'care:2026-08');
assert.equal(carePatch.payment.amount, 149);
assert.equal(carePatch.payment.note, 'Care 2026-08');

const milestonePatch = buildQuoteCollectionPatch(quote, {
  itemKey: 'milestone:advance',
  amount: 2436,
  collectedOn: '2026-08-07',
  method: 'Cash'
});
assert.equal(milestonePatch.payment.itemKey, 'milestone:advance');
assert.equal(milestonePatch.payment.amount, 2436);
assert.equal(milestonePatch.payment.note, 'Advance 30%');

const firstMonthFree = buildQuotePaymentView('quote-free', {
  ...quote,
  firstMonthFree: true
}, { on: '2026-07-07' });
const firstCare = firstMonthFree.schedule.find((item) => item.itemKey === 'care:2026-06');
const secondCare = firstMonthFree.schedule.find((item) => item.itemKey === 'care:2026-07');
assert.equal(firstCare.state, 'waived');
assert.equal(firstCare.amount, 0);
assert.equal(firstCare.remaining, 0);
assert.equal(secondCare.amount, 149);

const waivedQuote = {
  ...quote,
  careWaived: ['2026-07']
};
const waivedView = buildQuotePaymentView('quote-waived', waivedQuote, { on: '2026-07-07' });
assert.equal(waivedView.schedule.find((item) => item.itemKey === 'care:2026-07').state, 'waived');
const waivedSummary = buildCollectionsSummary([{ id: 'quote-waived', ...waivedQuote }], '2026-07-07');
assert.equal(waivedSummary.buckets.dueToday.items.some((item) => item.itemKey === 'care:2026-07'), false);

const unwaivedQuote = {
  ...waivedQuote,
  careWaived: []
};
const unwaivedSummary = buildCollectionsSummary([{ id: 'quote-unwaived', ...unwaivedQuote }], '2026-07-07');
assert.equal(unwaivedSummary.buckets.dueToday.items.find((item) => item.itemKey === 'care:2026-07').amount, 149);

console.log('COLLECTION HELPERS HOLD');
