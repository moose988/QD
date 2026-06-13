import { CURRENCY } from './catalog.js';
import { type ApprovalLevel, type ValueCheck } from './governance.js';
import { type Fils } from './money.js';
import { type Selection } from './schema.js';
import { type WaterfallStep } from './waterfall.js';
export type PricingBasis = 'market' | 'positioning' | 'derived' | 'cost';
export interface PricingLine {
    readonly kind: string;
    readonly id: string;
    readonly label: string;
    readonly labelAr: string;
    readonly amount: Fils;
    readonly basis: PricingBasis;
    readonly costFils: Fils;
    readonly refs?: readonly string[];
    readonly note?: string;
    readonly unit?: Fils;
    readonly qty?: number;
    readonly tier?: string | null;
    readonly from?: boolean;
    readonly covered?: boolean;
    readonly upgraded?: boolean;
}
export interface MoneyBandCheck {
    readonly band: readonly [Fils, Fils];
    readonly monthlyBand?: readonly [Fils, Fils];
    readonly status: 'below' | 'within' | 'above';
}
export interface UaeCheck {
    readonly key: string;
    readonly label: string;
    readonly band: readonly [Fils, Fils];
    readonly status: 'below' | 'within' | 'above';
}
export interface MonthlySummary {
    readonly amount: Fils;
    readonly planId: string;
    readonly planName: string;
    readonly usage: boolean;
    readonly softwarePassThrough: boolean;
}
export interface PassThroughLine {
    readonly item: string;
    readonly vendor: string;
    readonly original: {
        readonly amount: number;
        readonly currency: string;
    };
    readonly aed: Fils;
    readonly refs: readonly string[];
    readonly note: string;
}
export interface FloorDetail {
    readonly operativeFloor: Fils;
    readonly hardFloor: Fils;
    readonly floorUsed: Fils;
    readonly ownerOverride: boolean;
}
export interface PricingResult {
    readonly version: string;
    readonly inputHash: string;
    readonly currency: typeof CURRENCY;
    readonly vatPercent: number;
    readonly posture: string;
    readonly marketTier: string | null;
    readonly selection: Selection;
    readonly lines: readonly PricingLine[];
    readonly listPrice: Fils;
    readonly subtotal: Fils;
    readonly subtotalLow: Fils;
    readonly subtotalMid: Fils;
    readonly subtotalHigh: Fils;
    readonly taxableSubtotal: Fils;
    readonly waterfall: readonly WaterfallStep[];
    readonly net: Fils;
    readonly discountedSubtotal: Fils;
    readonly vat: Fils;
    readonly grandTotal: Fils;
    readonly deliveryCost: Fils;
    readonly chargedCost: Fils;
    readonly marginAmount: Fils;
    readonly marginPercent: number;
    readonly costFloorNet: Fils;
    readonly hardCostFloorNet: Fils;
    readonly floorBound: boolean;
    readonly floorDetail: FloorDetail;
    readonly monthly: MonthlySummary;
    readonly passThrough: readonly PassThroughLine[];
    readonly discountPercent: number;
    readonly discountPercentRequested: number;
    readonly discountPercentApplied: number;
    readonly discountAmount: Fils;
    readonly discountRequested: Fils;
    readonly discountApplied: Fils;
    readonly discountCapped: boolean;
    readonly approval: ApprovalLevel;
    readonly flags: readonly string[];
    readonly bandCheck: MoneyBandCheck | null;
    readonly uaeCheck: UaeCheck | null;
    readonly valueCheck: ValueCheck;
    readonly openEnded: boolean;
}
export declare function price(input?: unknown): PricingResult;
export declare function priceInternal(input?: unknown, options?: {
    readonly legacyCompat?: boolean;
}): PricingResult;
