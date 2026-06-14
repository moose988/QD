import { type ScopeTier } from './config.js';
import { type Fils } from './money.js';
export interface CostFloors {
    readonly deliveryCost: Fils;
    readonly valueFloor: Fils;
    readonly costFloor: Fils;
    readonly operativeFloor: Fils;
    readonly hardFloor: Fils;
}
export declare function componentCost(componentId: string, tier?: ScopeTier, qty?: number): Fils;
export declare function costFloorNet(deliveryCost: Fils, listPrice: Fils): CostFloors;
export declare function sumCosts(values: readonly Fils[]): Fils;
