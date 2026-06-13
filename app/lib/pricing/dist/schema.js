import { ADDONS, CARE_PLANS, FOUNDATIONS, INDUSTRY_PRESETS, PACKAGES, SPECIAL_BUILDS } from './catalog.js';
import { DEFAULT_POSTURE, MARKET_TIERS, POSTURE, VAT_PERCENT, FOUNDING_MAX_DISCOUNT_PERCENT } from './config.js';
const foundationIds = enumValues(FOUNDATIONS.map((item) => item.id));
const specialIds = enumValues(SPECIAL_BUILDS.map((item) => item.id));
const packageIds = enumValues(PACKAGES.map((item) => item.id));
const addonIds = enumValues(ADDONS.map((item) => item.id));
const carePlanIds = enumValues(CARE_PLANS.map((item) => item.id));
const postureIds = enumValues(Object.keys(POSTURE));
const marketTierIds = enumValues(Object.keys(MARKET_TIERS));
const scopeTierIds = ['low', 'mid', 'high'];
const pricingInputKeys = [
    'foundationId',
    'pagesStandard',
    'pagesLanding',
    'specials',
    'packageId',
    'modules',
    'addons',
    'carePlanId',
    'industryId',
    'posture',
    'marketTier',
    'riskPercent',
    'discountPercent',
    'promoPercent',
    'bundleDiscountPercent',
    'clientValueAnnualAED',
    'ownerOverride',
    'vatPercent'
];
export const PricingInputSchema = Object.freeze({
    shape: Object.freeze(Object.fromEntries(pricingInputKeys.map((key) => [key, true]))),
    safeParse(input) {
        try {
            return { success: true, data: parseInputObject(input) };
        }
        catch (error) {
            const issue = error instanceof PricingValidationIssue
                ? { path: error.path, message: error.message }
                : { path: ['input'], message: 'Invalid pricing input' };
            return { success: false, error: { issues: [issue] } };
        }
    }
});
export class PricingError extends Error {
    field;
    constructor(field, message) {
        super(message);
        this.name = 'PricingError';
        this.field = field;
    }
}
class PricingValidationIssue extends Error {
    path;
    constructor(path, message) {
        super(message);
        this.path = path;
    }
}
export function normalize(input = {}, options = {}) {
    const parsed = parsePricingInput(input);
    const posture = parsed.posture;
    const postureConfig = POSTURE[posture];
    const legacyCompat = options.legacyCompat === true;
    const inputRecord = input && typeof input === 'object' && !Array.isArray(input)
        ? input
        : {};
    const hasCarePlanInput = Object.prototype.hasOwnProperty.call(inputRecord, 'carePlanId');
    const carePlanId = !legacyCompat && !hasCarePlanInput && postureConfig.defaultCarePlan
        ? postureConfig.defaultCarePlan
        : parsed.carePlanId;
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
        carePlanId,
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
function parseInputObject(input) {
    const record = input === undefined ? {} : requireRecord(input, ['input']);
    const allowedKeys = new Set(pricingInputKeys);
    for (const key of Object.keys(record)) {
        if (!allowedKeys.has(key)) {
            throw new PricingValidationIssue([key], `Unknown pricing input field "${key}"`);
        }
    }
    const parsed = {
        foundationId: parseNullableEnum(record, 'foundationId', foundationIds, null),
        pagesStandard: parseNumber(record, 'pagesStandard', 0, { int: true, min: 0, max: 200 }),
        pagesLanding: parseNumber(record, 'pagesLanding', 0, { int: true, min: 0, max: 50 }),
        specials: parseEnumArray(record, 'specials', specialIds, []),
        packageId: parseNullableEnum(record, 'packageId', packageIds, null),
        modules: parseStringArray(record, 'modules', []),
        addons: parseAddons(record),
        carePlanId: parseEnum(record, 'carePlanId', carePlanIds, 'none'),
        industryId: parseNullableString(record, 'industryId', null),
        posture: parseEnum(record, 'posture', postureIds, DEFAULT_POSTURE),
        riskPercent: parseNumber(record, 'riskPercent', 0, { min: 0, max: 25 }),
        discountPercent: parseNumber(record, 'discountPercent', 0, { min: 0, max: 100 }),
        promoPercent: parseNumber(record, 'promoPercent', 0, { min: 0, max: 100 }),
        bundleDiscountPercent: parseNumber(record, 'bundleDiscountPercent', 0, { min: 0, max: 100 }),
        ownerOverride: parseBoolean(record, 'ownerOverride', false),
        vatPercent: parseNumber(record, 'vatPercent', VAT_PERCENT, { min: 0, max: 100 })
    };
    const marketTier = parseOptionalEnum(record, 'marketTier', marketTierIds);
    const clientValueAnnualAED = parseOptionalNumber(record, 'clientValueAnnualAED', { min: 0 });
    return {
        ...parsed,
        ...(marketTier !== undefined ? { marketTier: marketTier } : {}),
        ...(clientValueAnnualAED !== undefined ? { clientValueAnnualAED } : {})
    };
}
function parseAddons(record) {
    const value = record.addons;
    if (value === undefined)
        return [];
    if (!Array.isArray(value)) {
        throw new PricingValidationIssue(['addons'], 'Expected an array');
    }
    return value.map((item, index) => {
        const addon = requireRecord(item, ['addons', index]);
        return {
            id: parseEnum(addon, 'id', addonIds, undefined, ['addons', index, 'id']),
            tier: parseEnum(addon, 'tier', scopeTierIds, 'low', ['addons', index, 'tier']),
            qty: parseNumber(addon, 'qty', 1, { int: true, min: 1, max: 200, pathPrefix: ['addons', index] })
        };
    });
}
function parseEnum(record, key, allowed, fallback, path = [key]) {
    const value = record[key];
    if (value === undefined && fallback !== undefined)
        return fallback;
    if (typeof value === 'string' && allowed.includes(value))
        return value;
    throw new PricingValidationIssue(path, `Expected one of: ${allowed.join(', ')}`);
}
function parseOptionalEnum(record, key, allowed) {
    const value = record[key];
    if (value === undefined)
        return undefined;
    if (typeof value === 'string' && allowed.includes(value))
        return value;
    throw new PricingValidationIssue([key], `Expected one of: ${allowed.join(', ')}`);
}
function parseNullableEnum(record, key, allowed, fallback) {
    const value = record[key];
    if (value === undefined)
        return fallback;
    if (value === null)
        return null;
    if (typeof value === 'string' && allowed.includes(value))
        return value;
    throw new PricingValidationIssue([key], `Expected null or one of: ${allowed.join(', ')}`);
}
function parseNullableString(record, key, fallback) {
    const value = record[key];
    if (value === undefined)
        return fallback;
    if (value === null)
        return null;
    if (typeof value === 'string')
        return value;
    throw new PricingValidationIssue([key], 'Expected a string or null');
}
function parseStringArray(record, key, fallback) {
    const value = record[key];
    if (value === undefined)
        return fallback;
    if (!Array.isArray(value))
        throw new PricingValidationIssue([key], 'Expected an array');
    value.forEach((item, index) => {
        if (typeof item !== 'string') {
            throw new PricingValidationIssue([key, index], 'Expected a string');
        }
    });
    return value;
}
function parseEnumArray(record, key, allowed, fallback) {
    const value = parseStringArray(record, key, fallback);
    value.forEach((item, index) => {
        if (!allowed.includes(item)) {
            throw new PricingValidationIssue([key, index], `Expected one of: ${allowed.join(', ')}`);
        }
    });
    return value;
}
function parseBoolean(record, key, fallback) {
    const value = record[key];
    if (value === undefined)
        return fallback;
    if (typeof value === 'boolean')
        return value;
    throw new PricingValidationIssue([key], 'Expected a boolean');
}
function parseOptionalNumber(record, key, options) {
    const value = record[key];
    if (value === undefined)
        return undefined;
    assertNumber(value, [key], options);
    return value;
}
function parseNumber(record, key, fallback, options) {
    const value = record[key];
    if (value === undefined)
        return fallback;
    const path = [...(options.pathPrefix || []), key];
    assertNumber(value, path, options);
    return value;
}
function assertNumber(value, path, options) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new PricingValidationIssue(path, 'Expected a number');
    }
    if (options.int && !Number.isInteger(value)) {
        throw new PricingValidationIssue(path, 'Expected an integer');
    }
    if (options.min !== undefined && value < options.min) {
        throw new PricingValidationIssue(path, `Expected a number greater than or equal to ${options.min}`);
    }
    if (options.max !== undefined && value > options.max) {
        throw new PricingValidationIssue(path, `Expected a number less than or equal to ${options.max}`);
    }
}
function requireRecord(input, path) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new PricingValidationIssue(path, 'Expected an object');
    }
    return input;
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
        throw new Error('Cannot build empty enum');
    return unique;
}
