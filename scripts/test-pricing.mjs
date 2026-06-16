// Pricing-engine invariants. Run with: npm run test:pricing
// These encode the commercial rules of the QD pricing system. If any check
// fails, the change being made is breaking a pricing guarantee — fix the
// change, not the test (unless the owner explicitly changed the pricing).

import fs from 'node:fs';

import {
  FOUNDATIONS, ADDONS, CARE_PLANS, INDUSTRY_MODULES, SOURCES,
  OFFER_TEMPLATES, INDUSTRY_PRESETS,
  PAGE_RATE_STANDARD, FOUNDING_MAX_DISCOUNT_PERCENT,
  PRICING_VERSION, MARKET_TIERS, POSTURE,
  getFoundation, getAddonPrice, getModulePrice, getPackage, getCarePlan,
  buildEstimate, buildIncludedMap, formatEstimateText, price, displayAED
} from '../app/lib/pricing-model.js';
import { parseBrief } from '../app/lib/brief-parser.js';
import { estimateToQuoteDraft } from '../app/lib/estimate-quote.js';
import { computeTotals } from '../app/lib/quote-totals.js';

let failures = 0;
const eq = (label, got, want) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    failures++; console.log(`FAIL ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  } else console.log(`ok   ${label}`);
};

// --- 1. Website base includes the first 5 pages; only overage is charged ---
eq('Website base exists in the foundation catalog', FOUNDATIONS.some((f) => f.id === 'web-base'), true);
eq('Website base includes 5 standard pages', getFoundation('web-base').includedStandardPages, 5);
const webFive = price({ foundationId: 'web-base', pagesStandard: 5, posture: 'standard', vatPercent: 0 });
const webSeven = price({ foundationId: 'web-base', pagesStandard: 7, posture: 'standard', vatPercent: 0 });
eq('web-base + 5 pages has no page overage line', webFive.lines.some((l) => l.id === 'pages-standard'), false);
eq('web-base + 7 pages charges 2 page overages', displayAED(webSeven.lines.find((l) => l.id === 'pages-standard')?.amount || 0, 'aed'), 2 * PAGE_RATE_STANDARD);
eq('Store anchors', [getPackage('qd-commerce-start').oneTime, getPackage('qd-commerce-growth').oneTime], [9900, 16900]);

// --- 2. No naked ranges: every ranged addon has 3 named levels with specs ---
const ranged = ADDONS.filter((a) => !a.fixed && a.low !== a.high);
eq('every ranged addon has 3 spec levels', ranged.every((a) => a.levels?.length === 3 && a.levels.every((l) => l.label && l.spec)), true);

// --- 3. Modules: lean (≤2 components), documented, proportionate ---
for (const g of INDUSTRY_MODULES) {
  for (const mod of g.modules) {
    const price = getModulePrice(mod.id);
    eq(`module ${mod.id} lean+documented+proportionate`,
      mod.components.length <= 2 && (mod.includes || []).length >= 2 && price >= 1000 && price <= 6000, true);
  }
}

// --- 4. Never double-charged: duplicates, module overlap, upgrade diffs ---
const dup = buildEstimate({ addons: [{ id: 'ai-chatbot-upgrade', tier: 'low' }, { id: 'ai-chatbot-upgrade', tier: 'low' }] });
eq('duplicate addon → single line', dup.lines.filter((l) => l.id === 'ai-chatbot-upgrade').length, 1);

const ov = buildEstimate({ modules: ['mod-order-status'], addons: [{ id: 'ordering-integration', tier: 'mid' }] });
eq('module-covered addon free', ov.lines.find((l) => l.kind === 'addon' && l.id === 'ordering-integration').amount, 0);

const gbpCovered = buildEstimate({ foundationId: 'web-base', addons: [{ id: 'gbp-setup', tier: 'low' }] });
eq('web-base includes Google Business Profile setup', gbpCovered.lines.find((l) => l.id === 'gbp-setup').amount, 0);

const st = buildEstimate({ specials: ['qd-commerce-growth'], addons: [{ id: 'loyalty-integration', tier: 'high' }] });
eq('fully-included addon free at any tier', st.lines.find((l) => l.id === 'loyalty-integration').amount, 0);

// --- 5. Discount: explicit line, hard cap, VAT after discount ---
const d = buildEstimate({ foundationId: 'web-base', pagesStandard: 5, discountPercent: 40 });
eq('discount capped', d.discountPercent, FOUNDING_MAX_DISCOUNT_PERCENT);
eq('discount is its own line', d.lines.some((l) => l.kind === 'discount'), true);
eq('VAT applies after discount', d.vat, Math.round(d.discountedSubtotal * 0.05));

// --- 6. UAE band: system-rich builds never compared to simple-site band ---
const rich = buildEstimate({ foundationId: 'web-base', pagesStandard: 5, modules: ['mod-order-status', 'mod-menu-mgmt'] });
eq('rich build not simple-site band', rich.uaeCheck.key !== 'simple-site', true);

// --- 7. Realistic offers land within verified UAE bands ---
const resto = buildEstimate({ foundationId: 'web-base', pagesStandard: 8, modules: ['mod-order-status', 'mod-menu-mgmt', 'mod-resto-loyalty'], carePlanId: 'care-growth' });
eq('restaurant offer within UAE band', resto.uaeCheck.status, 'within');

// --- 8. Parser: deterministic, warns instead of guessing ---
eq('AR store brief → growth store', parseBrief('متجر إلكتروني ١٢٠ منتج مع دفع إلكتروني').specials[0]?.id, 'qd-commerce-growth');
eq('"no website" negation respected', parseBrief('Internal system with admin panel, no website').specials[0]?.id, 'qd-ops-dashboard');
eq('vague brief warns, never guesses', parseBrief('something nice for my cousin').warnings.length > 0, true);

// --- 9. Output text is client-safe ---
const txt = formatEstimateText(resto, { businessName: 'Test Resto' });
eq('summary has total + UAE check', txt.includes('One-time total') && txt.includes('UAE market check'), true);

// --- 10. Source register integrity ---
eq('sources present with verified UAE entries', SOURCES.length >= 32 && SOURCES.filter((s) => s.verified).length >= 6, true);

// --- 11. Estimate → quote bridge preserves pricing invariants ---
const quoteEstimate = buildEstimate({
  foundationId: 'web-base',
  pagesStandard: 5,
  addons: [{ id: 'gbp-setup', tier: 'low' }],
  discountPercent: 10
});
const quoteDraft = estimateToQuoteDraft(quoteEstimate, { clientName: 'Bridge Test LLC' });
const quoteTotals = computeTotals(quoteDraft.lineItems, quoteDraft.vatPercent, quoteDraft.pages.price);
eq('estimate quote bridge keeps customer name', quoteDraft.customer.businessName, 'Bridge Test LLC');
eq('estimate quote bridge uses split client-safe lines', quoteDraft.lineItems.map((li) => li.catalogKey), ['website-build', 'sharjah-expansion-discount', 'third-party-software']);
eq('estimate quote bridge defaults monthly care separately', quoteDraft.careMonthly, 149);
eq('estimate quote bridge uses Arabic labels', quoteDraft.lineItems.some((li) => /البناء|البرامج|العناية/.test(li.name.ar)), true);
eq('estimate quote bridge shows client-safe discount only', quoteDraft.lineItems.filter((li) => li.unitPrice < 0).map((li) => li.catalogKey), ['sharjah-expansion-discount']);
eq('estimate quote bridge hides internal margin/floor/approval lines', quoteDraft.lineItems.some((li) => /margin|floor|approval|founding/i.test(li.name.en)), false);
eq('estimate quote bridge totals match estimate', quoteTotals.grandTotal, quoteEstimate.grandTotal);
eq('estimate quote bridge default terms are full 30/70 list', Array.isArray(quoteDraft.terms.en) && quoteDraft.terms.en.length, 8);

const orderingEstimate = buildEstimate({
  foundationId: 'web-base',
  pagesStandard: 5,
  industryId: 'restaurant-cafe',
  modules: ['mod-order-status'],
  discountPercent: 15
});
const orderingDraft = estimateToQuoteDraft(orderingEstimate);
eq('ordering estimate separates website and ordering sections', orderingDraft.lineItems.map((li) => li.catalogKey).slice(0, 3), ['website-build', 'online-ordering-system', 'sharjah-expansion-discount']);
eq('ordering estimate line totals reconcile', computeTotals(orderingDraft.lineItems, orderingDraft.vatPercent, orderingDraft.pages.price).grandTotal, orderingEstimate.grandTotal);

const coveredEstimate = buildEstimate({
  foundationId: 'web-base',
  addons: [{ id: 'gbp-setup', tier: 'low' }]
});
const coveredDraft = estimateToQuoteDraft(coveredEstimate);
eq('estimate quote bridge skips covered zero lines', coveredDraft.lineItems.some((li) => /Google Business Profile/.test(li.name.en)), false);

// --- 12. V2 engine: floor, waterfall, governance, market tier, compatibility ---
const floorCase = price({
  specials: ['qd-ops-dashboard'],
  addons: [
    { id: 'roles-logic', tier: 'high' },
    { id: 'dashboard-pack', tier: 'high' },
    { id: 'crm-setup', tier: 'high' }
  ],
  discountPercent: 100,
  promoPercent: 100,
  posture: 'standard'
});
eq('floor binds heavily discounted custom build', floorCase.floorBound && floorCase.net >= floorCase.costFloorNet, true);

const waterfallCase = price({
  foundationId: 'web-base',
  pagesStandard: 8,
  addons: [{ id: 'ai-chatbot-upgrade', tier: 'low' }],
  discountPercent: 10,
  posture: 'standard'
});
eq('waterfall reconciles list to net', waterfallCase.listPrice + waterfallCase.waterfall.reduce((sum, step) => sum + step.amount, 0), waterfallCase.net);
eq('VAT reconciles net to grand total', waterfallCase.net + waterfallCase.vat, waterfallCase.grandTotal);

const passThroughCase = price({ specials: ['qd-ai-chatbot'], carePlanId: 'automation-desk', posture: 'standard' });
eq('pass-through stays outside taxable subtotal', passThroughCase.passThrough.length > 0 && passThroughCase.taxableSubtotal === passThroughCase.net, true);

const overlapCase = price({
  foundationId: 'web-base',
  pagesStandard: 12,
  modules: ['mod-order-status', 'mod-menu-mgmt', 'mod-resto-loyalty'],
  addons: [{ id: 'dashboard-pack', tier: 'high' }],
  posture: 'standard'
});
eq('margin uses delivery cost', overlapCase.marginAmount, overlapCase.net - overlapCase.deliveryCost);

eq('approval 10 percent auto', price({ foundationId: 'web-base', pagesStandard: 8, promoPercent: 10, posture: 'standard', marketTier: 'dubai' }).approval, 'auto');
eq('approval 20 percent manager', price({ foundationId: 'web-base', pagesStandard: 8, promoPercent: 20, posture: 'standard', marketTier: 'dubai' }).approval, 'manager');
eq('approval 30 percent owner', price({ foundationId: 'web-base', pagesStandard: 8, promoPercent: 30, posture: 'standard', marketTier: 'dubai' }).approval, 'owner');

const shj = price({ foundationId: 'web-base', pagesStandard: 8, marketTier: 'sharjah', posture: 'standard' });
const dubai = price({ foundationId: 'web-base', pagesStandard: 8, marketTier: 'dubai', posture: 'standard' });
eq('Sharjah tier below Dubai', shj.net < dubai.net, true);
eq('Sharjah tier factor applied once', shj.net, Math.round(dubai.listPrice * 0.7));

const valueFloorCase = price({ foundationId: 'web-base', pagesStandard: 5, marketTier: 'dubai', posture: 'standard', bundleDiscountPercent: 50, vatPercent: 0 });
eq('value floor caps a 50% discount at 55% realization', displayAED(valueFloorCase.net, 'aed'), Math.round(displayAED(valueFloorCase.listPrice, 'aed') * 0.55));
eq('value floor emits floor flag', valueFloorCase.flags.includes('floor_bound'), true);

// --- 13. V2.1 Sharjah launch tuning and VAT-off launch behavior ---
eq('pricing version bumped for v3', PRICING_VERSION, '2026-06-14');
eq('Sharjah launch factor is 0.70', MARKET_TIERS.sharjah.factor, 0.70);
eq('launch posture defaults to Care Basic', POSTURE.launch.defaultCarePlan, 'care-basic');
eq('Care Basic monthly plan exists', [getCarePlan('care-basic')?.monthly, getCarePlan('care-basic')?.refs?.includes('R26')], [149, true]);
eq('Website base exists', [getFoundation('web-base')?.base, buildIncludedMap({ foundationId: 'web-base' }).get('gbp-setup')], [3650, getAddonPrice('gbp-setup', 'low')]);

const launchFivePage = price({ foundationId: 'web-base', pagesStandard: 5, posture: 'launch', vatPercent: 0 });
eq('5-page launch website is about AED 2,555 before VAT', displayAED(launchFivePage.net, 'aed'), 2555);
eq('5-page launch defaults to Care Basic monthly', [launchFivePage.monthly.planId, displayAED(launchFivePage.monthly.amount, 'aed')], ['care-basic', 149]);
eq('VAT off produces no VAT or gross-up', [launchFivePage.vatPercent, launchFivePage.vat, launchFivePage.grandTotal], [0, 0, launchFivePage.net]);
eq('5-page launch site keeps Dubai market anchor', displayAED(launchFivePage.listPrice, 'aed'), 3650);
const launchFivePageVat = price({ foundationId: 'web-base', pagesStandard: 5, posture: 'launch', vatPercent: 5 });
eq('VAT toggle adds exactly 5 percent on net', launchFivePageVat.vat, Math.round(launchFivePageVat.net * 0.05));

// --- 14. Browser estimator wiring stays on launch posture with client-safe framing ---
const adminSource = fs.readFileSync(new URL('../admin.js', import.meta.url), 'utf8');
const pricingSchemaSource = fs.readFileSync(new URL('../app/lib/pricing/dist/schema.js', import.meta.url), 'utf8');
eq('admin imports live price API', /import\s*\{[\s\S]*\bprice\b[\s\S]*\}\s*from\s*'\/app\/lib\/pricing-model\.js'/.test(adminSource), true);
eq('admin estimator calls launch pricing helper with VAT toggle', adminSource.includes('getPricingLaunchSelection()') && adminSource.includes('vatPercent: p.vatOn ? 5 : 0'), true);
eq('admin estimator has VAT-off toggle copy', adminSource.includes('Add 5% VAT (if VAT-registered)'), true);
eq('admin estimator shows Sharjah anchor language', adminSource.includes('Market rate (Dubai)') && adminSource.includes('Your Sharjah launch price'), true);
eq('admin estimator has no package tier cards', !adminSource.includes('pricing-set-foundation') && !adminSource.includes('qd-pricing-foundations'), true);
eq('admin estimator has flat spec list', adminSource.includes('PRICING_SPEC_LIST') && adminSource.includes('What do you need?'), true);
eq('browser pricing model avoids bare zod import', /from\s+['"]zod['"]/.test(pricingSchemaSource), false);

const legacyTemplateGrandTotals = {
  'tpl-starter-presence': 5408,
  'tpl-site-chatbot': 7665,
  'tpl-full-business': 13335,
  'tpl-commerce-complete': 22365,
  'tpl-premium-custom': 20790
};
for (const tpl of OFFER_TEMPLATES) {
  eq(`legacy template ${tpl.id} grand total`, buildEstimate(tpl).grandTotal, legacyTemplateGrandTotals[tpl.id]);
}

const legacyPresetGrandTotals = {
  'clinic-salon': 18008,
  'restaurant-cafe': 17588,
  'real-estate': 22890,
  'services-contractor': 14175,
  'education-training': 18533
};
for (const preset of INDUSTRY_PRESETS) {
  const estimate = buildEstimate({
    packageId: preset.packageId,
    addons: preset.addonIds.map((id) => ({ id, tier: 'low' })),
    carePlanId: preset.carePlanId,
    industryId: preset.id
  });
  eq(`legacy preset ${preset.id} grand total`, estimate.grandTotal, legacyPresetGrandTotals[preset.id]);
}

console.log(failures === 0 ? '\nALL PRICING INVARIANTS HOLD' : `\n${failures} INVARIANT VIOLATIONS`);
process.exit(failures ? 1 : 0);
