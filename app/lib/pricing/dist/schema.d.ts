import { type MarketTier, type PostureId, type ScopeTier } from './config.js';
interface ParsedPricingInput {
    readonly foundationId: string | null;
    readonly pagesStandard: number;
    readonly pagesLanding: number;
    readonly specials: readonly string[];
    readonly packageId: string | null;
    readonly modules: readonly string[];
    readonly addons: readonly AddonSelection[];
    readonly carePlanId: string;
    readonly industryId: string | null;
    readonly posture: PostureId;
    readonly marketTier?: MarketTier;
    readonly riskPercent: number;
    readonly discountPercent: number;
    readonly promoPercent: number;
    readonly bundleDiscountPercent: number;
    readonly clientValueAnnualAED?: number;
    readonly ownerOverride: boolean;
    readonly vatPercent: number;
}
interface PricingIssue {
    readonly path: readonly (string | number)[];
    readonly message: string;
}
type SafeParseResult = {
    readonly success: true;
    readonly data: ParsedPricingInput;
} | {
    readonly success: false;
    readonly error: {
        readonly issues: readonly PricingIssue[];
    };
};
export declare const PricingInputSchema: Readonly<{
    shape: Readonly<Record<"foundationId" | "pagesStandard" | "pagesLanding" | "specials" | "packageId" | "modules" | "addons" | "carePlanId" | "industryId" | "posture" | "marketTier" | "riskPercent" | "discountPercent" | "promoPercent" | "bundleDiscountPercent" | "clientValueAnnualAED" | "ownerOverride" | "vatPercent", true>>;
    safeParse(input: unknown): SafeParseResult;
}>;
export interface AddonSelection {
    readonly id: string;
    readonly tier: ScopeTier;
    readonly qty: number;
}
export interface Selection {
    readonly foundationId: string | null;
    readonly pagesStandard: number;
    readonly pagesLanding: number;
    readonly specials: readonly string[];
    readonly packageId: string | null;
    readonly modules: readonly string[];
    readonly addons: readonly AddonSelection[];
    readonly carePlanId: string;
    readonly industryId: string | null;
    readonly posture: PostureId;
    readonly marketTier: MarketTier | null;
    readonly maxFoundingDiscount: number;
    readonly riskPercent: number;
    readonly discountPercent: number;
    readonly promoPercent: number;
    readonly bundleDiscountPercent: number;
    readonly clientValueAnnualAED?: number;
    readonly ownerOverride: boolean;
    readonly vatPercent: number;
    readonly legacyCompat: boolean;
}
export interface NormalizeOptions {
    readonly legacyCompat?: boolean;
}
export declare class PricingError extends Error {
    readonly field: string;
    constructor(field: string, message: string);
}
export declare function normalize(input?: unknown, options?: NormalizeOptions): Selection;
export declare function pickPricingInput(input?: Record<string, unknown>): Record<string, unknown>;
export {};
