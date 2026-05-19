// Hardcoded catalog of QD preset services. Edit defaults here, then re-deploy.
// Future: move to Firestore + a /admin/catalog settings page.

export const CATALOG = [
  { key: 'site-5p',         name: { en: '5-page responsive website',           ar: 'موقع متجاوب ٥ صفحات' },              defaultPrice: 3500 },
  { key: 'site-10p',        name: { en: '10-page responsive website',          ar: 'موقع متجاوب ١٠ صفحات' },             defaultPrice: 5500 },
  { key: 'logo-design',     name: { en: 'Logo design (3 concepts, 2 revs)',    ar: 'تصميم شعار (٣ مفاهيم، مراجعتان)' },  defaultPrice: 1200 },
  { key: 'online-ordering', name: { en: 'Online ordering integration',         ar: 'تكامل الطلب الإلكتروني' },             defaultPrice: 2000 },
  { key: 'multilang',       name: { en: 'Multi-language support (EN+AR)',      ar: 'دعم متعدد اللغات (إنجليزي+عربي)' },  defaultPrice: 1500 },
  { key: 'seo-foundation',  name: { en: 'SEO foundation',                      ar: 'تأسيس سيو' },                          defaultPrice: 800  },
  { key: 'maintenance-3m',  name: { en: '3-month maintenance',                 ar: 'صيانة ٣ أشهر' },                       defaultPrice: 1500 },
];

export function getCatalogItem(key) {
  return CATALOG.find((c) => c.key === key) || null;
}

export function catalogToLineItem(key, overrides = {}) {
  const c = getCatalogItem(key);
  if (!c) return null;
  return {
    catalogKey: c.key,
    name:        { en: c.name.en, ar: c.name.ar },
    description: { en: '', ar: '' },
    qty: 1,
    unitPrice: c.defaultPrice,
    ...overrides,
  };
}
