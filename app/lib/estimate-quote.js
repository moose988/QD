import {
  getAddon,
  getAddonLevel,
  getFoundation,
  getModule,
  getPackage,
  getSpecialBuild
} from './pricing-model.js';

const DEFAULT_TERMS = {
  en: '30% on acceptance to begin work; 70% on completion before go-live. Third-party software, payment, messaging, maps, and AI usage are billed at cost.',
  ar: '٣٠٪ عند القبول لبدء العمل؛ ٧٠٪ عند الإنجاز قبل الإطلاق. تكاليف البرامج والمدفوعات والرسائل والخرائط واستخدام الذكاء الاصطناعي من أطراف ثالثة تُحسب بالتكلفة.'
};

const cleanText = (value) => String(value ?? '').trim();
const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

const unique = (items) => Array.from(new Set(items.map(cleanText).filter(Boolean)));

function lineIncludes(line = {}) {
  if (line.kind === 'foundation') return getFoundation(line.id)?.includes || [];
  if (line.kind === 'package') return getPackage(line.id)?.includes || [];
  if (line.kind === 'special') {
    return getPackage(line.id)?.includes || getSpecialBuild(line.id)?.includes || [];
  }
  if (line.kind === 'module') return getModule(line.id)?.includes || [];
  if (line.kind === 'addon') {
    const level = line.tier ? getAddonLevel(line.id, line.tier) : null;
    const addon = getAddon(line.id);
    return unique([level?.spec, addon?.note, line.note]);
  }
  return [];
}

function buildIncludedGroups(estimate = {}) {
  return (estimate.lines || [])
    .filter((line) => Number(line.amount) > 0 && !['discount'].includes(line.kind))
    .map((line) => ({
      label: cleanText(line.label) || cleanText(line.name?.en),
      includes: unique(lineIncludes(line))
    }))
    .filter((group) => group.label && group.includes.length);
}

export function estimateToQuoteLineItems(estimate = {}) {
  const oneTime = money(estimate.grandTotal ?? estimate.discountedSubtotal ?? estimate.net ?? 0);
  const market = money(estimate.subtotal ?? estimate.listPrice ?? 0);
  return [
    {
      catalogKey: 'qd-build',
      name: {
        en: 'One-time build',
        ar: 'البناء لمرة واحدة'
      },
      description: {
        en: `Typical Dubai AED ${market.toLocaleString('en-AE')} - Sharjah launch AED ${oneTime.toLocaleString('en-AE')}. Includes the selected website/specs and setup.`,
        ar: `سعر دبي المعتاد ${market.toLocaleString('en-AE')} درهم · سعر إطلاق الشارقة ${oneTime.toLocaleString('en-AE')} درهم. يشمل الموقع/المواصفات المختارة والإعداد.`
      },
      includes: unique(buildIncludedGroups(estimate).flatMap((group) => group.includes)),
      includedGroups: buildIncludedGroups(estimate),
      qty: 1,
      unitPrice: oneTime
    },
    {
      catalogKey: 'third-party-software',
      name: {
        en: 'Third-party software at cost',
        ar: 'برامج الطرف الثالث بالتكلفة'
      },
      description: {
        en: 'Payment gateway, WhatsApp/SMS, maps, AI usage, and vendor subscriptions are billed directly or passed through at cost.',
        ar: 'بوابة الدفع وواتساب/الرسائل والخرائط واستخدام الذكاء الاصطناعي واشتراكات المزودين تُحسب مباشرة أو تمرر بالتكلفة.'
      },
      qty: 1,
      unitPrice: 0,
      billingNote: 'At cost'
    }
  ];
}

export function estimateToQuoteDraft(estimate = {}, { clientName = '', language = 'en' } = {}) {
  return {
    language: language === 'ar' ? 'ar' : 'en',
    validDays: 30,
    vatInclusive: true,
    vatPercent: 0,
    careMonthly: money(estimate.monthly?.amount ?? 0),
    carePlanName: cleanText(estimate.monthly?.planName) || 'Care Basic',
    customer: {
      businessName: cleanText(clientName),
      email: '',
      phone: ''
    },
    lineItems: estimateToQuoteLineItems(estimate),
    pages: { en: '', ar: '', price: 0 },
    terms: DEFAULT_TERMS,
    notes: { en: '', ar: '' }
  };
}
