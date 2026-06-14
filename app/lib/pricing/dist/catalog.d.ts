export declare const PRICING_VERSION = "2026-06-14";
export declare const CURRENCY = "AED";
export declare const DEFAULT_VAT_PERCENT = 5;
export declare const PACKAGES: ({
    id: string;
    name: {
        en: string;
        ar: string;
    };
    oneTime: number;
    from: boolean;
    suggestedCarePlan: string;
    bestFor: {
        en: string;
        ar: string;
    };
    includes: string[];
    basis: string;
    basisNote: string;
    softwarePassThrough?: never;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    oneTime: number;
    from: boolean;
    suggestedCarePlan: string;
    softwarePassThrough: boolean;
    bestFor: {
        en: string;
        ar: string;
    };
    includes: string[];
    basis: string;
    basisNote: string;
})[];
export declare const ADDONS: ({
    id: string;
    name: {
        en: string;
        ar: string;
    };
    desc: string;
    low: number;
    high: number;
    fixed: boolean;
    perUnit: string;
    basis: string;
    refs?: never;
    levels?: never;
    from?: never;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    desc: string;
    low: number;
    high: number;
    basis: string;
    refs: string[];
    levels: {
        tier: string;
        label: string;
        spec: string;
    }[];
    fixed?: never;
    perUnit?: never;
    from?: never;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    desc: string;
    low: number;
    high: number;
    fixed: boolean;
    basis: string;
    perUnit?: never;
    refs?: never;
    levels?: never;
    from?: never;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    desc: string;
    low: number;
    high: number;
    basis: string;
    levels: {
        tier: string;
        label: string;
        spec: string;
    }[];
    fixed?: never;
    perUnit?: never;
    refs?: never;
    from?: never;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    desc: string;
    low: number;
    high: number;
    fixed: boolean;
    basis: string;
    refs: string[];
    perUnit?: never;
    levels?: never;
    from?: never;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    desc: string;
    low: number;
    high: number;
    from: boolean;
    basis: string;
    refs: string[];
    fixed?: never;
    perUnit?: never;
    levels?: never;
})[];
export declare const getAddonLevel: (addonId: any, tier?: string) => {
    tier: string;
    label: string;
    spec: string;
} | null;
export declare const CARE_PLANS: ({
    id: string;
    name: {
        en: string;
        ar: string;
    };
    monthly: number;
    scope: string;
    refs?: never;
    usage?: never;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    monthly: number;
    scope: string;
    refs: string[];
    usage?: never;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    monthly: number;
    usage: boolean;
    scope: string;
    refs: string[];
})[];
export declare const INDUSTRY_PRESETS: {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    packageId: string;
    addonIds: string[];
    carePlanId: string;
    band: number[];
    monthlyBand: number[];
    why: string;
}[];
export declare const PAGE_RATE_STANDARD = 250;
export declare const PAGE_RATE_LANDING = 450;
export declare const FOUNDATIONS: ({
    id: string;
    name: {
        en: string;
        ar: string;
    };
    base: number;
    includedStandardPages: number;
    derivation: string;
    bestFor: {
        en: string;
        ar: string;
    };
    diff: string[];
    includes: string[];
    basis: string;
    legacy?: never;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    base: number;
    derivation: string;
    bestFor: {
        en: string;
        ar: string;
    };
    diff: string[];
    includes: string[];
    basis: string;
    legacy: boolean;
    includedStandardPages?: never;
})[];
export declare const FOUNDATION_COVERS: {
    'web-base': string[];
    'foundation-starter': string[];
    'foundation-essential': string[];
    'foundation-professional': string[];
    'foundation-premium': string[];
};
export declare const SPECIAL_BUILDS: {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    note: string;
}[];
export declare const getFoundation: (id: any) => {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    base: number;
    includedStandardPages: number;
    derivation: string;
    bestFor: {
        en: string;
        ar: string;
    };
    diff: string[];
    includes: string[];
    basis: string;
    legacy?: never;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    base: number;
    derivation: string;
    bestFor: {
        en: string;
        ar: string;
    };
    diff: string[];
    includes: string[];
    basis: string;
    legacy: boolean;
    includedStandardPages?: never;
} | null;
export declare const getSpecialBuild: (id: any) => {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    note: string;
} | null;
export declare const OFFER_TEMPLATES: ({
    id: string;
    name: {
        en: string;
        ar: string;
    };
    pitch: string;
    foundationId: string;
    pagesStandard: number;
    pagesLanding: number;
    specials: never[];
    addons: {
        id: string;
    }[];
    carePlanId: string;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    pitch: string;
    foundationId: string;
    pagesStandard: number;
    pagesLanding: number;
    specials: never[];
    addons: {
        id: string;
        tier: string;
    }[];
    carePlanId: string;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    pitch: string;
    foundationId: null;
    pagesStandard: number;
    pagesLanding: number;
    specials: string[];
    addons: ({
        id: string;
        tier?: never;
    } | {
        id: string;
        tier: string;
    })[];
    carePlanId: string;
})[];
export declare const getOfferTemplate: (id: any) => {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    pitch: string;
    foundationId: string;
    pagesStandard: number;
    pagesLanding: number;
    specials: never[];
    addons: {
        id: string;
    }[];
    carePlanId: string;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    pitch: string;
    foundationId: null;
    pagesStandard: number;
    pagesLanding: number;
    specials: string[];
    addons: ({
        id: string;
        tier?: never;
    } | {
        id: string;
        tier: string;
    })[];
    carePlanId: string;
} | null;
export declare const INDUSTRY_MODULES: ({
    id: string;
    name: {
        en: string;
        ar: string;
    };
    presetId: string;
    modules: {
        id: string;
        name: {
            en: string;
            ar: string;
        };
        pitch: string;
        includes: string[];
        components: {
            id: string;
            tier: string;
        }[];
    }[];
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    presetId: null;
    modules: {
        id: string;
        name: {
            en: string;
            ar: string;
        };
        pitch: string;
        includes: string[];
        components: {
            id: string;
            tier: string;
        }[];
    }[];
})[];
export declare const getIndustryGroup: (id: any) => {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    presetId: string;
    modules: {
        id: string;
        name: {
            en: string;
            ar: string;
        };
        pitch: string;
        includes: string[];
        components: {
            id: string;
            tier: string;
        }[];
    }[];
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    presetId: null;
    modules: {
        id: string;
        name: {
            en: string;
            ar: string;
        };
        pitch: string;
        includes: string[];
        components: {
            id: string;
            tier: string;
        }[];
    }[];
} | null;
export declare const getModule: (id: any) => {
    groupId: string;
    id: string;
    name: {
        en: string;
        ar: string;
    };
    pitch: string;
    includes: string[];
    components: {
        id: string;
        tier: string;
    }[];
} | null;
export declare function buildIncludedMap({ foundationId, specials, packageId, modules, excludeModuleId }?: {
    foundationId?: null | undefined;
    specials?: never[] | undefined;
    packageId?: null | undefined;
    modules?: never[] | undefined;
    excludeModuleId?: null | undefined;
}): Map<any, any>;
export declare const includedCharge: (addonId: any, tier: any, includedMap: any) => number;
export declare function getModulePrice(moduleId: any, includedMap?: Map<any, any>): number;
export declare function getTemplateStartingPrice(templateId: any): number;
export declare const SOURCES: ({
    ref: string;
    name: string;
    url: string;
    verified?: never;
} | {
    ref: string;
    name: string;
    url: string;
    verified: boolean;
})[];
export declare const UAE_MARKET_BANDS: {
    'simple-site': {
        low: number;
        high: number;
        label: string;
    };
    'business-site': {
        low: number;
        high: number;
        label: string;
    };
    ecommerce: {
        low: number;
        high: number;
        label: string;
    };
    'custom-system': {
        low: number;
        high: number;
        label: string;
    };
};
export declare const PACKAGE_COVERS: {
    'qd-launch': string[];
    'qd-growth': never[];
    'qd-business-pro': string[];
    'qd-commerce-start': string[];
    'qd-commerce-growth': string[];
    'qd-booking-pro': string[];
    'qd-ordering-pro': string[];
    'qd-ops-dashboard': string[];
    'qd-ai-chatbot': string[];
};
export declare const FOUNDING_MAX_DISCOUNT_PERCENT = 15;
export declare const getPackage: (id: any) => {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    oneTime: number;
    from: boolean;
    suggestedCarePlan: string;
    bestFor: {
        en: string;
        ar: string;
    };
    includes: string[];
    basis: string;
    basisNote: string;
    softwarePassThrough?: never;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    oneTime: number;
    from: boolean;
    suggestedCarePlan: string;
    softwarePassThrough: boolean;
    bestFor: {
        en: string;
        ar: string;
    };
    includes: string[];
    basis: string;
    basisNote: string;
} | null;
export declare const getAddon: (id: any) => {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    desc: string;
    low: number;
    high: number;
    fixed: boolean;
    perUnit: string;
    basis: string;
    refs?: never;
    levels?: never;
    from?: never;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    desc: string;
    low: number;
    high: number;
    basis: string;
    refs: string[];
    levels: {
        tier: string;
        label: string;
        spec: string;
    }[];
    fixed?: never;
    perUnit?: never;
    from?: never;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    desc: string;
    low: number;
    high: number;
    fixed: boolean;
    basis: string;
    perUnit?: never;
    refs?: never;
    levels?: never;
    from?: never;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    desc: string;
    low: number;
    high: number;
    basis: string;
    levels: {
        tier: string;
        label: string;
        spec: string;
    }[];
    fixed?: never;
    perUnit?: never;
    refs?: never;
    from?: never;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    desc: string;
    low: number;
    high: number;
    fixed: boolean;
    basis: string;
    refs: string[];
    perUnit?: never;
    levels?: never;
    from?: never;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    desc: string;
    low: number;
    high: number;
    from: boolean;
    basis: string;
    refs: string[];
    fixed?: never;
    perUnit?: never;
    levels?: never;
} | null;
export declare const getCarePlan: (id: any) => {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    monthly: number;
    scope: string;
    refs?: never;
    usage?: never;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    monthly: number;
    scope: string;
    refs: string[];
    usage?: never;
} | {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    monthly: number;
    usage: boolean;
    scope: string;
    refs: string[];
} | null;
export declare const getIndustryPreset: (id: any) => {
    id: string;
    name: {
        en: string;
        ar: string;
    };
    packageId: string;
    addonIds: string[];
    carePlanId: string;
    band: number[];
    monthlyBand: number[];
    why: string;
} | null;
export declare function getAddonPrice(addonId: any, tier?: string): number;
export declare function deepFreeze(value: any): any;
