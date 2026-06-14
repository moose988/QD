import {
  DIRECT_COST_AED,
  HOURS,
  INTERNAL_RATE_AED_PER_HOUR,
  MIN_REALIZATION,
  MIN_GROSS_MARGIN,
  type ScopeTier
} from './config.js';
import { AED, fromFils, roundFils, type Fils } from './money.js';

export interface CostFloors {
  readonly deliveryCost: Fils;
  readonly valueFloor: Fils;
  readonly costFloor: Fils;
  readonly operativeFloor: Fils;
  readonly hardFloor: Fils;
}

export function componentCost(componentId: string, tier: ScopeTier = 'mid', qty = 1): Fils {
  const hourTable = HOURS as Readonly<Record<string, Readonly<Record<ScopeTier, number>>>>;
  const directTable = DIRECT_COST_AED as Readonly<Record<string, number>>;
  const hours = hourTable[componentId]?.[tier] ?? hourTable[componentId]?.mid ?? 0;
  const direct = directTable[componentId] ?? 0;
  return fromFils((roundFils(hours * INTERNAL_RATE_AED_PER_HOUR * 100) + AED(direct)) * qty);
}

export function costFloorNet(deliveryCost: Fils, listPrice: Fils): CostFloors {
  // Value floor ONLY. QD's real delivery cost is ~0 (AI + Vercel), so a cost-based floor would
  // wrongly inflate multi-system bundles (store/booking/dashboard carry fictional hours). The
  // value floor — a minimum share of the Dubai-anchored list — is the honest guardrail. costFloor
  // is kept for the internal margin readout only; it never gates the price.
  const valueFloor = roundFils(listPrice * MIN_REALIZATION);
  const costFloor = roundFils(deliveryCost / (1 - MIN_GROSS_MARGIN));
  return {
    deliveryCost,
    valueFloor,
    costFloor,
    operativeFloor: valueFloor,
    hardFloor: valueFloor
  };
}

export function sumCosts(values: readonly Fils[]): Fils {
  return fromFils(values.reduce((sum, value) => sum + value, 0));
}
