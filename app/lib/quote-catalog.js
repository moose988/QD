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
  { key: 'whatsapp_integration',    name: { en: 'WhatsApp integration', ar: 'تكامل واتساب' }, defaultPrice: 0, scopeNote: 'Basic WhatsApp CTA included in all QD packages; automation via Automation Desk plan.', group: 'ai' },
  { key: 'booking_system',          name: { en: 'Booking system', ar: 'نظام الحجوزات' }, defaultPrice: addonLow('booking-integration'), pricingId: 'booking-integration', group: 'booking' },
  { key: 'online_payments',         name: { en: 'Online payments', ar: 'الدفع الإلكتروني' }, defaultPrice: addonLow('payment-gateway'), pricingId: 'payment-gateway', group: 'booking' },
  { key: 'multi_language',          name: { en: 'Multi-language', ar: 'متعدد اللغات' }, defaultPrice: addonLow('extra-language'), pricingId: 'extra-language', group: 'addons' },
  { key: 'admin_dashboard',         name: { en: 'Admin dashboard', ar: 'لوحة تحكم إدارية' }, defaultPrice: addonLow('dashboard-pack'), pricingId: 'dashboard-pack', group: 'dashboards' },
  { key: 'crm_integration',         name: { en: 'CRM integration', ar: 'تكامل CRM' }, defaultPrice: addonLow('crm-setup'), pricingId: 'crm-setup', group: 'dashboards' },
  { key: 'ai_chatbot',              name: { en: 'AI chatbot', ar: 'مساعد ذكي بالذكاء الاصطناعي' }, defaultPrice: addonLow('ai-chatbot-upgrade'), pricingId: 'ai-chatbot-upgrade', group: 'ai' },
  { key: 'inventory_management',    name: { en: 'Inventory management', ar: 'إدارة المخزون' }, defaultPrice: 0, scopeNote: 'Included in QD Commerce packages; standalone scope priced per project.', group: 'booking' },
  { key: 'order_tracking',          name: { en: 'Order tracking', ar: 'تتبع الطلبات' }, defaultPrice: 0, scopeNote: 'Included in QD Ordering Pro; standalone scope priced per project.', group: 'booking' },
  { key: 'analytics_dashboard',     name: { en: 'Analytics dashboard', ar: 'لوحة التحليلات' }, defaultPrice: addonLow('dashboard-pack'), pricingId: 'dashboard-pack', group: 'dashboards' },
  { key: 'gallery',                 name: { en: 'Gallery', ar: 'معرض الصور' }, defaultPrice: 0, scopeNote: 'Included in package page scope; large media systems priced per project.', group: 'addons' },
  { key: 'blog',                    name: { en: 'Blog', ar: 'المدونة' }, defaultPrice: 0, scopeNote: 'Included in QD Growth and above.', group: 'addons' },
  { key: 'maps',                    name: { en: 'Maps', ar: 'الخرائط' }, defaultPrice: addonLow('map-embed'), pricingId: 'map-embed', group: 'addons' },
  { key: 'reviews',                 name: { en: 'Reviews', ar: 'التقييمات' }, defaultPrice: addonLow('reviews-integration'), pricingId: 'reviews-integration', group: 'addons' },
  { key: 'newsletter',              name: { en: 'Newsletter', ar: 'النشرة البريدية' }, defaultPrice: 0, scopeNote: 'Scope-based; usually bundled with email automation.', group: 'addons' },
  { key: 'file_uploads',            name: { en: 'File uploads', ar: 'رفع الملفات' }, defaultPrice: addonLow('file-uploads'), pricingId: 'file-uploads', group: 'addons' },
  { key: 'user_accounts',           name: { en: 'User accounts', ar: 'حسابات المستخدمين' }, defaultPrice: 0, scopeNote: 'Scope-based; part of portal / membership builds.', group: 'dashboards' },
  { key: 'loyalty_systems',         name: { en: 'Loyalty systems', ar: 'أنظمة الولاء' }, defaultPrice: addonLow('loyalty-integration'), pricingId: 'loyalty-integration', group: 'addons' },
  { key: 'memberships',             name: { en: 'Memberships', ar: 'العضويات' }, defaultPrice: 0, scopeNote: 'Scope-based; part of portal / membership builds.', group: 'dashboards' },
  { key: 'social_feeds',            name: { en: 'Social feeds', ar: 'عرض وسائل التواصل' }, defaultPrice: 0, scopeNote: 'Scope-based.', group: 'addons' },
  { key: 'team_portals',            name: { en: 'Team portals', ar: 'بوابات الفريق' }, defaultPrice: addonLow('roles-logic'), pricingId: 'roles-logic', group: 'dashboards' },
  { key: 'not_sure_recommend_stack', name: { en: 'Not sure — recommend the right stack', ar: 'غير متأكد — اقترحوا النظام المناسب' }, defaultPrice: 0, group: 'addons' },
];

// Services without a fixed price list (knowledge/nfc.md, knowledge/events.md,
// knowledge/services.md). defaultPrice 0 + scopeNote: the admin enters the
// price agreed for the project. Never add invented prices here.
const AGREED_PER_PROJECT = 'Scope and price agreed per project (no fixed price list).';

export const SERVICE_CATALOG = [
  // NFC (Restaurant NFC and NFC for other businesses)
  { key: 'nfc_restaurant_menu', group: 'nfc', name: { en: 'Restaurant NFC: digital menu', ar: 'NFC للمطاعم: قائمة رقمية' }, defaultPrice: 0, scopeNote: AGREED_PER_PROJECT,
    includes: ['Digital menu that opens with one tap, no app needed', 'Tags linked and tested on compatible phones'] },
  { key: 'nfc_table_tags', group: 'nfc', name: { en: 'NFC table tags (menu, ordering, call waiter, reviews)', ar: 'بطاقات NFC للطاولات (القائمة، الطلب، استدعاء النادل، التقييمات)' }, defaultPrice: 0, scopeNote: AGREED_PER_PROJECT,
    includes: ['Tap action chosen per table: menu, ordering, call waiter or reviews', 'Placement mapped for each table, counter or entrance', 'Tags linked to the agreed destination and tested'] },
  { key: 'nfc_loyalty_reviews', group: 'nfc', name: { en: 'NFC loyalty and review tags', ar: 'بطاقات NFC للولاء والتقييمات' }, defaultPrice: 0, scopeNote: AGREED_PER_PROJECT,
    includes: ['Tap to collect loyalty points or open the review page'] },
  { key: 'nfc_business_cards', group: 'nfc', name: { en: 'NFC business cards', ar: 'بطاقات أعمال NFC' }, defaultPrice: 0, scopeNote: AGREED_PER_PROJECT,
    includes: ['Tap-to-share digital business card', 'WhatsApp, contact and social links'] },
  { key: 'nfc_custom_tags', group: 'nfc', name: { en: 'Custom NFC tags and setup', ar: 'بطاقات NFC مخصصة مع الإعداد' }, defaultPrice: 0, scopeNote: AGREED_PER_PROJECT,
    includes: ['Tap action, placement and destination agreed with you', 'Tag materials and quantities agreed per project'] },

  // AI chat & automation
  { key: 'whatsapp_flows', group: 'ai', name: { en: 'WhatsApp flows and automated replies', ar: 'مسارات واتساب والردود الآلية' }, defaultPrice: 0, scopeNote: AGREED_PER_PROJECT,
    includes: ['Conversation flows designed from your sales process', 'Automated replies and lead routing through WhatsApp'] },
  { key: 'lead_capture_automation', group: 'ai', name: { en: 'Lead capture and routing', ar: 'استقبال العملاء المحتملين وتوزيعهم' }, defaultPrice: 0, scopeNote: AGREED_PER_PROJECT,
    includes: ['Leads captured from chat and forms', 'Instant routing to the right person'] },
  { key: 'booking_automation', group: 'ai', name: { en: 'Booking automation', ar: 'أتمتة الحجوزات' }, defaultPrice: 0, scopeNote: AGREED_PER_PROJECT,
    includes: ['Chat or WhatsApp connected to your booking system', 'Automated status updates and notifications'] },
  { key: 'faq_automation', group: 'ai', name: { en: 'FAQ automation', ar: 'أتمتة الأسئلة الشائعة' }, defaultPrice: 0, scopeNote: AGREED_PER_PROJECT,
    includes: ['Answers based on your services and policies'] },

  // Dashboards & systems
  { key: 'operations_dashboard', group: 'dashboards', name: { en: 'Operations dashboard', ar: 'لوحة متابعة التشغيل' }, defaultPrice: 0, scopeNote: AGREED_PER_PROJECT,
    includes: ['Orders, bookings, inventory, leads and performance in one place', 'Connected to your real data (Firebase, sheets, APIs)'] },
  { key: 'client_portal', group: 'dashboards', name: { en: 'Client portal', ar: 'بوابة العملاء' }, defaultPrice: 0, scopeNote: AGREED_PER_PROJECT,
    includes: ['Secure customer login', 'Account area built around your workflow'] },
  { key: 'custom_business_system', group: 'dashboards', name: { en: 'Custom business system / internal tool', ar: 'نظام أعمال مخصص / أداة داخلية' }, defaultPrice: 0, scopeNote: AGREED_PER_PROJECT },

  // QD Events
  { key: 'events_digital_invitation', group: 'events', name: { en: 'QD Events: digital invitation', ar: 'QD Events: دعوة رقمية' }, defaultPrice: 0, scopeNote: AGREED_PER_PROJECT,
    includes: ['Personalized invitation designed for the occasion', 'Event details, venue directions and schedule where included', 'An invitation link for each guest'] },
  { key: 'events_rsvp_guest_list', group: 'events', name: { en: 'RSVP and guest list', ar: 'تأكيد الحضور وقائمة الضيوف' }, defaultPrice: 0, scopeNote: AGREED_PER_PROJECT,
    includes: ['Guests confirm or decline online', 'Guest details, reply status and additional guests in one list'] },
  { key: 'events_seating', group: 'events', name: { en: 'Seating plan', ar: 'تنظيم الجلوس وتوزيع الطاولات' }, defaultPrice: 0, scopeNote: AGREED_PER_PROJECT,
    includes: ['Tables and seat assignments', 'Guests can view the seating published for them'] },
  { key: 'events_qr_checkin', group: 'events', name: { en: 'QR check-in', ar: 'تسجيل الحضور عبر QR' }, defaultPrice: 0, scopeNote: AGREED_PER_PROJECT,
    includes: ['QR-enabled invitations', 'Guest lookup and arrival recording on the day'] },
  { key: 'events_dashboard', group: 'events', name: { en: 'Event dashboard', ar: 'لوحة إدارة المناسبة' }, defaultPrice: 0, scopeNote: AGREED_PER_PROJECT,
    includes: ['Replies, guests and seating managed in one workspace'] }
];

// Picker groups for the admin quote editor, in display order.
export const CATALOG_GROUPS = [
  { id: 'websites', label: { en: 'Websites', ar: 'المواقع' } },
  { id: 'booking', label: { en: 'Booking & ordering', ar: 'الحجز والطلبات' } },
  { id: 'nfc', label: { en: 'NFC', ar: 'NFC' } },
  { id: 'ai', label: { en: 'AI chat & automation', ar: 'المحادثة الذكية والأتمتة' } },
  { id: 'dashboards', label: { en: 'Dashboards & systems', ar: 'اللوحات والأنظمة' } },
  { id: 'events', label: { en: 'Events', ar: 'المناسبات' } },
  { id: 'addons', label: { en: 'Add-ons', ar: 'إضافات' } },
  { id: 'care', label: { en: 'Care plans', ar: 'خطط العناية' } }
];

// Picker group for each pricing-model package (prices stay in pricing-model.js).
export const PACKAGE_GROUPS = {
  'qd-launch': 'websites',
  'qd-growth': 'websites',
  'qd-business-pro': 'websites',
  'qd-commerce-start': 'booking',
  'qd-commerce-growth': 'booking',
  'qd-booking-pro': 'booking',
  'qd-ordering-pro': 'booking',
  'qd-ops-dashboard': 'dashboards',
  'qd-ai-chatbot': 'ai'
};

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

// Everything the admin picker can add, grouped via CATALOG_GROUPS.
export const PICKER_CATALOG = [...FEATURE_CATALOG, ...SERVICE_CATALOG];

const ALL_CATALOG_ITEMS = [...FEATURE_CATALOG, ...SERVICE_CATALOG, ...INTERNAL_CATALOG];

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
    ...(Array.isArray(c.includes) && c.includes.length ? { includes: [...c.includes] } : {}),
    qty: c.defaultQty || 1,
    unitPrice: c.defaultPrice,
    ...overrides
  };
}
