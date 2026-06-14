import { FX } from './money.js';

export type ScopeTier = 'low' | 'mid' | 'high';
export type MarketTier = keyof typeof MARKET_TIERS;
export type PostureId = keyof typeof POSTURE;

export const INTERNAL_RATE_AED_PER_HOUR = 80; // ASSUMPTION: Sharjah lean team cost/hr, not billing. Tune.
export const MIN_GROSS_MARGIN = 0.30; // ASSUMPTION: normal target floor margin. Tune.
export const FLOOR_HARD_MIN = 0.20; // ASSUMPTION: absolute hard minimum margin. Tune.
export const MIN_REALIZATION = 0.55; // never realize below 55% of Dubai-anchored list value.
export const VAT_PERCENT = 5;
export const FOUNDING_MAX_DISCOUNT_PERCENT = 15;
export const APPROVAL = Object.freeze({ auto: 15, manager: 25 });
export { FX };

export const MARKET_TIERS = Object.freeze({
  sharjah: { factor: 0.70, label: 'Sharjah / Northern Emirates launch price' },
  dubai: { factor: 1.00, label: 'Dubai market rate' },
  'abu-dhabi': { factor: 1.00, label: 'Abu Dhabi market rate' }
});

export const DEFAULT_TIER: MarketTier = 'sharjah';

export const POSTURE = Object.freeze({
  launch: {
    tier: 'sharjah',
    maxFoundingDiscount: 15,
    attachCarePlan: true,
    defaultCarePlan: 'care-basic',
    label: 'Launch / land-clients'
  },
  standard: {
    tier: 'dubai',
    maxFoundingDiscount: 10,
    attachCarePlan: false,
    label: 'Standard'
  },
  premium: {
    tier: 'dubai',
    maxFoundingDiscount: 5,
    premiumUplift: 0.10,
    attachCarePlan: false,
    label: 'Premium'
  }
} satisfies Record<string, {
  readonly tier: MarketTier;
  readonly maxFoundingDiscount: number;
  readonly attachCarePlan: boolean;
  readonly label: string;
  readonly defaultCarePlan?: string;
  readonly premiumUplift?: number;
}>);

export const DEFAULT_POSTURE: PostureId = 'launch';

type Hours = Readonly<Record<ScopeTier, number>>;

const fixed = (hours: number): Hours => Object.freeze({ low: hours, mid: hours, high: hours });
const ranged = (low: number, mid: number, high: number): Hours => Object.freeze({ low, mid, high });

export const HOURS = Object.freeze({
  'web-base': fixed(0),
  'foundation-starter': ranged(8, 10, 14),
  'foundation-essential': ranged(16, 18, 22),
  'foundation-professional': ranged(26, 30, 36),
  'foundation-premium': ranged(44, 50, 60),
  'pages-standard': fixed(1.5),
  'pages-landing': fixed(4),
  'qd-commerce-start': ranged(70, 90, 110),
  'qd-commerce-growth': ranged(120, 150, 185),
  'qd-ops-dashboard': ranged(120, 150, 190),
  'qd-ai-chatbot': ranged(14, 20, 30),
  'smart-form': ranged(6, 12, 20),
  'crm-setup': ranged(10, 18, 28),
  'booking-integration': ranged(8, 16, 26),
  'ordering-integration': ranged(14, 24, 38),
  'payment-gateway': fixed(8),
  'reviews-integration': ranged(4, 8, 12),
  'loyalty-integration': ranged(8, 16, 26),
  'ai-chatbot-upgrade': ranged(10, 20, 34),
  'dashboard-pack': ranged(12, 22, 36),
  'roles-logic': ranged(20, 36, 58),
  'file-uploads': ranged(6, 12, 20),
  'extra-language': fixed(12),
  'gbp-setup': fixed(5),
  'map-embed': fixed(5),
  'api-map': fixed(18),
  'seo-pack': fixed(12)
} satisfies Readonly<Record<string, Hours>>);

export const DIRECT_COST_AED = Object.freeze({} satisfies Readonly<Record<string, number>>);
