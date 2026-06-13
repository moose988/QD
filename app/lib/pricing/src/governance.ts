import { APPROVAL } from './config.js';
import { displayAED, type Fils } from './money.js';
import type { Selection } from './schema.js';

export type ApprovalLevel = 'auto' | 'manager' | 'owner';

export interface ValueCheck {
  readonly status: 'not-provided' | 'below-value' | 'ok';
  readonly annualValueAED: number | null;
  readonly netAED: number;
  readonly note: string;
}

export function approvalFor(selection: Selection, listPrice: Fils, discountApplied: Fils): ApprovalLevel {
  const percent = listPrice > 0 ? (discountApplied / listPrice) * 100 : 0;
  if (percent <= selection.maxFoundingDiscount) return 'auto';
  if (percent <= APPROVAL.manager) return 'manager';
  return 'owner';
}

export function discountAppliedPercent(listPrice: Fils, discountApplied: Fils): number {
  if (listPrice <= 0) return 0;
  return Math.round((discountApplied / listPrice) * 10000) / 100;
}

export function valueCheck(selection: Selection, net: Fils): ValueCheck {
  const netAED = displayAED(net, 'aed');
  if (selection.clientValueAnnualAED === undefined) {
    return {
      status: 'not-provided',
      annualValueAED: null,
      netAED,
      note: 'No client annual value input provided.'
    };
  }
  const belowValue = netAED > 0 && selection.clientValueAnnualAED / netAED >= 10;
  return {
    status: belowValue ? 'below-value' : 'ok',
    annualValueAED: selection.clientValueAnnualAED,
    netAED,
    note: belowValue
      ? 'Net price is far below stated annual value; review value capture.'
      : 'Net price is proportionate to stated annual value.'
  };
}
