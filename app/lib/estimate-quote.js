import {
  getAddon,
  getAddonLevel,
  getFoundation,
  getModule,
  getPackage,
  getSpecialBuild
} from './pricing-model.js';

const DEFAULT_TERMS = {
  en: [
    'Validity. This quotation is valid for 30 days from the issue date.',
    'Payment. 30% advance on acceptance to commence work; 70% on completion prior to go-live. Payable by bank transfer; details provided on the invoice.',
    'Scope. Pricing covers the items listed above. Additional pages, features or systems are quoted separately.',
    'Third-party services. Payment gateway, delivery integrations, messaging (WhatsApp/SMS) and hosting beyond the included setup are billed at cost.',
    'Timeline. Work begins on receipt of the advance payment; a delivery schedule is confirmed at kickoff.',
    'Revisions. Two rounds of revisions per stage are included; further changes are quoted separately.',
    'Ownership. Full ownership and handover transfer to the client on final payment.',
    'Promotional rate. Any launch or expansion discount is a limited-time offer applicable to this quotation only.'
  ],
  ar: [
    'الصلاحية. هذا العرض صالح لمدة 30 يوماً من تاريخ الإصدار.',
    'الدفع. 30% عند القبول لبدء العمل؛ 70% عند الإنجاز قبل الإطلاق. يتم الدفع عبر التحويل البنكي وتُرسل التفاصيل في الفاتورة.',
    'النطاق. يغطي السعر البنود المذكورة أعلاه فقط. الصفحات أو المزايا أو الأنظمة الإضافية تُسعر بشكل منفصل.',
    'خدمات الطرف الثالث. بوابات الدفع وتكاملات التوصيل والرسائل (واتساب/SMS) والاستضافة خارج الإعداد المشمول تُحسب بالتكلفة.',
    'الجدول الزمني. يبدأ العمل بعد استلام الدفعة المقدمة ويتم تأكيد جدول التسليم عند الانطلاق.',
    'المراجعات. تشمل كل مرحلة جولتين من المراجعات، وأي تعديلات إضافية تُسعر بشكل منفصل.',
    'الملكية. تنتقل الملكية والتسليم الكامل للعميل بعد سداد الدفعة النهائية.',
    'السعر الترويجي. أي خصم إطلاق أو توسع هو عرض محدود لهذا السعر فقط.'
  ]
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

function groupAmount(groups) {
  return groups.reduce((sum, group) => sum + money(group.amount ?? group.unitPrice), 0);
}

function distributeIncludedVat(lines, estimate) {
  const target = money(estimate.grandTotal ?? estimate.discountedSubtotal ?? estimate.net ?? groupAmount(lines));
  const current = groupAmount(lines);
  let delta = target - current;
  if (!delta) return lines;
  const positiveIndexes = lines
    .map((line, idx) => ({ line, idx }))
    .filter(({ line }) => Number(line.unitPrice) > 0);
  if (!positiveIndexes.length) return lines;
  const positiveTotal = positiveIndexes.reduce((sum, { line }) => sum + Number(line.unitPrice), 0);
  let allocated = 0;
  const next = lines.map((line) => ({ ...line }));
  positiveIndexes.forEach(({ line, idx }, order) => {
    const amount = order === positiveIndexes.length - 1
      ? delta - allocated
      : Math.round(delta * (Number(line.unitPrice) / positiveTotal));
    next[idx].unitPrice = money(Number(next[idx].unitPrice) + amount);
    allocated += amount;
  });
  return next;
}

function isOrderingLine(line = {}) {
  const text = `${line.id || ''} ${line.label || ''} ${line.name?.en || ''}`.toLowerCase();
  return /order|ordering|pickup|delivery|restaurant/.test(text);
}

function quoteLine({ catalogKey, en, ar, includes, amount, billingNote = '', description = {} }) {
  return {
    catalogKey,
    name: { en, ar },
    description,
    includes: unique(includes || []),
    qty: 1,
    unitPrice: money(amount),
    ...(billingNote ? { billingNote } : {})
  };
}

export function estimateToQuoteLineItems(estimate = {}) {
  const groups = buildIncludedGroups(estimate);
  const websiteLines = (estimate.lines || []).filter((line) => Number(line.amount) > 0 && ['foundation', 'package'].includes(line.kind));
  const orderingLines = (estimate.lines || []).filter((line) => Number(line.amount) > 0 && isOrderingLine(line));
  const otherLines = (estimate.lines || []).filter((line) => (
    Number(line.amount) > 0
    && !['foundation', 'package'].includes(line.kind)
    && !isOrderingLine(line)
    && line.kind !== 'discount'
  ));
  const discount = (estimate.lines || []).filter((line) => line.kind === 'discount').reduce((sum, line) => sum + money(line.amount), 0);

  const visible = [];
  if (websiteLines.length) {
    visible.push(quoteLine({
      catalogKey: 'website-build',
      en: 'Website build',
      ar: 'البناء للموقع الإلكتروني',
      amount: groupAmount(websiteLines),
      includes: unique(websiteLines.flatMap((line) => lineIncludes(line)))
    }));
  }
  if (orderingLines.length) {
    visible.push(quoteLine({
      catalogKey: 'online-ordering-system',
      en: 'Online ordering system',
      ar: 'نظام الطلبات الإلكتروني',
      amount: groupAmount(orderingLines),
      includes: unique(orderingLines.flatMap((line) => lineIncludes(line)))
    }));
  }
  for (const line of otherLines) {
    visible.push(quoteLine({
      catalogKey: line.id || line.kind || 'service',
      en: cleanText(line.label) || cleanText(line.name?.en) || 'Service',
      ar: cleanText(line.name?.ar) || '',
      amount: line.amount,
      includes: lineIncludes(line)
    }));
  }
  if (!visible.length) {
    visible.push(quoteLine({
      catalogKey: 'website-build',
      en: 'Website build',
      ar: 'بناء الموقع',
      amount: money(estimate.grandTotal ?? estimate.discountedSubtotal ?? estimate.net ?? 0),
      includes: unique(groups.flatMap((group) => group.includes))
    }));
  }
  if (discount < 0) {
    visible.push(quoteLine({
      catalogKey: 'sharjah-expansion-discount',
      en: 'Sharjah expansion discount',
      ar: 'خصم التوسع في الشارقة',
      amount: discount,
      includes: []
    }));
  }

  return [
    ...distributeIncludedVat(visible, estimate),
    {
      catalogKey: 'third-party-software',
      name: {
        en: 'Third-party software at cost',
        ar: 'البرامج من الطرف الثالث بالتكلفة'
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
    careMonthly: money(estimate.monthly?.amount) || 149,
    carePlanName: cleanText(estimate.monthly?.planName) === 'No monthly plan' ? 'Care Basic' : (cleanText(estimate.monthly?.planName) || 'Care Basic'),
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
