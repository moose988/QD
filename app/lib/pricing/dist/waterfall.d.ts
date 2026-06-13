import { type Fils } from './money.js';
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
export declare function buildWaterfall(listPrice: Fils, selection: Selection, floor: Fils): WaterfallResult;
