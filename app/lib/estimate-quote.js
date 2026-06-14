const DEFAULT_TERMS = {
  en: '50% upfront, 50% on delivery. Third-party software, payment, messaging, maps, and AI usage are billed at cost.',
  ar: '50% مقدماً، 50% عند التسليم. تكاليف البرامج والمدفوعات والرسائل والخرائط واستخدام الذكاء الاصطناعي من أطراف ثالثة تُحسب بالتكلفة.'
};

const cleanText = (value) => String(value ?? '').trim();
const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

export function estimateToQuoteLineItems(estimate = {}) {
  const oneTime = money(estimate.discountedSubtotal ?? estimate.net ?? 0);
  const market = money(estimate.subtotal ?? estimate.listPrice ?? 0);
  const monthly = money(estimate.monthly?.amount ?? 0);
  const monthlyName = cleanText(estimate.monthly?.planName) || 'Care Basic';
  return [
    {
      catalogKey: 'qd-build',
      name: {
        en: 'One-time build',
        ar: 'البناء لمرة واحدة'
      },
      description: {
        en: `Typical Dubai AED ${market.toLocaleString('en-AE')} · Sharjah launch AED ${oneTime.toLocaleString('en-AE')}. Includes the selected website/specs and setup.`,
        ar: `سعر دبي المعتاد ${market.toLocaleString('en-AE')} درهم · سعر إطلاق الشارقة ${oneTime.toLocaleString('en-AE')} درهم. يشمل الموقع/المواصفات المختارة والإعداد.`
      },
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
    },
    {
      catalogKey: 'monthly-care',
      name: {
        en: 'Monthly care',
        ar: 'العناية الشهرية'
      },
      description: {
        en: monthly > 0 ? `${monthlyName}: AED ${monthly.toLocaleString('en-AE')}/mo to keep it supported, monitored, and updated.` : 'Optional monthly care can be added later.',
        ar: monthly > 0 ? `${monthlyName}: ${monthly.toLocaleString('en-AE')} درهم/شهرياً للدعم والمتابعة والتحديث.` : 'يمكن إضافة العناية الشهرية لاحقاً عند الحاجة.'
      },
      qty: 1,
      unitPrice: 0,
      billingNote: monthly > 0 ? `AED ${monthly.toLocaleString('en-AE')}/mo` : 'Optional'
    }
  ];
}

export function estimateToQuoteDraft(estimate = {}, { clientName = '', language = 'en' } = {}) {
  return {
    language: language === 'ar' ? 'ar' : 'en',
    validDays: 30,
    vatPercent: Number.isFinite(estimate.vatPercent) ? estimate.vatPercent : 5,
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
