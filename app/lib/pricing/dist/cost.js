import { DIRECT_COST_AED, FLOOR_HARD_MIN, HOURS, INTERNAL_RATE_AED_PER_HOUR, MIN_GROSS_MARGIN } from './config.js';
import { AED, fromFils, roundFils } from './money.js';
export function componentCost(componentId, tier = 'mid', qty = 1) {
    const hourTable = HOURS;
    const directTable = DIRECT_COST_AED;
    const hours = hourTable[componentId]?.[tier] ?? hourTable[componentId]?.mid ?? 0;
    const direct = directTable[componentId] ?? 0;
    return fromFils((roundFils(hours * INTERNAL_RATE_AED_PER_HOUR * 100) + AED(direct)) * qty);
}
export function costFloorNet(deliveryCost) {
    return {
        deliveryCost,
        operativeFloor: roundFils(deliveryCost / (1 - MIN_GROSS_MARGIN)),
        hardFloor: roundFils(deliveryCost / (1 - FLOOR_HARD_MIN))
    };
}
export function sumCosts(values) {
    return fromFils(values.reduce((sum, value) => sum + value, 0));
}
