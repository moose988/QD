// ============================================================================
// QD Systems Pricing Model — SINGLE SOURCE OF TRUTH
// ============================================================================
// Derived from: "QD Systems UAE Web and Digital Systems Pricing Benchmark"
// (deep-research report, June 11, 2026; 29 public sources R01–R29).
//
// VERIFICATION: 4 load-bearing anchors were re-checked live on 2026-06-11:
//   - WordPress.com Custom Development: from US$5,000  (≈ AED 18,362)  ✓ exact
//   - WP Buffs maintenance: $89 / $179 / $239 / $359 per month         ✓ exact
//   - GloriaFood: core free, POS $49/mo/location, promo $19/mo         ✓ exact
//   - Retool: Team $10 builder + $5 user; Business $50 + $15           ✓ exact
//
// PRICING DISCIPLINE (do not break these rules when editing):
//   1. basis: 'market'      → number traceable to public source refs (R##).
//   2. basis: 'positioning' → QD strategic price, sits between freelancer
//      band (R29: AED 1,100–2,200 template jobs) and custom-build anchors
//      (R05/R29: AED 18,362–110,175+). Not a market claim.
//   3. Usage-based costs (WhatsApp, SMS, Maps API, payment fees, AI bot
//      volume) are ALWAYS pass-through, never bundled flat (per R13, R16,
//      R17, R19, R28).
//   4. Mid tier = arithmetic midpoint of the documented low–high range,
//      rounded to nearest 50. It is a convenience default, not a source.
//
// See docs/PRICING_MODEL.md for the full source table.
// ============================================================================

export const PRICING_VERSION = '2026-06-11';
export const CURRENCY = 'AED';
export const DEFAULT_VAT_PERCENT = 5;

// ---------------------------------------------------------------------------
// Website / system packages (one-time build fee, AED)
// ---------------------------------------------------------------------------
export const PACKAGES = [
  {
    id: 'qd-launch',
    name: { en: 'QD Launch Site', ar: 'موقع الانطلاق' },
    oneTime: 5900,
    from: false,
    suggestedCarePlan: 'care-lite',
    bestFor: { en: 'New SMEs, single-location service firms', ar: 'الشركات الناشئة والخدمات ذات الفرع الواحد' },
    includes: [
      'Up to 5 pages', 'Contact / lead forms', 'WhatsApp CTA',
      'Mobile optimisation', 'Basic on-page SEO',
      'Google Business Profile setup', 'Analytics install'
    ],
    basis: 'positioning',
    basisNote: 'Above freelancer template jobs (R29), well below custom-build anchors (R05, R29).'
  },
  {
    id: 'qd-growth',
    name: { en: 'QD Growth Website', ar: 'موقع النمو' },
    oneTime: 9900,
    from: false,
    suggestedCarePlan: 'care-growth',
    bestFor: { en: 'Established SMEs', ar: 'الشركات القائمة' },
    includes: [
      '8–12 pages', 'Blog / news', 'Case studies', 'Advanced forms',
      'CRM handoff', 'GA4 / Search Console', 'Speed pass', 'Stronger design polish'
    ],
    basis: 'positioning',
    basisNote: 'Below the public US$5,000 custom-development anchor (R05) with room for quality.'
  },
  {
    id: 'qd-business-pro',
    name: { en: 'QD Business Pro Website', ar: 'موقع الأعمال الاحترافي' },
    oneTime: 14900,
    from: false,
    suggestedCarePlan: 'care-growth',
    bestFor: { en: 'Multi-service SMEs, bilingual brands', ar: 'الشركات متعددة الخدمات والعلامات ثنائية اللغة' },
    includes: [
      '12–20 pages', 'Arabic / English structure', 'Custom sections',
      'Staff / admin editing roles', 'Automation-ready forms',
      'Basic mini-dashboard / reporting'
    ],
    basis: 'positioning',
    basisNote: 'Premium SME tier; still under many public custom-build anchors (R05, R29).'
  },
  {
    id: 'qd-commerce-start',
    name: { en: 'QD Commerce Start', ar: 'المتجر الإلكتروني — بداية' },
    oneTime: 12900,
    from: false,
    suggestedCarePlan: 'care-commerce',
    softwarePassThrough: true,
    bestFor: { en: 'Retailers and simple ecommerce launches', ar: 'المتاجر وإطلاقات التجارة الإلكترونية البسيطة' },
    includes: [
      'Up to 50 products', 'Payments', 'Shipping', 'Coupons',
      'Review app integration', 'Basic product filters', 'Training'
    ],
    basis: 'positioning',
    basisNote: 'For SMEs that need a real store, not just a builder subscription (R03, R04).'
  },
  {
    id: 'qd-commerce-growth',
    name: { en: 'QD Commerce Growth', ar: 'المتجر الإلكتروني — نمو' },
    oneTime: 21900,
    from: false,
    suggestedCarePlan: 'care-commerce',
    softwarePassThrough: true,
    bestFor: { en: 'Serious retail / D2C SMEs', ar: 'تجارة التجزئة الجادة والبيع المباشر' },
    includes: [
      '50–250 products', 'Abandoned-cart setup', 'Loyalty / reviews integrations',
      'CRM sync', 'Advanced analytics', 'Multi-collection merchandising'
    ],
    basis: 'positioning',
    basisNote: 'Supported by public ecommerce, loyalty, and automation benchmarks (R03, R22, R23).'
  },
  {
    id: 'qd-booking-pro',
    name: { en: 'QD Booking Pro', ar: 'نظام الحجوزات برو' },
    oneTime: 13900,
    from: false,
    suggestedCarePlan: 'care-growth',
    softwarePassThrough: true,
    bestFor: { en: 'Clinics, salons, consultants, classes', ar: 'العيادات والصالونات والاستشاريون والدورات' },
    includes: [
      'Branded website + booking flow', 'Staff calendars',
      'Email / WhatsApp notifications', 'Admin approvals', 'No-show policy setup'
    ],
    basis: 'positioning',
    basisNote: 'Sits above raw software cost (R18, R19, R21) and covers workflow implementation.'
  },
  {
    id: 'qd-ordering-pro',
    name: { en: 'QD Ordering Pro', ar: 'نظام الطلبات برو' },
    oneTime: 13900,
    from: false,
    suggestedCarePlan: 'care-growth',
    softwarePassThrough: true,
    bestFor: { en: 'Cafés, restaurants, food businesses', ar: 'المقاهي والمطاعم وأعمال الأغذية' },
    includes: [
      'Menu / order flow', 'Pickup / delivery logic', 'Branch rules',
      'Status updates', 'Admin dashboard', 'Promo hooks'
    ],
    basis: 'positioning',
    basisNote: 'Benchmarked against GloriaFood / Square-style software (R18, R20) plus integration labour.'
  },
  {
    id: 'qd-ops-dashboard',
    name: { en: 'QD Ops Dashboard MVP', ar: 'لوحة العمليات الداخلية MVP' },
    oneTime: 18900,
    from: true,
    suggestedCarePlan: 'portal-ops',
    bestFor: { en: 'SMEs wanting internal tools', ar: 'الشركات التي تحتاج أدوات داخلية' },
    includes: [
      'Admin dashboard', 'Role-based access', 'Records', 'Statuses',
      'Filters', 'Exports', 'Simple reports', 'Audit logs'
    ],
    basis: 'positioning',
    basisNote: 'Strongly supported by Retool / Bubble / Softr pricing (R09–R11) plus custom service anchors (R05).'
  },
  {
    id: 'qd-ai-chatbot',
    name: { en: 'QD AI Chatbot Launch', ar: 'روبوت المحادثة الذكي' },
    oneTime: 2900,
    from: true,
    suggestedCarePlan: 'automation-desk',
    softwarePassThrough: true,
    bestFor: { en: 'Lead capture, FAQ reduction, service support', ar: 'جمع العملاء المحتملين وتقليل الأسئلة المتكررة' },
    includes: [
      'Bot setup', 'Training content import', 'Handoff rules',
      'Lead form capture', 'Analytics', 'Basic refinement'
    ],
    basis: 'positioning',
    basisNote: 'Platform / API usage billed separately (R12–R15). Never bundle usage flat.'
  }
];

// ---------------------------------------------------------------------------
// Add-on menu (one-time, AED). low/high straight from the benchmark report.
// fixed === true → single price, no tier choice.
// perUnit → quantity input (pages, languages).
// ---------------------------------------------------------------------------
export const ADDONS = [
  { id: 'extra-page',          name: { en: 'Extra standard content page', ar: 'صفحة محتوى إضافية' },                low: 250,  high: 250,  fixed: true, perUnit: 'page',     basis: 'positioning' },
  { id: 'extra-landing',       name: { en: 'Extra advanced landing page', ar: 'صفحة هبوط متقدمة إضافية' },          low: 450,  high: 450,  fixed: true, perUnit: 'page',     basis: 'positioning' },
  { id: 'extra-language',      name: { en: 'Additional language enablement', ar: 'تفعيل لغة إضافية' },              low: 1500, high: 1500, fixed: true, perUnit: 'language', basis: 'positioning' },
  { id: 'smart-form',          name: { en: 'Quote / calculator / smart form', ar: 'نموذج ذكي / حاسبة أسعار' },      low: 1500, high: 3500, basis: 'market', refs: ['R24'] },
  { id: 'crm-setup',           name: { en: 'CRM setup & pipeline customisation', ar: 'إعداد CRM وتخصيص المسار' },   low: 1900, high: 4900, basis: 'market', refs: ['R06', 'R07', 'R08'] },
  { id: 'booking-integration', name: { en: 'Booking engine integration', ar: 'تكامل محرك الحجوزات' },               low: 1500, high: 3900, basis: 'market', refs: ['R18', 'R19', 'R21'] },
  { id: 'ordering-integration',name: { en: 'Ordering system integration', ar: 'تكامل نظام الطلبات' },               low: 2500, high: 5900, basis: 'market', refs: ['R20'] },
  { id: 'payment-gateway',     name: { en: 'Payment gateway integration', ar: 'تكامل بوابة الدفع' },                low: 1500, high: 1500, fixed: true, basis: 'positioning' },
  { id: 'reviews-integration', name: { en: 'Reviews integration', ar: 'تكامل نظام التقييمات' },                     low: 750,  high: 1500, basis: 'market', refs: ['R22'] },
  { id: 'loyalty-integration', name: { en: 'Loyalty programme integration', ar: 'تكامل برنامج الولاء' },            low: 1500, high: 3500, basis: 'market', refs: ['R23'] },
  { id: 'ai-chatbot-upgrade',  name: { en: 'AI chatbot setup / upgrade', ar: 'إعداد / ترقية روبوت المحادثة' },      low: 2900, high: 6900, basis: 'market', refs: ['R12', 'R13', 'R14', 'R15'] },
  { id: 'dashboard-pack',      name: { en: 'Dashboard reporting pack', ar: 'حزمة لوحات التقارير' },                 low: 2500, high: 6900, basis: 'market', refs: ['R09', 'R10', 'R11'] },
  { id: 'roles-logic',         name: { en: 'Staff / driver / branch role logic', ar: 'منطق أدوار الموظفين والفروع' },low: 3900, high: 8900, basis: 'positioning' },
  { id: 'file-uploads',        name: { en: 'File upload, approvals & document trail', ar: 'رفع الملفات والموافقات وسجل المستندات' }, low: 1250, high: 3500, basis: 'positioning' },
  { id: 'gbp-setup',           name: { en: 'Google Business Profile setup', ar: 'إعداد ملف نشاطي التجاري في جوجل' },low: 600,  high: 600,  fixed: true, basis: 'positioning', refs: ['R27'], note: 'Tool itself is free; price covers setup service.' },
  { id: 'map-embed',           name: { en: 'Basic map embed / branch map', ar: 'تضمين خريطة أساسية / خريطة فروع' }, low: 750,  high: 750,  fixed: true, basis: 'positioning' },
  { id: 'api-map',             name: { en: 'API-based map / locator logic', ar: 'خرائط API / محدد مواقع متقدم' },   low: 2500, high: 2500, from: true, basis: 'positioning', refs: ['R28'], note: 'Plus pass-through Google Maps API fees (variable).' },
  { id: 'seo-pack',            name: { en: 'SEO launch pack', ar: 'حزمة إطلاق SEO' },                               low: 1500, high: 1500, fixed: true, basis: 'positioning' }
];

// ---------------------------------------------------------------------------
// Monthly care / recurring plans (AED per month)
// Benchmarked against WP Buffs public range AED ~327–1,318/mo (R26, verified).
// ---------------------------------------------------------------------------
export const CARE_PLANS = [
  { id: 'none',            name: { en: 'No monthly plan', ar: 'بدون خطة شهرية' }, monthly: 0,    scope: '' },
  { id: 'care-lite',       name: { en: 'Care Lite', ar: 'العناية الأساسية' },     monthly: 249,  scope: 'Updates, backups, uptime checks, minor content edits, monthly snapshot report', refs: ['R26'] },
  { id: 'care-growth',     name: { en: 'Care Growth', ar: 'عناية النمو' },        monthly: 599,  scope: '+ One focused improvement task, form testing, GA4 review, basic SEO hygiene', refs: ['R26'] },
  { id: 'care-commerce',   name: { en: 'Care Commerce', ar: 'عناية المتاجر' },    monthly: 1299, scope: '+ Checkout / order-flow checks, app & plugin monitoring, promo implementation support', refs: ['R26'] },
  { id: 'portal-ops',      name: { en: 'Portal Ops', ar: 'تشغيل البوابات' },      monthly: 1999, scope: 'Dashboard support, role testing, workflow fixes, admin support, monthly ops review', refs: ['R26'] },
  { id: 'automation-desk', name: { en: 'Automation Desk', ar: 'مكتب الأتمتة' },   monthly: 349,  usage: true, scope: 'Chatbot tuning, CRM automations, email / WhatsApp campaign support (+ usage)', refs: ['R13', 'R16', 'R17'] }
];

// ---------------------------------------------------------------------------
// Industry presets (from the benchmark's industry-specific table)
// band = recommended one-time build range; monthlyBand = recurring range.
// ---------------------------------------------------------------------------
export const INDUSTRY_PRESETS = [
  {
    id: 'clinic-salon',
    name: { en: 'Clinic / Salon / Med Spa', ar: 'عيادة / صالون' },
    packageId: 'qd-booking-pro',
    addonIds: ['crm-setup', 'reviews-integration', 'gbp-setup'],
    carePlanId: 'care-growth',
    band: [9900, 15900], monthlyBand: [499, 799],
    why: 'Booking, reminders, staff calendars, service rules, light CRM'
  },
  {
    id: 'restaurant-cafe',
    name: { en: 'Restaurant / Café / Food', ar: 'مطعم / مقهى' },
    packageId: 'qd-ordering-pro',
    addonIds: ['gbp-setup', 'map-embed', 'loyalty-integration'],
    carePlanId: 'care-growth',
    band: [11900, 18900], monthlyBand: [599, 899],
    why: 'Ordering, branch rules, promos, status updates, menu ops'
  },
  {
    id: 'real-estate',
    name: { en: 'Real Estate / Brokerage', ar: 'عقارات / وساطة' },
    packageId: 'qd-business-pro',
    addonIds: ['crm-setup', 'dashboard-pack', 'api-map'],
    carePlanId: 'care-growth',
    band: [14900, 24900], monthlyBand: [699, 1099],
    why: 'Lead forms, listings, CRM routing, portal / dashboard needs'
  },
  {
    id: 'services-contractor',
    name: { en: 'Professional Services / Contractor', ar: 'خدمات مهنية / مقاولات' },
    packageId: 'qd-growth',
    addonIds: ['smart-form', 'gbp-setup', 'seo-pack'],
    carePlanId: 'care-lite',
    band: [8900, 14900], monthlyBand: [399, 699],
    why: 'Lead gen, quote forms, booking, trust signals, multilingual ready'
  },
  {
    id: 'education-training',
    name: { en: 'Training / Education / Coaching', ar: 'تدريب / تعليم' },
    packageId: 'qd-booking-pro',
    addonIds: ['file-uploads', 'dashboard-pack'],
    carePlanId: 'care-growth',
    band: [12900, 19900], monthlyBand: [599, 999],
    why: 'Scheduling, forms, gated content, lightweight portal / admin logic'
  }
];

// ---------------------------------------------------------------------------
// COMPONENT-BASED PRICING (primary model — not package based)
// ---------------------------------------------------------------------------
// An offer is priced as: BASE BUILD + PAGES + FEATURES (+ care, − discount).
//
// FOUNDATIONS are derived arithmetically from the package anchors above by
// removing the per-page rate (AED 250/page), so the numbers stay traceable:
//   Essential    = Launch anchor 5,900 − 5 × 250  = 4,650
//   Professional = Growth anchor 9,900 − 10 × 250 = 7,400
//   Premium      = Business Pro anchor 14,900 − 16 × 250 = 10,900
// Pages are then ALWAYS billed per page (250 standard / 450 landing), making
// the price continuous in scope instead of locked to package boxes.
// Sanity check: foundation + N pages reproduces each anchor exactly.
// ---------------------------------------------------------------------------
export const PAGE_RATE_STANDARD = 250; // = ADDONS extra-page
export const PAGE_RATE_LANDING = 450;  // = ADDONS extra-landing

export const FOUNDATIONS = [
  {
    id: 'foundation-essential',
    name: { en: 'Essential build', ar: 'بناء أساسي' },
    base: 4650,
    derivation: 'Launch anchor 5,900 − 5 pages × 250',
    bestFor: { en: 'Simple presence: design, responsive build, forms, WhatsApp CTA, basic SEO, GBP setup, analytics', ar: 'حضور بسيط' },
    includes: ['Custom responsive design', 'Contact / lead forms', 'WhatsApp CTA', 'Basic on-page SEO', 'Google Business Profile setup', 'Analytics install', 'Hosting & domain setup'],
    basis: 'positioning'
  },
  {
    id: 'foundation-professional',
    name: { en: 'Professional build', ar: 'بناء احترافي' },
    base: 7400,
    derivation: 'Growth anchor 9,900 − 10 pages × 250',
    bestFor: { en: 'Growing businesses: + blog/news, case studies, advanced forms, CRM handoff, GA4/GSC, speed pass, design polish', ar: 'أعمال متنامية' },
    includes: ['Everything in Essential', 'Blog / news system', 'Case studies', 'Advanced forms', 'CRM handoff', 'GA4 / Search Console', 'Speed pass', 'Stronger design polish'],
    basis: 'positioning'
  },
  {
    id: 'foundation-premium',
    name: { en: 'Premium build', ar: 'بناء متميز' },
    base: 10900,
    derivation: 'Business Pro anchor 14,900 − 16 pages × 250',
    bestFor: { en: 'Bilingual brands & multi-service firms: + AR/EN structure, custom sections, editing roles, automation-ready forms, mini-dashboard', ar: 'علامات ثنائية اللغة' },
    includes: ['Everything in Professional', 'Arabic / English structure', 'Custom sections', 'Staff / admin editing roles', 'Automation-ready forms', 'Mini-dashboard / reporting'],
    basis: 'positioning'
  }
];

// Capabilities already inside each foundation (no double-charging).
// Foundations are supersets: higher tiers cover everything lower ones do.
export const FOUNDATION_COVERS = {
  'foundation-essential':    ['gbp-setup'],
  'foundation-professional': ['gbp-setup'],
  'foundation-premium':      ['gbp-setup', 'extra-language']
};

// Self-contained system builds that do NOT need a website foundation.
// These reuse the verified package anchors 1:1 (same ids, same prices,
// same coverage rules) — only the presentation is component-style.
export const SPECIAL_BUILDS = [
  {
    id: 'qd-commerce-start',
    name: { en: 'Online store build (up to 50 products)', ar: 'بناء متجر إلكتروني (حتى ٥٠ منتج)' },
    note: 'Storefront, payments, shipping, coupons, reviews app, filters, training. Content pages billed per page on top.'
  },
  {
    id: 'qd-commerce-growth',
    name: { en: 'Online store build (50–250 products)', ar: 'بناء متجر إلكتروني (٥٠–٢٥٠ منتج)' },
    note: 'Adds abandoned-cart, loyalty & reviews integrations, CRM sync, advanced analytics, merchandising.'
  },
  {
    id: 'qd-ops-dashboard',
    name: { en: 'Internal ops system (MVP)', ar: 'نظام عمليات داخلي (MVP)' },
    note: 'Standalone internal tool: dashboard, roles, records, statuses, filters, exports, reports, audit logs.'
  },
  {
    id: 'qd-ai-chatbot',
    name: { en: 'AI chatbot (standalone launch)', ar: 'روبوت محادثة ذكي (مستقل)' },
    note: 'Bot setup, training content, handoff rules, lead capture, analytics. Platform/API usage pass-through.'
  }
];

export const getFoundation = (id) => FOUNDATIONS.find((f) => f.id === id) || null;
export const getSpecialBuild = (id) => SPECIAL_BUILDS.find((s) => s.id === id) || null;

// ---------------------------------------------------------------------------
// Quick offers — one-click starting points composed ONLY of components above.
// Price = sum of components (computed, never a separate invented number).
// ---------------------------------------------------------------------------
export const OFFER_TEMPLATES = [
  {
    id: 'tpl-starter-presence',
    name: { en: 'Starter Presence', ar: 'حضور أساسي' },
    pitch: 'Get found and look professional: essential build, 5 pages, SEO pack.',
    foundationId: 'foundation-essential', pagesStandard: 5, pagesLanding: 0,
    specials: [], addons: [{ id: 'seo-pack' }], carePlanId: 'care-lite'
  },
  {
    id: 'tpl-site-chatbot',
    name: { en: 'Website + AI Chatbot', ar: 'موقع + روبوت ذكي' },
    pitch: 'Professional site with an AI assistant capturing leads 24/7.',
    foundationId: 'foundation-professional', pagesStandard: 8, pagesLanding: 0,
    specials: [], addons: [{ id: 'ai-chatbot-upgrade', tier: 'low' }], carePlanId: 'care-growth'
  },
  {
    id: 'tpl-full-business',
    name: { en: 'Full Business System', ar: 'نظام أعمال متكامل' },
    pitch: 'Bilingual premium site + dashboard + CRM + AI chatbot.',
    foundationId: 'foundation-premium', pagesStandard: 12, pagesLanding: 0,
    specials: [], addons: [{ id: 'dashboard-pack', tier: 'low' }, { id: 'crm-setup', tier: 'low' }, { id: 'ai-chatbot-upgrade', tier: 'low' }], carePlanId: 'portal-ops'
  },
  {
    id: 'tpl-commerce-complete',
    name: { en: 'Commerce Complete', ar: 'تجارة متكاملة' },
    pitch: 'Serious store with loyalty + CRM built in, plus SEO and a sales bot.',
    foundationId: null, pagesStandard: 0, pagesLanding: 0,
    specials: ['qd-commerce-growth'], addons: [{ id: 'seo-pack' }, { id: 'ai-chatbot-upgrade', tier: 'low' }], carePlanId: 'care-commerce'
  },
  {
    id: 'tpl-premium-custom',
    name: { en: 'Premium Custom System', ar: 'نظام مخصص متقدم' },
    pitch: 'Internal ops platform with workflows, loyalty, smart forms and CRM.',
    foundationId: null, pagesStandard: 0, pagesLanding: 0,
    specials: ['qd-ops-dashboard'], addons: [{ id: 'loyalty-integration', tier: 'low' }, { id: 'smart-form', tier: 'low' }, { id: 'crm-setup', tier: 'low' }], carePlanId: 'portal-ops'
  }
];

export const getOfferTemplate = (id) => OFFER_TEMPLATES.find((t) => t.id === id) || null;

// Indicative starting price of a quick offer = sum of its components at low tier.
export function getTemplateStartingPrice(templateId) {
  const tpl = getOfferTemplate(templateId);
  if (!tpl) return 0;
  let total = 0;
  const covered = new Set();
  if (tpl.foundationId) {
    const f = getFoundation(tpl.foundationId);
    if (f) { total += f.base; (FOUNDATION_COVERS[f.id] || []).forEach((id) => covered.add(id)); }
  }
  total += (tpl.pagesStandard || 0) * PAGE_RATE_STANDARD + (tpl.pagesLanding || 0) * PAGE_RATE_LANDING;
  for (const sid of tpl.specials || []) {
    const pkg = PACKAGES.find((p) => p.id === sid);
    if (pkg) { total += pkg.oneTime; (PACKAGE_COVERS[sid] || []).forEach((id) => covered.add(id)); }
  }
  for (const a of tpl.addons || []) {
    if (covered.has(a.id)) continue;
    const addon = ADDONS.find((x) => x.id === a.id);
    if (addon) total += addon.low;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Source register (condensed; full table in the benchmark PDF and
// docs/PRICING_MODEL.md). verified === re-checked live on PRICING_VERSION date.
// ---------------------------------------------------------------------------
export const SOURCES = [
  { ref: 'R01', name: 'Hostinger',        url: 'https://www.hostinger.com/pricing' },
  { ref: 'R02', name: 'Wix',              url: 'https://www.wix.com/upgrade/website' },
  { ref: 'R03', name: 'Webflow',          url: 'https://webflow.com/pricing' },
  { ref: 'R04', name: 'WooCommerce',      url: 'https://woocommerce.com/pricing/' },
  { ref: 'R05', name: 'WordPress.com Custom Dev (from US$5,000)', url: 'https://wordpress.com/website-design-service/', verified: true },
  { ref: 'R06', name: 'Zoho CRM',         url: 'https://www.zoho.com/crm/zohocrm-pricing.html' },
  { ref: 'R07', name: 'Salesforce',       url: 'https://www.salesforce.com/sales/pricing/' },
  { ref: 'R08', name: 'Pipedrive',        url: 'https://www.pipedrive.com/en/pricing' },
  { ref: 'R09', name: 'Retool ($10+$5 / $50+$15)', url: 'https://retool.com/pricing', verified: true },
  { ref: 'R10', name: 'Bubble',           url: 'https://bubble.io/pricing' },
  { ref: 'R11', name: 'Softr',            url: 'https://www.softr.io/pricing' },
  { ref: 'R12', name: 'Tidio',            url: 'https://www.tidio.com/pricing/' },
  { ref: 'R13', name: 'Intercom',         url: 'https://www.intercom.com/pricing' },
  { ref: 'R14', name: 'ManyChat',         url: 'https://manychat.com/pricing' },
  { ref: 'R15', name: 'Landbot',          url: 'https://landbot.io/pricing' },
  { ref: 'R16', name: 'Twilio SMS',       url: 'https://www.twilio.com/en-us/sms/pricing/us' },
  { ref: 'R17', name: 'Twilio WhatsApp',  url: 'https://www.twilio.com/en-us/whatsapp/pricing' },
  { ref: 'R18', name: 'Square Appointments', url: 'https://squareup.com/us/en/appointments/pricing' },
  { ref: 'R19', name: 'Fresha',           url: 'https://www.fresha.com/pricing' },
  { ref: 'R20', name: 'GloriaFood (free / $19 / $49)', url: 'https://www.gloriafood.com/pricing', verified: true },
  { ref: 'R21', name: 'Calendly',         url: 'https://calendly.com/pricing' },
  { ref: 'R22', name: 'Judge.me',         url: 'https://judge.me/pricing' },
  { ref: 'R23', name: 'Smile.io',         url: 'https://smile.io/pricing' },
  { ref: 'R24', name: 'PandaDoc',         url: 'https://www.pandadoc.com/pricing/' },
  { ref: 'R25', name: 'QuickBooks',       url: 'https://quickbooks.intuit.com/pricing/' },
  { ref: 'R26', name: 'WP Buffs ($89–$359/mo)', url: 'https://wpbuffs.com/pricing/', verified: true },
  { ref: 'R27', name: 'Google Business Profile', url: 'https://www.google.com/business/' },
  { ref: 'R28', name: 'Google Maps Platform', url: 'https://mapsplatform.google.com/pricing/' },
  { ref: 'R29', name: 'TechRadar market guide', url: 'https://www.techradar.com/news/how-much-does-it-cost-to-build-a-website' },
  // --- UAE market verification, fetched directly on 2026-06-11 (independent
  // of the original ChatGPT/Gemini research, which lacked UAE agency data) ---
  { ref: 'R30', name: 'RDS Web Dubai 2025 guide: small-biz AED 4,000–8,000; corporate 10,000–50,000+; ecommerce 8,000–40,000; custom 15,000–100,000+; maintenance AED 1,000–10,000/yr', url: 'https://rdswebtech.com/website-design-packages-cost-dubai-2025', verified: true },
  { ref: 'R31', name: 'Tenet Dubai 2026 guide (450+ projects): basic 3,500–18,000; small-biz CMS 7,000–55,000; ecommerce 8,000–110,000; custom 18,000–145,000; maintenance 2,000–40,000/mo; hourly AED 200–550', url: 'https://www.wearetenet.com/blog/website-design-cost-in-dubai', verified: true },
  { ref: 'R32', name: 'Upscape Tech Dubai 2025: landing 1,500–3,500; small-biz info site 5,000–12,000; custom from 8,000', url: 'https://www.upscapetech.com/website-design-costs-in-dubai/' }
];

// UAE market sanity bands (AED, one-time build) — from R30–R32.
// The estimator warns if a quote leaves these bands, so QD never overcharges
// relative to the verified local market (and never silently undercharges).
export const UAE_MARKET_BANDS = {
  'simple-site':    { low: 2000,  high: 12000,  label: 'UAE simple / small business site (R30–R32)' },
  'business-site':  { low: 7000,  high: 55000,  label: 'UAE CMS business site (R31)' },
  'ecommerce':      { low: 8000,  high: 110000, label: 'UAE e-commerce build (R30, R31)' },
  'custom-system':  { low: 15000, high: 145000, label: 'UAE custom development (R30, R31)' }
};

// ---------------------------------------------------------------------------
// Package coverage map — add-ons whose capability is ALREADY included in a
// package's scope. Used to prevent double-charging when a brief mentions a
// need the package covers. Derived strictly from each package's `includes`.
// ---------------------------------------------------------------------------
export const PACKAGE_COVERS = {
  'qd-launch':          ['gbp-setup'],                                    // GBP setup included
  'qd-growth':          [],
  'qd-business-pro':    ['extra-language'],                               // AR/EN structure included
  'qd-commerce-start':  ['payment-gateway', 'reviews-integration'],       // payments + review app included
  'qd-commerce-growth': ['payment-gateway', 'reviews-integration', 'loyalty-integration', 'crm-setup'], // + loyalty, CRM sync
  'qd-booking-pro':     ['booking-integration'],
  'qd-ordering-pro':    ['ordering-integration'],
  'qd-ops-dashboard':   ['dashboard-pack', 'roles-logic'],                // dashboard + role-based access included
  'qd-ai-chatbot':      ['ai-chatbot-upgrade']
};

// ---------------------------------------------------------------------------
// Founding-client (portfolio-building) discount policy.
// Strategy basis: the benchmark's positioning advice — look premium, never
// silently cheap. Discounts must be explicit, labeled, and capped.
// ---------------------------------------------------------------------------
export const FOUNDING_MAX_DISCOUNT_PERCENT = 15;

// ---------------------------------------------------------------------------
// Lookups + pure pricing functions
// ---------------------------------------------------------------------------
export const getPackage = (id) => PACKAGES.find((p) => p.id === id) || null;
export const getAddon = (id) => ADDONS.find((a) => a.id === id) || null;
export const getCarePlan = (id) => CARE_PLANS.find((c) => c.id === id) || null;
export const getIndustryPreset = (id) => INDUSTRY_PRESETS.find((i) => i.id === id) || null;

const roundTo50 = (n) => Math.round(n / 50) * 50;

// tier: 'low' | 'mid' | 'high'
export function getAddonPrice(addonId, tier = 'low') {
  const addon = getAddon(addonId);
  if (!addon) return 0;
  if (addon.fixed || addon.low === addon.high) return addon.low;
  if (tier === 'high') return addon.high;
  if (tier === 'mid') return roundTo50((addon.low + addon.high) / 2);
  return addon.low;
}

/**
 * Build a full estimate from a selection (COMPONENT-BASED).
 * selection = {
 *   foundationId: string|null,          // base build tier
 *   pagesStandard: number,              // × PAGE_RATE_STANDARD
 *   pagesLanding: number,               // × PAGE_RATE_LANDING
 *   specials: string[],                 // SPECIAL_BUILDS ids (store/ops/chatbot)
 *   addons: [{ id, tier, qty }],        // feature lines
 *   carePlanId, industryId, vatPercent,
 *   discountPercent: 0–FOUNDING_MAX_DISCOUNT_PERCENT (explicit line, capped),
 *   packageId: string|null              // legacy package mode (quote drawer)
 * }
 * Add-ons whose capability is already covered by the chosen foundation or
 * special builds are kept as VISIBLE lines priced AED 0 ("included") — never
 * silently dropped, never double-charged.
 */
export function buildEstimate(selection = {}) {
  const vatPercent = Number.isFinite(selection.vatPercent) ? selection.vatPercent : DEFAULT_VAT_PERCENT;
  const pkg = getPackage(selection.packageId);
  const foundation = getFoundation(selection.foundationId);
  const care = getCarePlan(selection.carePlanId) || getCarePlan('none');
  const preset = getIndustryPreset(selection.industryId);
  const specialIds = (selection.specials || []).filter((id) => getSpecialBuild(id));

  const lines = [];
  let subtotal = 0;
  let subtotalLow = 0;
  let subtotalHigh = 0;
  let openEnded = false;

  // Coverage set: capabilities already paid for inside base components.
  const covered = new Set();
  if (foundation) (FOUNDATION_COVERS[foundation.id] || []).forEach((id) => covered.add(id));
  specialIds.forEach((sid) => (PACKAGE_COVERS[sid] || []).forEach((id) => covered.add(id)));
  if (pkg) (PACKAGE_COVERS[pkg.id] || []).forEach((id) => covered.add(id));

  if (foundation) {
    lines.push({
      kind: 'foundation',
      id: foundation.id,
      label: foundation.name.en,
      labelAr: foundation.name.ar,
      amount: foundation.base,
      basis: foundation.basis,
      note: foundation.derivation
    });
    subtotal += foundation.base;
    subtotalLow += foundation.base;
    subtotalHigh += foundation.base;
  }

  const pagesStandard = Math.max(0, Math.min(200, Number(selection.pagesStandard) || 0));
  const pagesLanding = Math.max(0, Math.min(50, Number(selection.pagesLanding) || 0));
  if (pagesStandard > 0) {
    const amount = pagesStandard * PAGE_RATE_STANDARD;
    lines.push({ kind: 'pages', id: 'pages-standard', label: `Content pages × ${pagesStandard} (AED ${PAGE_RATE_STANDARD}/page)`, labelAr: `صفحات محتوى × ${pagesStandard}`, amount, basis: 'positioning' });
    subtotal += amount; subtotalLow += amount; subtotalHigh += amount;
  }
  if (pagesLanding > 0) {
    const amount = pagesLanding * PAGE_RATE_LANDING;
    lines.push({ kind: 'pages', id: 'pages-landing', label: `Advanced landing pages × ${pagesLanding} (AED ${PAGE_RATE_LANDING}/page)`, labelAr: `صفحات هبوط × ${pagesLanding}`, amount, basis: 'positioning' });
    subtotal += amount; subtotalLow += amount; subtotalHigh += amount;
  }

  specialIds.forEach((sid) => {
    const special = getSpecialBuild(sid);
    const anchor = getPackage(sid);
    if (!special || !anchor) return;
    lines.push({
      kind: 'special',
      id: sid,
      label: special.name.en,
      labelAr: special.name.ar,
      amount: anchor.oneTime,
      from: !!anchor.from,
      basis: anchor.basis,
      note: special.note
    });
    subtotal += anchor.oneTime;
    subtotalLow += anchor.oneTime;
    subtotalHigh += anchor.oneTime;
    if (anchor.from) openEnded = true;
  });

  // Legacy package mode (used by the quote drawer's package picker)
  if (pkg) {
    lines.push({
      kind: 'package',
      id: pkg.id,
      label: pkg.name.en,
      labelAr: pkg.name.ar,
      amount: pkg.oneTime,
      from: !!pkg.from,
      basis: pkg.basis
    });
    subtotal += pkg.oneTime;
    subtotalLow += pkg.oneTime;
    subtotalHigh += pkg.oneTime;
    if (pkg.from) openEnded = true;
  }

  (selection.addons || []).forEach((sel) => {
    const addon = getAddon(sel.id);
    if (!addon) return;
    const isCovered = covered.has(addon.id);
    const qty = Math.max(1, Number(sel.qty) || 1);
    const tier = sel.tier || 'low';
    const unit = isCovered ? 0 : getAddonPrice(sel.id, tier);
    const amount = unit * qty;
    lines.push({
      kind: 'addon',
      id: addon.id,
      label: addon.name.en + (qty > 1 ? ` × ${qty}` : ''),
      labelAr: addon.name.ar,
      amount,
      unit,
      qty,
      tier: addon.fixed || isCovered ? null : tier,
      from: !isCovered && !!addon.from,
      basis: addon.basis,
      refs: addon.refs || [],
      covered: isCovered,
      note: isCovered ? 'Included in the selected base build — not charged.' : (addon.note || '')
    });
    subtotal += amount;
    subtotalLow += isCovered ? 0 : addon.low * qty;
    subtotalHigh += isCovered ? 0 : addon.high * qty;
    if (!isCovered && addon.from) openEnded = true;
  });

  // Founding-client discount: explicit, capped, its own line.
  const requestedDiscount = Number(selection.discountPercent) || 0;
  const discountPercent = Math.min(Math.max(requestedDiscount, 0), FOUNDING_MAX_DISCOUNT_PERCENT);
  const discountAmount = discountPercent > 0 ? Math.round((subtotal * discountPercent) / 100) : 0;
  if (discountAmount > 0) {
    lines.push({
      kind: 'discount',
      id: 'founding-discount',
      label: `Founding-client discount (−${discountPercent}%)`,
      labelAr: `خصم العميل المؤسس (−${discountPercent}٪)`,
      amount: -discountAmount,
      basis: 'positioning'
    });
  }
  const discountedSubtotal = subtotal - discountAmount;

  const vat = Math.round((discountedSubtotal * vatPercent) / 100);
  const grandTotal = discountedSubtotal + vat;

  // Band check against industry preset, if one is active (discounted build fee, pre-VAT)
  let bandCheck = null;
  if (preset && discountedSubtotal > 0) {
    const [lo, hi] = preset.band;
    bandCheck = {
      band: preset.band,
      monthlyBand: preset.monthlyBand,
      status: discountedSubtotal < lo ? 'below' : discountedSubtotal > hi ? 'above' : 'within'
    };
  }

  // UAE market sanity check (R30–R32): pick the band matching the offer shape.
  let uaeCheck = null;
  if (discountedSubtotal > 0) {
    let bandKey = null;
    if (specialIds.some((id) => id.startsWith('qd-commerce'))) bandKey = 'ecommerce';
    else if (specialIds.includes('qd-ops-dashboard')) bandKey = 'custom-system';
    else if (foundation && foundation.id !== 'foundation-essential') bandKey = 'business-site';
    else if (foundation) bandKey = 'simple-site';
    if (bandKey) {
      const band = UAE_MARKET_BANDS[bandKey];
      uaeCheck = {
        key: bandKey,
        label: band.label,
        band: [band.low, band.high],
        status: discountedSubtotal < band.low ? 'below' : discountedSubtotal > band.high ? 'above' : 'within'
      };
    }
  }

  const softwarePassThrough = !!(pkg && pkg.softwarePassThrough)
    || specialIds.some((sid) => getPackage(sid)?.softwarePassThrough);

  const monthly = {
    amount: care ? care.monthly : 0,
    planId: care ? care.id : 'none',
    planName: care ? care.name.en : 'None',
    usage: !!(care && care.usage),
    softwarePassThrough
  };

  return {
    version: PRICING_VERSION,
    lines,
    subtotal,
    subtotalLow,
    subtotalHigh,
    discountPercent,
    discountAmount,
    discountedSubtotal,
    discountCapped: requestedDiscount > FOUNDING_MAX_DISCOUNT_PERCENT,
    vatPercent,
    vat,
    grandTotal,
    openEnded,
    monthly,
    bandCheck,
    uaeCheck
  };
}

/**
 * Plain-text summary of an estimate (for clipboard / proposals).
 */
export function formatEstimateText(estimate, { businessName = '' } = {}) {
  const fmt = (n) => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(n);
  const out = [];
  out.push('QD Systems — Project Estimate (internal draft)');
  if (businessName) out.push(`Client: ${businessName}`);
  out.push(`Date: ${new Date().toISOString().slice(0, 10)} · Pricing model v${estimate.version}`);
  out.push('');
  estimate.lines.forEach((line) => {
    const fromTag = line.from ? 'from ' : '';
    const tierTag = line.tier && line.tier !== 'low' ? ` (${line.tier} scope)` : '';
    const amount = line.amount < 0 ? `−AED ${fmt(Math.abs(line.amount))}` : `${fromTag}AED ${fmt(line.amount)}`;
    out.push(`- ${line.label}${tierTag}: ${amount}`);
  });
  out.push('');
  out.push(`One-time subtotal: AED ${fmt(estimate.subtotal)}${estimate.openEnded ? ' (contains "from" items — final scope may increase)' : ''}`);
  if (estimate.discountAmount > 0) {
    out.push(`After founding-client discount (−${estimate.discountPercent}%): AED ${fmt(estimate.discountedSubtotal)}`);
  }
  out.push(`VAT ${estimate.vatPercent}%: AED ${fmt(estimate.vat)}`);
  out.push(`One-time total: AED ${fmt(estimate.grandTotal)}`);
  if (estimate.subtotalLow !== estimate.subtotalHigh) {
    out.push(`Scope range (pre-VAT): AED ${fmt(estimate.subtotalLow)} – ${fmt(estimate.subtotalHigh)}`);
  }
  if (estimate.monthly.amount > 0) {
    out.push(`Monthly: ${estimate.monthly.planName} — AED ${fmt(estimate.monthly.amount)}/mo${estimate.monthly.usage ? ' + usage' : ''}`);
  }
  if (estimate.monthly.softwarePassThrough) {
    out.push('Third-party software & usage fees (payments, WhatsApp/SMS, APIs) billed at cost — not included above.');
  }
  if (estimate.bandCheck) {
    const [lo, hi] = estimate.bandCheck.band;
    out.push(`Industry band check: ${estimate.bandCheck.status} recommended band (AED ${fmt(lo)} – ${fmt(hi)} build).`);
  }
  if (estimate.uaeCheck) {
    const [lo, hi] = estimate.uaeCheck.band;
    out.push(`UAE market check: ${estimate.uaeCheck.status} verified local range AED ${fmt(lo)} – ${fmt(hi)} (${estimate.uaeCheck.label}).`);
  }
  return out.join('\n');
}
