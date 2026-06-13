import { FOUNDING_MAX_DISCOUNT_PERCENT, MARKET_TIERS, POSTURE } from './config.js';
import { fromFils, pct, roundFils, type Fils } from './money.js';
import type { Selection } from './schema.js';

export type WaterfallBasis = 'market' | 'positioning' | 'derived' | 'cost';

export interface WaterfallStep {
  readonly step: 'tier' | 'risk' | 'premium' | 'bundle' | 'founding' | 'promo' | 'floor';
  readonly label: string;
  readonly reason: string;
  amount: Fils;
  readonly requestedAmount: Fils;
  readonly requestedPercent?: number;
  appliedPercent?: number;
  readonly basis: WaterfallBasis;
  readonly discountLike: boolean;
}

export interface WaterfallResult {
  readonly waterfall: readonly WaterfallStep[];
  readonly net: Fils;
  readonly floorBound: boolean;
  readonly discountApplied: Fils;
  readonly discountRequested: Fils;
}

export function buildWaterfall(listPrice: Fils, selection: Selection, floor: Fils): WaterfallResult {
  const waterfall: WaterfallStep[] = [];

  if (selection.marketTier) {
    const tier = MARKET_TIERS[selection.marketTier];
    const amount = roundFils(listPrice * (tier.factor - 1));
    if (amount !== 0) {
      waterfall.push({
        step: 'tier',
        label: `${tier.label} positioning`,
        reason: `Market tier factor ${tier.factor}`,
        amount,
        requestedAmount: amount,
        basis: 'positioning',
        discountLike: false
      });
    }
  }

  if (selection.riskPercent > 0) {
    const amount = pct(listPrice, selection.riskPercent);
    waterfall.push({
      step: 'risk',
      label: `Risk / complexity uplift (+${selection.riskPercent}%)`,
      reason: 'Explicit riskPercent input',
      amount,
      requestedAmount: amount,
      requestedPercent: selection.riskPercent,
      appliedPercent: selection.riskPercent,
      basis: 'positioning',
      discountLike: false
    });
  }

  const premiumUplift = (POSTURE[selection.posture] as { readonly premiumUplift?: number }).premiumUplift ?? 0;
  if (premiumUplift > 0) {
    const percent = premiumUplift * 100;
    const amount = pct(listPrice, percent);
    waterfall.push({
      step: 'premium',
      label: `Premium posture uplift (+${percent}%)`,
      reason: 'Premium posture',
      amount,
      requestedAmount: amount,
      requestedPercent: percent,
      appliedPercent: percent,
      basis: 'positioning',
      discountLike: false
    });
  }

  pushDiscount(waterfall, 'bundle', 'Bundle / volume discount', selection.bundleDiscountPercent, listPrice, 'Explicit bundleDiscountPercent input');

  const foundingRequested = selection.discountPercent;
  const foundingApplied = Math.min(
    foundingRequested,
    selection.maxFoundingDiscount,
    FOUNDING_MAX_DISCOUNT_PERCENT
  );
  pushDiscount(
    waterfall,
    'founding',
    'Founding-client discount',
    foundingApplied,
    listPrice,
    `Requested ${foundingRequested}%, capped at ${foundingApplied}%`,
    foundingRequested
  );

  pushDiscount(waterfall, 'promo', 'Promo discount', selection.promoPercent, listPrice, 'Explicit promoPercent input');

  return enforceFloor(listPrice, waterfall, floor);
}

function pushDiscount(
  waterfall: WaterfallStep[],
  step: 'bundle' | 'founding' | 'promo',
  label: string,
  appliedPercent: number,
  listPrice: Fils,
  reason: string,
  requestedPercent = appliedPercent
): void {
  if (appliedPercent <= 0 && requestedPercent <= 0) return;
  const requestedAmount = pct(listPrice, requestedPercent);
  const amount = pct(listPrice, appliedPercent);
  if (amount === 0 && requestedAmount === 0) return;
  waterfall.push({
    step,
    label: `${label} (-${appliedPercent}%)`,
    reason,
    amount: fromFils(-amount),
    requestedAmount: fromFils(-requestedAmount),
    requestedPercent,
    appliedPercent,
    basis: 'positioning',
    discountLike: true
  });
}

function enforceFloor(listPrice: Fils, waterfall: WaterfallStep[], floor: Fils): WaterfallResult {
  let net = sumSigned(listPrice, waterfall);
  let floorBound = false;

  if (net < floor) {
    floorBound = true;
    let deficit = floor - net;
    for (let i = waterfall.length - 1; i >= 0 && deficit > 0; i -= 1) {
      const step = waterfall[i];
      if (!step || step.amount >= 0 || (!step.discountLike && step.step !== 'tier')) continue;
      const available = Math.abs(step.amount);
      const reduction = Math.min(available, deficit);
      step.amount = fromFils(step.amount + reduction);
      if (step.requestedPercent !== undefined) {
        const appliedAmount = Math.abs(step.amount);
        step.appliedPercent = listPrice > 0 ? roundPercent((appliedAmount / listPrice) * 100) : 0;
      }
      deficit -= reduction;
    }

    net = sumSigned(listPrice, waterfall);
    if (net < floor) {
      const amount = fromFils(floor - net);
      waterfall.push({
        step: 'floor',
        label: 'Cost-floor guard',
        reason: 'List price plus governed adjustments was below the hard cost floor',
        amount,
        requestedAmount: amount,
        basis: 'cost',
        discountLike: false
      });
      net = floor;
    }
  }

  return {
    waterfall,
    net,
    floorBound,
    discountApplied: fromFils(waterfall.filter((step) => step.discountLike && step.amount < 0).reduce((sum, step) => sum + Math.abs(step.amount), 0)),
    discountRequested: fromFils(waterfall.filter((step) => step.discountLike && step.requestedAmount < 0).reduce((sum, step) => sum + Math.abs(step.requestedAmount), 0))
  };
}

function sumSigned(listPrice: Fils, waterfall: readonly WaterfallStep[]): Fils {
  return fromFils(listPrice + waterfall.reduce((sum, step) => sum + step.amount, 0));
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}
