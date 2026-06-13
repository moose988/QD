// @ts-nocheck
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
export const PRICING_VERSION = '2026-06-13';
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
// Each ranged add-on has NAMED LEVELS with concrete deliverables, so a price
// is never shown as a naked range. Level prices map to the documented
// low/mid/high tiers (mid = midpoint rounded to 50) — no new numbers.
export const ADDONS = [
    { id: 'extra-page', name: { en: 'Extra content page', ar: 'صفحة محتوى إضافية' }, desc: 'One more written page: copy layout, images, mobile-ready', low: 250, high: 250, fixed: true, perUnit: 'page', basis: 'positioning' },
    { id: 'extra-landing', name: { en: 'Landing page (video / animated hero)', ar: 'صفحة هبوط (فيديو/حركة)' }, desc: 'High-impact campaign page with video or animated hero and a single call-to-action', low: 450, high: 450, fixed: true, perUnit: 'page', basis: 'positioning' },
    { id: 'extra-language', name: { en: 'Extra language (full translation structure)', ar: 'لغة إضافية' }, desc: 'Complete second-language version: structure, navigation, RTL/LTR handling', low: 1500, high: 1500, fixed: true, perUnit: 'language', basis: 'positioning' },
    { id: 'smart-form', name: { en: 'Smart form / price calculator', ar: 'نموذج ذكي / حاسبة أسعار' }, desc: 'Forms that qualify leads or quote prices automatically', low: 1500, high: 3500, basis: 'market', refs: ['R24'],
        levels: [
            { tier: 'low', label: 'Smart form', spec: 'Multi-step form with conditional questions, sends organized lead emails' },
            { tier: 'mid', label: 'Price calculator', spec: 'Instant price estimate from the client’s own pricing rules, lead capture' },
            { tier: 'high', label: 'Quote engine', spec: 'Calculator + branded PDF quote generation + automatic follow-up email' }
        ] },
    { id: 'crm-setup', name: { en: 'Customer management (CRM)', ar: 'إدارة العملاء (CRM)' }, desc: 'A system to track every customer and follow-up', low: 1900, high: 4900, basis: 'market', refs: ['R06', 'R07', 'R08'],
        levels: [
            { tier: 'low', label: 'Lead inbox', spec: 'One pipeline: every lead lands in one place with status tracking' },
            { tier: 'mid', label: 'Full pipeline', spec: 'Custom stages, follow-up reminders, customer history, data import' },
            { tier: 'high', label: 'Sales engine', spec: 'Multi-team pipelines, customer segments, automations, reports' }
        ] },
    { id: 'booking-integration', name: { en: 'Booking & appointments', ar: 'الحجوزات والمواعيد' }, desc: 'Clients book online instead of calling', low: 1500, high: 3900, basis: 'market', refs: ['R18', 'R19', 'R21'],
        levels: [
            { tier: 'low', label: 'Simple booking', spec: 'Booking page + email confirmations' },
            { tier: 'mid', label: 'Managed calendar', spec: 'Approve/reschedule/cancel flows, working-hours rules, admin calendar' },
            { tier: 'high', label: 'Full scheduling', spec: 'Per-staff calendars, WhatsApp + email reminders, no-show policy, deposit-ready' }
        ] },
    { id: 'ordering-integration', name: { en: 'Online ordering', ar: 'الطلبات أونلاين' }, desc: 'Customers order pickup or delivery from the site', low: 2500, high: 5900, basis: 'market', refs: ['R20'],
        levels: [
            { tier: 'low', label: 'Menu + orders', spec: 'Digital menu, order form, order notification emails' },
            { tier: 'mid', label: 'Pickup & delivery', spec: 'Delivery zones, pickup slots, order management screen' },
            { tier: 'high', label: 'Live operations', spec: 'Live order status for customers, branch rules, promo codes, kitchen view' }
        ] },
    { id: 'payment-gateway', name: { en: 'Online payments setup', ar: 'إعداد الدفع الإلكتروني' }, desc: 'Accept cards online (Stripe/Telr/etc.); gateway fees are the provider’s, billed to the client', low: 1500, high: 1500, fixed: true, basis: 'positioning' },
    { id: 'reviews-integration', name: { en: 'Reviews & ratings', ar: 'التقييمات والمراجعات' }, desc: 'Show social proof and collect new reviews', low: 750, high: 1500, basis: 'market', refs: ['R22'],
        levels: [
            { tier: 'low', label: 'Reviews display', spec: 'Google reviews feed + testimonials section on the site' },
            { tier: 'mid', label: 'Review collection', spec: '+ Automatic post-visit review requests by email/WhatsApp link' },
            { tier: 'high', label: 'Reputation suite', spec: '+ Multi-platform aggregation and moderation dashboard' }
        ] },
    { id: 'loyalty-integration', name: { en: 'Loyalty programme', ar: 'برنامج الولاء' }, desc: 'Points and rewards that bring customers back', low: 1500, high: 3500, basis: 'market', refs: ['R23'],
        levels: [
            { tier: 'low', label: 'Points system', spec: 'Earn points per purchase, redeem at checkout' },
            { tier: 'mid', label: 'Rewards tiers', spec: '+ Reward levels (silver/gold), rewards catalogue' },
            { tier: 'high', label: 'Growth loyalty', spec: '+ Referral rewards, campaigns, loyalty analytics' }
        ] },
    { id: 'ai-chatbot-upgrade', name: { en: 'AI chatbot', ar: 'روبوت محادثة ذكي' }, desc: 'How intelligent the bot is decides the price', low: 2900, high: 6900, basis: 'market', refs: ['R12', 'R13', 'R14', 'R15'],
        levels: [
            { tier: 'low', label: 'FAQ bot', spec: 'Answers common questions from an approved script, captures leads, English' },
            { tier: 'mid', label: 'Smart assistant', spec: 'AI trained on the business’s own content (services, menu, policies), Arabic + English, WhatsApp handoff' },
            { tier: 'high', label: 'Action bot', spec: 'Takes actions: checks bookings/orders, syncs to CRM, custom personality, analytics' }
        ] },
    { id: 'dashboard-pack', name: { en: 'Analytics & reports', ar: 'التحليلات والتقارير' }, desc: 'See the numbers that run the business', low: 2500, high: 6900, basis: 'market', refs: ['R09', 'R10', 'R11'],
        levels: [
            { tier: 'low', label: 'KPI panel', spec: 'One screen: sales, leads, top items, with CSV export' },
            { tier: 'mid', label: 'Custom reports', spec: '+ Filters, date ranges, scheduled email reports' },
            { tier: 'high', label: 'Full analytics', spec: '+ Multi-source data, drill-downs, role-based report views' }
        ] },
    { id: 'roles-logic', name: { en: 'Staff / driver / branch roles', ar: 'أدوار الموظفين والسائقين والفروع' }, desc: 'Different logins see and do different things', low: 3900, high: 8900, basis: 'positioning',
        levels: [
            { tier: 'low', label: 'Basic roles', spec: 'Admin + staff logins with separate permissions' },
            { tier: 'mid', label: 'Operations roles', spec: '+ Driver/branch roles, task assignment flows' },
            { tier: 'high', label: 'Full permissions', spec: '+ Permission matrix, multi-branch control, audit log of every action' }
        ] },
    { id: 'file-uploads', name: { en: 'Documents & approvals', ar: 'المستندات والموافقات' }, desc: 'Upload, organize, and approve files in the system', low: 1250, high: 3500, basis: 'positioning',
        levels: [
            { tier: 'low', label: 'Secure uploads', spec: 'File uploads on forms, stored safely' },
            { tier: 'mid', label: 'Document library', spec: '+ Organized library with approval steps' },
            { tier: 'high', label: 'Document control', spec: '+ Versioning, multi-step approvals, full audit trail' }
        ] },
    { id: 'gbp-setup', name: { en: 'Google Business Profile setup', ar: 'إعداد ملف النشاط التجاري في جوجل' }, desc: 'The business appears properly on Google Maps & Search (the tool is free — this is the setup work)', low: 600, high: 600, fixed: true, basis: 'positioning', refs: ['R27'] },
    { id: 'map-embed', name: { en: 'Location map / branches', ar: 'خريطة الموقع والفروع' }, desc: 'Map with the business location(s) on the site', low: 750, high: 750, fixed: true, basis: 'positioning' },
    { id: 'api-map', name: { en: 'Smart map / store locator', ar: 'خريطة ذكية / محدد فروع' }, desc: 'Interactive locator (nearest branch, directions); Google API usage billed at cost', low: 2500, high: 2500, from: true, basis: 'positioning', refs: ['R28'] },
    { id: 'seo-pack', name: { en: 'Get found on Google (SEO setup)', ar: 'الظهور في جوجل (SEO)' }, desc: 'Keyword setup, page optimization, Search Console + sitemap, local search basics', low: 1500, high: 1500, fixed: true, basis: 'positioning' }
];
export const getAddonLevel = (addonId, tier = 'low') => {
    const addon = ADDONS.find((a) => a.id === addonId);
    return addon?.levels?.find((l) => l.tier === tier) || null;
};
// ---------------------------------------------------------------------------
// Monthly care / recurring plans (AED per month)
// Benchmarked against WP Buffs public range AED ~327–1,318/mo (R26, verified).
// ---------------------------------------------------------------------------
export const CARE_PLANS = [
    { id: 'none', name: { en: 'No monthly plan', ar: 'بدون خطة شهرية' }, monthly: 0, scope: '' },
    { id: 'care-basic', name: { en: 'Care Basic', ar: 'العناية المبدئية' }, monthly: 149, scope: 'Hosting, SSL, backups, uptime checks, security updates, 1 small content edit / month', refs: ['R26'] },
    { id: 'care-lite', name: { en: 'Care Lite', ar: 'العناية الأساسية' }, monthly: 249, scope: 'Updates, backups, uptime checks, minor content edits, monthly snapshot report', refs: ['R26'] },
    { id: 'care-growth', name: { en: 'Care Growth', ar: 'عناية النمو' }, monthly: 599, scope: '+ One focused improvement task, form testing, GA4 review, basic SEO hygiene', refs: ['R26'] },
    { id: 'care-commerce', name: { en: 'Care Commerce', ar: 'عناية المتاجر' }, monthly: 1299, scope: '+ Checkout / order-flow checks, app & plugin monitoring, promo implementation support', refs: ['R26'] },
    { id: 'portal-ops', name: { en: 'Portal Ops', ar: 'تشغيل البوابات' }, monthly: 1999, scope: 'Dashboard support, role testing, workflow fixes, admin support, monthly ops review', refs: ['R26'] },
    { id: 'automation-desk', name: { en: 'Automation Desk', ar: 'مكتب الأتمتة' }, monthly: 349, usage: true, scope: 'Chatbot tuning, CRM automations, email / WhatsApp campaign support (+ usage)', refs: ['R13', 'R16', 'R17'] }
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
export const PAGE_RATE_LANDING = 450; // = ADDONS extra-landing
export const FOUNDATIONS = [
    {
        id: 'foundation-starter',
        name: { en: 'Starter site', ar: 'موقع البداية' },
        base: 2400,
        derivation: 'Sharjah launch starter tier; positioned below Essential without changing verified anchors',
        bestFor: { en: 'A small local business getting online fast', ar: 'نشاط محلي صغير يريد الظهور بسرعة' },
        diff: ['1–3 page professional site', 'Mobile-friendly', 'Contact + WhatsApp button', 'Google Business Profile setup', 'Basic analytics'],
        includes: ['1–3 page professional site', 'Mobile-friendly', 'Contact + WhatsApp button', 'Google Business Profile setup', 'Basic analytics'],
        basis: 'positioning'
    },
    {
        id: 'foundation-essential',
        name: { en: 'Essential build', ar: 'بناء أساسي' },
        base: 4650,
        derivation: 'Launch anchor 5,900 − 5 pages × 250',
        bestFor: { en: 'A clean professional presence', ar: 'حضور بسيط' },
        diff: ['Custom responsive design', 'Contact forms + WhatsApp button', 'Basic Google visibility + analytics', 'Hosting & domain setup'],
        includes: ['Custom responsive design', 'Contact / lead forms', 'WhatsApp CTA', 'Basic on-page SEO', 'Google Business Profile setup', 'Analytics install', 'Hosting & domain setup'],
        basis: 'positioning'
    },
    {
        id: 'foundation-professional',
        name: { en: 'Professional build', ar: 'بناء احترافي' },
        base: 7400,
        derivation: 'Growth anchor 9,900 − 10 pages × 250',
        bestFor: { en: 'Businesses that publish and capture leads', ar: 'أعمال متنامية' },
        diff: ['Everything in Essential, plus:', 'Blog / news + case studies', 'Smart lead forms + CRM handoff', 'Speed optimization + sharper design'],
        includes: ['Everything in Essential', 'Blog / news system', 'Case studies', 'Advanced forms', 'CRM handoff', 'GA4 / Search Console', 'Speed pass', 'Stronger design polish'],
        basis: 'positioning'
    },
    {
        id: 'foundation-premium',
        name: { en: 'Premium build', ar: 'بناء متميز' },
        base: 10900,
        derivation: 'Business Pro anchor 14,900 − 16 pages × 250',
        bestFor: { en: 'Bilingual brands & multi-service firms', ar: 'علامات ثنائية اللغة' },
        diff: ['Everything in Professional, plus:', 'Full Arabic + English structure', 'Staff editing roles', 'Mini-dashboard (basic KPI panel) included'],
        includes: ['Everything in Professional', 'Arabic / English structure', 'Custom sections', 'Staff / admin editing roles', 'Automation-ready forms', 'Mini-dashboard / reporting'],
        basis: 'positioning'
    }
];
// Capabilities whose BASIC level is already inside each foundation.
// Semantics: the basic (low) level is included free; picking a higher level
// charges only the UPGRADE DIFFERENCE (price(level) − price(basic)).
// This is what stops modules/features stacking at full standalone price on
// top of a build that already does part of the work.
// Foundations are supersets: higher tiers cover everything lower ones do.
export const FOUNDATION_COVERS = {
    'foundation-starter': ['gbp-setup'],
    'foundation-essential': ['gbp-setup'],
    'foundation-professional': ['gbp-setup', 'smart-form'], // advanced forms included
    'foundation-premium': ['gbp-setup', 'smart-form', 'extra-language', 'dashboard-pack'] // + AR/EN structure + mini-dashboard
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
// ---------------------------------------------------------------------------
// Industry modules — vertical systems (e.g. patient management for clinics,
// driver management for restaurants) priced as COMPOSITIONS of the verified
// components above. A module's price = sum of its components at the stated
// tiers (computed live, never a separate invented number). Components already
// covered by the selected base are excluded from the sum.
// ---------------------------------------------------------------------------
// Design rules (after owner feedback "the pricing doesn't make sense"):
//  - Each module is ONE clear deliverable, anchored to at most TWO components,
//    so its price is obviously proportional to what it does.
//  - `includes` is what the CLIENT reads (the deliverable, in plain words) —
//    the component anchor is internal and never shown as the description.
//  - Heavier capabilities (roles, deeper analytics) are separate upsells, not
//    silently stacked into modules.
export const INDUSTRY_MODULES = [
    {
        id: 'ind-clinic',
        name: { en: 'Clinic / Medical', ar: 'عيادة / طبي' },
        presetId: 'clinic-salon',
        modules: [
            { id: 'mod-appointments', name: { en: 'Appointments & reminders', ar: 'المواعيد والتذكيرات' }, pitch: 'Patients book online, the clinic stays in control',
                includes: ['Online booking for services & doctors', 'Per-staff calendars and working hours', 'WhatsApp + email reminders, no-show policy'],
                components: [{ id: 'booking-integration', tier: 'high' }] },
            { id: 'mod-patient-mgmt', name: { en: 'Patient records', ar: 'سجلات المرضى' }, pitch: 'Every patient’s history in one place',
                includes: ['Patient profiles with visit history', 'Follow-up reminders', 'Attach documents & reports to each patient'],
                components: [{ id: 'crm-setup', tier: 'mid' }, { id: 'file-uploads', tier: 'low' }] },
            { id: 'mod-surgery-mgmt', name: { en: 'Operations board', ar: 'لوحة العمليات' }, pitch: 'Schedule and track procedures',
                includes: ['Procedure schedule with statuses', 'Day/week views and filters', 'Printable reports'],
                components: [{ id: 'dashboard-pack', tier: 'mid' }] }
        ]
    },
    {
        id: 'ind-restaurant',
        name: { en: 'Restaurant / Café', ar: 'مطعم / مقهى' },
        presetId: 'restaurant-cafe',
        modules: [
            { id: 'mod-order-status', name: { en: 'Online ordering + live status', ar: 'الطلبات + الحالة المباشرة' }, pitch: 'Customers order and watch their order live',
                includes: ['Pickup & delivery ordering flow', 'Live order status for the customer', 'Kitchen/admin order screen, promo codes'],
                components: [{ id: 'ordering-integration', tier: 'high' }] },
            { id: 'mod-menu-mgmt', name: { en: 'Menu manager', ar: 'إدارة المنيو' }, pitch: 'Change the menu yourself, no developer needed',
                includes: ['Edit items, prices, photos, availability', 'Categories & specials', 'Out-of-stock toggle'],
                components: [{ id: 'dashboard-pack', tier: 'low' }] },
            { id: 'mod-driver-mgmt', name: { en: 'Driver logins & assignment', ar: 'حسابات السائقين والتوزيع' }, pitch: 'Hand orders to drivers cleanly',
                includes: ['Driver accounts with their own view', 'Assign orders to drivers', 'Delivery status updates'],
                components: [{ id: 'roles-logic', tier: 'low' }] },
            { id: 'mod-resto-loyalty', name: { en: 'Loyalty programme', ar: 'برنامج الولاء' }, pitch: 'Turn first orders into regulars',
                includes: ['Points per order', 'Reward tiers & redemption', 'Repeat-customer tracking'],
                components: [{ id: 'loyalty-integration', tier: 'mid' }] }
        ]
    },
    {
        id: 'ind-salon',
        name: { en: 'Salon / Spa / Barber', ar: 'صالون / سبا / حلاق' },
        presetId: 'clinic-salon',
        modules: [
            { id: 'mod-staff-calendars', name: { en: 'Staff calendars & booking', ar: 'تقويم الموظفين والحجوزات' }, pitch: 'Each chair fills itself',
                includes: ['Online booking per staff member & service', 'WhatsApp + email reminders', 'No-show policies, deposit-ready'],
                components: [{ id: 'booking-integration', tier: 'high' }] },
            { id: 'mod-client-records', name: { en: 'Client records & history', ar: 'سجلات العملاء' }, pitch: 'Remember every client’s preferences',
                includes: ['Client profiles with visit history', 'Preferences & notes', 'Follow-up reminders'],
                components: [{ id: 'crm-setup', tier: 'mid' }] },
            { id: 'mod-salon-loyalty', name: { en: 'Loyalty programme', ar: 'برنامج الولاء' }, pitch: 'Reward repeat visits',
                includes: ['Points per visit', 'Reward tiers & redemption', 'Repeat-visit tracking'],
                components: [{ id: 'loyalty-integration', tier: 'mid' }] }
        ]
    },
    {
        id: 'ind-retail',
        name: { en: 'Retail / Shop', ar: 'متجر / تجزئة' },
        presetId: null,
        modules: [
            { id: 'mod-inventory', name: { en: 'Product & stock panel', ar: 'لوحة المنتجات والمخزون' }, pitch: 'Run the catalogue yourself',
                includes: ['Add/edit products, prices, photos', 'Stock levels & categories', 'Simple sales reports'],
                components: [{ id: 'dashboard-pack', tier: 'mid' }] },
            { id: 'mod-retail-crm', name: { en: 'Customer management', ar: 'إدارة العملاء' }, pitch: 'Know who buys and bring them back',
                includes: ['Customer profiles & purchase history', 'Segments (VIP, inactive…)', 'Follow-up reminders'],
                components: [{ id: 'crm-setup', tier: 'mid' }] },
            { id: 'mod-retail-loyalty', name: { en: 'Loyalty programme', ar: 'برنامج الولاء' }, pitch: 'Points that drive repeat purchases',
                includes: ['Points per purchase', 'Reward tiers & redemption', 'Loyalty tracking'],
                components: [{ id: 'loyalty-integration', tier: 'mid' }] }
        ]
    },
    {
        id: 'ind-services',
        name: { en: 'Services / Contractor', ar: 'خدمات / مقاولات' },
        presetId: 'services-contractor',
        modules: [
            { id: 'mod-quote-engine', name: { en: 'Instant quote calculator', ar: 'حاسبة عروض الأسعار' }, pitch: 'Visitors price their own job and become leads',
                includes: ['Price calculator from your own rules', 'Qualified-lead capture', 'Organized lead emails'],
                components: [{ id: 'smart-form', tier: 'mid' }] },
            { id: 'mod-job-tracking', name: { en: 'Jobs & status board', ar: 'لوحة المشاريع والحالات' }, pitch: 'Every job, its status, at a glance',
                includes: ['Job list with statuses', 'Filters & search', 'CSV export'],
                components: [{ id: 'dashboard-pack', tier: 'low' }] },
            { id: 'mod-docs-approvals', name: { en: 'Documents & approvals', ar: 'المستندات والموافقات' }, pitch: 'Contracts and approvals without the email chaos',
                includes: ['Document library', 'Approval steps', 'Organized per client/job'],
                components: [{ id: 'file-uploads', tier: 'mid' }] }
        ]
    },
    {
        id: 'ind-education',
        name: { en: 'Education / Training', ar: 'تعليم / تدريب' },
        presetId: 'education-training',
        modules: [
            { id: 'mod-course-booking', name: { en: 'Class & course booking', ar: 'حجز الدورات والصفوف' }, pitch: 'Enrolment without phone calls',
                includes: ['Course/class schedules online', 'Enrolment with confirmations', 'Reminders to reduce absence'],
                components: [{ id: 'booking-integration', tier: 'high' }] },
            { id: 'mod-student-mgmt', name: { en: 'Student records', ar: 'سجلات الطلاب' }, pitch: 'Every student’s file in one place',
                includes: ['Student profiles & progress', 'Attach documents & certificates', 'Follow-up reminders'],
                components: [{ id: 'crm-setup', tier: 'mid' }, { id: 'file-uploads', tier: 'low' }] },
            { id: 'mod-gated-content', name: { en: 'Member materials area', ar: 'منطقة المواد للأعضاء' }, pitch: 'Course materials only for enrolled students',
                includes: ['Protected downloads area', 'Organized by course', 'Simple member access'],
                components: [{ id: 'file-uploads', tier: 'mid' }] }
        ]
    }
];
const ALL_MODULES = INDUSTRY_MODULES.flatMap((g) => g.modules.map((mo) => ({ ...mo, groupId: g.id })));
export const getIndustryGroup = (id) => INDUSTRY_MODULES.find((g) => g.id === id) || null;
export const getModule = (id) => ALL_MODULES.find((mo) => mo.id === id) || null;
// ---------------------------------------------------------------------------
// UNIFIED COVERAGE: an "included map" (addonId → AED value already included
// in the selection). Charging rule everywhere:
//   charge = max(0, price(chosen level) − includedValue)
// Sources of included value:
//   - PACKAGE_COVERS (specials/packages): capability FULLY included → price(high)
//   - FOUNDATION_COVERS: BASIC level included → price(low)
//   - selected industry modules: each component included AT ITS TIER
// This guarantees: never double-charged, upgrades cost only the difference,
// and module cards always agree with the summary.
// ---------------------------------------------------------------------------
export function buildIncludedMap({ foundationId = null, specials = [], packageId = null, modules = [], excludeModuleId = null } = {}) {
    const map = new Map();
    const bump = (id, value) => map.set(id, Math.max(map.get(id) || 0, value));
    if (foundationId)
        (FOUNDATION_COVERS[foundationId] || []).forEach((id) => bump(id, getAddonPrice(id, 'low')));
    [...specials, ...(packageId ? [packageId] : [])].forEach((sid) => (PACKAGE_COVERS[sid] || []).forEach((id) => bump(id, getAddonPrice(id, 'high'))));
    modules.forEach((modId) => {
        if (modId === excludeModuleId)
            return;
        const mod = getModule(modId);
        if (!mod)
            return;
        mod.components.forEach((c) => bump(c.id, getAddonPrice(c.id, c.tier || 'low')));
    });
    return map;
}
export const includedCharge = (addonId, tier, includedMap) => Math.max(0, getAddonPrice(addonId, tier) - (includedMap?.get(addonId) || 0));
// Module price = sum of component charges under the included map.
export function getModulePrice(moduleId, includedMap = new Map()) {
    const mod = getModule(moduleId);
    if (!mod)
        return 0;
    return mod.components.reduce((sum, c) => sum + includedCharge(c.id, c.tier || 'low', includedMap), 0);
}
// Indicative starting price of a quick offer = sum of its components at low tier.
export function getTemplateStartingPrice(templateId) {
    const tpl = getOfferTemplate(templateId);
    if (!tpl)
        return 0;
    let total = 0;
    if (tpl.foundationId) {
        const f = getFoundation(tpl.foundationId);
        if (f)
            total += f.base;
    }
    total += (tpl.pagesStandard || 0) * PAGE_RATE_STANDARD + (tpl.pagesLanding || 0) * PAGE_RATE_LANDING;
    for (const sid of tpl.specials || []) {
        const pkg = PACKAGES.find((p) => p.id === sid);
        if (pkg)
            total += pkg.oneTime;
    }
    const included = buildIncludedMap({ foundationId: tpl.foundationId, specials: tpl.specials || [] });
    for (const a of tpl.addons || []) {
        total += includedCharge(a.id, a.tier || 'low', included);
    }
    return total;
}
// ---------------------------------------------------------------------------
// Source register (condensed; full table in the benchmark PDF and
// docs/PRICING_MODEL.md). verified === re-checked live on PRICING_VERSION date.
// ---------------------------------------------------------------------------
export const SOURCES = [
    { ref: 'R01', name: 'Hostinger', url: 'https://www.hostinger.com/pricing' },
    { ref: 'R02', name: 'Wix', url: 'https://www.wix.com/upgrade/website' },
    { ref: 'R03', name: 'Webflow', url: 'https://webflow.com/pricing' },
    { ref: 'R04', name: 'WooCommerce', url: 'https://woocommerce.com/pricing/' },
    { ref: 'R05', name: 'WordPress.com Custom Dev (from US$5,000)', url: 'https://wordpress.com/website-design-service/', verified: true },
    { ref: 'R06', name: 'Zoho CRM', url: 'https://www.zoho.com/crm/zohocrm-pricing.html' },
    { ref: 'R07', name: 'Salesforce', url: 'https://www.salesforce.com/sales/pricing/' },
    { ref: 'R08', name: 'Pipedrive', url: 'https://www.pipedrive.com/en/pricing' },
    { ref: 'R09', name: 'Retool ($10+$5 / $50+$15)', url: 'https://retool.com/pricing', verified: true },
    { ref: 'R10', name: 'Bubble', url: 'https://bubble.io/pricing' },
    { ref: 'R11', name: 'Softr', url: 'https://www.softr.io/pricing' },
    { ref: 'R12', name: 'Tidio', url: 'https://www.tidio.com/pricing/' },
    { ref: 'R13', name: 'Intercom', url: 'https://www.intercom.com/pricing' },
    { ref: 'R14', name: 'ManyChat', url: 'https://manychat.com/pricing' },
    { ref: 'R15', name: 'Landbot', url: 'https://landbot.io/pricing' },
    { ref: 'R16', name: 'Twilio SMS', url: 'https://www.twilio.com/en-us/sms/pricing/us' },
    { ref: 'R17', name: 'Twilio WhatsApp', url: 'https://www.twilio.com/en-us/whatsapp/pricing' },
    { ref: 'R18', name: 'Square Appointments', url: 'https://squareup.com/us/en/appointments/pricing' },
    { ref: 'R19', name: 'Fresha', url: 'https://www.fresha.com/pricing' },
    { ref: 'R20', name: 'GloriaFood (free / $19 / $49)', url: 'https://www.gloriafood.com/pricing', verified: true },
    { ref: 'R21', name: 'Calendly', url: 'https://calendly.com/pricing' },
    { ref: 'R22', name: 'Judge.me', url: 'https://judge.me/pricing' },
    { ref: 'R23', name: 'Smile.io', url: 'https://smile.io/pricing' },
    { ref: 'R24', name: 'PandaDoc', url: 'https://www.pandadoc.com/pricing/' },
    { ref: 'R25', name: 'QuickBooks', url: 'https://quickbooks.intuit.com/pricing/' },
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
    'simple-site': { low: 2000, high: 12000, label: 'UAE simple / small business site (R30–R32)' },
    'business-site': { low: 7000, high: 55000, label: 'UAE CMS business site (R31)' },
    'ecommerce': { low: 8000, high: 110000, label: 'UAE e-commerce build (R30, R31)' },
    'custom-system': { low: 15000, high: 145000, label: 'UAE custom development (R30, R31)' }
};
// ---------------------------------------------------------------------------
// Package coverage map — add-ons whose capability is ALREADY included in a
// package's scope. Used to prevent double-charging when a brief mentions a
// need the package covers. Derived strictly from each package's `includes`.
// ---------------------------------------------------------------------------
export const PACKAGE_COVERS = {
    'qd-launch': ['gbp-setup'], // GBP setup included
    'qd-growth': [],
    'qd-business-pro': ['extra-language'], // AR/EN structure included
    'qd-commerce-start': ['payment-gateway', 'reviews-integration'], // payments + review app included
    'qd-commerce-growth': ['payment-gateway', 'reviews-integration', 'loyalty-integration', 'crm-setup'], // + loyalty, CRM sync
    'qd-booking-pro': ['booking-integration'],
    'qd-ordering-pro': ['ordering-integration'],
    'qd-ops-dashboard': ['dashboard-pack', 'roles-logic'], // dashboard + role-based access included
    'qd-ai-chatbot': ['ai-chatbot-upgrade']
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
    if (!addon)
        return 0;
    if (addon.fixed || addon.low === addon.high)
        return addon.low;
    if (tier === 'high')
        return addon.high;
    if (tier === 'mid')
        return roundTo50((addon.low + addon.high) / 2);
    return addon.low;
}
export function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value))
        return value;
    Object.freeze(value);
    for (const child of Object.values(value))
        deepFreeze(child);
    return value;
}
[
    PACKAGES, ADDONS, CARE_PLANS, INDUSTRY_PRESETS, FOUNDATIONS, FOUNDATION_COVERS,
    SPECIAL_BUILDS, OFFER_TEMPLATES, INDUSTRY_MODULES, SOURCES, UAE_MARKET_BANDS, PACKAGE_COVERS
].forEach(deepFreeze);
