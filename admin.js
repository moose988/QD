/*
Required Firestore rules must be configured manually in Firebase Console:

rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /projectSubmissions/{document} {
      allow create: if true;
      allow read, update, delete: if request.auth != null;
    }

    // Optional if the public homepage later reads review cards.
    // Keep projectSubmissions private; only expose a dedicated reviews collection.
    match /reviews/{document} {
      allow read: if true;
      allow write: if request.auth != null;
    }

    match /quotes/{document} {
      allow read, write: if request.auth != null;
    }
  }
}
*/

import { auth, db, storage } from './firebase.js';
import { activeAttentionItems } from '/app/lib/admin-attention.js';
import { prepareBankSound, playBankSound, showBankFeedback } from '/app/lib/bank-feedback.js';
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytes
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { CATALOG, CATALOG_GROUPS, PACKAGE_GROUPS, PICKER_CATALOG, catalogToLineItem, getCatalogItem } from '/app/lib/quote-catalog.js';
import { resolveQuoteCareForEditing } from '/app/lib/quote-care.js';
import { computeTotals, formatAED } from '/app/lib/quote-totals.js';
import { normalizeQuoteForTemplate, renderQuoteTemplate, defaultTerms } from '/app/lib/quote-template.js';
import {
  PRICING_VERSION,
  PACKAGES,
  ADDONS,
  CARE_PLANS,
  INDUSTRY_PRESETS,
  SOURCES,
  getPackage,
  getAddon,
  getCarePlan,
  getIndustryPreset,
  getAddonPrice,
  price,
  displayAED,
  buildEstimate,
  formatEstimateText,
  PACKAGE_COVERS,
  FOUNDING_MAX_DISCOUNT_PERCENT,
  FOUNDATIONS,
  FOUNDATION_COVERS,
  SPECIAL_BUILDS,
  OFFER_TEMPLATES,
  getFoundation,
  getSpecialBuild,
  getOfferTemplate,
  getTemplateStartingPrice,
  PAGE_RATE_STANDARD,
  PAGE_RATE_LANDING,
  INDUSTRY_MODULES,
  getIndustryGroup,
  getModule,
  getModulePrice,
  getAddonLevel,
  buildIncludedMap,
  includedCharge
} from '/app/lib/pricing-model.js';
import { parseBrief } from '/app/lib/brief-parser.js';
import {
  INVITATIONS_COLLECTION,
  INVITATION_RSVPS_COLLECTION,
  buildInvitationAssetPathSuggestions,
  buildInvitationWhatsappMessage,
  createDefaultInvitationFeatures,
  deriveCoupleDisplayName,
  isValidInvitationMediaPath,
  normalizeInvitationGallery,
  normalizeInvitationMediaFields,
  normalizeRsvpRecord
} from './invite/invite-shared.js';

const root = document.getElementById('qd-admin-root');
const allowedAdminEmails = [
  'mohammedqudaih107@gmail.com',
  'mdaya0089@gmail.com'
];
const unauthorizedAdminMessage = 'Unauthorized access';
const statusOptions = ['New', 'Reviewed', 'Contacted', 'Meeting', 'Quoted', 'Accepted', 'Under Construction', 'Completed', 'Rejected', 'Archived'];
const priorityOptions = ['Low', 'Normal', 'High', 'VIP'];
const CARD_SITE_URL = 'https://qdsystems.ae';
const CARD_DEFAULT_WEBSITE = 'https://qdsystems.ae';
const CARD_DEFAULT_CTA_LABEL = 'Start a Build';
const CARD_DEFAULT_CTA_URL = 'https://qdsystems.ae/contact';
const cardIconOptions = ['website', 'email', 'phone', 'whatsapp', 'instagram', 'linkedin', 'link'];
const INVITE_THEME_OPTIONS = ['royal-gold', 'minimal-white', 'modern-black', 'arabic-luxury', 'floral-elegant'];
const INVITE_STATUS_OPTIONS = ['draft', 'active', 'disabled'];
const DEMO_STATUS_OPTIONS = ['draft', 'active', 'expired', 'disabled'];
const OUTREACH_STATUS_OPTIONS = [
  { value: 'call_them', label: 'Call Them' },
  { value: 'visit_them', label: 'Visit Them' },
  { value: 'send_details', label: 'Send Details' },
  { value: 'setting_meeting', label: 'Setting Meeting' },
  { value: 'declined', label: 'Declined' },
  { value: 'they_will_call_back', label: 'They Will Call Back' },
  { value: 'confirmed', label: 'Confirmed' }
];
const inviteThemeLabels = {
  'royal-gold': 'Royal Gold',
  'minimal-white': 'Minimal White',
  'modern-black': 'Modern Black',
  'arabic-luxury': 'Arabic Luxury',
  'floral-elegant': 'Floral Elegant'
};
const inviteStatusLabels = {
  draft: 'Draft',
  active: 'Active',
  disabled: 'Disabled'
};
const demoStatusLabels = {
  draft: 'Draft',
  active: 'Active',
  expired: 'Expired',
  disabled: 'Disabled'
};
const adminTabs = new Set(['overview', 'dashboard', 'cards', 'demos', 'activity', 'outreach', 'pricing', 'payments', 'collections', 'chat']);
const initialAdminTab = new URLSearchParams(window.location.search).get('tab');
const dashboardSections = new Set(['overview', 'pipeline', 'archive']);
const initialDashboardSection = new URLSearchParams(window.location.search).get('section');
const initialActivitySearch = new URLSearchParams(window.location.search).get('activitySearch') || '';
const initialQuoteSearch = '';
const initialQuoteStatus = new URLSearchParams(window.location.search).get('quoteStatus') || 'All';
const activityActionLabels = {
  bank_deposit: 'Deposited to shared bank',
  bank_withdraw: 'Withdrew from shared bank',
  bank_expense: 'Recorded shared expense',
  bank_reminder_created: 'Set payment reminder',
  bank_reminder_paid: 'Paid payment reminder',
  login: 'Logged in',
  logout: 'Logged out',
  open_submission: 'Opened submission',
  edit_submission: 'Edited submission',
  change_status: 'Changed status',
  change_priority: 'Changed priority',
  delete_submission: 'Deleted submission',
  create_quote: 'Created quote',
  update_quote: 'Updated quote',
  deleted_quote: 'Deleted quote',
  recorded_payment: 'Recorded payment',
  waived_care: 'Waived monthly care',
  unwaived_care: 'Un-waived care',
  marked_sent: 'Marked as sent',
  changed_quote_status: 'Changed quote status',
  marked_go_live: 'Set go-live date',
  import_chat_lead: 'Imported chat lead',
  delete_chat_lead: 'Deleted chat lead',
  delete_chat_conversation: 'Deleted chat conversation',
  open_smart_card: 'Opened smart card',
  create_smart_card: 'Created smart card',
  edit_smart_card: 'Edited smart card',
  delete_smart_card: 'Deleted smart card',
  create_demo: 'Created demo',
  edit_demo: 'Edited demo',
  delete_demo: 'Deleted demo',
  disable_demo: 'Disabled demo',
  enable_demo: 'Enabled demo',
  trigger_demo_deploy: 'Triggered demo deploy',
  open_demo_admin: 'Opened demo (admin)',
  create_outreach_lead: 'Created outreach lead',
  edit_outreach_lead: 'Edited outreach lead',
  change_outreach_status: 'Changed outreach status',
  extract_outreach_maps_lead: 'Extracted Google Maps lead',
  import_outreach_lead: 'Imported outreach lead to pipeline',
  delete_outreach_lead: 'Deleted outreach lead'
};
const activityTargetTypeLabels = {
  shared_bank: 'Shared bank',
  session: 'Session',
  submission: 'Submission',
  quote: 'Quote',
  smart_card: 'Smart Card',
  chat_lead: 'Chat Lead',
  chat_conversation: 'Chat Conversation',
  demo: 'Demo',
  outreach_lead: 'Outreach Lead'
};
const activityOpenSessionKey = 'qd-admin-activity-opened-v1';

const state = {
  authLoading: true,
  dataLoading: false,
  cardsLoading: false,
  demosLoading: false,
  invitationsLoading: false,
  outreachLoading: false,
  invitationRsvpsLoading: false,
  activityLoading: false,
  submissionActivityLoading: false,
  isLoggingIn: false,
  isSaving: false,
  user: null,
  loginError: '',
  dataError: '',
  cardsError: '',
  demosError: '',
  invitationsError: '',
  outreachError: '',
  invitationRsvpsError: '',
  activityError: '',
  submissionActivityError: '',
  saveError: '',
  copyFeedback: '',
  adminToast: '',
  activeTab: adminTabs.has(initialAdminTab) ? initialAdminTab : 'overview',
  navOpen: false,
  dashboardSection: dashboardSections.has(initialDashboardSection) ? initialDashboardSection : 'overview',
  pipelineAttentionOnly: false,
  pipelineAnalyticsOpen: false,
  submissions: [],
  cards: [],
  demos: [],
  invitations: [],
  outreachLeads: [],
  invitationRsvps: [],
  invitationRsvpFilters: {
    search: '',
    phone: '',
    attending: 'all',
    sort: 'newest'
  },
  activityLogs: [],
  submissionActivityLogs: [],
  filters: {
    search: '',
    status: 'All',
    priority: 'All'
  },
  activityFilters: {
    search: initialActivitySearch,
    actor: 'All',
    action: 'All',
    targetType: 'All'
  },
  demoFilters: {
    search: '',
    status: 'All'
  },
  outreachFilters: {
    search: '',
    status: 'All',
    starredOnly: false
  },
  pipelinePage: 0,
  outreachPage: 0,
  activityPage: 0,
  budgetProjectsPage: 0,
  budgetSortDirection: 'desc',
  selectedId: null,
  drawerDraft: null,
  quotesBySubmissionId: {},
  overviewQuotesAwaiting: 0,
  sharedLedger: null,
  sharedLedgerError: '',
  sharedLedgerBusy: false,
  bankActivityPage: 0,
  bankFlow: { step: 0, type: '', amount: '', note: '', due: '', monthly: false },
  quoteDrawer: { open: false, quote: null, original: null, dirty: false },
  quoteToast: '',
  paymentLookup: {
    quoteRef: '',
    quote: null,
    quotes: [],
    quotesLoading: false,
    quotesError: '',
    search: initialQuoteSearch,
    status: initialQuoteStatus,
    loading: false,
    saving: false,
    error: '',
    form: {
      amount: '',
      date: new Date().toISOString().slice(0, 10),
      method: 'Bank transfer',
      note: ''
    }
  },
  collections: {
    loading: false,
    error: '',
    data: null,
    on: new Date().toISOString().slice(0, 10),
    search: '',
    filter: 'All'
  },
  pricing: {
    website: true,
    pagesStandard: 5,
    pagesLanding: 0,
    specs: {},
    industryId: null,
    carePlanId: null,
    vatOn: false,
    clientName: '',
    briefText: '',
    analysis: null,
    founding: { enabled: false, percent: 10 },
    ui: { describeOpen: false, specFilter: '' },
    copied: false,
    quoteCreating: false
  },
  cardEditor: {
    open: false,
    mode: 'create',
    id: null,
    draft: null,
    original: null,
    slugState: { status: 'idle', message: '' },
    slugTouched: false,
    isSaving: false,
    error: '',
    pendingAvatarFile: null
  },
  demoEditor: {
    open: false,
    mode: 'create',
    id: null,
    draft: null,
    original: null,
    slugState: { status: 'idle', message: '' },
    slugTouched: false,
    isSaving: false,
    deployLoading: false,
    error: ''
  },
  invitationEditor: {
    open: false,
    mode: 'create',
    id: null,
    draft: null,
    original: null,
    slugState: { status: 'idle', message: '' },
    slugTouched: false,
    isSaving: false,
    error: ''
  },
  outreachEditor: {
    open: false,
    mode: 'create',
    id: null,
    draft: null,
    original: null,
    isSaving: false,
    mapsLoading: false,
    mapsError: '',
    mapsUrl: '',
    error: ''
  },
  pendingLoginAudit: false
};

let unsubscribeSnapshot = null;
let unsubscribeQuotesSnapshot = null;
let unsubscribeCardsSnapshot = null;
let unsubscribeDemosSnapshot = null;
let unsubscribeInvitationsSnapshot = null;
let unsubscribeOutreachSnapshot = null;
let unsubscribeInvitationRsvpsSnapshot = null;
let unsubscribeActivityLogsSnapshot = null;
let unsubscribeSubmissionActivitySnapshot = null;
let copyFeedbackTimeout = null;
let adminToastTimeout = null;
let isModalOpen = false;
let lastRenderedAdminTab = null;
let lastModalOpenedAt = 0;
let currentSubmissionActivityTargetId = null;
let currentInvitationRsvpsTargetId = null;
const openedActivitySessionSet = new Set((() => {
  try {
    const raw = window.sessionStorage.getItem(activityOpenSessionKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
})());

const fieldLabels = {
  businessName: 'Business Name',
  businessEmail: 'Contact Email',
  businessPhone: 'Phone',
  industry: 'Industry',
  businessDescription: 'Business Description',
  socialLinks: 'Social Links',
  mainPurpose: 'Main Purpose',
  visitorAction: 'Visitor Action',
  visitorActions: 'Visitor Actions',
  idealCustomer: 'Ideal Customer',
  idealCustomerAgeGroup: 'Ideal Customer Age Group',
  idealCustomerGender: 'Ideal Customer Audience Type',
  idealCustomerBudgetLevel: 'Ideal Customer Budget Level',
  idealCustomerNotes: 'Ideal Customer Notes',
  hasLogo: 'Logo Availability',
  hasBrandAssets: 'Brand Assets',
  brandAssets: 'Brand Assets Details',
  preferredStyle: 'Preferred Style',
  preferredColors: 'Preferred Colors',
  colorsToAvoid: 'Colors To Avoid',
  neededPages: 'Needed Pages',
  productCount: 'Product / Service Count',
  contentReadiness: 'Content Readiness',
  legalPages: 'Legal Pages',
  requiredFeatures: 'Required Features / Modules',
  requiredFeatures__multi_language_languages: 'Languages Needed',
  customFeatures: 'Custom Features',
  budgetRange: 'Budget',
  budgetRangeLabel: 'Budget Label',
  budgetRangeValue: 'Budget Level',
  launchDate: 'Launch Date',
  meetingDateTime: 'Meeting Date',
  urgency: 'Urgency',
  workedWithAgency: 'Worked With Agency Before',
  inspirationSites: 'Inspiration Websites',
  competitors: 'Competitors',
  hasDomain: 'Has Domain',
  domainName: 'Domain',
  hasExistingWebsite: 'Existing Website',
  existingWebsiteLink: 'Existing Website Link',
  supportLevel: 'Support Level',
  optionalServices: 'Optional Services',
  notes: 'Notes'
};

const languageLabels = {
  en: 'English',
  ar: 'Arabic'
};

const editableSubmissionFields = [
  { key: 'businessName', label: 'Business Name', input: 'text' },
  { key: 'businessEmail', label: 'Contact Email', input: 'email' },
  { key: 'businessPhone', label: 'Phone', input: 'text' },
  { key: 'industry', label: 'Industry', input: 'text' },
  { key: 'businessDescription', label: 'Business Description', input: 'textarea' },
  { key: 'socialLinks', label: 'Social Links', input: 'textarea' },
  { key: 'mainPurpose', label: 'Main Purpose', input: 'select', options: [
    ['sell_products_services', 'Sell Products / Services'],
    ['generate_leads', 'Generate Leads'],
    ['accept_bookings', 'Accept Bookings / Appointments'],
    ['provide_information', 'Provide Information'],
    ['build_brand_awareness', 'Build Brand Awareness'],
    ['improve_google_ranking', 'Improve Google Ranking']
  ] },
  { key: 'visitorAction', label: 'Visitor Action', input: 'text' },
  { key: 'idealCustomer', label: 'Ideal Customer', input: 'textarea' },
  { key: 'budgetRange', label: 'Budget', input: 'text' },
  { key: 'launchDate', label: 'Launch Date', input: 'text' },
  { key: 'urgency', label: 'Urgency', input: 'select', options: [
    ['urgent', 'Urgent'],
    ['soon', 'Soon'],
    ['exploring', 'Exploring'],
    ['unknown', 'Unknown']
  ] },
  { key: 'inspirationSites', label: 'Inspiration Websites', input: 'textarea' },
  { key: 'competitors', label: 'Competitors', input: 'textarea' },
  { key: 'domainName', label: 'Domain', input: 'text' },
  { key: 'existingWebsiteLink', label: 'Existing Website Link', input: 'text' }
];

const rawValueLabels = {
  en: 'English',
  ar: 'Arabic',
  yes: 'Yes',
  no: 'No',
  not_sure: 'Not Sure',
  full_support: 'Full Support',
  regular_care: 'Regular Care',
  occasional_help: 'Occasional Help',
  basic_care: 'Basic Care',
  multi_language: 'Multi-language',
  any: 'Any',
  mostly_men: 'Mostly Men',
  mostly_women: 'Mostly Women',
  families: 'Families',
  businesses_b2b: 'Businesses / B2B',
  budget_conscious: 'Budget-conscious',
  mid_range: 'Mid-range',
  premium: 'Premium',
  luxury_high_ticket: 'Luxury / High-ticket',
  sell_products_services: 'Sell Products / Services',
  generate_leads: 'Generate Leads',
  accept_bookings: 'Accept Bookings / Appointments',
  provide_information: 'Provide Information',
  build_brand_awareness: 'Build Brand Awareness',
  improve_google_ranking: 'Improve Google Ranking',
  clean_simple: 'Clean & Simple',
  dark_modern: 'Dark & Modern',
  soft_calm: 'Soft & Calm',
  bold_eye_catching: 'Bold & Eye-catching',
  elegant_premium: 'Elegant & Premium',
  yes_provide_everything: 'Yes - I Will Provide Everything',
  no_need_help: 'No - I Need Help With Content',
  mix_of_both: 'Mix Of Both',
  privacy_policy: 'Privacy Policy',
  terms_conditions: 'Terms & Conditions',
  not_required: 'Not Required',
  whatsapp_integration: 'WhatsApp Integration',
  booking_system: 'Booking System',
  online_payments: 'Online Payments',
  admin_dashboard: 'Admin Dashboard',
  crm_integration: 'CRM Integration',
  ai_chatbot: 'AI Chatbot',
  inventory_management: 'Inventory Management',
  order_tracking: 'Order Tracking',
  analytics_dashboard: 'Analytics Dashboard',
  gallery: 'Gallery',
  blog: 'Blog',
  maps: 'Maps',
  reviews: 'Reviews',
  newsletter: 'Newsletter',
  file_uploads: 'File Uploads',
  user_accounts: 'User Accounts',
  loyalty_systems: 'Loyalty Systems',
  memberships: 'Memberships',
  social_feeds: 'Social Feeds',
  team_portals: 'Team Portals',
  flexible: 'Flexible',
  moderate: 'Moderate',
  urgent: 'Urgent',
  logo_design: 'Logo Design',
  social_media_setup_management: 'Social Media Setup & Management',
  google_business_optimization: 'Google Business Optimization',
  product_photography: 'Product Photography',
  content_writing: 'Content Writing',
  paid_ads: 'Paid Ads',
  promotional_videos: 'Promotional Videos',
  multi_location_setup: 'Multi-location Setup',
  home: 'Home',
  about: 'About',
  services_products: 'Services / Products',
  pricing: 'Pricing',
  contact: 'Contact',
  gallery_portfolio: 'Gallery / Portfolio',
  faq: 'FAQ',
  blog_news_offers: 'Blog / News / Offers',
  call_them: 'Call Them',
  visit_them: 'Visit Them',
  send_details: 'Send Details',
  send_them_details_on_whatsapp: 'Send Details',
  send_details_on_whatsapp: 'Send Details',
  setting_meeting: 'Setting Meeting',
  they_will_call_back: 'They Will Call Back',
  declined: 'Declined',
  confirmed: 'Confirmed'
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const slugifyCardValue = (value) => String(value ?? '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .replace(/-{2,}/g, '-')
  .slice(0, 48);

const sanitizePhoneValue = (value) => String(value ?? '').replace(/[^\d+]/g, '');

const normalizeWhatsappNumber = (value) => String(value ?? '').replace(/[^\d]/g, '');

const getCardPublicUrl = (slug) => `${CARD_SITE_URL}/card/${slug}`;

/** API routes only exist on the dev server (port 3000) and production — not on Live Server / static hosts. */
const getAdminApiUrl = (pathname) => {
  const path = String(pathname || '').startsWith('/') ? pathname : `/${pathname || ''}`;
  try {
    const { hostname, port } = window.location;
    const onDevServer = (hostname === 'localhost' || hostname === '127.0.0.1') && port === '3000';
    const onProduction = /(^|\.)qdsystems\.ae$/i.test(hostname);
    if (onDevServer || onProduction) return path;
  } catch {
    // ignore
  }
  return `https://www.qdsystems.ae${path}`;
};

const getCardInitials = (value) => {
  const parts = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'QD';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
};

const shortenCardUrl = (value) => {
  try {
    const url = new URL(String(value ?? ''));
    return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`.replace(/\/$/, '');
  } catch {
    return String(value ?? '');
  }
};

const cardIconLabel = (value) => {
  if (!value) return 'Link';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const createEmptyCardDraft = () => ({
  name: '',
  role: '',
  slug: '',
  phone: '',
  email: '',
  website: CARD_DEFAULT_WEBSITE,
  avatar: '',
  avatarStoragePath: '',
  links: [],
  ctaLabel: CARD_DEFAULT_CTA_LABEL,
  ctaUrl: CARD_DEFAULT_CTA_URL,
  active: true,
  views: 0
});

const getInvitePublicUrl = (slug) => `${CARD_SITE_URL}/invite/${slug}`;
const getDemoPublicUrl = (slug) => `${CARD_SITE_URL}/demo/${slug}`;

const createEmptyInvitationDraft = () => ({
  slug: '',
  brideName: '',
  groomName: '',
  coupleDisplayName: '',
  eventTitle: 'Wedding Invitation',
  eventDate: '',
  eventTime: '',
  venueName: '',
  venueAddress: '',
  mapUrl: '',
  languageDefault: 'en',
  theme: 'royal-gold',
  coverImageUrl: '',
  coverImageStoragePath: '',
  musicUrl: '',
  musicStoragePath: '',
  gallery: [],
  rsvpEnabled: true,
  rsvpDeadline: '',
  whatsappNumber: '',
  active: false,
  status: 'draft',
  views: 0,
  rsvpCount: 0,
  features: createDefaultInvitationFeatures()
});

const createEmptyDemoDraft = () => ({
  title: '',
  clientName: '',
  slug: '',
  demoUrl: '',
  githubRepoUrl: '',
  vercelProjectUrl: '',
  vercelPreviewUrl: '',
  deployHookUrl: '',
  passcodeHash: '',
  passcode: '',
  status: 'draft',
  notes: '',
  expiresAt: '',
  viewCount: 0,
  lastViewedAt: null,
  createdBy: '',
  updatedBy: ''
});

const createEmptyOutreachLeadDraft = () => ({
  businessName: '',
  ownerName: '',
  phoneNumber: '',
  hasWebsite: 'no',
  websiteUrl: '',
  meetingDateTime: '',
  meetingLocation: '',
  notes: '',
  status: 'visit_them',
  starred: false,
  importedSubmissionId: '',
  importedAt: null,
  importedFrom: ''
});

const hydrateCard = (snapshot) => ({
  id: snapshot.id,
  ...snapshot.data()
});

const hydrateInvitation = (snapshot) => {
  const data = snapshot.data();
  const media = normalizeInvitationMediaFields({
    coverImageUrl: data.coverImageUrl,
    musicUrl: data.musicUrl
  });
  return {
    id: snapshot.id,
    ...createEmptyInvitationDraft(),
    ...data,
    ...media,
    gallery: normalizeInvitationGallery(data.gallery)
  };
};

const hydrateInvitationRsvp = (snapshot) => ({
  id: snapshot.id,
  ...normalizeRsvpRecord(snapshot.data()),
  ...snapshot.data()
});

const hydrateDemo = (snapshot) => ({
  id: snapshot.id,
  ...createEmptyDemoDraft(),
  ...snapshot.data()
});

const hydrateOutreachLead = (snapshot) => ({
  id: snapshot.id,
  ...createEmptyOutreachLeadDraft(),
  ...snapshot.data()
});

const hydrateActivityLog = (snapshot) => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata : {},
    timestampMs: getTimestampMs(data.timestamp)
  };
};

const deepCloneForLog = (value) => JSON.parse(JSON.stringify(value ?? null));

const normalizeLogValue = (value) => {
  if (Array.isArray(value)) return value.map(normalizeLogValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = normalizeLogValue(value[key]);
      return acc;
    }, {});
  }
  return value ?? null;
};

const areLogValuesEqual = (a, b) => JSON.stringify(normalizeLogValue(a)) === JSON.stringify(normalizeLogValue(b));

const getActivityActionLabel = (value) => activityActionLabels[value] || formatLabel(value || 'activity');
const getActivityTargetTypeLabel = (value) => activityTargetTypeLabels[value] || formatLabel(value || 'record');

const formatActivityTimestamp = (value) => {
  const ms = getTimestampMs(value);
  if (ms) return formatDate(value);
  return 'Pending sync';
};

const rememberOpenedActivityKey = (key) => {
  openedActivitySessionSet.add(key);
  try {
    window.sessionStorage.setItem(activityOpenSessionKey, JSON.stringify([...openedActivitySessionSet]));
  } catch {}
};

const shouldSkipOpenActivityLog = ({ action, targetType, targetId, actorUid }) => {
  if (!['open_submission', 'open_smart_card'].includes(action)) return false;
  const key = `${String(actorUid || '')}:${action}:${String(targetId || '')}`;
  if (openedActivitySessionSet.has(key)) return true;
  rememberOpenedActivityKey(key);
  return false;
};

const formatActivityValueForDisplay = (value) => {
  if (Array.isArray(value)) {
    if (!value.length) return 'None';
    return value.map((item) => formatActivityValueForDisplay(item)).join(', ');
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${formatLabel(key)}: ${formatActivityValueForDisplay(item)}`)
      .join(' | ');
  }
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'Not provided';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 'Not provided';
    return trimmed;
  }
  return String(value);
};

const summarizeActivityMetadata = (metadata = {}) => {
  const rows = [];
  const changedFields = Array.isArray(metadata.changedFields) ? metadata.changedFields : [];
  if (changedFields.length && metadata.before && metadata.after) {
    rows.push(`Changed fields: ${changedFields.map((field) => formatLabel(field)).join(', ')}`);
    changedFields.forEach((field) => {
      rows.push(`${formatLabel(field)}: ${formatActivityValueForDisplay(metadata.before[field])} -> ${formatActivityValueForDisplay(metadata.after[field])}`);
    });
  }

  Object.entries(metadata).forEach(([key, value]) => {
    if (['changedFields', 'before', 'after'].includes(key)) return;
    rows.push(`${formatLabel(key)}: ${formatActivityValueForDisplay(value)}`);
  });

  return rows;
};

const buildChangedMetadata = (before = {}, after = {}) => {
  const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));
  const changedFields = keys.filter((key) => !areLogValuesEqual(before[key], after[key]));
  return {
    changedFields,
    before: changedFields.reduce((acc, key) => {
      acc[key] = before[key] ?? null;
      return acc;
    }, {}),
    after: changedFields.reduce((acc, key) => {
      acc[key] = after[key] ?? null;
      return acc;
    }, {})
  };
};

const logAdminActivity = async ({
  action,
  targetType,
  targetId,
  targetLabel,
  metadata = {}
} = {}) => {
  try {
    const actor = state.user;
    if (!actor?.uid || !actor?.email || !action) return;
    if (shouldSkipOpenActivityLog({ action, targetType, targetId, actorUid: actor.uid })) return;
    await addDoc(collection(db, 'adminActivityLogs'), {
      action,
      page: 'admin',
      targetType: targetType || 'submission',
      targetId: String(targetId || ''),
      targetLabel: String(targetLabel || targetId || ''),
      actorEmail: String(actor.email || '').toLowerCase(),
      actorUid: actor.uid,
      timestamp: serverTimestamp(),
      metadata: metadata && typeof metadata === 'object' ? metadata : {}
    });
  } catch (error) {
    console.warn('[activity] admin log failed:', error?.message || error);
  }
};

const getSubmissionActivityLabel = (submission) => {
  const label = formatValue(getAnswer(submission, 'businessName'));
  return /^not provided$/i.test(label) ? submission?.id || 'Submission' : label;
};

const getSmartCardActivityLabel = (card) => card?.name || card?.slug || card?.id || 'Smart card';
const getDemoActivityLabel = (demo) => demo?.title || demo?.slug || demo?.id || 'Client demo';
const getOutreachLeadActivityLabel = (lead) => lead?.businessName || lead?.ownerName || lead?.id || 'Outreach lead';

const getSubmissionLogState = (submission) => {
  if (!submission) return {};
  const logState = {
    status: submission.status ?? 'New',
    priority: submission.priority ?? 'Normal',
    notes: submission.notes ?? '',
    meetingDateTime: getSubmissionMeetingDate(submission)
  };
  editableSubmissionFields.forEach(({ key }) => {
    logState[key] = getAnswer(submission, key);
  });
  return logState;
};

const getSmartCardLogState = (card) => ({
  slug: card?.slug || '',
  name: card?.name || '',
  role: card?.role || '',
  company: card?.company || '',
  phone: card?.phone || '',
  email: card?.email || '',
  website: card?.website || '',
  links: deepCloneForLog(card?.links || []),
  ctaLabel: card?.ctaLabel || '',
  ctaUrl: card?.ctaUrl || '',
  active: card?.active !== false,
  views: Number(card?.views || 0),
  avatar: card?.avatar || ''
});

const getQuoteLogState = (quote) => ({
  customer: deepCloneForLog(quote?.customer || {}),
  lineItems: deepCloneForLog(quote?.lineItems || []),
  pages: deepCloneForLog(quote?.pages || {}),
  terms: deepCloneForLog(quote?.terms || {}),
  notes: quote?.notes || '',
  validDays: Number(quote?.validDays || 0),
  vatPercent: Number(quote?.vatPercent || 0),
  vatInclusive: quote?.vatInclusive !== false,
  careMonthly: Number(quote?.careMonthly || 0),
  carePlanName: quote?.carePlanName || '',
  language: quote?.language || 'en'
});

const getDemoLogState = (demo) => ({
  title: demo?.title || '',
  clientName: demo?.clientName || '',
  slug: demo?.slug || '',
  demoUrl: demo?.demoUrl || '',
  githubRepoUrl: demo?.githubRepoUrl || '',
  vercelProjectUrl: demo?.vercelProjectUrl || '',
  vercelPreviewUrl: demo?.vercelPreviewUrl || '',
  hasDeployHookUrl: Boolean(demo?.deployHookUrl),
  hasPasscodeHash: Boolean(demo?.passcodeHash),
  status: demo?.status || 'draft',
  notes: demo?.notes || '',
  expiresAt: demo?.expiresAt ? formatDate(demo.expiresAt) : '',
  viewCount: Number(demo?.viewCount || 0),
  lastViewedAt: demo?.lastViewedAt ? formatDate(demo.lastViewedAt) : ''
});

const getOutreachLeadLogState = (lead) => ({
  businessName: lead?.businessName || '',
  ownerName: lead?.ownerName || '',
  phoneNumber: lead?.phoneNumber || '',
  hasWebsite: lead?.hasWebsite === 'yes' ? 'yes' : 'no',
  websiteUrl: lead?.websiteUrl || '',
  meetingDateTime: lead?.meetingDateTime || '',
  meetingLocation: lead?.meetingLocation || '',
  notes: lead?.notes || '',
  status: lead?.status || 'visit_them',
  importedSubmissionId: lead?.importedSubmissionId || '',
  importedFrom: lead?.importedFrom || ''
});

const buildCardLinkRows = (links = []) => {
  if (!links.length) {
    return `
      <div class="qd-admin-card-link-empty">
        <p>Extra links are optional. Add Instagram, LinkedIn, portfolio, or any custom destination.</p>
      </div>
    `;
  }

  return links.map((link, index) => `
    <div class="qd-admin-card-link-row" data-card-link-row="${index}">
      <input class="qd-admin-input" type="text" data-card-link-field="label" data-card-link-index="${index}" value="${escapeHtml(link.label || '')}" placeholder="Label">
      <input class="qd-admin-input" type="url" data-card-link-field="url" data-card-link-index="${index}" value="${escapeHtml(link.url || '')}" placeholder="https://...">
      <select class="qd-admin-select" data-card-link-field="icon" data-card-link-index="${index}">
        ${cardIconOptions.map((icon) => `
          <option value="${escapeHtml(icon)}" ${(link.icon || 'link') === icon ? 'selected' : ''}>${escapeHtml(cardIconLabel(icon))}</option>
        `).join('')}
      </select>
      <button class="qd-btn qd-btn-sm qd-admin-action-danger" type="button" data-action="remove-card-link" data-index="${index}">Remove</button>
    </div>
  `).join('');
};

const getCardStatusBadge = (card) => `
  <span class="qd-admin-card-status ${card.active === false ? 'is-inactive' : 'is-active'}">
    ${card.active === false ? 'Inactive' : 'Active'}
  </span>
`;

const getCardEditorStateClass = () => {
  const status = state.cardEditor?.slugState?.status;
  if (status === 'valid') return 'is-valid';
  if (status === 'invalid') return 'is-invalid';
  if (status === 'checking') return 'is-checking';
  return '';
};

const getCardEditorDraftFromState = () => ({
  ...createEmptyCardDraft(),
  ...(state.cardEditor?.draft || {})
});

const buildCardEditorPreviewUrl = (slug) => getCardPublicUrl(slugifyCardValue(slug) || 'your-slug');
const buildInvitationPreviewUrl = (slug) => getInvitePublicUrl(slugifyCardValue(slug) || 'your-invitation');
const buildDemoPreviewUrl = (slug) => getDemoPublicUrl(slugifyCardValue(slug) || 'your-demo');
const buildInvitationAdminPreviewUrl = (invitation) => {
  const slug = slugifyCardValue(invitation?.slug || '');
  const url = new URL(getInvitePublicUrl(slug || 'your-invitation'));
  if (invitation?.id) {
    url.searchParams.set('preview', '1');
    url.searchParams.set('invitationId', invitation.id);
  }
  return url.toString();
};

const getInvitationStatus = (invitation) => {
  if (!invitation) return 'draft';
  if (INVITE_STATUS_OPTIONS.includes(invitation.status)) return invitation.status;
  return invitation.active ? 'active' : 'draft';
};

const getInvitationStatusLabel = (invitation) => inviteStatusLabels[getInvitationStatus(invitation)] || 'Draft';

const getInvitationStatusClass = (invitation) => {
  const status = getInvitationStatus(invitation);
  if (status === 'active') return 'is-active';
  if (status === 'disabled') return 'is-disabled';
  return 'is-draft';
};

const deriveInvitationDisplayName = (draft) => deriveCoupleDisplayName(draft, draft?.languageDefault === 'ar' ? 'ar' : 'en');

const formatInvitationDate = (value) => {
  if (!value) return 'Date not set';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(parsed);
};

const formatInvitationRsvpTime = (value) => {
  const ms = getTimestampMs(value);
  if (!ms) return 'Pending sync';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(ms);
};

const normalizeWhatsappAdminNumber = (value) => String(value ?? '').replace(/[^\d+]/g, '');

const buildInvitationWhatsappShareUrl = (invitation, lang) => {
  const link = getInvitePublicUrl(invitation.slug || '');
  const message = buildInvitationWhatsappMessage(invitation, lang || invitation.languageDefault || 'en', link);
  const number = String(invitation.whatsappNumber || '').replace(/[^\d]/g, '');
  const base = number ? `https://wa.me/${number}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(message)}`;
};

const getFilteredInvitationRsvps = () => {
  const filters = state.invitationRsvpFilters;
  const search = filters.search.trim().toLowerCase();
  const phone = filters.phone.trim().toLowerCase();
  let items = [...state.invitationRsvps];

  if (search) {
    items = items.filter((rsvp) => String(rsvp.guestName || rsvp.name || '').toLowerCase().includes(search));
  }
  if (phone) {
    items = items.filter((rsvp) => String(rsvp.phone || '').toLowerCase().includes(phone));
  }
  if (filters.attending === 'yes') {
    items = items.filter((rsvp) => rsvp.attending === 'yes');
  } else if (filters.attending === 'no') {
    items = items.filter((rsvp) => rsvp.attending === 'no');
  }

  items.sort((a, b) => {
    const aMs = getTimestampMs(a.createdAt) || 0;
    const bMs = getTimestampMs(b.createdAt) || 0;
    return filters.sort === 'oldest' ? aMs - bMs : bMs - aMs;
  });

  return items;
};

const getInvitationRsvpSummary = (rsvps, invitation) => {
  const total = rsvps.length;
  const attending = rsvps.filter((rsvp) => rsvp.attending === 'yes');
  const notAttending = rsvps.filter((rsvp) => rsvp.attending === 'no');
  const expectedGuests = attending.reduce((sum, rsvp) => sum + Number(rsvp.guestCount ?? rsvp.guests ?? 1), 0);
  const views = Number(invitation?.views || 0);
  const responseRate = views > 0 ? ((total / views) * 100).toFixed(1) : null;
  return { total, attending: attending.length, notAttending: notAttending.length, expectedGuests, responseRate };
};

const exportInvitationRsvpsCsv = (invitation, rsvps) => {
  const rows = [
    ['Guest Name', 'Phone', 'Attending', 'Guest Count', 'Message', 'Submitted'],
    ...rsvps.map((rsvp) => [
      rsvp.guestName || rsvp.name || '',
      rsvp.phone || '',
      rsvp.attending === 'yes' ? 'Yes' : 'No',
      String(rsvp.guestCount ?? rsvp.guests ?? ''),
      (rsvp.message || '').replace(/"/g, '""'),
      formatInvitationRsvpTime(rsvp.createdAt)
    ])
  ];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `rsvps-${invitation.slug || invitation.id || 'invitation'}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const copyInvitationWhatsappMessage = async (invitation, lang) => {
  const message = buildInvitationWhatsappMessage(invitation, lang, getInvitePublicUrl(invitation.slug || ''));
  await navigator.clipboard.writeText(message);
  showAdminToast(lang === 'ar' ? 'Arabic WhatsApp message copied.' : 'English WhatsApp message copied.');
};

const getInvitationEditorDraftFromState = () => ({
  ...createEmptyInvitationDraft(),
  ...(state.invitationEditor?.draft || {})
});

const getDemoEditorDraftFromState = () => ({
  ...createEmptyDemoDraft(),
  ...(state.demoEditor?.draft || {})
});

const getDemoStatus = (demo) => {
  if (!demo) return 'draft';
  return DEMO_STATUS_OPTIONS.includes(demo.status) ? demo.status : 'draft';
};

const getDemoStatusLabel = (demo) => demoStatusLabels[getDemoStatus(demo)] || 'Draft';

const getDemoStatusTone = (demo) => {
  const status = getDemoStatus(demo);
  if (status === 'active') return 'active';
  if (status === 'expired') return 'expired';
  if (status === 'disabled') return 'disabled';
  return 'draft';
};

const getDemoStatusBadge = (demo) => `
  <span class="qd-demo-status-pill" data-tone="${escapeHtml(getDemoStatusTone(demo))}">
    ${escapeHtml(getDemoStatusLabel(demo))}
  </span>
`;

const formatDemoExpiry = (value) => {
  if (!value) return 'No expiry';
  const ms = getTimestampMs(value);
  if (!ms) return 'No expiry';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(ms);
};

const formatLabel = (value) => {
  if (value === null || value === undefined || value === '') return 'Not Provided';
  const raw = String(value).trim();
  if (!raw) return 'Not Provided';
  if (rawValueLabels[raw]) return rawValueLabels[raw];
  if (fieldLabels[raw]) return fieldLabels[raw];
  return raw
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bAnd\b/g, '&')
    .replace('Multi Language', 'Multi-language')
    .replace('Sell Products Services', 'Sell Products / Services');
};

const formatLanguage = (value) => languageLabels[String(value || '').toLowerCase()] || formatLabel(value || 'Unknown');

const formatCurrency = (value) => {
  if (value === null || value === undefined || value === '') return 'Not Provided';
  const raw = String(value).trim();
  if (!raw) return 'Not Provided';
  const numeric = Number(raw.replace(/[^\d.]/g, ''));
  if (Number.isNaN(numeric) || numeric <= 0) return raw;
  return `AED ${numeric.toLocaleString('en-US')}`;
};

const formatCurrencyNumber = (value, { compact = false } = {}) => {
  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric <= 0) return 'Not Provided';

  if (compact) {
    const short = new Intl.NumberFormat('en', {
      notation: 'compact',
      maximumFractionDigits: numeric >= 1000000 ? 1 : 0
    }).format(numeric);
    return `AED ${short.toUpperCase()}`;
  }

  return `AED ${numeric.toLocaleString('en-US')}`;
};

const formatDate = (value) => {
  const ms = getTimestampMs(value);
  if (ms) {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(ms);
  }

  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(date);
    }
    return value;
  }

  return 'Not Provided';
};

const isFlexibleLaunchValue = (value) => {
  if (value === null || value === undefined) return true;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return true;
  return ['flexible', 'not sure', 'not_sure', 'not provided', 'not-provided', 'n/a', 'na', 'tbd'].includes(raw);
};

const parseLaunchDateValue = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && isFlexibleLaunchValue(value)) return null;

  const ms = getTimestampMs(value);
  if (ms) {
    const date = new Date(ms);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }
  }

  return null;
};

const formatLaunchDate = (value) => {
  const parsed = parseLaunchDateValue(value);
  if (parsed) {
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(parsed);
  }

  if (typeof value === 'string' && value.trim()) {
    return isFlexibleLaunchValue(value) ? formatLabel(value) : value.trim();
  }

  return 'Not provided';
};

const getAnswer = (submission, key) => {
  if (!submission) return '';
  const answers = submission.answers || {};
  if (answers[key] !== undefined && answers[key] !== null && answers[key] !== '') return answers[key];
  if (submission[key] !== undefined && submission[key] !== null && submission[key] !== '') return submission[key];
  return '';
};

const getSubmissionMeetingDate = (submission) => {
  return getAnswer(submission, 'meetingDateTime')
    || getAnswer(submission, 'preferredCallTime')
    || submission.meetingDateTime
    || '';
};

const formatSubmissionMeetingDate = (submission) => {
  const raw = getSubmissionMeetingDate(submission);
  if (!raw || !String(raw).trim()) return 'Not provided';

  const text = String(raw).trim();
  const slotMatch = text.match(/^(\d{4}-\d{2}-\d{2})(?:\s+at\s+(\d{2}:\d{2}))?$/i);
  if (slotMatch) {
    const [, datePart, timePart] = slotMatch;
    const iso = timePart ? `${datePart}T${timePart}:00` : `${datePart}T12:00:00`;
    const date = new Date(iso);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat('en-GB', {
        dateStyle: 'medium',
        ...(timePart ? { timeStyle: 'short' } : {})
      }).format(date);
    }
  }

  const formatted = formatDate(text);
  return formatted === 'Not Provided' ? text : formatted;
};

const toDatetimeLocalValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const slotMatch = raw.match(/^(\d{4}-\d{2}-\d{2})(?:\s+at\s+(\d{2}:\d{2}))?$/i);
  if (slotMatch) {
    const [, datePart, timePart] = slotMatch;
    return timePart ? `${datePart}T${timePart}` : `${datePart}T09:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return raw.slice(0, 16);

  const ms = getTimestampMs(raw);
  if (ms) {
    const date = new Date(ms);
    const pad = (part) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const pad = (part) => String(part).padStart(2, '0');
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
  }

  return '';
};

const createDrawerDraft = (submission, previousDraft = {}) => {
  if (!submission) return null;

  const base = {
    id: submission.id,
    status: previousDraft.status ?? submission.status ?? 'New',
    priority: previousDraft.priority ?? submission.priority ?? 'Normal',
    notes: previousDraft.notes ?? submission.notes ?? '',
    meetingDateTime: previousDraft.id === submission.id && previousDraft.meetingDateTime !== undefined
      ? previousDraft.meetingDateTime
      : getSubmissionMeetingDate(submission),
    editMode: previousDraft.id === submission.id ? previousDraft.editMode === true : false
  };

  editableSubmissionFields.forEach(({ key }) => {
    base[key] = previousDraft.id === submission.id && previousDraft[key] !== undefined
      ? previousDraft[key]
      : getAnswer(submission, key);
  });

  return base;
};

const formatValue = (value, { type = 'text' } = {}) => {
  if (value === null || value === undefined || value === '') return 'Not provided';

  if (Array.isArray(value)) {
    if (!value.length) return 'Not provided';
    return value.map((item) => formatLabel(item)).join(', ');
  }

  if (type === 'language') return formatLanguage(value);
  if (type === 'currency') return formatCurrency(value);
  if (type === 'date') return formatDate(value);
  if (type === 'launch-date') return formatLaunchDate(value);
  if (type === 'boolean') return formatLabel(value);
  if (type === 'label') return formatLabel(value);
  if (type === 'text') return typeof value === 'string' ? value.trim() || 'Not provided' : String(value);

  return formatLabel(value);
};

const isAllowedAdminUser = (user) => {
  if (!user) return false;
  return allowedAdminEmails.includes((user.email || '').toLowerCase());
};

const isPermissionDeniedError = (error) => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return code.includes('permission-denied')
    || message.includes('insufficient permissions')
    || message.includes('missing or insufficient permissions');
};

const ensureAdminFirestoreSession = async (user = auth.currentUser) => {
  if (!user) return false;

  try {
    await user.getIdToken(true);
    return true;
  } catch (error) {
    console.warn('[admin] auth token refresh failed:', error?.message || error);
    return false;
  }
};

const getTimestampMs = (value) => {
  if (!value) return 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const formatDateTime = formatDate;

const normalizeArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
};

const summarizeCollection = (items) => {
  const counter = new Map();

  items.forEach((value) => {
    normalizeArray(value).forEach((entry) => {
      const key = formatLabel(entry);
      counter.set(key, (counter.get(key) || 0) + 1);
    });
  });

  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
};

const formatPhoneForWhatsApp = (phone) => String(phone || '').replace(/[^\d]/g, '');

const formatPhoneForCall = (phone) => {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  return /^\+/.test(raw) ? `+${digits}` : digits;
};

const getOutreachStatusLabel = (value) => OUTREACH_STATUS_OPTIONS.find((option) => option.value === value)?.label || formatLabel(value || 'visit_them');

const getOutreachStatusTone = (value) => {
  if (value === 'confirmed') return 'accepted';
  if (value === 'call_them') return 'contacted';
  if (value === 'visit_them') return 'contacted';
  if (value === 'send_details' || value === 'send_them_details_on_whatsapp' || value === 'send_details_on_whatsapp') return 'contacted';
  if (value === 'they_will_call_back') return 'quoted';
  if (value === 'declined') return 'archived';
  return 'new';
};

const isOutreachGoogleMapsUrl = (value) => {
  const input = String(value || '').trim();
  if (!input) return false;
  try {
    const url = new URL(input);
    if (!/^https?:$/i.test(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'maps.app.goo.gl' || host === 'goo.gl' || host === 'g.co') return true;
    if (/^(?:[\w-]+\.)*google\.[a-z.]{2,}$/i.test(host)) {
      return host.startsWith('maps.')
        || /\/maps|\/place|\/@/.test(`${url.pathname}${url.search}${url.hash}`);
    }
    return false;
  } catch {
    return false;
  }
};

const buildOutreachMapsLink = (lead) => {
  const value = String(lead?.meetingLocation || '').trim();
  return isOutreachGoogleMapsUrl(value) ? value : '';
};

const buildOutreachCallLink = (lead) => {
  const phone = formatPhoneForCall(lead?.phoneNumber || '');
  if (!phone) return '';
  return `tel:${phone}`;
};

const formatOutreachMeeting = (lead) => {
  const parts = [];
  if (lead?.meetingDateTime) {
    parts.push(formatDate(lead.meetingDateTime));
  }
  if (lead?.meetingLocation) {
    parts.push(String(lead.meetingLocation || '').trim());
  }
  return parts.filter(Boolean).join(' | ');
};

const formatOutreachWebsiteLabel = (url, maxLength = 42) => {
  const value = String(url || '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./i, '');
    const path = `${parsed.pathname}${parsed.search}`.replace(/\/$/, '');
    const compact = path && path !== '/' ? `${host}${path}` : host;
    if (compact.length <= maxLength) return compact;
    return `${compact.slice(0, maxLength - 1)}…`;
  } catch {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 1)}…`;
  }
};

const renderOutreachWebsiteLink = (url) => {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) return '—';
  const label = formatOutreachWebsiteLabel(cleanUrl);
  return `<a class="qd-admin-outreach-website-link" href="${escapeHtml(cleanUrl)}" target="_blank" rel="noreferrer noopener" title="${escapeHtml(cleanUrl)}">${escapeHtml(label)}</a>`;
};

const renderOutreachLocationLink = (lead) => {
  const mapsLink = buildOutreachMapsLink(lead);
  if (!mapsLink) return '—';
  return `<a class="qd-admin-outreach-location-link" href="${escapeHtml(mapsLink)}" target="_blank" rel="noreferrer noopener" data-outreach-stop-row-open title="${escapeHtml(mapsLink)}">Location</a>`;
};

const joinSection = (title, rows) => {
  return [
    `${title}:`,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ``
  ].join('\n');
};

const buildWhatsAppLink = (submission) => {
  const phone = formatPhoneForWhatsApp(getAnswer(submission, 'businessPhone'));
  if (!phone) return '';
  const message = `Hi ${getAnswer(submission, 'businessName') || 'there'}, this is QD Systems. We received your project request and reviewed your details. We'll follow up with the next steps.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
};

const buildMailtoLink = (submission) => {
  const email = getAnswer(submission, 'businessEmail');
  if (!email) return '';
  return `mailto:${email}?subject=${encodeURIComponent('QD Systems - Project Request')}`;
};

const buildCallLink = (submission) => {
  const phone = formatPhoneForCall(getAnswer(submission, 'businessPhone'));
  if (!phone) return '';
  return `tel:${phone}`;
};

const buildEmailSummary = (submission) => {
  const submittedAt = formatDate(submission.submittedAt || submission.createdAt);
  const lastUpdatedAt = formatDate(submission.lastUpdatedAt || submission.createdAt || submission.submittedAt);

  return [
    `QD Systems — Project Submission Summary`,
    ``,
    joinSection('Business Information', [
      ['Business Name', formatValue(getAnswer(submission, 'businessName'))],
      ['Contact Email', formatValue(getAnswer(submission, 'businessEmail'))],
      ['Phone', formatValue(getAnswer(submission, 'businessPhone'))],
      ['Industry', formatValue(getAnswer(submission, 'industry'))],
      ['Business Description', formatValue(getAnswer(submission, 'businessDescription'))],
      ['Social Links', formatValue(getAnswer(submission, 'socialLinks'))]
    ]),
    joinSection('Website Goals', [
      ['Main Purpose', formatValue(submission.selectedMainPurpose || getAnswer(submission, 'mainPurpose'))],
      ['Visitor Action', formatValue(getAnswer(submission, 'visitorAction'))],
      ['Ideal Customer', formatValue(getAnswer(submission, 'idealCustomer'))]
    ]),
    joinSection('Branding & Design', [
      ['Has Logo', formatValue(getAnswer(submission, 'hasLogo'), { type: 'label' })],
      ['Has Brand Assets', formatValue(getAnswer(submission, 'hasBrandAssets'), { type: 'label' })],
      ['Brand Assets / References', formatValue(getAnswer(submission, 'brandAssets'))],
      ['Preferred Style', formatValue(getAnswer(submission, 'preferredStyle'), { type: 'label' })],
      ['Preferred Colors', formatValue(getAnswer(submission, 'preferredColors'))],
      ['Colors To Avoid', formatValue(getAnswer(submission, 'colorsToAvoid'))]
    ]),
    joinSection('Pages & Content', [
      ['Needed Pages', formatValue(getAnswer(submission, 'neededPages'))],
      ['Product / Service Count', formatValue(getAnswer(submission, 'productCount'))],
      ['Content Readiness', formatValue(getAnswer(submission, 'contentReadiness'), { type: 'label' })],
      ['Legal Pages', formatValue(getAnswer(submission, 'legalPages'), { type: 'label' })]
    ]),
    joinSection('Features & Functionality', [
      ['Required Features / Modules', formatValue(submission.selectedRequiredFeatures || getAnswer(submission, 'requiredFeatures'))],
      ['Languages Needed', formatValue(getAnswer(submission, 'requiredFeatures__multi_language_languages'))],
      ['Custom Features', formatValue(getAnswer(submission, 'customFeatures'))]
    ]),
    joinSection('Scope & Timeline', [
      ['Budget', formatCurrency(getAnswer(submission, 'budgetRange'))],
      ['Meeting Date', formatSubmissionMeetingDate(submission)],
      ['Launch Date', formatValue(getAnswer(submission, 'launchDate'), { type: 'launch-date' })],
      ['Urgency', formatValue(getAnswer(submission, 'urgency'), { type: 'label' })],
      ['Worked With Agency Before', formatValue(getAnswer(submission, 'workedWithAgency'), { type: 'label' })]
    ]),
    joinSection('Competitors & Inspiration', [
      ['Inspiration Websites', formatValue(getAnswer(submission, 'inspirationSites'))],
      ['Competitors', formatValue(getAnswer(submission, 'competitors'))]
    ]),
    joinSection('Technical Setup', [
      ['Has Domain', formatValue(getAnswer(submission, 'hasDomain'), { type: 'label' })],
      ['Domain Name', formatValue(getAnswer(submission, 'domainName'))],
      ['Existing Website', formatValue(getAnswer(submission, 'hasExistingWebsite'), { type: 'label' })],
      ['Existing Website Link', formatValue(getAnswer(submission, 'existingWebsiteLink'))]
    ]),
    joinSection('Support & Optional Services', [
      ['Support Level', formatValue(getAnswer(submission, 'supportLevel'), { type: 'label' })],
      ['Optional Services', formatValue(submission.selectedOptionalServices || getAnswer(submission, 'optionalServices'))]
    ]),
    joinSection('Admin', [
      ['Status', formatValue(submission.status)],
      ['Priority', formatValue(submission.priority)],
      ['Notes', formatValue(submission.notes)],
      ['Submitted At', submittedAt],
      ['Last Updated At', lastUpdatedAt]
    ])
  ].join('\n');
};

const statusTone = (value) => String(value || 'new').toLowerCase();
const priorityTone = (value) => String(value || 'normal').toLowerCase();

const hydrateSubmission = (snapshotDoc) => {
  const data = snapshotDoc.data();

  return {
    id: snapshotDoc.id,
    ...data,
    status: data.status || 'New',
    priority: data.priority || 'Normal',
    notes: data.notes || '',
    createdAtMs: getTimestampMs(data.createdAt),
    submittedAtMs: getTimestampMs(data.submittedAt),
    lastUpdatedAtMs: getTimestampMs(data.lastUpdatedAt)
  };
};

const sortSubmissions = (items) => [...items].sort((a, b) => {
  const aMs = a.createdAtMs || a.submittedAtMs || 0;
  const bMs = b.createdAtMs || b.submittedAtMs || 0;
  return bMs - aMs;
});

const getSelectedSubmission = () => state.submissions.find((item) => item.id === state.selectedId) || null;

const ensureDrawerDraft = () => {
  const selected = getSelectedSubmission();
  if (!selected) return;
  if (state.drawerDraft && state.drawerDraft.id === selected.id) return;

  state.drawerDraft = createDrawerDraft(selected);
};

const getFilteredSubmissions = () => {
  const search = state.filters.search.trim().toLowerCase();

  return state.submissions.filter((submission) => {
    const matchesStatus = state.filters.status === 'All' || submission.status === state.filters.status;
    const matchesPriority = state.filters.priority === 'All' || submission.priority === state.filters.priority;
    if (!matchesStatus || !matchesPriority) return false;

    if (!search) return true;

    const haystack = [
      submission.businessName,
      submission.businessEmail,
      submission.businessPhone,
      getSubmissionMeetingDate(submission),
      submission.industry,
      submission.budgetRange,
      submission.selectedRequiredFeatures,
      submission.selectedOptionalServices,
      submission.selectedMainPurpose,
      normalizeArray(submission.requiredFeatures).join(' '),
      normalizeArray(submission.optionalServices).join(' ')
    ].join(' ').toLowerCase();

    return haystack.includes(search);
  });
};

const getSubmissionActivityMs = (submission) => submission.lastUpdatedAtMs || submission.createdAtMs || submission.submittedAtMs || 0;
const openPipelineStatuses = new Set(['New', 'Reviewed', 'Contacted', 'Meeting', 'Quoted', 'Under Construction']);
const getSubmissionAgeBucket = (submission, now = Date.now()) => {
  if (!openPipelineStatuses.has(submission.status)) return null;
  const activityMs = getSubmissionActivityMs(submission);
  const ageDays = activityMs ? Math.floor((now - activityMs) / 86400000) : 0;
  if (ageDays <= 2) return 'fresh';
  if (ageDays <= 7) return 'warm';
  return 'stale';
};

const scrollToPipelineSection = () => {
  requestAnimationFrame(() => {
    const targetId = state.dashboardSection === 'archive'
      ? 'qd-archived-submissions'
      : 'qd-submission-pipeline';
    const section = document.getElementById(targetId);
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
};

const applyPipelineStatusFilter = (status, { scroll = false } = {}) => {
  const nextStatus = !status || status === 'All' ? 'All' : status;
  state.filters.status = nextStatus;
  render();

  if (scroll) {
    scrollToPipelineSection();
  }
};

const getAnalytics = (items) => {
  const counts = {
    total: items.length,
    New: 0,
    Reviewed: 0,
    Contacted: 0,
    Meeting: 0,
    Quoted: 0,
    Accepted: 0,
    'Under Construction': 0,
    Completed: 0,
    Rejected: 0,
    Archived: 0
  };

  const urgencyMap = new Map();
  const priorityMap = new Map();
  const budgetNumbers = [];
  const budgetProjects = [];
  let contactReadyCount = 0;
  let quotedCount = 0;
  let acceptedCount = 0;
  let missingEmailCount = 0;
  let missingPhoneCount = 0;
  let missingBudgetCount = 0;
  let missingLaunchDateCount = 0;
  const responseBuckets = {
    underHour: 0,
    withinDay: 0,
    overDay: 0,
    notContacted: 0
  };
  const responseTimesHours = [];
  const agingBuckets = {
    fresh: 0,
    warm: 0,
    stale: 0
  };
  const now = Date.now();

  items.forEach((submission) => {
    counts[submission.status] = (counts[submission.status] || 0) + 1;

    const urgency = formatLabel(getAnswer(submission, 'urgency') || 'Unspecified');
    urgencyMap.set(urgency, (urgencyMap.get(urgency) || 0) + 1);

    const priority = submission.priority || 'Normal';
    priorityMap.set(priority, (priorityMap.get(priority) || 0) + 1);

    const budgetRaw = getAnswer(submission, 'budgetRange');
    const numericBudget = Number(String(budgetRaw || '').replace(/[^\d.]/g, ''));
    if (!Number.isNaN(numericBudget) && numericBudget > 0) {
      budgetNumbers.push(numericBudget);
      budgetProjects.push({
        id: submission.id,
        businessName: formatValue(getAnswer(submission, 'businessName')),
        budget: numericBudget,
        status: submission.status || 'New'
      });
    }

    const hasEmail = Boolean(getAnswer(submission, 'businessEmail'));
    const hasPhone = Boolean(getAnswer(submission, 'businessPhone'));
    const hasBudget = !Number.isNaN(numericBudget) && numericBudget > 0;
    const hasLaunchDate = Boolean(parseLaunchDateValue(getAnswer(submission, 'launchDate')));
    const urgencyRaw = String(getAnswer(submission, 'urgency') || '').trim().toLowerCase();
    const isPriorityHot = ['high', 'vip'].includes(String(priority).toLowerCase());
    const isUrgencyHot = ['urgent', 'soon'].includes(urgencyRaw);
    const isContactReady = hasEmail && hasPhone;
    const createdMs = submission.createdAtMs || submission.submittedAtMs || 0;
    const updatedMs = submission.lastUpdatedAtMs || 0;

    if (isContactReady) {
      contactReadyCount += 1;
    }

    if (!hasEmail) missingEmailCount += 1;
    if (!hasPhone) missingPhoneCount += 1;
    if (!hasBudget) missingBudgetCount += 1;
    if (!hasLaunchDate) missingLaunchDateCount += 1;

    if (submission.status === 'Quoted') quotedCount += 1;
    if (submission.status === 'Accepted') acceptedCount += 1;

    if ((submission.status || 'New') !== 'New' && createdMs && updatedMs && updatedMs >= createdMs) {
      const hoursToFirstContact = (updatedMs - createdMs) / 3600000;
      responseTimesHours.push(hoursToFirstContact);
      if (hoursToFirstContact < 1) responseBuckets.underHour += 1;
      else if (hoursToFirstContact < 24) responseBuckets.withinDay += 1;
      else responseBuckets.overDay += 1;
    } else if ((submission.status || 'New') === 'New') {
      responseBuckets.notContacted += 1;
    }

    const ageBucket = getSubmissionAgeBucket(submission, now);
    if (ageBucket) agingBuckets[ageBucket] += 1;
  });

  const averageBudget = budgetNumbers.length
    ? Math.round(budgetNumbers.reduce((sum, value) => sum + value, 0) / budgetNumbers.length)
    : null;
  const highestBudget = budgetNumbers.length ? Math.max(...budgetNumbers) : null;
  const lowestBudget = budgetNumbers.length ? Math.min(...budgetNumbers) : null;
  const budgetCaptureRate = items.length ? Math.round((budgetNumbers.length / items.length) * 100) : 0;
  const averageResponseHours = responseTimesHours.length
    ? Math.round((responseTimesHours.reduce((sum, value) => sum + value, 0) / responseTimesHours.length) * 10) / 10
    : null;
  return {
    counts,
    urgency: [...urgencyMap.entries()].sort((a, b) => b[1] - a[1]),
    priority: [...priorityMap.entries()].sort((a, b) => b[1] - a[1]),
    stage: Object.entries(counts)
      .filter(([key]) => key !== 'total')
      .map(([label, count]) => [label, count])
      .sort((a, b) => b[1] - a[1]),
    averageBudget,
    highestBudget,
    lowestBudget,
    budgetCount: budgetNumbers.length,
    budgetCaptureRate,
    contactReadyCount,
    quotedCount,
    acceptedCount,
    quoteConversionRate: quotedCount ? Math.round((acceptedCount / quotedCount) * 100) : 0,
    budgetProjects: budgetProjects.sort((a, b) => b.budget - a.budget),
    averageResponseHours,
    responseBuckets,
    agingBuckets: [
      ['0-2 days', agingBuckets.fresh],
      ['3-7 days', agingBuckets.warm],
      ['8+ days', agingBuckets.stale]
    ],
    missingInfo: [
      ['Missing email', missingEmailCount],
      ['Missing phone', missingPhoneCount],
      ['Missing budget', missingBudgetCount],
      ['Missing launch date', missingLaunchDateCount]
    ]
  };
};

const renderBreakdown = (items, emptyText) => {
  const populatedItems = items.filter(([, count]) => count > 0);
  const emptyItems = items.filter(([, count]) => count === 0).map(([label]) => label);

  return `
    ${populatedItems.length ? `<div class="qd-admin-list">
      ${populatedItems.map(([label, count]) => `
        <div class="qd-admin-list-item">
          <span>${escapeHtml(label)}</span>
          <strong class="qd-admin-count-badge">${count}</strong>
        </div>
      `).join('')}
    </div>` : `<p class="qd-pipeline-quiet">${escapeHtml(emptyText)}</p>`}
    ${emptyItems.length ? `
      <details class="qd-pipeline-empty-stages">
        <summary>Empty aging buckets <span>${emptyItems.length}</span></summary>
        <p>${emptyItems.map(escapeHtml).join(' · ')}</p>
      </details>
    ` : ''}
  `;
};

const renderStageBars = (items) => {
  const total = items.reduce((sum, [, count]) => sum + count, 0);
  const orderedStages = statusOptions.map((status) => {
    const entry = items.find(([label]) => label === status);
    return [status, entry ? entry[1] : 0];
  });
  const activeStages = orderedStages.filter(([, count]) => count > 0);
  const emptyStages = orderedStages.filter(([, count]) => count === 0).map(([label]) => label);

  return `
    <div class="qd-admin-stage-bars">
      ${activeStages.map(([label, count]) => {
        const percent = total ? Math.round((count / total) * 100) : 0;
        return `
          <div class="qd-admin-stage-row is-active">
            <div class="qd-admin-stage-meta">
              <span>${escapeHtml(label)}</span>
              <div class="qd-admin-stage-stats">
                <strong>${count}</strong>
                <small>${percent}%</small>
              </div>
            </div>
            <div class="qd-admin-stage-track">
              <span class="qd-admin-stage-fill" style="width:${percent}%"></span>
            </div>
          </div>
        `;
      }).join('')}
      ${!activeStages.length ? '<p class="qd-pipeline-quiet">No stage data yet.</p>' : ''}
    </div>
    ${emptyStages.length ? `
      <details class="qd-pipeline-empty-stages">
        <summary>Stages with no leads <span>${emptyStages.length}</span></summary>
        <p>${emptyStages.map(escapeHtml).join(' · ')}</p>
      </details>
    ` : ''}
  `;
};

const renderBudgetStats = (analytics) => {
  if (!analytics.budgetCount) {
    return `<div class="qd-admin-empty"><strong>Not enough data</strong>Budget details will appear once numeric budget values are captured.</div>`;
  }

  const budgetMetrics = [
    ['High', analytics.highestBudget, true],
    ['Low', analytics.lowestBudget, true],
    ['Captured', analytics.budgetCount, false]
  ];

  return `
    <div class="qd-admin-budget-panel">
      <div class="qd-admin-budget-metrics">
        ${budgetMetrics.map(([label, value, compact]) => {
          const fullValue = compact ? formatCurrencyNumber(value) : String(value);
          const displayValue = compact ? formatCurrencyNumber(value, { compact: true }) : String(value);
          return `
            <div class="qd-admin-budget-metric" ${compact ? `title="${escapeHtml(fullValue)}"` : ''}>
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(displayValue)}</strong>
            </div>
          `;
        }).join('')}
      </div>
      <div class="qd-admin-budget-track">
        <span class="qd-admin-budget-fill" style="width:${analytics.budgetCaptureRate}%"></span>
      </div>
      <div class="qd-admin-subline">${analytics.budgetCaptureRate}% of submissions include usable budget data.</div>
    </div>
  `;
};

const renderDashboardSectionNav = () => {
  const archiveView = state.dashboardSection === 'archive';
  return `
    <header class="qd-pipeline-heading">
      <div>
        <div class="qd-eyebrow qd-admin-kicker">Admin workspace</div>
        <h1>Pipeline</h1>
      </div>
      <div class="qd-pipeline-view-switch" role="group" aria-label="Lead view">
        <button class="${archiveView ? '' : 'is-active'}" type="button" data-action="set-dashboard-section" data-section="pipeline" aria-pressed="${archiveView ? 'false' : 'true'}">Active leads</button>
        <button class="${archiveView ? 'is-active' : ''}" type="button" data-action="set-dashboard-section" data-section="archive" aria-pressed="${archiveView ? 'true' : 'false'}">Archived</button>
      </div>
    </header>
  `;
};

const renderPipelineSummary = (analytics) => {
  const archivedCount = analytics.counts.Archived || 0;
  const activeCount = Math.max(0, analytics.counts.total - archivedCount);
  const followUpCount = analytics.agingBuckets.find(([label]) => label === '8+ days')?.[1] || 0;
  const selected = {
    active: state.dashboardSection !== 'archive' && state.filters.status === 'All' && !state.pipelineAttentionOnly,
    new: state.dashboardSection !== 'archive' && state.filters.status === 'New' && !state.pipelineAttentionOnly,
    followup: state.dashboardSection !== 'archive' && state.pipelineAttentionOnly,
    archived: state.dashboardSection === 'archive'
  };
  const metrics = [
    ['active', 'Active', activeCount, 'Every record except Archived'],
    ['new', 'New', analytics.counts.New || 0, 'Awaiting review'],
    ['followup', 'Needs follow-up', followUpCount, 'Open · no movement for 8+ days'],
    ['archived', 'Archived', archivedCount, 'Archived status records']
  ];

  return `
    <section class="qd-pipeline-summary" aria-label="Pipeline summary">
      ${metrics.map(([key, label, count, note]) => `
        <button class="qd-pipeline-summary-item qd-pipeline-summary-${key} ${selected[key] ? 'is-active' : ''}" type="button" data-action="set-pipeline-summary" data-summary="${key}" aria-pressed="${selected[key] ? 'true' : 'false'}">
          <span>${escapeHtml(label)}</span>
          <strong>${count}</strong>
          <small>${escapeHtml(note)}</small>
        </button>
      `).join('')}
    </section>
  `;
};

const renderBudgetProjectList = (items) => {
  if (!items.length) {
    return '';
  }

  const sortedItems = state.budgetSortDirection === 'asc'
    ? [...items].sort((a, b) => a.budget - b.budget)
    : [...items].sort((a, b) => b.budget - a.budget);
  const pageSize = 3;
  const pageCount = Math.ceil(sortedItems.length / pageSize);
  const activePage = Math.min(state.budgetProjectsPage, Math.max(pageCount - 1, 0));
  const pageStart = activePage * pageSize;
  const visibleItems = sortedItems.slice(pageStart, pageStart + pageSize);

  return `
    <button class="qd-admin-budget-sort-note qd-admin-budget-sort-toggle" type="button" data-action="toggle-budget-sort">
      ${state.budgetSortDirection === 'asc' ? '↑ Lowest first' : '↓ Highest first'}
    </button>
    <div class="qd-admin-budget-project-list">
      ${visibleItems.map((item) => `
        <button class="qd-admin-budget-project" type="button" data-action="open-submission" data-id="${escapeHtml(item.id)}">
          <div class="qd-admin-budget-project-copy">
            <strong>${escapeHtml(item.businessName)}</strong>
            <span>${escapeHtml(item.status)}</span>
          </div>
          <div class="qd-admin-budget-project-value">${escapeHtml(formatCurrencyNumber(item.budget))}</div>
        </button>
      `).join('')}
    </div>
    ${pageCount > 1 ? `
      <div class="qd-admin-budget-pagination">
        <button class="qd-admin-budget-nav" type="button" data-action="budget-projects-prev" ${activePage === 0 ? 'disabled' : ''} aria-label="Previous budgets">←</button>
        <span>${activePage + 1} / ${pageCount}</span>
        <button class="qd-admin-budget-nav" type="button" data-action="budget-projects-next" ${activePage >= pageCount - 1 ? 'disabled' : ''} aria-label="Next budgets">→</button>
      </div>
    ` : ''}
  `;
};

const renderAnalyticsCards = (analytics) => {
  const topStage = analytics.stage.find(([, count]) => count > 0)?.[0] || 'No stage data';
  const staleLeadCount = analytics.agingBuckets.find(([label]) => label === '8+ days')?.[1] || 0;
  const highestBudgetProject = analytics.budgetProjects[0];
  const responseTimeHeadline = analytics.averageResponseHours !== null ? `${analytics.averageResponseHours} hrs` : '—';
  const responseTimeSubtitle = analytics.averageResponseHours !== null
    ? 'Avg. time before first contact'
    : 'No contacts logged yet';
  const responseBucketItems = [
    ['< 1 hour', analytics.responseBuckets.underHour],
    ['1–24 hours', analytics.responseBuckets.withinDay],
    ['24+ hours', analytics.responseBuckets.overDay],
    ['Not contacted', analytics.responseBuckets.notContacted]
  ];
  const populatedResponseBuckets = responseBucketItems.filter(([, count]) => count > 0);
  const emptyResponseBuckets = responseBucketItems.filter(([, count]) => count === 0).map(([label]) => label);
  return `
    <details class="qd-pipeline-insights" data-pipeline-insights ${state.pipelineAnalyticsOpen ? 'open' : ''}>
      <summary><span><span class="qd-eyebrow qd-admin-kicker">Analytics</span><strong>Demand patterns</strong></span><small>All submissions, including archived records</small></summary>
      <div class="qd-admin-analytics-grid qd-pipeline-insights-grid">
      <article class="qd-admin-card qd-admin-analytics-card qd-pipeline-analytics-card">
        <div class="qd-admin-card-label">Lead Stage</div>
        <h3>${escapeHtml(topStage)}</h3>
        <p>Most common stage across all submissions, including Archived.</p>
        ${renderStageBars(analytics.stage)}
      </article>

      <article class="qd-admin-card qd-admin-analytics-card qd-pipeline-analytics-card">
        <div class="qd-admin-card-label">Project Budgets</div>
        ${highestBudgetProject ? `<h3>${escapeHtml(formatCurrencyNumber(highestBudgetProject.budget))}</h3>` : '<p class="qd-pipeline-quiet">No budgets yet. Numeric budget values will appear here when captured.</p>'}
        ${highestBudgetProject ? '<p>Submissions with captured budgets, sorted from highest to lowest. Click a project to open its details.</p>' : ''}
        ${renderBudgetProjectList(analytics.budgetProjects)}
      </article>

      <article class="qd-admin-card qd-admin-analytics-card qd-pipeline-analytics-card">
        <div class="qd-admin-card-label">Aging Leads</div>
        <h3>${escapeHtml(staleLeadCount ? `${staleLeadCount} stale` : analytics.counts.total ? 'No stale leads' : 'No leads yet')}</h3>
        <p>Open leads grouped by time since their last recorded movement. “Needs follow-up” uses the 8+ day bucket.</p>
        ${renderBreakdown(analytics.agingBuckets, 'Lead aging will appear here once submissions arrive.')}
      </article>

      <article class="qd-admin-card qd-admin-analytics-card qd-pipeline-analytics-card">
        <div class="qd-admin-card-label">Response Time</div>
        <h3>${escapeHtml(responseTimeHeadline)}</h3>
        <p>${escapeHtml(responseTimeSubtitle)} · all submissions, including archived.</p>
        ${populatedResponseBuckets.length ? `<div class="qd-admin-list qd-pipeline-response-list">
          ${populatedResponseBuckets.map(([label, count]) => `
            <div class="qd-admin-list-item"><span>${escapeHtml(label)}</span><strong class="qd-admin-count-badge">${count}</strong></div>
          `).join('')}
        </div>` : '<p class="qd-pipeline-quiet">No response buckets have values yet.</p>'}
        ${emptyResponseBuckets.length ? `<details class="qd-pipeline-empty-stages"><summary>Empty response buckets <span>${emptyResponseBuckets.length}</span></summary><p>${emptyResponseBuckets.map(escapeHtml).join(' · ')}</p></details>` : ''}
      </article>
      </div>
    </details>
  `;
};

const renderSubmissionRows = (items, emptyTitle = 'No submissions match this view', emptyText = 'Try a broader search or reset the pipeline filters.') => {
  if (!items.length) {
    return `
      <tr>
      <td colspan="7">
          <div class="qd-admin-empty">
            <strong>${escapeHtml(emptyTitle)}</strong>
            ${escapeHtml(emptyText)}
          </div>
        </td>
      </tr>
    `;
  }

  return items.map((submission) => `
    <tr>
      <td>
        <button class="qd-admin-row-button" data-action="open-submission" data-id="${escapeHtml(submission.id)}">
          <div class="qd-admin-business-name">${escapeHtml(formatValue(getAnswer(submission, 'businessName')))}</div>
          <div class="qd-admin-subline">${escapeHtml(formatValue(submission.selectedMainPurpose || getAnswer(submission, 'mainPurpose')))}</div>
        </button>
      </td>
      <td>
        <div class="qd-admin-contact-stack">
          <span>${escapeHtml(formatValue(getAnswer(submission, 'businessEmail')))}</span>
          <span>${escapeHtml(formatValue(getAnswer(submission, 'businessPhone')))}</span>
        </div>
      </td>
      <td>${escapeHtml(formatSubmissionMeetingDate(submission))}</td>
      <td><span class="qd-status-pill" data-tone="${escapeHtml(statusTone(submission.status))}">${escapeHtml(submission.status)}</span></td>
      <td><span class="qd-priority-pill" data-tone="${escapeHtml(priorityTone(submission.priority))}">${escapeHtml(submission.priority)}</span></td>
      <td>
        ${escapeHtml(formatDate(submission.createdAt || submission.submittedAt))}
        <div class="qd-admin-subline"><span class="qd-language-badge" data-language="${escapeHtml(submission.language || 'en')}">${escapeHtml(formatLanguage(submission.language || 'en'))}</span></div>
      </td>
      <td><button class="qd-pipeline-next-action" type="button" data-action="open-submission" data-id="${escapeHtml(submission.id)}">View actions <span aria-hidden="true">→</span></button></td>
    </tr>
  `).join('');
};

const renderSubmissionCards = (items, emptyTitle = 'No submissions match this view', emptyText = 'Try a broader search or reset the pipeline filters.') => {
  if (!items.length) {
    return `
      <div class="qd-admin-empty">
        <strong>${escapeHtml(emptyTitle)}</strong>
        ${escapeHtml(emptyText)}
      </div>
    `;
  }

  return items.map((submission) => `
    <button class="qd-admin-mobile-card" type="button" data-action="open-submission" data-id="${escapeHtml(submission.id)}">
      <div class="qd-admin-mobile-card-head">
        <div>
          <div class="qd-admin-business-name">${escapeHtml(formatValue(getAnswer(submission, 'businessName')))}</div>
          <div class="qd-admin-subline">${escapeHtml(formatValue(submission.selectedMainPurpose || getAnswer(submission, 'mainPurpose')))}</div>
        </div>
        <div class="qd-chip-row">
          <span class="qd-status-pill" data-tone="${escapeHtml(statusTone(submission.status))}">${escapeHtml(submission.status)}</span>
          <span class="qd-priority-pill" data-tone="${escapeHtml(priorityTone(submission.priority))}">${escapeHtml(submission.priority)}</span>
        </div>
      </div>
      <div class="qd-admin-mobile-card-grid">
        <div>
          <strong>Contact</strong>
          <span>${escapeHtml(formatValue(getAnswer(submission, 'businessEmail')))}</span>
          <span>${escapeHtml(formatValue(getAnswer(submission, 'businessPhone')))}</span>
        </div>
        <div>
          <strong>Meeting Date</strong>
          <span>${escapeHtml(formatSubmissionMeetingDate(submission))}</span>
        </div>
        <div>
          <strong>Date</strong>
          <span>${escapeHtml(formatDate(submission.createdAt || submission.submittedAt))}</span>
        </div>
        <div>
          <strong>Language</strong>
          <span>${escapeHtml(formatLanguage(submission.language || 'en'))}</span>
        </div>
      </div>
      <span class="qd-pipeline-mobile-next-action">Open lead details &amp; actions <span aria-hidden="true">→</span></span>
    </button>
  `).join('');
};

const renderPipelinePagination = (totalItems) => {
  const pageSize = 5;
  const pageCount = Math.ceil(totalItems / pageSize);
  if (pageCount <= 1) return '';

  const activePage = Math.min(state.pipelinePage, Math.max(pageCount - 1, 0));

  return `
    <div class="qd-admin-pagination">
      <button class="qd-admin-pagination-btn" type="button" data-action="pipeline-page-prev" ${activePage === 0 ? 'disabled' : ''} aria-label="Previous projects">←</button>
      <span>${activePage + 1} / ${pageCount}</span>
      <button class="qd-admin-pagination-btn" type="button" data-action="pipeline-page-next" ${activePage >= pageCount - 1 ? 'disabled' : ''} aria-label="Next projects">→</button>
    </div>
  `;
};

const renderPipelineFilters = () => `
  <div class="qd-admin-table-toolbar qd-admin-table-toolbar-spacious qd-pipeline-filters">
    <label class="qd-pipeline-filter qd-pipeline-search-filter">
      <span>Search leads</span>
      <input class="qd-admin-search" type="search" aria-label="Search leads by business, contact, meeting date, or service" placeholder="Business, email, phone, meeting date, service…" value="${escapeHtml(state.filters.search)}" data-field="search">
    </label>
    <label class="qd-pipeline-filter">
      <span>Stage</span>
      <select class="qd-admin-select" aria-label="Filter leads by stage" data-field="status">
        ${['All', ...statusOptions].map((option) => `
          <option value="${escapeHtml(option)}" ${state.filters.status === option ? 'selected' : ''}>${escapeHtml(option === 'All' ? 'All stages' : option)}</option>
        `).join('')}
      </select>
    </label>
    <label class="qd-pipeline-filter">
      <span>Priority</span>
      <select class="qd-admin-select" aria-label="Filter leads by priority" data-field="priority">
        ${['All', ...priorityOptions].map((option) => `
          <option value="${escapeHtml(option)}" ${state.filters.priority === option ? 'selected' : ''}>${escapeHtml(option === 'All' ? 'All priorities' : option)}</option>
        `).join('')}
      </select>
    </label>
  </div>
`;

const renderPipelineWorkspace = (items, totalItems, { archived = false } = {}) => {
  const viewTitle = archived ? 'Archived leads' : state.pipelineAttentionOnly ? 'Needs follow-up' : state.filters.status === 'New' ? 'New leads' : 'Active leads';
  const emptyTitle = state.pipelineAttentionOnly
    ? 'No leads need follow-up'
    : archived ? 'No archived leads' : 'No active leads';
  const emptyText = state.pipelineAttentionOnly
    ? 'No open leads currently meet the existing 8+ day aging rule.'
    : archived ? 'Records with Archived status will appear here.' : 'New submissions will appear here.';
  const hasNarrowFilters = Boolean(state.filters.search.trim())
    || state.filters.priority !== 'All'
    || (state.filters.status !== 'All' && state.filters.status !== 'Archived');
  const actualEmptyTitle = !items.length && (hasNarrowFilters || archived && state.filters.search.trim())
    ? 'No submissions match these filters'
    : emptyTitle;
  const actualEmptyText = actualEmptyTitle === 'No submissions match these filters'
    ? 'Try a broader search or reset the stage and priority filters.'
    : emptyText;
  return `
  <article class="qd-admin-card qd-admin-table-card qd-pipeline-list-card" id="${archived ? 'qd-archived-submissions' : 'qd-submission-pipeline'}">
    <div class="qd-admin-section-head">
      <div>
        <div class="qd-eyebrow qd-admin-kicker">${archived ? 'Archive' : 'Submission Pipeline'}</div>
        <h2>${viewTitle}</h2>
        <p>${archived ? 'Only records with Archived status appear here. Open one to review details or change its status to return it to the active queue.' : 'Open any lead to see its contact, quote, edit, archive, and status actions.'}</p>
      </div>
    </div>

    ${renderPipelineFilters()}

    <div class="qd-admin-table-wrap">
      <table class="qd-admin-table">
        <thead>
          <tr>
            <th>Business</th>
            <th>Contact</th>
            <th>Meeting Date</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Date</th>
            <th>Next action</th>
          </tr>
        </thead>
        <tbody>${renderSubmissionRows(items, actualEmptyTitle, actualEmptyText)}</tbody>
      </table>
    </div>
    <div class="qd-admin-mobile-list">
      ${renderSubmissionCards(items, actualEmptyTitle, actualEmptyText)}
    </div>
    ${renderPipelinePagination(totalItems)}
  </article>
`;
};

const renderDashboard = () => {
  const filteredSubmissions = getFilteredSubmissions();
  const activeSubmissions = filteredSubmissions.filter((submission) => submission.status !== 'Archived');
  const archivedSubmissions = filteredSubmissions.filter((submission) => submission.status === 'Archived');
  const archivedView = state.dashboardSection === 'archive';
  const visibleSubmissions = archivedView
    ? archivedSubmissions
    : state.pipelineAttentionOnly
      ? activeSubmissions.filter((submission) => getSubmissionAgeBucket(submission) === 'stale')
      : activeSubmissions;
  const pipelinePageSize = 5;
  const pipelinePageCount = Math.ceil(visibleSubmissions.length / pipelinePageSize);
  const activePipelinePage = Math.min(state.pipelinePage, Math.max(pipelinePageCount - 1, 0));
  const paginatedSubmissions = visibleSubmissions.slice(
    activePipelinePage * pipelinePageSize,
    (activePipelinePage + 1) * pipelinePageSize
  );
  const analytics = getAnalytics(state.submissions);

  return `
    <section class="qd-admin-dashboard qd-admin-pipeline-root">
      ${state.dataError ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.dataError)}</div>` : ''}
      ${renderDashboardSectionNav()}
      ${renderPipelineSummary(analytics)}
      ${renderPipelineWorkspace(paginatedSubmissions, visibleSubmissions.length, { archived: archivedView })}
      ${renderAnalyticsCards(analytics)}
    </section>
  `;
};

const getOutreachLeadById = (id) => state.outreachLeads.find((lead) => lead.id === id) || null;

const isOutreachLeadStarred = (lead) => Boolean(lead?.starred);

const getFilteredOutreachLeads = () => {
  const search = String(state.outreachFilters.search || '').trim().toLowerCase();
  return state.outreachLeads.filter((lead) => {
    if (state.outreachFilters.starredOnly && !isOutreachLeadStarred(lead)) return false;
    const matchesStatus = state.outreachFilters.status === 'All' || lead.status === state.outreachFilters.status;
    if (!matchesStatus) return false;
    if (!search) return true;

    const haystack = [
      lead.businessName,
      lead.ownerName,
      lead.phoneNumber,
      lead.websiteUrl,
      lead.meetingLocation,
      lead.meetingDateTime
    ].join(' ').toLowerCase();

    return haystack.includes(search);
  }).sort((a, b) => {
    const aStar = isOutreachLeadStarred(a) ? 1 : 0;
    const bStar = isOutreachLeadStarred(b) ? 1 : 0;
    return bStar - aStar;
  });
};

const getPaginatedOutreachLeads = (items) => {
  const pageSize = 10;
  const pageCount = Math.ceil(items.length / pageSize);
  const activePage = Math.min(state.outreachPage, Math.max(pageCount - 1, 0));
  return {
    pageSize,
    pageCount,
    activePage,
    items: items.slice(activePage * pageSize, (activePage + 1) * pageSize)
  };
};

const renderOutreachStarButton = (lead, { compact = false, mobile = false } = {}) => {
  const starred = isOutreachLeadStarred(lead);
  const label = starred ? 'Remove star' : 'Star this lead';
  const className = mobile
    ? `qd-btn qd-btn-sm qd-admin-outreach-star-row-btn ${starred ? 'is-starred' : ''}`
    : compact
      ? `qd-admin-row-button qd-admin-outreach-star-row-btn ${starred ? 'is-starred' : ''}`
      : `qd-admin-outreach-star-btn ${starred ? 'is-starred' : ''}`;
  return `
    <button
      type="button"
      class="${className}"
      data-action="toggle-outreach-star"
      data-id="${escapeHtml(lead.id)}"
      data-outreach-stop-row-open
      aria-label="${escapeHtml(label)}"
      aria-pressed="${starred ? 'true' : 'false'}"
      title="${escapeHtml(label)}"
    >${starred ? '★' : '☆'}</button>
  `;
};

const getStarredOutreachCount = () => state.outreachLeads.filter((lead) => isOutreachLeadStarred(lead)).length;

const renderOutreachStatusSelect = (lead) => `
  <select class="qd-admin-select qd-admin-outreach-status-select" data-outreach-status-id="${escapeHtml(lead.id)}" aria-label="${escapeHtml(`Change status for ${lead.businessName || lead.ownerName || 'lead'}`)}">
    ${OUTREACH_STATUS_OPTIONS.map((option) => `
      <option value="${escapeHtml(option.value)}" ${lead.status === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>
    `).join('')}
  </select>
`;

const renderOutreachRows = (items) => {
  if (state.outreachLoading && !items.length) {
    return `
      <tr>
        <td colspan="6">
          <div class="qd-admin-empty-state">
            <strong>Loading outreach leads</strong>
            <p>Opening the realtime Firestore listener for business outreach leads.</p>
          </div>
        </td>
      </tr>
    `;
  }

  if (!items.length) {
    const starredOnly = state.outreachFilters.starredOnly;
    return `
      <tr>
        <td colspan="6">
          <div class="qd-admin-empty-state">
            <strong>${starredOnly ? 'No starred leads' : 'No outreach leads yet'}</strong>
            <p>${starredOnly ? 'Star leads from the row actions to pin them here.' : 'Add your first cold outreach contact to start tracking follow-up and confirmed imports.'}</p>
          </div>
        </td>
      </tr>
    `;
  }

  return items.map((lead) => {
    const callLink = buildOutreachCallLink(lead);
    return `
      <tr class="qd-admin-outreach-row ${isOutreachLeadStarred(lead) ? 'is-starred' : ''}" data-outreach-open-id="${escapeHtml(lead.id)}">
        <td class="qd-admin-outreach-col-business">
          <strong class="qd-admin-outreach-business-name">${escapeHtml(lead.businessName || 'Untitled Lead')}</strong>
        </td>
        <td class="qd-admin-outreach-col-phone">${escapeHtml(lead.phoneNumber || '—')}</td>
        <td class="qd-admin-outreach-col-website">${renderOutreachWebsiteLink(lead.websiteUrl)}</td>
        <td class="qd-admin-outreach-col-location" data-outreach-stop-row-open>${renderOutreachLocationLink(lead)}</td>
        <td class="qd-admin-outreach-col-status" data-outreach-stop-row-open>
          ${renderOutreachStatusSelect(lead)}
        </td>
        <td class="qd-admin-outreach-col-actions" data-outreach-stop-row-open>
          <div class="qd-admin-outreach-action-links">
            ${callLink ? `<a class="qd-admin-row-button qd-admin-outreach-action-link" href="${escapeHtml(callLink)}">Call</a>` : ''}
            <button class="qd-admin-row-button" type="button" data-action="edit-outreach-lead" data-id="${escapeHtml(lead.id)}">Edit</button>
            ${renderOutreachStarButton(lead, { compact: true })}
            <button class="qd-admin-row-button is-danger" type="button" data-action="delete-outreach-lead" data-id="${escapeHtml(lead.id)}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
};

const renderOutreachCards = (items) => {
  if (!items.length) {
    const starredOnly = state.outreachFilters.starredOnly;
    return `
      <div class="qd-admin-empty-state">
        <strong>${starredOnly ? 'No starred leads' : 'No outreach leads yet'}</strong>
        <p>${starredOnly ? 'Star leads from the row actions to pin them here.' : 'Add your first cold outreach contact to start tracking follow-up and confirmed imports.'}</p>
      </div>
    `;
  }

  return items.map((lead) => {
    const mapsLink = buildOutreachMapsLink(lead);
    const callLink = buildOutreachCallLink(lead);
    const meetingSummary = formatOutreachMeeting(lead);
    return `
      <article class="qd-admin-mobile-card qd-admin-outreach-mobile-card ${isOutreachLeadStarred(lead) ? 'is-starred' : ''}" data-outreach-open-id="${escapeHtml(lead.id)}">
        <div class="qd-admin-mobile-card-head">
          <div>
            <div class="qd-admin-business-name">${escapeHtml(lead.businessName || 'Untitled Lead')}</div>
            <div class="qd-admin-subline">${escapeHtml(lead.ownerName || 'No owner name')}</div>
          </div>
          <span class="qd-status-pill" data-tone="${escapeHtml(getOutreachStatusTone(lead.status))}">${escapeHtml(getOutreachStatusLabel(lead.status))}</span>
        </div>
        <div class="qd-admin-mobile-card-grid">
          <div><strong>Owner</strong><span>${escapeHtml(lead.ownerName || 'Not provided')}</span></div>
          <div><strong>Phone</strong><span>${escapeHtml(lead.phoneNumber || 'Not provided')}</span></div>
          <div><strong>Website</strong><span>${renderOutreachWebsiteLink(lead.websiteUrl)}</span></div>
          <div><strong>Meeting</strong><span>${escapeHtml(meetingSummary || 'Not scheduled')}</span></div>
          <div><strong>Added</strong><span>${escapeHtml(formatDate(lead.createdAt))}</span></div>
        </div>
        <div class="qd-admin-card-mobile-actions qd-admin-outreach-mobile-actions">
          ${renderOutreachStatusSelect(lead)}
          ${mapsLink ? `<a class="qd-btn qd-btn-sm qd-admin-action-maps" href="${escapeHtml(mapsLink)}" target="_blank" rel="noreferrer noopener">Maps</a>` : ''}
          ${callLink ? `<a class="qd-btn qd-btn-sm qd-admin-action-call" href="${escapeHtml(callLink)}">Call</a>` : ''}
          <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="edit-outreach-lead" data-id="${escapeHtml(lead.id)}">Edit</button>
          ${renderOutreachStarButton(lead, { compact: true, mobile: true })}
          <button class="qd-btn qd-btn-sm qd-admin-action-danger" type="button" data-action="delete-outreach-lead" data-id="${escapeHtml(lead.id)}">Delete</button>
        </div>
      </article>
    `;
  }).join('');
};

const renderOutreachPagination = (totalItems) => {
  const pageSize = 10;
  const pageCount = Math.ceil(totalItems / pageSize);
  if (pageCount <= 1) return '';
  const activePage = Math.min(state.outreachPage, Math.max(pageCount - 1, 0));
  return `
    <div class="qd-admin-pagination">
      <button class="qd-admin-pagination-btn" type="button" data-action="outreach-page-prev" ${activePage === 0 ? 'disabled' : ''} aria-label="Previous outreach page">&larr;</button>
      <span>${activePage + 1} / ${pageCount}</span>
      <button class="qd-admin-pagination-btn" type="button" data-action="outreach-page-next" ${activePage >= pageCount - 1 ? 'disabled' : ''} aria-label="Next outreach page">&rarr;</button>
    </div>
  `;
};

const getOutreachEditorDraftFromState = () => ({
  ...createEmptyOutreachLeadDraft(),
  ...(state.outreachEditor?.draft || {})
});

const normalizeMapsImportUrl = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const extractBusinessNameFromMapsUrl = (url) => {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/maps\/place\/([^/]+)/i)
      || parsed.pathname.match(/\/place\/([^/]+)/i)
      || parsed.pathname.match(/\/maps\/search\/([^/]+)/i);
    if (!match?.[1]) return '';
    return decodeURIComponent(match[1]).replace(/\+/g, ' ').trim();
  } catch {
    return '';
  }
};

const extractMapsLead = async () => {
  const editor = state.outreachEditor;
  const mapsUrl = normalizeMapsImportUrl(editor.mapsUrl);

  if (!mapsUrl) {
    editor.mapsError = 'Paste a Google Maps business URL first.';
    render();
    return;
  }

  if (!isOutreachGoogleMapsUrl(mapsUrl)) {
    editor.mapsError = 'Only Google Maps links are supported. Paste a maps.google.com or maps.app.goo.gl URL.';
    render();
    return;
  }

  editor.mapsUrl = mapsUrl;

  editor.mapsLoading = true;
  editor.mapsError = '';
  render();

  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Your admin session expired. Please sign in again.');

    const response = await fetch(getAdminApiUrl('/api/maps-extract'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ url: mapsUrl })
    });

    const payload = await response.json().catch(() => ({}));

    if (response.status === 404) {
      throw new Error('Maps import API was not found. Open admin via http://localhost:3000/admin.html (npm run dev) or https://www.qdsystems.ae/admin.html');
    }

    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || 'Could not extract this Google Maps listing.');
    }

    const lead = payload.lead || {};
    const current = getOutreachEditorDraftFromState();
    const importedWebsite = String(lead.websiteUrl || '').trim();
    const nextWebsiteUrl = current.websiteUrl || importedWebsite || '';
    const nextHasWebsite = nextWebsiteUrl
      ? 'yes'
      : current.hasWebsite === 'yes' || lead.hasWebsite === 'yes'
        ? 'yes'
        : 'no';

    state.outreachEditor.draft = {
      ...current,
      businessName: current.businessName || lead.businessName || '',
      phoneNumber: current.phoneNumber || lead.phoneNumber || '',
      websiteUrl: nextWebsiteUrl,
      hasWebsite: nextHasWebsite,
      meetingLocation: mapsUrl || current.meetingLocation || '',
      notes: current.notes || ''
    };

    state.outreachEditor.mapsLoading = false;
    state.outreachEditor.mapsError = '';

    try {
      await logAdminActivity({
        action: 'extract_outreach_maps_lead',
        targetType: 'outreach_lead',
        targetId: state.outreachEditor.id || 'new',
        targetLabel: state.outreachEditor.draft.businessName || 'Google Maps import',
        metadata: {
          sourceUrl: lead.sourceUrl || mapsUrl,
          resolvedUrl: lead.resolvedUrl || '',
          extractedFields: {
            businessName: Boolean(lead.businessName),
            phoneNumber: Boolean(lead.phoneNumber),
            websiteUrl: Boolean(lead.websiteUrl),
            meetingLocation: Boolean(mapsUrl)
          }
        }
      });
    } catch (error) {
      console.warn('[outreach] maps import activity log skipped:', error?.message || error);
    }

    render();
  } catch (error) {
    const current = getOutreachEditorDraftFromState();
    const businessFromUrl = extractBusinessNameFromMapsUrl(mapsUrl);
    if (isOutreachGoogleMapsUrl(mapsUrl)) {
      state.outreachEditor.draft = {
        ...current,
        businessName: current.businessName || businessFromUrl || '',
        meetingLocation: mapsUrl || current.meetingLocation || ''
      };
      state.outreachEditor.mapsError = businessFromUrl
        ? `Map link and business name saved. Phone/website import failed: ${error?.message || 'unknown error'}`
        : `Map link saved to Meeting Location. Full import failed: ${error?.message || 'unknown error'}`;
    } else {
      state.outreachEditor.mapsError = error?.message || 'Could not import this Google Maps listing.';
    }
    state.outreachEditor.mapsLoading = false;
    render();
  }
};

const renderOutreachEditor = () => {
  if (!state.outreachEditor.open) return '';

  const draft = getOutreachEditorDraftFromState();

  return `
    <div class="qd-admin-modal-overlay">
      <button class="qd-admin-modal-backdrop" type="button" data-action="close-outreach-editor" aria-label="Close outreach lead editor"></button>
      <aside class="qd-admin-drawer qd-admin-card-editor qd-admin-outreach-editor" role="dialog" aria-modal="true" aria-label="Outreach lead editor">
        <button class="qd-admin-drawer-close qd-admin-drawer-close-floating" type="button" data-action="close-outreach-editor" aria-label="Close">X</button>

        <section class="qd-admin-card-editor-head qd-admin-outreach-editor-head">
          <div>
            <div class="qd-eyebrow qd-admin-kicker">Business Outreach</div>
            <h2>${state.outreachEditor.mode === 'edit' ? 'Edit outreach lead' : 'Add outreach lead'}</h2>
            <p>Track manual cold outreach and promote confirmed leads into the project submissions pipeline.</p>
          </div>
        </section>

        ${state.outreachEditor.error ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.outreachEditor.error)}</div>` : ''}

        <form class="qd-admin-card-form" id="outreach-editor-form">
          <section class="qd-admin-card qd-outreach-maps-import">
            <div class="qd-admin-section-head">
              <div>
                <div class="qd-admin-card-label">Google Maps import</div>
                <p>Paste a Google Maps business listing URL and import the visible lead details.</p>
              </div>
            </div>

            <div class="qd-admin-form-grid">
              <div class="qd-admin-field">
                <label for="outreach-maps-url">Google Maps URL</label>
                <input
                  id="outreach-maps-url"
                  class="qd-admin-input"
                  type="url"
                  data-outreach-editor-meta="mapsUrl"
                  value="${escapeHtml(state.outreachEditor.mapsUrl || '')}"
                  placeholder="https://maps.google.com/..."
                >
              </div>

              <button
                class="qd-btn qd-btn-sm qd-admin-action-primary"
                type="button"
                data-action="extract-maps-lead"
                ${state.outreachEditor.mapsLoading ? 'disabled' : ''}
              >
                ${state.outreachEditor.mapsLoading ? 'Importing...' : 'Import from Maps'}
              </button>
            </div>

            ${state.outreachEditor.mapsError ? `
              <div class="qd-admin-alert" role="alert">${escapeHtml(state.outreachEditor.mapsError)}</div>
            ` : ''}
          </section>

          <div class="qd-admin-admin-grid qd-admin-card-grid-fields qd-admin-outreach-grid">
            <div class="qd-admin-field">
              <label for="outreach-business-name">Business Name</label>
              <input id="outreach-business-name" class="qd-admin-input" name="businessName" type="text" value="${escapeHtml(draft.businessName || '')}" required>
            </div>
            <div class="qd-admin-field">
              <label for="outreach-owner-name">Owner Name <span class="qd-admin-field-optional">(optional)</span></label>
              <input id="outreach-owner-name" class="qd-admin-input" name="ownerName" type="text" value="${escapeHtml(draft.ownerName || '')}">
            </div>
            <div class="qd-admin-field">
              <label for="outreach-phone-number">Phone Number</label>
              <input id="outreach-phone-number" class="qd-admin-input" name="phoneNumber" type="tel" inputmode="tel" value="${escapeHtml(draft.phoneNumber || '')}" required>
            </div>
            <div class="qd-admin-field">
              <label for="outreach-status">Status</label>
              <select id="outreach-status" class="qd-admin-select" name="status">
                ${OUTREACH_STATUS_OPTIONS.map((option) => `
                  <option value="${escapeHtml(option.value)}" ${draft.status === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>
                `).join('')}
              </select>
            </div>
            <div class="qd-admin-field">
              <label for="outreach-meeting-date-time">Meeting Date & Time <span class="qd-admin-field-optional">(optional)</span></label>
              <input id="outreach-meeting-date-time" class="qd-admin-input" name="meetingDateTime" type="datetime-local" value="${escapeHtml(draft.meetingDateTime || '')}">
            </div>
            <div class="qd-admin-field">
              <label for="outreach-website-url">Website URL <span class="qd-admin-field-optional">(optional)</span></label>
              <input id="outreach-website-url" class="qd-admin-input" name="websiteUrl" type="url" value="${escapeHtml(draft.websiteUrl || '')}" placeholder="https://example.com">
            </div>
            <div class="qd-admin-field qd-admin-field-span-2">
              <label for="outreach-meeting-location">Meeting Location <span class="qd-admin-field-optional">(optional)</span></label>
              <input id="outreach-meeting-location" class="qd-admin-input" name="meetingLocation" type="text" value="${escapeHtml(draft.meetingLocation || '')}" placeholder="Office, cafe, Zoom link, address...">
            </div>
            <div class="qd-admin-field qd-admin-field-span-2">
              <label for="outreach-notes">Notes <span class="qd-admin-field-optional">(optional)</span></label>
              <textarea id="outreach-notes" class="qd-admin-textarea" name="notes" placeholder="Call outcome, reminders, website details, or anything useful...">${escapeHtml(draft.notes || '')}</textarea>
            </div>
          </div>

          <div class="qd-admin-save-row">
            <span class="qd-admin-save-help">Confirmed leads import once into the live pipeline and keep a linked submission ID for duplicate protection.</span>
            <button class="qd-btn qd-btn-md qd-admin-action-primary" type="submit" ${state.outreachEditor.isSaving ? 'disabled' : ''}>
              ${state.outreachEditor.isSaving ? 'Saving...' : state.outreachEditor.mode === 'edit' ? 'Save lead' : 'Create lead'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  `;
};

const renderOutreachManager = () => {
  const filteredLeads = getFilteredOutreachLeads();
  const starredCount = getStarredOutreachCount();
  const { items, activePage, pageCount } = getPaginatedOutreachLeads(filteredLeads);
  if (activePage !== state.outreachPage && pageCount) {
    state.outreachPage = activePage;
  }

  return `
    <section class="qd-admin-dashboard qd-admin-cards-dashboard">
      ${state.outreachError ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.outreachError)}</div>` : ''}

      <article class="qd-admin-card qd-admin-table-card">
        <div class="qd-admin-section-head">
          <div>
            <div class="qd-eyebrow qd-admin-kicker">Business Outreach</div>
            <h2>Lead tracker</h2>
            <p>Track cold outreach contacts, follow-up status, and import confirmed businesses directly into the pipeline.</p>
          </div>
        </div>

        <div class="qd-admin-table-toolbar qd-admin-outreach-toolbar">
          <input class="qd-admin-input" type="search" placeholder="Search business, owner, phone, or website" data-outreach-field="search" value="${escapeHtml(state.outreachFilters.search)}">
          <select class="qd-admin-select" data-outreach-field="status">
            <option value="All" ${state.outreachFilters.status === 'All' ? 'selected' : ''}>All statuses</option>
            ${OUTREACH_STATUS_OPTIONS.map((option) => `
              <option value="${escapeHtml(option.value)}" ${state.outreachFilters.status === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>
            `).join('')}
          </select>
          <button
            class="qd-btn qd-btn-sm qd-admin-outreach-star-filter ${state.outreachFilters.starredOnly ? 'is-active' : ''}"
            type="button"
            data-action="toggle-outreach-starred-filter"
            aria-pressed="${state.outreachFilters.starredOnly ? 'true' : 'false'}"
            title="Show starred leads only"
          >★ Starred${starredCount ? ` (${starredCount})` : ''}</button>
          <!-- "Add Lead" lives in the page header (data-action="open-outreach-create") -->
        </div>

        <div class="qd-admin-table-wrap qd-admin-outreach-table-wrap">
          <table class="qd-admin-table qd-admin-outreach-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Phone</th>
                <th>Website</th>
                <th>Location</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>${renderOutreachRows(items)}</tbody>
          </table>
        </div>

        <div class="qd-admin-mobile-list">
          ${renderOutreachCards(items)}
        </div>

        ${renderOutreachPagination(filteredLeads.length)}
      </article>
    </section>
  `;
};

function formatPaymentAED(value) {
  const number = Number(value) || 0;
  const hasCents = Math.abs(number - Math.round(number)) > 0.001;
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2
  }).format(number);
}

function getPaymentStatusFromAmounts(paid, balance) {
  if ((Number(paid) || 0) <= 0) return 'Unpaid';
  if ((Number(balance) || 0) <= 0) return 'Paid';
  return 'Partial';
}

function getQuotePaymentSummary(quote = {}) {
  const normalized = normalizeQuoteForTemplate(quote);
  const totals = normalized.totals;
  const total = Number(totals.grandTotal) || 0;
  const paid = Number.isFinite(Number(quote.paid))
    ? Number(quote.paid)
    : (Array.isArray(quote.payments) ? quote.payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0) : 0);
  const balance = Math.max(0, total - paid);
  return {
    total,
    paid,
    balance,
    status: quote.paymentStatus || getPaymentStatusFromAmounts(paid, balance)
  };
}

function getPaymentTone(status) {
  if (status === 'Paid') return 'paid';
  if (status === 'Partial') return 'partial';
  return 'unpaid';
}

function renderPaymentStatusChip(status) {
  return `<span class="qd-payment-status" data-tone="${escapeHtml(getPaymentTone(status))}">${escapeHtml(status)}</span>`;
}

function formatAdminDate(value) {
  if (!value) return '—';
  let date = null;
  if (typeof value.toDate === 'function') date = value.toDate();
  else if (value._seconds) date = new Date(value._seconds * 1000);
  else date = new Date(value);
  if (!date || Number.isNaN(date.getTime())) return String(value).slice(0, 10) || '—';
  return date.toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: 'numeric' });
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

const quoteWorkflowStatuses = ['draft', 'sent', 'accepted', 'paid', 'declined'];
function renderWorkflowStatusChip(status) {
  const normalized = quoteWorkflowStatuses.includes(String(status || '').toLowerCase()) ? String(status).toLowerCase() : 'draft';
  return `<span class="qd-quote-workflow-status" data-tone="${escapeHtml(normalized)}">${escapeHtml(normalized)}</span>`;
}

function renderPaymentSummaryCards(summary) {
  return `
    <div class="qd-payment-summary-grid">
      <div class="qd-payment-summary-card qd-money-total">
        <span>Total</span>
        <strong>AED ${escapeHtml(formatPaymentAED(summary.total))}</strong>
      </div>
      <div class="qd-payment-summary-card qd-money-paid">
        <span>Paid</span>
        <strong>AED ${escapeHtml(formatPaymentAED(summary.paid))}</strong>
      </div>
      <div class="qd-payment-summary-card qd-money-balance">
        <span>Balance</span>
        <strong>AED ${escapeHtml(formatPaymentAED(summary.balance))}</strong>
      </div>
    </div>
  `;
}

function renderQuoteSchedule(schedule = []) {
  if (!schedule.length) {
    return `<div class="qd-admin-empty"><strong>No payment schedule</strong>Save the quote to generate advance and final items.</div>`;
  }
  return `
    <div class="qd-payment-schedule">
      ${schedule.map((item) => `
        <div class="qd-payment-schedule-row" data-state="${escapeHtml(item.state || 'Unpaid')}">
          <div>
            <strong>${escapeHtml(item.label || item.type || item.itemKey)}</strong>
            <span>${item.state === 'waived' ? 'Free - Waived' : `AED ${escapeHtml(formatPaymentAED(item.amount))} - ${escapeHtml(item.state || 'Unpaid')}${item.remaining > 0 ? ` / Remaining AED ${escapeHtml(formatPaymentAED(item.remaining))}` : ' ✓'}`}</span>
          </div>
          <div class="qd-payment-schedule-actions">
            <small>${item.dueDate ? `Due ${escapeHtml(formatAdminDate(item.dueDate))}` : 'No due date'}</small>
            ${item.itemKey?.startsWith('care:') ? `<button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="${item.state === 'waived' ? 'quote-unwaive-care' : 'quote-waive-care'}" data-month-key="${escapeHtml(item.key || '')}">${item.state === 'waived' ? 'Un-waive' : 'Waive'}</button>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderQuotePaymentForm(form = {}, saving = false, schedule = []) {
  const payableItems = schedule.filter((item) => Number(item.remaining) > 0);
  return `
    <form id="quote-payment-form" class="qd-payment-form">
      <label class="qd-admin-field qd-payment-item-field">
        <span>Item</span>
        <select class="qd-admin-select" id="quote-payment-item-key" name="itemKey" required>
          <option value="">Choose schedule item</option>
          ${payableItems.map((item) => `<option value="${escapeHtml(item.itemKey)}" ${String(form.itemKey || '') === item.itemKey ? 'selected' : ''}>${escapeHtml(item.label || item.type || item.itemKey)} - remaining AED ${escapeHtml(formatPaymentAED(item.remaining))}</option>`).join('')}
        </select>
      </label>
      <label class="qd-admin-field">
        <span>Amount</span>
        <input class="qd-admin-input" id="quote-payment-amount" name="amount" type="number" min="0.01" step="0.01" required value="${escapeHtml(form.amount || '')}" placeholder="AED">
      </label>
      <label class="qd-admin-field">
        <span>Date</span>
        <input class="qd-admin-input" id="quote-payment-date" name="date" type="date" required value="${escapeHtml(form.date || todayInputValue())}">
      </label>
      <label class="qd-admin-field">
        <span>Method</span>
        <select class="qd-admin-select" id="quote-payment-method" name="method">
          ${['Bank transfer', 'Cash', 'Card', 'Cheque', 'Other'].map((method) => `<option value="${escapeHtml(method)}" ${String(form.method || 'Bank transfer') === method ? 'selected' : ''}>${escapeHtml(method)}</option>`).join('')}
        </select>
      </label>
      <label class="qd-admin-field qd-payment-note-field">
        <span>Note</span>
        <input class="qd-admin-input" id="quote-payment-note" name="note" value="${escapeHtml(form.note || '')}" placeholder="Optional internal note">
      </label>
      <button class="qd-btn qd-admin-action-primary qd-payment-save-btn" type="submit" ${saving ? 'disabled' : ''}>
        ${saving ? 'Logging...' : 'Log payment'}
      </button>
    </form>
  `;
}

function renderPaymentsTable(payments = []) {
  if (!payments.length) {
    return `<div class="qd-admin-empty"><strong>No payments logged</strong>Use the form below when money is received.</div>`;
  }
  return `
    <div class="qd-admin-table-wrap qd-payment-table-wrap">
      <table class="qd-admin-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Method</th>
            <th>Note</th>
            <th style="text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${payments.map((payment) => `
            <tr>
              <td>${escapeHtml(payment.date || '')}</td>
              <td>${escapeHtml(payment.method || '')}</td>
              <td>${escapeHtml(payment.note || payment.itemKey || '')}</td>
              <td style="text-align:right">AED ${escapeHtml(formatPaymentAED(payment.amount))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderQuotationRows(quotes = []) {
  if (state.paymentLookup.quotesLoading && !quotes.length) {
    return `<tr><td colspan="7"><div class="qd-admin-empty"><strong>Loading quotations</strong>Fetching the latest quote records.</div></td></tr>`;
  }
  if (!quotes.length) {
    return `<tr><td colspan="7"><div class="qd-admin-empty"><strong>No quotations found</strong>Try a different reference, client, or status filter.</div></td></tr>`;
  }
  const selectedId = state.paymentLookup.quote?.id || '';
  return quotes.map((quote) => `
    <tr class="qd-ql-row ${selectedId === quote.id ? 'is-selected' : ''}" data-action="open-quotation" data-ref="${escapeHtml(quote.id)}">
      <td>
        <button class="qd-admin-row-button qd-quotation-ref-button qd-ql-ref" type="button" data-action="open-quotation" data-ref="${escapeHtml(quote.id)}">
          <strong>${escapeHtml(quote.businessName || 'No client name')}</strong>
          <small>${escapeHtml(quote.quoteNumber || quote.id)} · ${escapeHtml(formatAdminDate(quote.createdAt))}</small>
        </button>
      </td>
      <td><div class="qd-ql-chips">${renderWorkflowStatusChip(quote.status)}${renderPaymentStatusChip(quote.paymentStatus || getPaymentStatusFromAmounts(quote.paid, quote.balance))}</div></td>
      <td class="qd-ql-num">AED ${escapeHtml(formatPaymentAED(quote.total))}</td>
      <td class="qd-ql-num">AED ${escapeHtml(formatPaymentAED(quote.paid))}</td>
      <td class="qd-ql-num ${Number(quote.balance) > 0 ? 'is-due' : ''}">AED ${escapeHtml(formatPaymentAED(quote.balance))}</td>
      <td>${escapeHtml(formatAdminDate(quote.lastSentAt))}</td>
      <td class="qd-ql-open" aria-hidden="true">${adminIcon('arrow')}</td>
    </tr>
  `).join('');
}

function renderQuotationCards(quotes = []) {
  if (!quotes.length) {
    return state.paymentLookup.quotesLoading
      ? '<div class="qd-admin-empty"><strong>Loading quotations</strong>Fetching the latest quote records.</div>'
      : '<div class="qd-admin-empty"><strong>No quotations found</strong>Try a different reference, client, or status filter.</div>';
  }
  return quotes.map((quote) => `
    <button type="button" class="qd-ql-card" data-action="open-quotation" data-ref="${escapeHtml(quote.id)}">
      <span class="qd-ql-card-head">
        <span><strong>${escapeHtml(quote.businessName || 'No client name')}</strong><small>${escapeHtml(quote.quoteNumber || quote.id)} · ${escapeHtml(formatAdminDate(quote.createdAt))}</small></span>
        <span class="qd-ql-chips">${renderWorkflowStatusChip(quote.status)}</span>
      </span>
      <span class="qd-ql-card-figures">
        <span><small>Total</small><strong>AED ${escapeHtml(formatPaymentAED(quote.total))}</strong></span>
        <span><small>Paid</small><strong>AED ${escapeHtml(formatPaymentAED(quote.paid))}</strong></span>
        <span class="${Number(quote.balance) > 0 ? 'is-due' : ''}"><small>Outstanding</small><strong>AED ${escapeHtml(formatPaymentAED(quote.balance))}</strong></span>
      </span>
    </button>
  `).join('');
}

function renderQuotationDetail(quote) {
  if (!quote) {
    if (state.paymentLookup.loading) {
      return `<div class="qd-admin-empty"><strong>Opening quote</strong>Loading ${escapeHtml(state.paymentLookup.quoteRef || '')}…</div>`;
    }
    return `
      <div class="qd-admin-empty">
        <strong>No quotation selected</strong>
        ${state.paymentLookup.error ? escapeHtml(state.paymentLookup.error) : 'Open a row or jump directly to a quote ref.'}
      </div>
    `;
  }
  const summary = {
    total: Number(quote.total) || 0,
    paid: Number(quote.paid) || 0,
    balance: Number(quote.balance) || 0,
    status: quote.paymentStatus || quote.status || getPaymentStatusFromAmounts(quote.paid, quote.balance)
  };
  const workflowStatus = quote.workflowStatus || 'draft';
  const clientUrl = `${location.origin}/q/${quote.id}`;
  const goLiveDate = quote.goLiveDate || todayInputValue();
  const milestones = Array.isArray(quote.milestones) ? quote.milestones : [];
  const careOutstanding = Number(quote.careOutstanding) || 0;

  return `
    <article class="qd-payment-detail-card qd-quotation-detail-card qd-qd-detail">
      <header class="qd-qd-head">
        <div>
          <div class="qd-qd-eyebrow">${escapeHtml(quote.quoteRef || quote.quoteNumber || quote.id)} · Created ${escapeHtml(formatAdminDate(quote.createdAt))}</div>
          <h2 id="qd-qd-title">${escapeHtml(quote.customer?.businessName || 'No customer name')}</h2>
          <div class="qd-quotation-status-stack">
            ${renderWorkflowStatusChip(workflowStatus)}
            ${renderPaymentStatusChip(summary.status)}
          </div>
        </div>
        <button type="button" class="qd-quote-close qd-qd-close" data-action="quote-detail-close" aria-label="Close quote details">${adminIcon('close')}</button>
      </header>

      <form id="quote-workflow-form" class="qd-quotation-inline-form qd-qd-top-status"><label class="qd-admin-field"><span>Quotation status</span><select class="qd-admin-select" name="status">${quoteWorkflowStatuses.map(status => `<option value="${status}" ${workflowStatus === status ? 'selected' : ''}>${status[0].toUpperCase()+status.slice(1)}</option>`).join('')}</select></label><button class="qd-btn qd-admin-action-secondary" type="submit">Save status</button></form>
      ${renderPaymentSummaryCards(summary)}
      ${careOutstanding > 0 ? `<p class="qd-qd-note">Care outstanding: AED ${escapeHtml(formatPaymentAED(careOutstanding))}</p>` : ''}

      <div class="qd-quotation-actions qd-qd-actions" aria-label="Quotation actions">
        <button class="qd-btn qd-admin-action-primary" type="button" data-action="quote-edit-selected">Edit quote</button>
        <button class="qd-btn qd-admin-action-secondary" type="button" data-action="quote-copy-client-link">Copy link + passcode</button>

        <button class="qd-btn qd-admin-action-secondary" type="button" data-action="quote-open-payment">Log a payment</button><a class="qd-btn qd-admin-action-secondary" href="${escapeHtml(clientUrl)}" target="_blank" rel="noreferrer noopener">View</a><button class="qd-btn qd-admin-action-secondary" type="button" data-action="quote-detail-pdf">Save PDF</button>
      </div>

      <section class="qd-qd-section">
        <h3>Payments</h3>
        ${state.paymentLookup.error ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.paymentLookup.error)}</div>` : ''}
        ${renderQuoteSchedule(quote.schedule || [])}
        <details class="qd-qd-disclosure" ${state.paymentLookup.saving || state.paymentLookup.error || state.paymentLookup.paymentFormOpen ? 'open' : ''}>
          <summary>Payment entry</summary>
          ${renderQuotePaymentForm(state.paymentLookup.form || {}, state.paymentLookup.saving, quote.schedule || [])}
        </details>
        <details class="qd-qd-more"><summary>Payment history</summary>${renderPaymentsTable(quote.payments || [])}</details>
      </section>

      <details class="qd-qd-more"><summary>Status &amp; internal notes</summary><div class="qd-qd-more-body">
        <form id="quote-remarks-form" class="qd-quotation-remarks-form">
          <label class="qd-admin-field">
            <span>Remarks</span>
            <textarea class="qd-admin-textarea" name="remarks" rows="3" placeholder="Add a follow-up or internal note">${escapeHtml(quote.remarks || '')}</textarea>
          </label>
          <button class="qd-btn qd-admin-action-secondary" type="submit">Save remarks</button>
        </form>
      </div></details>

      <details class="qd-qd-more"><summary>Billing &amp; due dates</summary><div class="qd-qd-more-body">
        <div class="qd-quotation-billing-grid">
          ${!isNonWebsiteQuote(quote) ? `<form id="quote-golive-form" class="qd-quotation-inline-form">
            <label class="qd-admin-field">
              <span>Go-live date</span>
              <input class="qd-admin-input" type="date" name="goLiveDate" value="${escapeHtml(goLiveDate)}">
            </label>
            <button class="qd-btn qd-admin-action-secondary" type="submit">Mark go-live</button>
          </form>
          <label class="qd-admin-field qd-admin-checkbox-field">
            <input type="checkbox" data-action="quote-first-month-free" ${quote.firstMonthFree ? 'checked' : ''}>
            <span>First month of care free</span>
          </label>` : ''}
          ${milestones.length ? `
            <form id="quote-milestones-form" class="qd-quotation-milestones-form">
              ${milestones.map((milestone) => `
                <label class="qd-admin-field">
                  <span>${escapeHtml(milestone.label || milestone.key)} due</span>
                  <input class="qd-admin-input" type="date" name="${escapeHtml(milestone.key)}" value="${escapeHtml(milestone.dueDate || '')}">
                </label>
              `).join('')}
              <button class="qd-btn qd-admin-action-secondary" type="submit">Save due dates</button>
            </form>
          ` : ''}
        </div>
      </div></details>

      <details class="qd-qd-more qd-qd-danger"><summary>More options</summary><div class="qd-qd-more-body">
        <p>Removes this quote permanently. You will be asked to confirm.</p>
        <button class="qd-btn qd-admin-action-danger" type="button" data-action="quote-delete-selected">Delete quote</button>
      </div></details>
    </article>
  `;
}

// Detail opens as a side sheet (rendered outside the view so it can sit above
// the navigation). Closing it only clears the selection.
let lastRenderedDetailSheetKey = '';
const renderQuotationDetailSheet = () => {
  const lookup = state.paymentLookup;
  if (state.activeTab !== 'payments' || (!lookup.quote && !lookup.loading)) {
    lastRenderedDetailSheetKey = '';
    return '';
  }
  // Slide in only when the sheet first appears, not on each re-render.
  const entering = !lastRenderedDetailSheetKey;
  lastRenderedDetailSheetKey = lookup.quote?.id || lookup.quoteRef || 'loading';
  return `
    <div class="qd-qd-scrim ${entering ? 'is-entering' : ''}" data-action="quote-detail-close" aria-hidden="true"></div>
    <aside class="qd-qd-sheet ${entering ? 'is-entering' : ''}" role="dialog" aria-modal="false" aria-labelledby="qd-qd-title" data-keep-scroll="qd-detail">
      ${renderQuotationDetail(lookup.quote)}
    </aside>
  `;
};

function renderPaymentsManager() {
  const lookup = state.paymentLookup;
  const status = lookup.status || 'All';
  const quotes = lookup.quotes || [];
  return `
    <section class="qd-admin-dashboard qd-payment-dashboard qd-ql">
      <article class="qd-admin-card qd-payment-lookup-card qd-admin-table-card">
        <div class="qd-ql-toolbar"><div class="qd-ql-toolbar-head"><div><h2>All quotations</h2><p>Find a quotation, review its status and track payments.</p></div><button class="qd-btn qd-admin-action-primary" type="button" data-action="quote-new-menu">＋ Create quotation</button></div><div class="qd-ql-controls">
          <form id="quotation-search-form" class="qd-payment-lookup-form qd-ql-search" role="search">
            <input class="qd-admin-input" name="q" type="search" value="${escapeHtml(lookup.search || '')}" placeholder="Search client or quote ref" autocomplete="off" aria-label="Search quotations">
            <button class="qd-btn qd-admin-action-secondary qd-payment-open-btn" type="submit">${lookup.quotesLoading ? 'Searching…' : 'Search'}</button>
          </form>
          <div class="qd-quotation-status-filter" role="group" aria-label="Filter by status">
            ${['All', ...quoteWorkflowStatuses].map((item) => `
              <button class="qd-btn qd-btn-sm ${status === item ? 'qd-admin-action-primary' : 'qd-admin-action-secondary'}" type="button" data-action="quote-status-filter" data-status="${escapeHtml(item)}" aria-pressed="${status === item}">${escapeHtml(item[0].toUpperCase() + item.slice(1))}</button>
            `).join('')}
          </div></div>
        </div>
        ${lookup.quotesError ? `<div class="qd-admin-alert">${escapeHtml(lookup.quotesError)}</div>` : ''}
        ${lookup.error ? `<div class="qd-admin-alert" role="alert">${escapeHtml(lookup.error)}</div>` : ''}
        <div class="qd-admin-table-wrap qd-quotations-table-wrap">
          <table class="qd-admin-table qd-ql-table">
            <thead>
              <tr><th>Client &amp; quote</th><th>Status</th><th class="qd-ql-num">Total</th><th class="qd-ql-num">Paid</th><th class="qd-ql-num">Outstanding</th><th>Last sent</th><th><span class="qd-visually-hidden">Open</span></th></tr>
            </thead>
            <tbody>${renderQuotationRows(quotes)}</tbody>
          </table>
        </div>
        <div class="qd-admin-mobile-list qd-ql-cards">${renderQuotationCards(quotes)}</div>
      </article>
    </section>
    ${state.newQuoteMode ? `<div class="qd-admin-modal-overlay"><button class="qd-admin-modal-backdrop" data-action="quote-new-close" aria-label="Close" type="button"></button><aside class="qd-admin-drawer qd-new-quote" role="dialog" aria-modal="true" aria-label="Create quotation"><button class="qd-admin-drawer-close qd-admin-drawer-close-floating" data-action="quote-new-close" type="button" aria-label="Close">×</button>${state.newQuoteMode === 'custom' ? `<h2>Custom quotation</h2><p>Choose the service and client, then add your own items and prices in the editor.</p><form id="custom-quote-form" class="qd-new-quote-form"><label>Client or business name<input class="qd-admin-input" name="clientName" required maxlength="120" value="${escapeHtml(state.newQuoteDraft?.clientName || '')}"></label><label>Service<select class="qd-admin-select" name="service" required><option value="">Select a service</option>${['Website development','NFC smart cards','AI chatbot','AI automation','Business dashboards','Event management','Restaurant NFC','Wedding invitation','Celebration invitation','Engagement invitation','Photo bucket','Gender reveal party','Other service'].map(service => `<option ${state.newQuoteDraft?.service === service ? 'selected' : ''}>${escapeHtml(service)}</option>`).join('')}</select></label><label class="qd-new-quote-check"><input type="checkbox" name="showClientLink" value="yes" ${state.newQuoteDraft?.showClientLink ? 'checked' : ''}> Show client link and passcode in the editor</label><button class="qd-btn qd-admin-action-primary" type="submit">Continue to editor →</button></form>` : `<h2>Create quotation</h2><p>Choose how you’d like to prepare this quotation.</p><div class="qd-new-quote-options"><button class="qd-btn qd-admin-action-primary" type="button" data-action="quote-new-pricing">Start with Pricing</button><button class="qd-btn qd-admin-action-secondary" type="button" data-action="quote-new-custom">Create a custom quote</button></div>`}</aside></div>` : ''}
  `;
}

function getCollectionInitials(name = '') {
  const clean = String(name || '').trim();
  if (!clean) return '--';
  return clean.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
}

function collectionItemsForBucket(data, bucketKey) {
  return data?.buckets?.[bucketKey]?.items || [];
}

function allCollectionItems(data) {
  return [
    ...collectionItemsForBucket(data, 'overdue').map((item) => ({ ...item, bucket: 'overdue' })),
    ...collectionItemsForBucket(data, 'dueToday').map((item) => ({ ...item, bucket: 'dueToday' })),
    ...collectionItemsForBucket(data, 'upcoming').map((item) => ({ ...item, bucket: 'upcoming' }))
  ];
}

function filterCollectionItems(items) {
  const q = String(state.collections.search || '').trim().toLowerCase();
  const filter = state.collections.filter || 'All';
  return items.filter((item) => {
    if (q && ![item.client, item.quoteNumber].join(' ').toLowerCase().includes(q)) return false;
    if (filter === 'Overdue' && item.bucket !== 'overdue') return false;
    if (filter === 'Due today' && item.bucket !== 'dueToday') return false;
    if (filter === 'Upcoming' && item.bucket !== 'upcoming') return false;
    if (filter === 'Care' && item.collectionType !== 'care') return false;
    if (filter === 'Milestones' && item.collectionType !== 'milestone') return false;
    return true;
  });
}

function renderCollectionKpi(label, key, bucket) {
  return `
    <div class="qd-collection-kpi" data-tone="${key}">
      <span>${escapeHtml(label)}</span>
      <strong>AED ${escapeHtml(formatPaymentAED(bucket?.total || 0))}</strong>
      <small>${escapeHtml(String((bucket?.items || []).length))} item${(bucket?.items || []).length === 1 ? '' : 's'}</small>
    </div>
  `;
}

function renderCollectionRow(item) {
  const client = item.client && item.client.toLowerCase() !== 'client' ? item.client : '—';
  const status = item.bucket === 'overdue' ? 'Overdue' : item.bucket === 'dueToday' ? 'Due today' : 'Upcoming';
  return `
    <div class="qd-collection-row">
      <button type="button" class="qd-collection-main" data-action="collection-open-quote" data-ref="${escapeHtml(item.quoteId)}">
        <span class="qd-collection-avatar">${escapeHtml(getCollectionInitials(client))}</span>
        <span class="qd-collection-client">
          <strong>${escapeHtml(client)}</strong>
          <small>${escapeHtml(item.quoteNumber || '')}</small>
        </span>
        <span class="qd-collection-item">${escapeHtml(item.label || item.type || '')}</span>
        <span class="qd-collection-date">${escapeHtml(formatAdminDate(item.dueDate))}</span>
      </button>
      <div class="qd-collection-row-side">
        <span class="qd-collection-pill" data-tone="${escapeHtml(item.bucket)}">${escapeHtml(status)}</span>
        <strong>AED ${escapeHtml(formatPaymentAED(item.amount))}</strong>
        <button class="qd-btn qd-btn-sm qd-admin-action-primary" type="button" data-action="collection-mark-collected" data-ref="${escapeHtml(item.quoteId)}" data-item-key="${escapeHtml(item.itemKey || '')}" data-type="${escapeHtml(item.collectionType)}" data-month-key="${escapeHtml(item.monthKey || '')}" data-milestone-key="${escapeHtml(item.milestoneKey || '')}">Mark collected</button>
      </div>
    </div>
  `;
}

function renderCollectionSection(title, bucketKey, items, data) {
  const bucket = data?.buckets?.[bucketKey] || { total: 0, items: [] };
  if (!items.length) {
    const empty = bucketKey === 'overdue' ? "Nothing overdue - you're caught up" : bucketKey === 'dueToday' ? 'Nothing due today' : 'Nothing coming up in the next 7 days';
    return `<div class="qd-collection-empty-line">${escapeHtml(empty)}</div>`;
  }
  return `
    <section class="qd-collection-section">
      <div class="qd-collection-section-head"><span>${escapeHtml(title)}</span><small>${items.length} item${items.length === 1 ? '' : 's'} · AED ${escapeHtml(formatPaymentAED(items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)))}</small></div>
      <div class="qd-collection-list">${items.map(renderCollectionRow).join('')}</div>
    </section>
  `;
}

function renderCollectionsManager() {
  const data = state.collections.data;
  const buckets = data?.buckets || {};
  const allItems = filterCollectionItems(allCollectionItems(data));
  const byBucket = {
    overdue: allItems.filter((item) => item.bucket === 'overdue'),
    dueToday: allItems.filter((item) => item.bucket === 'dueToday'),
    upcoming: allItems.filter((item) => item.bucket === 'upcoming')
  };
  const totalDue = (buckets.overdue?.total || 0) + (buckets.dueToday?.total || 0) + (buckets.upcoming?.total || 0);
  return `
    <section class="qd-admin-dashboard qd-collections-dashboard">
      <article class="qd-admin-card qd-payment-lookup-card">
        <div class="qd-admin-section-head qd-payment-head">
          <div>
            <span class="qd-admin-kicker">COLLECTIONS</span>
            <h2>Money due</h2>
            <p>Overdue, due today, and the next 7 days across quote milestones and monthly care.</p>
          </div>
          <button class="qd-btn qd-admin-action-secondary" type="button" data-action="collections-refresh">${state.collections.loading ? 'Refreshing...' : 'Refresh'}</button>
        </div>
        <div class="qd-collection-kpis">
          ${renderCollectionKpi('Overdue', 'overdue', buckets.overdue || { total: 0, items: [] })}
          ${renderCollectionKpi('Due today', 'dueToday', buckets.dueToday || { total: 0, items: [] })}
          ${renderCollectionKpi('Next 7 days', 'upcoming', buckets.upcoming || { total: 0, items: [] })}
          <div class="qd-collection-kpi" data-tone="total"><span>Total due</span><strong>AED ${escapeHtml(formatPaymentAED(totalDue))}</strong><small>${escapeHtml(String(data?.count || 0))} item${(data?.count || 0) === 1 ? '' : 's'}</small></div>
        </div>
        <div class="qd-collection-tools">
          <input class="qd-admin-input" type="search" placeholder="Search client or reference" data-collection-search value="${escapeHtml(state.collections.search || '')}">
          <div class="qd-collection-filters">
            ${['All', 'Overdue', 'Due today', 'Upcoming', 'Care', 'Milestones'].map((item) => `<button class="qd-btn qd-btn-sm ${state.collections.filter === item ? 'qd-admin-action-primary' : 'qd-admin-action-secondary'}" type="button" data-action="collection-filter" data-filter="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join('')}
          </div>
        </div>
        ${state.collections.error ? `<div class="qd-admin-alert">${escapeHtml(state.collections.error)}</div>` : ''}
      </article>
      <article class="qd-admin-card qd-collection-cockpit">
        ${renderCollectionSection('Overdue', 'overdue', byBucket.overdue, data)}
        ${renderCollectionSection('Due today', 'dueToday', byBucket.dueToday, data)}
        ${renderCollectionSection('Next 7 days', 'upcoming', byBucket.upcoming, data)}
      </article>
    </section>
  `;
}

// ── Admin navigation shell ──────────────────────────────────────
// Presentation only: every nav item reuses the existing
// data-action="set-admin-tab" / data-tab contract.
const adminIconPaths = {
  overview: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  dashboard: '<path d="M4 5h16M4 12h16M4 19h10"/>',
  outreach: '<path d="M6.6 3.5h2.6l1.4 4-2 1.3a11 11 0 0 0 6.6 6.6l1.3-2 4 1.4v2.6a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z"/>',
  chat: '<path d="M5 18.5V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8.5z"/>',
  payments: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20zM14 3.5V8h4M9.5 12.5h5M9.5 16h5"/>',
  collections: '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H19a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 17.5zM4 7.5 16 4v2M16.5 12.5h.01"/>',
  pricing: '<path d="M6 3.5h12a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1zM8 7h8M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01"/>',
  demos: '<path d="M3.5 5.5a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1zM9 20.5h6M12 16.5v4"/>',
  cards: '<path d="M3.5 6.5a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1zM7 10h4M7 13.5h6M15.5 10.5h1.5"/>',
  invitations: '<path d="M3.5 6.5a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1zM4 7l8 6 8-6"/>',
  activity: '<path d="M12 7.5V12l3 2M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  logout: '<path d="M14 4.5h4a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h9"/>',
  external: '<path d="M14 5h5v5M19 5l-8 8M17 14v4.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
};

const adminIcon = (name) => `<svg class="qd-nav-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${adminIconPaths[name] || ''}</svg>`;

const adminSectionMeta = {
  overview: { label: 'Overview', group: 'Today', description: 'What needs your attention right now.' },
  dashboard: { label: 'Pipeline', group: 'Sales', description: 'Project requests from the website, from first contact to delivery.' },
  chat: { label: 'Chat leads', group: 'Sales', description: 'Review leads and conversations from your website chat.' },
  outreach: { label: 'Outreach', group: 'Sales', description: 'Cold outreach contacts, follow-ups and meetings.', primary: { label: 'Add lead', action: 'open-outreach-create' } },
  payments: { label: 'Quotations', group: 'Money', description: 'Every quote, its status and what has been paid.' },
  collections: { label: 'Shared bank', group: 'Money', description: 'Track your shared money, expenses and partner shares.' },
  pricing: { label: 'Pricing', group: 'Money', description: 'Build an estimate and turn it into a quote.' },
  demos: { label: 'Demos', group: 'Delivery', description: 'Protected client previews and their expiry.', primary: { label: 'Create demo', action: 'open-demo-create' } },
  cards: { label: 'Smart Cards', group: 'Delivery', description: 'QR and NFC profile cards for the team.', primary: { label: 'Create card', action: 'open-card-create' } },
  invitations: { label: 'Invitations', group: 'Delivery', description: 'Wedding invitation links and RSVPs.', primary: { label: 'Create invitation', action: 'open-invitation-create' } },
  activity: { label: 'Activity', group: 'System', description: 'Audit trail of admin actions.' }
};

const adminNavGroups = [
  { label: '', items: ['overview'] },
  { label: 'Sales', items: ['dashboard', 'outreach', 'chat'] },
  { label: 'Money', items: ['payments', 'collections', 'pricing'] },
  { label: 'Delivery', items: ['demos', 'cards'] },
  { label: 'System', items: ['activity'] }
];

const isSameLocalDay = (value, reference = new Date()) => {
  if (!value) return false;
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (!date || Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === reference.getFullYear()
    && date.getMonth() === reference.getMonth()
    && date.getDate() === reference.getDate();
};

// Derived purely from data that is already loaded in state; no network calls.
const getAdminAttentionCounts = () => {
  const newLeads = state.submissions.filter((item) => item.status === 'New').length;
  const quotesAwaiting = state.overviewQuotesAwaiting;
  const buckets = state.collections.data?.buckets || null;
  const overdue = buckets ? (buckets.overdue?.items || []).length : 0;
  const dueToday = buckets ? (buckets.dueToday?.items || []).length : 0;
  return {
    newLeads,
    quotesAwaiting,
    collectionsLoaded: Boolean(buckets),
    overdue,
    dueToday,
    collectionsDue: overdue + dueToday
  };
};

const renderAdminNavBadge = (count, tone = '') => (count > 0
  ? `<span class="qd-nav-badge" ${tone ? `data-tone="${tone}"` : ''}>${count > 99 ? '99+' : count}</span>`
  : '');

const renderAdminNavItem = (key, counts) => {
  const meta = adminSectionMeta[key];
  const active = state.activeTab === key;
  const badge = key === 'dashboard'
    ? renderAdminNavBadge(counts.newLeads)
    : key === 'payments'
      ? renderAdminNavBadge(counts.quotesAwaiting)
      : key === 'collections'
        ? renderAdminNavBadge(counts.collectionsDue, counts.overdue ? 'danger' : 'warn')
        : '';
  return `
    <button class="qd-admin-tab qd-nav-item ${active ? 'is-active' : ''}" type="button" data-action="set-admin-tab" data-tab="${key}" ${active ? 'aria-current="page"' : ''}>
      ${adminIcon(key)}<span class="qd-nav-label">${escapeHtml(meta.label)}</span>${badge}
    </button>
  `;
};

const renderAdminTabs = () => {
  const counts = getAdminAttentionCounts();
  const email = state.user?.email || '';
  return `
    <aside class="qd-admin-sidebar ${state.navOpen ? 'is-open' : ''}" id="qd-admin-sidebar" aria-label="Admin navigation">
      <div class="qd-admin-sidebar-head">
        <div class="qd-admin-brand">
          <img src="assets/qd-logo.jpeg" alt="" width="32" height="32">
          <span class="qd-admin-brand-name">QDsystem<small>Admin</small></span>
        </div>
        ${renderThemeToggle()}
        <button class="qd-nav-close" type="button" data-action="toggle-admin-nav" aria-label="Close menu">${adminIcon('close')}</button>
      </div>
      <nav class="qd-admin-tabs qd-side-nav" aria-label="Admin sections">
        ${adminNavGroups.map((group) => `
          <div class="qd-nav-group">
            ${group.label ? `<div class="qd-nav-group-label">${escapeHtml(group.label)}</div>` : ''}
            ${group.items.map((key) => renderAdminNavItem(key, counts)).join('')}
          </div>
        `).join('')}
      </nav>
      <div class="qd-admin-sidebar-foot">
        ${email ? `<div class="qd-sidebar-account"><span class="qd-sidebar-avatar" aria-hidden="true">${escapeHtml(adminDisplayName(email).charAt(0))}</span><span class="qd-sidebar-identity"><strong>${escapeHtml(adminDisplayName(email))}</strong><small title="${escapeHtml(email)}">${escapeHtml(email)}</small></span></div>` : ''}
        <button class="qd-nav-item qd-nav-logout" type="button" data-action="logout">${adminIcon('logout')}<span class="qd-nav-label">Log out</span></button>
      </div>
    </aside>
    <div class="qd-admin-nav-scrim" data-action="toggle-admin-nav" aria-hidden="true"></div>
  `;
};

const renderAdminPrimaryAction = (meta, { compact = false } = {}) => {
  if (!meta?.primary) return '';
  return `<button class="qd-btn qd-admin-action-primary qd-page-primary ${compact ? 'is-compact' : ''}" type="button" data-action="${meta.primary.action}" ${compact ? `aria-label="${escapeHtml(meta.primary.label)}"` : ''}>${adminIcon('plus')}<span>${escapeHtml(meta.primary.label)}</span></button>`;
};

const renderAdminMobileBar = () => {
  const meta = adminSectionMeta[state.activeTab] || adminSectionMeta.overview;
  return `
    <header class="qd-admin-mobilebar">
      <button class="qd-nav-toggle" type="button" data-action="toggle-admin-nav" aria-label="Open menu" aria-controls="qd-admin-sidebar" aria-expanded="${state.navOpen ? 'true' : 'false'}">${adminIcon('menu')}</button>
      <div class="qd-admin-mobilebar-title">${escapeHtml(meta.label)}</div>
      ${renderAdminPrimaryAction(meta, { compact: true })}
    </header>
  `;
};

const renderAdminBottomBar = () => {
  const counts = getAdminAttentionCounts();
  const items = [
    ['overview', 'Home', ''],
    ['dashboard', 'Pipeline', renderAdminNavBadge(counts.newLeads)],
    ['payments', 'Quotes', ''],
    ['collections', 'Money', renderAdminNavBadge(counts.collectionsDue, counts.overdue ? 'danger' : 'warn')]
  ];
  return `
    <nav class="qd-admin-bottombar" aria-label="Quick sections">
      ${items.map(([key, label, badge]) => `
        <button class="qd-bottom-item ${state.activeTab === key ? 'is-active' : ''}" type="button" data-action="set-admin-tab" data-tab="${key}" ${state.activeTab === key ? 'aria-current="page"' : ''}>
          <span class="qd-bottom-icon">${adminIcon(key)}${badge}</span><span>${label}</span>
        </button>
      `).join('')}
      <button class="qd-bottom-item" type="button" data-action="toggle-admin-nav" aria-controls="qd-admin-sidebar" aria-expanded="${state.navOpen ? 'true' : 'false'}">
        <span class="qd-bottom-icon">${adminIcon('menu')}</span><span>More</span>
      </button>
    </nav>
  `;
};

const renderThemeToggle = () => {
  const light = document.body.classList.contains('qd-admin-light');
  return `<button class="qd-admin-theme-toggle" type="button" data-action="toggle-theme" aria-label="${light ? 'Switch to dark theme' : 'Switch to light theme'}">${light ? '☾ Dark mode' : '☀ Light mode'}</button>`;
};

const renderAdminPageHeader = () => {
  const meta = adminSectionMeta[state.activeTab] || adminSectionMeta.overview;
  return `
    <header class="qd-page-header">
      <div class="qd-page-heading">
        <div class="qd-page-eyebrow">${escapeHtml(meta.group)}</div>
        <h1 class="qd-page-title">${escapeHtml(meta.label)}</h1>
        <p class="qd-page-description">${escapeHtml(meta.description)}</p>
      </div>
      ${meta.primary ? `<div class="qd-page-actions">${renderAdminPrimaryAction(meta)}</div>` : ''}
    </header>
  `;
};

const bankActivityDate = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Date unavailable' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' }).format(date); };
const bankActivityType = (type) => ({ deposit: 'Deposit', withdraw: 'Withdrawal', expense: 'Expense', bill: 'Reminder set', 'pay-bill': 'Reminder paid' })[type] || 'Transaction';
const sharedBankMoney = (fils) => `AED ${(Number(fils || 0) / 100).toFixed(2)}`;
const sharedBankAmount = (item, rate = null) => item.currency === 'USD' ? `USD ${(item.originalAmount / 100).toFixed(2)} · ${sharedBankMoney(rate ? Math.round(item.originalAmount * rate.rate) : item.amount)}` : sharedBankMoney(item.amount);
const bankEstimate = f => f.currency === 'USD' && state.sharedBankRate ? Math.round(Number(f.amount) * 100 * state.sharedBankRate.rate) : Math.round(Number(f.amount) * 100);
const sharedBankPartners = ['mohammedqudaih107@gmail.com', 'mdaya0089@gmail.com'];
const adminDisplayName = (email) => ({ 'mohammedqudaih107@gmail.com': 'Shadi', 'mdaya0089@gmail.com': 'Daya' })[String(email || '').toLowerCase()] || email || 'Admin';
const bankFlowLabels = { deposit: 'Deposit', expense: 'Expense paid', withdraw: 'Withdraw', bill: 'Payment reminder' };
function focusBankFlow() { root.querySelector(state.bankFlow.step === 1 ? "#bank-amount" : state.bankFlow.step === 2 ? "#bank-note" : ".qd-bank-flow h3")?.focus({ preventScroll: true }); }
function renderBankFlow() {
  const f = state.bankFlow;
  const title = bankFlowLabels[f.type] || '';
  if (f.step === 0) return `<section class="qd-bank-panel qd-bank-flow"><div class="qd-flow-head"><span class="qd-flow-eyebrow">SHARED BANK</span><h3>What would you like to do?</h3><p>Choose an action to get started.</p></div><div class="qd-flow-choices">${[['deposit','＋','Deposit','Add money to the shared pot'],['withdraw','↗','Withdraw','Take from your available share'],['expense','−','Record an expense','Log something already paid'],['bill','◷','Set a reminder','Keep track of a payment due']].map(([key, icon, label, text]) => `<button type="button" class="qd-flow-choice" data-action="bank-flow-start" data-type="${key}"><span class="qd-flow-icon" aria-hidden="true">${icon}</span><span><strong>${label}</strong><small>${text}</small></span><span aria-hidden="true">→</span></button>`).join('')}</div></section>`;
  const heading = f.step === 1 ? 'How much?' : f.step === 2 ? (f.type === 'bill' ? 'Set the reminder' : 'Add a note') : 'Review your entry';
  const content = f.step === 1 ? `<label for="bank-currency">Currency</label><select class="qd-admin-input qd-bank-currency" id="bank-currency" name="currency"><option value="AED" ${f.currency !== 'USD' ? 'selected' : ''}>AED</option><option value="USD" ${f.currency === 'USD' ? 'selected' : ''}>USD</option></select><label for="bank-amount">Amount in ${f.currency || 'AED'}</label><div class="qd-flow-amount"><span>${f.currency || 'AED'}</span><input id="bank-amount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" value="${escapeHtml(f.amount)}" placeholder="0.00" required></div>${f.currency === 'USD' ? `<p class="qd-flow-hint" id="bank-rate-hint">${state.sharedBankRate ? `≈ ${sharedBankMoney(bankEstimate(f))} · 1 USD = ${state.sharedBankRate.rate} AED · ${state.sharedBankRate.date}` : 'Exchange rate unavailable. Try selecting USD again.'}</p>` : ''}${f.type === 'withdraw' ? `<p class="qd-flow-hint">Your available share: <strong>${sharedBankMoney(Math.max(0, state.sharedLedger?.shares?.[sharedBankPartners.indexOf((state.user?.email || '').toLowerCase())] || 0))}</strong></p>` : ''}` : f.step === 2 ? `<label for="bank-note">${f.type === 'bill' ? 'What is this payment for?' : 'What is this for? (optional)'}</label><input class="qd-admin-input" id="bank-note" name="note" maxlength="120" value="${escapeHtml(f.note)}" placeholder="Add a short description" ${f.type === 'bill' ? 'required' : ''}>${f.type === 'bill' ? `<label for="bank-due">Due date</label><input class="qd-admin-input" id="bank-due" name="due" type="date" value="${escapeHtml(f.due)}" required><label class="qd-bank-check"><input name="monthly" type="checkbox" ${f.monthly ? 'checked' : ''}> Repeat reminder</label>${f.monthly ? `<label for="bank-repeat">Repeat every <strong id="bank-repeat-value">${Number(f.repeatMonths || 1)} ${Number(f.repeatMonths || 1) === 1 ? 'month' : 'months'}</strong></label><input id="bank-repeat" name="repeatMonths" type="range" min="1" max="12" step="1" value="${Number(f.repeatMonths || 1)}"><div class="qd-bank-range-labels"><span>1 month</span><span>12 months</span></div>` : ''}` : ''}` : `<div class="qd-flow-review"><div><span>Action</span><strong>${escapeHtml(title)}</strong></div><div><span>Amount</span><strong>${f.currency === 'USD' ? `USD ${Number(f.amount).toFixed(2)} · ` : ''}${sharedBankMoney(bankEstimate(f))}${f.currency === 'USD' ? ` <small>(estimate · ${state.sharedBankRate.date})</small>` : ''}</strong></div><div><span>Description</span><strong>${escapeHtml(f.note || 'No note')}</strong></div>${f.type === 'bill' ? `<div><span>Due</span><strong>${escapeHtml(f.due)}${f.monthly ? ` · Every ${f.repeatMonths || 1} ${Number(f.repeatMonths || 1) === 1 ? 'month' : 'months'}` : ''}</strong></div>` : ''}</div><p class="qd-flow-hint">${f.type === 'bill' ? 'The balance changes only when this reminder is marked paid.' : 'This records money that has already moved.'}</p>`;
  return `<section class="qd-bank-panel qd-bank-flow"><div class="qd-flow-head"><span class="qd-flow-eyebrow">${escapeHtml(title.toUpperCase())} · STEP ${f.step} OF 3</span><h3 tabindex="-1">${heading}</h3><p>${f.step === 3 ? 'Check everything before saving.' : 'One small step at a time.'}</p></div><form id="shared-bank-form" class="qd-flow-form" data-step="${f.step}">${content}<div class="qd-flow-actions"><button class="qd-flow-back" data-action="bank-flow-back" type="button">← Back</button><button class="qd-btn qd-admin-action-primary qd-flow-next" type="submit" ${state.sharedLedgerBusy ? 'disabled' : ''}>${f.step === 3 ? 'Confirm and save' : 'Continue →'}</button></div></form></section>`;
}
function renderSharedBank() {
  const ledger = state.sharedLedger;
  if (!ledger) return `<section class="qd-bank"><p>${state.sharedLedgerError ? escapeHtml(state.sharedLedgerError) : 'Loading shared bank…'}</p><button class="qd-btn qd-admin-action-secondary" data-action="bank-reload" type="button">Refresh</button></section>`;
  const shares = ledger.shares || [0, 0];
  const balance = shares[0] + shares[1];
  const myIndex = sharedBankPartners.indexOf((state.user?.email || '').toLowerCase());
  const bills = (ledger.bills || []).filter(b => !b.paid);
  const entries = ledger.entries || [];
  const pageCount = Math.max(1, Math.ceil(entries.length / 6));
  const page = Math.min(state.bankActivityPage, pageCount - 1);
  const visibleEntries = entries.slice(page * 6, page * 6 + 6);
  return `<section class="qd-bank">
    ${state.sharedLedgerError ? `<div class="qd-admin-alert qd-bank-error" role="alert"><span>${escapeHtml(state.sharedLedgerError)}</span>${state.sharedLedgerError === 'Withdrawal exceeds your available share.' && state.bankFlow.type === 'withdraw' && bankEstimate(state.bankFlow) <= balance ? '<button type="button" class="qd-bank-override" data-action="bank-override">Exceed my share</button>' : ''}</div>` : ''}
    <div class="qd-bank-toolbar"><button class="qd-btn qd-admin-action-secondary" data-action="bank-reload" type="button">↻ Refresh balance</button></div><div class="qd-bank-top"><div class="qd-bank-balance-group"><div class="qd-bank-wallet" aria-hidden="true"><svg viewBox="0 0 80 80" fill="none"><rect x="9" y="24" width="62" height="43" rx="11" fill="currentColor" opacity=".18"/><path d="M13 28V23c0-6 5-10 11-10h34v12M18 25h42c6 0 10 4 10 10v22c0 6-4 10-10 10H20c-6 0-10-4-10-10V35c0-6 3-10 8-10Z" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M71 39H56a7 7 0 0 0 0 14h15" stroke="currentColor" stroke-width="3"/><circle cx="57" cy="46" r="2.5" fill="currentColor"/><path d="m53 5 2 5m9-1-3 4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg></div><div class="qd-bank-total"><h2 class="${balance < 0 ? 'is-negative' : ''}">${sharedBankMoney(balance)}</h2></div></div><div class="qd-bank-right"><div class="qd-bank-shares">${shares.map((v,i)=>`<div class="qd-share-person"><span class="qd-share-avatar qd-share-avatar-${i === 0 ? 'shadi' : 'daya'}" aria-hidden="true">${i === 0 ? 'S' : 'D'}</span><span class="qd-share-name">${escapeHtml(adminDisplayName(sharedBankPartners[i]))}</span><span>${i === myIndex ? 'Your share' : 'Partner’s share'}</span><strong class="${v < 0 ? 'is-negative' : ''}">${sharedBankMoney(v)}</strong></div>`).join('')}</div></div></div>
    <div class="qd-bank-grid">${renderBankFlow()}
    <section class="qd-bank-panel qd-bank-reminders"><div class="qd-reminders-head"><div><h3>Payment reminders</h3><p>Mark a reminder paid to deduct it from the pot.</p></div><span class="qd-reminders-count">${bills.length} due</span></div>${bills.length ? bills.map(b=>`<div class="qd-bank-row"><div><strong>${escapeHtml(b.note)}</strong><small>Due ${escapeHtml(b.due)} · ${sharedBankAmount(b, state.sharedBankRate)}${b.monthly ? ` · Every ${b.repeatMonths || 1} ${Number(b.repeatMonths || 1) === 1 ? 'month' : 'months'}` : ''}${b.currency === 'USD' ? (state.sharedBankRate ? ' · estimate' : ' · saved estimate') : ''}</small></div><button class="qd-btn qd-admin-action-secondary" type="button" data-action="bank-pay" data-id="${escapeHtml(b.id)}" data-due="${escapeHtml(b.due)}">Mark paid</button></div>`).join('') : '<p class="qd-bank-empty">No upcoming reminders yet.</p>'}</section></div>
    <section class="qd-bank-panel qd-bank-history"><h3>Activity</h3><p>Deposits, expenses, withdrawals and reminders stay on the record.</p>${entries.length ? visibleEntries.map(e=>`<div class="qd-bank-row"><div><strong>${escapeHtml(e.note || e.type)}</strong><small class="qd-activity-meta"><span class="qd-activity-type ${e.type === 'deposit' ? 'is-incoming' : 'is-outgoing'}">${escapeHtml(bankActivityType(e.type))}</span><span>By ${escapeHtml(adminDisplayName(e.actor))}</span><span>${escapeHtml(bankActivityDate(e.at))}</span>${e.type === 'bill' ? `<span>Due ${escapeHtml(e.due)}${e.repeatMonths ? ` · Every ${e.repeatMonths} ${e.repeatMonths === 1 ? 'month' : 'months'}` : ''}</span>` : ''}${e.overShare ? `<span>Includes ${sharedBankMoney(e.takenFromPartner)} from partner’s share</span>` : ''}</small></div><b class="qd-bank-activity-amount ${e.type === 'deposit' ? 'is-incoming' : 'is-outgoing'}">${e.type === 'bill' ? '' : e.type === 'deposit' ? '+ ' : '− '}${sharedBankAmount(e)}</b></div>`).join('') : '<p class="qd-bank-empty">Your first entry will appear here.</p>'}${entries.length > 6 ? `<div class="qd-bank-pagination"><span>Page ${page + 1} of ${pageCount}</span><div><button type="button" data-action="bank-activity-prev" ${page === 0 ? 'disabled' : ''} aria-label="Previous activity page">←</button><button type="button" data-action="bank-activity-next" ${page >= pageCount - 1 ? 'disabled' : ''} aria-label="Next activity page">→</button></div></div>` : ''}</section>
  </section>`;
}
async function sharedBankRequest(options = {}) {
  const token = await getAdminIdToken();
  const response = await fetch(options.rate ? '/api/shared-ledger?rate=1' : '/api/shared-ledger', { ...options, headers: {Authorization: `Bearer ${token}`, ...(options.body ? {'Content-Type':'application/json'} : {})} });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not load shared bank.'); return data;
}
async function loadSharedBank(feedback = false) {
  const audio = feedback ? prepareBankSound() : null; let success = false;
  try { state.sharedLedger = await sharedBankRequest(); state.sharedLedgerError = ''; success = true; try { state.sharedBankRate = await sharedBankRequest({rate:true}); } catch { state.sharedBankRate = null; } } catch(e) { state.sharedLedgerError = e.message; }
  render();
  if (success && feedback) { showBankFeedback(root, 'refresh'); playBankSound(audio, 'refresh'); }
  else if (audio) audio.close().catch(() => {});
}
function bankTap() { const audio = prepareBankSound(); playBankSound(audio, 'tap'); }
async function submitSharedBank(data) {
  if (state.sharedLedgerBusy) return;
  const audible = ['deposit', 'withdraw', 'expense', 'bill', 'pay-bill'].includes(data.type);
  const paidBill = data.type === 'pay-bill' ? state.sharedLedger?.bills?.find(b => b.id === data.id) : null;
  const feedbackAmount = paidBill ? (paidBill.currency === 'USD' && state.sharedBankRate ? Math.round(paidBill.originalAmount * state.sharedBankRate.rate) : paidBill.amount) / 100 : (data.currency === 'USD' ? bankEstimate(state.bankFlow) / 100 : data.amount);
  const audio = audible ? prepareBankSound() : null;
  let success = false;
  state.sharedLedgerBusy = true;
  try { state.sharedLedger = await sharedBankRequest({method:'POST', body:JSON.stringify(data)}); state.sharedLedgerError = ''; success = true; }
  catch(e) { state.sharedLedgerError = e.message; }
  finally { state.sharedLedgerBusy = false; }
  render();
  if (success && data.type !== 'pay-bill') state.bankFlow = {step:0, type:'', amount:'', note:'', due:'', monthly:false};
  if (success && data.type !== 'pay-bill') render();
  if (success && audible) { showBankFeedback(root, data.type, feedbackAmount); playBankSound(audio, data.type); }
  else if (audio) audio.close().catch(() => {});
}

const renderOverviewManager = () => {
  const counts = getAdminAttentionCounts();
  const analytics = getAnalytics(state.submissions);
  const followUp = analytics.agingBuckets.find(([label]) => label === '8+ days')?.[1] || 0;
  const archived = analytics.counts.Archived || 0;
  const activeLeads = Math.max(0, analytics.counts.total - archived);
  const today = new Date();
  const meetingsToday = state.submissions.filter((item) => item.status !== 'Archived' && isSameLocalDay(getSubmissionMeetingDate(item), today)).length
    + state.outreachLeads.filter((lead) => isSameLocalDay(lead.meetingDateTime, today)).length;
  const outreachOpen = state.outreachLeads.filter((lead) => !['declined', 'confirmed'].includes(lead.status)).length;
  const activeDemos = state.demos.filter((demo) => getDemoStatus(demo) === 'active').length;
  const activeCards = state.cards.filter((card) => card.active !== false).length;
  const greetingHour = today.getHours();
  const greeting = greetingHour < 12 ? 'Good morning' : greetingHour < 18 ? 'Good afternoon' : 'Good evening';
  const dateLabel = today.toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' });

  const attention = activeAttentionItems([
    {
      key: 'new', count: counts.newLeads, label: 'New leads to review', note: 'Website requests waiting for a first look',
      attrs: 'data-action="overview-open" data-tab="dashboard" data-summary="new"', tone: counts.newLeads ? 'warn' : ''
    },
    {
      key: 'followup', count: followUp, label: 'Leads needing follow-up', note: 'Open leads with no movement for 8+ days',
      attrs: 'data-action="overview-open" data-tab="dashboard" data-summary="followup"', tone: followUp ? 'warn' : ''
    },
    {
      key: 'meetings', count: meetingsToday, label: 'Meetings today', note: 'From the pipeline and outreach',
      attrs: 'data-action="overview-open" data-tab="dashboard" data-summary="active"', tone: ''
    },
    {
      key: 'quotes', count: counts.quotesAwaiting, label: 'Quotes awaiting a reply', note: 'Sent to the client, not yet accepted',
      attrs: 'data-action="overview-open" data-tab="payments" data-quote-status="sent"', tone: ''
    },
    counts.collectionsLoaded
      ? {
        key: 'collections', count: counts.collectionsDue, label: counts.overdue ? 'Payments overdue or due today' : 'Payments due today', note: counts.overdue ? `${counts.overdue} overdue · ${counts.dueToday} due today` : 'Nothing overdue',
        attrs: 'data-action="overview-open" data-tab="collections"', tone: counts.overdue ? 'danger' : counts.dueToday ? 'warn' : ''
      }
      : {
        key: 'collections', count: null, label: 'Money due', note: 'Open Collections to check overdue and upcoming payments',
        attrs: 'data-action="overview-open" data-tab="collections"', tone: ''
      }
  ]);

  const snapshot = [
    ['dashboard', 'Active leads', activeLeads],
    ['outreach', 'Outreach in progress', outreachOpen],
    ['demos', 'Live demos', activeDemos],
    ['cards', 'Active smart cards', activeCards]
  ];

  return `
    <section class="qd-admin-dashboard qd-overview">
      ${state.dataError ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.dataError)}</div>` : ''}
      <p class="qd-overview-greeting">${escapeHtml(greeting)}. <span>${escapeHtml(dateLabel)}</span></p>
      <section class="qd-overview-panel" aria-labelledby="qd-overview-attention">
        <h2 class="qd-overview-heading" id="qd-overview-attention">Needs attention</h2>
        <div class="qd-overview-list">
          ${attention.map((item) => `
            <button class="qd-overview-row" type="button" ${item.attrs} ${item.tone ? `data-tone="${item.tone}"` : ''}>
              <span class="qd-overview-count">${escapeHtml(String(item.count))}</span>
              <span class="qd-overview-copy"><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.note)}</small></span>
              <span class="qd-overview-go">${adminIcon('arrow')}</span>
            </button>
          `).join('')}
          ${!attention.length && !state.collections.loading && !state.collections.error ? '<p class="qd-overview-empty">Nothing needs your attention right now.</p>' : ''}
          ${state.collections.loading && !counts.collectionsLoaded ? '<p class="qd-overview-empty">Checking payments due…</p>' : ''}
          ${state.collections.error ? '<p class="qd-overview-empty" role="status">Could not check payments due. Open Collections to retry.</p>' : ''}
        </div>
      </section>
      <section class="qd-overview-panel" aria-labelledby="qd-overview-snapshot">
        <h2 class="qd-overview-heading" id="qd-overview-snapshot">At a glance</h2>
        <div class="qd-overview-stats">
          ${snapshot.map(([tab, label, value]) => `
            <button class="qd-overview-stat" type="button" data-action="set-admin-tab" data-tab="${tab}">
              <span class="qd-overview-stat-icon">${adminIcon(tab)}</span>
              <strong>${escapeHtml(String(value))}</strong>
              <small>${escapeHtml(label)}</small>
            </button>
          `).join('')}
        </div>
      </section>
    </section>
  `;
};

const renderCardsRows = (items) => {
  if (state.cardsLoading && !items.length) {
    return `
      <tr>
        <td colspan="6">
          <div class="qd-admin-empty-state">
            <strong>Loading smart cards</strong>
            <p>Opening the realtime Firestore listener for the cards collection.</p>
          </div>
        </td>
      </tr>
    `;
  }

  if (!items.length) {
    return `
      <tr>
        <td colspan="6">
          <div class="qd-admin-empty-state">
            <strong>No smart cards yet</strong>
            <p>Create the first NFC and QR-ready profile for the team.</p>
          </div>
        </td>
      </tr>
    `;
  }

  return items.map((card) => `
    <tr>
      <td>
        <div class="qd-admin-card-person">
          <div class="qd-admin-card-avatar">${escapeHtml(getCardInitials(card.name))}</div>
          <div>
            <strong>${escapeHtml(card.name || 'Untitled Card')}</strong>
            <span>${escapeHtml(card.role || 'No role set')}</span>
          </div>
        </div>
      </td>
      <td>
        <div class="qd-admin-card-slug-wrap">
          <span>${escapeHtml(card.slug || '-')}</span>
          <small>${escapeHtml(getCardPublicUrl(card.slug || ''))}</small>
        </div>
      </td>
      <td>${getCardStatusBadge(card)}</td>
      <td>${escapeHtml(String(card.views ?? 0))}</td>
      <td>${escapeHtml(formatDate(card.updatedAt || card.createdAt))}</td>
      <td>
        <div class="qd-admin-row-actions">
          <button class="qd-admin-row-button" type="button" data-action="edit-card" data-id="${escapeHtml(card.id)}">Edit</button>
          <button class="qd-admin-row-button" type="button" data-action="download-card-qr" data-id="${escapeHtml(card.id)}">Download QR</button>
          <button class="qd-admin-row-button" type="button" data-action="copy-card-link" data-id="${escapeHtml(card.id)}">Copy Link</button>
          <button class="qd-admin-row-button" type="button" data-action="toggle-card-active" data-id="${escapeHtml(card.id)}">${card.active === false ? 'Activate' : 'Deactivate'}</button>
          <button class="qd-admin-row-button is-danger" type="button" data-action="delete-card" data-id="${escapeHtml(card.id)}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
};

const renderCardsMobile = (items) => {
  if (!items.length) return '';

  return items.map((card) => `
    <article class="qd-admin-mobile-card qd-admin-card-mobile-card">
      <div class="qd-admin-card-person">
        <div class="qd-admin-card-avatar">${escapeHtml(getCardInitials(card.name))}</div>
        <div>
          <strong>${escapeHtml(card.name || 'Untitled Card')}</strong>
          <span>${escapeHtml(card.role || 'No role set')}</span>
        </div>
      </div>
      <div class="qd-admin-mobile-card-grid">
        <div><strong>Slug</strong><span>${escapeHtml(card.slug || '-')}</span></div>
        <div><strong>Status</strong><span>${card.active === false ? 'Inactive' : 'Active'}</span></div>
        <div><strong>Views</strong><span>${escapeHtml(String(card.views ?? 0))}</span></div>
        <div><strong>Updated</strong><span>${escapeHtml(formatDate(card.updatedAt || card.createdAt))}</span></div>
      </div>
      <div class="qd-admin-card-mobile-actions">
        <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="edit-card" data-id="${escapeHtml(card.id)}">Edit</button>
        <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="download-card-qr" data-id="${escapeHtml(card.id)}">QR</button>
        <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="copy-card-link" data-id="${escapeHtml(card.id)}">Copy</button>
        <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="toggle-card-active" data-id="${escapeHtml(card.id)}">${card.active === false ? 'Activate' : 'Pause'}</button>
        <button class="qd-btn qd-btn-sm qd-admin-action-danger" type="button" data-action="delete-card" data-id="${escapeHtml(card.id)}">Delete</button>
      </div>
    </article>
  `).join('');
};

const renderCardEditor = () => {
  if (!state.cardEditor.open) return '';

  const draft = getCardEditorDraftFromState();
  const previewUrl = buildCardEditorPreviewUrl(draft.slug);
  const slugState = state.cardEditor.slugState || { status: 'idle', message: '' };

  return `
    <div class="qd-admin-modal-overlay">
      <button class="qd-admin-modal-backdrop" type="button" data-action="close-card-editor" aria-label="Close smart card editor"></button>
      <aside class="qd-admin-drawer qd-admin-card-editor" role="dialog" aria-modal="true" aria-label="Smart card editor">
        <button class="qd-admin-drawer-close qd-admin-drawer-close-floating" type="button" data-action="close-card-editor" aria-label="Close">X</button>

        <section class="qd-admin-card-editor-head">
          <div>
            <div class="qd-eyebrow qd-admin-kicker">Smart Card</div>
            <h2>${state.cardEditor.mode === 'edit' ? 'Edit smart card' : 'Create smart card'}</h2>
            <p>Build a premium QR and NFC destination without touching code.</p>
          </div>
          <div class="qd-admin-card-editor-preview">
            <span>Preview URL</span>
            <code id="card-preview-url">${escapeHtml(previewUrl)}</code>
            <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="copy-card-preview">Copy</button>
          </div>
        </section>

        ${state.cardEditor.error ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.cardEditor.error)}</div>` : ''}

        <form class="qd-admin-card-form" id="card-editor-form">
          <div class="qd-admin-admin-grid qd-admin-card-grid-fields">
            <div class="qd-admin-field">
              <label for="card-name">Full Name</label>
              <input id="card-name" class="qd-admin-input" name="name" type="text" value="${escapeHtml(draft.name || '')}" placeholder="Ahmed Al Qassimi" required>
            </div>
            <div class="qd-admin-field">
              <label for="card-role">Role / Title <span class="qd-admin-field-optional">(optional)</span></label>
              <input id="card-role" class="qd-admin-input" name="role" type="text" value="${escapeHtml(draft.role || '')}" placeholder="Founder & CEO">
            </div>
            <div class="qd-admin-field">
              <label for="card-slug">Slug</label>
              <input id="card-slug" class="qd-admin-input ${getCardEditorStateClass()}" name="slug" type="text" value="${escapeHtml(draft.slug || '')}" placeholder="ahmed" required>
              <div class="qd-admin-field-hint ${getCardEditorStateClass()}" id="card-slug-hint">${escapeHtml(slugState.message || 'Use lowercase letters, numbers, and hyphens only.')}</div>
            </div>
            <div class="qd-admin-field">
              <label for="card-phone">Phone</label>
              <input id="card-phone" class="qd-admin-input" name="phone" type="text" value="${escapeHtml(draft.phone || '')}" placeholder="+971501234567" inputmode="tel" required>
              <div class="qd-admin-field-hint">Numbers only is best. WhatsApp will strip spaces and symbols automatically.</div>
            </div>
            <div class="qd-admin-field">
              <label for="card-email">Email</label>
              <input id="card-email" class="qd-admin-input" name="email" type="email" value="${escapeHtml(draft.email || '')}" placeholder="ahmed@qdsystems.ae" required>
            </div>
            <div class="qd-admin-field">
              <label for="card-website">Website URL</label>
              <input id="card-website" class="qd-admin-input" name="website" type="url" value="${escapeHtml(draft.website || CARD_DEFAULT_WEBSITE)}" placeholder="https://qdsystems.ae">
            </div>
            <div class="qd-admin-field">
              <label for="card-cta-label">CTA Label</label>
              <input id="card-cta-label" class="qd-admin-input" name="ctaLabel" type="text" value="${escapeHtml(draft.ctaLabel || CARD_DEFAULT_CTA_LABEL)}" placeholder="Start a Build">
            </div>
            <div class="qd-admin-field">
              <label for="card-cta-url">CTA URL</label>
              <input id="card-cta-url" class="qd-admin-input" name="ctaUrl" type="url" value="${escapeHtml(draft.ctaUrl || CARD_DEFAULT_CTA_URL)}" placeholder="https://qdsystems.ae/contact">
            </div>
            <div class="qd-admin-field qd-admin-card-avatar-field">
              <label for="card-avatar">Avatar Photo</label>
              <input id="card-avatar" class="qd-admin-input qd-admin-file-input" name="avatarFile" type="file" accept="image/*">
              <div class="qd-admin-field-hint">${escapeHtml(state.cardEditor.pendingAvatarFile?.name || draft.avatar || 'Uploads to Firebase Storage at cards/[slug]/avatar.jpg')}</div>
            </div>
            <label class="qd-admin-toggle">
              <input id="card-active" name="active" type="checkbox" ${draft.active === false ? '' : 'checked'}>
              <span>Card is active</span>
            </label>
          </div>

          <section class="qd-admin-drawer-group qd-admin-drawer-admin">
            <div class="qd-admin-drawer-group-head">
              <h3>Extra Links</h3>
            </div>
            <div class="qd-admin-card-links-editor" id="card-links-editor">
              ${buildCardLinkRows(draft.links || [])}
            </div>
            <div class="qd-admin-card-links-actions">
              <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="add-card-link">Add Link</button>
            </div>
          </section>

          <div class="qd-admin-save-row">
            <span class="qd-admin-save-help">Slug stays unique, QR downloads target the production card URL, and views update through the public page.</span>
            <button class="qd-btn qd-btn-md qd-admin-action-primary" type="submit" data-action="submit-card-editor" ${state.cardEditor.isSaving ? 'disabled' : ''}>
              ${state.cardEditor.isSaving ? 'Saving...' : state.cardEditor.mode === 'edit' ? 'Save card' : 'Create card'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  `;
};

const renderCardsManager = () => `
  <section class="qd-admin-dashboard qd-admin-cards-dashboard">
    ${state.cardsError ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.cardsError)}</div>` : ''}

    <article class="qd-admin-card qd-admin-table-card">
      <div class="qd-admin-section-head">
        <div>
          <div class="qd-eyebrow qd-admin-kicker">Smart Cards</div>
          <h2>QR and NFC profiles</h2>
          <p>Create slug-driven digital business cards, download print-ready QR codes, and track live views from one place.</p>
        </div>
        <div class="qd-admin-cards-toolbar">
          <!-- "Create card" lives in the page header (data-action="open-card-create") -->
        </div>
      </div>

      <div class="qd-admin-table-wrap">
        <table class="qd-admin-table">
          <thead>
            <tr>
              <th>Profile</th>
              <th>Slug</th>
              <th>Status</th>
              <th>Views</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${renderCardsRows(state.cards)}</tbody>
        </table>
      </div>

      <div class="qd-admin-mobile-list">
        ${renderCardsMobile(state.cards)}
      </div>
    </article>
  </section>
`;

const getDemoById = (id) => state.demos.find((demo) => demo.id === id) || null;

const getFilteredDemos = () => {
  const queryValue = String(state.demoFilters.search || '').trim().toLowerCase();
  const statusFilter = state.demoFilters.status || 'All';

  return state.demos.filter((demo) => {
    const matchesSearch = !queryValue || [demo.title, demo.clientName, demo.slug]
      .some((value) => String(value || '').toLowerCase().includes(queryValue));
    const matchesStatus = statusFilter === 'All' || getDemoStatus(demo) === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });
};

const getDemoKpis = () => {
  const expiredOrDisabled = state.demos.filter((demo) => ['expired', 'disabled'].includes(getDemoStatus(demo))).length;
  return {
    total: state.demos.length,
    active: state.demos.filter((demo) => getDemoStatus(demo) === 'active').length,
    draft: state.demos.filter((demo) => getDemoStatus(demo) === 'draft').length,
    expiredOrDisabled
  };
};

const renderDemoRows = (items) => {
  if (state.demosLoading && !items.length) {
    return `
      <tr>
        <td colspan="7">
          <div class="qd-admin-empty-state">
            <strong>Loading demos</strong>
            <p>Opening the realtime Firestore listener for client demos.</p>
          </div>
        </td>
      </tr>
    `;
  }

  if (!items.length) {
    return `
      <tr>
        <td colspan="7">
          <div class="qd-admin-empty-state">
            <strong>No demos found</strong>
            <p>Create the first protected client demo link to start sharing previews safely.</p>
          </div>
        </td>
      </tr>
    `;
  }

  return items.map((demo) => `
    <tr>
      <td>${escapeHtml(demo.title || 'Untitled Demo')}</td>
      <td>${escapeHtml(demo.clientName || 'No client')}</td>
      <td>
        <div class="qd-admin-card-slug-wrap">
          <span>${escapeHtml(demo.slug || '-')}</span>
          <small>${escapeHtml(getDemoPublicUrl(demo.slug || ''))}</small>
        </div>
      </td>
      <td>${getDemoStatusBadge(demo)}</td>
      <td>${escapeHtml(String(demo.viewCount ?? 0))}</td>
      <td>${escapeHtml(formatDemoExpiry(demo.expiresAt))}</td>
      <td>
        <div class="qd-admin-row-actions">
          <button class="qd-admin-row-button" type="button" data-action="edit-demo" data-id="${escapeHtml(demo.id)}">Edit</button>
          <button class="qd-admin-row-button" type="button" data-action="copy-demo-link" data-id="${escapeHtml(demo.id)}">Copy Link</button>
          <button class="qd-admin-row-button" type="button" data-action="open-demo-admin" data-id="${escapeHtml(demo.id)}">Open as admin</button>
          <button class="qd-admin-row-button" type="button" data-action="toggle-demo-status" data-id="${escapeHtml(demo.id)}">${getDemoStatus(demo) === 'disabled' ? 'Enable' : 'Disable'}</button>
          <button class="qd-admin-row-button is-danger" type="button" data-action="delete-demo" data-id="${escapeHtml(demo.id)}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
};

const renderDemoCards = (items) => {
  if (!items.length) return '';

  return items.map((demo) => `
    <article class="qd-admin-mobile-card qd-admin-card-mobile-card">
      <div class="qd-admin-card-person">
        <div class="qd-admin-card-avatar">${escapeHtml(getCardInitials(demo.clientName || demo.title || 'QD'))}</div>
        <div>
          <strong>${escapeHtml(demo.title || 'Untitled Demo')}</strong>
          <span>${escapeHtml(demo.clientName || 'No client')}</span>
        </div>
      </div>
      <div class="qd-admin-mobile-card-grid">
        <div><strong>Slug</strong><span>${escapeHtml(demo.slug || '-')}</span></div>
        <div><strong>Status</strong><span>${escapeHtml(getDemoStatusLabel(demo))}</span></div>
        <div><strong>Views</strong><span>${escapeHtml(String(demo.viewCount ?? 0))}</span></div>
        <div><strong>Expires</strong><span>${escapeHtml(formatDemoExpiry(demo.expiresAt))}</span></div>
      </div>
      <div class="qd-admin-card-mobile-actions">
        <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="edit-demo" data-id="${escapeHtml(demo.id)}">Edit</button>
        <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="copy-demo-link" data-id="${escapeHtml(demo.id)}">Copy</button>
        <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="open-demo-admin" data-id="${escapeHtml(demo.id)}">Open</button>
        <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="toggle-demo-status" data-id="${escapeHtml(demo.id)}">${getDemoStatus(demo) === 'disabled' ? 'Enable' : 'Disable'}</button>
        <button class="qd-btn qd-btn-sm qd-admin-action-danger" type="button" data-action="delete-demo" data-id="${escapeHtml(demo.id)}">Delete</button>
      </div>
    </article>
  `).join('');
};

const renderDemoEditor = () => {
  if (!state.demoEditor.open) return '';

  const draft = getDemoEditorDraftFromState();
  const previewUrl = buildDemoPreviewUrl(draft.slug);
  const slugState = state.demoEditor.slugState || { status: 'idle', message: '' };

  return `
    <div class="qd-admin-modal-overlay">
      <button class="qd-admin-modal-backdrop" type="button" data-action="close-demo-editor" aria-label="Close demo editor"></button>
      <aside class="qd-admin-drawer qd-admin-card-editor qd-admin-demo-editor" role="dialog" aria-modal="true" aria-label="Client demo editor">
        <button class="qd-admin-drawer-close qd-admin-drawer-close-floating" type="button" data-action="close-demo-editor" aria-label="Close">X</button>

        <section class="qd-admin-card-editor-head">
          <div>
            <div class="qd-eyebrow qd-admin-kicker">Client Demos</div>
            <h2>${state.demoEditor.mode === 'edit' ? 'Edit demo' : 'Create demo'}</h2>
            <p>Protect client previews with a passcode gate while keeping repo and deploy references private.</p>
          </div>
          <div class="qd-admin-card-editor-preview">
            <span>Customer URL</span>
            <code id="demo-preview-url">${escapeHtml(previewUrl)}</code>
            <div class="qd-admin-card-mobile-actions">
              <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="copy-demo-preview">Copy link</button>
              ${draft.deployHookUrl ? `<button class="qd-btn qd-btn-sm qd-admin-action-primary" type="button" data-action="trigger-demo-deploy" ${state.demoEditor.deployLoading ? 'disabled' : ''}>${state.demoEditor.deployLoading ? 'Triggering...' : 'Trigger Rebuild'}</button>` : ''}
            </div>
          </div>
        </section>

        ${state.demoEditor.error ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.demoEditor.error)}</div>` : ''}

        <form class="qd-admin-card-form" id="demo-editor-form">
          <div class="qd-admin-admin-grid qd-admin-card-grid-fields">
            <div class="qd-admin-field">
              <label for="demo-title">Demo Title</label>
              <input id="demo-title" class="qd-admin-input" name="title" type="text" value="${escapeHtml(draft.title || '')}" required>
            </div>
            <div class="qd-admin-field">
              <label for="demo-client-name">Client Name</label>
              <input id="demo-client-name" class="qd-admin-input" name="clientName" type="text" value="${escapeHtml(draft.clientName || '')}" required>
            </div>
            <div class="qd-admin-field">
              <label for="demo-slug">Slug</label>
              <input id="demo-slug" class="qd-admin-input ${slugState.status === 'invalid' ? 'is-invalid' : slugState.status === 'valid' ? 'is-valid' : slugState.status === 'checking' ? 'is-checking' : ''}" name="slug" type="text" value="${escapeHtml(draft.slug || '')}" required>
              <div class="qd-admin-field-hint ${slugState.status === 'invalid' ? 'is-invalid' : slugState.status === 'valid' ? 'is-valid' : slugState.status === 'checking' ? 'is-checking' : ''}" id="demo-slug-hint">${escapeHtml(slugState.message || 'Use lowercase letters, numbers, and hyphens only.')}</div>
            </div>
            <div class="qd-admin-field">
              <label for="demo-url">Preview URL</label>
              <input id="demo-url" class="qd-admin-input" name="demoUrl" type="url" value="${escapeHtml(draft.demoUrl || '')}" placeholder="https://..." required>
              <div class="qd-admin-field-hint">Deploy to Vercel first, then paste the URL here.</div>
            </div>
            <div class="qd-admin-field">
              <label for="demo-passcode">Passcode ${state.demoEditor.mode === 'edit' ? '<span class="qd-admin-field-optional">(optional)</span>' : ''}</label>
              <input id="demo-passcode" class="qd-admin-input" name="passcode" type="password" value="" ${state.demoEditor.mode === 'create' ? 'required' : ''}>
              <div class="qd-admin-field-hint">${state.demoEditor.mode === 'edit' ? 'Leave blank to keep the current passcode hash.' : 'This is hashed client-side for the MVP before saving to Firestore.'}</div>
            </div>
            <div class="qd-admin-field">
              <label for="demo-status">Status</label>
              <select id="demo-status" class="qd-admin-select" name="status">
                ${DEMO_STATUS_OPTIONS.map((status) => `<option value="${escapeHtml(status)}" ${getDemoStatus(draft) === status ? 'selected' : ''}>${escapeHtml(demoStatusLabels[status])}</option>`).join('')}
              </select>
            </div>
            <div class="qd-admin-field">
              <label for="demo-expiry">Expiry Date <span class="qd-admin-field-optional">(optional)</span></label>
              <input id="demo-expiry" class="qd-admin-input" name="expiresAt" type="date" value="${escapeHtml(draft.expiresAt || '')}">
            </div>
            <div class="qd-admin-field qd-admin-field-span-2">
              <label for="demo-notes">Notes <span class="qd-admin-field-optional">(optional)</span></label>
              <textarea id="demo-notes" class="qd-admin-textarea" name="notes">${escapeHtml(draft.notes || '')}</textarea>
            </div>
            <div class="qd-admin-field">
              <label for="demo-github-url">GitHub Repo URL <span class="qd-admin-field-optional">(optional)</span></label>
              <input id="demo-github-url" class="qd-admin-input" name="githubRepoUrl" type="url" value="${escapeHtml(draft.githubRepoUrl || '')}" placeholder="https://github.com/...">
              <div class="qd-admin-field-hint">For reference only. GitHub repos cannot be previewed directly - deploy to Vercel first.</div>
            </div>
            <div class="qd-admin-field">
              <label for="demo-vercel-project-url">Vercel Project URL <span class="qd-admin-field-optional">(optional)</span></label>
              <input id="demo-vercel-project-url" class="qd-admin-input" name="vercelProjectUrl" type="url" value="${escapeHtml(draft.vercelProjectUrl || '')}" placeholder="https://vercel.com/...">
              <div class="qd-admin-field-hint">Admin reference only.</div>
            </div>
            <div class="qd-admin-field">
              <label for="demo-vercel-preview-url">Vercel Preview URL <span class="qd-admin-field-optional">(optional)</span></label>
              <input id="demo-vercel-preview-url" class="qd-admin-input" name="vercelPreviewUrl" type="url" value="${escapeHtml(draft.vercelPreviewUrl || '')}" placeholder="https://your-demo.vercel.app">
              <div class="qd-admin-field-hint">Admin reference only.</div>
            </div>
            <div class="qd-admin-field">
              <label for="demo-deploy-hook-url">Deploy Hook URL <span class="qd-admin-field-optional">(optional)</span></label>
              <input id="demo-deploy-hook-url" class="qd-admin-input" name="deployHookUrl" type="url" value="${escapeHtml(draft.deployHookUrl || '')}" placeholder="https://api.vercel.com/...">
              <div class="qd-admin-field-hint">Kept secret. Used to trigger Vercel rebuilds.</div>
            </div>
          </div>

          <div class="qd-admin-save-row">
            <span class="qd-admin-save-help">The public page only unlocks the iframe URL after passcode verification through the API, and secret admin references never leave Firestore.</span>
            <button class="qd-btn qd-btn-md qd-admin-action-primary" type="submit" ${state.demoEditor.isSaving ? 'disabled' : ''}>
              ${state.demoEditor.isSaving ? 'Saving...' : state.demoEditor.mode === 'edit' ? 'Save demo' : 'Create demo'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  `;
};

const renderDemosManager = () => {
  const items = getFilteredDemos();
  const kpis = getDemoKpis();

  return `
    <section class="qd-admin-dashboard qd-admin-cards-dashboard">
      ${state.demosError ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.demosError)}</div>` : ''}

      <section class="qd-admin-overview-grid">
        <article class="qd-admin-card"><div class="qd-admin-card-label">Total demos</div><h3>${escapeHtml(String(kpis.total))}</h3></article>
        <article class="qd-admin-card"><div class="qd-admin-card-label">Active demos</div><h3>${escapeHtml(String(kpis.active))}</h3></article>
        <article class="qd-admin-card"><div class="qd-admin-card-label">Draft demos</div><h3>${escapeHtml(String(kpis.draft))}</h3></article>
        <article class="qd-admin-card"><div class="qd-admin-card-label">Expired / Disabled</div><h3>${escapeHtml(String(kpis.expiredOrDisabled))}</h3></article>
      </section>

      <article class="qd-admin-card qd-admin-table-card">
        <div class="qd-admin-section-head">
          <div>
            <div class="qd-eyebrow qd-admin-kicker">Demos</div>
            <h2>Protected client previews</h2>
            <p>Manage passcode-gated demo links, preview destinations, and internal deployment references in one place.</p>
          </div>
          <div class="qd-admin-table-toolbar">
            <input class="qd-admin-input" type="search" placeholder="Search title, client, or slug" data-demo-field="search" value="${escapeHtml(state.demoFilters.search)}">
            <select class="qd-admin-select" data-demo-field="status">
              ${['All', 'Active', 'Draft', 'Expired', 'Disabled'].map((option) => `<option value="${escapeHtml(option)}" ${state.demoFilters.status === option ? 'selected' : ''}>${escapeHtml(option === 'All' ? 'All statuses' : option)}</option>`).join('')}
            </select>
            <!-- "Create demo" lives in the page header (data-action="open-demo-create") -->
          </div>
        </div>

        <div class="qd-admin-table-wrap">
          <table class="qd-admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Client</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Views</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>${renderDemoRows(items)}</tbody>
          </table>
        </div>

        <div class="qd-admin-mobile-list">
          ${renderDemoCards(items)}
        </div>
      </article>
    </section>
  `;
};

const renderInvitationRows = (items) => {
  if (state.invitationsLoading && !items.length) {
    return `
      <tr>
        <td colspan="7">
          <div class="qd-admin-empty-state">
            <strong>Loading invitations</strong>
            <p>Opening the realtime Firestore listener for wedding invitations.</p>
          </div>
        </td>
      </tr>
    `;
  }

  if (!items.length) {
    return `
      <tr>
        <td colspan="7">
          <div class="qd-admin-empty-state">
            <strong>No invitations yet</strong>
            <p>Create the first premium wedding invitation link for a client.</p>
          </div>
        </td>
      </tr>
    `;
  }

  return items.map((invitation) => `
    <tr>
      <td>
        <div class="qd-admin-card-person">
          <div class="qd-admin-card-avatar qd-admin-invite-avatar">${escapeHtml((deriveInvitationDisplayName(invitation) || 'WI').slice(0, 2).toUpperCase())}</div>
          <div>
            <strong>${escapeHtml(deriveInvitationDisplayName(invitation) || 'Untitled Invitation')}</strong>
            <span>${escapeHtml(invitation.eventTitle || 'Wedding Invitation')}</span>
          </div>
        </div>
      </td>
      <td>${escapeHtml(formatInvitationDate(invitation.eventDate))}</td>
      <td>${escapeHtml(invitation.venueName || 'Venue not set')}</td>
      <td><span class="qd-admin-card-status qd-admin-invite-status ${getInvitationStatusClass(invitation)}">${escapeHtml(getInvitationStatusLabel(invitation))}</span></td>
      <td>
        <div class="qd-admin-card-slug-wrap">
          <span>${escapeHtml(invitation.slug || '-')}</span>
          <small>${escapeHtml(getInvitePublicUrl(invitation.slug || ''))}</small>
        </div>
      </td>
      <td>
        <div class="qd-admin-card-slug-wrap">
          <span>${escapeHtml(String(invitation.views ?? 0))} views</span>
          <small>${escapeHtml(String(invitation.rsvpCount ?? 0))} RSVPs</small>
        </div>
      </td>
      <td>
        <div class="qd-admin-row-actions">
          <button class="qd-admin-row-button" type="button" data-action="edit-invitation" data-id="${escapeHtml(invitation.id)}">Edit</button>
          <button class="qd-admin-row-button" type="button" data-action="preview-invitation" data-id="${escapeHtml(invitation.id)}">Preview</button>
          <button class="qd-admin-row-button" type="button" data-action="copy-invitation-link" data-id="${escapeHtml(invitation.id)}">Copy Link</button>
          <button class="qd-admin-row-button" type="button" data-action="download-invitation-qr-by-id" data-id="${escapeHtml(invitation.id)}">QR</button>
          <button class="qd-admin-row-button" type="button" data-action="share-invitation-whatsapp" data-id="${escapeHtml(invitation.id)}">WhatsApp</button>
          <button class="qd-admin-row-button is-danger" type="button" data-action="delete-invitation" data-id="${escapeHtml(invitation.id)}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
};

const renderInvitationCards = (items) => {
  if (!items.length) return '';
  return items.map((invitation) => `
    <article class="qd-admin-mobile-card qd-admin-card-mobile-card">
      <div class="qd-admin-card-person">
        <div class="qd-admin-card-avatar qd-admin-invite-avatar">${escapeHtml((deriveInvitationDisplayName(invitation) || 'WI').slice(0, 2).toUpperCase())}</div>
        <div>
          <strong>${escapeHtml(deriveInvitationDisplayName(invitation) || 'Untitled Invitation')}</strong>
          <span>${escapeHtml(invitation.eventTitle || 'Wedding Invitation')}</span>
        </div>
      </div>
      <div class="qd-admin-mobile-card-grid">
        <div><strong>Date</strong><span>${escapeHtml(formatInvitationDate(invitation.eventDate))}</span></div>
        <div><strong>Status</strong><span>${escapeHtml(getInvitationStatusLabel(invitation))}</span></div>
        <div><strong>Venue</strong><span>${escapeHtml(invitation.venueName || 'Venue not set')}</span></div>
        <div><strong>Views / RSVPs</strong><span>${escapeHtml(String(invitation.views ?? 0))} / ${escapeHtml(String(invitation.rsvpCount ?? 0))}</span></div>
      </div>
      <div class="qd-admin-card-mobile-actions">
        <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="edit-invitation" data-id="${escapeHtml(invitation.id)}">Edit</button>
        <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="preview-invitation" data-id="${escapeHtml(invitation.id)}">Preview</button>
        <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="copy-invitation-link" data-id="${escapeHtml(invitation.id)}">Copy</button>
        <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="share-invitation-whatsapp" data-id="${escapeHtml(invitation.id)}">WhatsApp</button>
        <button class="qd-btn qd-btn-sm qd-admin-action-danger" type="button" data-action="delete-invitation" data-id="${escapeHtml(invitation.id)}">Delete</button>
      </div>
    </article>
  `).join('');
};

const renderInvitationEditor = () => {
  if (!state.invitationEditor.open) return '';

  const draft = getInvitationEditorDraftFromState();
  const previewUrl = buildInvitationPreviewUrl(draft.slug);
  const slugState = state.invitationEditor.slugState || { status: 'idle', message: '' };
  const filteredRsvps = getFilteredInvitationRsvps();
  const rsvpSummary = getInvitationRsvpSummary(state.invitationRsvps, draft);
  const rsvpFilters = state.invitationRsvpFilters;
  const mediaSuggestions = buildInvitationAssetPathSuggestions(draft.slug || 'your-slug');
  const galleryText = Array.isArray(draft.gallery) ? draft.gallery.join('\n') : '';

  return `
    <div class="qd-admin-modal-overlay">
      <button class="qd-admin-modal-backdrop" type="button" data-action="close-invitation-editor" aria-label="Close invitation editor"></button>
      <aside class="qd-admin-drawer qd-admin-card-editor qd-admin-invitation-editor" role="dialog" aria-modal="true" aria-label="Wedding invitation editor">
        <button class="qd-admin-drawer-close qd-admin-drawer-close-floating" type="button" data-action="close-invitation-editor" aria-label="Close">X</button>

        <section class="qd-admin-card-editor-head">
          <div>
            <div class="qd-eyebrow qd-admin-kicker">Wedding Invitations</div>
            <h2>${state.invitationEditor.mode === 'edit' ? 'Edit invitation' : 'Create invitation'}</h2>
            <p>Design a premium, shareable invitation link with RSVP, bilingual support, and media-rich presentation.</p>
          </div>
          <div class="qd-admin-card-editor-preview">
            <span>Preview URL</span>
            <code id="invitation-preview-url">${escapeHtml(previewUrl)}</code>
            <div class="qd-admin-card-mobile-actions">
              <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="copy-invitation-preview">Copy Public Link</button>
              <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="copy-invitation-whatsapp-en">Copy WhatsApp (EN)</button>
              <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="copy-invitation-whatsapp-ar">Copy WhatsApp (AR)</button>
              <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="download-invitation-qr">Download QR</button>
              <button class="qd-btn qd-btn-sm qd-admin-action-primary" type="button" data-action="preview-invitation-draft">Open Preview</button>
            </div>
            <div class="qd-admin-invite-qr-wrap" id="invitation-qr-preview" data-invite-url="${escapeHtml(getInvitePublicUrl(draft.slug || 'your-invitation'))}"></div>
          </div>
        </section>

        ${state.invitationEditor.error ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.invitationEditor.error)}</div>` : ''}

        <form class="qd-admin-card-form" id="invitation-editor-form">
          <div class="qd-admin-admin-grid qd-admin-card-grid-fields qd-admin-invitation-grid">
            <div class="qd-admin-field">
              <label for="invite-bride-name">Bride Name</label>
              <input id="invite-bride-name" class="qd-admin-input" name="brideName" type="text" value="${escapeHtml(draft.brideName || '')}" required>
            </div>
            <div class="qd-admin-field">
              <label for="invite-groom-name">Groom Name</label>
              <input id="invite-groom-name" class="qd-admin-input" name="groomName" type="text" value="${escapeHtml(draft.groomName || '')}" required>
            </div>
            <div class="qd-admin-field">
              <label for="invite-event-title">Event Title</label>
              <input id="invite-event-title" class="qd-admin-input" name="eventTitle" type="text" value="${escapeHtml(draft.eventTitle || '')}" placeholder="Wedding Invitation">
            </div>
            <div class="qd-admin-field">
              <label for="invite-slug">Slug / Custom Link</label>
              <input id="invite-slug" class="qd-admin-input ${slugState.status === 'invalid' ? 'is-invalid' : slugState.status === 'valid' ? 'is-valid' : ''}" name="slug" type="text" value="${escapeHtml(draft.slug || '')}" required>
              <div class="qd-admin-field-hint" id="invite-slug-hint">${escapeHtml(slugState.message || 'Use lowercase letters, numbers, and hyphens only.')}</div>
            </div>
            <div class="qd-admin-field">
              <label for="invite-event-date">Event Date</label>
              <input id="invite-event-date" class="qd-admin-input" name="eventDate" type="date" value="${escapeHtml(draft.eventDate || '')}" required>
            </div>
            <div class="qd-admin-field">
              <label for="invite-event-time">Event Time</label>
              <input id="invite-event-time" class="qd-admin-input" name="eventTime" type="time" value="${escapeHtml(draft.eventTime || '')}">
            </div>
            <div class="qd-admin-field">
              <label for="invite-venue-name">Venue Name</label>
              <input id="invite-venue-name" class="qd-admin-input" name="venueName" type="text" value="${escapeHtml(draft.venueName || '')}" required>
            </div>
            <div class="qd-admin-field">
              <label for="invite-whatsapp">WhatsApp Number</label>
              <input id="invite-whatsapp" class="qd-admin-input" name="whatsappNumber" type="text" value="${escapeHtml(draft.whatsappNumber || '')}" placeholder="+9715...">
            </div>
            <div class="qd-admin-field qd-admin-field-span-2">
              <label for="invite-venue-address">Venue Address</label>
              <textarea id="invite-venue-address" class="qd-admin-textarea" name="venueAddress">${escapeHtml(draft.venueAddress || '')}</textarea>
            </div>
            <div class="qd-admin-field qd-admin-field-span-2">
              <label for="invite-map-url">Google Maps / Location URL</label>
              <input id="invite-map-url" class="qd-admin-input" name="mapUrl" type="url" value="${escapeHtml(draft.mapUrl || '')}" placeholder="https://maps.google.com/...">
            </div>
            <div class="qd-admin-field">
              <label for="invite-language-default">Default Language</label>
              <select id="invite-language-default" class="qd-admin-select" name="languageDefault">
                <option value="en" ${draft.languageDefault === 'en' ? 'selected' : ''}>English</option>
                <option value="ar" ${draft.languageDefault === 'ar' ? 'selected' : ''}>Arabic</option>
              </select>
            </div>
            <div class="qd-admin-field">
              <label for="invite-theme">Theme</label>
              <select id="invite-theme" class="qd-admin-select" name="theme">
                ${INVITE_THEME_OPTIONS.map((theme) => `<option value="${escapeHtml(theme)}" ${draft.theme === theme ? 'selected' : ''}>${escapeHtml(inviteThemeLabels[theme])}</option>`).join('')}
              </select>
            </div>
            <div class="qd-admin-field">
              <label for="invite-status">Status</label>
              <select id="invite-status" class="qd-admin-select" name="status">
                ${INVITE_STATUS_OPTIONS.map((status) => `<option value="${escapeHtml(status)}" ${getInvitationStatus(draft) === status ? 'selected' : ''}>${escapeHtml(inviteStatusLabels[status])}</option>`).join('')}
              </select>
            </div>
            <div class="qd-admin-field">
              <label for="invite-couple-display-name">Display Names <span class="qd-admin-field-optional">(optional)</span></label>
              <input id="invite-couple-display-name" class="qd-admin-input" name="coupleDisplayName" type="text" value="${escapeHtml(draft.coupleDisplayName || '')}" placeholder="${escapeHtml(deriveInvitationDisplayName(draft) || 'Aisha & Omar')}">
            </div>
            <div class="qd-admin-field qd-admin-field-span-2">
              <div class="qd-admin-alert is-soft" role="note">Media files must be placed manually in <code>assets/invitations/[slug]/</code> before deployment.</div>
            </div>
            <div class="qd-admin-field qd-admin-field-span-2">
              <label for="invite-cover-image-url">Cover Image Path</label>
              <input id="invite-cover-image-url" class="qd-admin-input" name="coverImageUrl" type="text" value="${escapeHtml(draft.coverImageUrl || '')}" placeholder="${escapeHtml(mediaSuggestions.coverImageUrl)}">
              <div class="qd-admin-field-hint">Example: ${escapeHtml(mediaSuggestions.coverImageUrl)}</div>
            </div>
            <div class="qd-admin-field qd-admin-field-span-2">
              <label for="invite-music-url">Background Music Path</label>
              <input id="invite-music-url" class="qd-admin-input" name="musicUrl" type="text" value="${escapeHtml(draft.musicUrl || '')}" placeholder="${escapeHtml(mediaSuggestions.musicUrl)}">
              <div class="qd-admin-field-hint">Example: ${escapeHtml(mediaSuggestions.musicUrl)}</div>
            </div>
            <div class="qd-admin-field qd-admin-field-span-2">
              <label for="invite-gallery-paths">Gallery Image Paths <span class="qd-admin-field-optional">(one per line)</span></label>
              <textarea id="invite-gallery-paths" class="qd-admin-textarea" name="galleryPaths" rows="4" placeholder="${escapeHtml(mediaSuggestions.gallery.join('\n'))}">${escapeHtml(galleryText)}</textarea>
              <div class="qd-admin-field-hint">Example: ${escapeHtml(mediaSuggestions.gallery.join(', '))}</div>
            </div>
            <div class="qd-admin-field">
              <label for="invite-rsvp-deadline">RSVP Deadline</label>
              <input id="invite-rsvp-deadline" class="qd-admin-input" name="rsvpDeadline" type="date" value="${escapeHtml(draft.rsvpDeadline || '')}">
            </div>
            <label class="qd-admin-toggle">
              <input id="invite-rsvp-enabled" name="rsvpEnabled" type="checkbox" ${draft.rsvpEnabled ? 'checked' : ''}>
              <span>RSVP form is enabled</span>
            </label>
            <label class="qd-admin-toggle">
              <input id="invite-active" name="active" type="checkbox" ${draft.active ? 'checked' : ''}>
              <span>Invitation is publicly active</span>
            </label>
          </div>

          <section class="qd-admin-drawer-group qd-admin-drawer-admin">
            <div class="qd-admin-drawer-group-head">
              <h3>RSVP Activity</h3>
              <div class="qd-admin-card-slug-wrap">
                <span>${escapeHtml(String(rsvpSummary.total))} responses · ${escapeHtml(String(rsvpSummary.expectedGuests))} expected guests</span>
                <small>${escapeHtml(String(draft.views || 0))} views${rsvpSummary.responseRate ? ` · ${escapeHtml(rsvpSummary.responseRate)}% response rate` : ''}</small>
              </div>
            </div>
            <div class="qd-admin-invite-rsvp-summary">
              <span><strong>${escapeHtml(String(rsvpSummary.attending))}</strong> attending</span>
              <span><strong>${escapeHtml(String(rsvpSummary.notAttending))}</strong> not attending</span>
              <span><strong>${escapeHtml(String(rsvpSummary.total))}</strong> total RSVPs</span>
            </div>
            <div class="qd-admin-invite-rsvp-toolbar">
              <input class="qd-admin-input" type="search" id="invite-rsvp-search" placeholder="Search guest name" value="${escapeHtml(rsvpFilters.search)}">
              <input class="qd-admin-input" type="search" id="invite-rsvp-phone" placeholder="Search phone" value="${escapeHtml(rsvpFilters.phone)}">
              <select class="qd-admin-select" id="invite-rsvp-attending-filter">
                <option value="all" ${rsvpFilters.attending === 'all' ? 'selected' : ''}>All attendance</option>
                <option value="yes" ${rsvpFilters.attending === 'yes' ? 'selected' : ''}>Attending</option>
                <option value="no" ${rsvpFilters.attending === 'no' ? 'selected' : ''}>Not attending</option>
              </select>
              <select class="qd-admin-select" id="invite-rsvp-sort">
                <option value="newest" ${rsvpFilters.sort === 'newest' ? 'selected' : ''}>Newest first</option>
                <option value="oldest" ${rsvpFilters.sort === 'oldest' ? 'selected' : ''}>Oldest first</option>
              </select>
              <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="export-invitation-rsvps">Export CSV</button>
            </div>
            ${state.invitationRsvpsError ? `<div class="qd-admin-alert is-soft" role="status">${escapeHtml(state.invitationRsvpsError)}</div>` : ''}
            ${state.invitationRsvpsLoading && !state.invitationRsvps.length ? `
              <div class="qd-admin-empty-state">
                <strong>Loading RSVPs</strong>
                <p>Waiting for guest responses.</p>
              </div>
            ` : filteredRsvps.length ? `
              <div class="qd-admin-table-wrap">
                <table class="qd-admin-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Attending</th>
                      <th>Guests</th>
                      <th>Message</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filteredRsvps.map((rsvp) => `
                      <tr>
                        <td>${escapeHtml(rsvp.guestName || rsvp.name || '-')}</td>
                        <td>${escapeHtml(rsvp.phone || '-')}</td>
                        <td>${escapeHtml(rsvp.attending === 'yes' ? 'Attending' : 'Not attending')}</td>
                        <td>${escapeHtml(String(rsvp.guestCount ?? rsvp.guests ?? (rsvp.attending === 'yes' ? 1 : 0)))}</td>
                        <td>${escapeHtml(rsvp.message || '-')}</td>
                        <td>${escapeHtml(formatInvitationRsvpTime(rsvp.createdAt))}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : `
              <div class="qd-admin-empty-state">
                <strong>No RSVPs yet</strong>
                <p>Guest confirmations will appear here after the invitation is shared.</p>
              </div>
            `}
          </section>

          <div class="qd-admin-save-row">
            <span class="qd-admin-save-help">Invitation details are saved to Firestore. Place cover, music, and gallery files in <code>assets/invitations/[slug]/</code> and enter their paths above.</span>
            <button class="qd-btn qd-btn-md qd-admin-action-primary" type="submit" ${state.invitationEditor.isSaving ? 'disabled' : ''}>
              ${state.invitationEditor.isSaving ? 'Saving...' : state.invitationEditor.mode === 'edit' ? 'Save invitation' : 'Create invitation'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  `;
};

const renderInvitationsManager = () => `
  <section class="qd-admin-dashboard qd-admin-cards-dashboard">
    ${state.invitationsError ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.invitationsError)}</div>` : ''}

    <article class="qd-admin-card qd-admin-table-card">
      <div class="qd-admin-section-head">
        <div>
          <div class="qd-eyebrow qd-admin-kicker">Wedding Invitations</div>
          <h2>Premium invitation links</h2>
          <p>Create luxurious bilingual invitation pages with countdowns, RSVP flows, theme presets, cover media, and WhatsApp-ready sharing.</p>
        </div>
        <div class="qd-admin-cards-toolbar">
          <!-- "Create invitation" lives in the page header (data-action="open-invitation-create") -->
        </div>
      </div>

      <div class="qd-admin-table-wrap">
        <table class="qd-admin-table">
          <thead>
            <tr>
              <th>Couple</th>
              <th>Date</th>
              <th>Venue</th>
              <th>Status</th>
              <th>Public Link</th>
              <th>Performance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${renderInvitationRows(state.invitations)}</tbody>
        </table>
      </div>

      <div class="qd-admin-mobile-list">
        ${renderInvitationCards(state.invitations)}
      </div>
    </article>
  </section>
`;

const ACTIVITY_PAGE_SIZE = 10;

const getFilteredActivityLogs = () => {
  const search = state.activityFilters.search.trim().toLowerCase();
  return state.activityLogs.filter((log) => {
    if (state.activityFilters.actor !== 'All' && (log.actorEmail || '').toLowerCase() !== state.activityFilters.actor) return false;
    if (state.activityFilters.action !== 'All' && log.action !== state.activityFilters.action) return false;
    if (state.activityFilters.targetType !== 'All' && log.targetType !== state.activityFilters.targetType) return false;
    if (!search) return true;

    const haystack = [
      log.actorEmail,
      log.action,
      log.targetType,
      log.targetLabel,
      log.targetId,
      ...summarizeActivityMetadata(log.metadata || {})
    ].join(' ').toLowerCase();

    return haystack.includes(search);
  });
};

const getPaginatedActivityLogs = (items) => {
  const pageCount = Math.ceil(items.length / ACTIVITY_PAGE_SIZE);
  const activePage = Math.min(state.activityPage, Math.max(pageCount - 1, 0));
  return {
    pageCount,
    activePage,
    items: items.slice(activePage * ACTIVITY_PAGE_SIZE, (activePage + 1) * ACTIVITY_PAGE_SIZE)
  };
};

const renderActivityPagination = (totalItems) => {
  const pageCount = Math.ceil(totalItems / ACTIVITY_PAGE_SIZE);
  if (pageCount <= 1) return '';

  const activePage = Math.min(state.activityPage, Math.max(pageCount - 1, 0));

  return `
    <div class="qd-admin-pagination">
      <button class="qd-admin-pagination-btn" type="button" data-action="activity-page-prev" ${activePage === 0 ? 'disabled' : ''} aria-label="Previous activity page">&larr;</button>
      <span>${activePage + 1} / ${pageCount}</span>
      <button class="qd-admin-pagination-btn" type="button" data-action="activity-page-next" ${activePage >= pageCount - 1 ? 'disabled' : ''} aria-label="Next activity page">&rarr;</button>
    </div>
  `;
};

const renderActivityRows = (logs) => {
  if (state.activityLoading && !logs.length) {
    return `
      <tr>
        <td colspan="6">
          <div class="qd-admin-empty-state">
            <strong>Loading activity</strong>
            <p>Opening the realtime Firestore listener for admin activity logs.</p>
          </div>
        </td>
      </tr>
    `;
  }

  if (!logs.length) {
    return `
      <tr>
        <td colspan="6">
          <div class="qd-admin-empty-state">
            <strong>No activity yet</strong>
            <p>Meaningful admin actions will appear here after they happen.</p>
          </div>
        </td>
      </tr>
    `;
  }

  return logs.map((log) => `
    <tr>
      <td>${escapeHtml(formatActivityTimestamp(log.timestamp))}</td>
      <td>${escapeHtml(log.actorEmail || 'Unknown')}</td>
      <td>${escapeHtml(getActivityActionLabel(log.action))}</td>
      <td>${escapeHtml(getActivityTargetTypeLabel(log.targetType))}</td>
      <td>
        <div class="qd-admin-card-slug-wrap">
          <span>${escapeHtml(log.targetLabel || log.targetId || 'Unknown')}</span>
          <small>${escapeHtml(log.targetId || '-')}</small>
        </div>
      </td>
      <td>${summarizeActivityMetadata(log.metadata || {}).map((row) => `<div class="qd-admin-detail-value">${escapeHtml(row)}</div>`).join('')}</td>
    </tr>
  `).join('');
};

const renderActivityCards = (logs) => {
  if (!logs.length) return '';
  return logs.map((log) => `
    <article class="qd-admin-mobile-card">
      <div class="qd-admin-mobile-card-head">
        <div>
          <div class="qd-admin-business-name">${escapeHtml(getActivityActionLabel(log.action))}</div>
          <div class="qd-admin-subline">${escapeHtml(log.actorEmail || 'Unknown')}</div>
        </div>
        <span class="qd-status-pill" data-tone="neutral">${escapeHtml(getActivityTargetTypeLabel(log.targetType))}</span>
      </div>
      <div class="qd-admin-mobile-card-grid">
        <div><strong>When</strong><span>${escapeHtml(formatActivityTimestamp(log.timestamp))}</span></div>
        <div><strong>Target</strong><span>${escapeHtml(log.targetLabel || log.targetId || 'Unknown')}</span></div>
      </div>
      <div class="qd-admin-detail-stack">
        ${summarizeActivityMetadata(log.metadata || {}).map((row) => `<div class="qd-admin-detail-value">${escapeHtml(row)}</div>`).join('')}
      </div>
    </article>
  `).join('');
};

const renderActivityManager = () => {
  const filteredLogs = getFilteredActivityLogs();
  const { items, activePage, pageCount } = getPaginatedActivityLogs(filteredLogs);
  if (activePage !== state.activityPage && pageCount) {
    state.activityPage = activePage;
  }
  const actionOptions = ['All', ...Object.keys(activityActionLabels)];
  const targetTypeOptions = ['All', ...Object.keys(activityTargetTypeLabels)];

  return `
    <section class="qd-admin-dashboard qd-admin-cards-dashboard">
      ${state.activityError ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.activityError)}</div>` : ''}

      <article class="qd-admin-card qd-admin-table-card">
        <div class="qd-admin-section-head">
          <div>
            <div class="qd-eyebrow qd-admin-kicker">Admin Activity</div>
            <h2>Audit trail</h2>
            <p>Track which admin performed each meaningful action, when it happened, and what changed.</p>
          </div>
        </div>

        <div class="qd-admin-toolbar qd-admin-filters" style="margin-bottom:20px">
          <input class="qd-admin-input" type="search" placeholder="Search email, action, record label, or ID" data-activity-field="search" value="${escapeHtml(state.activityFilters.search)}">
          <select class="qd-admin-select" data-activity-field="actor" aria-label="Filter activity by person"><option value="All">Everyone</option>${sharedBankPartners.map(email => `<option value="${email}" ${state.activityFilters.actor === email ? 'selected' : ''}>${escapeHtml(adminDisplayName(email))}${email === (state.user?.email || '').toLowerCase() ? ' (you)' : ''}</option>`).join('')}</select>
          <select class="qd-admin-select" data-activity-field="action" aria-label="Filter activity by action">
            ${actionOptions.map((option) => `
              <option value="${escapeHtml(option)}" ${state.activityFilters.action === option ? 'selected' : ''}>${escapeHtml(option === 'All' ? 'All actions' : getActivityActionLabel(option))}</option>
            `).join('')}
          </select>
          <select class="qd-admin-select" data-activity-field="targetType">
            ${targetTypeOptions.map((option) => `
              <option value="${escapeHtml(option)}" ${state.activityFilters.targetType === option ? 'selected' : ''}>${escapeHtml(option === 'All' ? 'All target types' : getActivityTargetTypeLabel(option))}</option>
            `).join('')}
          </select>
        </div>

        <div class="qd-admin-table-wrap">
          <table class="qd-admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Admin</th>
                <th>Action</th>
                <th>Target Type</th>
                <th>Target</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>${renderActivityRows(items)}</tbody>
          </table>
        </div>

        <div class="qd-admin-mobile-list">
          ${renderActivityCards(items)}
        </div>

        ${renderActivityPagination(filteredLogs.length)}
      </article>
    </section>
  `;
};

const renderDetailItem = (label, value, options = {}) => {
  const formatted = formatValue(value, options);
  const isArabic = options.isArabic || false;
  const multiline = options.multiline || false;
  const isEmpty = String(formatted).trim().toLowerCase() === 'not provided';

  return `
    <div class="qd-admin-detail-item ${isArabic ? 'is-rtl' : ''}">
      <strong>${escapeHtml(label)}</strong>
      <div class="qd-admin-detail-value ${multiline ? 'is-multiline' : ''} ${isEmpty ? 'is-empty' : ''}">${escapeHtml(formatted)}</div>
    </div>
  `;
};

const renderEditableField = (field, draft) => {
  const value = draft?.[field.key] ?? '';

  if (field.input === 'textarea') {
    return `
      <div class="qd-admin-field">
        <label for="drawer-edit-${escapeHtml(field.key)}">${escapeHtml(field.label)}</label>
        <textarea id="drawer-edit-${escapeHtml(field.key)}" class="qd-admin-textarea" data-drawer-edit-field="${escapeHtml(field.key)}">${escapeHtml(value)}</textarea>
      </div>
    `;
  }

  if (field.input === 'select') {
    return `
      <div class="qd-admin-field">
        <label for="drawer-edit-${escapeHtml(field.key)}">${escapeHtml(field.label)}</label>
        <select id="drawer-edit-${escapeHtml(field.key)}" class="qd-admin-select" data-drawer-edit-field="${escapeHtml(field.key)}">
          ${field.options.map(([optionValue, optionLabel]) => `
            <option value="${escapeHtml(optionValue)}" ${String(value) === optionValue ? 'selected' : ''}>${escapeHtml(optionLabel)}</option>
          `).join('')}
        </select>
      </div>
    `;
  }

  return `
    <div class="qd-admin-field">
      <label for="drawer-edit-${escapeHtml(field.key)}">${escapeHtml(field.label)}</label>
      <input id="drawer-edit-${escapeHtml(field.key)}" class="qd-admin-input" type="${escapeHtml(field.input || 'text')}" value="${escapeHtml(value)}" data-drawer-edit-field="${escapeHtml(field.key)}">
    </div>
  `;
};

const renderDetailSection = (title, items, isArabic) => {
  const visibleItems = items.filter((item) => item);
  if (!visibleItems.length) return '';

  return `
    <section class="qd-admin-drawer-group">
      <div class="qd-admin-drawer-group-head">
        <h3>${escapeHtml(title)}</h3>
      </div>
      <div class="qd-admin-detail-grid">
        ${visibleItems.map((item) => renderDetailItem(item.label, item.value, { ...item, isArabic: item.isArabic ?? isArabic })).join('')}
      </div>
    </section>
  `;
};

const renderDrawer = () => {
  const submission = getSelectedSubmission();
  if (!submission) return '';

  ensureDrawerDraft();

  const draft = state.drawerDraft || {
    id: submission.id,
    status: submission.status || 'New',
    priority: submission.priority || 'Normal',
    notes: submission.notes || ''
  };

  const language = submission.language || 'en';
  const isArabic = language === 'ar';
  const whatsappLink = buildWhatsAppLink(submission);
  const mailtoLink = buildMailtoLink(submission);
  const callLink = buildCallLink(submission);
  const businessName = getAnswer(submission, 'businessName');
  const businessEmail = getAnswer(submission, 'businessEmail');
  const businessPhone = getAnswer(submission, 'businessPhone');
  const industry = getAnswer(submission, 'industry');
  const businessDescription = getAnswer(submission, 'businessDescription');
  const socialLinks = getAnswer(submission, 'socialLinks');
  const mainPurpose = submission.selectedMainPurpose || getAnswer(submission, 'mainPurpose');
  const requiredFeatures = submission.selectedRequiredFeatures || getAnswer(submission, 'requiredFeatures');
  const optionalServices = submission.selectedOptionalServices || getAnswer(submission, 'optionalServices');

  const groupedSections = [
    {
      title: 'Business Information',
      items: [
        { label: 'Business Name', value: businessName },
        { label: 'Contact Email', value: businessEmail },
        { label: 'Phone', value: businessPhone },
        { label: 'Industry', value: industry },
        { label: 'Business Description', value: businessDescription, multiline: true },
        { label: 'Social Links', value: socialLinks, multiline: true }
      ]
    },
    {
      title: 'Website Goals',
      items: [
        { label: 'Main Purpose', value: mainPurpose, multiline: true },
        { label: 'Visitor Action', value: getAnswer(submission, 'visitorAction'), multiline: true },
        { label: 'Ideal Customer', value: getAnswer(submission, 'idealCustomer'), multiline: true }
      ]
    },
    {
      title: 'Branding & Design',
      items: [
        { label: 'Logo Availability', value: getAnswer(submission, 'hasLogo'), type: 'label' },
        { label: 'Brand Assets', value: getAnswer(submission, 'hasBrandAssets'), type: 'label' },
        { label: 'Brand Assets Details', value: getAnswer(submission, 'brandAssets'), multiline: true },
        { label: 'Preferred Style', value: getAnswer(submission, 'preferredStyle'), type: 'label' },
        { label: 'Preferred Colors', value: getAnswer(submission, 'preferredColors') },
        { label: 'Colors To Avoid', value: getAnswer(submission, 'colorsToAvoid'), multiline: true }
      ]
    },
    {
      title: 'Pages & Content',
      items: [
        { label: 'Needed Pages', value: getAnswer(submission, 'neededPages') },
        { label: 'Product / Service Count', value: getAnswer(submission, 'productCount') },
        { label: 'Content Readiness', value: getAnswer(submission, 'contentReadiness'), type: 'label' },
        { label: 'Legal Pages', value: getAnswer(submission, 'legalPages'), type: 'label' }
      ]
    },
    {
      title: 'Features & Functionality',
      items: [
        { label: 'Required Features / Modules', value: requiredFeatures, multiline: true },
        { label: 'Languages Needed', value: getAnswer(submission, 'requiredFeatures__multi_language_languages') },
        { label: 'Custom Features', value: getAnswer(submission, 'customFeatures'), multiline: true }
      ]
    },
    {
      title: 'Scope & Timeline',
      items: [
        { label: 'Meeting Date', value: formatSubmissionMeetingDate(submission) },
        { label: 'Budget', value: getAnswer(submission, 'budgetRange'), type: 'currency' },
        { label: 'Launch Date', value: getAnswer(submission, 'launchDate'), type: 'launch-date' },
        { label: 'Urgency', value: getAnswer(submission, 'urgency'), type: 'label' },
        { label: 'Worked With Agency Before', value: getAnswer(submission, 'workedWithAgency'), type: 'label' }
      ]
    },
    {
      title: 'Competitors & Inspiration',
      items: [
        { label: 'Inspiration Websites', value: getAnswer(submission, 'inspirationSites'), multiline: true },
        { label: 'Competitors', value: getAnswer(submission, 'competitors'), multiline: true }
      ]
    },
    {
      title: 'Technical Setup',
      items: [
        { label: 'Has Domain', value: getAnswer(submission, 'hasDomain'), type: 'label' },
        { label: 'Domain', value: getAnswer(submission, 'domainName') },
        { label: 'Existing Website', value: getAnswer(submission, 'hasExistingWebsite'), type: 'label' },
        { label: 'Existing Website Link', value: getAnswer(submission, 'existingWebsiteLink'), multiline: true }
      ]
    },
    {
      title: 'Support & Optional Services',
      items: [
        { label: 'Support Level', value: getAnswer(submission, 'supportLevel'), type: 'label' },
        { label: 'Optional Services', value: optionalServices, multiline: true }
      ]
    }
  ];

  return `
    <div class="qd-admin-modal-overlay">
      <button class="qd-admin-modal-backdrop" type="button" data-action="close-drawer" aria-label="Close submission details"></button>
      <aside class="qd-admin-drawer" aria-label="Submission detail modal" role="dialog" aria-modal="true">
        <button class="qd-admin-drawer-close qd-admin-drawer-close-floating" type="button" data-action="close-drawer" aria-label="Close">X</button>

        <section class="qd-admin-drawer-hero">
          <div class="qd-admin-drawer-hero-copy">
            <div class="qd-eyebrow qd-admin-kicker">Client Snapshot</div>
            <h2 class="qd-admin-client-name">${escapeHtml(formatValue(businessName))}</h2>
            <div class="qd-admin-client-meta qd-admin-client-meta-inline">
              <span>${escapeHtml(formatValue(businessEmail))}</span>
              <span class="qd-admin-client-meta-separator">•</span>
              <span>${escapeHtml(formatValue(businessPhone))}</span>
            </div>
            <div class="qd-admin-field qd-admin-client-meeting-field">
              <label for="drawer-meeting-date">Meeting date</label>
              <input
                id="drawer-meeting-date"
                class="qd-admin-input"
                type="datetime-local"
                value="${escapeHtml(toDatetimeLocalValue(draft.meetingDateTime ?? getSubmissionMeetingDate(submission)))}"
                data-drawer-field="meetingDateTime"
              >
            </div>
            ${state.copyFeedback ? `<div class="qd-admin-copy-feedback">${escapeHtml(state.copyFeedback)}</div>` : ''}
          </div>
          <div class="qd-chip-row qd-admin-drawer-status-row">
            <span class="qd-status-pill" data-tone="${escapeHtml(statusTone(submission.status))}">${escapeHtml(submission.status)}</span>
            <span class="qd-priority-pill" data-tone="${escapeHtml(priorityTone(submission.priority))}">${escapeHtml(submission.priority)}</span>
            <span class="qd-language-badge" data-language="${escapeHtml(language)}">${escapeHtml(formatLanguage(language))}</span>
          </div>
        </section>

        <section class="qd-admin-drawer-action-strip">
          ${whatsappLink ? `<a class="qd-btn qd-btn-sm qd-admin-action-whatsapp" href="${escapeHtml(whatsappLink)}" target="_blank" rel="noreferrer noopener">WhatsApp</a>` : ''}
          ${callLink
            ? `<a class="qd-btn qd-btn-sm qd-admin-action-call" href="${escapeHtml(callLink)}">Call</a>`
            : '<button class="qd-btn qd-btn-sm qd-admin-action-call is-disabled" type="button" disabled aria-disabled="true">Call</button>'}
          ${mailtoLink ? `<a class="qd-btn qd-btn-sm qd-admin-action-secondary" href="${escapeHtml(mailtoLink)}">Email</a>` : ''}
          ${renderQuoteButton(submission)}
          <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="${draft.editMode ? 'cancel-edit-submission' : 'edit-submission'}">${draft.editMode ? 'Cancel Edit' : 'Edit Submission'}</button>
          <button class="qd-btn qd-btn-sm qd-admin-action-secondary qd-admin-action-accent-outline" type="button" data-action="copy-summary">Copy Summary</button>
          ${submission.status === 'Archived'
            ? '<span class="qd-admin-save-help qd-pipeline-restore-note">To restore this record, choose an active status and save changes.</span>'
            : '<button class="qd-btn qd-btn-sm qd-admin-action-danger" type="button" data-action="archive-submission">Archive</button>'}
          <button class="qd-btn qd-btn-sm qd-admin-action-danger" type="button" data-action="delete-submission">Delete</button>
        </section>

        <section class="qd-admin-meta-grid qd-admin-timeline-strip">
          <div class="qd-admin-detail-item qd-admin-timeline-card">
            <strong>Created</strong>
            <div class="qd-admin-detail-value">${escapeHtml(formatDate(submission.createdAt || submission.submittedAt))}</div>
          </div>
          <div class="qd-admin-detail-item qd-admin-timeline-card">
            <strong>Submitted</strong>
            <div class="qd-admin-detail-value">${escapeHtml(formatDate(submission.submittedAt || submission.createdAt))}</div>
          </div>
          <div class="qd-admin-detail-item qd-admin-timeline-card">
            <strong>Last Updated</strong>
            <div class="qd-admin-detail-value">${escapeHtml(formatDate(submission.lastUpdatedAt || submission.createdAt || submission.submittedAt))}</div>
          </div>
        </section>

      ${state.saveError ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.saveError)}</div>` : ''}

      <section class="qd-admin-drawer-group qd-admin-drawer-admin qd-admin-drawer-admin-controls">
        <div class="qd-admin-drawer-group-head">
          <h3>Admin Controls</h3>
        </div>
        <div class="qd-admin-admin-grid">
          <div class="qd-admin-field">
            <label for="drawer-status">Status</label>
            <select id="drawer-status" class="qd-admin-select" data-drawer-field="status">
              ${statusOptions.map((option) => `
                <option value="${escapeHtml(option)}" ${draft.status === option ? 'selected' : ''}>${escapeHtml(option)}</option>
              `).join('')}
            </select>
          </div>

          <div class="qd-admin-field">
            <label for="drawer-priority">Priority</label>
            <select id="drawer-priority" class="qd-admin-select" data-drawer-field="priority">
              ${priorityOptions.map((option) => `
                <option value="${escapeHtml(option)}" ${draft.priority === option ? 'selected' : ''}>${escapeHtml(option)}</option>
              `).join('')}
            </select>
          </div>

          <div class="qd-admin-field">
            <label for="drawer-notes">Notes</label>
            <textarea id="drawer-notes" class="qd-admin-textarea" data-drawer-field="notes">${escapeHtml(draft.notes || '')}</textarea>
          </div>
        </div>

        <div class="qd-admin-save-row">
          <span class="qd-admin-save-help">Changes update Firestore in place and stamp a new lastUpdatedAt value.</span>
          <button class="qd-btn qd-btn-md qd-admin-action-primary" type="button" data-action="save-drawer" ${state.isSaving ? 'disabled' : ''}>
            ${state.isSaving ? 'Saving...' : draft.editMode ? 'Save submission' : 'Save changes'}
          </button>
        </div>
      </section>

      ${draft.editMode ? `
        <section class="qd-admin-drawer-group qd-admin-drawer-admin">
          <div class="qd-admin-drawer-group-head">
            <h3>Edit Submission Values</h3>
          </div>
          <div class="qd-admin-admin-grid qd-admin-editor-grid">
            ${editableSubmissionFields.map((field) => renderEditableField(field, draft)).join('')}
          </div>
        </section>
      ` : ''}

      ${groupedSections.map((section) => renderDetailSection(section.title, section.items, isArabic)).join('')}
      </aside>
    </div>
  `;
};

try { document.body.classList.toggle('qd-admin-light', localStorage.getItem('qd-admin-theme') === 'light'); } catch {}
const updateThemeToggle = () => {
  const toggle = root.querySelector('[data-action="toggle-theme"]');
  if (!toggle) return;
  const light = document.body.classList.contains('qd-admin-light');
  toggle.textContent = light ? '☾  Dark mode' : '☀  Light mode';
  toggle.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
};

window.addEventListener('storage', (event) => {
  if (event.key !== 'qd-admin-theme' && event.key !== null) return;
  document.body.classList.toggle('qd-admin-light', event.newValue === 'light');
  updateThemeToggle();
});

const renderAppShell = (content) => {
  const userBadge = state.user?.email
    ? `<span class="qd-admin-user-badge">${escapeHtml(state.user.email)}</span>`
    : '';
  const overlays = `
      ${state.adminToast ? `<div class="qd-admin-toast" role="status" aria-live="polite">${escapeHtml(state.adminToast)}</div>` : ''}
      ${renderDrawer()}
      ${renderCardEditor()}
      ${renderDemoEditor()}
      ${renderOutreachEditor()}
      ${renderQuoteDrawer()}
      ${renderQuotationDetailSheet()}
  `;

  if (state.user && isAllowedAdminUser(state.user)) {
    const tabChanged = lastRenderedAdminTab !== state.activeTab;
    lastRenderedAdminTab = state.activeTab;
    return `
      <div class="qd-admin-shell has-nav ${state.navOpen ? 'is-nav-open' : ''}" data-active-tab="${escapeHtml(state.activeTab)}">
        ${renderAdminTabs()}
        <div class="qd-admin-main">
          ${renderAdminMobileBar()}
          <main class="qd-admin-frame qd-admin-view ${tabChanged ? 'is-entering' : ''}" id="qd-admin-main" tabindex="-1">
            ${renderAdminPageHeader()}
            ${content}
          </main>
        </div>
        ${renderAdminBottomBar()}
        ${overlays}
      </div>
    `;
  }

  return `
    <div class="qd-admin-shell">
      <div class="qd-admin-frame">
        <header class="qd-admin-topbar">
          <div class="qd-admin-brand">
            <img src="assets/qd-logo.jpeg" alt="QD Systems">
          </div>

          <div class="qd-admin-topbar-actions">
            ${renderThemeToggle()}
            ${userBadge}
            ${state.user ? '<button class="qd-btn qd-btn-ghost qd-btn-sm" type="button" data-action="logout">Logout</button>' : ''}
          </div>
        </header>

        ${content}
      </div>
      ${overlays}
    </div>
  `;
};

const renderLogin = () => renderAppShell(`
  <section class="qd-admin-login">
    <article class="qd-admin-login-panel">
      <div class="qd-eyebrow qd-admin-kicker">Admin authentication</div>
      <h2>Enter QD OS</h2>
      <p>Sign in with your Firebase email/password account to access realtime submissions, pipeline notes, and client follow-up actions.</p>

      <form class="qd-admin-form-grid" id="admin-login-form">
        <div class="qd-admin-field">
          <label for="admin-email">Email</label>
          <input id="admin-email" class="qd-admin-input" name="email" type="email" placeholder="you@qdsystems.ae" required>
        </div>

        <div class="qd-admin-field">
          <label for="admin-password">Password</label>
          <div class="qd-admin-password-wrap">
            <input id="admin-password" class="qd-admin-input" name="password" type="password" placeholder="**********" autocomplete="current-password" required>
            <button class="qd-admin-password-toggle" type="button" data-action="toggle-password" aria-label="Show password" aria-pressed="false">Show</button>
          </div>
        </div>

        <button class="qd-btn qd-btn-primary qd-btn-md" type="submit" ${state.isLoggingIn ? 'disabled' : ''}>
          ${state.isLoggingIn ? 'Signing in...' : 'Login'}
        </button>
      </form>

      ${state.loginError ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.loginError)}</div>` : ''}
    </article>
  </section>
`);

const renderLoading = (title, message) => renderAppShell(`
  <section class="qd-admin-loading">
    <div>
      <div class="qd-eyebrow qd-admin-kicker">System state</div>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  </section>
`);

const renderAccessDenied = () => renderAppShell(`
  <section class="qd-admin-loading">
    <div>
      <div class="qd-eyebrow qd-admin-kicker">Access control</div>
      <h2>Unauthorized access</h2>
      <p>This account is not allowed to use the admin area.</p>
      <div class="qd-admin-alert is-soft">Current account: ${escapeHtml(state.user?.email || 'Unknown')}</div>
    </div>
  </section>
`);

let chatViewSignature = '';
const render = () => {
  const openPipelineInsights = root.querySelector('[data-pipeline-insights]');
  if (openPipelineInsights) state.pipelineAnalyticsOpen = openPipelineInsights.open;
  const nextModalOpen = Boolean(state.selectedId || state.cardEditor.open || state.demoEditor.open || state.invitationEditor.open || state.outreachEditor.open || state.quoteDrawer.open);
  if (nextModalOpen !== isModalOpen) {
    document.body.classList.toggle('qd-modal-open', nextModalOpen);
    isModalOpen = nextModalOpen;
  }
  document.body.classList.toggle('qd-admin-nav-locked', Boolean(state.navOpen && state.user));

  if (state.authLoading) {
    root.innerHTML = renderLoading('Authenticating', 'Checking your Firebase session and restoring persistence.');
    syncActivitySubscriptions();
    return;
  }

  if (!state.user) {
    root.innerHTML = renderLogin();
    attachLoginFormListener();
    syncActivitySubscriptions();
    return;
  }

  if (!isAllowedAdminUser(state.user)) {
    root.innerHTML = renderAccessDenied();
    syncActivitySubscriptions();
    return;
  }

  // Realtime updates must not tear down the embedded chat session on every render.
  const nextChatSignature = `${state.user.uid}:${state.navOpen}:${document.body.classList.contains('qd-admin-light')}`;
  if (state.activeTab === 'chat' && root.querySelector('#qd-chat-admin-root') && chatViewSignature === nextChatSignature) return;
  chatViewSignature = state.activeTab === 'chat' ? nextChatSignature : '';

  if (state.dataLoading && state.submissions.length === 0) {
    root.innerHTML = renderLoading('Syncing submissions', 'Opening the realtime Firestore listener for projectSubmissions.');
    syncActivitySubscriptions();
    return;
  }

  const keptScroll = [...root.querySelectorAll('[data-keep-scroll]')].map((el) => [el.dataset.keepScroll, el.scrollTop]);
  const focused = document.activeElement;
  const focusKey = focused && root.contains(focused)
    ? ['qline', 'qfield', 'qterm'].map((key) => (focused.dataset?.[key] != null ? `[data-${key}="${focused.dataset[key]}"]` : '')).find(Boolean)
      || (focused.matches?.('[data-qe-picker-search]') ? '[data-qe-picker-search]' : '')
    : '';
  const focusSelection = focusKey && typeof focused.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd] : null;

  const content = state.activeTab === 'chat'
    ? '<div class="qd-chat-embedded"><div id="qd-chat-admin-root"></div></div>'
    : state.activeTab === 'cards'
    ? renderCardsManager()
    : state.activeTab === 'demos'
      ? renderDemosManager()
    : state.activeTab === 'outreach'
      ? renderOutreachManager()
    : state.activeTab === 'pricing'
      ? renderPricingManager()
    : state.activeTab === 'payments'
      ? renderPaymentsManager()
    : state.activeTab === 'collections'
      ? renderSharedBank()
    : state.activeTab === 'activity'
      ? renderActivityManager()
    : state.activeTab === 'overview'
      ? renderOverviewManager()
      : renderDashboard();
  root.innerHTML = renderAppShell(content);
  if (state.activeTab === 'chat') {
    const chatRoot = root.querySelector('#qd-chat-admin-root');
    import('./chat-admin.js').then(module => { if (chatRoot?.isConnected) module.mountChatAdmin(chatRoot); }).catch(error => { if (chatRoot?.isConnected) chatRoot.textContent = `Could not load chat leads: ${error.message}`; });
  }
  keptScroll.forEach(([key, top]) => {
    const el = root.querySelector(`[data-keep-scroll="${key}"]`);
    if (el) el.scrollTop = top;
  });
  if (focusKey) {
    const next = root.querySelector(`#qd-quote-drawer ${focusKey}`) || root.querySelector(focusKey);
    if (next) {
      next.focus({ preventScroll: true });
      if (focusSelection) {
        try { next.setSelectionRange(focusSelection[0], focusSelection[1]); } catch { /* number inputs */ }
      }
    }
  }
  syncActivitySubscriptions();
  mountInvitationQrPreview();
};

const openSubmission = (id) => {
  const submission = state.submissions.find((item) => item.id === id);
  if (!submission) return;
  lastModalOpenedAt = Date.now();
  const didChangeSelection = state.selectedId !== id;
  state.selectedId = id;
  if (didChangeSelection) {
    state.drawerDraft = createDrawerDraft(submission, state.drawerDraft || {});
    state.submissionActivityLoading = true;
    state.submissionActivityError = '';
    state.submissionActivityLogs = [];
  } else if (!state.drawerDraft || state.drawerDraft.id !== id) {
    state.drawerDraft = createDrawerDraft(submission, state.drawerDraft || {});
  }
  state.saveError = '';
  state.copyFeedback = '';
  render();

  if (didChangeSelection) {
    queueMicrotask(() => {
      void logAdminActivity({
      action: 'open_submission',
      targetType: 'submission',
      targetId: submission.id,
      targetLabel: getSubmissionActivityLabel(submission),
      metadata: {
        status: submission.status || 'New',
        priority: submission.priority || 'Normal'
      }
      });
    });
  }
};

const closeDrawer = () => {
  state.selectedId = null;
  state.drawerDraft = null;
  state.saveError = '';
  state.copyFeedback = '';
  render();
};

const setAdminNavOpen = (open) => {
  state.navOpen = Boolean(open);
  render();
  if (state.navOpen) {
    root.querySelector('.qd-admin-sidebar .qd-nav-item.is-active, .qd-admin-sidebar .qd-nav-item')?.focus({ preventScroll: true });
  }
};

const showLoginError = (message) => {
  state.loginError = message;
  render();
};

const clearLoginError = () => {
  if (!state.loginError) return;
  state.loginError = '';
  render();
};

const setLoginLoading = (isLoading) => {
  state.isLoggingIn = isLoading;
  render();
};

const showAdminToast = (message) => {
  state.adminToast = message;
  render();
  clearTimeout(adminToastTimeout);
  adminToastTimeout = setTimeout(() => {
    state.adminToast = '';
    render();
  }, 2200);
};

const handleLogin = async (event) => {
  event.preventDefault();
  const emailInput = document.getElementById('admin-email');
  const passwordInput = document.getElementById('admin-password');
  const email = emailInput?.value?.trim();
  const password = passwordInput?.value;

  if (!emailInput || !passwordInput) {
    console.error('Admin login form inputs not found');
    showLoginError('Enter your email and password.');
    return;
  }

  if (!email || !password) {
    showLoginError('Enter your email and password.');
    return;
  }

  try {
    setLoginLoading(true);
    state.loginError = '';
    state.pendingLoginAudit = true;
    await signInWithEmailAndPassword(auth, email, password);
    clearLoginError();
  } catch (error) {
    state.pendingLoginAudit = false;
    console.error('Login failed:', error);
    showLoginError(error?.message || 'Login failed.');
  } finally {
    setLoginLoading(false);
  }
};

const attachLoginFormListener = () => {
  const loginForm = document.getElementById('admin-login-form');
  const emailInput = document.getElementById('admin-email');
  const passwordInput = document.getElementById('admin-password');

  if (!loginForm || !emailInput || !passwordInput) {
    console.error('Admin login form inputs not found');
    return;
  }

  if (loginForm.dataset.bound === 'true') return;

  loginForm.addEventListener('submit', handleLogin);
  loginForm.dataset.bound = 'true';
};

const handleLogout = async () => {
  try {
    await logAdminActivity({
      action: 'logout',
      targetType: 'session',
      targetId: state.user?.uid || '',
      targetLabel: state.user?.email || 'Admin session'
    });
    await signOut(auth);
  } catch (error) {
    state.dataError = error?.message || 'Could not sign out right now.';
    render();
  }
};

const subscribeToSubmissions = () => {
  if (unsubscribeSnapshot) {
    unsubscribeSnapshot();
    unsubscribeSnapshot = null;
  }

  state.dataLoading = true;
  state.dataError = '';
  render();

  const submissionsRef = collection(db, 'projectSubmissions');
  const orderedQuery = query(submissionsRef, orderBy('createdAt', 'desc'));

  const startListener = (source) => {
    unsubscribeSnapshot = onSnapshot(
      source,
      (snapshot) => {
        state.submissions = sortSubmissions(snapshot.docs.map(hydrateSubmission));
        state.dataLoading = false;

        if (state.selectedId && !state.submissions.some((item) => item.id === state.selectedId)) {
          state.selectedId = null;
          state.drawerDraft = null;
        } else if (state.selectedId) {
          const fresh = getSelectedSubmission();
          if (fresh) {
            state.drawerDraft = createDrawerDraft(fresh, state.drawerDraft);
          }
        }

        render();
      },
      (error) => {
        if (source === orderedQuery) {
          startListener(submissionsRef);
          return;
        }

        state.dataLoading = false;
        state.dataError = error?.message || 'Unable to read Firestore submissions.';
        render();
      }
    );
  };

  startListener(orderedQuery);
};

const subscribeToCards = () => {
  if (unsubscribeCardsSnapshot) {
    unsubscribeCardsSnapshot();
    unsubscribeCardsSnapshot = null;
  }

  state.cardsLoading = true;
  state.cardsError = '';
  render();

  const cardsRef = collection(db, 'cards');
  const orderedQuery = query(cardsRef, orderBy('createdAt', 'desc'));

  const startListener = (source) => {
    unsubscribeCardsSnapshot = onSnapshot(
      source,
      (snapshot) => {
        state.cards = snapshot.docs.map(hydrateCard);
        state.cardsLoading = false;
        render();
      },
      (error) => {
        if (source === orderedQuery) {
          startListener(cardsRef);
          return;
        }

        state.cardsLoading = false;
        state.cardsError = error?.message || 'Unable to read Firestore cards.';
        render();
      }
    );
  };

  startListener(orderedQuery);
};

const subscribeToDemos = () => {
  if (unsubscribeDemosSnapshot) {
    unsubscribeDemosSnapshot();
    unsubscribeDemosSnapshot = null;
  }

  state.demosLoading = true;
  state.demosError = '';
  render();

  const demosRef = collection(db, 'clientDemos');
  const orderedQuery = query(demosRef, orderBy('createdAt', 'desc'));
  let permissionRetryCount = 0;

  const startListener = (source) => {
    unsubscribeDemosSnapshot = onSnapshot(
      source,
      (snapshot) => {
        state.demos = snapshot.docs.map(hydrateDemo);
        state.demosLoading = false;
        state.demosError = '';
        permissionRetryCount = 0;
        if (state.demoEditor.open && state.demoEditor.id) {
          const fresh = state.demos.find((item) => item.id === state.demoEditor.id);
          if (fresh && !state.demoEditor.isSaving) {
            state.demoEditor.original = deepCloneForLog(getDemoLogState(fresh));
            state.demoEditor.draft = {
              ...createEmptyDemoDraft(),
              ...fresh,
              expiresAt: fresh.expiresAt ? new Date(getTimestampMs(fresh.expiresAt)).toISOString().slice(0, 10) : '',
              passcode: ''
            };
          }
        }
        render();
      },
      async (error) => {
        if (isPermissionDeniedError(error) && permissionRetryCount < 1) {
          permissionRetryCount += 1;
          const refreshed = await ensureAdminFirestoreSession();
          if (refreshed) {
            startListener(source);
            return;
          }
        }

        if (source === orderedQuery) {
          startListener(demosRef);
          return;
        }

        state.demosLoading = false;
        state.demosError = error?.message || 'Unable to read client demos.';
        render();
      }
    );
  };

  startListener(orderedQuery);
};

const openDemoEditor = (mode, demo = null) => {
  lastModalOpenedAt = Date.now();
  const draft = demo
    ? {
        ...createEmptyDemoDraft(),
        ...demo,
        expiresAt: demo.expiresAt ? new Date(getTimestampMs(demo.expiresAt)).toISOString().slice(0, 10) : '',
        passcode: ''
      }
    : createEmptyDemoDraft();

  state.demoEditor = {
    open: true,
    mode,
    id: demo?.id || null,
    draft,
    original: demo ? deepCloneForLog(getDemoLogState(demo)) : null,
    slugState: { status: 'idle', message: 'Use lowercase letters, numbers, and hyphens only.' },
    slugTouched: Boolean(demo?.slug),
    isSaving: false,
    deployLoading: false,
    error: ''
  };
  render();
};

const closeDemoEditor = () => {
  state.demoEditor = {
    open: false,
    mode: 'create',
    id: null,
    draft: null,
    original: null,
    slugState: { status: 'idle', message: '' },
    slugTouched: false,
    isSaving: false,
    deployLoading: false,
    error: ''
  };
  render();
};

const captureDemoEditorDraftFromDom = () => {
  const form = document.getElementById('demo-editor-form');
  const current = getDemoEditorDraftFromState();
  if (!form) return current;

  return {
    ...current,
    title: form.elements.title?.value?.trim() || '',
    clientName: form.elements.clientName?.value?.trim() || '',
    slug: slugifyCardValue(form.elements.slug?.value || ''),
    demoUrl: form.elements.demoUrl?.value?.trim() || '',
    githubRepoUrl: form.elements.githubRepoUrl?.value?.trim() || '',
    vercelProjectUrl: form.elements.vercelProjectUrl?.value?.trim() || '',
    vercelPreviewUrl: form.elements.vercelPreviewUrl?.value?.trim() || '',
    deployHookUrl: form.elements.deployHookUrl?.value?.trim() || '',
    passcode: form.elements.passcode?.value || '',
    status: DEMO_STATUS_OPTIONS.includes(form.elements.status?.value) ? form.elements.status.value : 'draft',
    notes: form.elements.notes?.value?.trim() || '',
    expiresAt: form.elements.expiresAt?.value || ''
  };
};

const ensureDemoEditorData = () => {
  const draft = captureDemoEditorDraftFromDom();
  state.demoEditor.draft = draft;
  return draft;
};

// Keep the browser hash and API verification in sync: UTF-8 string -> SHA-256 -> lowercase hex.
const sha256 = async (value) => {
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const setDemoSlugState = (status, message) => {
  state.demoEditor.slugState = { status, message };
  const hint = document.getElementById('demo-slug-hint');
  const input = document.getElementById('demo-slug');
  if (hint) {
    hint.textContent = message;
    hint.classList.remove('is-valid', 'is-invalid', 'is-checking');
    if (status === 'valid' || status === 'invalid' || status === 'checking') hint.classList.add(`is-${status}`);
  }
  if (input) {
    input.classList.remove('is-valid', 'is-invalid', 'is-checking');
    if (status === 'valid' || status === 'invalid' || status === 'checking') input.classList.add(`is-${status}`);
  }
};

const validateDemoSlug = async (slug, { silent = false } = {}) => {
  const normalized = slugifyCardValue(slug);
  if (!normalized) {
    if (!silent) setDemoSlugState('invalid', 'Slug is required.');
    return false;
  }

  if (normalized !== slug) {
    if (!silent) setDemoSlugState('invalid', 'Use lowercase letters, numbers, and hyphens only.');
    return false;
  }

  if (!silent) setDemoSlugState('checking', 'Checking slug availability...');
  const demosRef = collection(db, 'clientDemos');
  const slugQuery = query(demosRef, where('slug', '==', normalized), limit(2));
  const snapshot = await getDocs(slugQuery);
  const conflict = snapshot.docs.find((item) => item.id !== state.demoEditor.id);

  if (conflict) {
    if (!silent) setDemoSlugState('invalid', 'That demo link is already in use.');
    return false;
  }

  if (!silent) setDemoSlugState('valid', 'Demo link is available.');
  return true;
};

const buildDemoExpiryTimestamp = (value) => {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59.999`);
  if (Number.isNaN(date.getTime())) return null;
  return Timestamp.fromDate(date);
};

const saveDemoEditor = async () => {
  const draft = ensureDemoEditorData();

  if (!draft.title || !draft.clientName || !draft.slug || !draft.demoUrl) {
    state.demoEditor.error = 'Demo title, client name, slug, and preview URL are required.';
    render();
    return;
  }

  if (state.demoEditor.mode !== 'edit' && !draft.passcode) {
    state.demoEditor.error = 'Passcode is required for new demos.';
    render();
    return;
  }

  const isSlugValid = await validateDemoSlug(draft.slug, { silent: false });
  if (!isSlugValid) return;

  state.demoEditor.isSaving = true;
  state.demoEditor.error = '';
  render();

  try {
    const existing = getDemoById(state.demoEditor.id) || {};
    const passcodeHash = draft.passcode ? await sha256(draft.passcode) : existing.passcodeHash || draft.passcodeHash || '';
    const payload = {
      title: draft.title,
      clientName: draft.clientName,
      slug: draft.slug,
      demoUrl: draft.demoUrl,
      githubRepoUrl: draft.githubRepoUrl || '',
      vercelProjectUrl: draft.vercelProjectUrl || '',
      vercelPreviewUrl: draft.vercelPreviewUrl || '',
      deployHookUrl: draft.deployHookUrl || '',
      passcodeHash,
      status: DEMO_STATUS_OPTIONS.includes(draft.status) ? draft.status : 'draft',
      notes: draft.notes || '',
      expiresAt: buildDemoExpiryTimestamp(draft.expiresAt),
      viewCount: Number(existing.viewCount || draft.viewCount || 0),
      lastViewedAt: existing.lastViewedAt || draft.lastViewedAt || null,
      createdBy: existing.createdBy || state.user?.email || '',
      updatedBy: state.user?.email || '',
      updatedAt: serverTimestamp()
    };

    if (state.demoEditor.mode === 'edit' && state.demoEditor.id) {
      await updateDoc(doc(db, 'clientDemos', state.demoEditor.id), payload);
      const changeSet = buildChangedMetadata(state.demoEditor.original || {}, getDemoLogState({ ...existing, ...payload }));
      if (changeSet.changedFields.length) {
        await logAdminActivity({
          action: 'edit_demo',
          targetType: 'demo',
          targetId: state.demoEditor.id,
          targetLabel: draft.title || draft.slug || state.demoEditor.id,
          metadata: changeSet
        });
      }
      showAdminToast(`Saved ${draft.slug}`);
    } else {
      const demoRef = await addDoc(collection(db, 'clientDemos'), {
        ...payload,
        createdAt: serverTimestamp()
      });
      await logAdminActivity({
        action: 'create_demo',
        targetType: 'demo',
        targetId: demoRef.id,
        targetLabel: draft.title || draft.slug || demoRef.id,
        metadata: {
          changedFields: Object.keys(getDemoLogState(payload)),
          after: getDemoLogState(payload)
        }
      });
      showAdminToast(`Created ${draft.slug}`);
    }

    closeDemoEditor();
  } catch (error) {
    state.demoEditor.isSaving = false;
    state.demoEditor.error = error?.message || 'Could not save the client demo.';
    render();
  }
};

const copyDemoLink = async (demo) => {
  await navigator.clipboard.writeText(getDemoPublicUrl(demo.slug));
  showAdminToast('Demo link copied.');
};

const openDemoAdmin = async (demo) => {
  window.open(demo.demoUrl, '_blank', 'noopener,noreferrer');
  await logAdminActivity({
    action: 'open_demo_admin',
    targetType: 'demo',
    targetId: demo.id,
    targetLabel: getDemoActivityLabel(demo)
  });
};

const toggleDemoStatus = async (demo) => {
  const nextStatus = getDemoStatus(demo) === 'disabled' ? 'active' : 'disabled';
  await updateDoc(doc(db, 'clientDemos', demo.id), {
    status: nextStatus,
    updatedBy: state.user?.email || '',
    updatedAt: serverTimestamp()
  });
  await logAdminActivity({
    action: nextStatus === 'disabled' ? 'disable_demo' : 'enable_demo',
    targetType: 'demo',
    targetId: demo.id,
    targetLabel: getDemoActivityLabel(demo)
  });
  showAdminToast(nextStatus === 'disabled' ? `Disabled ${demo.slug}` : `Enabled ${demo.slug}`);
};

const deleteDemoRecord = async (demo) => {
  const confirmed = window.confirm(`Delete the client demo "${demo.title || demo.slug}"?`);
  if (!confirmed) return;
  await deleteDoc(doc(db, 'clientDemos', demo.id));
  await logAdminActivity({
    action: 'delete_demo',
    targetType: 'demo',
    targetId: demo.id,
    targetLabel: getDemoActivityLabel(demo)
  });
  showAdminToast(`Deleted ${demo.slug}`);
};

const triggerDemoDeploy = async (demo) => {
  if (!demo?.id) return;

  state.demoEditor.deployLoading = true;
  state.demoEditor.error = '';
  render();

  try {
    const token = await state.user?.getIdToken();
    const response = await fetch('/api/demo-deploy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ demoId: demo.id })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.triggered !== true) {
      throw new Error(payload?.error || 'Could not trigger demo rebuild.');
    }
    await logAdminActivity({
      action: 'trigger_demo_deploy',
      targetType: 'demo',
      targetId: demo.id,
      targetLabel: getDemoActivityLabel(demo)
    });
    showAdminToast('Deploy hook triggered.');
  } catch (error) {
    state.demoEditor.error = error?.message || 'Could not trigger demo rebuild.';
  } finally {
    state.demoEditor.deployLoading = false;
    render();
  }
};

const subscribeToInvitations = () => {
  if (unsubscribeInvitationsSnapshot) {
    unsubscribeInvitationsSnapshot();
    unsubscribeInvitationsSnapshot = null;
  }

  state.invitationsLoading = true;
  state.invitationsError = '';
  render();

  const invitationsRef = collection(db, INVITATIONS_COLLECTION);
  const orderedQuery = query(invitationsRef, orderBy('createdAt', 'desc'));

  const startListener = (source) => {
    unsubscribeInvitationsSnapshot = onSnapshot(
      source,
      (snapshot) => {
        state.invitations = snapshot.docs.map(hydrateInvitation);
        state.invitationsLoading = false;
        if (state.invitationEditor.open && state.invitationEditor.id) {
          const fresh = state.invitations.find((item) => item.id === state.invitationEditor.id);
          if (fresh && !state.invitationEditor.isSaving) {
            state.invitationEditor.original = fresh;
            if (!state.invitationEditor.isSaving) {
              state.invitationEditor.draft = {
                ...createEmptyInvitationDraft(),
                ...fresh
              };
            }
          }
        }
        render();
      },
      (error) => {
        if (source === orderedQuery) {
          startListener(invitationsRef);
          return;
        }

        state.invitationsLoading = false;
        state.invitationsError = error?.message || 'Unable to read wedding invitations.';
        render();
      }
    );
  };

  startListener(orderedQuery);
};

const subscribeToOutreachLeads = () => {
  if (unsubscribeOutreachSnapshot) {
    unsubscribeOutreachSnapshot();
    unsubscribeOutreachSnapshot = null;
  }

  state.outreachLoading = true;
  state.outreachError = '';
  render();

  const outreachRef = collection(db, 'businessOutreachLeads');
  const orderedQuery = query(outreachRef, orderBy('createdAt', 'desc'));

  const startListener = (source) => {
    unsubscribeOutreachSnapshot = onSnapshot(
      source,
      (snapshot) => {
        state.outreachLeads = snapshot.docs.map(hydrateOutreachLead);
        state.outreachLoading = false;
        if (state.outreachEditor.open && state.outreachEditor.id) {
          const fresh = state.outreachLeads.find((item) => item.id === state.outreachEditor.id);
          if (fresh && !state.outreachEditor.isSaving) {
            state.outreachEditor.original = deepCloneForLog(getOutreachLeadLogState(fresh));
            state.outreachEditor.draft = {
              ...createEmptyOutreachLeadDraft(),
              ...fresh
            };
          }
        }
        render();
      },
      (error) => {
        if (source === orderedQuery) {
          startListener(outreachRef);
          return;
        }

        state.outreachLoading = false;
        state.outreachError = error?.message || 'Unable to read outreach leads.';
        render();
      }
    );
  };

  startListener(orderedQuery);
};

const openOutreachEditor = (mode, lead = null) => {
  lastModalOpenedAt = Date.now();
  const draft = lead
    ? { ...createEmptyOutreachLeadDraft(), ...lead }
    : createEmptyOutreachLeadDraft();

  state.outreachEditor = {
    open: true,
    mode,
    id: lead?.id || null,
    draft,
    original: lead ? deepCloneForLog(getOutreachLeadLogState(lead)) : null,
    isSaving: false,
    mapsLoading: false,
    mapsError: '',
    mapsUrl: '',
    error: ''
  };
  render();
};

const closeOutreachEditor = () => {
  state.outreachEditor = {
    open: false,
    mode: 'create',
    id: null,
    draft: null,
    original: null,
    isSaving: false,
    mapsLoading: false,
    mapsError: '',
    mapsUrl: '',
    error: ''
  };
  render();
};

const captureOutreachDraftFromDom = () => {
  const form = document.getElementById('outreach-editor-form');
  if (!form) return getOutreachEditorDraftFromState();

  const websiteUrl = form.elements.websiteUrl?.value?.trim() || '';
  return {
    ...getOutreachEditorDraftFromState(),
    businessName: form.elements.businessName?.value?.trim() || '',
    ownerName: form.elements.ownerName?.value?.trim() || '',
    phoneNumber: sanitizePhoneValue(form.elements.phoneNumber?.value || ''),
    hasWebsite: websiteUrl ? 'yes' : 'no',
    websiteUrl,
    meetingDateTime: form.elements.meetingDateTime?.value || '',
    meetingLocation: form.elements.meetingLocation?.value?.trim() || '',
    notes: form.elements.notes?.value?.trim() || '',
    status: OUTREACH_STATUS_OPTIONS.some((option) => option.value === form.elements.status?.value)
      ? form.elements.status.value
      : 'visit_them'
  };
};

const ensureOutreachEditorData = () => {
  const draft = captureOutreachDraftFromDom();
  state.outreachEditor.draft = draft;
  return draft;
};

const importOutreachLeadToSubmissions = async (lead, { suppressToast = false } = {}) => {
  if (lead.importedSubmissionId) {
    showAdminToast('Already imported to pipeline.');
    return lead.importedSubmissionId;
  }

  const payload = {
    businessName: lead.businessName,
    businessPhone: sanitizePhoneValue(lead.phoneNumber),
    businessEmail: '',
    industry: '',
    businessDescription: '',
    answers: {
      businessName: lead.businessName,
      businessPhone: sanitizePhoneValue(lead.phoneNumber),
      hasExistingWebsite: lead.hasWebsite === 'yes' ? 'yes' : 'no',
      existingWebsiteLink: lead.websiteUrl || '',
      ownerName: lead.ownerName,
      meetingDateTime: lead.meetingDateTime || ''
    },
    hasExistingWebsite: lead.hasWebsite === 'yes' ? 'yes' : 'no',
    existingWebsiteLink: lead.websiteUrl || '',
    meetingDateTime: lead.meetingDateTime || '',
    status: 'Contacted',
    priority: 'Normal',
    notes: [
      'Imported from manual business outreach.',
      `Owner: ${lead.ownerName}`,
      lead.hasWebsite === 'yes' && lead.websiteUrl ? `Website: ${lead.websiteUrl}` : 'No existing website.',
      `Outreach lead ID: ${lead.id}`
    ].filter(Boolean).join('\n'),
    source: 'manual_outreach',
    importedFrom: 'businessOutreachLeads',
    importedOutreachLeadId: lead.id,
    language: 'en',
    createdAt: serverTimestamp(),
    submittedAt: serverTimestamp(),
    lastUpdatedAt: serverTimestamp(),
    selectedMainPurpose: '',
    selectedRequiredFeatures: '',
    selectedOptionalServices: ''
  };

  const submissionRef = await addDoc(collection(db, 'projectSubmissions'), payload);

  await updateDoc(doc(db, 'businessOutreachLeads', lead.id), {
    importedSubmissionId: submissionRef.id,
    importedAt: serverTimestamp(),
    importedFrom: 'businessOutreachLeads',
    updatedAt: serverTimestamp()
  });

  await logAdminActivity({
    action: 'import_outreach_lead',
    targetType: 'submission',
    targetId: submissionRef.id,
    targetLabel: getOutreachLeadActivityLabel(lead),
    metadata: {
      outreachLeadId: lead.id,
      ownerName: lead.ownerName,
      phoneNumber: lead.phoneNumber
    }
  });

  if (!suppressToast) {
    showAdminToast(`${lead.businessName} imported to pipeline.`);
  }
  return submissionRef.id;
};

const saveOutreachLeadEditor = async () => {
  const draft = ensureOutreachEditorData();

  if (!draft.businessName?.trim()) {
    state.outreachEditor.error = 'Business name is required.';
    render();
    return;
  }
  const cleanPhone = sanitizePhoneValue(draft.phoneNumber || '');
  const cleanWebsiteUrl = draft.websiteUrl?.trim() || '';
  if (!cleanPhone) {
    state.outreachEditor.error = 'Phone number is required.';
    render();
    return;
  }
  if (cleanWebsiteUrl) {
    try {
      new URL(cleanWebsiteUrl);
    } catch {
      state.outreachEditor.error = 'Please enter a valid website URL.';
      render();
      return;
    }
  }

  state.outreachEditor.isSaving = true;
  state.outreachEditor.error = '';
  render();

  try {
    let resultId = state.outreachEditor.id;
    const payload = {
      businessName: draft.businessName.trim(),
      ownerName: draft.ownerName.trim(),
      phoneNumber: cleanPhone,
      hasWebsite: cleanWebsiteUrl ? 'yes' : 'no',
      websiteUrl: cleanWebsiteUrl,
      meetingDateTime: draft.meetingDateTime || '',
      meetingLocation: draft.meetingLocation?.trim() || '',
      notes: draft.notes?.trim() || '',
      status: draft.status,
      updatedAt: serverTimestamp()
    };

    if (state.outreachEditor.mode === 'edit' && state.outreachEditor.id) {
      const existing = getOutreachLeadById(state.outreachEditor.id) || {};
      await updateDoc(doc(db, 'businessOutreachLeads', state.outreachEditor.id), payload);
      const nextLead = { ...existing, ...payload };
      const changeSet = buildChangedMetadata(state.outreachEditor.original || {}, getOutreachLeadLogState(nextLead));
      const changedWithoutStatus = changeSet.changedFields.filter((field) => field !== 'status');

      if (changedWithoutStatus.length) {
        await logAdminActivity({
          action: 'edit_outreach_lead',
          targetType: 'outreach_lead',
          targetId: state.outreachEditor.id,
          targetLabel: getOutreachLeadActivityLabel(payload),
          metadata: changeSet
        });
      }

      if (changeSet.changedFields.includes('status')) {
        await logAdminActivity({
          action: 'change_outreach_status',
          targetType: 'outreach_lead',
          targetId: state.outreachEditor.id,
          targetLabel: getOutreachLeadActivityLabel(payload),
          metadata: {
            changedFields: ['status'],
            before: { status: state.outreachEditor.original?.status || existing.status || 'visit_them' },
            after: { status: payload.status }
          }
        });
      }

      showAdminToast(`Saved ${payload.businessName}`);
    } else {
      const docRef = await addDoc(collection(db, 'businessOutreachLeads'), {
        ...payload,
        importedSubmissionId: '',
        importedAt: null,
        importedFrom: '',
        createdBy: state.user?.email || '',
        createdAt: serverTimestamp()
      });
      resultId = docRef.id;
      await logAdminActivity({
        action: 'create_outreach_lead',
        targetType: 'outreach_lead',
        targetId: docRef.id,
        targetLabel: getOutreachLeadActivityLabel(payload),
        metadata: { status: payload.status, ownerName: payload.ownerName }
      });
      showAdminToast(`Created ${payload.businessName}`);
    }

    const existingLead = getOutreachLeadById(resultId) || {};
    const savedLead = {
      ...existingLead,
      ...draft,
      ...payload,
      id: resultId,
      importedSubmissionId: existingLead.importedSubmissionId || draft.importedSubmissionId || '',
      importedAt: existingLead.importedAt || draft.importedAt || null,
      importedFrom: existingLead.importedFrom || draft.importedFrom || ''
    };

    if (savedLead.status === 'confirmed' && !savedLead.importedSubmissionId) {
      await importOutreachLeadToSubmissions(savedLead, { suppressToast: true });
      showAdminToast('Lead confirmed and imported to pipeline.');
    }

    closeOutreachEditor();
  } catch (error) {
    state.outreachEditor.isSaving = false;
    state.outreachEditor.error = error?.message || 'Could not save the outreach lead.';
    render();
  }
};

const toggleOutreachLeadStar = async (lead) => {
  if (!lead?.id) return;
  const nextStarred = !isOutreachLeadStarred(lead);
  await updateDoc(doc(db, 'businessOutreachLeads', lead.id), {
    starred: nextStarred,
    updatedAt: serverTimestamp()
  });
  showAdminToast(nextStarred ? 'Lead starred' : 'Star removed');
};

const updateOutreachLeadStatus = async (lead, nextStatus) => {
  if (!lead?.id || lead.status === nextStatus) return;
  await updateDoc(doc(db, 'businessOutreachLeads', lead.id), {
    status: nextStatus,
    updatedAt: serverTimestamp()
  });

  await logAdminActivity({
    action: 'change_outreach_status',
    targetType: 'outreach_lead',
    targetId: lead.id,
    targetLabel: getOutreachLeadActivityLabel(lead),
    metadata: {
      changedFields: ['status'],
      before: { status: lead.status },
      after: { status: nextStatus }
    }
  });

  if (nextStatus === 'confirmed' && !lead.importedSubmissionId) {
    await importOutreachLeadToSubmissions({ ...lead, status: nextStatus }, { suppressToast: true });
    showAdminToast('Lead confirmed and imported to pipeline.');
    return;
  }

  showAdminToast(`Status changed to ${getOutreachStatusLabel(nextStatus)}`);
};

const deleteOutreachLead = async (lead) => {
  const confirmed = window.confirm(`Delete outreach lead "${lead.businessName || lead.ownerName}"?`);
  if (!confirmed) return;
  await deleteDoc(doc(db, 'businessOutreachLeads', lead.id));
  await logAdminActivity({
    action: 'delete_outreach_lead',
    targetType: 'outreach_lead',
    targetId: lead.id,
    targetLabel: getOutreachLeadActivityLabel(lead),
    metadata: { status: lead.status, ownerName: lead.ownerName }
  });
  showAdminToast(`Deleted ${lead.businessName}`);
};

const getInvitationById = (id) => state.invitations.find((invitation) => invitation.id === id) || null;

const stopInvitationRsvpsSubscription = () => {
  if (unsubscribeInvitationRsvpsSnapshot) {
    unsubscribeInvitationRsvpsSnapshot();
    unsubscribeInvitationRsvpsSnapshot = null;
  }
  currentInvitationRsvpsTargetId = null;
  state.invitationRsvpsLoading = false;
  state.invitationRsvpsError = '';
  state.invitationRsvps = [];
};

const subscribeToInvitationRsvps = (invitationId) => {
  if (!invitationId) {
    stopInvitationRsvpsSubscription();
    return;
  }
  if (currentInvitationRsvpsTargetId === invitationId && unsubscribeInvitationRsvpsSnapshot) return;

  state.invitationRsvpsLoading = true;
  state.invitationRsvpsError = '';
  state.invitationRsvps = [];
  currentInvitationRsvpsTargetId = invitationId;

  const rsvpRef = collection(db, INVITATION_RSVPS_COLLECTION);
  const rsvpQuery = query(rsvpRef, where('inviteId', '==', invitationId), limit(250));
  unsubscribeInvitationRsvpsSnapshot = onSnapshot(
    rsvpQuery,
    (snapshot) => {
      state.invitationRsvps = snapshot.docs
        .map(hydrateInvitationRsvp)
        .sort((a, b) => (getTimestampMs(b.createdAt) || 0) - (getTimestampMs(a.createdAt) || 0));
      state.invitationRsvpsLoading = false;
      state.invitationRsvpsError = '';
      if (state.invitationEditor.open && state.invitationEditor.id === invitationId) render();
    },
    (error) => {
      state.invitationRsvpsLoading = false;
      if (isAdminDevHost()) {
        console.warn('[invitation-rsvps] query failed:', error);
      }
      state.invitationRsvpsError = 'Could not load RSVPs right now.';
      if (state.invitationEditor.open && state.invitationEditor.id === invitationId) render();
    }
  );
};

const openInvitationEditor = (mode, invitation = null) => {
  lastModalOpenedAt = Date.now();
  const draft = invitation
    ? { ...createEmptyInvitationDraft(), ...invitation }
    : createEmptyInvitationDraft();

  state.invitationRsvpFilters = {
    search: '',
    phone: '',
    attending: 'all',
    sort: 'newest'
  };

  state.invitationEditor = {
    open: true,
    mode,
    id: invitation?.id || null,
    draft,
    original: invitation ? { ...invitation } : null,
    slugState: { status: 'idle', message: 'Use lowercase letters, numbers, and hyphens only.' },
    slugTouched: Boolean(invitation?.slug),
    isSaving: false,
    error: ''
  };

  if (invitation?.id) {
    subscribeToInvitationRsvps(invitation.id);
  } else {
    stopInvitationRsvpsSubscription();
  }

  render();
};

const closeInvitationEditor = () => {
  state.invitationEditor = {
    open: false,
    mode: 'create',
    id: null,
    draft: null,
    original: null,
    slugState: { status: 'idle', message: '' },
    slugTouched: false,
    isSaving: false,
    error: ''
  };
  stopInvitationRsvpsSubscription();
  render();
};

const parseInvitationGalleryInput = (value) => String(value || '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const validateInvitationMediaPaths = (draft) => {
  const coverImageUrl = String(draft.coverImageUrl || '').trim();
  const musicUrl = String(draft.musicUrl || '').trim();
  const gallery = parseInvitationGalleryInput(
    Array.isArray(draft.gallery) ? draft.gallery.join('\n') : draft.gallery
  );

  if (coverImageUrl && !isValidInvitationMediaPath(coverImageUrl)) {
    return 'Media paths must start with /assets/ or https://';
  }
  if (musicUrl && !isValidInvitationMediaPath(musicUrl)) {
    return 'Media paths must start with /assets/ or https://';
  }
  for (const path of gallery) {
    if (!isValidInvitationMediaPath(path)) {
      return 'Media paths must start with /assets/ or https://';
    }
  }
  return '';
};

const captureInvitationDraftFromDom = () => {
  const form = document.getElementById('invitation-editor-form');
  if (!form) return getInvitationEditorDraftFromState();

  const rawStatus = form.querySelector('[name="status"]')?.value || 'draft';
  const normalizedStatus = INVITE_STATUS_OPTIONS.includes(rawStatus) ? rawStatus : 'draft';
  return {
    ...getInvitationEditorDraftFromState(),
    brideName: form.querySelector('[name="brideName"]')?.value?.trim() || '',
    groomName: form.querySelector('[name="groomName"]')?.value?.trim() || '',
    eventTitle: form.querySelector('[name="eventTitle"]')?.value?.trim() || 'Wedding Invitation',
    slug: slugifyCardValue(form.querySelector('[name="slug"]')?.value || ''),
    eventDate: form.querySelector('[name="eventDate"]')?.value || '',
    eventTime: form.querySelector('[name="eventTime"]')?.value || '',
    venueName: form.querySelector('[name="venueName"]')?.value?.trim() || '',
    venueAddress: form.querySelector('[name="venueAddress"]')?.value?.trim() || '',
    mapUrl: form.querySelector('[name="mapUrl"]')?.value?.trim() || '',
    languageDefault: form.querySelector('[name="languageDefault"]')?.value === 'ar' ? 'ar' : 'en',
    theme: INVITE_THEME_OPTIONS.includes(form.querySelector('[name="theme"]')?.value) ? form.querySelector('[name="theme"]')?.value : 'royal-gold',
    whatsappNumber: normalizeWhatsappAdminNumber(form.querySelector('[name="whatsappNumber"]')?.value || ''),
    rsvpEnabled: Boolean(form.querySelector('[name="rsvpEnabled"]')?.checked),
    rsvpDeadline: form.querySelector('[name="rsvpDeadline"]')?.value || '',
    active: normalizedStatus === 'active',
    status: normalizedStatus,
    coupleDisplayName: form.querySelector('[name="coupleDisplayName"]')?.value?.trim() || '',
    coverImageUrl: form.querySelector('[name="coverImageUrl"]')?.value?.trim() || '',
    musicUrl: form.querySelector('[name="musicUrl"]')?.value?.trim() || '',
    gallery: parseInvitationGalleryInput(form.querySelector('[name="galleryPaths"]')?.value || ''),
    features: {
      ...createDefaultInvitationFeatures(),
      ...(getInvitationEditorDraftFromState().features || {})
    }
  };
};

const ensureInvitationEditorData = () => {
  const draft = captureInvitationDraftFromDom();
  draft.coupleDisplayName = draft.coupleDisplayName || deriveInvitationDisplayName(draft);
  state.invitationEditor.draft = draft;
  return draft;
};

const writeInvitationPreviewUrl = (slug) => {
  const preview = document.getElementById('invitation-preview-url');
  const url = buildInvitationPreviewUrl(slug);
  if (preview) preview.textContent = url;
  const qrWrap = document.getElementById('invitation-qr-preview');
  if (qrWrap) {
    qrWrap.dataset.inviteUrl = url;
    delete qrWrap.dataset.mounted;
    qrWrap.innerHTML = '';
    mountInvitationQrPreview();
  }
};

const setInvitationSlugState = (status, message) => {
  state.invitationEditor.slugState = { status, message };
  const hint = document.getElementById('invite-slug-hint');
  const input = document.getElementById('invite-slug');
  if (hint) hint.textContent = message;
  if (input) {
    input.classList.remove('is-valid', 'is-invalid');
    if (status === 'valid') input.classList.add('is-valid');
    if (status === 'invalid') input.classList.add('is-invalid');
  }
};

const validateInvitationSlug = async (slug, { silent = false } = {}) => {
  const normalized = slugifyCardValue(slug);
  if (!normalized) {
    if (!silent) setInvitationSlugState('invalid', 'Enter a URL-safe slug for this invitation.');
    return false;
  }

  if (normalized !== slug) {
    if (!silent) setInvitationSlugState('invalid', 'Slug must use lowercase letters, numbers, and hyphens only.');
    return false;
  }

  if (!silent) setInvitationSlugState('checking', 'Checking slug availability...');
  const invitationsRef = collection(db, INVITATIONS_COLLECTION);
  const slugQuery = query(invitationsRef, where('slug', '==', normalized), limit(2));
  const snapshot = await getDocs(slugQuery);
  const conflict = snapshot.docs.find((item) => item.id !== state.invitationEditor.id);

  if (conflict) {
    if (!silent) setInvitationSlugState('invalid', 'That invitation link is already taken.');
    return false;
  }

  if (!silent) setInvitationSlugState('valid', 'Invitation link is available.');
  return true;
};

const isAdminDevHost = () => {
  try {
    const { hostname } = window.location;
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

const saveInvitationEditor = async () => {
  const draft = ensureInvitationEditorData();

  if (!draft.brideName || !draft.groomName || !draft.slug || !draft.eventDate || !draft.venueName) {
    state.invitationEditor.error = 'Bride name, groom name, slug, event date, and venue name are required.';
    render();
    return;
  }

  const mediaPathError = validateInvitationMediaPaths(draft);
  if (mediaPathError) {
    state.invitationEditor.error = mediaPathError;
    render();
    return;
  }

  const isSlugValid = await validateInvitationSlug(draft.slug, { silent: false });
  if (!isSlugValid) return;

  state.invitationEditor.isSaving = true;
  state.invitationEditor.error = '';
  render();

  try {
    const previous = state.invitationEditor.original || {};
    const coverImageUrl = String(draft.coverImageUrl || '').trim();
    const musicUrl = String(draft.musicUrl || '').trim();
    const gallery = normalizeInvitationGallery(draft.gallery);

    const payload = {
      slug: draft.slug,
      brideName: draft.brideName,
      groomName: draft.groomName,
      coupleDisplayName: draft.coupleDisplayName || deriveInvitationDisplayName(draft),
      eventTitle: draft.eventTitle || 'Wedding Invitation',
      eventDate: draft.eventDate,
      eventTime: draft.eventTime || '',
      venueName: draft.venueName,
      venueAddress: draft.venueAddress || '',
      mapUrl: draft.mapUrl || '',
      languageDefault: draft.languageDefault === 'ar' ? 'ar' : 'en',
      theme: INVITE_THEME_OPTIONS.includes(draft.theme) ? draft.theme : 'royal-gold',
      coverImageUrl,
      coverImageStoragePath: '',
      musicUrl,
      musicStoragePath: '',
      gallery,
      rsvpEnabled: draft.rsvpEnabled !== false,
      rsvpDeadline: draft.rsvpDeadline || '',
      whatsappNumber: draft.whatsappNumber || '',
      active: draft.status === 'active',
      status: draft.status,
      views: Number(previous.views || draft.views || 0),
      rsvpCount: Number(previous.rsvpCount || draft.rsvpCount || 0),
      features: {
        ...createDefaultInvitationFeatures(),
        ...(previous.features || draft.features || {})
      },
      createdBy: previous.createdBy || state.user?.email || '',
      updatedAt: serverTimestamp()
    };

    if (state.invitationEditor.mode === 'edit' && state.invitationEditor.id) {
      await updateDoc(doc(db, INVITATIONS_COLLECTION, state.invitationEditor.id), payload);
      showAdminToast(`Saved invitation ${payload.slug}`);
    } else {
      await addDoc(collection(db, INVITATIONS_COLLECTION), {
        ...payload,
        createdAt: serverTimestamp()
      });
      showAdminToast(`Created invitation ${payload.slug}`);
    }

    closeInvitationEditor();
  } catch (error) {
    state.invitationEditor.isSaving = false;
    state.invitationEditor.error = 'Invitation save failed.';
    if (isAdminDevHost()) {
      console.warn('[invitation-save] Firestore save failed:', error);
    }
    render();
  }
};

const copyInvitationLink = async (invitation) => {
  await navigator.clipboard.writeText(getInvitePublicUrl(invitation.slug));
  showAdminToast('Invitation link copied.');
};

const previewInvitation = (invitation) => {
  const href = invitation?.id
    ? buildInvitationAdminPreviewUrl(invitation)
    : getInvitePublicUrl(invitation.slug);
  window.open(href, '_blank', 'noopener,noreferrer');
};

const shareInvitationWhatsapp = (invitation) => {
  window.open(buildInvitationWhatsappShareUrl(invitation), '_blank', 'noopener,noreferrer');
};

const deleteInvitationRecord = async (invitation) => {
  const confirmed = window.confirm(`Delete the wedding invitation for ${deriveInvitationDisplayName(invitation) || invitation.slug}?`);
  if (!confirmed) return;
  await deleteDoc(doc(db, INVITATIONS_COLLECTION, invitation.id));
  showAdminToast(`Deleted invitation ${invitation.slug}`);
};

const stopActivityLogsSubscription = () => {
  if (unsubscribeActivityLogsSnapshot) {
    unsubscribeActivityLogsSnapshot();
    unsubscribeActivityLogsSnapshot = null;
  }
  state.activityLoading = false;
};

const subscribeToActivityLogs = () => {
  if (unsubscribeActivityLogsSnapshot) return;
  state.activityLoading = true;
  state.activityError = '';
  const activityRef = collection(db, 'adminActivityLogs');
  const activityQuery = query(activityRef, orderBy('timestamp', 'desc'), limit(250));
  unsubscribeActivityLogsSnapshot = onSnapshot(
    activityQuery,
    (snapshot) => {
      state.activityLogs = snapshot.docs.map(hydrateActivityLog);
      state.activityLoading = false;
      if (state.activeTab === 'activity') render();
    },
    (error) => {
      state.activityLoading = false;
      state.activityError = error?.message || 'Unable to read admin activity logs.';
      if (state.activeTab === 'activity') render();
    }
  );
};

const stopSubmissionActivitySubscription = () => {
  if (unsubscribeSubmissionActivitySnapshot) {
    unsubscribeSubmissionActivitySnapshot();
    unsubscribeSubmissionActivitySnapshot = null;
  }
  currentSubmissionActivityTargetId = null;
  state.submissionActivityLoading = false;
  state.submissionActivityError = '';
  state.submissionActivityLogs = [];
};

const subscribeToSubmissionActivity = (submissionId) => {
  if (!submissionId) {
    stopSubmissionActivitySubscription();
    return;
  }
  if (currentSubmissionActivityTargetId === submissionId && unsubscribeSubmissionActivitySnapshot) {
    return;
  }
  state.submissionActivityLoading = true;
  state.submissionActivityError = '';
  const logsRef = collection(db, 'adminActivityLogs');
  const submissionQuery = query(logsRef, where('targetId', '==', submissionId), limit(100));
  if (unsubscribeSubmissionActivitySnapshot) {
    unsubscribeSubmissionActivitySnapshot();
    unsubscribeSubmissionActivitySnapshot = null;
  }
  currentSubmissionActivityTargetId = submissionId;
  unsubscribeSubmissionActivitySnapshot = onSnapshot(
    submissionQuery,
    (snapshot) => {
      state.submissionActivityLogs = snapshot.docs
        .map(hydrateActivityLog)
        .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0))
        .slice(0, 50);
      state.submissionActivityLoading = false;
      if (state.selectedId === submissionId) render();
    },
    (error) => {
      state.submissionActivityLoading = false;
      state.submissionActivityError = error?.message || 'Unable to read submission activity.';
      if (state.selectedId === submissionId) render();
    }
  );
};

const syncActivitySubscriptions = () => {
  if (!state.user || !isAllowedAdminUser(state.user)) {
    stopActivityLogsSubscription();
    stopSubmissionActivitySubscription();
    return;
  }

  if (state.activeTab === 'activity') {
    subscribeToActivityLogs();
  } else {
    stopActivityLogsSubscription();
  }

  // The submission drawer does not currently render per-submission activity logs,
  // so keeping this listener live only adds avoidable rerenders during status saves.
  stopSubmissionActivitySubscription();
};

const getCardById = (id) => state.cards.find((card) => card.id === id) || null;

const openCardEditor = (mode, card = null) => {
  lastModalOpenedAt = Date.now();
  const draft = card
    ? {
        ...createEmptyCardDraft(),
        ...card,
        links: Array.isArray(card.links) ? card.links.map((link) => ({ ...link })) : []
      }
    : createEmptyCardDraft();

  state.cardEditor = {
    open: true,
    mode,
    id: card?.id || null,
    draft,
    original: card ? deepCloneForLog(getSmartCardLogState(card)) : null,
    slugState: { status: 'idle', message: 'Use lowercase letters, numbers, and hyphens only.' },
    slugTouched: Boolean(card?.slug),
    isSaving: false,
    error: '',
    pendingAvatarFile: null
  };
  render();
  if (mode === 'edit' && card?.id) {
    logAdminActivity({
      action: 'open_smart_card',
      targetType: 'smart_card',
      targetId: card.id,
      targetLabel: getSmartCardActivityLabel(card),
      metadata: {
        slug: card.slug || '',
        active: card.active !== false
      }
    });
  }
};

const closeCardEditor = () => {
  state.cardEditor = {
    open: false,
    mode: 'create',
    id: null,
    draft: null,
    original: null,
    slugState: { status: 'idle', message: '' },
    slugTouched: false,
    isSaving: false,
    error: '',
    pendingAvatarFile: null
  };
  render();
};

const captureCardEditorDraftFromDom = () => {
  const form = document.getElementById('card-editor-form');
  const current = getCardEditorDraftFromState();
  if (!form) return current;

  const links = Array.from(form.querySelectorAll('[data-card-link-row]')).map((row) => {
    const index = row.getAttribute('data-card-link-row');
    const label = form.querySelector(`[data-card-link-field="label"][data-card-link-index="${index}"]`)?.value?.trim() || '';
    const url = form.querySelector(`[data-card-link-field="url"][data-card-link-index="${index}"]`)?.value?.trim() || '';
    const icon = form.querySelector(`[data-card-link-field="icon"][data-card-link-index="${index}"]`)?.value || 'link';
    return { label, url, icon };
  });

  return {
    ...current,
    name: form.elements.name?.value?.trim() || '',
    role: form.elements.role?.value?.trim() || '',
    slug: slugifyCardValue(form.elements.slug?.value || ''),
    phone: sanitizePhoneValue(form.elements.phone?.value || ''),
    email: form.elements.email?.value?.trim() || '',
    website: form.elements.website?.value?.trim() || CARD_DEFAULT_WEBSITE,
    ctaLabel: form.elements.ctaLabel?.value?.trim() || CARD_DEFAULT_CTA_LABEL,
    ctaUrl: form.elements.ctaUrl?.value?.trim() || CARD_DEFAULT_CTA_URL,
    active: Boolean(form.elements.active?.checked),
    links: links.filter((link) => link.label || link.url)
  };
};

const writeCardPreviewUrl = (slug) => {
  const preview = document.getElementById('card-preview-url');
  if (preview) preview.textContent = buildCardEditorPreviewUrl(slug);
};

const writeCardSlugHint = (status, message) => {
  const hint = document.getElementById('card-slug-hint');
  const slugInput = document.getElementById('card-slug');
  if (!hint || !slugInput) return;

  hint.textContent = message;
  hint.classList.remove('is-valid', 'is-invalid', 'is-checking');
  slugInput.classList.remove('is-valid', 'is-invalid', 'is-checking');

  if (status === 'valid' || status === 'invalid' || status === 'checking') {
    hint.classList.add(`is-${status}`);
    slugInput.classList.add(`is-${status}`);
  }
};

const setCardEditorSlugState = (status, message) => {
  state.cardEditor.slugState = { status, message };
  writeCardSlugHint(status, message);
};

const validateCardSlug = async (slug, { silent = false } = {}) => {
  const normalized = slugifyCardValue(slug);
  if (!normalized) {
    if (!silent) setCardEditorSlugState('invalid', 'Slug is required.');
    return false;
  }

  if (normalized !== slug) {
    if (!silent) setCardEditorSlugState('invalid', 'Use lowercase letters, numbers, and hyphens only.');
    return false;
  }

  if (!silent) setCardEditorSlugState('checking', 'Checking slug availability...');

  const cardsRef = collection(db, 'cards');
  const slugQuery = query(cardsRef, where('slug', '==', normalized), limit(2));
  const snapshot = await getDocs(slugQuery);
  const conflict = snapshot.docs.find((item) => item.id !== state.cardEditor.id);

  if (conflict) {
    if (!silent) setCardEditorSlugState('invalid', 'That slug is already in use.');
    return false;
  }

  if (!silent) setCardEditorSlugState('valid', 'Slug is available.');
  return true;
};

const uploadCardAvatarIfNeeded = async (draft) => {
  const file = state.cardEditor.pendingAvatarFile;
  if (!file) {
    return {
      avatar: draft.avatar || '',
      avatarStoragePath: draft.avatarStoragePath || ''
    };
  }

  const safeSlug = slugifyCardValue(draft.slug);
  const path = `cards/${safeSlug}/avatar.jpg`;
  const fileRef = storageRef(storage, path);
  await uploadBytes(fileRef, file, { contentType: file.type || 'image/jpeg' });
  const url = await getDownloadURL(fileRef);
  return {
    avatar: url,
    avatarStoragePath: path
  };
};

const deleteCardAvatarIfNeeded = async (card) => {
  if (!card?.avatarStoragePath) return;
  try {
    await deleteObject(storageRef(storage, card.avatarStoragePath));
  } catch (error) {
    console.warn('[cards] avatar cleanup skipped:', error?.message || error);
  }
};

const ensureCardEditorData = () => {
  const draft = captureCardEditorDraftFromDom();
  state.cardEditor.draft = draft;
  return draft;
};

const saveCardEditor = async () => {
  const draft = ensureCardEditorData();
  const previousCardState = state.cardEditor.original || null;

  if (!draft.name || !draft.slug || !draft.phone || !draft.email) {
    state.cardEditor.error = 'Name, slug, phone, and email are required.';
    render();
    return;
  }

  const isSlugValid = await validateCardSlug(draft.slug, { silent: false });
  if (!isSlugValid) return;

  state.cardEditor.isSaving = true;
  state.cardEditor.error = '';
  render();

  try {
    const avatarPayload = await uploadCardAvatarIfNeeded(draft);
    const payload = {
      slug: draft.slug,
      name: draft.name,
      role: draft.role,
      company: draft.company || 'QD SYSTEMS',
      phone: draft.phone,
      email: draft.email,
      website: draft.website || CARD_DEFAULT_WEBSITE,
      avatar: avatarPayload.avatar,
      avatarStoragePath: avatarPayload.avatarStoragePath,
      links: draft.links || [],
      ctaLabel: draft.ctaLabel || CARD_DEFAULT_CTA_LABEL,
      ctaUrl: draft.ctaUrl || CARD_DEFAULT_CTA_URL,
      active: draft.active !== false,
      views: Number(draft.views || 0),
      updatedAt: serverTimestamp()
    };

    if (state.cardEditor.mode === 'edit' && state.cardEditor.id) {
      await updateDoc(doc(db, 'cards', state.cardEditor.id), payload);
      const nextCardState = getSmartCardLogState(payload);
      const changeSet = buildChangedMetadata(previousCardState || {}, nextCardState);
      if (changeSet.changedFields.length) {
        await logAdminActivity({
          action: 'edit_smart_card',
          targetType: 'smart_card',
          targetId: state.cardEditor.id,
          targetLabel: draft.name || draft.slug || state.cardEditor.id,
          metadata: changeSet
        });
      }
      showAdminToast(`Saved ${draft.slug}`);
    } else {
      const cardRef = await addDoc(collection(db, 'cards'), {
        ...payload,
        createdAt: serverTimestamp()
      });
      await logAdminActivity({
        action: 'create_smart_card',
        targetType: 'smart_card',
        targetId: cardRef.id,
        targetLabel: draft.name || draft.slug || cardRef.id,
        metadata: {
          changedFields: Object.keys(getSmartCardLogState(payload)),
          after: getSmartCardLogState(payload)
        }
      });
      showAdminToast(`Created ${draft.slug}`);
    }

    closeCardEditor();
  } catch (error) {
    state.cardEditor.isSaving = false;
    state.cardEditor.error = error?.message || 'Could not save the smart card.';
    render();
  }
};

const copyCardUrl = async (card) => {
  await navigator.clipboard.writeText(getCardPublicUrl(card.slug));
  showAdminToast('Card link copied.');
};

const ensureQrCodeLibrary = async () => {
  if (window.QRCode) return window.QRCode;

  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-qr-lib="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('QR library failed to load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.async = true;
    script.dataset.qrLib = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('QR library failed to load.'));
    document.head.appendChild(script);
  });

  return window.QRCode;
};

const createInvitationQrCanvas = async (url, size = 1024) => {
  const QRCode = await ensureQrCodeLibrary();
  const mount = document.createElement('div');
  mount.style.position = 'fixed';
  mount.style.left = '-9999px';
  mount.style.top = '0';
  document.body.appendChild(mount);

  new QRCode(mount, {
    text: url,
    width: size,
    height: size,
    colorDark: '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });

  await new Promise((resolve) => setTimeout(resolve, 120));
  const canvas = mount.querySelector('canvas');
  if (!canvas) {
    mount.remove();
    throw new Error('QR canvas could not be created.');
  }
  return { canvas, mount };
};

const downloadCardQr = async (card) => {
  const { canvas, mount } = await createInvitationQrCanvas(getCardPublicUrl(card.slug));
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `qd-card-${card.slug}-qr.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  mount.remove();
  showAdminToast(`Downloaded QR for ${card.slug}`);
};

const downloadInvitationQr = async (invitationOrDraft) => {
  const slug = slugifyCardValue(invitationOrDraft?.slug || '');
  const url = getInvitePublicUrl(slug || 'your-invitation');
  const { canvas, mount } = await createInvitationQrCanvas(url);
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `qd-invite-${slug || 'invitation'}-qr.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  mount.remove();
  showAdminToast(`Downloaded invitation QR for ${slug || 'invitation'}`);
};

const mountInvitationQrPreview = async () => {
  const wrap = document.getElementById('invitation-qr-preview');
  if (!wrap || wrap.dataset.mounted === 'true') return;
  const url = wrap.dataset.inviteUrl;
  if (!url) return;
  try {
    const { canvas, mount } = await createInvitationQrCanvas(url, 160);
    canvas.style.width = '160px';
    canvas.style.height = '160px';
    wrap.innerHTML = '';
    wrap.appendChild(canvas);
    mount.remove();
    wrap.dataset.mounted = 'true';
  } catch (error) {
    console.warn('[invite-qr] preview failed:', error?.message || error);
  }
};

const toggleCardActive = async (card) => {
  await updateDoc(doc(db, 'cards', card.id), {
    active: card.active === false,
    updatedAt: serverTimestamp()
  });
  await logAdminActivity({
    action: 'edit_smart_card',
    targetType: 'smart_card',
    targetId: card.id,
    targetLabel: getSmartCardActivityLabel(card),
    metadata: {
      changedFields: ['active'],
      before: { active: card.active !== false },
      after: { active: card.active === false }
    }
  });
  showAdminToast(card.active === false ? `Activated ${card.slug}` : `Deactivated ${card.slug}`);
};

const deleteCardRecord = async (card) => {
  const confirmed = window.confirm(`Delete the smart card for ${card.name || card.slug}?`);
  if (!confirmed) return;
  await deleteDoc(doc(db, 'cards', card.id));
  await deleteCardAvatarIfNeeded(card);
  await logAdminActivity({
    action: 'delete_smart_card',
    targetType: 'smart_card',
    targetId: card.id,
    targetLabel: getSmartCardActivityLabel(card),
    metadata: {
      before: getSmartCardLogState(card)
    }
  });
  showAdminToast(`Deleted ${card.slug}`);
};

const saveDrawer = async (nextValues = {}) => {
  const selected = getSelectedSubmission();
  if (!selected) return;

  const meetingInput = document.getElementById('drawer-meeting-date');
  if (meetingInput) {
    nextValues = { ...nextValues, meetingDateTime: meetingInput.value };
  }
  const previousStatus = selected.status ?? 'New';
  const previousPriority = selected.priority ?? 'Normal';
  const beforeState = getSubmissionLogState(selected);

  const meetingDateTime = nextValues.meetingDateTime
    ?? state.drawerDraft?.meetingDateTime
    ?? getSubmissionMeetingDate(selected)
    ?? '';

  const nextAnswers = { ...(selected.answers || {}) };
  for (const field of editableSubmissionFields) {
    nextAnswers[field.key] = nextValues[field.key] ?? state.drawerDraft?.[field.key] ?? getAnswer(selected, field.key);
  }
  nextAnswers.meetingDateTime = meetingDateTime;
  nextAnswers.preferredCallTime = meetingDateTime;

  const payload = {
    status: nextValues.status ?? state.drawerDraft?.status ?? selected.status ?? 'New',
    priority: nextValues.priority ?? state.drawerDraft?.priority ?? selected.priority ?? 'Normal',
    notes: nextValues.notes ?? state.drawerDraft?.notes ?? selected.notes ?? '',
    meetingDateTime,
    answers: nextAnswers,
    businessName: nextAnswers.businessName || '',
    businessEmail: nextAnswers.businessEmail || '',
    businessPhone: nextAnswers.businessPhone || '',
    industry: nextAnswers.industry || '',
    budgetRange: nextAnswers.budgetRange || '',
    launchDate: nextAnswers.launchDate || '',
    urgency: nextAnswers.urgency || '',
    selectedMainPurpose: nextAnswers.mainPurpose || '',
    lastUpdatedAt: serverTimestamp()
  };

  state.isSaving = true;
  state.saveError = '';
  render();

  try {
    await updateDoc(doc(db, 'projectSubmissions', selected.id), payload);
    const afterState = getSubmissionLogState({
      ...selected,
      ...payload,
      answers: payload.answers
    });
    const changeSet = buildChangedMetadata(beforeState, afterState);
    state.drawerDraft = {
      ...(state.drawerDraft || createDrawerDraft(selected)),
      ...payload,
      editMode: false,
      lastUpdatedAt: undefined
    };
    const pendingLogs = [];
    if (changeSet.changedFields.length) {
      pendingLogs.push(logAdminActivity({
        action: 'edit_submission',
        targetType: 'submission',
        targetId: selected.id,
        targetLabel: getSubmissionActivityLabel({ ...selected, ...payload, answers: payload.answers }),
        metadata: changeSet
      }));
    }
    if (payload.status !== previousStatus) {
      pendingLogs.push(logAdminActivity({
        action: 'change_status',
        targetType: 'submission',
        targetId: selected.id,
        targetLabel: getSubmissionActivityLabel(selected),
        metadata: {
          changedFields: ['status'],
          before: { status: previousStatus },
          after: { status: payload.status }
        }
      }));
    }
    if (payload.priority !== previousPriority) {
      pendingLogs.push(logAdminActivity({
        action: 'change_priority',
        targetType: 'submission',
        targetId: selected.id,
        targetLabel: getSubmissionActivityLabel(selected),
        metadata: {
          changedFields: ['priority'],
          before: { priority: previousPriority },
          after: { priority: payload.priority }
        }
      }));
    }

    state.isSaving = false;
    render();

    if (payload.status !== previousStatus) {
      showAdminToast(`Status changed to ${payload.status}`);
    }

    void Promise.allSettled(pendingLogs);
  } catch (error) {
    state.saveError = error?.message || 'Could not save submission changes.';
    state.isSaving = false;
    render();
  }
};

const deleteSubmissionRecord = async (submission) => {
  const businessName = formatValue(getAnswer(submission, 'businessName'));
  const confirmed = window.confirm(`Permanently delete the submission for "${businessName}"? This cannot be undone.`);
  if (!confirmed) return;

  await logAdminActivity({
    action: 'delete_submission',
    targetType: 'submission',
    targetId: submission.id,
    targetLabel: getSubmissionActivityLabel(submission),
    metadata: {
      status: submission.status,
      priority: submission.priority,
      businessName
    }
  });
  await deleteDoc(doc(db, 'projectSubmissions', submission.id));
  closeDrawer();
  showAdminToast(`Deleted ${businessName}`);
};

const handleDocumentClick = async (event) => {
  const outreachOpenTarget = event.target.closest('[data-outreach-open-id]');
  const clickedInteractiveControl = event.target.closest('a, button, select, input, textarea, label, [data-outreach-stop-row-open]');
  if (outreachOpenTarget && !clickedInteractiveControl) {
    const lead = getOutreachLeadById(outreachOpenTarget.dataset.outreachOpenId);
    if (lead) {
      openOutreachEditor('edit', lead);
    }
    return;
  }

  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) return;
  if (shouldIgnoreImmediateModalClose(actionTarget)) return;

  const action = actionTarget.dataset.action;

  if (action === 'toggle-theme') {
    const light = !document.body.classList.contains('qd-admin-light');
    document.body.classList.toggle('qd-admin-light', light);
    try { localStorage.setItem('qd-admin-theme', light ? 'light' : 'dark'); } catch {}
    updateThemeToggle();
    return;
  }

  if (action === 'toggle-password') {
    const input = document.getElementById('admin-password');
    if (!input) return;
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    actionTarget.textContent = visible ? 'Hide' : 'Show';
    actionTarget.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    actionTarget.setAttribute('aria-pressed', String(visible));
    return;
  }

  if (action === 'bank-flow-start') { bankTap(); state.bankFlow = {step:1, type:actionTarget.dataset.type, amount:'', note:'', due:'', monthly:false}; render(); focusBankFlow(); return; }
  if (action === 'bank-flow-back') { bankTap(); state.bankFlow.step = Math.max(0, state.bankFlow.step - 1); render(); if (state.bankFlow.step) focusBankFlow(); else root.querySelector('[data-action=bank-flow-start]')?.focus({preventScroll:true}); return; }
  if (action === 'bank-override') {
    bankTap();
    const f = state.bankFlow;
    const shares = [...(state.sharedLedger?.shares || [])];
    const index = sharedBankPartners.indexOf((state.user?.email || '').toLowerCase());
    const amount = bankEstimate(f);
    if (index < 0 || shares.length !== 2 || amount <= shares[index] || amount > shares[0] + shares[1]) return;
    const fromPartner = sharedBankMoney(amount - shares[index]);
    if (!window.confirm(`This withdrawal uses ${fromPartner} of your partner’s share. Continue?`)) return;
    if (!window.confirm(`Confirm again: record a ${sharedBankMoney(amount)} withdrawal, including ${fromPartner} from your partner’s share?`)) return;
    await submitSharedBank({type:'withdraw', amount:f.amount, currency:f.currency || 'AED', note:f.note, allowOverShare:true, expectedShares:shares});
    return;
  }
  if (action === 'bank-activity-prev' || action === 'bank-activity-next') { bankTap(); const max = Math.max(0, Math.ceil((state.sharedLedger?.entries?.length || 0) / 6) - 1); state.bankActivityPage = Math.max(0, Math.min(max, state.bankActivityPage + (action === 'bank-activity-next' ? 1 : -1))); render(); return; }
  if (action === 'bank-reload') { await loadSharedBank(true); return; }
  if (action === 'quote-print') { window.print(); return; }
  if (action === 'quote-pdf') { showAdminToast('Choose Save as PDF in the print dialog.'); window.print(); return; }
  if (action === 'quote-new-menu') { state.newQuoteDraft = {clientName:'',service:''}; state.newQuoteMode = true; render(); return; }
  if (action === 'quote-new-close') { state.newQuoteMode = false; render(); return; }
  if (action === 'quote-new-pricing') { state.newQuoteMode = false; state.activeTab = 'pricing'; syncAdminTabUrl(); render(); return; }
  if (action === 'quote-new-custom') { state.newQuoteMode = 'custom'; render(); return; }
  if (action === 'bank-pay') { await submitSharedBank({type:'pay-bill', id:actionTarget.dataset.id, due:actionTarget.dataset.due}); return; }

  if (action === 'logout') {
    await handleLogout();
    return;
  }

  if (action === 'toggle-admin-nav') {
    setAdminNavOpen(!state.navOpen);
    return;
  }

  if (action === 'set-admin-tab' || action === 'overview-open') {
    const previousTab = state.activeTab;
    state.activeTab = actionTarget.dataset.tab || 'dashboard';
    state.navOpen = false;
    if (action === 'overview-open' && state.activeTab === 'dashboard' && actionTarget.dataset.summary) {
      // Same filter logic as the pipeline summary buttons.
      const summary = actionTarget.dataset.summary;
      state.pipelineAttentionOnly = summary === 'followup';
      state.dashboardSection = 'pipeline';
      state.filters.status = summary === 'new' ? 'New' : 'All';
      state.pipelinePage = 0;
    }
    if (action === 'overview-open' && state.activeTab === 'payments' && actionTarget.dataset.quoteStatus) {
      state.paymentLookup.status = actionTarget.dataset.quoteStatus;
    }
    if (state.activeTab === 'activity') {
      state.activityLoading = true;
      state.activityError = '';
    }
    syncAdminTabUrl();
    render();
    if (previousTab !== state.activeTab) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      if (event.detail === 0) {
        root.querySelector(`.qd-admin-sidebar [data-tab="${state.activeTab}"]`)?.focus({ preventScroll: true });
      }
    }
    if (state.activeTab === 'payments') await loadQuotesList();
    if (state.activeTab === 'collections') await loadSharedBank();
    if (state.activeTab === 'overview') await loadCollections();
    return;
  }

  if (action === 'set-dashboard-section') {
    const nextSection = actionTarget.dataset.section || 'overview';
    state.dashboardSection = nextSection === 'archive' ? 'archive' : 'pipeline';
    state.pipelineAttentionOnly = false;
    state.filters.status = state.dashboardSection === 'archive' ? 'Archived' : 'All';
    state.pipelinePage = 0;
    syncAdminTabUrl();
    render();
    return;
  }

  if (action === 'set-pipeline-summary') {
    const summary = actionTarget.dataset.summary;
    state.pipelineAttentionOnly = summary === 'followup';
    state.dashboardSection = summary === 'archived' ? 'archive' : 'pipeline';
    state.filters.status = summary === 'new' ? 'New' : summary === 'archived' ? 'Archived' : 'All';
    state.pipelinePage = 0;
    syncAdminTabUrl();
    render();
    return;
  }

  if (action && action.startsWith('pricing-')) {
    const handled = await handlePricingAction(action, actionTarget);
    if (handled) return;
  }

  if (action === 'open-submission') {
    openSubmission(actionTarget.dataset.id);
    return;
  }

  if (action === 'set-pipeline-status') {
    const clickedStatus = actionTarget.dataset.status || 'All';
    const nextStatus = state.filters.status === clickedStatus && clickedStatus !== 'All'
      ? 'All'
      : clickedStatus;
    state.dashboardSection = clickedStatus === 'Archived' ? 'archive' : 'pipeline';
    state.pipelineAttentionOnly = false;
    syncAdminTabUrl();
    applyPipelineStatusFilter(nextStatus, { scroll: true });
    return;
  }

  if (action === 'budget-projects-prev') {
    state.budgetProjectsPage = Math.max(state.budgetProjectsPage - 1, 0);
    render();
    return;
  }

  if (action === 'budget-projects-next') {
    state.budgetProjectsPage += 1;
    render();
    return;
  }

  if (action === 'toggle-budget-sort') {
    state.budgetSortDirection = state.budgetSortDirection === 'asc' ? 'desc' : 'asc';
    state.budgetProjectsPage = 0;
    render();
    return;
  }

  if (action === 'pipeline-page-prev') {
    state.pipelinePage = Math.max(state.pipelinePage - 1, 0);
    render();
    return;
  }

  if (action === 'pipeline-page-next') {
    state.pipelinePage += 1;
    render();
    return;
  }

  if (action === 'outreach-page-prev') {
    state.outreachPage = Math.max(state.outreachPage - 1, 0);
    render();
    return;
  }

  if (action === 'outreach-page-next') {
    state.outreachPage += 1;
    render();
    return;
  }

  if (action === 'activity-page-prev') {
    state.activityPage = Math.max(state.activityPage - 1, 0);
    render();
    return;
  }

  if (action === 'activity-page-next') {
    state.activityPage += 1;
    render();
    return;
  }

  if (action === 'close-drawer') {
    closeDrawer();
    return;
  }

  if (action === 'open-card-create') {
    openCardEditor('create');
    return;
  }

  if (action === 'open-demo-create') {
    openDemoEditor('create');
    return;
  }

  if (action === 'open-invitation-create') {
    openInvitationEditor('create');
    return;
  }

  if (action === 'open-outreach-create') {
    openOutreachEditor('create');
    return;
  }

  if (action === 'toggle-outreach-starred-filter') {
    state.outreachFilters.starredOnly = !state.outreachFilters.starredOnly;
    state.outreachPage = 0;
    render();
    return;
  }

  if (action === 'close-card-editor') {
    closeCardEditor();
    return;
  }

  if (action === 'close-demo-editor') {
    closeDemoEditor();
    return;
  }

  if (action === 'close-invitation-editor') {
    closeInvitationEditor();
    return;
  }

  if (action === 'close-outreach-editor') {
    closeOutreachEditor();
    return;
  }

  if (action === 'extract-maps-lead') {
    extractMapsLead();
    return;
  }

  if (action === 'edit-card') {
    const card = getCardById(actionTarget.dataset.id);
    if (!card) return;
    openCardEditor('edit', card);
    return;
  }

  if (action === 'edit-demo') {
    const demo = getDemoById(actionTarget.dataset.id);
    if (!demo) return;
    openDemoEditor('edit', demo);
    return;
  }

  if (action === 'edit-invitation') {
    const invitation = getInvitationById(actionTarget.dataset.id);
    if (!invitation) return;
    openInvitationEditor('edit', invitation);
    return;
  }

  if (action === 'edit-outreach-lead') {
    const lead = getOutreachLeadById(actionTarget.dataset.id);
    if (!lead) return;
    openOutreachEditor('edit', lead);
    return;
  }

  if (action === 'add-card-link') {
    const draft = ensureCardEditorData();
    draft.links = [...(draft.links || []), { label: '', url: '', icon: 'link' }];
    state.cardEditor.draft = draft;
    render();
    return;
  }

  if (action === 'remove-card-link') {
    const draft = ensureCardEditorData();
    const index = Number(actionTarget.dataset.index);
    draft.links = (draft.links || []).filter((_, itemIndex) => itemIndex !== index);
    state.cardEditor.draft = draft;
    render();
    return;
  }

  if (action === 'copy-card-preview') {
    const slug = slugifyCardValue(document.getElementById('card-slug')?.value || state.cardEditor.draft?.slug || '');
    await navigator.clipboard.writeText(buildCardEditorPreviewUrl(slug));
    showAdminToast('Preview link copied.');
    return;
  }

  if (action === 'copy-demo-preview') {
    const slug = slugifyCardValue(document.getElementById('demo-slug')?.value || state.demoEditor.draft?.slug || '');
    await navigator.clipboard.writeText(buildDemoPreviewUrl(slug));
    showAdminToast('Demo link copied.');
    return;
  }

  if (action === 'copy-card-link') {
    const card = getCardById(actionTarget.dataset.id);
    if (!card) return;
    await copyCardUrl(card);
    return;
  }

  if (action === 'copy-demo-link') {
    const demo = getDemoById(actionTarget.dataset.id);
    if (!demo) return;
    await copyDemoLink(demo);
    return;
  }

  if (action === 'copy-invitation-link') {
    const invitation = getInvitationById(actionTarget.dataset.id);
    if (!invitation) return;
    await copyInvitationLink(invitation);
    return;
  }

  if (action === 'copy-invitation-preview') {
    const slug = slugifyCardValue(document.getElementById('invite-slug')?.value || state.invitationEditor.draft?.slug || '');
    await navigator.clipboard.writeText(buildInvitationPreviewUrl(slug));
    showAdminToast('Invitation link copied.');
    return;
  }

  if (action === 'copy-invitation-whatsapp-en') {
    const draft = ensureInvitationEditorData();
    await copyInvitationWhatsappMessage({ ...draft, slug: draft.slug }, 'en');
    return;
  }

  if (action === 'copy-invitation-whatsapp-ar') {
    const draft = ensureInvitationEditorData();
    await copyInvitationWhatsappMessage({ ...draft, slug: draft.slug }, 'ar');
    return;
  }

  if (action === 'download-invitation-qr') {
    const draft = ensureInvitationEditorData();
    const invitation = state.invitationEditor.id
      ? getInvitationById(state.invitationEditor.id)
      : draft;
    await downloadInvitationQr(invitation || draft);
    return;
  }

  if (action === 'download-invitation-qr-by-id') {
    const invitation = getInvitationById(actionTarget.dataset.id);
    if (!invitation) return;
    await downloadInvitationQr(invitation);
    return;
  }

  if (action === 'export-invitation-rsvps') {
    const invitation = state.invitationEditor.id
      ? getInvitationById(state.invitationEditor.id)
      : ensureInvitationEditorData();
    if (!invitation) return;
    exportInvitationRsvpsCsv(invitation, getFilteredInvitationRsvps());
    showAdminToast('RSVP CSV exported.');
    return;
  }

  if (action === 'download-card-qr') {
    const card = getCardById(actionTarget.dataset.id);
    if (!card) return;
    await downloadCardQr(card);
    return;
  }

  if (action === 'toggle-card-active') {
    const card = getCardById(actionTarget.dataset.id);
    if (!card) return;
    await toggleCardActive(card);
    return;
  }

  if (action === 'toggle-demo-status') {
    const demo = getDemoById(actionTarget.dataset.id);
    if (!demo) return;
    await toggleDemoStatus(demo);
    return;
  }

  if (action === 'delete-card') {
    const card = getCardById(actionTarget.dataset.id);
    if (!card) return;
    await deleteCardRecord(card);
    return;
  }

  if (action === 'delete-demo') {
    const demo = getDemoById(actionTarget.dataset.id);
    if (!demo) return;
    await deleteDemoRecord(demo);
    return;
  }

  if (action === 'delete-invitation') {
    const invitation = getInvitationById(actionTarget.dataset.id);
    if (!invitation) return;
    await deleteInvitationRecord(invitation);
    return;
  }

  if (action === 'toggle-outreach-star') {
    const lead = getOutreachLeadById(actionTarget.dataset.id);
    if (!lead) return;
    toggleOutreachLeadStar(lead).catch((error) => {
      state.outreachError = error?.message || 'Could not update star.';
      render();
    });
    return;
  }

  if (action === 'delete-outreach-lead') {
    const lead = getOutreachLeadById(actionTarget.dataset.id);
    if (!lead) return;
    await deleteOutreachLead(lead);
    return;
  }

  if (action === 'preview-invitation') {
    const invitation = getInvitationById(actionTarget.dataset.id);
    if (!invitation) return;
    previewInvitation(invitation);
    return;
  }

  if (action === 'open-demo-admin') {
    const demo = getDemoById(actionTarget.dataset.id);
    if (!demo) return;
    await openDemoAdmin(demo);
    return;
  }

  if (action === 'trigger-demo-deploy') {
    const demo = state.demoEditor.id ? getDemoById(state.demoEditor.id) : getDemoEditorDraftFromState();
    if (!demo) return;
    await triggerDemoDeploy(demo);
    return;
  }

  if (action === 'preview-invitation-draft') {
    const draft = ensureInvitationEditorData();
    previewInvitation({ id: state.invitationEditor.id, slug: draft.slug });
    return;
  }

  if (action === 'share-invitation-whatsapp') {
    const invitation = getInvitationById(actionTarget.dataset.id);
    if (!invitation) return;
    shareInvitationWhatsapp(invitation);
    return;
  }

  if (action === 'copy-summary') {
    const submission = getSelectedSubmission();
    if (!submission) return;

    try {
      await navigator.clipboard.writeText(buildEmailSummary(submission));
      state.copyFeedback = 'Copied full summary.';
      render();
      clearTimeout(copyFeedbackTimeout);
      copyFeedbackTimeout = setTimeout(() => {
        state.copyFeedback = '';
        render();
      }, 2200);
    } catch (error) {
      state.saveError = error?.message || 'Clipboard write failed.';
      render();
    }
    return;
  }

  if (action === 'edit-submission') {
    ensureDrawerDraft();
    if (state.drawerDraft) {
      state.drawerDraft.editMode = true;
      render();
    }
    return;
  }

  if (action === 'cancel-edit-submission') {
    const selected = getSelectedSubmission();
    state.drawerDraft = selected ? createDrawerDraft(selected, { id: selected.id, editMode: false }) : null;
    render();
    return;
  }

  if (action === 'archive-submission') {
    const selected = getSelectedSubmission();
    if (!selected) return;
    state.drawerDraft = {
      id: selected.id,
      status: 'Archived',
      priority: state.drawerDraft?.priority ?? selected.priority ?? 'Normal',
      notes: state.drawerDraft?.notes ?? selected.notes ?? ''
    };
    await saveDrawer({ status: 'Archived' });
    return;
  }

  if (action === 'delete-submission') {
    const selected = getSelectedSubmission();
    if (!selected) return;
    await deleteSubmissionRecord(selected);
    return;
  }

  if (action === 'save-drawer') {
    await saveDrawer();
    return;
  }

  if (action === 'quote-status-filter') {
    state.paymentLookup.status = actionTarget.dataset.status || 'All';
    syncAdminTabUrl();
    await loadQuotesList({ keepDetail: true });
    return;
  }

  if (action === 'open-quotation') {
    await openQuotationDetail(actionTarget.dataset.ref);
    return;
  }

  if (action === 'quote-open-payment') { const panel = root.querySelector('.qd-qd-disclosure'); if (panel) { panel.open = true; state.paymentLookup.paymentFormOpen = true; panel.scrollIntoView({behavior:'smooth',block:'start'}); panel.querySelector('select')?.focus({preventScroll:true}); } return; }
  if (action === 'quote-detail-pdf') { const q = state.paymentLookup.quote; if (q) { openQuoteDrawer(q); showAdminToast('Choose Save as PDF in the print dialog.'); window.print(); } return; }
  if (action === 'quote-edit-selected') {
    const q = state.paymentLookup.quote;
    if (q) openQuoteDrawer(q);
    return;
  }

  if (action === 'quote-delete-selected') {
    await deleteSelectedQuote();
    return;
  }

  if (action === 'quote-waive-care') {
    try {
      await updateSelectedQuote({ waiveCare: { monthKey: actionTarget.dataset.monthKey || '' } });
      await loadCollections();
      showAdminToast('Care month waived.');
    } catch (error) {
      showAdminToast(error.message || 'Could not waive care.');
    }
    return;
  }

  if (action === 'quote-unwaive-care') {
    try {
      await updateSelectedQuote({ unwaiveCare: { monthKey: actionTarget.dataset.monthKey || '' } });
      await loadCollections();
      showAdminToast('Care month restored.');
    } catch (error) {
      showAdminToast(error.message || 'Could not restore care.');
    }
    return;
  }

  if (action === 'quote-mark-sent') {
    try {
      await updateSelectedQuote({ markSent: true });
      showAdminToast('Quote marked sent.');
    } catch (error) {
      showAdminToast(error.message || 'Could not mark sent.');
    }
    return;
  }

  if (action === 'quote-copy-client-link') {
    const q = state.paymentLookup.quote;
    if (!q) return;
    const text = `Your quotation from QD Systems:\n${location.origin}/q/${q.id}\nPasscode: ${q.passcodePlain || '(check admin)'}`;
    try {
      await navigator.clipboard.writeText(text);
      showAdminToast('Client link copied.');
    } catch {
      prompt('Copy this client link:', text);
    }
    return;
  }

  if (action === 'collections-refresh') {
    await loadCollections();
    return;
  }

  if (action === 'collection-filter') {
    state.collections.filter = actionTarget.dataset.filter || 'All';
    render();
    return;
  }

  if (action === 'collection-open-quote') {
    state.activeTab = 'payments';
    syncAdminTabUrl();
    render();
    await openQuotationDetail(actionTarget.dataset.ref);
    await loadQuotesList({ keepDetail: true });
    return;
  }

  if (action === 'collection-mark-collected') {
    try {
      await markCollectionCollected(actionTarget);
    } catch (error) {
      showAdminToast(error.message || 'Could not mark collected.');
    }
    return;
  }

  if (action === 'generate-quote') {
    await openQuoteFromSubmission(actionTarget.dataset.submissionId);
    return;
  }

  if (action === 'open-quote') {
    openQuoteByQuoteId(actionTarget.dataset.quoteId);
    return;
  }

  if (action === 'close-quote-drawer') {
    closeQuoteDrawer();
    return;
  }

  if (action === 'quote-remove-line') {
    const idx = Number(actionTarget.dataset.idx);
    if (!state.quoteDrawer.quote) return;
    state.quoteDrawer.quote.lineItems.splice(idx, 1);
    markQuoteDirty();
    render();
    return;
  }

  if (action === 'quote-move-line-up' || action === 'quote-move-line-down') {
    const idx = Number(actionTarget.dataset.idx);
    const q = state.quoteDrawer.quote;
    if (!q) return;
    const nextIdx = action === 'quote-move-line-up' ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= q.lineItems.length) return;
    [q.lineItems[idx], q.lineItems[nextIdx]] = [q.lineItems[nextIdx], q.lineItems[idx]];
    markQuoteDirty();
    render();
    return;
  }

  if (action === 'quote-add-include') {
    const idx = Number(actionTarget.dataset.idx);
    const q = state.quoteDrawer.quote;
    if (!q?.lineItems?.[idx]) return;
    if (!Array.isArray(q.lineItems[idx].includes)) q.lineItems[idx].includes = [];
    q.lineItems[idx].includes.push('New included item');
    q.lineItems[idx].includedGroups = [];
    markQuoteDirty();
    render();
    return;
  }

  if (action === 'quote-remove-include') {
    const idx = Number(actionTarget.dataset.idx);
    const includeIdx = Number(actionTarget.dataset.includeIdx);
    const q = state.quoteDrawer.quote;
    if (!q?.lineItems?.[idx]) return;
    if (!Array.isArray(q.lineItems[idx].includes)) q.lineItems[idx].includes = [];
    q.lineItems[idx].includes.splice(includeIdx, 1);
    q.lineItems[idx].includedGroups = [];
    markQuoteDirty();
    render();
    return;
  }

  if (action === 'quote-step') { const ui = getQuoteEditorUi(); ui.step = actionTarget.dataset.step; ui.collapsed[ui.step] = false; render(); return; }
  if (action === 'quote-line-toggle') { const ui = getQuoteEditorUi(); ui.expandedLine = ui.expandedLine === Number(actionTarget.dataset.idx) ? -1 : Number(actionTarget.dataset.idx); render(); return; }
  if (action === 'quote-add-term') {
    const q = state.quoteDrawer.quote;
    if (!q) return;
    if (!q.terms || typeof q.terms !== 'object') q.terms = { en: [], ar: [] };
    ensureEditableQuoteTerms(q);
    q.terms.en.push('New term.');
    markQuoteDirty();
    render();
    return;
  }

  if (action === 'quote-remove-term') {
    const idx = Number(actionTarget.dataset.termIdx);
    const q = state.quoteDrawer.quote;
    if (!q) return;
    ensureEditableQuoteTerms(q);
    q.terms.en.splice(idx, 1);
    markQuoteDirty();
    render();
    return;
  }

  if (action === 'quote-add-custom-line') {
    if (!state.quoteDrawer.quote) return;
    getQuoteEditorUi().expandedLine = state.quoteDrawer.quote.lineItems.length;
    state.quoteDrawer.quote.lineItems.push({
      catalogKey: null,
      name: { en: '', ar: '' },
      description: { en: '', ar: '' },
      includes: [],
      qty: 1,
      unitPrice: 0
    });
    markQuoteDirty();
    render();
    return;
  }

  if (action === 'quote-save-draft') {
    await saveQuoteDrawer({ markSent: false, copy: false });
    return;
  }

  if (action === 'quote-picker-toggle') {
    if (!state.quoteDrawer.quote) return;
    const ui = getQuoteEditorUi();
    ui.pickerOpen = !ui.pickerOpen;
    render();
    if (ui.pickerOpen) root.querySelector('[data-qe-picker-search]')?.focus({ preventScroll: true });
    return;
  }

  if (action === 'quote-picker-group') {
    getQuoteEditorUi().pickerGroup = actionTarget.dataset.group || 'all';
    render();
    return;
  }

  if (action === 'quote-picker-add') {
    const q = state.quoteDrawer.quote;
    if (!q) return;
    const { kind, key } = actionTarget.dataset;
    let label = '';
    if (kind === 'package') {
      const pkg = getPackage(key);
      if (pkg) {
        q.lineItems.push(packageToQuoteLine(pkg));
        label = pkg.name.en;
      }
    } else if (kind === 'care') {
      const plan = getCarePlan(key);
      if (plan) {
        applyQuoteChange('carePlanName', plan.name.en);
        applyQuoteChange('careMonthly', plan.monthly);
        label = `${plan.name.en} care plan`;
      }
    } else {
      const line = catalogToLineItem(key);
      if (line) {
        q.lineItems.push(line);
        label = line.name.en;
      }
    }
    if (!label) return;
    markQuoteDirty();
    showToast(`Added: ${label}`);
    return;
  }

  if (action === 'quote-editor-toggle-section') {
    const ui = getQuoteEditorUi();
    const id = actionTarget.dataset.section;
    ui.collapsed = { ...(ui.collapsed || {}), [id]: !ui.collapsed?.[id] };
    render();
    return;
  }

  if (action === 'quote-editor-jump') {
    const ui = getQuoteEditorUi();
    const id = actionTarget.dataset.section;
    ui.view = 'edit';
    if (ui.collapsed?.[id]) {
      ui.collapsed = { ...ui.collapsed, [id]: false };
      render();
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    root.querySelector(`#qd-qe-section-${id}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    return;
  }

  if (action === 'quote-editor-view') {
    getQuoteEditorUi().view = actionTarget.dataset.view === 'preview' ? 'preview' : 'edit';
    render();
    return;
  }

  if (action === 'quote-editor-lang') {
    if (!state.quoteDrawer.quote) return;
    const next = actionTarget.dataset.lang === 'ar' ? 'ar' : 'en';
    if ((state.quoteDrawer.quote.language || 'en') === next) return;
    if (next === 'ar' && !(await translateQuoteToArabic(state.quoteDrawer.quote))) return;
    applyQuoteChange('language', next);
    render();
    return;
  }

  if (action === 'quote-editor-copy-link') {
    const q = state.quoteDrawer.quote;
    if (!q || !guardQuoteSendAction()) return;
    const text = `Your quotation from QD Systems:\n${getQuoteClientUrl(q)}\nPasscode: ${getQuotePasscode(q) || '(check admin)'}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast(state.quoteDrawer.dirty ? 'Link copied. Save first so the client sees your latest changes.' : 'Link and passcode copied.');
    } catch {
      prompt('Copy this client link:', text);
    }
    return;
  }

  if (action === 'quote-editor-mark-sent') {
    if (!guardQuoteSendAction()) return;
    await saveQuoteDrawer({ markSent: true, copy: false });
    return;
  }

  if (action === 'quote-editor-retry') {
    const d = state.quoteDrawer;
    if (!d?.open) return;
    d.retryCount = 0;
    clearTimeout(quoteRetryTimer);
    const saved = await saveQuoteDrawer({ silent: false });
    if (saved && d.closeFailed && state.quoteDrawer === d) await closeQuoteDrawer();
    return;
  }

  if (action === 'quote-editor-discard') {
    const d = state.quoteDrawer;
    if (!d?.open) return;
    if (!window.confirm('Discard your unsaved changes to this quote? This cannot be undone.')) return;
    clearQuoteLocalCopy(d.quote?.id);
    await closeQuoteDrawer({ autosave: false });
    return;
  }

  if (action === 'quote-editor-load-latest') {
    const d = state.quoteDrawer;
    const latest = getServerQuoteDoc(d?.quote?.id);
    if (!d?.open || !latest) return;
    if (!window.confirm('Load the latest saved version? Your unsaved changes will be discarded.')) return;
    clearQuoteLocalCopy(d.quote.id);
    d.quote = prepareQuoteForEditing({ ...latest, lineItems: [...(latest.lineItems || [])] });
    d.original = deepCloneForLog(getQuoteLogState(latest));
    d.dirty = false;
    d.saveState = 'saved';
    d.baseUpdatedMs = timestampMs(latest.updatedAt) || d.baseUpdatedMs;
    render();
    return;
  }

  if (action === 'quote-editor-keep-mine') {
    await saveQuoteDrawer({ silent: false, force: true });
    return;
  }

  if (action === 'quote-editor-restore') {
    const d = state.quoteDrawer;
    const local = readQuoteLocalCopy(d?.quote?.id);
    if (!d?.open || !local) return;
    QUOTE_LOCAL_FIELDS.forEach((key) => {
      if (local.fields[key] !== undefined) d.quote[key] = deepCloneForLog(local.fields[key]);
    });
    d.restoreOffer = null;
    markQuoteDirty();
    render();
    showToast('Unsaved changes restored. Save to keep them.');
    return;
  }

  if (action === 'quote-editor-restore-discard') {
    const d = state.quoteDrawer;
    if (!d?.open) return;
    clearQuoteLocalCopy(d.quote?.id);
    d.restoreOffer = null;
    render();
    return;
  }

  if (action === 'quote-editor-set-status') {
    const q = state.quoteDrawer.quote;
    const select = root.querySelector('#qd-quote-drawer [data-qe-status]');
    if (!q || !select || !guardQuoteSendAction()) return;
    await setQuoteWorkflowStatusFromEditor(select.value);
    return;
  }

  if (action === 'quote-editor-open-detail') {
    const q = state.quoteDrawer.quote;
    if (!q) return;
    const id = q.id;
    if (!(await closeQuoteDrawer())) return;
    state.activeTab = 'payments';
    syncAdminTabUrl();
    render();
    await openQuotationDetail(id);
    await loadQuotesList({ keepDetail: true });
    return;
  }

  if (action === 'quote-detail-close') {
    closeQuotationDetail();
    return;
  }

  if (action === 'quote-save-and-copy') {
    if (!guardQuoteSendAction()) return;
    await saveQuoteDrawer({ markSent: true, copy: true });
    return;
  }
};

const handleDocumentInput = (event) => {
  if (state.cardEditor.open) {
    if (event.target.id === 'card-name') {
      const slugInput = document.getElementById('card-slug');
      if (slugInput && !state.cardEditor.slugTouched) {
        slugInput.value = slugifyCardValue(event.target.value);
        writeCardPreviewUrl(slugInput.value);
      }
      return;
    }

    if (event.target.id === 'card-slug') {
      state.cardEditor.slugTouched = true;
      const nextSlug = slugifyCardValue(event.target.value);
      if (nextSlug !== event.target.value) event.target.value = nextSlug;
      writeCardPreviewUrl(nextSlug);
      setCardEditorSlugState('idle', 'Use lowercase letters, numbers, and hyphens only.');
      return;
    }

    if (event.target.id === 'card-phone') {
      event.target.value = sanitizePhoneValue(event.target.value);
      return;
    }
  }

  if (state.demoEditor.open) {
    if (event.target.id === 'demo-title' || event.target.id === 'demo-client-name') {
      const slugInput = document.getElementById('demo-slug');
      if (slugInput && !state.demoEditor.slugTouched) {
        const title = document.getElementById('demo-title')?.value || '';
        const clientName = document.getElementById('demo-client-name')?.value || '';
        slugInput.value = slugifyCardValue(clientName || title);
        const preview = document.getElementById('demo-preview-url');
        if (preview) preview.textContent = buildDemoPreviewUrl(slugInput.value);
      }
      return;
    }

    if (event.target.id === 'demo-slug') {
      state.demoEditor.slugTouched = true;
      const nextSlug = slugifyCardValue(event.target.value);
      if (nextSlug !== event.target.value) event.target.value = nextSlug;
      const preview = document.getElementById('demo-preview-url');
      if (preview) preview.textContent = buildDemoPreviewUrl(nextSlug);
      setDemoSlugState('idle', 'Use lowercase letters, numbers, and hyphens only.');
      return;
    }
  }

  if (state.invitationEditor.open) {
    if (event.target.id === 'invite-bride-name' || event.target.id === 'invite-groom-name') {
      if (!state.invitationEditor.slugTouched) {
        const bride = document.getElementById('invite-bride-name')?.value || '';
        const groom = document.getElementById('invite-groom-name')?.value || '';
        const slugInput = document.getElementById('invite-slug');
        if (slugInput) {
          slugInput.value = slugifyCardValue(`${bride}-${groom}`);
          writeInvitationPreviewUrl(slugInput.value);
        }
      }
      return;
    }

    if (event.target.id === 'invite-slug') {
      state.invitationEditor.slugTouched = true;
      const nextSlug = slugifyCardValue(event.target.value);
      if (nextSlug !== event.target.value) event.target.value = nextSlug;
      writeInvitationPreviewUrl(nextSlug);
      setInvitationSlugState('idle', 'Use lowercase letters, numbers, and hyphens only.');
      return;
    }

    if (event.target.id === 'invite-whatsapp') {
      event.target.value = normalizeWhatsappAdminNumber(event.target.value);
      return;
    }

    if (event.target.id === 'invite-rsvp-search') {
      state.invitationRsvpFilters.search = event.target.value;
      render();
      return;
    }

    if (event.target.id === 'invite-rsvp-phone') {
      state.invitationRsvpFilters.phone = event.target.value;
      render();
      return;
    }

    if (event.target.id === 'invite-rsvp-attending-filter') {
      state.invitationRsvpFilters.attending = event.target.value;
      render();
      return;
    }

    if (event.target.id === 'invite-rsvp-sort') {
      state.invitationRsvpFilters.sort = event.target.value;
      render();
      return;
    }
  }

  if (state.outreachEditor.open) {
    if (event.target.id === 'outreach-phone-number') {
      event.target.value = sanitizePhoneValue(event.target.value);
      state.outreachEditor.draft = captureOutreachDraftFromDom();
      return;
    }

    if (event.target.dataset.outreachEditorMeta === 'mapsUrl') {
      state.outreachEditor.mapsUrl = event.target.value;
      state.outreachEditor.mapsError = '';
      return;
    }
  }

  const filterField = event.target.dataset.field;
  if (filterField) {
    if (filterField === 'status') {
      state.pipelinePage = 0;
      state.pipelineAttentionOnly = false;
      state.dashboardSection = event.target.value === 'Archived' ? 'archive' : 'pipeline';
      syncAdminTabUrl();
      applyPipelineStatusFilter(event.target.value);
      return;
    }

    const { selectionStart, selectionEnd, value } = event.target;
    state.filters[filterField] = event.target.value;
    if (filterField === 'search' || filterField === 'priority') {
      state.pipelinePage = 0;
    }
    render();
    if (filterField === 'search') {
      const nextInput = root.querySelector('[data-field="search"]');
      if (nextInput) {
        nextInput.focus();
        const caret = typeof selectionStart === 'number' ? selectionStart : value.length;
        const caretEnd = typeof selectionEnd === 'number' ? selectionEnd : value.length;
        nextInput.setSelectionRange(caret, caretEnd);
      }
    }
    return;
  }

  const activityField = event.target.dataset.activityField;
  if (activityField) {
    const { selectionStart, selectionEnd, value } = event.target;
    state.activityFilters[activityField] = event.target.value;
    state.activityPage = 0;
    render();
    if (activityField === 'search') {
      const nextInput = root.querySelector('[data-activity-field="search"]');
      if (nextInput) {
        nextInput.focus();
        const caret = typeof selectionStart === 'number' ? selectionStart : value.length;
        const caretEnd = typeof selectionEnd === 'number' ? selectionEnd : value.length;
        nextInput.setSelectionRange(caret, caretEnd);
      }
    }
    return;
  }

  const demoField = event.target.dataset.demoField;
  if (demoField) {
    const { selectionStart, selectionEnd, value } = event.target;
    state.demoFilters[demoField] = event.target.value;
    render();
    if (demoField === 'search') {
      const nextInput = root.querySelector('[data-demo-field="search"]');
      if (nextInput) {
        nextInput.focus();
        const caret = typeof selectionStart === 'number' ? selectionStart : value.length;
        const caretEnd = typeof selectionEnd === 'number' ? selectionEnd : value.length;
        nextInput.setSelectionRange(caret, caretEnd);
      }
    }
    return;
  }

  const outreachField = event.target.dataset.outreachField;
  if (outreachField) {
    const { selectionStart, selectionEnd, value } = event.target;
    state.outreachFilters[outreachField] = event.target.value;
    state.outreachPage = 0;
    render();
    if (outreachField === 'search') {
      const nextInput = root.querySelector('[data-outreach-field="search"]');
      if (nextInput) {
        nextInput.focus();
        const caret = typeof selectionStart === 'number' ? selectionStart : value.length;
        const caretEnd = typeof selectionEnd === 'number' ? selectionEnd : value.length;
        nextInput.setSelectionRange(caret, caretEnd);
      }
    }
    return;
  }

  const qfield = event.target.dataset.qfield;
  const qline = event.target.dataset.qline;
  const qterm = event.target.dataset.qterm;
  if (qfield || qline || qterm) {
    const value = event.target.type === 'checkbox'
      ? event.target.checked
      : (event.target.isContentEditable ? event.target.textContent : event.target.value);
    if (qterm != null) {
      const q = state.quoteDrawer.quote;
      if (q) {
        ensureEditableQuoteTerms(q);
        q.terms.en[Number(qterm)] = String(value || '').trim();
        markQuoteDirty();
      }
    } else {
      applyQuoteChange(qfield || qline, value);
    }
    updateQuoteTotalsPreview();
    return;
  }

  const drawerField = event.target.dataset.drawerField;
  if (drawerField) {
    const selected = getSelectedSubmission();
    if (!selected) return;

    state.drawerDraft = {
      ...(state.drawerDraft || createDrawerDraft(selected)),
      id: selected.id,
      status: drawerField === 'status' ? event.target.value : state.drawerDraft?.status ?? selected.status ?? 'New',
      priority: drawerField === 'priority' ? event.target.value : state.drawerDraft?.priority ?? selected.priority ?? 'Normal',
      notes: drawerField === 'notes' ? event.target.value : state.drawerDraft?.notes ?? selected.notes ?? '',
      meetingDateTime: drawerField === 'meetingDateTime'
        ? event.target.value
        : state.drawerDraft?.meetingDateTime ?? getSubmissionMeetingDate(selected) ?? ''
    };
    return;
  }

  const drawerEditField = event.target.dataset.drawerEditField;
  if (drawerEditField) {
    const selected = getSelectedSubmission();
    if (!selected) return;

    state.drawerDraft = {
      ...(state.drawerDraft || createDrawerDraft(selected)),
      id: selected.id,
      editMode: true,
      [drawerEditField]: event.target.value
    };
  }
};

document.addEventListener('click', (event) => {
  handleDocumentClick(event);
});

document.addEventListener('change', async (event) => {
  if (event.target.matches('[data-action="quote-first-month-free"]')) {
    try {
      await updateSelectedQuote({ firstMonthFree: event.target.checked });
      await loadCollections();
      showAdminToast(event.target.checked ? 'First month marked free.' : 'First month free disabled.');
    } catch (error) {
      showAdminToast(error.message || 'Could not update care setting.');
    }
    return;
  }
  if (event.target.matches('[data-collection-search]')) {
    state.collections.search = event.target.value || '';
    render();
  }
});

document.addEventListener('change', async (event) => {
  if (event.target.closest('#custom-quote-form') && event.target.name === 'showClientLink') { state.newQuoteDraft.showClientLink = event.target.checked; return; }
  if (event.target.closest('#custom-quote-form') && event.target.name === 'service') { state.newQuoteDraft.service = event.target.value; return; }
  if (event.target.id !== 'bank-currency') return;
  state.bankFlow.currency = event.target.value;
  if (state.bankFlow.currency === 'USD') { try { state.sharedBankRate = await sharedBankRequest({rate:true}); } catch { state.sharedBankRate = null; } }
  render(); focusBankFlow();
});
document.addEventListener('input', (event) => {
  if (event.target.closest('#quote-payment-form') && event.target.name) { state.paymentLookup.form = {...state.paymentLookup.form, [event.target.name]:event.target.value}; state.paymentLookup.paymentFormOpen = true; }
  if (event.target.closest('#custom-quote-form') && event.target.name === 'clientName') state.newQuoteDraft.clientName = event.target.value;
  if (event.target.closest('#shared-bank-form') && ['amount','note','due'].includes(event.target.name)) {
    state.bankFlow[event.target.name] = event.target.value;
    if (event.target.name === 'amount' && state.bankFlow.currency === 'USD' && state.sharedBankRate) { const hint = root.querySelector('#bank-rate-hint'); if (hint) hint.textContent = `≈ ${sharedBankMoney(bankEstimate(state.bankFlow))} · 1 USD = ${state.sharedBankRate.rate} AED · ${state.sharedBankRate.date}`; }
  }
  if (event.target.closest('#shared-bank-form') && event.target.name === 'monthly') { state.bankFlow.monthly = event.target.checked; bankTap(); render(); }
  if (event.target.id === 'bank-repeat') { state.bankFlow.repeatMonths = event.target.value; const value = root.querySelector('#bank-repeat-value'); if (value) value.textContent = `${event.target.value} ${event.target.value === '1' ? 'month' : 'months'}`; }
  if (event.target.matches('[data-collection-search]')) {
    state.collections.search = event.target.value || '';
    render();
  }
});

document.addEventListener('input', (event) => {
  if (event.target.matches?.('[data-qe-picker-search]')) {
    filterQuotePicker(event.target.value);
    return;
  }
  if (event.target.dataset && event.target.dataset.pricingFilter !== undefined) {
    applyPricingAddonFilter(event.target.value);
    return;
  }
  handleDocumentInput(event);
});

document.addEventListener('change', (event) => {
  if (event.target.dataset.pricingField) {
    handlePricingFieldChange(event.target);
    return;
  }

  if (event.target.dataset.drawerField || event.target.dataset.drawerEditField) {
    handleDocumentInput(event);
    return;
  }

  if (event.target.dataset.activityField || event.target.dataset.field || event.target.dataset.demoField || event.target.dataset.outreachField) {
    handleDocumentInput(event);
    return;
  }

  if (event.target.dataset.outreachStatusId) {
    const lead = getOutreachLeadById(event.target.dataset.outreachStatusId);
    if (!lead) return;
    updateOutreachLeadStatus(lead, event.target.value).catch((error) => {
      state.outreachError = error?.message || 'Could not update outreach status.';
      render();
    });
    return;
  }

  if (event.target.id === 'demo-slug') {
    validateDemoSlug(event.target.value).catch((error) => {
      setDemoSlugState('invalid', error?.message || 'Slug check failed.');
    });
    return;
  }

  if (event.target.id === 'invite-slug') {
    validateInvitationSlug(event.target.value).catch((error) => {
      setInvitationSlugState('invalid', error?.message || 'Slug check failed.');
    });
    return;
  }

  if (event.target.id === 'invite-active') {
    const status = document.getElementById('invite-status');
    if (status && event.target.checked) status.value = 'active';
    if (status && !event.target.checked && status.value === 'active') status.value = 'draft';
    return;
  }

  if (event.target.id === 'invite-status') {
    const activeToggle = document.getElementById('invite-active');
    if (activeToggle) activeToggle.checked = event.target.value === 'active';
    return;
  }

  if (event.target.id === 'card-avatar') {
    state.cardEditor.pendingAvatarFile = event.target.files?.[0] || null;
    const hint = event.target.closest('.qd-admin-field')?.querySelector('.qd-admin-field-hint');
    if (hint) {
      hint.textContent = state.cardEditor.pendingAvatarFile?.name || state.cardEditor.draft?.avatar || 'Uploads to Firebase Storage at cards/[slug]/avatar.jpg';
    }
    return;
  }

  if (event.target.id === 'card-slug') {
    validateCardSlug(event.target.value).catch((error) => {
      setCardEditorSlugState('invalid', error?.message || 'Slug check failed.');
    });
    return;
  }

  if (event.target.matches?.('[data-qe-care-plan]')) {
    const plan = getCarePlan(event.target.value);
    if (plan && state.quoteDrawer.quote) {
      applyQuoteChange('carePlanName', plan.name.en);
      applyQuoteChange('careMonthly', plan.monthly);
      render();
    }
    return;
  }

  if (event.target.dataset.qaction === 'add-from-catalog') {
    const key = event.target.value;
    if (!key || !state.quoteDrawer.quote) return;
    const line = catalogToLineItem(key);
    if (line) {
      state.quoteDrawer.quote.lineItems.push(line);
      markQuoteDirty();
      event.target.value = '';
      render();
    }
  }

  if (event.target.dataset.qaction === 'add-package') {
    const pkgId = event.target.value;
    if (!pkgId || !state.quoteDrawer.quote) return;
    const pkg = getPackage(pkgId);
    if (pkg) {
      state.quoteDrawer.quote.lineItems.push(packageToQuoteLine(pkg));
      markQuoteDirty();
      event.target.value = '';
      render();
    }
  }
});

document.addEventListener('submit', async (event) => {
  if (event.target.id === 'custom-quote-form') {
    event.preventDefault(); const form = event.target; const button = form.querySelector('[type=submit]'); button.disabled = true;
    try { const token = await auth.currentUser.getIdToken(); const data = Object.fromEntries(new FormData(form)); const response = await fetch('/api/quote-create', {method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`}, body:JSON.stringify({custom:true, ...data})}); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not create quotation'); state.newQuoteMode = false; await goToQuotationDetail(result); }
    catch (error) { button.disabled = false; showAdminToast(error.message); }
    return;
  }
  if (event.target.id === 'shared-bank-form') {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    Object.assign(state.bankFlow, values);
    if (state.bankFlow.step === 2 && state.bankFlow.type === 'bill') state.bankFlow.monthly = values.monthly === 'on';
    if (state.bankFlow.currency === 'USD' && !state.sharedBankRate) { state.sharedLedgerError = 'Current exchange rate is unavailable. Please try again.'; render(); return; }
    if (state.bankFlow.step < 3) { bankTap(); state.bankFlow.step += 1; render(); focusBankFlow(); }
    else { const f = state.bankFlow; await submitSharedBank({type:f.type, amount:f.amount, currency:f.currency || 'AED', note:f.note, due:f.due, monthly:f.monthly ? 'on' : '', repeatMonths:f.repeatMonths || 1}); }
    return;
  }
  if (event.target.id === 'quotation-search-form') {
    event.preventDefault();
    state.paymentLookup.search = event.target.elements.q?.value || '';
    syncAdminTabUrl();
    await loadQuotesList({ keepDetail: false });
  }
  if (event.target.id === 'quote-workflow-form') {
    event.preventDefault();
    try {
      await updateSelectedQuote({ status: event.target.elements.status?.value || 'draft' });
      showAdminToast('Status saved.');
    } catch (error) {
      showAdminToast(error.message || 'Could not save status.');
    }
  }
  if (event.target.id === 'quote-remarks-form') {
    event.preventDefault();
    try {
      await updateSelectedQuote({ remarks: event.target.elements.remarks?.value || '' });
      showAdminToast('Remarks saved.');
    } catch (error) {
      showAdminToast(error.message || 'Could not save remarks.');
    }
  }
  if (event.target.id === 'quote-golive-form') {
    event.preventDefault();
    try {
      await updateSelectedQuote({ markGoLive: true, goLiveDate: event.target.elements.goLiveDate?.value || todayInputValue() });
      await loadCollections();
      showAdminToast('Go-live saved.');
    } catch (error) {
      showAdminToast(error.message || 'Could not save go-live.');
    }
  }
  if (event.target.id === 'quote-milestones-form') {
    event.preventDefault();
    const milestoneDueDates = {};
    for (const element of Array.from(event.target.elements)) {
      if (element.name && element.type === 'date') milestoneDueDates[element.name] = element.value || '';
    }
    try {
      await updateSelectedQuote({ milestoneDueDates });
      await loadCollections();
      showAdminToast('Due dates saved.');
    } catch (error) {
      showAdminToast(error.message || 'Could not save due dates.');
    }
  }
  if (event.target.id === 'quote-payment-form') {
    event.preventDefault();
    await submitQuotePayment(event.target);
  }
  if (event.target.id === 'card-editor-form') {
    event.preventDefault();
    await saveCardEditor();
  }
  if (event.target.id === 'demo-editor-form') {
    event.preventDefault();
    await saveDemoEditor();
  }
  if (event.target.id === 'invitation-editor-form') {
    event.preventDefault();
    await saveInvitationEditor();
  }
  if (event.target.id === 'outreach-editor-form') {
    event.preventDefault();
    await saveOutreachLeadEditor();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.navOpen) {
    setAdminNavOpen(false);
    root.querySelector('.qd-nav-toggle')?.focus({ preventScroll: true });
    return;
  }
  if (event.key === 'Escape') {
    if (state.demoEditor.open) {
      closeDemoEditor();
      return;
    }
    if (state.invitationEditor.open) {
      closeInvitationEditor();
      return;
    }
    if (state.cardEditor.open) {
      closeCardEditor();
      return;
    }
    if (state.outreachEditor.open) {
      closeOutreachEditor();
      return;
    }
    if (state.quoteDrawer.open) {
      closeQuoteDrawer();
      return;
    }
    if (state.selectedId) {
      closeDrawer();
      return;
    }
    if (state.activeTab === 'payments' && (state.paymentLookup.quote || state.paymentLookup.loading)) closeQuotationDetail();
  }
});

// ═══════════════════════════════════════════════════════════════
// Quotation generator
// ═══════════════════════════════════════════════════════════════

const escAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escTxt = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const subscribeToQuotes = () => {
  if (unsubscribeQuotesSnapshot) {
    unsubscribeQuotesSnapshot();
    unsubscribeQuotesSnapshot = null;
  }
  const quotesRef = collection(db, 'quotes');
  unsubscribeQuotesSnapshot = onSnapshot(
    quotesRef,
    (snap) => {
      const map = {};
      let awaiting = 0;
      snap.forEach((d) => {
        const data = d.data();
        if (String(data.status || '').toLowerCase() === 'sent') awaiting += 1;
        if (data.submissionId) map[data.submissionId] = { id: d.id, ...data };
      });
      state.quotesBySubmissionId = map;
      state.overviewQuotesAwaiting = awaiting;
      if (state.activeTab === 'overview' && !state.collections.loading) loadCollections();
      if (state.quoteDrawer.open && state.quoteDrawer.quote?.id) {
        const d = state.quoteDrawer;
        const fresh = Object.values(map).find((q) => q.id === d.quote.id);
        const freshMs = timestampMs(fresh?.updatedAt);
        if (!fresh || d.saving) {
          // our own save is in flight; its response sets the new base version
        } else if (!d.dirty) {
          d.quote = prepareQuoteForEditing({ ...fresh, lineItems: [...(fresh.lineItems || [])] });
          d.original = deepCloneForLog(getQuoteLogState(fresh));
          if (freshMs) d.baseUpdatedMs = freshMs;
        } else if (!d.baseUpdatedMs) {
          d.baseUpdatedMs = freshMs;
        } else if (freshMs > d.baseUpdatedMs) {
          d.saveState = 'conflict';
          clearTimeout(quoteAutosaveTimer);
        }
      }
      render();
    },
    (err) => {
      console.warn('[quotes] snapshot error (likely Firestore rules deny):', err?.message || err);
      showToast('Quotes collection blocked by Firestore rules.');
    }
  );
};

const renderQuoteButton = (submission) => {
  const q = state.quotesBySubmissionId[submission.id];
  if (!q) {
    return `<button class="qd-btn qd-btn-sm qd-admin-action-primary" type="button" data-action="generate-quote" data-submission-id="${escAttr(submission.id)}">+ Generate Quotation</button>`;
  }
  if (q.status === 'draft') {
    return `<button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="open-quote" data-quote-id="${escAttr(q.id)}">Edit Quote · ${escTxt(q.quoteNumber)}</button>`;
  }
  return `<button class="qd-btn qd-btn-sm qd-admin-action-secondary qd-btn-with-dot" type="button" data-action="open-quote" data-quote-id="${escAttr(q.id)}">View Quote · ${escTxt(q.quoteNumber)}</button>`;
};

const goToQuotationDetail = async (quote) => {
  if (!quote) return;
  state.activeTab = 'payments';
  state.paymentLookup.search = '';
  syncAdminTabUrl();
  render();
  await openQuotationDetail(quote.id || quote.quoteNumber, { edit: true });
  await loadQuotesList({ keepDetail: true });
};

const openQuoteFromSubmission = async (submissionId) => {
  const existing = state.quotesBySubmissionId[submissionId];
  if (existing) {
    await goToQuotationDetail(existing);
    return;
  }
  try {
    const user = auth.currentUser;
    if (!user) { showToast('Not signed in.'); return; }
    const token = await user.getIdToken();
    console.log('[quote-create] requesting API', { submissionId, endpoint: '/api/quote-create' });
    const res = await fetch('/api/quote-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ submissionId })
    });
    console.log('[quote-create] response status', res.status, res.statusText);
    if (!res.ok) {
      if (res.status === 404) {
        showToast('Quote API is missing or not deployed.');
        return;
      }
      const err = await res.json().catch(() => ({}));
      console.error('[quote-create] API failure payload:', err);
      // If quote already exists (409), open the existing one
      if (res.status === 409 && err.existing) {
        state.quotesBySubmissionId[submissionId] = err.existing;
        await goToQuotationDetail(err.existing);
        return;
      }
      showToast(`Could not create: ${err.error || res.status}`);
      return;
    }
    const created = await res.json();
    state.quotesBySubmissionId[submissionId] = created;
    const submission = state.submissions.find((item) => item.id === submissionId) || null;
    await logAdminActivity({
      action: 'create_quote',
      targetType: 'quote',
      targetId: submissionId,
      targetLabel: created.quoteNumber || getSubmissionActivityLabel(submission),
      metadata: {
        quoteId: created.id,
        submissionId,
        submissionLabel: submission ? getSubmissionActivityLabel(submission) : submissionId
      }
    });
    await goToQuotationDetail(created);
  } catch (e) {
    console.error('[quote-create] error:', e);
    showToast('Quote API is missing or not deployed.');
  }
};

const openQuoteByQuoteId = (quoteId) => {
  const q = Object.values(state.quotesBySubmissionId).find((x) => x.id === quoteId);
  if (!q) { showToast('Quote not found'); return; }
  openQuoteDrawer(q);
};

const quoteTermsToEditable = (terms) => {
  const value = terms && typeof terms === 'object' ? terms.en : terms;
  if (Array.isArray(value)) return { en: value.map(String), ar: Array.isArray(terms?.ar) ? terms.ar.map(String) : [], custom: terms?.custom === true };
  const en = String(value || '').split(/\n+/).map((item) => item.trim()).filter(Boolean);
  const arValue = terms && typeof terms === 'object' ? terms.ar : '';
  const ar = Array.isArray(arValue) ? arValue.map(String) : String(arValue || '').split(/\n+/).map((item) => item.trim()).filter(Boolean);
  return { en, ar, custom: terms?.custom === true };
};

const prepareQuoteForEditing = (quote = {}) => {
  const lineItems = deepCloneForLog(quote.lineItems || [])
    .filter((line) => line?.catalogKey !== 'monthly-care')
    .map((line) => ({
      ...line,
      name: typeof line.name === 'object' ? { ...line.name } : { en: String(line.name || ''), ar: '' },
      includes: Array.isArray(line.includes)
        ? line.includes.map(String)
        : (Array.isArray(line.includedGroups)
          ? line.includedGroups.flatMap((group) => (group.includes || []).map((item) => group.label ? `${group.label}: ${item}` : item))
          : []),
      includedGroups: []
    }));
  // No care field -> "No monthly plan" (AED 0) until the admin picks one.
  const care = resolveQuoteCareForEditing(quote);
  return {
    ...quote,
    vatInclusive: quote.vatInclusive !== false,
    vatPercent: quote.vatInclusive === false ? Number(quote.vatPercent) || 5 : 0,
    careMonthly: care.careMonthly,
    carePlanName: care.carePlanName,
    lineItems,
    terms: quoteTermsToEditable(quote.terms),
    notes: typeof quote.notes === 'string' ? { en: quote.notes, ar: '' } : (quote.notes || { en: '', ar: '' }),
    pages: { ...(quote.pages || {}), price: Number(quote.pages?.price) || 0 }
  };
};

const openQuoteDrawer = (quote) => {
  lastModalOpenedAt = Date.now();
  clearTimeout(quoteAutosaveTimer);
  clearTimeout(quoteRetryTimer);
  const serverDoc = getServerQuoteDoc(quote?.id);
  // The payment view has no carePlanName; take it from the realtime quote doc
  // so a Care Lite quote does not open labelled "Care Basic".
  const editableQuote = prepareQuoteForEditing({ ...quote, carePlanName: quote?.carePlanName ?? serverDoc?.carePlanName });
  const baseUpdatedMs = timestampMs(quote?.updatedAt) || timestampMs(serverDoc?.updatedAt) || 0;
  const local = readQuoteLocalCopy(editableQuote.id);
  let restoreOffer = null;
  if (local) {
    const same = JSON.stringify(local.fields) === JSON.stringify(pickQuoteEditableFields(editableQuote));
    if (same) clearQuoteLocalCopy(editableQuote.id);
    else restoreOffer = { savedAt: Number(local.savedAt) || Date.now(), serverNewer: Boolean(baseUpdatedMs && baseUpdatedMs > (Number(local.savedAt) || 0)) };
  }
  state.quoteDrawer = {
    open: true,
    quote: editableQuote,
    original: deepCloneForLog(getQuoteLogState(quote)),
    dirty: false,
    ui: createQuoteEditorUi(),
    rev: 0,
    saving: false,
    saveState: 'saved',
    saveError: '',
    lastSavedAt: 0,
    baseUpdatedMs,
    retryCount: 0,
    closeFailed: false,
    restoreOffer,
    enterAnim: true
  };
  render();
  // Play the entrance animation once, not on every re-render.
  state.quoteDrawer.enterAnim = false;
};

// Returns true when the editor closed. If the save on close fails, the editor
// stays open with Retry / Discard so nothing is lost silently.
const closeQuoteDrawer = async ({ autosave = true } = {}) => {
  const d = state.quoteDrawer;
  if (autosave && d?.open) {
    if (d.saving && quoteSaveInFlight) await quoteSaveInFlight;
    if (state.quoteDrawer !== d) return true;
    if (d.dirty) {
      showToast('Saving your changes…');
      const saved = await saveQuoteDrawer({ markSent: false, copy: false, silent: true });
      if (state.quoteDrawer !== d) return true;
      if (!saved) {
        d.closeFailed = true;
        render();
        showToast('Not saved yet. Your changes are still here.');
        return false;
      }
    }
  }
  clearTimeout(quoteAutosaveTimer);
  clearTimeout(quoteRetryTimer);
  state.quoteDrawer = { open: false, quote: null, original: null, dirty: false };
  render();
  return true;
};

const shouldIgnoreImmediateModalClose = (actionTarget) => {
  if (!actionTarget) return false;
  const action = String(actionTarget.dataset.action || '');
  if (!action.startsWith('close-')) return false;

  const isBackdropClick = actionTarget.classList.contains('qd-admin-modal-backdrop')
    || actionTarget.classList.contains('qd-quote-overlay');

  if (!isBackdropClick) return false;
  return Date.now() - lastModalOpenedAt < 250;
};

const applyQuoteChange = (path, value) => {
  const q = state.quoteDrawer.quote;
  if (!q) return;
  const parts = path.split('.');
  const isLine = /^\d+$/.test(parts[0]);
  if (isLine) {
    const idx = Number(parts[0]);
    if (!q.lineItems[idx]) return;
    let cur = q.lineItems[idx];
    for (let i = 1; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (parts[1] === 'includes') {
      if (!Array.isArray(q.lineItems[idx].includes)) q.lineItems[idx].includes = [];
      q.lineItems[idx].includes[Number(parts[2])] = String(value || '').trim();
      q.lineItems[idx].includedGroups = [];
    } else {
      cur[last] = (last === 'qty' || last === 'unitPrice') ? Number(value) || 0 : value;
    }
  } else {
    let cur = q;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    const last = parts[parts.length - 1];
    if (last === 'vatInclusive') {
      cur[last] = value === true || value === 'true' || value === 'on';
      if (cur[last]) q.vatPercent = 0;
    } else {
      cur[last] = (last === 'validDays' || last === 'vatPercent' || last === 'careMonthly' || path === 'pages.price') ? Number(value) || 0 : value;
    }
  }
  markQuoteDirty();
};

// ── Quote editor save safety ───────────────────────────────────────────
// Debounced background autosave (draft quotes only), a local safety copy of
// the editable fields, conflict detection from the realtime quotes snapshot
// (no extra requests), retry with backoff on network failure, and no silent
// loss on close. The save itself still goes through saveQuoteDrawer.
const QUOTE_AUTOSAVE_DELAY = 2500;
const QUOTE_RETRY_DELAYS = [2000, 4000, 8000, 16000, 30000];
const QUOTE_LOCAL_PREFIX = 'qd-admin-quote-draft:';
// Only the fields the editor can change. Never the passcode, hash, payments,
// schedule or any other server-owned field.
const QUOTE_LOCAL_FIELDS = ['customer', 'lineItems', 'pages', 'terms', 'notes', 'validDays', 'vatInclusive', 'vatPercent', 'careMonthly', 'carePlanName', 'language'];

let quoteAutosaveTimer = 0;
let quoteRetryTimer = 0;
let quoteLocalCopyTimer = 0;
let quoteSaveInFlight = null;

const timestampMs = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value === 'object') {
    const seconds = value._seconds ?? value.seconds;
    if (Number.isFinite(Number(seconds))) return Number(seconds) * 1000 + Math.floor((Number(value._nanoseconds ?? value.nanoseconds) || 0) / 1e6);
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getServerQuoteDoc = (id) => Object.values(state.quotesBySubmissionId || {}).find((item) => item?.id === id) || null;

const pickQuoteEditableFields = (q = {}) => {
  const fields = {};
  QUOTE_LOCAL_FIELDS.forEach((key) => {
    if (q[key] !== undefined) fields[key] = deepCloneForLog(q[key]);
  });
  return fields;
};

const readQuoteLocalCopy = (id) => {
  if (!id) return null;
  try {
    const raw = window.localStorage.getItem(QUOTE_LOCAL_PREFIX + id);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && parsed.fields && typeof parsed.fields === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const writeQuoteLocalCopy = () => {
  const d = state.quoteDrawer;
  if (!d?.open || !d.quote?.id || !d.dirty) return;
  try {
    window.localStorage.setItem(QUOTE_LOCAL_PREFIX + d.quote.id, JSON.stringify({
      savedAt: Date.now(),
      baseUpdatedMs: d.baseUpdatedMs || 0,
      fields: pickQuoteEditableFields(d.quote)
    }));
  } catch {
    /* storage full or blocked: the in-memory edits still exist */
  }
};

const clearQuoteLocalCopy = (id) => {
  if (!id) return;
  clearTimeout(quoteLocalCopyTimer);
  try { window.localStorage.removeItem(QUOTE_LOCAL_PREFIX + id); } catch { /* ignore */ }
};

const isQuoteSaveBlocked = (d = state.quoteDrawer) => Boolean(d?.saving || d?.saveState === 'failed' || d?.saveState === 'conflict');

const isQuoteAutosaveEligible = (d = state.quoteDrawer) => Boolean(
  d?.open && d.quote?.id && d.dirty && !d.saving && !d.translationPending && d.saveState !== 'conflict' && getQuoteWorkflowValue(d.quote) === 'draft'
);

const scheduleQuoteAutosave = (delay = QUOTE_AUTOSAVE_DELAY) => {
  clearTimeout(quoteAutosaveTimer);
  if (!isQuoteAutosaveEligible()) return;
  quoteAutosaveTimer = setTimeout(() => {
    if (isQuoteAutosaveEligible()) saveQuoteDrawer({ silent: true, background: true });
  }, delay);
};

const scheduleQuoteRetry = (d) => {
  clearTimeout(quoteRetryTimer);
  const attempt = d.retryCount || 0;
  if (attempt >= QUOTE_RETRY_DELAYS.length) return;
  d.retryCount = attempt + 1;
  quoteRetryTimer = setTimeout(() => {
    if (state.quoteDrawer === d && d.dirty && !d.saving && d.saveState === 'failed') {
      saveQuoteDrawer({ silent: true, background: true, isRetry: true });
    }
  }, QUOTE_RETRY_DELAYS[attempt]);
};

// Called for every edit (replaces the old `state.quoteDrawer.dirty = true`).
const markQuoteDirty = () => {
  const d = state.quoteDrawer;
  if (!d?.open || !d.quote) return;
  d.dirty = true;
  d.rev = (d.rev || 0) + 1;
  if (d.saveState !== 'conflict' && d.saveState !== 'failed') d.saveState = d.saving ? 'saving' : 'dirty';
  clearTimeout(quoteLocalCopyTimer);
  quoteLocalCopyTimer = setTimeout(writeQuoteLocalCopy, 400);
  if (d.quote.language === 'ar' && !quoteTranslationWriting) {
    d.translationPending = true;
    clearTimeout(quoteTranslationTimer);
    quoteTranslationTimer = setTimeout(async () => {
      if (state.quoteDrawer !== d || d.quote.language !== 'ar') return;
      if (await translateQuoteToArabic(d.quote)) { if (state.quoteDrawer === d) { d.translationPending = false; scheduleQuoteAutosave(); render(); } } else if (state.quoteDrawer === d) { showAdminToast('Translation could not finish. Switch to English or try Arabic again.'); }
    }, 1800);
  } else if (d.quote.language !== 'ar') { d.translationPending = false; }
  scheduleQuoteAutosave();
  refreshQuoteSaveUi();
};

const formatQuoteSaveTime = (ms) => (ms
  ? new Date(ms).toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })
  : '');

const renderQuoteSaveStatus = () => {
  const d = state.quoteDrawer || {};
  const isDraft = getQuoteWorkflowValue(d.quote) === 'draft';
  if (d.saving || d.saveState === 'saving') {
    return '<span class="qd-qe-dirty is-saving" data-qe-dirty role="status">Saving…</span>';
  }
  if (d.saveState === 'failed') {
    return '<span class="qd-qe-dirty is-failed" data-qe-dirty role="status">Save failed <button type="button" class="qd-qe-status-btn" data-action="quote-editor-retry">Retry</button></span>';
  }
  if (d.saveState === 'conflict') {
    return '<span class="qd-qe-dirty is-failed" data-qe-dirty role="status">Changed elsewhere</span>';
  }
  if (d.dirty) {
    return `<span class="qd-qe-dirty is-dirty" data-qe-dirty role="status">Unsaved changes${isDraft ? ' · autosaves' : ''}</span>`;
  }
  return `<span class="qd-qe-dirty" data-qe-dirty role="status">${d.lastSavedAt ? `Saved ${escTxt(formatQuoteSaveTime(d.lastSavedAt))}` : 'All changes saved'}</span>`;
};

const renderQuoteEditorBanner = () => {
  const d = state.quoteDrawer || {};
  let body = '';
  if (d.saveState === 'conflict') {
    body = `
      <p><strong>This quote was saved somewhere else after you opened it.</strong> Autosave is paused so nothing is overwritten.</p>
      <div class="qd-qe-banner-actions">
        <button type="button" class="qd-btn qd-admin-action-secondary" data-action="quote-editor-load-latest">Load latest (discard mine)</button>
        <button type="button" class="qd-btn qd-admin-action-primary" data-action="quote-editor-keep-mine">Keep mine and save</button>
      </div>`;
  } else if (d.saveState === 'failed' || d.closeFailed) {
    body = `
      <p><strong>Your changes are not saved yet.</strong> ${escTxt(d.saveError || 'The server could not be reached.')} A copy is kept on this device${d.retryCount && d.retryCount < QUOTE_RETRY_DELAYS.length ? ' and it will retry automatically' : ''}.</p>
      <div class="qd-qe-banner-actions">
        <button type="button" class="qd-btn qd-admin-action-primary" data-action="quote-editor-retry">Retry now</button>
        <button type="button" class="qd-btn qd-admin-action-danger" data-action="quote-editor-discard">Discard changes and close</button>
      </div>`;
  } else if (d.restoreOffer) {
    body = `
      <p><strong>Unsaved changes from ${escTxt(new Date(d.restoreOffer.savedAt).toLocaleString('en-AE', { dateStyle: 'medium', timeStyle: 'short' }))} were found on this device.</strong>${d.restoreOffer.serverNewer ? ' The quote was saved again after that, so check before restoring.' : ''}</p>
      <div class="qd-qe-banner-actions">
        <button type="button" class="qd-btn qd-admin-action-primary" data-action="quote-editor-restore">Restore unsaved changes</button>
        <button type="button" class="qd-btn qd-admin-action-secondary" data-action="quote-editor-restore-discard">Discard them</button>
      </div>`;
  }
  return `<div class="qd-qe-banner ${body ? 'is-visible' : ''} ${d.saveState === 'failed' || d.saveState === 'conflict' || d.closeFailed ? 'is-warning' : ''}" data-qe-banner role="${body ? 'alert' : 'presentation'}">${body}</div>`;
};

// Patch the status, banner and send-button states without a full render, so
// typing is never interrupted by a background save.
const refreshQuoteSaveUi = () => {
  const drawer = document.getElementById('qd-quote-drawer');
  if (!drawer) return;
  const status = drawer.querySelector('[data-qe-dirty]');
  if (status) status.outerHTML = renderQuoteSaveStatus();
  const banner = drawer.querySelector('[data-qe-banner]');
  if (banner) banner.outerHTML = renderQuoteEditorBanner();
  const blocked = isQuoteSaveBlocked();
  drawer.querySelectorAll('[data-qe-needs-clean]').forEach((button) => {
    button.disabled = blocked;
    button.title = blocked ? 'Available once your changes are saved' : '';
  });
};

const guardQuoteSendAction = () => {
  if (!isQuoteSaveBlocked()) return true;
  const d = state.quoteDrawer;
  showToast(d.saving ? 'Wait for the save to finish.' : 'Save your changes first so the client never sees an older version.');
  return false;
};

window.addEventListener('beforeunload', (event) => {
  const d = state.quoteDrawer;
  if (d?.open && (d.dirty || d.saving)) {
    event.preventDefault();
    event.returnValue = '';
  }
});

window.addEventListener('online', () => {
  const d = state.quoteDrawer;
  if (d?.open && d.dirty && !d.saving && d.saveState === 'failed') {
    d.retryCount = 0;
    saveQuoteDrawer({ silent: true, background: true, isRetry: true });
  }
});

const updateQuoteTotalsPreview = () => {
  const q = state.quoteDrawer.quote;
  if (!q) return;
  const normalized = normalizeQuoteForTemplate(q);
  const total = document.querySelector('#qd-quote-drawer .tot .r');
  if (total) total.textContent = `AED ${formatAED(normalized.totals.grandTotal)}`;
  const metaValues = document.querySelectorAll('#qd-quote-drawer .docmeta .metarow .v');
  if (metaValues[1]) metaValues[1].textContent = normalized.validUntil;
  const schedule = document.querySelectorAll('#qd-quote-drawer .pay td:last-child');
  normalized.paymentSchedule.forEach((item, idx) => {
    if (schedule[idx]) schedule[idx].textContent = `AED ${formatAED(item.amount)}`;
  });
  const strip = document.querySelector('#qd-quote-drawer .qd-quote-admin-strip');
  if (strip) strip.outerHTML = renderQuoteAdminStrip(q);
  const paymentPreview = document.querySelector('#qd-quote-drawer .qd-quote-payment-panel');
  if (paymentPreview) paymentPreview.outerHTML = renderQuoteDrawerPaymentSummary(q);
  scheduleQuoteEditorRefresh();
};

// Coalesce keystrokes into one preview/totals refresh per frame (no full render,
// so the field being typed in keeps focus).
let quoteEditorRefreshFrame = 0;
const scheduleQuoteEditorRefresh = () => {
  if (quoteEditorRefreshFrame) return;
  quoteEditorRefreshFrame = requestAnimationFrame(() => {
    quoteEditorRefreshFrame = 0;
    const q = state.quoteDrawer.quote;
    const drawer = document.getElementById('qd-quote-drawer');
    if (!q || !drawer) return;
    const totals = drawer.querySelector('#qd-qe-totals');
    if (totals) totals.innerHTML = renderQuoteEditorTotals(q);
    const wizardTotal = drawer.querySelector('[data-qe-wizard-total]');
    if (wizardTotal) wizardTotal.textContent = `Total: AED ${formatAED(normalizeQuoteForTemplate(q).totals.grandTotal)}`;
    const doc = drawer.querySelector('#qd-qe-preview-doc');
    if (doc) doc.innerHTML = renderQuoteEditorPreviewDoc(q);
    (q.lineItems || []).forEach((line, idx) => {
      const cell = drawer.querySelector(`[data-qe-line-total="${idx}"]`);
      if (cell) cell.textContent = `AED ${formatAED((Number(line.qty) || 0) * (Number(line.unitPrice) || 0))}`;
    });
    refreshQuoteSaveUi();
    const vatInput = drawer.querySelector('.qd-qe-form [data-qfield="vatPercent"]');
    if (vatInput) vatInput.disabled = q.vatInclusive !== false;
  });
};

// Payload and endpoint are unchanged (PATCH /api/quote-save, whitelisted
// fields). Adds: in-flight tracking, conflict check, edit-revision tracking so
// edits typed during a save stay dirty, and retry with backoff on network errors.
const saveQuoteDrawer = async ({ markSent = false, copy = false, silent = false, background = false, force = false, isRetry = false } = {}) => {
  const d = state.quoteDrawer;
  const q = d?.quote;
  if (!q) return false;
  if (d.translationPending) { if (!background) showAdminToast('Wait for Arabic translation to finish before saving.'); return false; }
  if (d.saving) {
    if (background) { d.pendingAutosave = true; return false; }
    if (quoteSaveInFlight) await quoteSaveInFlight;
    if (state.quoteDrawer !== d) return false;
  }
  clearTimeout(quoteAutosaveTimer);

  // Conflict: the realtime snapshot shows a newer server version than the one
  // this editor started from. Never overwrite it silently.
  const serverMs = timestampMs(getServerQuoteDoc(q.id)?.updatedAt);
  if (!force && d.baseUpdatedMs && serverMs > d.baseUpdatedMs) {
    d.saveState = 'conflict';
    refreshQuoteSaveUi();
    if (background) return false;
    if (!window.confirm('This quote was saved somewhere else after you opened it. Replace that version with yours?')) return false;
  }

  const rev0 = d.rev || 0;
  d.saving = true;
  d.saveState = 'saving';
  refreshQuoteSaveUi();

  const attempt = (async () => {
    let retryable = false;
    try {
      const user = auth.currentUser;
      if (!user) throw Object.assign(new Error('Not signed in.'), { retryable: false });
      const token = await user.getIdToken();
      const cleanLineItems = (q.lineItems || [])
        .filter((line) => line?.catalogKey !== 'monthly-care')
        .map((line) => ({
          ...line,
          qty: Number(line.qty) || 0,
          unitPrice: Number(line.unitPrice) || 0,
          includes: Array.isArray(line.includes) ? line.includes.map((item) => String(item || '').trim()).filter(Boolean) : [],
          includedGroups: []
        }));
      const updates = {
        customer: q.customer,
        lineItems: cleanLineItems,
        pages: q.pages,
        terms: quoteTermsToEditable(q.terms),
        notes: q.notes,
        validDays: q.validDays,
        vatInclusive: q.vatInclusive !== false,
        vatPercent: q.vatInclusive === false ? Number(q.vatPercent) || 0 : 0,
        careMonthly: Number(q.careMonthly) || 0,
        carePlanName: q.carePlanName || 'Care Basic',
        language: q.language || 'en'
      };
      // Log field names only: no client data, passcode or token in the console.
      console.log('[quote-save] requesting API', { id: q.id, markSent, background, fields: Object.keys(updates) });
      let res;
      try {
        res = await fetch('/api/quote-save', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ id: q.id, updates, markSent })
        });
      } catch (networkError) {
        throw Object.assign(new Error(navigator.onLine === false ? 'You are offline.' : 'The server could not be reached.'), { retryable: true });
      }
      console.log('[quote-save] response status', res.status);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[quote-save] API failure:', body?.error || res.status);
        throw Object.assign(new Error(body?.error ? `Save failed: ${body.error}` : `Save failed (${res.status}).`), { retryable: res.status >= 500 || res.status === 408 || res.status === 429 });
      }

      d.saving = false;
      d.retryCount = 0;
      d.closeFailed = false;
      d.saveError = '';
      d.lastSavedAt = Date.now();
      d.baseUpdatedMs = timestampMs(body?.updatedAt) || Math.max(d.baseUpdatedMs || 0, serverMs || 0);
      if ((d.rev || 0) === rev0) {
        d.dirty = false;
        d.saveState = 'saved';
        clearQuoteLocalCopy(q.id);
      } else {
        d.saveState = 'dirty';
      }
      if (markSent) {
        q.status = 'sent';
        q.workflowStatus = 'sent';
      }
      d.original = deepCloneForLog(getQuoteLogState(q));
      if (state.quoteDrawer === d) {
        if (background) refreshQuoteSaveUi();
        else render();
      }
      if (d.dirty || d.pendingAutosave) {
        d.pendingAutosave = false;
        scheduleQuoteAutosave();
      }
      if (!background && state.activeTab === 'payments') {
        queueMicrotask(() => {
          loadQuotesList({ keepDetail: true });
          if (state.paymentLookup.quote?.id === q.id) openQuotationDetail(q.id);
        });
      }
      if (copy) {
        const url = `${location.origin}/q/${q.id}`;
        const text = `Your quotation from QD Systems:\n${url}\nPasscode: ${getQuotePasscode(q) || '(check admin)'}`;
        try {
          await navigator.clipboard.writeText(text);
          showToast('Link copied — paste into WhatsApp.');
        } catch {
          prompt('Copy this link manually:', text);
        }
      } else if (!silent) {
        showToast(markSent ? 'Saved and marked as sent.' : 'Saved.');
      }
      return true;
    } catch (error) {
      retryable = Boolean(error?.retryable);
      d.saving = false;
      d.saveState = 'failed';
      d.saveError = error?.message || 'Save failed.';
      if (!d.dirty) d.dirty = true;
      writeQuoteLocalCopy();
      if (retryable) scheduleQuoteRetry(d);
      if (state.quoteDrawer === d) refreshQuoteSaveUi();
      if (!silent || (background && !isRetry && (d.retryCount || 0) <= 1)) {
        showToast(retryable ? `${d.saveError} Retrying automatically.` : d.saveError);
      }
      return false;
    }
  })();

  quoteSaveInFlight = attempt;
  try {
    return await attempt;
  } finally {
    if (quoteSaveInFlight === attempt) quoteSaveInFlight = null;
  }
};

async function getAdminIdToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  return user.getIdToken();
}

async function fetchQuotePaymentView(quoteRef) {
  const token = await getAdminIdToken();
  const res = await fetch(`/api/quote-payment?quoteRef=${encodeURIComponent(quoteRef)}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `Payment lookup failed: ${res.status}`);
  return payload;
}

async function loadQuotesList({ keepDetail = true } = {}) {
  state.paymentLookup = {
    ...state.paymentLookup,
    quotesLoading: true,
    quotesError: ''
  };
  render();

  try {
    const token = await getAdminIdToken();
    const params = new URLSearchParams();
    if (state.paymentLookup.search) params.set('q', state.paymentLookup.search);
    if (state.paymentLookup.status && state.paymentLookup.status !== 'All') params.set('status', state.paymentLookup.status);
    const res = await fetch(`/api/quotes${params.toString() ? `?${params}` : ''}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Quote list failed: ${res.status}`);
    state.paymentLookup = {
      ...state.paymentLookup,
      quotes: payload.quotes || [],
      quote: keepDetail ? state.paymentLookup.quote : null,
      quotesLoading: false,
      quotesError: ''
    };
    render();
  } catch (error) {
    state.paymentLookup = {
      ...state.paymentLookup,
      quotesLoading: false,
      quotesError: error.message || 'Could not load quotations.'
    };
    render();
  }
}

async function openQuotationDetail(quoteRef, { edit = false } = {}) {
  const cleanRef = String(quoteRef || '').trim();
  if (!cleanRef) {
    state.paymentLookup.error = 'Quote ref is required.';
    render();
    return;
  }

  state.paymentLookup = {
    ...state.paymentLookup,
    quoteRef: cleanRef,
    loading: true,
    error: ''
  };
  render();

  try {
    const quote = await fetchQuotePaymentView(cleanRef);
    state.paymentLookup = {
      ...state.paymentLookup,
      quoteRef: quote.quoteRef || cleanRef,
      quote,
      loading: false,
      error: ''
    };
    // Rows open the detail panel; the editor opens only when asked for.
    if (edit) openQuoteDrawer(quote);
    render();
  } catch (error) {
    state.paymentLookup = {
      ...state.paymentLookup,
      loading: false,
      error: error.message || 'Could not open quote.'
    };
    render();
  }
}

async function loadQuotePaymentsByRef(quoteRef) {
  await openQuotationDetail(quoteRef);
}

async function updateSelectedQuote(payload) {
  const quoteRef = String(state.paymentLookup.quote?.id || state.paymentLookup.quoteRef || '').trim();
  if (!quoteRef) return;
  const token = await getAdminIdToken();
  const res = await fetch('/api/quote-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ id: quoteRef, ...payload })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Quote update failed: ${res.status}`);
  await openQuotationDetail(quoteRef);
  await loadQuotesList({ keepDetail: true });
}

async function loadCollections() {
  state.collections = { ...state.collections, loading: true, error: '' };
  render();
  try {
    const token = await getAdminIdToken();
    const res = await fetch(`/api/collections?on=${encodeURIComponent(state.collections.on || todayInputValue())}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Collections failed: ${res.status}`);
    state.collections = { ...state.collections, loading: false, error: '', data: payload };
    render();
  } catch (error) {
    state.collections = { ...state.collections, loading: false, data: null, error: error.message || 'Could not load collections.' };
    render();
  }
}

async function markCollectionCollected(target) {
  const token = await getAdminIdToken();
  const res = await fetch('/api/collections-collect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      id: target.dataset.ref,
      itemKey: target.dataset.itemKey || '',
      type: target.dataset.type,
      monthKey: target.dataset.monthKey || '',
      milestoneKey: target.dataset.milestoneKey || '',
      collectedOn: todayInputValue(),
      method: 'Collection'
    })
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || `Collection update failed: ${res.status}`);
  showAdminToast('Marked collected.');
  await loadCollections();
  if (state.paymentLookup.quote?.id === target.dataset.ref) await openQuotationDetail(target.dataset.ref);
  await loadQuotesList({ keepDetail: true });
}

async function submitQuotePayment(form) {
  const quoteRef = String(state.paymentLookup.quote?.quoteRef || state.paymentLookup.quoteRef || '').trim();
  if (!quoteRef) {
    state.paymentLookup.error = 'Open a quote before logging a payment.';
    render();
    return;
  }

  const payment = {
    itemKey: form.elements.namedItem('itemKey')?.value || '',
    amount: form.elements.amount?.value || '',
    date: form.elements.date?.value || '',
    method: form.elements.method?.value || '',
    note: form.elements.note?.value || ''
  };
  if (!payment.itemKey) { state.paymentLookup.error = 'Choose the installment or bill this payment is for.'; state.paymentLookup.paymentFormOpen = true; render(); return; }
  state.paymentLookup = {
    ...state.paymentLookup,
    saving: true,
    error: '',
    form: payment
  };
  render();

  try {
    const user = auth.currentUser;
    if (!user) throw new Error('Not signed in.');
    const token = await user.getIdToken();
    const res = await fetch('/api/quote-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ quoteRef, payment, requestId: state.paymentRequestId ||= crypto.randomUUID() })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Payment save failed: ${res.status}`);

    if (state.quoteDrawer.quote?.id === payload.id) {
      state.quoteDrawer.quote = {
        ...state.quoteDrawer.quote,
        payments: payload.payments,
        paid: payload.paid,
        balance: payload.balance,
        paymentStatus: payload.status
      };
    }
    state.paymentLookup = {
      ...state.paymentLookup,
      quoteRef: payload.quoteRef || quoteRef,
      quote: payload,
      saving: false,
      error: '',
      form: {
        amount: '',
        date: new Date().toISOString().slice(0, 10),
        method: payment.method || 'Bank transfer',
        note: ''
      }
    };
    state.paymentRequestId = null;
    state.paymentLookup.paymentFormOpen = false;
    showAdminToast('Payment logged and added to the shared bank.');
    await loadQuotesList({ keepDetail: true });
    await loadCollections();
    render();
  } catch (error) {
    state.paymentLookup = {
      ...state.paymentLookup,
      saving: false,
      error: error.message || 'Could not log payment.',
      form: payment
    };
    render();
  }
}

async function deleteSelectedQuote() {
  const quote = state.paymentLookup.quote;
  const quoteRef = String(quote?.id || state.paymentLookup.quoteRef || '').trim();
  if (!quoteRef) return;
  const label = quote.quoteNumber || quote.quoteRef || quoteRef;
  const confirmed = window.confirm(`Delete quote ${label}? This can't be undone.`);
  if (!confirmed) return;
  try {
    const token = await getAdminIdToken();
    const res = await fetch('/api/quote-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id: quoteRef, delete: true })
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `Quote delete failed: ${res.status}`);
    state.paymentLookup = { ...state.paymentLookup, quote: null, quoteRef: '' };
    showAdminToast('Quote deleted.');
    await loadQuotesList({ keepDetail: false });
    await loadCollections();
  } catch (error) {
    showAdminToast(error.message || 'Could not delete quote.');
  }
}

let toastTimeout = null;
const showToast = (msg) => {
  state.quoteToast = msg;
  render();
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    state.quoteToast = '';
    render();
  }, 2600);
};

// Same line shape the old "Add QD package" select produced.
const packageToQuoteLine = (pkg) => ({
  catalogKey: pkg.id,
  name: { en: pkg.name.en, ar: pkg.name.ar },
  description: { en: pkg.includes.join(' · '), ar: '' },
  qty: 1,
  unitPrice: pkg.oneTime
});

// Same /api/quote-update { id, status } call the detail panel's status form makes.
async function setQuoteWorkflowStatusFromEditor(status) {
  const q = state.quoteDrawer.quote;
  if (!q?.id) return;
  if (state.quoteDrawer.dirty) {
    const saved = await saveQuoteDrawer({ markSent: false, copy: false, silent: true });
    if (!saved) { showToast('Save failed, status not changed.'); return; }
  }
  try {
    const token = await getAdminIdToken();
    const res = await fetch('/api/quote-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id: q.id, status })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Quote update failed: ${res.status}`);
    q.status = status;
    q.workflowStatus = status;
    showToast('Status updated.');
    if (state.activeTab === 'payments') {
      await loadQuotesList({ keepDetail: true });
      if (state.paymentLookup.quote?.id === q.id) await openQuotationDetail(q.id);
    }
  } catch (error) {
    showToast(error.message || 'Could not update status.');
  }
}

const filterQuotePicker = (value) => {
  const ui = getQuoteEditorUi();
  ui.pickerSearch = value || '';
  const needle = ui.pickerSearch.trim().toLowerCase();
  const list = document.querySelector('#qd-quote-drawer .qd-qe-picker-list');
  if (!list) return;
  let visible = 0;
  list.querySelectorAll('[data-qe-picker-text]').forEach((item) => {
    const match = !needle || item.dataset.qePickerText.includes(needle);
    item.hidden = !match;
    if (match) visible += 1;
  });
  list.querySelectorAll('[data-qe-picker-group]').forEach((group) => {
    group.hidden = !group.querySelector('[data-qe-picker-text]:not([hidden])');
  });
  const empty = list.querySelector('[data-qe-picker-empty]');
  if (empty) empty.hidden = visible > 0;
};

const closeQuotationDetail = () => {
  state.paymentLookup = { ...state.paymentLookup, quote: null, quoteRef: '', loading: false, error: '' };
  render();
};

const renderQuoteDrawerPaymentSummary = (quote) => {
  const summary = getQuotePaymentSummary(quote);
  return `
    <div class="qd-quote-payment-panel">
      <div class="qd-quote-payment-head">
        <span>Payment status</span>
        ${renderPaymentStatusChip(summary.status)}
      </div>
      <div class="qd-quote-payment-grid">
        <div><span>Total</span><strong>AED ${escTxt(formatPaymentAED(summary.total))}</strong></div>
        <div><span>Paid</span><strong>AED ${escTxt(formatPaymentAED(summary.paid))}</strong></div>
        <div><span>Balance</span><strong>AED ${escTxt(formatPaymentAED(summary.balance))}</strong></div>
      </div>
    </div>
  `;
};

const renderQuoteAdminStrip = (quote) => {
  const normalized = normalizeQuoteForTemplate(quote);
  return `
    <div class="qd-quote-admin-strip">
      <div class="qd-quote-admin-metrics">
        <div><span>One-time</span><strong>AED ${escTxt(formatAED(normalized.totals.grandTotal))}</strong></div>
        <div><span>Advance ${q.paymentSplit === 50 ? 50 : 30}%</span><strong>AED ${escTxt(formatAED(normalized.paymentSchedule[0]?.amount || 0))}</strong></div>
        <div><span>Final ${q.paymentSplit === 50 ? 50 : 70}%</span><strong>AED ${escTxt(formatAED(normalized.paymentSchedule[1]?.amount || 0))}</strong></div>
        <div><span>Monthly care</span><strong>AED ${escTxt(formatAED(Number(quote.careMonthly) || 0))}/mo</strong></div>
      </div>
      <div class="qd-quote-admin-controls">
        <label>Valid <input class="qd-quote-input" type="number" min="1" data-qfield="validDays" value="${escAttr(quote.validDays ?? 30)}"> days</label>
        <label class="qd-quote-check"><input type="checkbox" data-qfield="vatInclusive" ${quote.vatInclusive !== false ? 'checked' : ''}> VAT inclusive</label>
        <label>VAT % <input class="qd-quote-input" type="number" min="0" max="100" data-qfield="vatPercent" value="${escAttr(quote.vatPercent ?? 0)}" ${quote.vatInclusive !== false ? 'disabled' : ''}></label>
        <label>Code <span class="qd-quote-passcode">${escTxt(quote._passcodePlain || quote.passcodePlain || '(hidden)')}</span></label>
      </div>
    </div>
  `;
};

// ── Quote editor (sectioned form + live document preview) ─────────────
// Presentation only. Field paths reuse the existing data-qfield / data-qline /
// data-qterm contract handled by applyQuoteChange, and totals come from
// normalizeQuoteForTemplate -> computeTotals. Save payload is unchanged.
const QE_SECTIONS = [
  ['client', 'Client'],
  ['services', 'Services & items'],
  ['pages', 'Pages & care'],
  ['terms', 'Terms & notes'],
  ['payments', 'Payments'],
  ['send', 'Send']
];

const getQuoteEditorUi = () => {
  if (!state.quoteDrawer.ui) state.quoteDrawer.ui = createQuoteEditorUi();
  return state.quoteDrawer.ui;
};

function createQuoteEditorUi() {
  const phone = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
  return {
    view: 'edit',
    step: 'client',
    expandedLine: 0,
    collapsed: phone ? { pages: true, terms: true, payments: true, send: true } : {},
    pickerOpen: false,
    pickerGroup: 'all',
    pickerSearch: ''
  };
}

const getQuotePasscode = (q) => q?._passcodePlain || q?.passcodePlain || '';
const getQuoteClientUrl = (q) => `${location.origin}/q/${q?.id || ''}`;
const isNonWebsiteQuote = q => /wedding|celebration|engagement|invitation|event|photo bucket|photo book|gender reveal/i.test(q.serviceType || q.notes?.en || '');
const getQuoteWorkflowValue = (q) => {
  const value = String(q?.workflowStatus || q?.status || 'draft').toLowerCase();
  if (value === 'active') return 'sent';
  return quoteWorkflowStatuses.includes(value) ? value : 'draft';
};

const formatPickerPrice = (amount, { from = false, monthly = false } = {}) => {
  if (!(Number(amount) > 0)) return 'Scope-based';
  return `${from ? 'from ' : ''}AED ${formatAED(amount)}${monthly ? '/mo' : ''}`;
};

const getQuotePickerEntries = () => {
  const entries = [];
  PACKAGES.forEach((pkg) => {
    entries.push({
      kind: 'package', key: pkg.id, group: PACKAGE_GROUPS[pkg.id] || 'websites',
      name: pkg.name.en, nameAr: pkg.name.ar || '', price: formatPickerPrice(pkg.oneTime, { from: pkg.from }),
      hint: 'Package'
    });
  });
  PICKER_CATALOG.forEach((item) => {
    entries.push({
      kind: 'catalog', key: item.key, group: item.group || 'addons',
      name: item.name.en, nameAr: item.name.ar || '', price: formatPickerPrice(item.defaultPrice),
      hint: item.defaultPrice > 0 ? '' : (item.scopeNote || 'Price agreed per project')
    });
  });
  CARE_PLANS.filter((plan) => plan.id !== 'none').forEach((plan) => {
    entries.push({
      kind: 'care', key: plan.id, group: 'care',
      name: plan.name.en, nameAr: plan.name.ar || '', price: formatPickerPrice(plan.monthly, { monthly: true }),
      hint: 'Sets the monthly care plan'
    });
  });
  return entries;
};

const quotePickerMatches = (entry, search) => {
  const needle = String(search || '').trim().toLowerCase();
  if (!needle) return true;
  return `${entry.name} ${entry.nameAr} ${entry.hint}`.toLowerCase().includes(needle);
};

const renderQuotePicker = () => {
  const ui = getQuoteEditorUi();
  if (!ui.pickerOpen) {
    return `
      <div class="qd-qe-add-row">
        <button type="button" class="qd-btn qd-admin-action-primary qd-qe-add-btn" data-action="quote-picker-toggle">${adminIcon('plus')}<span>Choose from catalog</span></button>
        <button type="button" class="qd-btn qd-admin-action-secondary" data-action="quote-add-custom-line">＋ Add custom service</button>
      </div>
    `;
  }
  const entries = getQuotePickerEntries();
  const groups = CATALOG_GROUPS.filter((group) => ui.pickerGroup === 'all' || ui.pickerGroup === group.id);
  return `
    <div class="qd-qe-picker" role="region" aria-label="Add service">
      <div class="qd-qe-picker-head">
        <input class="qd-admin-input qd-qe-picker-search" type="search" data-qe-picker-search placeholder="Search services, e.g. NFC, booking, RSVP" value="${escAttr(ui.pickerSearch)}" aria-label="Search services" autocomplete="off">
        <button type="button" class="qd-btn qd-admin-action-secondary" data-action="quote-picker-toggle">Done</button>
      </div>
      <div class="qd-qe-picker-groups" role="group" aria-label="Service groups">
        <button type="button" class="qd-qe-chip ${ui.pickerGroup === 'all' ? 'is-active' : ''}" data-action="quote-picker-group" data-group="all" aria-pressed="${ui.pickerGroup === 'all'}">All</button>
        ${CATALOG_GROUPS.map((group) => `<button type="button" class="qd-qe-chip ${ui.pickerGroup === group.id ? 'is-active' : ''}" data-action="quote-picker-group" data-group="${group.id}" aria-pressed="${ui.pickerGroup === group.id}">${escTxt(group.label.en)}</button>`).join('')}
      </div>
      <div class="qd-qe-picker-list" data-keep-scroll="qe-picker">
        ${groups.map((group) => {
          const items = entries.filter((entry) => entry.group === group.id);
          if (!items.length) return '';
          const anyMatch = items.some((entry) => quotePickerMatches(entry, ui.pickerSearch));
          return `
            <section class="qd-qe-picker-group" data-qe-picker-group ${anyMatch ? '' : 'hidden'}>
              <h4>${escTxt(group.label.en)}</h4>
              ${items.map((entry) => `
                <button type="button" class="qd-qe-picker-item" data-action="quote-picker-add" data-kind="${entry.kind}" data-key="${escAttr(entry.key)}" data-qe-picker-text="${escAttr(`${entry.name} ${entry.nameAr} ${entry.hint}`.toLowerCase())}" ${quotePickerMatches(entry, ui.pickerSearch) ? '' : 'hidden'}>
                  <span class="qd-qe-picker-name"><strong>${escTxt(entry.name)}</strong>${entry.hint ? `<small>${escTxt(entry.hint)}</small>` : ''}</span>
                  <span class="qd-qe-picker-price">${escTxt(entry.price)}</span>
                  <span class="qd-qe-picker-plus" aria-hidden="true">${adminIcon('plus')}</span>
                </button>
              `).join('')}
            </section>
          `;
        }).join('')}
        <p class="qd-qe-picker-empty" data-qe-picker-empty ${entries.some((entry) => (ui.pickerGroup === 'all' || entry.group === ui.pickerGroup) && quotePickerMatches(entry, ui.pickerSearch)) ? 'hidden' : ''}>No service matches. Try another word or add a custom line.</p>
      </div>
    </div>
  `;
};

const renderQuoteLineCard = (line, idx, count) => {
  const expanded = getQuoteEditorUi().expandedLine === idx;
  if (!expanded) return `<article class="qd-qe-line qd-qe-line-compact"><button type="button" class="qd-qe-line-summary" data-action="quote-line-toggle" data-idx="${idx}"><span>${escTxt(line?.name?.en || 'Untitled service')}</span><strong>AED ${escTxt(formatAED((Number(line?.qty)||0) * (Number(line?.unitPrice)||0)))}</strong><span>Edit</span></button></article>`;
  const catalogItem = line?.catalogKey ? getCatalogItem(line.catalogKey) : null;
  const lineTotal = (Number(line?.qty) || 0) * (Number(line?.unitPrice) || 0);
  const includes = Array.isArray(line?.includes) ? line.includes : [];
  const isNoteLine = Boolean(line?.billingNote);
  const scopeHint = catalogItem?.scopeNote && !(Number(line?.unitPrice) > 0)
    ? `<p class="qd-qe-hint">${escTxt(catalogItem.scopeNote)} Enter the agreed price.</p>`
    : '';
  return `
    <article class="qd-qe-line" data-qe-line="${idx}">
      <header class="qd-qe-line-head">
        <span class="qd-qe-line-index">${idx + 1}</span>
        <label class="qd-qe-field qd-qe-grow">
          <span>Service name</span>
          <input class="qd-admin-input" data-qline="${idx}.name.en" value="${escAttr(line?.name?.en || '')}" placeholder="Service name">
        </label>
        <div class="qd-qe-line-tools">
          <button type="button" class="qd-qe-icon-btn" data-action="quote-move-line-up" data-idx="${idx}" aria-label="Move item up" ${idx === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="qd-qe-icon-btn" data-action="quote-move-line-down" data-idx="${idx}" aria-label="Move item down" ${idx === count - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="qd-qe-icon-btn is-danger" data-action="quote-remove-line" data-idx="${idx}" aria-label="Remove item">${adminIcon('close')}</button>
        </div>
      </header>
      <div class="qd-qe-money-row">
        <label class="qd-qe-field qd-qe-qty"><span>Qty</span><input class="qd-admin-input" type="number" min="0" step="1" inputmode="numeric" data-qline="${idx}.qty" value="${escAttr(line?.qty ?? 1)}"></label>
        <label class="qd-qe-field"><span>Unit price (AED)</span><input class="qd-admin-input" type="number" min="-999999" step="1" inputmode="numeric" data-qline="${idx}.unitPrice" value="${Number(line?.unitPrice) === 0 ? '' : escAttr(line?.unitPrice ?? '')}" placeholder="Enter amount"></label>
        <div class="qd-qe-line-total"><span>Line total</span><strong data-qe-line-total="${idx}">AED ${escTxt(formatAED(lineTotal))}</strong></div>
      </div>
      ${scopeHint}
      ${isNoteLine ? `
        <label class="qd-qe-field"><span>Billing note (shown instead of an amount)</span><input class="qd-admin-input" data-qline="${idx}.billingNote" value="${escAttr(line.billingNote)}"></label>
      ` : `
        <div class="qd-qe-includes">
          <div class="qd-qe-subhead">Included</div>
          ${includes.length ? includes.map((item, includeIdx) => `
            <div class="qd-qe-include-row">
              <input class="qd-admin-input" data-qline="${idx}.includes.${includeIdx}" value="${escAttr(item)}" aria-label="Included item ${includeIdx + 1}">
              <button type="button" class="qd-qe-icon-btn" data-action="quote-remove-include" data-idx="${idx}" data-include-idx="${includeIdx}" aria-label="Remove included item">${adminIcon('close')}</button>
            </div>
          `).join('') : `
            <label class="qd-qe-field"><span>Short description</span><input class="qd-admin-input" data-qline="${idx}.description.en" value="${escAttr(typeof line?.description === 'object' ? line.description?.en || '' : line?.description || '')}"></label>
          `}
          <button type="button" class="qd-qe-text-btn" data-action="quote-add-include" data-idx="${idx}">+ Add included item</button>
        </div>
      `}
    </article>
  `;
};

const renderQuoteEditorSection = (id, title, body, { summary = '' } = {}) => {
  const ui = getQuoteEditorUi();
  const collapsed = Boolean(ui.collapsed?.[id]);
  return `
    <section class="qd-qe-section ${collapsed ? 'is-collapsed' : ''}" id="qd-qe-section-${id}" data-qe-section="${id}">
      <h3 class="qd-qe-section-title">
        <button type="button" data-action="quote-editor-toggle-section" data-section="${id}" aria-expanded="${collapsed ? 'false' : 'true'}" aria-controls="qd-qe-body-${id}">
          <span>${escTxt(title)}</span>
          ${summary ? `<small>${summary}</small>` : ''}
          <span class="qd-qe-chevron" aria-hidden="true"></span>
        </button>
      </h3>
      <div class="qd-qe-section-body" id="qd-qe-body-${id}" ${collapsed ? 'hidden' : ''}>${body}</div>
    </section>
  `;
};

const renderQuoteEditorTotals = (q) => {
  const normalized = normalizeQuoteForTemplate(q);
  const totals = normalized.totals;
  const care = Number(q.careMonthly) || 0;
  return `
    <div class="qd-qe-totals-grid">
      <div><span>Subtotal</span><strong>AED ${escTxt(formatAED(totals.subtotal))}</strong></div>
      <div><span>${normalized.vatInclusive ? 'VAT' : `VAT ${escTxt(normalized.vatPercent)}%`}</span><strong>${normalized.vatInclusive ? 'Included' : `AED ${escTxt(formatAED(totals.vat))}`}</strong></div>
      <div class="is-total"><span>Total</span><strong>AED ${escTxt(formatAED(totals.grandTotal))}</strong></div>
      <div><span>Advance ${q.paymentSplit === 50 ? 50 : 30}%</span><strong>AED ${escTxt(formatAED(normalized.paymentSchedule[0]?.amount || 0))}</strong></div>
      <div><span>Final ${q.paymentSplit === 50 ? 50 : 70}%</span><strong>AED ${escTxt(formatAED(normalized.paymentSchedule[1]?.amount || 0))}</strong></div>
      <div><span>Care</span><strong>${care > 0 ? `AED ${escTxt(formatAED(care))}/mo` : 'None'}</strong></div>
    </div>
  `;
};


let quoteTranslationSequence = 0;
let quoteTranslationTimer = 0;
let quoteTranslatedSource = '';
let quoteTranslatedQuote = null;
let quoteTranslationWriting = false;
async function translateQuoteToArabic(q) {
  const lines = q.lineItems || [], texts = [], targets = [];
  const add = (text, target) => { if (typeof text === 'string' && text.trim()) { texts.push(text.trim()); targets.push(target); } };
  lines.forEach((line, i) => { add(line.name?.en, ['name',i]); add(line.description?.en, ['description',i]); (line.includes || []).forEach((text,j) => add(text,['include',i,j])); });
  const terms = quoteTermsToEditable(q.terms).en; terms.forEach((text,i)=>add(text,['term',i]));
  if (!texts.length) { quoteTranslatedSource = ''; return true; }
  const snapshot=JSON.stringify(texts), sequence=++quoteTranslationSequence;
  if (q === quoteTranslatedQuote && snapshot === quoteTranslatedSource) return true;
  try {
    // Keep the editor stable while the translation request is pending.
    const token=await auth.currentUser.getIdToken();
    const response=await fetch('/api/quote-translate',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({texts})});
    const result=await response.json(); if(!response.ok) throw new Error(result.error || 'Translation failed.');
    const current=[]; (q.lineItems || []).forEach(line=>{ if(line.name?.en?.trim()) current.push(line.name.en.trim()); if(line.description?.en?.trim()) current.push(line.description.en.trim()); (line.includes||[]).forEach(x=>{if(x?.trim()) current.push(x.trim());}); }); quoteTermsToEditable(q.terms).en.forEach(x=>{if(x?.trim()) current.push(x.trim());});
    if(state.quoteDrawer.quote !== q || sequence !== quoteTranslationSequence || JSON.stringify(current)!==snapshot) throw new Error('The quotation changed during translation. Please try again.');
    targets.forEach(([kind,i,j],index)=>{ const value=result.texts[index]; if(kind==='term') { q.terms.ar ||= []; q.terms.ar[i]=value; } else if(kind==='include') { lines[i].includesAr ||= []; lines[i].includesAr[j]=value; } else { lines[i][kind] ||= {}; lines[i][kind].ar=value; } });
    quoteTranslatedQuote = q; quoteTranslatedSource = snapshot; quoteTranslationWriting = true; markQuoteDirty(); quoteTranslationWriting = false; return true;
  } catch(error) { showAdminToast(error.message || 'Arabic translation failed.'); return false; }
}
const renderQuoteEditorPreviewDoc = (q) => renderQuoteTemplate(q, { editable: false, lang: q.language || 'en', quoteUrl: '' });

function getEditableQuoteTerms(q) {
  const terms = quoteTermsToEditable(q.terms);
  return terms.custom || terms.en.length ? terms.en : defaultTerms(Number(q.validDays) || 30, isNonWebsiteQuote(q), q.paymentSplit === 50 ? 50 : 30);
}
function ensureEditableQuoteTerms(q) {
  const current = getEditableQuoteTerms(q);
  q.terms = { ...quoteTermsToEditable(q.terms), en: [...current], custom:true };
}

const renderQuoteDrawer = () => {
  if (!state.quoteDrawer.open || !state.quoteDrawer.quote) {
    return state.quoteToast ? `<div class="qd-quote-toast" role="status">${escTxt(state.quoteToast)}</div>` : '';
  }
  const q = state.quoteDrawer.quote;
  const ui = getQuoteEditorUi();
  const nonWebsite = isNonWebsiteQuote(q);
  const showClientLink = q.showClientLink ?? !nonWebsite;
  const lang = q.language === 'ar' ? 'ar' : 'en';
  const workflow = getQuoteWorkflowValue(q);
  const passcode = getQuotePasscode(q);
  const clientUrl = getQuoteClientUrl(q);
  const lines = Array.isArray(q.lineItems) ? q.lineItems : [];
  const normalized = normalizeQuoteForTemplate(q);
  const terms = getEditableQuoteTerms(q);
  const notes = q.notes && typeof q.notes === 'object' ? q.notes : { en: String(q.notes || ''), ar: '' };
  const carePlanId = (CARE_PLANS.find((plan) => plan.name.en === q.carePlanName && Number(plan.monthly) === Number(q.careMonthly)) || {}).id || 'custom';

  const clientBody = `
    <div class="qd-qe-grid">
      <label class="qd-qe-field qd-qe-span-2"><span>Business / client name</span><input class="qd-admin-input" data-qfield="customer.businessName" value="${escAttr(q.customer?.businessName || '')}" autocomplete="off"></label>
      <label class="qd-qe-field"><span>Email</span><input class="qd-admin-input" type="email" data-qfield="customer.email" value="${escAttr(q.customer?.email || '')}" autocomplete="off"></label>
      <label class="qd-qe-field"><span>Phone</span><input class="qd-admin-input" type="tel" data-qfield="customer.phone" value="${escAttr(q.customer?.phone || '')}" autocomplete="off"></label>
      <label class="qd-qe-field"><span>Valid for (days)</span><input class="qd-admin-input" type="number" min="1" data-qfield="validDays" value="${escAttr(q.validDays ?? 30)}"></label>
      <div class="qd-qe-field">
        <span>VAT</span>
        <div class="qd-qe-vat">
          <label class="qd-qe-check"><input type="checkbox" data-qfield="vatInclusive" ${q.vatInclusive !== false ? 'checked' : ''}> Prices include VAT</label>
          <label class="qd-qe-inline"><input class="qd-admin-input" type="number" min="0" max="100" data-qfield="vatPercent" value="${escAttr(q.vatPercent ?? 0)}" ${q.vatInclusive !== false ? 'disabled' : ''} aria-label="VAT percent"> %</label>
        </div>
      </div>
    </div>
  `;

  const servicesBody = `
    ${lines.length ? `<div class="qd-qe-lines">${lines.map((line, idx) => renderQuoteLineCard(line, idx, lines.length)).join('')}</div>` : '<div class="qd-qe-empty"><strong>No items yet</strong><span>Add a package or service to start the quote.</span></div>'}
    ${renderQuotePicker()}
  `;

  const pagesBody = `
    <div class="qd-qe-grid">
      <label class="qd-qe-field"><span>Additional pages price (AED)</span><input class="qd-admin-input" type="number" min="0" step="1" data-qfield="pages.price" value="${escAttr(q.pages?.price ?? 0)}"></label>
      <label class="qd-qe-field"><span>Pages description</span><input class="qd-admin-input" data-qfield="pages.en" value="${escAttr(q.pages?.en || '')}" placeholder="Additional page design and setup"></label>
    </div>
    <div class="qd-qe-subhead">Monthly care</div>
    <div class="qd-qe-grid">
      <label class="qd-qe-field qd-qe-span-2"><span>Care plan</span>
        <select class="qd-admin-select" data-qe-care-plan>
          ${CARE_PLANS.map((plan) => `<option value="${escAttr(plan.id)}" ${carePlanId === plan.id ? 'selected' : ''}>${escTxt(plan.name.en)}${plan.monthly ? ` · AED ${formatAED(plan.monthly)}/mo` : ''}</option>`).join('')}
          <option value="custom" ${carePlanId === 'custom' ? 'selected' : ''}>Custom plan</option>
        </select>
      </label>
      <label class="qd-qe-field"><span>Plan name on quote</span><input class="qd-admin-input" data-qfield="carePlanName" value="${escAttr(q.carePlanName || '')}"></label>
      <label class="qd-qe-field"><span>Monthly amount (AED)</span><input class="qd-admin-input" type="number" min="0" step="1" data-qfield="careMonthly" value="${escAttr(q.careMonthly ?? 0)}"></label>
    </div>
  `;

  const termsBody = `
    <div class="qd-qe-grid">
      <label class="qd-qe-field qd-qe-span-2"><span>Internal scope note</span><textarea class="qd-admin-textarea" rows="3" data-qfield="notes.en">${escTxt(notes.en || '')}</textarea></label>

    </div>
    <div class="qd-qe-subhead">Terms &amp; conditions</div>
    ${terms.length ? `
      <ol class="qd-qe-terms">
        ${terms.map((term, idx) => `
          <li class="qd-qe-include-row">
            <textarea class="qd-admin-textarea" rows="2" data-qterm="${idx}" aria-label="Term ${idx + 1}">${escTxt(term)}</textarea>
            <button type="button" class="qd-qe-icon-btn" data-action="quote-remove-term" data-term-idx="${idx}" aria-label="Remove term ${idx + 1}">${adminIcon('close')}</button>
          </li>
        `).join('')}
      </ol>
    ` : '<p class="qd-qe-hint">The standard QD terms are used (see the preview). Adding a term replaces the standard list with your own.</p>'}
    <button type="button" class="qd-qe-text-btn" data-action="quote-add-term">+ Add term</button>
  `;

  const paymentsBody = `
    ${renderQuoteDrawerPaymentSummary(q)}
    <div class="qd-qe-schedule">
      ${normalized.paymentSchedule.map((item) => `<div><span>${escTxt(item.label)} <small>${escTxt(item.when)}</small></span><strong>AED ${escTxt(formatAED(item.amount))}</strong></div>`).join('')}
    </div>
    <button type="button" class="qd-btn qd-admin-action-secondary" data-action="quote-editor-open-detail">${nonWebsite ? 'Log payments and due dates' : 'Log payments, due dates and go-live'}</button>
  `;

  const sendBody = `
    <div class="qd-qe-send">
      <div class="qd-qe-copy-field">
        <span>Client link</span>
        <code>${escTxt(clientUrl)}</code>
      </div>
      <div class="qd-qe-copy-field">
        <span>Passcode</span>
        <code>${passcode ? escTxt(passcode) : 'Not available here (see the quote record)'}</code>
      </div>
      <div class="qd-qe-send-actions">
        <button type="button" class="qd-btn qd-admin-action-secondary" data-action="quote-editor-copy-link" data-qe-needs-clean ${isQuoteSaveBlocked() ? 'disabled' : ''}>Copy link + passcode</button>
        <button type="button" class="qd-btn qd-admin-action-secondary" data-action="quote-editor-mark-sent" data-qe-needs-clean ${isQuoteSaveBlocked() ? 'disabled' : ''}>Save and mark as sent</button>
        <button type="button" class="qd-btn qd-admin-action-primary" data-action="quote-save-and-copy" data-qe-needs-clean ${isQuoteSaveBlocked() ? 'disabled' : ''}>Save, mark sent and copy link</button>
        <a class="qd-btn qd-admin-action-secondary" href="${escAttr(clientUrl)}" target="_blank" rel="noreferrer noopener">Open client view</a>
      </div>
      <div class="qd-qe-status-row">
        <label class="qd-qe-field"><span>Workflow status</span>
          <select class="qd-admin-select" data-qe-status>
            ${quoteWorkflowStatuses.map((status) => `<option value="${status}" ${workflow === status ? 'selected' : ''}>${status[0].toUpperCase()}${status.slice(1)}</option>`).join('')}
          </select>
        </label>
        <button type="button" class="qd-btn qd-admin-action-secondary" data-action="quote-editor-set-status" data-qe-needs-clean ${isQuoteSaveBlocked() ? 'disabled' : ''}>Update status</button>
      </div>
    </div>
  `;

  const lineCount = lines.length;
  return `
    <div class="qd-quote-overlay" data-action="close-quote-drawer"></div>
    <aside class="qd-quote-drawer qd-qe ${state.quoteDrawer.enterAnim ? 'is-entering' : ''}" id="qd-quote-drawer" role="dialog" aria-modal="true" aria-labelledby="qd-qe-title" data-view="${ui.view}">
      <header class="qd-qe-head">
        <div class="qd-qe-title-block">
          <h2 id="qd-qe-title">${escTxt(q.quoteNumber || 'Quote')} <span>${escTxt(q.customer?.businessName || 'No client name')}</span></h2>
          <div class="qd-qe-meta">${renderWorkflowStatusChip(workflow)} ${renderQuoteSaveStatus()}</div>
        </div>
        <div class="qd-qe-head-actions">
          <div class="qd-qe-lang" role="group" aria-label="Quote language">
            <button type="button" class="${lang === 'en' ? 'is-active' : ''}" data-action="quote-editor-lang" data-lang="en" aria-pressed="${lang === 'en'}">EN</button>
            <button type="button" class="${lang === 'ar' ? 'is-active' : ''}" data-action="quote-editor-lang" data-lang="ar" aria-pressed="${lang === 'ar'}">AR</button>
          </div>
          ${showClientLink ? `<button type="button" class="qd-btn qd-admin-action-secondary qd-qe-hide-sm" data-action="quote-editor-copy-link" data-qe-needs-clean ${isQuoteSaveBlocked() ? 'disabled' : ''}>Copy link</button>` : ''}
          <button type="button" class="qd-btn qd-admin-action-secondary qd-qe-hide-sm" data-action="quote-editor-mark-sent" data-qe-needs-clean ${isQuoteSaveBlocked() ? 'disabled' : ''}>Mark as sent</button>
          <button type="button" class="qd-btn qd-admin-action-secondary" data-action="quote-print">Print</button><button type="button" class="qd-btn qd-admin-action-secondary" data-action="quote-pdf">Save PDF</button><button type="button" class="qd-btn qd-admin-action-primary" data-action="quote-save-draft">Save</button>
          <button type="button" class="qd-quote-close" data-action="close-quote-drawer" aria-label="Close editor">${adminIcon('close')}</button>
        </div>
      </header>

      ${renderQuoteEditorBanner()}

      <div class="qd-qe-viewtabs" role="tablist" aria-label="Editor view">
        <button type="button" role="tab" class="${ui.view === 'edit' ? 'is-active' : ''}" aria-selected="${ui.view === 'edit'}" data-action="quote-editor-view" data-view="edit">Edit</button>
        <button type="button" role="tab" class="${ui.view === 'preview' ? 'is-active' : ''}" aria-selected="${ui.view === 'preview'}" data-action="quote-editor-view" data-view="preview">Preview</button>
      </div>

      <div class="qd-qe-body">
        <div class="qd-qe-form-col">
          <div class="qd-qe-progress">Step ${Math.max(0, ['client','services',...(!nonWebsite ? ['pages'] : []),'terms','payments',...(showClientLink ? ['send'] : [])].indexOf(ui.step)) + 1} · ${escTxt((QE_SECTIONS.find(([id]) => id === ui.step) || QE_SECTIONS[0])[1])}</div>
          <div class="qd-qe-form" data-keep-scroll="qe-form">
            ${ui.step === 'client' ? renderQuoteEditorSection('client', 'Client', clientBody, { summary: escTxt(q.customer?.businessName || '') }) : ''}
            ${ui.step === 'services' ? renderQuoteEditorSection('services', 'Services & items', servicesBody, { summary: `${lineCount} item${lineCount === 1 ? '' : 's'}` }) : ''}
            ${ui.step === 'pages' && !nonWebsite ? renderQuoteEditorSection('pages', 'Pages & care', pagesBody, { summary: Number(q.careMonthly) > 0 ? `${escTxt(q.carePlanName || 'Care')} · AED ${escTxt(formatAED(q.careMonthly))}/mo` : 'No care' }) : ''}
            ${ui.step === 'terms' ? renderQuoteEditorSection('terms', 'Terms & notes', termsBody, { summary: terms.length ? `${terms.length} custom terms` : 'Standard terms' }) : ''}
            ${ui.step === 'payments' ? renderQuoteEditorSection('payments', 'Payments', paymentsBody) : ''}
            ${ui.step === 'send' && showClientLink ? renderQuoteEditorSection('send', 'Send', sendBody) : ''}
          </div>
          <div class="qd-qe-wizard-actions">${(() => { const steps = ['client','services',...(!nonWebsite ? ['pages'] : []),'terms','payments',...(showClientLink ? ['send'] : [])]; const i = Math.max(0, steps.indexOf(ui.step)); return `${i ? `<button type="button" class="qd-btn qd-admin-action-secondary" data-action="quote-step" data-step="${steps[i-1]}">← Back</button>` : '<span></span>'}<span data-qe-wizard-total>Total: AED ${escTxt(formatAED(normalized.totals.grandTotal))}</span>${i < steps.length-1 ? `<button type="button" class="qd-btn qd-admin-action-primary" data-action="quote-step" data-step="${steps[i+1]}">Next →</button>` : '<button type="button" class="qd-btn qd-admin-action-primary" data-action="quote-save-draft">Save</button>'}`; })()}</div>
        </div>
        <div class="qd-qe-preview-col" aria-label="Live document preview">
          <div class="qd-qe-preview-label">Live preview · what the client sees${lang === 'ar' ? ' (Arabic)' : ''}</div>
          <div class="qd-qe-preview" data-keep-scroll="qe-preview">
            <div class="qd-qe-preview-doc" id="qd-qe-preview-doc">${renderQuoteEditorPreviewDoc(q)}</div>
          </div>
        </div>
      </div>
    </aside>
    ${state.quoteToast ? `<div class="qd-quote-toast" role="status">${escTxt(state.quoteToast)}</div>` : ''}
  `;
};

// ============================================================================
// PRICING ESTIMATOR TAB — drill-down builder (v3)
// Click what you're building → its options appear → industry systems →
// price updates live. Engine: pricing-model.js (UAE-verified, component sums).
// ============================================================================

const defaultPricingState = () => ({
  website: true,
  pagesStandard: 5,
  pagesLanding: 0,
  specs: {},
  industryId: null,
  carePlanId: null,
  vatOn: false,
  clientName: '',
  briefText: '',
  analysis: null,
  founding: { enabled: false, percent: 10 },
  ui: { describeOpen: false, specFilter: '' },
  copied: false,
  quoteCreating: false
});

const PRICING_SPEC_LIST = [
  { id: 'booking', label: 'Online booking', desc: 'Appointments, staff calendars, reminders', addonId: 'booking-integration', defaultTier: 'mid' },
  { id: 'store', label: 'Online store', desc: 'Products, cart, checkout, shipping setup', special: true, defaultTier: 'low' },
  { id: 'ordering', label: 'Online ordering', desc: 'Menu, pickup/delivery, live order status', addonId: 'ordering-integration', defaultTier: 'mid' },
  { id: 'crm', label: 'Customer management (CRM)', desc: 'Lead inbox, pipeline, customer history', addonId: 'crm-setup', defaultTier: 'low' },
  { id: 'chatbot', label: 'AI chatbot', desc: 'FAQ assistant, lead capture, handoff rules', addonId: 'ai-chatbot-upgrade', defaultTier: 'low' },
  { id: 'dashboard', label: 'Analytics dashboard', desc: 'KPIs, reports, filters, exports', addonId: 'dashboard-pack', defaultTier: 'low' },
  { id: 'loyalty', label: 'Loyalty', desc: 'Points, rewards, repeat-customer hooks', addonId: 'loyalty-integration', defaultTier: 'low' },
  { id: 'reviews', label: 'Reviews', desc: 'Review display and collection', addonId: 'reviews-integration', defaultTier: 'low' },
  { id: 'roles', label: 'Staff / roles', desc: 'Staff, driver, branch, and permission logic', addonId: 'roles-logic', defaultTier: 'low' },
  { id: 'documents', label: 'Documents', desc: 'Uploads, approvals, document library', addonId: 'file-uploads', defaultTier: 'low' },
  { id: 'seo', label: 'SEO', desc: 'Search Console, sitemap, local search basics', addonId: 'seo-pack', defaultTier: 'low' },
  { id: 'language', label: 'Arabic + English', desc: 'Second-language structure and RTL/LTR handling', addonId: 'extra-language', defaultTier: 'low' },
  { id: 'maps', label: 'Maps', desc: 'Location map or branch map on the site', addonId: 'map-embed', defaultTier: 'low' },
  { id: 'payments', label: 'Online payments', desc: 'Card payment setup; provider fees at cost', addonId: 'payment-gateway', defaultTier: 'low' }
];

const SPEC_BY_ID = Object.fromEntries(PRICING_SPEC_LIST.map((spec) => [spec.id, spec]));

const PRICING_QUICK_STARTS = [
  {
    id: 'clinic',
    label: 'Clinic',
    presetId: 'clinic-salon',
    specs: { booking: { tier: 'high' }, crm: { tier: 'mid' }, reviews: { tier: 'low' } },
    carePlanId: 'care-growth'
  },
  {
    id: 'restaurant',
    label: 'Restaurant',
    presetId: 'restaurant-cafe',
    specs: { ordering: { tier: 'high' }, loyalty: { tier: 'mid' }, maps: { tier: 'low' } },
    carePlanId: 'care-growth'
  },
  {
    id: 'salon',
    label: 'Salon',
    presetId: 'clinic-salon',
    specs: { booking: { tier: 'high' }, crm: { tier: 'mid' }, loyalty: { tier: 'mid' }, reviews: { tier: 'low' } },
    carePlanId: 'care-growth'
  },
  {
    id: 'retail',
    label: 'Retail',
    presetId: null,
    specs: { store: { tier: 'low' }, crm: { tier: 'mid' }, loyalty: { tier: 'mid' }, reviews: { tier: 'low' } },
    carePlanId: 'care-commerce'
  },
  {
    id: 'services',
    label: 'Services',
    presetId: 'services-contractor',
    specs: { crm: { tier: 'low' }, seo: { tier: 'low' }, reviews: { tier: 'low' } },
    carePlanId: 'care-basic'
  },
  {
    id: 'education',
    label: 'Education',
    presetId: 'education-training',
    specs: { booking: { tier: 'mid' }, crm: { tier: 'mid' }, documents: { tier: 'mid' } },
    carePlanId: 'care-growth'
  }
];

const getStoreSpecialId = (tier = 'low') => tier === 'mid' || tier === 'high' ? 'qd-commerce-growth' : 'qd-commerce-start';

const getPricingSelection = () => {
  const p = state.pricing;
  const specials = Object.entries(p.specs || {})
    .filter(([id]) => SPEC_BY_ID[id]?.special)
    .map(([, cfg]) => getStoreSpecialId(cfg.tier));

  const addons = [];
  Object.entries(p.specs || {}).forEach(([specId, cfg]) => {
    const spec = SPEC_BY_ID[specId];
    if (!spec?.addonId) return;
    addons.push({ id: spec.addonId, tier: cfg.tier || spec.defaultTier || 'low', qty: cfg.qty || 1 });
  });

  const selection = {
    foundationId: p.website ? 'web-base' : null,
    pagesStandard: p.website ? p.pagesStandard : 0,
    pagesLanding: p.website ? p.pagesLanding : 0,
    specials,
    modules: [],
    addons,
    industryId: p.industryId || null,
    discountPercent: p.founding.enabled ? p.founding.percent : 0
  };
  if (p.carePlanId) selection.carePlanId = p.carePlanId;
  return selection;
};

const getPricingLaunchSelection = () => {
  const p = state.pricing;
  return { ...getPricingSelection(), posture: 'launch', vatPercent: p.vatOn ? 5 : 0 };
};

// Map a parseBrief() analysis onto the product-based state.
const applyBriefAnalysis = (analysis) => {
  const p = state.pricing;
  p.analysis = analysis;
  p.website = false;
  p.pagesStandard = 5;
  p.pagesLanding = 0;
  p.specs = {};
  p.industryId = null;

  if (analysis.foundation) {
    p.website = true;
    p.pagesStandard = analysis.pagesStandard || 5;
    p.pagesLanding = analysis.pagesLanding || 0;
  }
  (analysis.specials || []).forEach((s) => {
    if (s.id.startsWith('qd-commerce')) p.specs.store = { tier: s.id === 'qd-commerce-growth' ? 'mid' : 'low' };
    else if (s.id === 'qd-ops-dashboard') p.specs.dashboard = { tier: 'high' };
    else if (s.id === 'qd-ai-chatbot') p.specs.chatbot = { tier: 'low' };
  });
  (analysis.addons || []).forEach((a) => {
    const spec = PRICING_SPEC_LIST.find((item) => item.addonId === a.id);
    if (spec) p.specs[spec.id] = { tier: a.tier || spec.defaultTier || 'low', qty: a.qty || 1 };
  });
  if (analysis.industry) {
    p.industryId = analysis.industry.id;
  }
  p.carePlanId = analysis.carePlanId || 'none';
  p.copied = false;
};

const applyIndustryPresetSuggestion = (quickStartId) => {
  const p = state.pricing;
  const quickStart = PRICING_QUICK_STARTS.find((item) => item.id === quickStartId);
  if (!quickStart) return;
  p.website = true;
  p.pagesStandard = 5;
  p.pagesLanding = 0;
  p.specs = Object.fromEntries(Object.entries(quickStart.specs).map(([id, cfg]) => [id, { tier: cfg.tier || SPEC_BY_ID[id]?.defaultTier || 'low', qty: 1 }]));
  p.industryId = quickStart.presetId;
  p.carePlanId = quickStart.carePlanId;
};

// Included-value map for UI display. excludeModuleId lets a module card price
// itself against everything EXCEPT itself (matches engine's sequential math).
const getPricingIncludedMap = (excludeModuleId = null) => {
  const sel = getPricingSelection();
  return buildIncludedMap({
    foundationId: sel.foundationId,
    specials: sel.specials,
    modules: sel.modules,
    excludeModuleId
  });
};

const formatPricingFils = (fils, mode = 'aed') => formatAED(displayAED(fils, mode));
const launchFromAED = (selection) => displayAED(price({ ...selection, posture: 'launch', vatPercent: 0 }).net, 'rack50');

const renderSpecLevels = (spec, current, includedMap) => {
  if (spec.special) {
    const levels = [
      { tier: 'low', label: 'Up to 50 products', specialId: 'qd-commerce-start', spec: 'Storefront, payments, shipping, coupons, review app, filters, training' },
      { tier: 'mid', label: '50-250 products', specialId: 'qd-commerce-growth', spec: 'Adds abandoned-cart, loyalty/reviews, CRM sync, analytics, merchandising' }
    ];
    return `
      <div class="qd-pricing-levels">
        ${levels.map((lvl) => `
          <button type="button" class="qd-pricing-level ${current === lvl.tier ? 'is-active' : ''}" data-action="pricing-set-spec-tier" data-spec="${spec.id}" data-tier="${lvl.tier}">
            <span class="qd-pricing-level-head"><strong>${escTxt(lvl.label)}</strong><em>AED ${formatAED(launchFromAED({ specials: [lvl.specialId] }))}</em></span>
            <span class="qd-pricing-level-spec">${escTxt(lvl.spec)}</span>
          </button>`).join('')}
      </div>`;
  }
  const addonId = spec.addonId;
  const addon = getAddon(addonId);
  if (!addon || !addon.levels) return '';
  const included = includedMap?.get(addonId) || 0;
  return `
    <div class="qd-pricing-levels">
      ${addon.levels.map((lvl) => {
        const price = includedCharge(addonId, lvl.tier, includedMap);
        const priceLabel = included > 0 && price === 0 ? 'included' : `AED ${formatAED(launchFromAED({ addons: [{ id: addonId, tier: lvl.tier, qty: 1 }] }))}${included > 0 ? ' upgrade' : ''}`;
        return `
          <button type="button" class="qd-pricing-level ${current === lvl.tier ? 'is-active' : ''}" data-action="pricing-set-spec-tier" data-spec="${spec.id}" data-tier="${lvl.tier}">
            <span class="qd-pricing-level-head"><strong>${escTxt(lvl.label)}</strong><em>${priceLabel}</em></span>
            <span class="qd-pricing-level-spec">${escTxt(lvl.spec)}</span>
          </button>`;
      }).join('')}
    </div>`;
};

const renderPricingSpecRow = (spec, includedMap, filterNorm) => {
  const p = state.pricing;
  const selected = !!p.specs[spec.id];
  const current = p.specs[spec.id]?.tier || spec.defaultTier || 'low';
  const text = `${spec.label} ${spec.desc}`.toLowerCase();
  const hidden = filterNorm && !text.includes(filterNorm);
  const addon = spec.addonId ? getAddon(spec.addonId) : null;
  const fullyIncluded = addon ? includedCharge(spec.addonId, 'high', includedMap) === 0 : false;
  const lowIncluded = addon ? includedCharge(spec.addonId, spec.defaultTier || 'low', includedMap) === 0 : false;
  const launchSelection = spec.special
    ? { specials: [getStoreSpecialId(current)] }
    : { addons: [{ id: spec.addonId, tier: spec.defaultTier || 'low', qty: 1 }] };
  const priceLabel = fullyIncluded
    ? '✓ included'
    : lowIncluded
      ? 'basic included'
      : `from AED ${formatAED(launchFromAED(launchSelection))}`;

  return `
    <div class="qd-pricing-spec ${selected ? 'is-active' : ''} ${fullyIncluded ? 'is-covered' : ''}" data-pricing-spec-row="${escAttr(text)}" ${hidden ? 'hidden style="display:none"' : ''}>
      <button type="button" class="qd-pricing-spec-main" data-action="pricing-toggle-spec" data-spec="${spec.id}">
        <span>
          <strong>${escTxt(spec.label)}</strong>
          <small>${escTxt(spec.desc)}</small>
        </span>
        <em>${priceLabel}</em>
      </button>
      ${selected && (spec.special || addon?.levels) ? renderSpecLevels(spec, current, includedMap) : ''}
    </div>`;
};

const renderPricingManager = () => {
  const p = state.pricing;
  const estimate = price({ ...getPricingSelection(), posture: 'launch', vatPercent: p.vatOn ? 5 : 0 });
  const coverage = getPricingIncludedMap();

  // ---- Describe bar ---------------------------------------------------------
  const analysis = p.analysis;
  let analysisHtml = '';
  if (analysis) {
    const rows = [];
    (analysis.warnings || []).forEach((w) => rows.push(`<div class="qd-pricing-det is-warning">⚠ ${escTxt(w)}</div>`));
    (analysis.notes || []).forEach((n) => rows.push(`<div class="qd-pricing-det is-note">ℹ ${escTxt(n)}</div>`));
    const matched = [];
    if (analysis.foundation) matched.push('website');
    (analysis.specials || []).forEach((s) => matched.push(getSpecialBuild(s.id)?.name.en || s.id));
    (analysis.addons || []).forEach((a) => matched.push(getAddon(a.id)?.name.en || a.id));
    if (matched.length) rows.unshift(`<div class="qd-pricing-det is-ok"><strong>Detected & selected below:</strong> ${escTxt(matched.join(' · '))}</div>`);
    analysisHtml = `<div class="qd-pricing-analysis">${rows.join('')}</div>`;
  }
  const describeBody = p.ui.describeOpen ? `
    <div class="qd-pricing-describe-body">
      <input class="qd-quote-input" id="pricing-client-name" value="${escAttr(p.clientName)}" placeholder="Client / business name">
      <textarea class="qd-quote-input qd-quote-textarea qd-pricing-brief" id="pricing-brief-text" placeholder="Optional: describe the offer in English or Arabic and I'll click the buttons for you — e.g. 'Clinic website with admin portal, live status, patient management'">${escTxt(p.briefText)}</textarea>
      <div class="qd-pricing-brief-actions">
        <button type="button" class="qd-btn qd-btn-sm qd-admin-action-primary" data-action="pricing-analyze-brief">Auto-select from description</button>
      </div>
      ${analysisHtml}
    </div>` : '';

  const quickStartBtns = PRICING_QUICK_STARTS.map((quick) => `
    <button type="button" class="qd-pricing-chip ${p.industryId === quick.presetId && quick.presetId ? 'is-active' : ''}" data-action="pricing-quick-start" data-quick-start="${quick.id}">
      <span>${escTxt(quick.label)}</span><small>${quick.presetId ? escTxt(getIndustryPreset(quick.presetId)?.why || 'Suggested stack') : 'Suggested stack'}</small>
    </button>`).join('');

  const filterValue = p.ui.specFilter || '';
  const filterNorm = filterValue.trim().toLowerCase();
  const specRows = PRICING_SPEC_LIST.map((spec) => renderPricingSpecRow(spec, coverage, filterNorm)).join('');

  const selectedCarePlanId = p.carePlanId || estimate.monthly.planId;
  const carePlanOptions = CARE_PLANS.map((plan) => `
    <option value="${plan.id}" ${selectedCarePlanId === plan.id ? 'selected' : ''}>
      ${escTxt(plan.name.en)}${plan.monthly > 0 ? ` — AED ${formatAED(plan.monthly)}/mo${plan.usage ? ' + usage' : ''}` : ''}
    </option>`).join('');

  // ---- Summary panel -------------------------------------------------------------
  const lineRows = estimate.lines.filter((line) => line.kind !== 'discount').map((line) => `
    <div class="qd-pricing-summary-line ${line.covered ? 'is-muted' : ''}" ${line.note ? `title="${escAttr(line.note)}"` : ''}>
      <span>${escTxt(line.label)}${line.covered ? ' <em>(included)</em>' : ''}${line.upgraded ? ' <em>(upgrade only — basic in base)</em>' : ''}</span>
      <span>${line.covered ? '—' : `${line.from ? 'from ' : ''}AED ${formatPricingFils(line.amount, 'rack50')}`}</span>
    </div>`).join('');

  const renderBandBox = (check, heading) => {
    if (!check) return '';
    const [lo, hi] = check.band;
    const statusText = {
      within: '✓ Within the verified range',
      below: '↓ Below the verified range — room to grow scope',
      above: '↑ Above the verified range — justify with scope, or trim'
    }[check.status];
    return `<div class="qd-pricing-band is-${check.status}"><strong>${escTxt(heading)}:</strong> AED ${formatPricingFils(lo, 'rack50')}–${formatPricingFils(hi, 'rack50')}<br>${statusText}</div>`;
  };
  const activePreset = getIndustryPreset(getPricingSelection().industryId);
  const hasEstimate = estimate.lines.some((line) => Number(line.amount) !== 0);
  const marketRate = formatPricingFils(estimate.listPrice, 'rack50');
  const launchPrice = formatPricingFils(estimate.net, 'rack50');
  const monthlyPrice = formatPricingFils(estimate.monthly.amount, 'aed');
  // Reconciling line: catalog lines are shown at market (Dubai) price and sum to listPrice;
  // the Sharjah launch factor + any discount live in the waterfall. Surface that delta so the
  // visible breakdown always adds up to the One-time build (lines − saving = net).
  const launchSaving = Math.max(0, estimate.listPrice - estimate.net);
  const launchSavingPct = estimate.listPrice > 0 ? Math.round((launchSaving / estimate.listPrice) * 100) : 0;
  const internalBadges = [
    `Approval: ${estimate.approval}`,
    `Margin: ${estimate.marginPercent}%`,
    `Delivery cost: AED ${formatPricingFils(estimate.deliveryCost, 'aed')}`,
    ...(estimate.floorBound ? ['floor_bound'] : []),
    ...(estimate.flags || [])
  ];

  return `
    <section class="qd-admin-section qd-pricing-section">
      <header class="qd-pricing-head">
        <div>
          <h2>Pricing Estimator</h2>
          <p class="qd-pricing-sub">Click what you're building — the price updates live · v${PRICING_VERSION} · UAE-verified</p>
        </div>
      </header>

      <div class="qd-pricing-layout">
        <div class="qd-pricing-controls">

          <button type="button" class="qd-pricing-describe-bar ${p.ui.describeOpen ? 'is-open' : ''}" data-action="pricing-toggle-describe">
            ✨ Describe the offer in words (EN/AR) — optional ${p.ui.describeOpen ? '▾' : '▸'}
          </button>
          ${describeBody}

          <div class="qd-pricing-step">
            <div class="qd-pricing-step-title">1 · Website base</div>
            <div class="qd-pricing-panel">
              <button type="button" class="qd-pricing-product ${p.website ? 'is-active' : ''}" data-action="pricing-toggle-website">
                <span class="qd-pricing-product-name">Website</span>
                <span class="qd-pricing-product-desc">Custom responsive design, 5 pages included, WhatsApp, Google Business Profile, analytics, hosting/domain setup</span>
                <span class="qd-pricing-product-price">from AED ${formatAED(launchFromAED({ foundationId: 'web-base', pagesStandard: 5 }))}</span>
              </button>
              ${p.website ? `
                <div class="qd-pricing-panel-row"><span>Pages (5 included · AED ${PAGE_RATE_STANDARD} extra)</span>
                  <div class="qd-pricing-qty-btns">
                    <button type="button" class="qd-pricing-tier-btn" data-action="pricing-pages" data-kind="standard" data-delta="-1">−</button>
                    <span class="qd-pricing-qty-value">${p.pagesStandard}</span>
                    <button type="button" class="qd-pricing-tier-btn" data-action="pricing-pages" data-kind="standard" data-delta="1">+</button>
                  </div>
                </div>
                <div class="qd-pricing-panel-row"><span>Campaign landing pages · AED ${PAGE_RATE_LANDING} each</span>
                  <div class="qd-pricing-qty-btns">
                    <button type="button" class="qd-pricing-tier-btn" data-action="pricing-pages" data-kind="landing" data-delta="-1">−</button>
                    <span class="qd-pricing-qty-value">${p.pagesLanding}</span>
                    <button type="button" class="qd-pricing-tier-btn" data-action="pricing-pages" data-kind="landing" data-delta="1">+</button>
                  </div>
                </div>` : ''}
            </div>
          </div>

          <div class="qd-pricing-step">
            <div class="qd-pricing-step-title">2 · Quick start <small>Optional presets; everything remains editable</small></div>
            <div class="qd-pricing-chips">${quickStartBtns}</div>
          </div>

          <div class="qd-pricing-step">
            <div class="qd-pricing-step-title">3 · What do you need?</div>
            <input class="qd-quote-input qd-pricing-filter" type="search" placeholder="Search specs..." value="${escAttr(filterValue)}" data-pricing-filter>
            <div class="qd-pricing-spec-list">${specRows}</div>
          </div>

          <div class="qd-pricing-step">
            <div class="qd-pricing-step-title">Monthly care, VAT & discount</div>
            <div class="qd-pricing-care-row">
              <select class="qd-quote-input qd-pricing-care" data-pricing-field="care-plan">${carePlanOptions}</select>
              <label class="qd-pricing-vat-toggle">
                <input type="checkbox" data-pricing-field="vat-on" ${p.vatOn ? 'checked' : ''}>
                <span>Add 5% VAT (if VAT-registered)</span>
              </label>
              <button type="button" class="qd-pricing-chip ${p.founding.enabled ? 'is-active' : ''}" data-action="pricing-toggle-founding">
                <span>Founding-client discount</span><small>${p.founding.enabled ? `−${p.founding.percent}%` : `up to −${FOUNDING_MAX_DISCOUNT_PERCENT}%`}</small>
              </button>
              ${p.founding.enabled ? `
                <div class="qd-pricing-qty-btns">
                  <button type="button" class="qd-pricing-tier-btn" data-action="pricing-founding-pct" data-delta="-1">−</button>
                  <span class="qd-pricing-qty-value">${p.founding.percent}%</span>
                  <button type="button" class="qd-pricing-tier-btn" data-action="pricing-founding-pct" data-delta="1">+</button>
                </div>` : ''}
            </div>
          </div>
        </div>

        <aside class="qd-pricing-summary">
          <div class="qd-quote-section-label">${p.clientName ? `ESTIMATE — ${escTxt(p.clientName.toUpperCase())}` : 'ESTIMATE'}</div>
          ${!hasEstimate
            ? '<div class="qd-pricing-empty">Click a product to start building the price.</div>'
            : `
            <div class="qd-pricing-hero-total">
              <span>From AED ${launchPrice} once + AED ${monthlyPrice}/month</span>
              <small>One payment for the build, a small monthly to keep it running and supported. No hidden fees.</small>
            </div>
            <div class="qd-pricing-anchor">
              <div><span>Market rate (Dubai)</span><s>AED ${marketRate}</s></div>
              <div><span>Your Sharjah launch price</span><strong>AED ${launchPrice}</strong></div>
            </div>
            <div class="qd-pricing-summary-lines">${lineRows}</div>
            <div class="qd-pricing-summary-totals">
              ${launchSaving > 0 ? `<div class="qd-pricing-summary-line is-saving"><span>Sharjah launch saving${launchSavingPct ? ` (−${launchSavingPct}%)` : ''}</span><span>−AED ${formatPricingFils(launchSaving, 'rack50')}</span></div>` : ''}
              <div class="qd-pricing-summary-line"><span>One-time build</span><span>${estimate.openEnded ? 'from ' : ''}AED ${launchPrice}</span></div>
              ${p.vatOn ? `<div class="qd-pricing-summary-line is-muted"><span>VAT 5%</span><span>AED ${formatPricingFils(estimate.vat, 'aed')}</span></div>` : ''}
              ${p.vatOn ? `<div class="qd-pricing-summary-line is-grand"><span>Total with VAT</span><span>AED ${formatPricingFils(estimate.grandTotal, 'rack50')}</span></div>` : ''}
              ${estimate.monthly.amount > 0 ? `
                <div class="qd-pricing-summary-line is-monthly"><span>Monthly · ${escTxt(estimate.monthly.planName)}</span><span>AED ${monthlyPrice}/mo${estimate.monthly.usage ? ' + usage' : ''}</span></div>` : ''}
            </div>
            <div class="qd-pricing-passthrough">Third-party software billed at cost${estimate.monthly.softwarePassThrough ? ' where needed' : ' when applicable'}.</div>
            <div class="qd-pricing-soft-note">Prefer to split the build over 2–3 months? Ask us.</div>
            <div class="qd-pricing-internal-strip">${internalBadges.map((badge) => `<span>${escTxt(badge)}</span>`).join('')}</div>
            ${renderBandBox(estimate.uaeCheck, 'UAE market (verified live)')}
            ${renderBandBox(estimate.bandCheck && activePreset ? estimate.bandCheck : null, activePreset ? activePreset.name.en : '')}
            <button type="button" class="qd-btn qd-btn-sm qd-admin-action-primary qd-pricing-create-quote" data-action="pricing-create-quote" ${p.quoteCreating ? 'disabled' : ''}>
              ${p.quoteCreating ? 'Creating quote...' : 'Create quote'}
            </button>
            <button type="button" class="qd-btn qd-btn-sm qd-admin-action-secondary qd-pricing-copy" data-action="pricing-copy-summary">
              ${p.copied ? 'Copied' : 'Copy summary'}
            </button>
            <button type="button" class="qd-btn qd-btn-sm qd-pricing-reset" data-action="pricing-reset">Reset</button>
          `}
          <details class="qd-pricing-sources">
            <summary>Source register (${SOURCES.length} · ${SOURCES.filter((s) => s.verified).length} verified live)</summary>
            <ul>
              ${SOURCES.map((s) => `<li>${s.ref} — <a href="${escAttr(s.url)}" target="_blank" rel="noopener">${escTxt(s.name)}</a>${s.verified ? ' <span class="qd-pricing-verified">✓ verified live</span>' : ''}</li>`).join('')}
            </ul>
          </details>
        </aside>
      </div>
    </section>
  `;
};

const handlePricingFieldChange = (target) => {
  syncPricingBriefInputs();
  const field = target.dataset.pricingField;
  if (field === 'care-plan') state.pricing.carePlanId = target.value;
  if (field === 'vat-on') state.pricing.vatOn = !!target.checked;
  state.pricing.copied = false;
  render();
};

// Live feature search: filters chips in place (no re-render, keeps focus).
const applyPricingAddonFilter = (value) => {
  state.pricing.ui.specFilter = value;
  const norm = value.trim().toLowerCase();
  document.querySelectorAll('[data-pricing-spec-row]').forEach((row) => {
    const show = !norm || row.dataset.pricingSpecRow.includes(norm);
    row.hidden = !show;
    row.style.display = show ? 'block' : 'none';
  });
};

const syncPricingBriefInputs = () => {
  const nameEl = document.getElementById('pricing-client-name');
  const briefEl = document.getElementById('pricing-brief-text');
  if (nameEl) state.pricing.clientName = nameEl.value;
  if (briefEl) state.pricing.briefText = briefEl.value;
};

const handlePricingAction = async (action, actionTarget) => {
  syncPricingBriefInputs();
  const p = state.pricing;
  const done = () => { p.copied = false; render(); return true; };

  if (action === 'pricing-toggle-describe') { p.ui.describeOpen = !p.ui.describeOpen; return done(); }
  if (action === 'pricing-analyze-brief') {
    applyBriefAnalysis(parseBrief(p.briefText));
    return done();
  }
  if (action === 'pricing-quick-start') {
    applyIndustryPresetSuggestion(actionTarget.dataset.quickStart);
    return done();
  }
  if (action === 'pricing-toggle-website') {
    p.website = !p.website;
    if (p.website && p.pagesStandard < 5) p.pagesStandard = 5;
    return done();
  }
  if (action === 'pricing-toggle-spec') {
    const id = actionTarget.dataset.spec;
    const spec = SPEC_BY_ID[id];
    if (!spec) return true;
    if (p.specs[id]) delete p.specs[id];
    else p.specs[id] = { tier: spec.defaultTier || 'low', qty: 1 };
    return done();
  }
  if (action === 'pricing-set-spec-tier') {
    const id = actionTarget.dataset.spec;
    const spec = SPEC_BY_ID[id];
    if (!spec) return true;
    p.specs[id] = { ...(p.specs[id] || { qty: 1 }), tier: actionTarget.dataset.tier || spec.defaultTier || 'low' };
    return done();
  }
  if (action === 'pricing-pages') {
    const delta = Number(actionTarget.dataset.delta) || 0;
    if (actionTarget.dataset.kind === 'standard') p.pagesStandard = Math.max(1, Math.min(200, p.pagesStandard + delta));
    else p.pagesLanding = Math.max(0, Math.min(50, p.pagesLanding + delta));
    return done();
  }
  if (action === 'pricing-toggle-founding') { p.founding.enabled = !p.founding.enabled; return done(); }
  if (action === 'pricing-founding-pct') {
    const delta = Number(actionTarget.dataset.delta) || 0;
    p.founding.percent = Math.min(Math.max(p.founding.percent + delta, 1), FOUNDING_MAX_DISCOUNT_PERCENT);
    return done();
  }
  if (action === 'pricing-reset') {
    const keepName = p.clientName;
    state.pricing = defaultPricingState();
    state.pricing.clientName = keepName;
    render();
    return true;
  }
  if (action === 'pricing-create-quote') {
    const selection = getPricingLaunchSelection();
    const estimate = buildEstimate(selection);
    if (!estimate.lines.some((line) => Number(line.amount) !== 0)) {
      showAdminToast('Click at least one billable product before creating a quote.');
      return true;
    }
    const user = auth.currentUser;
    if (!user) {
      showAdminToast('Not signed in.');
      return true;
    }
    p.quoteCreating = true;
    p.copied = false;
    render();
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/quote-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          selection,
          clientName: p.clientName,
          language: 'en'
        })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showAdminToast(`Could not create quote: ${err.error || res.status}`);
        p.quoteCreating = false;
        render();
        return true;
      }
      const created = await res.json();
      p.quoteCreating = false;
      await goToQuotationDetail(created);
    } catch (error) {
      p.quoteCreating = false;
      showAdminToast(`Could not create quote: ${error.message}`);
      render();
    }
    return true;
  }
  if (action === 'pricing-copy-summary') {
    const estimate = buildEstimate(getPricingLaunchSelection());
    try {
      await navigator.clipboard.writeText(formatEstimateText(estimate, { businessName: p.clientName }));
      p.copied = true;
    } catch {
      showAdminToast('Could not access clipboard.');
    }
    render();
    return true;
  }
  return false;
};

await setPersistence(auth, browserLocalPersistence).catch(() => {});

onAuthStateChanged(auth, async (user) => {
  console.log('Admin auth check:', user?.email);
  state.authLoading = false;
  state.loginError = '';
  state.selectedId = null;
  state.drawerDraft = null;
  state.saveError = '';
  state.user = user;

  if (user && !isAllowedAdminUser(user)) {
    state.pendingLoginAudit = false;
    state.user = null;
    state.loginError = unauthorizedAdminMessage;
  }

  if (user && isAllowedAdminUser(user)) {
    await ensureAdminFirestoreSession(user);
    subscribeToSubmissions();
    subscribeToQuotes();
    subscribeToCards();
    subscribeToDemos();
    subscribeToOutreachLeads();
    if (state.activeTab === 'payments') loadQuotesList();
    if (state.activeTab === 'collections') loadSharedBank();
    if (state.activeTab === 'overview') loadCollections();
    if (state.pendingLoginAudit) {
      await logAdminActivity({
        action: 'login',
        targetType: 'session',
        targetId: user.uid,
        targetLabel: user.email || 'Admin session'
      });
      state.pendingLoginAudit = false;
    }
  } else {
    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
      unsubscribeSnapshot = null;
    }
    if (unsubscribeQuotesSnapshot) {
      unsubscribeQuotesSnapshot();
      unsubscribeQuotesSnapshot = null;
    }
    if (unsubscribeCardsSnapshot) {
      unsubscribeCardsSnapshot();
      unsubscribeCardsSnapshot = null;
    }
    if (unsubscribeDemosSnapshot) {
      unsubscribeDemosSnapshot();
      unsubscribeDemosSnapshot = null;
    }
    if (unsubscribeInvitationsSnapshot) {
      unsubscribeInvitationsSnapshot();
      unsubscribeInvitationsSnapshot = null;
    }
    if (unsubscribeOutreachSnapshot) {
      unsubscribeOutreachSnapshot();
      unsubscribeOutreachSnapshot = null;
    }
    state.submissions = [];
    state.cards = [];
    state.demos = [];
    state.invitations = [];
    state.outreachLeads = [];
    state.invitationRsvps = [];
    state.activityLogs = [];
    state.submissionActivityLogs = [];
    state.quotesBySubmissionId = {};
    state.overviewQuotesAwaiting = 0;
    state.quoteDrawer = { open: false, quote: null, original: null, dirty: false };
    state.paymentLookup = {
      quoteRef: '',
      quote: null,
      quotes: [],
      quotesLoading: false,
      quotesError: '',
      search: '',
      status: 'All',
      loading: false,
      saving: false,
      error: '',
      form: {
        amount: '',
        date: new Date().toISOString().slice(0, 10),
        method: 'Bank transfer',
        note: ''
      }
    };
    state.collections = {
      loading: false,
      error: '',
      data: null,
      on: new Date().toISOString().slice(0, 10)
    };
    state.cardEditor = {
      open: false,
      mode: 'create',
      id: null,
      draft: null,
      original: null,
      slugState: { status: 'idle', message: '' },
      slugTouched: false,
      isSaving: false,
      error: '',
      pendingAvatarFile: null
    };
    state.demoEditor = {
      open: false,
      mode: 'create',
      id: null,
      draft: null,
      original: null,
      slugState: { status: 'idle', message: '' },
      slugTouched: false,
      isSaving: false,
      deployLoading: false,
      error: ''
    };
    state.invitationEditor = {
      open: false,
      mode: 'create',
      id: null,
      draft: null,
      original: null,
      slugState: { status: 'idle', message: '' },
      slugTouched: false,
      isSaving: false,
      error: ''
    };
    state.outreachEditor = {
      open: false,
      mode: 'create',
      id: null,
      draft: null,
      original: null,
      isSaving: false,
      mapsLoading: false,
      mapsError: '',
      mapsUrl: '',
      error: ''
    };
    state.dataLoading = false;
    state.dataError = '';
    state.cardsLoading = false;
    state.cardsError = '';
    state.demosLoading = false;
    state.demosError = '';
    state.invitationsLoading = false;
    state.invitationsError = '';
    state.outreachLoading = false;
    state.outreachError = '';
    state.invitationRsvpsLoading = false;
    state.activityLoading = false;
    state.submissionActivityLoading = false;
  }

  render();

  if (user && !isAllowedAdminUser(user)) {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Unauthorized admin sign-out failed:', error);
    }
  }
});

render();
const syncAdminTabUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.set('tab', state.activeTab);
  if (state.activeTab === 'dashboard') {
    url.searchParams.set('section', state.dashboardSection);
  } else {
    url.searchParams.delete('section');
  }
  if (state.activeTab === 'payments') {
    url.searchParams.delete('q');
    if (state.paymentLookup.status && state.paymentLookup.status !== 'All') url.searchParams.set('quoteStatus', state.paymentLookup.status);
    else url.searchParams.delete('quoteStatus');
  } else {
    url.searchParams.delete('q');
    url.searchParams.delete('quoteStatus');
  }
  window.history.replaceState({}, '', url);
};
