import { z } from 'zod';
import { ADDONS, CARE_PLANS, FOUNDATIONS, INDUSTRY_PRESETS, PACKAGES, SPECIAL_BUILDS } from './catalog.js';
import { DEFAULT_POSTURE, MARKET_TIERS, POSTURE, VAT_PERCENT, FOUNDING_MAX_DISCOUNT_PERCENT } from './config.js';
const foundationIds = enumValues(FOUNDATIONS.map((item) => item.id));
const specialIds = enumValues(SPECIAL_BUILDS.map((item) => item.id));
const packageIds = enumValues(PACKAGES.map((item) => item.id));
const addonIds = enumValues(ADDONS.map((item) => item.id));
const carePlanIds = enumValues(CARE_PLANS.map((item) => item.id));
const postureIds = enumValues(Object.keys(POSTURE));
const marketTierIds = enumValues(Object.keys(MARKET_TIERS));
export const PricingInputSchema = z.object({
    foundationId: z.enum(foundationIds).nullable().default(null),
    pagesStandard: z.number().int().min(0).max(200).default(0),
    pagesLanding: z.number().int().min(0).max(50).default(0),
    specials: z.array(z.enum(specialIds)).default([]),
    packageId: z.enum(packageIds).nullable().default(null),
    modules: z.array(z.string()).default([]),
    addons: z.array(z.object({
        id: z.enum(addonIds),
        tier: z.enum(['low', 'mid', 'high']).default('low'),
        qty: z.number().int().min(1).max(200).default(1)
    })).default([]),
    carePlanId: z.enum(carePlanIds).default('none'),
    industryId: z.string().nullable().default(null),
    posture: z.enum(postureIds).default(DEFAULT_POSTURE),
    marketTier: z.enum(marketTierIds).optional(),
    riskPercent: z.number().min(0).max(25).default(0),
    discountPercent: z.number().min(0).max(100).default(0),
    promoPercent: z.number().min(0).max(100).default(0),
    bundleDiscountPercent: z.number().min(0).max(100).default(0),
    clientValueAnnualAED: z.number().min(0).optional(),
    ownerOverride: z.boolean().default(false),
    vatPercent: z.number().min(0).max(100).default(VAT_PERCENT)
}).strict();
export class PricingError extends Error {
    field;
    constructor(field, message) {
        super(message);
        this.name = 'PricingError';
        this.field = field;
    }
}
export function normalize(input = {}, options = {}) {
    const parsed = parsePricingInput(input);
    const posture = parsed.posture;
    const postureConfig = POSTURE[posture];
    const legacyCompat = options.legacyCompat === true;
    const marketTier = legacyCompat && parsed.marketTier === undefined
        ? null
        : (parsed.marketTier ?? postureConfig.tier);
    const uniqueAddons = new Map();
    for (const addon of parsed.addons) {
        if (!uniqueAddons.has(addon.id)) {
            uniqueAddons.set(addon.id, {
                id: addon.id,
                tier: addon.tier,
                qty: addon.qty
            });
        }
    }
    const selection = {
        foundationId: parsed.foundationId,
        pagesStandard: parsed.pagesStandard,
        pagesLanding: parsed.pagesLanding,
        specials: dedupe(parsed.specials),
        packageId: parsed.packageId,
        modules: dedupe(parsed.modules),
        addons: [...uniqueAddons.values()],
        carePlanId: parsed.carePlanId,
        industryId: resolveIndustryId(parsed.industryId),
        posture,
        marketTier,
        maxFoundingDiscount: legacyCompat ? FOUNDING_MAX_DISCOUNT_PERCENT : postureConfig.maxFoundingDiscount,
        riskPercent: parsed.riskPercent,
        discountPercent: parsed.discountPercent,
        promoPercent: parsed.promoPercent,
        bundleDiscountPercent: parsed.bundleDiscountPercent,
        ownerOverride: parsed.ownerOverride,
        vatPercent: parsed.vatPercent,
        legacyCompat
    };
    if (parsed.clientValueAnnualAED !== undefined) {
        return { ...selection, clientValueAnnualAED: parsed.clientValueAnnualAED };
    }
    return selection;
}
export function pickPricingInput(input = {}) {
    const keys = Object.keys(PricingInputSchema.shape);
    const picked = {};
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(input, key))
            picked[key] = input[key];
    }
    return picked;
}
function parsePricingInput(input) {
    const result = PricingInputSchema.safeParse(input);
    if (result.success)
        return result.data;
    const issue = result.error.issues[0];
    const field = issue?.path.length ? issue.path.join('.') : 'input';
    throw new PricingError(field, issue?.message ?? 'Invalid pricing input');
}
function dedupe(values) {
    return [...new Set(values)];
}
function resolveIndustryId(industryId) {
    if (!industryId)
        return null;
    return INDUSTRY_PRESETS.some((preset) => preset.id === industryId) ? industryId : null;
}
function enumValues(values) {
    const unique = [...new Set(values)].filter(Boolean);
    if (unique.length === 0)
        throw new Error('Cannot build empty zod enum');
    return unique;
}
