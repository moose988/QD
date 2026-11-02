import assert from 'node:assert/strict';
import { resolveQuoteCareForEditing, NO_CARE_PLAN_NAME } from '../app/lib/quote-care.js';
import { normalizeQuoteForTemplate } from '../app/lib/quote-template.js';

const lineItems = [
  { catalogKey: 'qd-build', name: { en: 'Build' }, qty: 1, unitPrice: 9900 },
  { catalogKey: 'nfc_table_tags', name: { en: 'NFC table tags' }, qty: 1, unitPrice: 0 }
];

// No care field at all: stays "No monthly plan" at AED 0 (was Care Basic 149).
assert.deepEqual(resolveQuoteCareForEditing({ lineItems }), { careMonthly: 0, carePlanName: NO_CARE_PLAN_NAME });
assert.deepEqual(resolveQuoteCareForEditing({ lineItems, careMonthly: null, carePlanName: '' }), { careMonthly: 0, carePlanName: NO_CARE_PLAN_NAME });
// Explicit zero (e.g. estimate with no plan) is respected.
assert.deepEqual(resolveQuoteCareForEditing({ lineItems, careMonthly: 0, carePlanName: 'Care Basic' }), { careMonthly: 0, carePlanName: NO_CARE_PLAN_NAME });

// Creation defaults are kept exactly.
assert.deepEqual(resolveQuoteCareForEditing({ lineItems, careMonthly: 149, carePlanName: 'Care Basic' }), { careMonthly: 149, carePlanName: 'Care Basic' });
assert.deepEqual(resolveQuoteCareForEditing({ lineItems, careMonthly: 249, carePlanName: 'Care Lite' }), { careMonthly: 249, carePlanName: 'Care Lite' });
assert.deepEqual(resolveQuoteCareForEditing({ lineItems, careMonthly: '599' }), { careMonthly: 599, carePlanName: 'Care Basic' });
// Older quotes: estimate snapshot or legacy monthly-care line still win.
assert.deepEqual(resolveQuoteCareForEditing({ lineItems, estimateSnapshot: { monthly: { amount: 599, planName: 'Care Growth' } } }), { careMonthly: 599, carePlanName: 'Care Growth' });
assert.deepEqual(resolveQuoteCareForEditing({ lineItems: [...lineItems, { catalogKey: 'monthly-care', name: { en: 'Care Lite' }, qty: 1, unitPrice: 249 }] }), { careMonthly: 249, carePlanName: 'Care Lite' });

// Totals and the 30/70 schedule never depend on the care plan.
const base = { lineItems, vatInclusive: true, vatPercent: 0, pages: { price: 0 } };
const withPlan = normalizeQuoteForTemplate({ ...base, careMonthly: 149, carePlanName: 'Care Basic' });
const withoutPlan = normalizeQuoteForTemplate({ ...base, ...resolveQuoteCareForEditing(base) });
assert.equal(withPlan.totals.grandTotal, 9900);
assert.deepEqual(withoutPlan.totals, withPlan.totals);
assert.deepEqual(withoutPlan.paymentSchedule, withPlan.paymentSchedule);
assert.deepEqual(withPlan.paymentSchedule.map((item) => item.amount), [2970, 6930]);
assert.equal(withPlan.careMonthly, 149);
assert.equal(withoutPlan.careMonthly, 0);

const vatQuote = normalizeQuoteForTemplate({ ...base, vatInclusive: false, vatPercent: 5, careMonthly: 249, carePlanName: 'Care Lite' });
assert.equal(vatQuote.totals.vat, 495);
assert.equal(vatQuote.totals.grandTotal, 10395);

console.log('QUOTE CARE DEFAULTS HOLD');
