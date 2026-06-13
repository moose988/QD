import {
  DIRECT_COST_AED,
  FLOOR_HARD_MIN,
  HOURS,
  INTERNAL_RATE_AED_PER_HOUR,
  MIN_GROSS_MARGIN,
  type ScopeTier
} from './config.js';
import { AED, fromFils, roundFils, type Fils } from './money.js';

export interface CostFloors {
  readonly deliveryCost: Fils;
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

export function costFloorNet(deliveryCost: Fils): CostFloors {
  return {
    deliveryCost,
    operativeFloor: roundFils(deliveryCost / (1 - MIN_GROSS_MARGIN)),
    hardFloor: roundFils(deliveryCost / (1 - FLOOR_HARD_MIN))
  };
}

export function sumCosts(values: readonly Fils[]): Fils {
  return fromFils(values.reduce((sum, value) => sum + value, 0));
}
