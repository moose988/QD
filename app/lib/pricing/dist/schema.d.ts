import { z } from 'zod';
import { type MarketTier, type PostureId, type ScopeTier } from './config.js';
export declare const PricingInputSchema: z.ZodObject<{
    foundationId: z.ZodDefault<z.ZodNullable<z.ZodEnum<{
        [x: string]: string;
    }>>>;
    pagesStandard: z.ZodDefault<z.ZodNumber>;
    pagesLanding: z.ZodDefault<z.ZodNumber>;
    specials: z.ZodDefault<z.ZodArray<z.ZodEnum<{
        [x: string]: string;
    }>>>;
    packageId: z.ZodDefault<z.ZodNullable<z.ZodEnum<{
        [x: string]: string;
    }>>>;
    modules: z.ZodDefault<z.ZodArray<z.ZodString>>;
    addons: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodEnum<{
            [x: string]: string;
        }>;
        tier: z.ZodDefault<z.ZodEnum<{
            low: "low";
            mid: "mid";
            high: "high";
        }>>;
        qty: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>>;
    carePlanId: z.ZodDefault<z.ZodEnum<{
        [x: string]: string;
    }>>;
    industryId: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    posture: z.ZodDefault<z.ZodEnum<{
        [x: string]: string;
    }>>;
    marketTier: z.ZodOptional<z.ZodEnum<{
        [x: string]: string;
    }>>;
    riskPercent: z.ZodDefault<z.ZodNumber>;
    discountPercent: z.ZodDefault<z.ZodNumber>;
    promoPercent: z.ZodDefault<z.ZodNumber>;
    bundleDiscountPercent: z.ZodDefault<z.ZodNumber>;
    clientValueAnnualAED: z.ZodOptional<z.ZodNumber>;
    ownerOverride: z.ZodDefault<z.ZodBoolean>;
    vatPercent: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>;
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
