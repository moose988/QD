import { z } from 'zod';
import {
  ADDONS,
  CARE_PLANS,
  FOUNDATIONS,
  INDUSTRY_PRESETS,
  PACKAGES,
  SPECIAL_BUILDS
} from './catalog.js';
import {
  DEFAULT_POSTURE,
  MARKET_TIERS,
  POSTURE,
  VAT_PERCENT,
  FOUNDING_MAX_DISCOUNT_PERCENT,
  type MarketTier,
  type PostureId,
  type ScopeTier
} from './config.js';

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

type ParsedPricingInput = z.infer<typeof PricingInputSchema>;

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

export class PricingError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'PricingError';
    this.field = field;
  }
}

export function normalize(input: unknown = {}, options: NormalizeOptions = {}): Selection {
  const parsed = parsePricingInput(input);
  const posture = parsed.posture as PostureId;
  const postureConfig = POSTURE[posture];
  const legacyCompat = options.legacyCompat === true;
  const marketTier = legacyCompat && parsed.marketTier === undefined
    ? null
    : ((parsed.marketTier ?? postureConfig.tier) as MarketTier);

  const uniqueAddons = new Map<string, AddonSelection>();
  for (const addon of parsed.addons) {
    if (!uniqueAddons.has(addon.id)) {
      uniqueAddons.set(addon.id, {
        id: addon.id,
        tier: addon.tier as ScopeTier,
        qty: addon.qty
      });
    }
  }

  const selection: Selection = {
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

export function pickPricingInput(input: Record<string, unknown> = {}): Record<string, unknown> {
  const keys = Object.keys(PricingInputSchema.shape);
  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input, key)) picked[key] = input[key];
  }
  return picked;
}

function parsePricingInput(input: unknown): ParsedPricingInput {
  const result = PricingInputSchema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue?.path.length ? issue.path.join('.') : 'input';
  throw new PricingError(field, issue?.message ?? 'Invalid pricing input');
}

function dedupe(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function resolveIndustryId(industryId: string | null): string | null {
  if (!industryId) return null;
  return INDUSTRY_PRESETS.some((preset) => preset.id === industryId) ? industryId : null;
}

function enumValues(values: string[]): [string, ...string[]] {
  const unique = [...new Set(values)].filter(Boolean);
  if (unique.length === 0) throw new Error('Cannot build empty zod enum');
  return unique as [string, ...string[]];
}
