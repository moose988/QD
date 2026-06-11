// Quote picker options for the admin quote drawer.
// The visible dropdown mirrors the "Features & Functionality" options from contact.html.
// Prices come from app/lib/pricing-model.js (market-benchmarked, v2026-06-11).
// Default = LOW end of the documented range (conservative starting point);
// the admin can raise any line inside the drawer, or use the Pricing tab to
// pick mid/high scope tiers.
// defaultPrice 0 + scopeNote = no standalone benchmarked price (usually
// because the capability is included in a QD package, or is scope-based).

import { getAddonPrice, getPackage, PRICING_VERSION } from './pricing-model.js';

export { PRICING_VERSION };

const addonLow = (id) => getAddonPrice(id, 'low');

export const FEATURE_CATALOG = [
  { key: 'whatsapp_integration',    name: { en: 'WhatsApp integration', ar: 'تكامل واتساب' }, defaultPrice: 0, scopeNote: 'Basic WhatsApp CTA included in all QD packages; automation via Automation Desk plan.' },
  { key: 'booking_system',          name: { en: 'Booking system', ar: 'نظام الحجوزات' }, defaultPrice: addonLow('booking-integration'), pricingId: 'booking-integration' },
  { key: 'online_payments',         name: { en: 'Online payments', ar: 'الدفع الإلكتروني' }, defaultPrice: addonLow('payment-gateway'), pricingId: 'payment-gateway' },
  { key: 'multi_language',          name: { en: 'Multi-language', ar: 'متعدد اللغات' }, defaultPrice: addonLow('extra-language'), pricingId: 'extra-language' },
  { key: 'admin_dashboard',         name: { en: 'Admin dashboard', ar: 'لوحة تحكم إدارية' }, defaultPrice: addonLow('dashboard-pack'), pricingId: 'dashboard-pack' },
  { key: 'crm_integration',         name: { en: 'CRM integration', ar: 'تكامل CRM' }, defaultPrice: addonLow('crm-setup'), pricingId: 'crm-setup' },
  { key: 'ai_chatbot',              name: { en: 'AI chatbot', ar: 'مساعد ذكي بالذكاء الاصطناعي' }, defaultPrice: addonLow('ai-chatbot-upgrade'), pricingId: 'ai-chatbot-upgrade' },
  { key: 'inventory_management',    name: { en: 'Inventory management', ar: 'إدارة المخزون' }, defaultPrice: 0, scopeNote: 'Included in QD Commerce packages; standalone scope priced per project.' },
  { key: 'order_tracking',          name: { en: 'Order tracking', ar: 'تتبع الطلبات' }, defaultPrice: 0, scopeNote: 'Included in QD Ordering Pro; standalone scope priced per project.' },
  { key: 'analytics_dashboard',     name: { en: 'Analytics dashboard', ar: 'لوحة التحليلات' }, defaultPrice: addonLow('dashboard-pack'), pricingId: 'dashboard-pack' },
  { key: 'gallery',                 name: { en: 'Gallery', ar: 'معرض الصور' }, defaultPrice: 0, scopeNote: 'Included in package page scope; large media systems priced per project.' },
  { key: 'blog',                    name: { en: 'Blog', ar: 'المدونة' }, defaultPrice: 0, scopeNote: 'Included in QD Growth and above.' },
  { key: 'maps',                    name: { en: 'Maps', ar: 'الخرائط' }, defaultPrice: addonLow('map-embed'), pricingId: 'map-embed' },
  { key: 'reviews',                 name: { en: 'Reviews', ar: 'التقييمات' }, defaultPrice: addonLow('reviews-integration'), pricingId: 'reviews-integration' },
  { key: 'newsletter',              name: { en: 'Newsletter', ar: 'النشرة البريدية' }, defaultPrice: 0, scopeNote: 'Scope-based; usually bundled with email automation.' },
  { key: 'file_uploads',            name: { en: 'File uploads', ar: 'رفع الملفات' }, defaultPrice: addonLow('file-uploads'), pricingId: 'file-uploads' },
  { key: 'user_accounts',           name: { en: 'User accounts', ar: 'حسابات المستخدمين' }, defaultPrice: 0, scopeNote: 'Scope-based; part of portal / membership builds.' },
  { key: 'loyalty_systems',         name: { en: 'Loyalty systems', ar: 'أنظمة الولاء' }, defaultPrice: addonLow('loyalty-integration'), pricingId: 'loyalty-integration' },
  { key: 'memberships',             name: { en: 'Memberships', ar: 'العضويات' }, defaultPrice: 0, scopeNote: 'Scope-based; part of portal / membership builds.' },
  { key: 'social_feeds',            name: { en: 'Social feeds', ar: 'عرض وسائل التواصل' }, defaultPrice: 0, scopeNote: 'Scope-based.' },
  { key: 'team_portals',            name: { en: 'Team portals', ar: 'بوابات الفريق' }, defaultPrice: addonLow('roles-logic'), pricingId: 'roles-logic' },
  { key: 'not_sure_recommend_stack', name: { en: 'Not sure — recommend the right stack', ar: 'غير متأكد — اقترحوا النظام المناسب' }, defaultPrice: 0 }
];

// Internal presets used by quote prefill (and addable from the drawer).
// Site packages now map 1:1 to the QD pricing model packages.
export const INTERNAL_CATALOG = [
  { key: 'site-5p',         name: { en: 'QD Launch Site (up to 5 pages)', ar: 'موقع الانطلاق (حتى ٥ صفحات)' }, defaultPrice: getPackage('qd-launch').oneTime, pricingId: 'qd-launch' },
  { key: 'site-10p',        name: { en: 'QD Growth Website (8–12 pages)', ar: 'موقع النمو (٨–١٢ صفحة)' }, defaultPrice: getPackage('qd-growth').oneTime, pricingId: 'qd-growth' },
  { key: 'site-pro',        name: { en: 'QD Business Pro Website (12–20 pages, AR/EN)', ar: 'موقع الأعمال الاحترافي (١٢–٢٠ صفحة)' }, defaultPrice: getPackage('qd-business-pro').oneTime, pricingId: 'qd-business-pro' },
  { key: 'logo-design',     name: { en: 'Logo design (3 concepts, 2 revs)', ar: 'تصميم شعار (٣ مفاهيم، مراجعتان)' }, defaultPrice: 1200, scopeNote: 'QD estimate — not covered by the pricing benchmark.' },
  { key: 'maintenance-3m',  name: { en: '3-month Care Lite maintenance', ar: 'صيانة العناية الأساسية ٣ أشهر' }, defaultPrice: 249, defaultQty: 3, pricingId: 'care-lite' }
];

export const CATALOG = FEATURE_CATALOG;

const ALL_CATALOG_ITEMS = [...FEATURE_CATALOG, ...INTERNAL_CATALOG];

export function getCatalogItem(key) {
  return ALL_CATALOG_ITEMS.find((c) => c.key === key) || null;
}

export function catalogToLineItem(key, overrides = {}) {
  const c = getCatalogItem(key);
  if (!c) return null;

  return {
    catalogKey: c.key,
    name: { en: c.name.en, ar: c.name.ar },
    description: { en: '', ar: '' },
    qty: c.defaultQty || 1,
    unitPrice: c.defaultPrice,
    ...overrides
  };
}
