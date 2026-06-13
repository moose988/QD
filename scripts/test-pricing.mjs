// Pricing-engine invariants. Run with: npm run test:pricing
// These encode the commercial rules of the QD pricing system. If any check
// fails, the change being made is breaking a pricing guarantee — fix the
// change, not the test (unless the owner explicitly changed the pricing).

import {
  FOUNDATIONS, ADDONS, CARE_PLANS, INDUSTRY_MODULES, SOURCES,
  OFFER_TEMPLATES, INDUSTRY_PRESETS,
  PAGE_RATE_STANDARD, FOUNDING_MAX_DISCOUNT_PERCENT,
  getFoundation, getAddonPrice, getModulePrice, getPackage,
  buildEstimate, buildIncludedMap, formatEstimateText, price
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

// --- 1. Market anchors must reproduce exactly (UAE-verified, do not drift) ---
eq('Essential + 5 pages = Launch anchor 5,900', getFoundation('foundation-essential').base + 5 * PAGE_RATE_STANDARD, 5900);
eq('Professional + 10 pages = Growth anchor 9,900', getFoundation('foundation-professional').base + 10 * PAGE_RATE_STANDARD, 9900);
eq('Premium + 16 pages = Business Pro anchor 14,900', getFoundation('foundation-premium').base + 16 * PAGE_RATE_STANDARD, 14900);
eq('Store anchors', [getPackage('qd-commerce-start').oneTime, getPackage('qd-commerce-growth').oneTime], [12900, 21900]);

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

const up = buildEstimate({ foundationId: 'foundation-premium', addons: [{ id: 'dashboard-pack', tier: 'high' }] });
eq('basic-in-base → upgrade diff only', up.lines.find((l) => l.id === 'dashboard-pack').amount, getAddonPrice('dashboard-pack', 'high') - getAddonPrice('dashboard-pack', 'low'));

const st = buildEstimate({ specials: ['qd-commerce-growth'], addons: [{ id: 'loyalty-integration', tier: 'high' }] });
eq('fully-included addon free at any tier', st.lines.find((l) => l.id === 'loyalty-integration').amount, 0);

// --- 5. Discount: explicit line, hard cap, VAT after discount ---
const d = buildEstimate({ foundationId: 'foundation-essential', pagesStandard: 4, discountPercent: 40 });
eq('discount capped', d.discountPercent, FOUNDING_MAX_DISCOUNT_PERCENT);
eq('discount is its own line', d.lines.some((l) => l.kind === 'discount'), true);
eq('VAT applies after discount', d.vat, Math.round(d.discountedSubtotal * 0.05));

// --- 6. UAE band: system-rich builds never compared to simple-site band ---
const rich = buildEstimate({ foundationId: 'foundation-essential', pagesStandard: 5, modules: ['mod-order-status', 'mod-menu-mgmt'] });
eq('rich build not simple-site band', rich.uaeCheck.key !== 'simple-site', true);

// --- 7. Realistic offers land within verified UAE bands ---
const resto = buildEstimate({ foundationId: 'foundation-professional', pagesStandard: 8, modules: ['mod-order-status', 'mod-menu-mgmt', 'mod-resto-loyalty'], carePlanId: 'care-growth' });
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
  foundationId: 'foundation-essential',
  pagesStandard: 5,
  addons: [{ id: 'gbp-setup', tier: 'low' }],
  discountPercent: 10
});
const quoteDraft = estimateToQuoteDraft(quoteEstimate, { clientName: 'Bridge Test LLC' });
const quoteTotals = computeTotals(quoteDraft.lineItems, quoteDraft.vatPercent, quoteDraft.pages.price);
eq('estimate quote bridge keeps customer name', quoteDraft.customer.businessName, 'Bridge Test LLC');
eq('estimate quote bridge uses Arabic labels', quoteDraft.lineItems.some((li) => /خصم|صفحات|إعداد/.test(li.name.ar)), true);
eq('estimate quote bridge includes negative discount line', quoteDraft.lineItems.some((li) => li.unitPrice < 0 && /discount/i.test(li.name.en)), true);
eq('estimate quote bridge totals match estimate', quoteTotals.grandTotal, quoteEstimate.grandTotal);

const coveredEstimate = buildEstimate({
  foundationId: 'foundation-premium',
  addons: [{ id: 'dashboard-pack', tier: 'low' }]
});
const coveredDraft = estimateToQuoteDraft(coveredEstimate);
eq('estimate quote bridge skips covered zero lines', coveredDraft.lineItems.some((li) => /Analytics/.test(li.name.en)), false);

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
  foundationId: 'foundation-professional',
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
  foundationId: 'foundation-premium',
  pagesStandard: 12,
  modules: ['mod-order-status', 'mod-menu-mgmt', 'mod-resto-loyalty'],
  addons: [{ id: 'dashboard-pack', tier: 'high' }],
  posture: 'standard'
});
eq('margin uses delivery cost', overlapCase.marginAmount, overlapCase.net - overlapCase.deliveryCost);

eq('approval 10 percent auto', price({ foundationId: 'foundation-professional', pagesStandard: 8, promoPercent: 10, posture: 'launch' }).approval, 'auto');
eq('approval 20 percent manager', price({ foundationId: 'foundation-professional', pagesStandard: 8, promoPercent: 20, posture: 'launch' }).approval, 'manager');
eq('approval 30 percent owner', price({ foundationId: 'foundation-professional', pagesStandard: 8, promoPercent: 30, posture: 'launch' }).approval, 'owner');

const shj = price({ foundationId: 'foundation-professional', pagesStandard: 8, marketTier: 'sharjah', posture: 'standard' });
const dubai = price({ foundationId: 'foundation-professional', pagesStandard: 8, marketTier: 'dubai', posture: 'standard' });
eq('Sharjah tier below Dubai', shj.net < dubai.net, true);
eq('Sharjah tier factor applied once', shj.net, Math.round(dubai.listPrice * 0.9));

const legacyTemplateGrandTotals = {
  'tpl-starter-presence': 7770,
  'tpl-site-chatbot': 12915,
  'tpl-full-business': 19635,
  'tpl-commerce-complete': 27615,
  'tpl-premium-custom': 24990
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
