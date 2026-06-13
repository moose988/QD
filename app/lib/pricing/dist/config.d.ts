import { FX } from './money.js';
export type ScopeTier = 'low' | 'mid' | 'high';
export type MarketTier = keyof typeof MARKET_TIERS;
export type PostureId = keyof typeof POSTURE;
export declare const INTERNAL_RATE_AED_PER_HOUR = 80;
export declare const MIN_GROSS_MARGIN = 0.3;
export declare const FLOOR_HARD_MIN = 0.2;
export declare const VAT_PERCENT = 5;
export declare const FOUNDING_MAX_DISCOUNT_PERCENT = 15;
export declare const APPROVAL: Readonly<{
    auto: 15;
    manager: 25;
}>;
export { FX };
export declare const MARKET_TIERS: Readonly<{
    sharjah: {
        factor: number;
        label: string;
    };
    dubai: {
        factor: number;
        label: string;
    };
    'abu-dhabi': {
        factor: number;
        label: string;
    };
}>;
export declare const DEFAULT_TIER: MarketTier;
export declare const POSTURE: Readonly<{
    launch: {
        tier: "sharjah";
        maxFoundingDiscount: number;
        attachCarePlan: true;
        defaultCarePlan: string;
        label: string;
    };
    standard: {
        tier: "dubai";
        maxFoundingDiscount: number;
        attachCarePlan: false;
        label: string;
    };
    premium: {
        tier: "dubai";
        maxFoundingDiscount: number;
        premiumUplift: number;
        attachCarePlan: false;
        label: string;
    };
}>;
export declare const DEFAULT_POSTURE: PostureId;
export declare const HOURS: Readonly<{
    'foundation-starter': Readonly<Record<ScopeTier, number>>;
    'foundation-essential': Readonly<Record<ScopeTier, number>>;
    'foundation-professional': Readonly<Record<ScopeTier, number>>;
    'foundation-premium': Readonly<Record<ScopeTier, number>>;
    'pages-standard': Readonly<Record<ScopeTier, number>>;
    'pages-landing': Readonly<Record<ScopeTier, number>>;
    'qd-commerce-start': Readonly<Record<ScopeTier, number>>;
    'qd-commerce-growth': Readonly<Record<ScopeTier, number>>;
    'qd-ops-dashboard': Readonly<Record<ScopeTier, number>>;
    'qd-ai-chatbot': Readonly<Record<ScopeTier, number>>;
    'smart-form': Readonly<Record<ScopeTier, number>>;
    'crm-setup': Readonly<Record<ScopeTier, number>>;
    'booking-integration': Readonly<Record<ScopeTier, number>>;
    'ordering-integration': Readonly<Record<ScopeTier, number>>;
    'payment-gateway': Readonly<Record<ScopeTier, number>>;
    'reviews-integration': Readonly<Record<ScopeTier, number>>;
    'loyalty-integration': Readonly<Record<ScopeTier, number>>;
    'ai-chatbot-upgrade': Readonly<Record<ScopeTier, number>>;
    'dashboard-pack': Readonly<Record<ScopeTier, number>>;
    'roles-logic': Readonly<Record<ScopeTier, number>>;
    'file-uploads': Readonly<Record<ScopeTier, number>>;
    'extra-language': Readonly<Record<ScopeTier, number>>;
    'gbp-setup': Readonly<Record<ScopeTier, number>>;
    'map-embed': Readonly<Record<ScopeTier, number>>;
    'api-map': Readonly<Record<ScopeTier, number>>;
    'seo-pack': Readonly<Record<ScopeTier, number>>;
}>;
export declare const DIRECT_COST_AED: Readonly<{}>;
