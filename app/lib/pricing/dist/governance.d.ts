import { type Fils } from './money.js';
import type { Selection } from './schema.js';
export type ApprovalLevel = 'auto' | 'manager' | 'owner';
export interface ValueCheck {
    readonly status: 'not-provided' | 'below-value' | 'ok';
    readonly annualValueAED: number | null;
    readonly netAED: number;
    readonly note: string;
}
export declare function approvalFor(selection: Selection, listPrice: Fils, discountApplied: Fils): ApprovalLevel;
export declare function discountAppliedPercent(listPrice: Fils, discountApplied: Fils): number;
export declare function valueCheck(selection: Selection, net: Fils): ValueCheck;
