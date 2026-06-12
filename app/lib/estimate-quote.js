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
  return (estimate.lines || [])
    .filter((line) => money(line.amount) !== 0)
    .map((line) => ({
      catalogKey: line.id || null,
      name: {
        en: cleanText(line.label) || 'Project service',
        ar: cleanText(line.labelAr) || cleanText(line.label) || 'Project service'
      },
      description: {
        en: cleanText(line.note),
        ar: ''
      },
      qty: 1,
      unitPrice: money(line.amount)
    }));
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
