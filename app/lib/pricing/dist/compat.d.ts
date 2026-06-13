import { type Fils } from './money.js';
import { type PricingLine, type PricingResult } from './engine.js';
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
export declare function buildEstimate(selection?: Record<string, unknown>): LegacyEstimate;
export declare function toWholeAED(value: Fils): number;
export {};
