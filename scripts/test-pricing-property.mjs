import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  ADDONS,
  FOUNDATIONS,
  OFFER_TEMPLATES,
  price,
  POSTURE,
  MARKET_TIERS
} from '../app/lib/pricing-model.js';

const foundationIds = FOUNDATIONS.map((f) => f.id);
const addonIds = ADDONS.filter((a) => !['extra-page', 'extra-landing'].includes(a.id)).map((a) => a.id);
const postureIds = Object.keys(POSTURE);
const marketTierIds = Object.keys(MARKET_TIERS);
const restaurantModules = ['mod-order-status', 'mod-menu-mgmt', 'mod-driver-mgmt', 'mod-resto-loyalty'];

const addonArb = fc.record({
  id: fc.constantFrom(...addonIds),
  tier: fc.constantFrom('low', 'mid', 'high'),
  qty: fc.integer({ min: 1, max: 3 })
});

const selectionArb = fc.record({
  foundationId: fc.option(fc.constantFrom(...foundationIds), { nil: null }),
  pagesStandard: fc.integer({ min: 0, max: 30 }),
  pagesLanding: fc.integer({ min: 0, max: 6 }),
  specials: fc.uniqueArray(fc.constantFrom('qd-commerce-start', 'qd-commerce-growth', 'qd-ops-dashboard', 'qd-ai-chatbot'), { maxLength: 2 }),
  modules: fc.uniqueArray(fc.constantFrom(...restaurantModules), { maxLength: 3 }),
  addons: fc.uniqueArray(addonArb, { selector: (addon) => addon.id, maxLength: 5 }),
  carePlanId: fc.constantFrom('none', 'care-lite', 'care-growth', 'care-commerce', 'portal-ops', 'automation-desk'),
  posture: fc.constantFrom(...postureIds),
  marketTier: fc.option(fc.constantFrom(...marketTierIds), { nil: undefined }),
  riskPercent: fc.integer({ min: 0, max: 25 }),
  discountPercent: fc.integer({ min: 0, max: 100 }),
  promoPercent: fc.integer({ min: 0, max: 35 }),
  bundleDiscountPercent: fc.integer({ min: 0, max: 20 }),
  vatPercent: fc.integer({ min: 0, max: 20 })
}, { requiredKeys: ['foundationId', 'pagesStandard', 'pagesLanding', 'specials', 'modules', 'addons', 'carePlanId', 'posture', 'riskPercent', 'discountPercent', 'promoPercent', 'bundleDiscountPercent', 'vatPercent'] });

fc.assert(fc.property(selectionArb, (selection) => {
  const result = price(selection);
  assert.ok(result.net >= result.costFloorNet, 'net must not breach floor');
  assert.equal(result.listPrice + result.waterfall.reduce((sum, step) => sum + step.amount, 0), result.net);
  assert.equal(result.net + result.vat, result.grandTotal);
  assertMoneyIntegers(result);
}), { numRuns: 1000 });

fc.assert(fc.property(selectionArb, (selection) => {
  const first = price(selection);
  const second = price(selection);
  assert.equal(first.inputHash, second.inputHash);
  assert.deepEqual(first, second);
}), { numRuns: 1000 });

fc.assert(fc.property(selectionArb, (selection) => {
  const shuffled = {
    ...selection,
    modules: [...selection.modules].reverse(),
    addons: [...selection.addons].reverse()
  };
  const first = price(selection);
  const second = price(shuffled);
  assert.equal(first.listPrice, second.listPrice);
  assert.equal(first.net, second.net);
  assert.equal(first.grandTotal, second.grandTotal);
}), { numRuns: 1000 });

fc.assert(fc.property(fc.constantFrom(...OFFER_TEMPLATES), fc.integer({ min: 0, max: 100 }), (template, discountPercent) => {
  const result = price({ ...pickSelection(template), discountPercent, posture: 'launch' });
  const founding = result.waterfall.find((step) => step.step === 'founding');
  const applied = founding?.appliedPercent ?? 0;
  assert.ok(applied <= POSTURE.launch.maxFoundingDiscount);
}), { numRuns: 1000 });

fc.assert(fc.property(selectionArb, (selection) => {
  const withoutAddon = { ...selection, addons: [], modules: [], specials: [], discountPercent: 0, promoPercent: 0, bundleDiscountPercent: 0 };
  const withAddon = { ...withoutAddon, addons: [{ id: 'file-uploads', tier: 'low', qty: 1 }] };
  assert.ok(price(withAddon).net >= price(withoutAddon).net);
}), { numRuns: 1000 });

console.log('PROPERTY PRICING INVARIANTS HOLD');

function assertMoneyIntegers(result) {
  const moneyValues = [
    result.listPrice,
    result.subtotal,
    result.subtotalLow,
    result.subtotalMid,
    result.subtotalHigh,
    result.taxableSubtotal,
    result.net,
    result.discountedSubtotal,
    result.vat,
    result.grandTotal,
    result.deliveryCost,
    result.chargedCost,
    result.marginAmount,
    result.costFloorNet,
    result.hardCostFloorNet,
    result.discountAmount,
    result.discountRequested,
    result.discountApplied,
    result.monthly.amount,
    ...result.lines.flatMap((line) => [line.amount, line.unit, line.costFils].filter((value) => value !== undefined)),
    ...result.waterfall.flatMap((step) => [step.amount, step.requestedAmount]),
    ...result.passThrough.map((line) => line.aed)
  ];
  for (const value of moneyValues) assert.equal(Number.isInteger(value), true, `money value is not integer: ${value}`);
}

function pickSelection(input) {
  const keys = ['foundationId', 'pagesStandard', 'pagesLanding', 'specials', 'packageId', 'modules', 'addons', 'carePlanId', 'industryId'];
  return Object.fromEntries(keys.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
}
