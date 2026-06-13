import { CURRENCY, getAddon, getAddonLevel, getAddonPrice, getCarePlan, getFoundation, getIndustryPreset, getModule, getPackage, getSpecialBuild, includedCharge, PAGE_RATE_LANDING, PAGE_RATE_STANDARD, PRICING_VERSION, UAE_MARKET_BANDS, buildIncludedMap } from './catalog.js';
import { componentCost, costFloorNet, sumCosts } from './cost.js';
import { approvalFor, discountAppliedPercent, valueCheck } from './governance.js';
import { inputHash } from './hash.js';
import { AED, displayAED, fromFils, pct } from './money.js';
import { normalize } from './schema.js';
import { buildWaterfall } from './waterfall.js';
export function price(input = {}) {
    return priceInternal(input, { legacyCompat: false });
}
export function priceInternal(input = {}, options = {}) {
    const selection = normalize(input, { legacyCompat: options.legacyCompat === true });
    const lineBuild = buildLines(selection);
    const floors = costFloorNet(lineBuild.deliveryCost);
    const floorUsed = selection.ownerOverride ? floors.hardFloor : floors.operativeFloor;
    const waterfallResult = buildWaterfall(lineBuild.listPrice, selection, floorUsed);
    const discountLineResults = discountLinesFromWaterfall(waterfallResult.waterfall);
    const lines = [...lineBuild.lines, ...discountLineResults.lines];
    const net = waterfallResult.net;
    const vat = pct(net, selection.vatPercent);
    const grandTotal = fromFils(net + vat);
    const marginAmount = fromFils(net - lineBuild.deliveryCost);
    const discountAppliedPct = discountAppliedPercent(lineBuild.listPrice, waterfallResult.discountApplied);
    const founding = discountLineResults.founding;
    const bandCheck = buildBandCheck(selection, net);
    const uaeCheck = buildUaeCheck(selection, lines, net);
    const monthly = buildMonthly(selection);
    const passThrough = buildPassThrough(selection, monthly.softwarePassThrough);
    const checkValue = valueCheck(selection, net);
    const flags = buildFlags({
        floorBound: waterfallResult.floorBound,
        discountCapped: founding.requestedAmount !== founding.appliedAmount || waterfallResult.floorBound,
        bandCheck,
        uaeCheck,
        valueCheck: checkValue
    });
    return {
        version: PRICING_VERSION,
        inputHash: inputHash(selection, PRICING_VERSION),
        currency: CURRENCY,
        vatPercent: selection.vatPercent,
        posture: selection.posture,
        marketTier: selection.marketTier,
        selection,
        lines,
        listPrice: lineBuild.listPrice,
        subtotal: lineBuild.listPrice,
        subtotalLow: lineBuild.subtotalLow,
        subtotalMid: lineBuild.listPrice,
        subtotalHigh: lineBuild.subtotalHigh,
        taxableSubtotal: net,
        waterfall: waterfallResult.waterfall,
        net,
        discountedSubtotal: net,
        vat,
        grandTotal,
        deliveryCost: lineBuild.deliveryCost,
        chargedCost: lineBuild.chargedCost,
        marginAmount,
        marginPercent: net > 0 ? Math.round(((net - lineBuild.deliveryCost) / net) * 10000) / 100 : 0,
        costFloorNet: floorUsed,
        hardCostFloorNet: floors.hardFloor,
        floorBound: waterfallResult.floorBound,
        floorDetail: {
            operativeFloor: floors.operativeFloor,
            hardFloor: floors.hardFloor,
            floorUsed,
            ownerOverride: selection.ownerOverride
        },
        monthly,
        passThrough,
        discountPercent: founding.appliedPercent,
        discountPercentRequested: selection.discountPercent,
        discountPercentApplied: discountAppliedPct,
        discountAmount: founding.appliedAmount,
        discountRequested: founding.requestedAmount,
        discountApplied: waterfallResult.discountApplied,
        discountCapped: founding.requestedAmount !== founding.appliedAmount || waterfallResult.floorBound,
        approval: approvalFor(selection, lineBuild.listPrice, waterfallResult.discountApplied),
        flags,
        bandCheck,
        uaeCheck,
        valueCheck: checkValue,
        openEnded: lineBuild.openEnded
    };
}
function buildLines(selection) {
    const pkg = selection.packageId ? getPackage(selection.packageId) : null;
    const foundation = selection.foundationId ? getFoundation(selection.foundationId) : null;
    const specialIds = selection.specials.filter((id) => getSpecialBuild(id));
    const lines = [];
    const deliveryCosts = [];
    const chargedCosts = [];
    let subtotal = AED(0);
    let subtotalLow = AED(0);
    let subtotalHigh = AED(0);
    let openEnded = false;
    const includedMap = buildIncludedMap({
        foundationId: foundation?.id || null,
        specials: specialIds,
        packageId: pkg?.id || null,
        modules: []
    });
    const bumpIncluded = (id, value) => {
        includedMap.set(id, Math.max(includedMap.get(id) || 0, value));
    };
    const pushLine = (line) => {
        lines.push(line);
        subtotal = fromFils(subtotal + line.amount);
        deliveryCosts.push(line.costFils);
        if (line.amount > 0)
            chargedCosts.push(line.costFils);
    };
    if (foundation) {
        const costFils = componentCost(foundation.id, 'mid');
        pushLine({
            kind: 'foundation',
            id: foundation.id,
            label: foundation.name.en,
            labelAr: foundation.name.ar,
            amount: AED(foundation.base),
            basis: foundation.basis,
            note: foundation.derivation,
            costFils
        });
        subtotalLow = fromFils(subtotalLow + AED(foundation.base));
        subtotalHigh = fromFils(subtotalHigh + AED(foundation.base));
    }
    if (selection.pagesStandard > 0) {
        const amount = AED(selection.pagesStandard * PAGE_RATE_STANDARD);
        const costFils = componentCost('pages-standard', 'mid', selection.pagesStandard);
        pushLine({
            kind: 'pages',
            id: 'pages-standard',
            label: `Content pages x ${selection.pagesStandard} (AED ${PAGE_RATE_STANDARD}/page)`,
            labelAr: `صفحات محتوى × ${selection.pagesStandard}`,
            amount,
            basis: 'positioning',
            costFils
        });
        subtotalLow = fromFils(subtotalLow + amount);
        subtotalHigh = fromFils(subtotalHigh + amount);
    }
    if (selection.pagesLanding > 0) {
        const amount = AED(selection.pagesLanding * PAGE_RATE_LANDING);
        const costFils = componentCost('pages-landing', 'mid', selection.pagesLanding);
        pushLine({
            kind: 'pages',
            id: 'pages-landing',
            label: `Advanced landing pages x ${selection.pagesLanding} (AED ${PAGE_RATE_LANDING}/page)`,
            labelAr: `صفحات هبوط × ${selection.pagesLanding}`,
            amount,
            basis: 'positioning',
            costFils
        });
        subtotalLow = fromFils(subtotalLow + amount);
        subtotalHigh = fromFils(subtotalHigh + amount);
    }
    for (const sid of specialIds) {
        const special = getSpecialBuild(sid);
        const anchor = getPackage(sid);
        if (!special || !anchor)
            continue;
        const costFils = componentCost(sid, 'mid');
        pushLine({
            kind: 'special',
            id: sid,
            label: special.name.en,
            labelAr: special.name.ar,
            amount: AED(anchor.oneTime),
            from: !!anchor.from,
            basis: anchor.basis,
            note: special.note,
            costFils
        });
        subtotalLow = fromFils(subtotalLow + AED(anchor.oneTime));
        subtotalHigh = fromFils(subtotalHigh + AED(anchor.oneTime));
        if (anchor.from)
            openEnded = true;
    }
    if (pkg) {
        const costFils = componentCost(pkg.id, 'mid');
        pushLine({
            kind: 'package',
            id: pkg.id,
            label: pkg.name.en,
            labelAr: pkg.name.ar,
            amount: AED(pkg.oneTime),
            from: !!pkg.from,
            basis: pkg.basis,
            costFils
        });
        subtotalLow = fromFils(subtotalLow + AED(pkg.oneTime));
        subtotalHigh = fromFils(subtotalHigh + AED(pkg.oneTime));
        if (pkg.from)
            openEnded = true;
    }
    for (const modId of selection.modules) {
        const mod = getModule(modId);
        if (!mod)
            continue;
        const amountAED = modulePriceAED(modId, includedMap);
        const standalone = modulePriceAED(modId, new Map());
        const amount = AED(amountAED);
        const costFils = sumCosts(mod.components.map((component) => componentCost(component.id, scopeTier(component.tier))));
        pushLine({
            kind: 'module',
            id: modId,
            label: mod.name.en,
            labelAr: mod.name.ar,
            amount,
            basis: 'market',
            refs: moduleRefs(mod),
            note: (mod.includes || []).join(' · ')
                + (amountAED < standalone ? ` — overlap with the rest of this offer deducted (standalone AED ${standalone}).` : ''),
            costFils
        });
        for (const component of mod.components) {
            const addon = getAddon(component.id);
            if (!addon)
                continue;
            const included = includedMap.get(component.id) || 0;
            subtotalLow = fromFils(subtotalLow + AED(Math.max(0, addon.low - included)));
            subtotalHigh = fromFils(subtotalHigh + AED(Math.max(0, addon.high - included)));
        }
        for (const component of mod.components)
            bumpIncluded(component.id, getAddonPrice(component.id, scopeTier(component.tier)));
    }
    const seenAddonIds = new Set();
    for (const addonSelection of selection.addons) {
        const addon = getAddon(addonSelection.id);
        if (!addon || seenAddonIds.has(addonSelection.id))
            continue;
        seenAddonIds.add(addonSelection.id);
        const qty = addonSelection.qty;
        const tier = addonSelection.tier;
        const fullPrice = getAddonPrice(addonSelection.id, tier);
        const included = includedMap.get(addonSelection.id) || 0;
        const unitAED = Math.max(0, fullPrice - included);
        const amountAED = unitAED * qty;
        const level = getAddonLevel(addonSelection.id, tier);
        const isFree = included > 0 && unitAED === 0;
        const isUpgrade = included > 0 && unitAED > 0;
        const costFils = componentCost(addonSelection.id, tier, qty);
        pushLine({
            kind: 'addon',
            id: addon.id,
            label: addon.name.en + (level ? ` — ${level.label}` : '') + (qty > 1 ? ` x ${qty}` : ''),
            labelAr: addon.name.ar,
            amount: AED(amountAED),
            unit: AED(unitAED),
            qty,
            tier: addon.fixed || isFree ? null : tier,
            from: !isFree && !!addon.from,
            basis: addon.basis,
            refs: addon.refs || [],
            covered: isFree,
            upgraded: isUpgrade,
            note: isFree
                ? 'Already included in this selection — not charged.'
                : isUpgrade
                    ? `Partly included in this selection — charged as the upgrade to ${level ? level.label : 'this level'} only.`
                    : (level ? level.spec : (addon.note || '')),
            costFils
        });
        subtotalLow = fromFils(subtotalLow + AED(Math.max(0, addon.low - included) * qty));
        subtotalHigh = fromFils(subtotalHigh + AED(Math.max(0, addon.high - included) * qty));
        if (!isFree && addon.from)
            openEnded = true;
        bumpIncluded(addonSelection.id, fullPrice);
    }
    return {
        lines,
        listPrice: subtotal,
        subtotalLow,
        subtotalHigh,
        openEnded,
        deliveryCost: sumCosts(deliveryCosts),
        chargedCost: sumCosts(chargedCosts)
    };
}
function modulePriceAED(moduleId, includedMap) {
    const mod = getModule(moduleId);
    if (!mod)
        return 0;
    return mod.components.reduce((sum, component) => sum + includedCharge(component.id, scopeTier(component.tier), includedMap), 0);
}
function moduleRefs(mod) {
    const refs = new Set();
    for (const component of mod.components || []) {
        for (const ref of getAddon(component.id)?.refs || [])
            refs.add(ref);
    }
    return [...refs];
}
function scopeTier(value) {
    return value === 'mid' || value === 'high' ? value : 'low';
}
function discountLinesFromWaterfall(waterfall) {
    const lines = [];
    let foundingApplied = AED(0);
    let foundingRequested = AED(0);
    let foundingPercent = 0;
    for (const step of waterfall) {
        if (!['bundle', 'founding', 'promo'].includes(step.step) || step.amount === 0)
            continue;
        const id = `${step.step}-discount`;
        if (step.step === 'founding') {
            foundingApplied = fromFils(Math.abs(step.amount));
            foundingRequested = fromFils(Math.abs(step.requestedAmount));
            foundingPercent = step.appliedPercent ?? 0;
        }
        lines.push({
            kind: 'discount',
            id,
            label: step.label,
            labelAr: step.step === 'founding' ? `خصم العميل المؤسس (−${step.appliedPercent ?? 0}٪)` : step.label,
            amount: step.amount,
            basis: step.basis,
            costFils: AED(0),
            note: step.reason
        });
    }
    return {
        lines,
        founding: {
            appliedAmount: foundingApplied,
            requestedAmount: foundingRequested,
            appliedPercent: foundingPercent
        }
    };
}
function buildMonthly(selection) {
    const care = getCarePlan(selection.carePlanId) || getCarePlan('none');
    const pkg = selection.packageId ? getPackage(selection.packageId) : null;
    const softwarePassThrough = !!(pkg && pkg.softwarePassThrough)
        || selection.specials.some((sid) => getPackage(sid)?.softwarePassThrough);
    return {
        amount: AED(care ? care.monthly : 0),
        planId: care ? care.id : 'none',
        planName: care ? care.name.en : 'None',
        usage: !!(care && care.usage),
        softwarePassThrough
    };
}
function buildPassThrough(selection, softwarePassThrough) {
    const care = getCarePlan(selection.carePlanId);
    if (!softwarePassThrough && !care?.usage)
        return [];
    return [{
            item: 'Third-party software and usage',
            vendor: 'Client-selected vendors',
            original: { amount: 0, currency: 'AED' },
            aed: AED(0),
            refs: ['R13', 'R16', 'R17', 'R19', 'R28'],
            note: 'Billed separately at cost; not QD revenue and not included in taxable build subtotal.'
        }];
}
function buildBandCheck(selection, net) {
    const preset = selection.industryId ? getIndustryPreset(selection.industryId) : null;
    if (!preset || net <= 0)
        return null;
    const netAED = displayAED(net, 'aed');
    const lo = Number(preset.band[0] ?? 0);
    const hi = Number(preset.band[1] ?? 0);
    const monthlyLo = Number(preset.monthlyBand[0] ?? 0);
    const monthlyHi = Number(preset.monthlyBand[1] ?? 0);
    return {
        band: [AED(lo), AED(hi)],
        monthlyBand: [AED(monthlyLo), AED(monthlyHi)],
        status: netAED < lo ? 'below' : netAED > hi ? 'above' : 'within'
    };
}
function buildUaeCheck(selection, lines, net) {
    if (net <= 0)
        return null;
    const systemAddonIds = new Set([
        'ordering-integration',
        'booking-integration',
        'dashboard-pack',
        'crm-setup',
        'roles-logic',
        'ai-chatbot-upgrade',
        'loyalty-integration',
        'file-uploads'
    ]);
    const chargedSystems = lines.filter((line) => (line.kind === 'module' && line.amount > 0) ||
        (line.kind === 'addon' && line.amount > 0 && systemAddonIds.has(line.id))).length;
    let bandKey = null;
    if (selection.specials.some((id) => id.startsWith('qd-commerce')))
        bandKey = 'ecommerce';
    else if (selection.specials.includes('qd-ops-dashboard'))
        bandKey = 'custom-system';
    else if (selection.foundationId && chargedSystems >= 3)
        bandKey = 'custom-system';
    else if (selection.foundationId && (selection.foundationId !== 'foundation-essential' || chargedSystems >= 1))
        bandKey = 'business-site';
    else if (selection.foundationId)
        bandKey = 'simple-site';
    else if (chargedSystems >= 1)
        bandKey = 'business-site';
    if (!bandKey)
        return null;
    const band = UAE_MARKET_BANDS[bandKey];
    const netAED = displayAED(net, 'aed');
    return {
        key: bandKey,
        label: band.label,
        band: [AED(band.low), AED(band.high)],
        status: netAED < band.low ? 'below' : netAED > band.high ? 'above' : 'within'
    };
}
function buildFlags(input) {
    const flags = [];
    if (input.floorBound)
        flags.push('floor_bound');
    if (input.discountCapped)
        flags.push('discount_capped');
    if (input.bandCheck?.status === 'below' || input.uaeCheck?.status === 'below')
        flags.push('below_market_band');
    if (input.valueCheck.status === 'below-value')
        flags.push('below_value');
    return flags;
}
