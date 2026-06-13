import { displayAED, type Fils } from './money.js';
import { pickPricingInput } from './schema.js';
import { priceInternal, type PricingLine, type PricingResult } from './engine.js';

type LegacyMoney = number;

export interface LegacyEstimate {
  readonly version: string;
  readonly inputHash: string;
  readonly lines: readonly LegacyLine[];
  readonly subtotal: LegacyMoney;
  readonly subtotalLow: LegacyMoney;
  readonly subtotalHigh: LegacyMoney;
  readonly discountPercent: number;
  readonly discountAmount: LegacyMoney;
  readonly discountedSubtotal: LegacyMoney;
  readonly discountCapped: boolean;
  readonly vatPercent: number;
  readonly vat: LegacyMoney;
  readonly grandTotal: LegacyMoney;
  readonly openEnded: boolean;
  readonly monthly: Record<string, unknown>;
  readonly bandCheck: Record<string, unknown> | null;
  readonly uaeCheck: Record<string, unknown> | null;
  readonly listPrice: Fils;
  readonly waterfall: PricingResult['waterfall'];
  readonly net: Fils;
  readonly taxableSubtotal: Fils;
  readonly deliveryCost: Fils;
  readonly chargedCost: Fils;
  readonly marginAmount: Fils;
  readonly marginPercent: number;
  readonly costFloorNet: Fils;
  readonly floorBound: boolean;
  readonly floorDetail: PricingResult['floorDetail'];
  readonly passThrough: PricingResult['passThrough'];
  readonly discountPercentRequested: number;
  readonly discountPercentApplied: number;
  readonly discountApplied: Fils;
  readonly approval: PricingResult['approval'];
  readonly flags: PricingResult['flags'];
  readonly valueCheck: PricingResult['valueCheck'];
}

export interface LegacyLine extends Omit<PricingLine, 'amount' | 'unit'> {
  readonly amount: LegacyMoney;
  readonly unit?: LegacyMoney;
}

export function buildEstimate(selection: Record<string, unknown> = {}): LegacyEstimate {
  const picked = pickPricingInput(selection);
  const usesV2Posture = Object.prototype.hasOwnProperty.call(picked, 'posture')
    || Object.prototype.hasOwnProperty.call(picked, 'marketTier');
  if (!usesV2Posture) picked.posture = 'standard';
  const result = priceInternal(picked, { legacyCompat: !usesV2Posture });

  return {
    version: result.version,
    inputHash: result.inputHash,
    lines: result.lines.map(toLegacyLine),
    subtotal: toWholeAED(result.subtotal),
    subtotalLow: toWholeAED(result.subtotalLow),
    subtotalHigh: toWholeAED(result.subtotalHigh),
    discountPercent: result.discountPercent,
    discountAmount: toWholeAED(result.discountAmount),
    discountedSubtotal: toWholeAED(result.discountedSubtotal),
    discountCapped: result.discountCapped,
    vatPercent: result.vatPercent,
    vat: toWholeAED(result.vat),
    grandTotal: toWholeAED(result.grandTotal),
    openEnded: result.openEnded,
    monthly: {
      ...result.monthly,
      amount: toWholeAED(result.monthly.amount)
    },
    bandCheck: result.bandCheck ? {
      ...result.bandCheck,
      band: result.bandCheck.band.map(toWholeAED),
      monthlyBand: result.bandCheck.monthlyBand?.map(toWholeAED)
    } : null,
    uaeCheck: result.uaeCheck ? {
      ...result.uaeCheck,
      band: result.uaeCheck.band.map(toWholeAED)
    } : null,
    listPrice: result.listPrice,
    waterfall: result.waterfall,
    net: result.net,
    taxableSubtotal: result.taxableSubtotal,
    deliveryCost: result.deliveryCost,
    chargedCost: result.chargedCost,
    marginAmount: result.marginAmount,
    marginPercent: result.marginPercent,
    costFloorNet: result.costFloorNet,
    floorBound: result.floorBound,
    floorDetail: result.floorDetail,
    passThrough: result.passThrough,
    discountPercentRequested: result.discountPercentRequested,
    discountPercentApplied: result.discountPercentApplied,
    discountApplied: result.discountApplied,
    approval: result.approval,
    flags: result.flags,
    valueCheck: result.valueCheck
  };
}

export function toWholeAED(value: Fils): number {
  return displayAED(value, 'aed');
}

function toLegacyLine(line: PricingLine): LegacyLine {
  const legacy: LegacyLine = {
    ...line,
    amount: toWholeAED(line.amount)
  };
  if (line.unit !== undefined) return { ...legacy, unit: toWholeAED(line.unit) };
  return legacy;
}
