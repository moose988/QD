// ============================================================================
// QD Client Brief Parser — deterministic, rule-based, zero AI.
// ============================================================================
// Input: free text describing a client and what they need (English / Arabic).
// Output: a proposed selection for the pricing engine, where EVERY detection
// carries the exact phrase that triggered it (evidence), so the admin can
// audit and confirm before any price is shown.
//
// Design rules:
//   - This parser only PROPOSES. It never prices. Pricing stays in
//     pricing-model.js. The admin always reviews before quoting.
//   - If nothing matches, say so loudly (warnings) instead of guessing.
//   - Add-ons already covered by the chosen package are surfaced with
//     coveredByPackage=true and NOT charged (no double-billing).
// ============================================================================

import {
  getIndustryPreset,
  FOUNDATION_COVERS,
  PACKAGE_COVERS
} from './pricing-model.js';

// --- keyword dictionaries -------------------------------------------------
// Each entry: [phrase, ...]. Phrases are matched case-insensitively as
// substrings of the normalized brief. Keep phrases specific enough to avoid
// false positives ("order" alone would catch "in order to" — use fuller forms).

const INDUSTRY_KEYWORDS = {
  'restaurant-cafe': [
    'restaurant', 'cafe', 'café', 'coffee shop', 'bakery', 'pastry', 'sweets shop',
    'food truck', 'dark kitchen', 'cloud kitchen', 'catering',
    'مطعم', 'مقهى', 'كافيه', 'كوفي', 'مخبز', 'حلويات', 'معجنات', 'مطبخ سحابي', 'تموين'
  ],
  'clinic-salon': [
    'clinic', 'dental', 'dentist', 'vet ', 'veterinary', 'salon', 'spa', 'barber',
    'med spa', 'medspa', 'physiotherapy', 'beauty center', 'beauty centre',
    'عيادة', 'أسنان', 'بيطري', 'صالون', 'سبا', 'حلاق', 'مركز تجميل', 'علاج طبيعي'
  ],
  'real-estate': [
    'real estate', 'property', 'properties', 'brokerage', 'broker', 'developer listings',
    'عقار', 'عقارات', 'وساطة عقارية', 'سمسار'
  ],
  'services-contractor': [
    'contractor', 'construction', 'cleaning company', 'maintenance company',
    'plumbing', 'electrical services', 'landscaping', 'moving company', 'pest control',
    'law firm', 'accounting firm', 'consultancy', 'consulting firm', 'event rental',
    'مقاول', 'مقاولات', 'إنشاءات', 'شركة تنظيف', 'صيانة عامة', 'سباكة', 'كهرباء',
    'تنسيق حدائق', 'نقل اثاث', 'نقل أثاث', 'مكافحة حشرات', 'محاماة', 'محاسبة', 'استشارات', 'تأجير فعاليات'
  ],
  'education-training': [
    'school', 'academy', 'training center', 'training centre', 'institute', 'courses',
    'coaching', 'tutoring', 'nursery', 'kindergarten',
    'مدرسة', 'أكاديمية', 'مركز تدريب', 'معهد', 'دورات', 'تدريب', 'حضانة', 'روضة'
  ]
};

const NEED_KEYWORDS = {
  ordering: [
    'online ordering', 'order online', 'ordering system', 'food ordering', 'delivery orders',
    'pickup orders', 'takeaway', 'menu with ordering', 'qr menu', 'qr ordering',
    'طلبات اونلاين', 'طلبات أونلاين', 'نظام طلبات', 'طلب اونلاين', 'توصيل الطلبات', 'استلام من الفرع', 'منيو إلكتروني', 'قائمة طعام إلكترونية'
  ],
  booking: [
    'booking', 'appointments', 'appointment system', 'reservations', 'reservation system',
    'schedule appointments', 'book a table', 'book online', 'calendar booking',
    'حجز', 'حجوزات', 'مواعيد', 'نظام مواعيد', 'حجز طاولة', 'حجز اونلاين'
  ],
  ecommerce: [
    'online store', 'online shop', 'ecommerce', 'e-commerce', 'webshop', 'sell products',
    'sell online', 'product catalog', 'product catalogue', 'shopping cart', 'checkout',
    'متجر الكتروني', 'متجر إلكتروني', 'بيع منتجات', 'بيع اونلاين', 'سلة شراء', 'كتالوج منتجات'
  ],
  chatbot: [
    'chatbot', 'chat bot', 'ai assistant', 'ai bot', 'automated chat', 'whatsapp bot',
    'شات بوت', 'روبوت محادثة', 'مساعد ذكي', 'رد آلي', 'بوت واتساب'
  ],
  dashboard: [
    'admin dashboard', 'internal dashboard', 'internal system', 'internal tool', 'admin panel',
    'back office', 'operations dashboard', 'management system', 'erp',
    'لوحة تحكم', 'نظام داخلي', 'لوحة إدارة', 'نظام إدارة'
  ],
  crm: [
    'crm', 'customer management', 'manage customers', 'leads pipeline', 'lead management',
    'sales pipeline', 'إدارة العملاء', 'إدارة عملاء', 'متابعة العملاء'
  ],
  loyalty: [
    'loyalty', 'points system', 'rewards program', 'rewards programme', 'punch card',
    'ولاء', 'نقاط مكافآت', 'برنامج مكافآت', 'نقاط ولاء'
  ],
  reviews: [
    'reviews', 'ratings', 'testimonials section', 'تقييمات', 'آراء العملاء', 'مراجعات'
  ],
  payments: [
    'online payment', 'payments online', 'payment gateway', 'accept payments', 'pay online',
    'card payments', 'دفع الكتروني', 'دفع إلكتروني', 'بوابة دفع', 'الدفع اونلاين', 'دفع بالبطاقة'
  ],
  bilingual: [
    'arabic and english', 'english and arabic', 'bilingual', 'two languages', 'both languages',
    'arabic version', 'multi-language', 'multilingual',
    'عربي وانجليزي', 'انجليزي وعربي', 'لغتين', 'ثنائي اللغة', 'نسخة عربية', 'متعدد اللغات'
  ],
  seo: [
    'seo', 'google ranking', 'rank on google', 'search engine', 'appear on google',
    'تحسين محركات البحث', 'الظهور في جوجل', 'سيو'
  ],
  maps: [
    'google maps', 'map embed', 'branch locations', 'location map', 'store locator',
    'خريطة', 'مواقع الفروع', 'خرائط جوجل'
  ],
  roles: [
    'driver app', 'drivers', 'staff roles', 'staff accounts', 'role permissions',
    'branch management', 'multiple branches', 'multi-branch', 'team accounts',
    'سائقين', 'صلاحيات الموظفين', 'حسابات موظفين', 'إدارة الفروع', 'عدة فروع'
  ],
  fileUploads: [
    'upload documents', 'document upload', 'file upload', 'upload files', 'approvals workflow',
    'رفع مستندات', 'رفع ملفات', 'موافقات'
  ],
  quoteForm: [
    'quote calculator', 'price calculator', 'instant quote', 'cost estimator', 'quotation form',
    'حاسبة اسعار', 'حاسبة أسعار', 'عرض سعر تلقائي', 'حاسبة تكلفة'
  ],
  gbp: [
    'google business profile', 'google my business', 'google business listing',
    'نشاطي التجاري', 'قوقل ماي بزنس', 'ملف جوجل التجاري'
  ],
  maintenance: [
    'maintenance', 'monthly support', 'ongoing support', 'support plan', 'care plan',
    'keep it updated', 'manage the website',
    'صيانة', 'دعم شهري', 'دعم مستمر', 'إدارة الموقع'
  ],
  whatsapp: [
    'whatsapp', 'whats app', 'واتساب', 'واتس اب'
  ],
  website: [
    'website', 'web site', 'landing page', 'web page', 'webpage', 'site for',
    'موقع', 'صفحة هبوط', 'موقع الكتروني', 'موقع إلكتروني'
  ]
};

// need → add-on id in the pricing model (when the need is an add-on, not a package)
const NEED_TO_ADDON = {
  booking: 'booking-integration',
  ordering: 'ordering-integration',
  chatbot: 'ai-chatbot-upgrade',
  dashboard: 'dashboard-pack',
  crm: 'crm-setup',
  loyalty: 'loyalty-integration',
  reviews: 'reviews-integration',
  payments: 'payment-gateway',
  bilingual: 'extra-language',
  seo: 'seo-pack',
  maps: 'map-embed',
  roles: 'roles-logic',
  fileUploads: 'file-uploads',
  quoteForm: 'smart-form',
  gbp: 'gbp-setup'
};

// --- matching helpers -------------------------------------------------------

const normalize = (text) => String(text || '')
  .toLowerCase()
  .replace(/[أإآ]/g, 'ا')
  .replace(/ة/g, 'ه')
  .replace(/\s+/g, ' ')
  .trim();

const findMatches = (normalized, phrases) => {
  const hits = [];
  for (const phrase of phrases) {
    const p = normalize(phrase);
    if (p && normalized.includes(p)) hits.push(phrase.trim());
  }
  return hits;
};

const extractCount = (normalized, units) => {
  // e.g. "120 products" / "8 pages" / "١٢ صفحة" (after Arabic-digit conversion)
  const arabicDigits = normalized.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const re = new RegExp(`(\\d+)\\s*(?:${units.join('|')})`, 'i');
  const m = arabicDigits.match(re);
  return m ? Number(m[1]) : null;
};

// --- main -------------------------------------------------------------------

/**
 * parseBrief(text) → deterministic proposal for the pricing engine.
 * Never prices anything; only maps phrases → model ids, with evidence.
 */
export function parseBrief(text) {
  const normalized = normalize(text);
  const warnings = [];
  const notes = [];

  if (!normalized || normalized.length < 8) {
    return { industry: null, foundation: null, specials: [], pagesStandard: 0, pagesLanding: 0, addons: [], carePlanId: null, signals: {}, warnings: ['Brief is empty or too short to analyze.'], notes: [] };
  }

  // 1. Detect needs + industry, all with evidence
  const needs = {};
  for (const [need, phrases] of Object.entries(NEED_KEYWORDS)) {
    const hits = findMatches(normalized, phrases);
    if (hits.length) needs[need] = hits;
  }

  // Negation handling: "no website" / "without a website" must not count as
  // wanting a website (otherwise system-only offers get a foundation added).
  const WEBSITE_NEGATIONS = ['no website', 'without a website', 'without website', 'not a website', 'بدون موقع', 'من غير موقع', 'مش موقع'];
  if (needs.website && WEBSITE_NEGATIONS.some((p) => normalized.includes(normalize(p)))) {
    delete needs.website;
  }

  let industry = null;
  for (const [id, phrases] of Object.entries(INDUSTRY_KEYWORDS)) {
    const hits = findMatches(normalized, phrases);
    if (hits.length) { industry = { id, evidence: hits }; break; }
  }

  // 2. Numeric signals
  const pageCount = extractCount(normalized, ['pages?', 'صفحات', 'صفحه']);
  const productCount = extractCount(normalized, ['products?', 'items?', 'منتجات', 'منتج', 'صنف', 'اصناف']);

  const signals = {
    pageCount,
    productCount,
    bilingual: !!needs.bilingual,
    wantsWebsite: !!needs.website || !!industry,
    detectedNeeds: Object.keys(needs)
  };

  // 3. Compose the offer from COMPONENTS — deterministic priority order.
  //    (Not package based: base build + pages + features, each its own line.)
  let foundation = null;       // { id, reason, evidence }
  const specials = [];         // [{ id, reason, evidence }]
  let pagesStandard = 0;
  let pagesLanding = 0;

  const needCount = Object.keys(needs).length;
  const wantsOrdering = !!needs.ordering;
  const wantsBooking = !!needs.booking;
  const featureHeavy = ['crm', 'dashboard', 'roles', 'fileUploads', 'loyalty'].filter((n) => needs[n]).length;

  // 3a. Self-contained system builds first
  if (needs.ecommerce) {
    if (productCount != null && productCount > 50) {
      specials.push({ id: 'qd-commerce-growth', reason: `Online store with ${productCount} products (>50 → larger store build)`, evidence: needs.ecommerce });
    } else {
      specials.push({ id: 'qd-commerce-start', reason: productCount != null ? `Online store with ${productCount} products (≤50)` : 'Online store (product count unknown → smaller store build; upgrade if >50 products)', evidence: needs.ecommerce });
      if (productCount == null) warnings.push('Product count not stated — assumed ≤50 products for the store build. Confirm with client.');
    }
  }
  if (needs.dashboard && !signals.wantsWebsite && !needs.ecommerce) {
    specials.push({ id: 'qd-ops-dashboard', reason: 'Internal system / dashboard without a public website', evidence: needs.dashboard });
  }
  if (needs.chatbot && !signals.wantsWebsite && !needs.ecommerce && specials.length === 0 && needCount <= 2) {
    specials.push({ id: 'qd-ai-chatbot', reason: 'Chatbot-only engagement', evidence: needs.chatbot });
  }

  // 3b. Website foundation (skipped if the offer is store-only / system-only)
  const isSystemOnly = specials.length > 0 && !signals.wantsWebsite;
  const storeSelected = specials.some((s) => s.id.startsWith('qd-commerce'));
  if (!isSystemOnly && !storeSelected && (signals.wantsWebsite || wantsOrdering || wantsBooking || needCount > 0)) {
    foundation = { id: 'web-base', reason: 'Website requested or implied → Website base with 5 pages included', evidence: needs.website || [] };

    // Pages: stated count, else honest defaults per tier (always flagged)
    if (pageCount != null) {
      pagesStandard = Math.min(pageCount, 200);
    } else {
      pagesStandard = 5;
      warnings.push(`Page count not stated — defaulted to ${pagesStandard} content pages. Adjust before quoting.`);
    }
  } else if (storeSelected && pageCount != null && pageCount > 0) {
    // Store builds include shop flows; extra content pages billed per page.
    pagesStandard = Math.min(pageCount, 200);
    notes.push(`Store build includes shop flows; the ${pagesStandard} stated content pages are billed per page on top.`);
  }

  // 3c. Feature add-ons from remaining needs (each with evidence).
  //     Needs that became a special build are skipped; coverage handled below.
  const coveredByBase = new Set();
  if (foundation) (FOUNDATION_COVERS[foundation.id] || []).forEach((id) => coveredByBase.add(id));
  specials.forEach((s) => (PACKAGE_COVERS[s.id] || []).forEach((id) => coveredByBase.add(id)));

  const addons = [];
  for (const [need, addonId] of Object.entries(NEED_TO_ADDON)) {
    if (!needs[need]) continue;
    if (need === 'ecommerce') continue;
    if (need === 'dashboard' && specials.some((s) => s.id === 'qd-ops-dashboard')) continue;
    if (need === 'chatbot' && specials.some((s) => s.id === 'qd-ai-chatbot')) continue;
    // Ordering/booking as the offer centerpiece → standard (mid) scope by default
    const centerpiece = (need === 'ordering' || need === 'booking');
    addons.push({
      id: addonId,
      tier: centerpiece ? 'mid' : 'low',
      qty: 1,
      evidence: needs[need],
      source: 'detected',
      coveredByPackage: coveredByBase.has(addonId)
    });
  }

  // 3d. Industry → band check only (no silent preset padding)
  if (industry && !getIndustryPreset(industry.id)) industry = null;

  // 4. Care plan suggestion: scale with what's being built.
  let carePlanId = null;
  if (specials.some((s) => s.id.startsWith('qd-commerce'))) carePlanId = 'care-commerce';
  else if (specials.some((s) => s.id === 'qd-ops-dashboard')) carePlanId = 'portal-ops';
  else if (specials.some((s) => s.id === 'qd-ai-chatbot') && !foundation) carePlanId = 'automation-desk';
  else if (foundation) carePlanId = 'care-basic';
  if (carePlanId && !needs.maintenance) {
    notes.push('Care plan suggested to match the build — client did not explicitly ask for maintenance.');
  }

  // 5. Informational notes
  if (needs.whatsapp) notes.push('WhatsApp button/CTA is included in every base build at no extra charge. WhatsApp automation = Automation Desk monthly plan; message volume is pass-through.');
  if (needs.maintenance) notes.push('Client explicitly mentioned maintenance/support — monthly plan is justified in the proposal.');
  if (needCount === 0 && !industry) {
    warnings.push('Nothing recognized in the brief. Check spelling or select components manually — do NOT guess a price.');
  }

  return {
    industry,
    foundation,
    specials,
    pagesStandard,
    pagesLanding,
    addons,
    carePlanId,
    signals,
    warnings,
    notes
  };
}
