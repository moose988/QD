import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  INDUSTRY_PRESETS,
  OFFER_TEMPLATES,
  price
} from '../app/lib/pricing-model.js';

const GOLDEN_PATH = new URL('./pricing-golden.json', import.meta.url);

const cases = [
  ...OFFER_TEMPLATES.map((template) => ({
    id: `template:${template.id}`,
    input: pickSelection(template)
  })),
  ...INDUSTRY_PRESETS.map((preset) => ({
    id: `preset:${preset.id}`,
    input: {
      packageId: preset.packageId,
      addons: preset.addonIds.map((id) => ({ id, tier: 'low', qty: 1 })),
      carePlanId: preset.carePlanId,
      industryId: preset.id,
      posture: 'standard'
    }
  })),
  {
    id: 'edge:max-founding-essential',
    input: { foundationId: 'foundation-essential', pagesStandard: 5, discountPercent: 15, posture: 'standard' }
  },
  {
    id: 'edge:starter-launch-vat-off',
    input: { foundationId: 'foundation-starter', posture: 'launch', vatPercent: 0 }
  },
  {
    id: 'edge:essential-launch-vat-off',
    input: { foundationId: 'foundation-essential', pagesStandard: 5, posture: 'launch', vatPercent: 0 }
  },
  {
    id: 'edge:essential-launch-vat-on',
    input: { foundationId: 'foundation-essential', pagesStandard: 5, posture: 'launch', vatPercent: 5 }
  },
  {
    id: 'edge:floor-binding-ops-40',
    input: {
      specials: ['qd-ops-dashboard'],
      addons: [
        { id: 'roles-logic', tier: 'high', qty: 1 },
        { id: 'dashboard-pack', tier: 'high', qty: 1 },
        { id: 'crm-setup', tier: 'high', qty: 1 }
      ],
      discountPercent: 40,
      promoPercent: 40,
      posture: 'standard'
    }
  },
  {
    id: 'edge:premium-dashboard-upgrade',
    input: { foundationId: 'foundation-premium', addons: [{ id: 'dashboard-pack', tier: 'high', qty: 1 }], posture: 'standard' }
  },
  {
    id: 'edge:commerce-growth-loyalty-included',
    input: { specials: ['qd-commerce-growth'], addons: [{ id: 'loyalty-integration', tier: 'high', qty: 1 }], posture: 'standard' }
  },
  {
    id: 'edge:sharjah-tier',
    input: { foundationId: 'foundation-professional', pagesStandard: 8, marketTier: 'sharjah', posture: 'standard' }
  },
  {
    id: 'edge:dubai-tier',
    input: { foundationId: 'foundation-professional', pagesStandard: 8, marketTier: 'dubai', posture: 'standard' }
  },
  {
    id: 'edge:ai-chatbot-pass-through',
    input: { specials: ['qd-ai-chatbot'], carePlanId: 'automation-desk', posture: 'standard' }
  }
];

const actual = Object.fromEntries(cases.map((testCase) => [testCase.id, price(testCase.input)]));
const serialized = `${JSON.stringify(actual, null, 2)}\n`;

if (!fs.existsSync(GOLDEN_PATH)) {
  fs.writeFileSync(GOLDEN_PATH, serialized);
  console.log(`WROTE initial pricing golden snapshots: ${GOLDEN_PATH.pathname}`);
  process.exit(0);
}

const expected = fs.readFileSync(GOLDEN_PATH, 'utf8');
try {
  assert.equal(serialized, expected);
  console.log('PRICING GOLDEN SNAPSHOTS HOLD');
} catch (error) {
  fs.writeFileSync(new URL('./pricing-golden.actual.json', import.meta.url), serialized);
  console.error('Pricing golden drift detected. See scripts/pricing-golden.actual.json for the current output.');
  throw error;
}

function pickSelection(input) {
  const keys = ['foundationId', 'pagesStandard', 'pagesLanding', 'specials', 'packageId', 'modules', 'addons', 'carePlanId', 'industryId'];
  return {
    ...Object.fromEntries(keys.filter((key) => input[key] !== undefined).map((key) => [key, input[key]])),
    posture: 'standard'
  };
}
