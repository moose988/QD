import { APPROVAL } from './config.js';
import { displayAED } from './money.js';
export function approvalFor(selection, listPrice, discountApplied) {
    const percent = listPrice > 0 ? (discountApplied / listPrice) * 100 : 0;
    if (percent <= selection.maxFoundingDiscount)
        return 'auto';
    if (percent <= APPROVAL.manager)
        return 'manager';
    return 'owner';
}
export function discountAppliedPercent(listPrice, discountApplied) {
    if (listPrice <= 0)
        return 0;
    return Math.round((discountApplied / listPrice) * 10000) / 100;
}
export function valueCheck(selection, net) {
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
