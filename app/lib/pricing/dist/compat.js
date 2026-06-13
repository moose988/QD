import { displayAED } from './money.js';
import { pickPricingInput } from './schema.js';
import { priceInternal } from './engine.js';
export function buildEstimate(selection = {}) {
    const picked = pickPricingInput(selection);
    const usesV2Posture = Object.prototype.hasOwnProperty.call(picked, 'posture')
        || Object.prototype.hasOwnProperty.call(picked, 'marketTier');
    if (!usesV2Posture)
        picked.posture = 'standard';
    const result = priceInternal(picked, { legacyCompat: !usesV2Posture });
    return {
        version: result.version,
        inputHash: result.inputHash,
        lines: result.lines.map(toLegacyLine),
        subtotal: toWholeAED(result.subtotal),
        subtotalLow: toWholeAED(result.subtotalLow),
        subtotalHigh: toWholeAED(result.subtotalHigh),
        discountPercent: result.discountPercent,
        discountAmount: toWholeAED(result.discountAmount),
        discountedSubtotal: toWholeAED(result.discountedSubtotal),
        discountCapped: result.discountCapped,
        vatPercent: result.vatPercent,
        vat: toWholeAED(result.vat),
        grandTotal: toWholeAED(result.grandTotal),
        openEnded: result.openEnded,
        monthly: {
            ...result.monthly,
            amount: toWholeAED(result.monthly.amount)
        },
        bandCheck: result.bandCheck ? {
            ...result.bandCheck,
            band: result.bandCheck.band.map(toWholeAED),
            monthlyBand: result.bandCheck.monthlyBand?.map(toWholeAED)
        } : null,
        uaeCheck: result.uaeCheck ? {
            ...result.uaeCheck,
            band: result.uaeCheck.band.map(toWholeAED)
        } : null,
        listPrice: result.listPrice,
        waterfall: result.waterfall,
        net: result.net,
        taxableSubtotal: result.taxableSubtotal,
        deliveryCost: result.deliveryCost,
        chargedCost: result.chargedCost,
        marginAmount: result.marginAmount,
        marginPercent: result.marginPercent,
        costFloorNet: result.costFloorNet,
        floorBound: result.floorBound,
        floorDetail: result.floorDetail,
        passThrough: result.passThrough,
        discountPercentRequested: result.discountPercentRequested,
        discountPercentApplied: result.discountPercentApplied,
        discountApplied: result.discountApplied,
        approval: result.approval,
        flags: result.flags,
        valueCheck: result.valueCheck
    };
}
export function toWholeAED(value) {
    return displayAED(value, 'aed');
}
function toLegacyLine(line) {
    const legacy = {
        ...line,
        amount: toWholeAED(line.amount)
    };
    if (line.unit !== undefined)
        return { ...legacy, unit: toWholeAED(line.unit) };
    return legacy;
}
