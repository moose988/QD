import assert from 'node:assert/strict';

import {
  buildCollectionsSummary,
  buildDefaultMilestones,
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
  lineItems: [{ qty: 1, unitPrice: 1000 }],
  pages: { price: 0 },
  vatPercent: 0,
  goLiveDate: '2026-06-07',
  billingDay: 7,
  careMonthly: 149,
  careCollected: ['2026-06'],
  milestones: buildDefaultMilestones(1000)
};

assert.deepEqual(quote.milestones.map((milestone) => [milestone.key, milestone.amount]), [
  ['advance', 300],
  ['final', 700]
]);

const summary = buildCollectionsSummary([{ id: quote.id, ...quote }], '2026-08-07');
assert.equal(summary.count, 4);
assert.equal(summary.buckets.overdue.total, 849);
assert.equal(summary.buckets.dueToday.total, 449);
assert.equal(summary.buckets.upcoming.total, 0);
assert.deepEqual(
  summary.buckets.overdue.items.map((item) => [item.type, item.dueDate, item.amount]),
  [
    ['70% completion', '2026-06-07', 700],
    ['Monthly care', '2026-07-07', 149]
  ]
);
assert.deepEqual(
  summary.buckets.dueToday.items.map((item) => [item.type, item.dueDate, item.amount]),
  [['30% advance', '2026-08-07', 300], ['Monthly care', '2026-08-07', 149]]
);

const carePatch = buildQuoteCollectionPatch(quote, {
  type: 'care',
  monthKey: '2026-08',
  collectedOn: '2026-08-07',
  method: 'Bank transfer'
});
assert.deepEqual(carePatch.careCollected, ['2026-06', '2026-08']);
assert.equal(carePatch.payment.amount, 149);
assert.equal(carePatch.payment.note, 'Care 2026-08');
assert.throws(
  () => buildQuoteCollectionPatch(quote, { type: 'care', monthKey: '2026-06' }),
  /already collected/
);

const milestonePatch = buildQuoteCollectionPatch(quote, {
  type: 'milestone',
  milestoneKey: 'advance',
  collectedOn: '2026-08-07',
  method: 'Cash'
});
assert.equal(milestonePatch.payment.amount, 300);
assert.equal(milestonePatch.payment.note, '30% advance');
assert.equal(milestonePatch.milestones.find((milestone) => milestone.key === 'advance').status, 'collected');
assert.throws(
  () => buildQuoteCollectionPatch({ ...quote, milestones: milestonePatch.milestones }, { type: 'milestone', milestoneKey: 'advance' }),
  /already collected/
);

console.log('COLLECTION HELPERS HOLD');
