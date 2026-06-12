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
import { CATALOG, catalogToLineItem } from '/app/lib/quote-catalog.js';
import { computeTotals, formatAED } from '/app/lib/quote-totals.js';
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
  getAddonLevel
} from '/app/lib/pricing-model.js';
import { parseBrief } from '/app/lib/brief-parser.js';
import {
  INVITATIONS_COLLECTION,
  INVITATION_RSVPS_COLLECTION,
  buildInvitationWhatsappMessage,
  createDefaultInvitationFeatures,
  deriveCoupleDisplayName,
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
const adminTabs = new Set(['dashboard', 'cards', 'demos', 'activity', 'invitations', 'outreach']);
const initialAdminTab = new URLSearchParams(window.location.search).get('tab');
const dashboardSections = new Set(['overview', 'pipeline', 'archive']);
const initialDashboardSection = new URLSearchParams(window.location.search).get('section');
const initialActivitySearch = new URLSearchParams(window.location.search).get('activitySearch') || '';
const activityActionLabels = {
  login: 'Logged in',
  logout: 'Logged out',
  open_submission: 'Opened submission',
  edit_submission: 'Edited submission',
  change_status: 'Changed status',
  change_priority: 'Changed priority',
  delete_submission: 'Deleted submission',
  create_quote: 'Created quote',
  update_quote: 'Updated quote',
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
  activeTab: adminTabs.has(initialAdminTab) ? initialAdminTab : 'dashboard',
  dashboardSection: dashboardSections.has(initialDashboardSection) ? initialDashboardSection : 'overview',
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
  quoteDrawer: { open: false, quote: null, original: null, dirty: false },
  quoteToast: '',
  pricing: {
    products: { website: false, store: null, dashboard: null, booking: false, ordering: false, chatbot: null },
    foundationId: null,
    pagesStandard: 0,
    pagesLanding: 0,
    bookingTier: 'mid',
    orderingTier: 'mid',
    chatbotTier: 'low',
    dashboardTier: 'low',
    addons: {},        // { [addonId]: { tier: 'low'|'mid'|'high', qty: number } }
    industryGroupId: null,
    modules: {},       // { [moduleId]: true }
    carePlanId: 'none',
    clientName: '',
    briefText: '',
    analysis: null,    // parseBrief() result, kept for the review panel
    founding: { enabled: false, percent: 10 },
    ui: { describeOpen: true, moreOpen: false, addonFilter: '' },
    copied: false
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
    error: '',
    pendingCoverFile: null,
    pendingMusicFile: null
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

const hydrateInvitation = (snapshot) => ({
  id: snapshot.id,
  ...createEmptyInvitationDraft(),
  ...snapshot.data()
});

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
  const openStatuses = new Set(['New', 'Reviewed', 'Contacted', 'Meeting', 'Quoted', 'Under Construction']);
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

    if (openStatuses.has(submission.status)) {
      const activityMs = getSubmissionActivityMs(submission);
      const ageDays = activityMs ? Math.floor((now - activityMs) / 86400000) : 0;
      if (ageDays <= 2) agingBuckets.fresh += 1;
      else if (ageDays <= 7) agingBuckets.warm += 1;
      else agingBuckets.stale += 1;
    }
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
      ['7+ days', agingBuckets.stale]
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
  if (!items.length) {
    return `<div class="qd-admin-empty"><strong>No data yet</strong>${escapeHtml(emptyText)}</div>`;
  }

  return `
    <div class="qd-admin-list">
      ${items.map(([label, count]) => `
        <div class="qd-admin-list-item">
          <span>${escapeHtml(label)}</span>
          <strong class="qd-admin-count-badge">${count}</strong>
        </div>
      `).join('')}
    </div>
  `;
};

const renderStageBars = (items) => {
  const total = items.reduce((sum, [, count]) => sum + count, 0);
  const orderedStages = statusOptions.map((status) => {
    const entry = items.find(([label]) => label === status);
    return [status, entry ? entry[1] : 0];
  });

  return `
    <div class="qd-admin-stage-bars">
      ${orderedStages.map(([label, count]) => {
        const percent = total ? Math.round((count / total) * 100) : 0;
        const active = count > 0;
        return `
          <div class="qd-admin-stage-row ${active ? 'is-active' : ''}">
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
    </div>
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

const renderOverviewCards = (analytics) => {
  const activeSnapshotStatus = state.filters.status === 'All' ? 'Total' : state.filters.status;
  const cardMeta = [
    ['Total', 'All', analytics.counts.total, 'All live submissions'],
    ['New', 'New', analytics.counts.New || 0, 'Awaiting review'],
    ['Reviewed', 'Reviewed', analytics.counts.Reviewed || 0, 'Assessed'],
    ['Contacted', 'Contacted', analytics.counts.Contacted || 0, 'Initial outreach completed'],
    ['Meeting', 'Meeting', analytics.counts.Meeting || 0, 'Intro or follow-up meeting planned'],
    ['Quoted', 'Quoted', analytics.counts.Quoted || 0, 'Proposal stage'],
    ['Accepted', 'Accepted', analytics.counts.Accepted || 0, 'Approved'],
    ['Under Construction', 'Under Construction', analytics.counts['Under Construction'] || 0, 'Build in progress'],
    ['Completed', 'Completed', analytics.counts.Completed || 0, 'Delivered and closed'],
    ['Archived', 'Archived', analytics.counts.Archived || 0, 'Closed or parked']
  ];

  return `
    <section class="qd-admin-section">
      <div class="qd-admin-section-head">
        <div>
          <div class="qd-eyebrow qd-admin-kicker">Overview</div>
          <h2>Pipeline snapshot</h2>
        </div>
      </div>
      <div class="qd-admin-kpi-grid">
      ${cardMeta.map(([label, status, value, meta]) => {
        const isActive = activeSnapshotStatus === label;
        const ariaLabel = label === 'Total'
          ? 'Show all submissions'
          : `Filter pipeline to ${label} submissions`;

        return `
        <button
          class="qd-admin-card qd-admin-kpi-card ${isActive ? 'is-active' : ''}"
          type="button"
          role="button"
          data-action="set-pipeline-status"
          data-status="${escapeHtml(status)}"
          aria-label="${escapeHtml(ariaLabel)}"
          aria-pressed="${isActive ? 'true' : 'false'}"
        >
          <span class="qd-admin-card-label">${escapeHtml(label)}</span>
          <strong class="qd-admin-kpi-value">${value}</strong>
          <p>${escapeHtml(meta)}</p>
        </button>
      `;
      }).join('')}
      </div>
    </section>
  `;
};

const renderDashboardSectionNav = ({ activeCount, archivedCount, analytics }) => {
  const totalCount = analytics.counts.total || 0;
  const sectionMeta = [
    ['overview', 'Overview', `${totalCount} total`, 'Snapshot, demand signals, and quick routing across the workspace.'],
    ['pipeline', 'Live Pipeline', `${activeCount} active`, 'Review current submissions without the archive crowding the same page.'],
    ['archive', 'Archive', `${archivedCount} closed`, 'Review parked or finished work in a dedicated lane.']
  ];

  return `
    <section class="qd-admin-section qd-admin-section-nav-shell">
      <article class="qd-admin-card qd-admin-dashboard-hero">
        <div class="qd-admin-dashboard-hero-copy">
          <h1>Admin workspace</h1>
        </div>
      </article>

      <div class="qd-admin-dashboard-section-nav" role="tablist" aria-label="Dashboard sections">
        ${sectionMeta.map(([key, label, countLabel, description]) => `
          <button
            class="qd-admin-card qd-admin-dashboard-section-card ${state.dashboardSection === key ? 'is-active' : ''}"
            type="button"
            role="tab"
            aria-selected="${state.dashboardSection === key ? 'true' : 'false'}"
            data-action="set-dashboard-section"
            data-section="${escapeHtml(key)}"
          >
            <span class="qd-admin-card-label">${escapeHtml(label)}</span>
            <strong>${escapeHtml(countLabel)}</strong>
            <p>${escapeHtml(description)}</p>
          </button>
        `).join('')}
      </div>
    </section>
  `;
};

const renderBudgetProjectList = (items) => {
  if (!items.length) {
    return `<div class="qd-admin-empty"><strong>No budgets yet</strong>Only submissions with usable numeric budgets will appear here.</div>`;
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
  const topStage = analytics.stage[0]?.[0] || 'No signal yet';
  const staleLeadCount = analytics.agingBuckets.find(([label]) => label === '7+ days')?.[1] || 0;
  const highestBudgetProject = analytics.budgetProjects[0];
  const responseTimeHeadline = analytics.averageResponseHours !== null ? `${analytics.averageResponseHours} hrs` : '—';
  const responseTimeSubtitle = analytics.averageResponseHours !== null
    ? 'Avg. time before first contact'
    : 'No contacts logged yet';
  return `
    <section class="qd-admin-section">
      <div class="qd-admin-section-head">
        <div>
          <div class="qd-eyebrow qd-admin-kicker">Analytics</div>
          <h2>Demand patterns</h2>
        </div>
      </div>
      <div class="qd-admin-analytics-grid">
      <article class="qd-admin-card qd-admin-analytics-card">
        <div class="qd-admin-card-label">Lead Stage</div>
        <h3>${escapeHtml(topStage)}</h3>
        <p>Most common pipeline status across current submissions.</p>
        ${renderStageBars(analytics.stage)}
      </article>

      <article class="qd-admin-card qd-admin-analytics-card">
        <div class="qd-admin-card-label">Project Budgets</div>
        <h3>${escapeHtml(highestBudgetProject ? formatCurrencyNumber(highestBudgetProject.budget) : 'No budgets')}</h3>
        <p>Submissions with captured budgets, sorted from highest to lowest. Click any project to open its details.</p>
        ${renderBudgetProjectList(analytics.budgetProjects)}
      </article>

      <article class="qd-admin-card qd-admin-analytics-card">
        <div class="qd-admin-card-label">Aging Leads</div>
        <h3>${escapeHtml(staleLeadCount ? `${staleLeadCount} stale` : 'Fresh queue')}</h3>
        <p>Open leads grouped by how long they have been sitting without recent movement.</p>
        ${renderBreakdown(analytics.agingBuckets, 'Lead aging will appear here once submissions arrive.')}
      </article>

      <article class="qd-admin-card qd-admin-analytics-card">
        <div class="qd-admin-card-label">Response Time</div>
        <h3>${escapeHtml(responseTimeHeadline)}</h3>
        <p>${escapeHtml(responseTimeSubtitle)}</p>
        <div class="qd-admin-list">
          <div class="qd-admin-list-item">
            <span>&lt; 1 hour</span>
            <strong class="qd-admin-count-badge">${analytics.responseBuckets.underHour}</strong>
          </div>
          <div class="qd-admin-list-item">
            <span>1–24 hours</span>
            <strong class="qd-admin-count-badge qd-admin-count-badge-amber">${analytics.responseBuckets.withinDay}</strong>
          </div>
          <div class="qd-admin-list-item">
            <span>24+ hours</span>
            <strong class="qd-admin-count-badge qd-admin-count-badge-red">${analytics.responseBuckets.overDay}</strong>
          </div>
        </div>
        <div class="qd-admin-subline">${analytics.responseBuckets.notContacted} not yet contacted</div>
      </article>
      </div>
    </section>
  `;
};

const renderSubmissionRows = (items, emptyTitle = 'No submissions match this view', emptyText = 'Try a broader search or reset the pipeline filters.') => {
  if (!items.length) {
    return `
      <tr>
        <td colspan="6">
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

const renderPipelineWorkspace = (items, totalItems) => `
  <article class="qd-admin-card qd-admin-table-card" id="qd-submission-pipeline">
    <div class="qd-admin-section-head">
      <div>
        <div class="qd-eyebrow qd-admin-kicker">Submission Pipeline</div>
        <h2>Live pipeline</h2>
        <p>Only active work stays here. Open, filter, and move through current submissions without archive noise.</p>
      </div>
    </div>

    <div class="qd-admin-table-toolbar qd-admin-table-toolbar-spacious">
      <input
        class="qd-admin-search"
        type="search"
        placeholder="Search business, email, phone, meeting date, service..."
        value="${escapeHtml(state.filters.search)}"
        data-field="search"
      >
      <select class="qd-admin-select" data-field="status">
        ${['All', ...statusOptions].map((option) => `
          <option value="${escapeHtml(option)}" ${state.filters.status === option ? 'selected' : ''}>${escapeHtml(option)}</option>
        `).join('')}
      </select>
      <select class="qd-admin-select" data-field="priority">
        ${['All', ...priorityOptions].map((option) => `
          <option value="${escapeHtml(option)}" ${state.filters.priority === option ? 'selected' : ''}>${escapeHtml(option)}</option>
        `).join('')}
      </select>
    </div>

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
          </tr>
        </thead>
        <tbody>${renderSubmissionRows(items)}</tbody>
      </table>
    </div>
    <div class="qd-admin-mobile-list">
      ${renderSubmissionCards(items)}
    </div>
    ${renderPipelinePagination(totalItems)}
  </article>
`;

const renderArchiveWorkspace = (items) => `
  <article class="qd-admin-card qd-admin-table-card" id="qd-archived-submissions">
    <div class="qd-admin-section-head">
      <div>
        <div class="qd-eyebrow qd-admin-kicker">Archive</div>
        <h2>Archived submissions</h2>
        <p>Closed, rejected, or parked projects live here so active operations stay focused.</p>
      </div>
    </div>

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
          </tr>
        </thead>
        <tbody>${renderSubmissionRows(
          items,
          'No archived submissions in this view',
          'Archived projects will appear here when they match the current search and filters.'
        )}</tbody>
      </table>
    </div>
    <div class="qd-admin-mobile-list">
      ${renderSubmissionCards(
        items,
        'No archived submissions in this view',
        'Archived projects will appear here when they match the current search and filters.'
      )}
    </div>
  </article>
`;

const renderDashboard = () => {
  const filteredSubmissions = getFilteredSubmissions();
  const activeSubmissions = filteredSubmissions.filter((submission) => submission.status !== 'Archived');
  const archivedSubmissions = filteredSubmissions.filter((submission) => submission.status === 'Archived');
  const pipelinePageSize = 5;
  const pipelinePageCount = Math.ceil(activeSubmissions.length / pipelinePageSize);
  const activePipelinePage = Math.min(state.pipelinePage, Math.max(pipelinePageCount - 1, 0));
  const paginatedActiveSubmissions = activeSubmissions.slice(
    activePipelinePage * pipelinePageSize,
    (activePipelinePage + 1) * pipelinePageSize
  );
  const analytics = getAnalytics(state.submissions);
  const dashboardBody = state.dashboardSection === 'pipeline'
    ? renderPipelineWorkspace(paginatedActiveSubmissions, activeSubmissions.length)
    : state.dashboardSection === 'archive'
      ? renderArchiveWorkspace(archivedSubmissions)
      : `
        <section class="qd-admin-dashboard-overview-stack">
          ${renderOverviewCards(analytics)}
          ${renderAnalyticsCards(analytics)}
        </section>
      `;

  return `
    <section class="qd-admin-dashboard">
      ${state.dataError ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.dataError)}</div>` : ''}
      ${renderDashboardSectionNav({
        activeCount: activeSubmissions.length,
        archivedCount: archivedSubmissions.length,
        analytics
      })}
      ${dashboardBody}
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
          <button class="qd-btn qd-btn-sm qd-admin-action-primary" type="button" data-action="open-outreach-create">Add Lead</button>
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

const renderAdminTabs = () => `
  <nav class="qd-admin-tabs" aria-label="Admin sections">
    <button class="qd-admin-tab ${state.activeTab === 'dashboard' ? 'is-active' : ''}" type="button" data-action="set-admin-tab" data-tab="dashboard">Pipeline</button>
    <button class="qd-admin-tab ${state.activeTab === 'outreach' ? 'is-active' : ''}" type="button" data-action="set-admin-tab" data-tab="outreach">Outreach</button>
    <a class="qd-admin-tab qd-admin-tab-link" href="chat-admin.html?returnTo=${escapeHtml(state.activeTab)}">Chat Leads</a>
    <button class="qd-admin-tab ${state.activeTab === 'demos' ? 'is-active' : ''}" type="button" data-action="set-admin-tab" data-tab="demos">Demos</button>
    <button class="qd-admin-tab ${state.activeTab === 'cards' ? 'is-active' : ''}" type="button" data-action="set-admin-tab" data-tab="cards">Smart Cards</button>
    <button class="qd-admin-tab ${state.activeTab === 'invitations' ? 'is-active' : ''}" type="button" data-action="set-admin-tab" data-tab="invitations">Invitations</button>
    <button class="qd-admin-tab ${state.activeTab === 'pricing' ? 'is-active' : ''}" type="button" data-action="set-admin-tab" data-tab="pricing">Pricing</button>
    <button class="qd-admin-tab ${state.activeTab === 'activity' ? 'is-active' : ''}" type="button" data-action="set-admin-tab" data-tab="activity">Activity</button>
  </nav>
`;

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
          <button class="qd-btn qd-btn-sm qd-admin-action-primary" type="button" data-action="open-card-create">Create card</button>
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
            <button class="qd-btn qd-btn-sm qd-admin-action-primary" type="button" data-action="open-demo-create">Create demo</button>
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
            <div class="qd-admin-field qd-admin-card-avatar-field">
              <label for="invite-cover-image">Cover Image</label>
              <input id="invite-cover-image" class="qd-admin-input qd-admin-file-input" name="coverImageFile" type="file" accept="image/*">
              <div class="qd-admin-field-hint">${escapeHtml(state.invitationEditor.pendingCoverFile?.name || draft.coverImageUrl || 'Uploads to Firebase Storage at invitations/[slug]/cover.*')}</div>
            </div>
            <div class="qd-admin-field qd-admin-card-avatar-field">
              <label for="invite-music-file">Background Music</label>
              <input id="invite-music-file" class="qd-admin-input qd-admin-file-input" name="musicFile" type="file" accept="audio/*">
              <div class="qd-admin-field-hint">${escapeHtml(state.invitationEditor.pendingMusicFile?.name || draft.musicUrl || 'Uploads to Firebase Storage at invitations/[slug]/music.*')}</div>
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
            ${state.invitationRsvpsError ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.invitationRsvpsError)}</div>` : ''}
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
            <span class="qd-admin-save-help">Cover media is stored in Firebase Storage, public URLs are generated automatically, and the invitation stays available at its slug.</span>
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
          <button class="qd-btn qd-btn-sm qd-admin-action-primary" type="button" data-action="open-invitation-create">Create invitation</button>
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
          <select class="qd-admin-select" data-activity-field="action">
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
          <button class="qd-btn qd-btn-sm qd-admin-action-danger" type="button" data-action="archive-submission">Archive</button>
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

const renderAppShell = (content) => {
  const userBadge = state.user?.email
    ? `<span class="qd-admin-user-badge">${escapeHtml(state.user.email)}</span>`
    : '';

  return `
    <div class="qd-admin-shell">
      <div class="qd-admin-frame">
        <header class="qd-admin-topbar">
          <div class="qd-admin-brand">
            <img src="assets/qd-logo.jpeg" alt="QD Systems">
          </div>

          <div class="qd-admin-topbar-actions">
            ${userBadge}
            ${state.user ? '<button class="qd-btn qd-btn-ghost qd-btn-sm" type="button" data-action="logout">Logout</button>' : ''}
          </div>
        </header>

        ${state.user ? renderAdminTabs() : ''}
        ${content}
      </div>
      ${state.adminToast ? `<div class="qd-admin-toast" role="status" aria-live="polite">${escapeHtml(state.adminToast)}</div>` : ''}
      ${renderDrawer()}
      ${renderCardEditor()}
      ${renderDemoEditor()}
      ${renderInvitationEditor()}
      ${renderOutreachEditor()}
      ${renderQuoteDrawer()}
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
          <input id="admin-password" class="qd-admin-input" name="password" type="password" placeholder="**********" required>
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

const render = () => {
  const nextModalOpen = Boolean(state.selectedId || state.cardEditor.open || state.demoEditor.open || state.invitationEditor.open || state.outreachEditor.open || state.quoteDrawer.open);
  if (nextModalOpen !== isModalOpen) {
    document.body.classList.toggle('qd-modal-open', nextModalOpen);
    isModalOpen = nextModalOpen;
  }

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

  if (state.dataLoading && state.submissions.length === 0) {
    root.innerHTML = renderLoading('Syncing submissions', 'Opening the realtime Firestore listener for projectSubmissions.');
    syncActivitySubscriptions();
    return;
  }

  const content = state.activeTab === 'cards'
    ? renderCardsManager()
    : state.activeTab === 'demos'
      ? renderDemosManager()
    : state.activeTab === 'invitations'
      ? renderInvitationsManager()
    : state.activeTab === 'outreach'
      ? renderOutreachManager()
    : state.activeTab === 'pricing'
      ? renderPricingManager()
    : state.activeTab === 'activity'
      ? renderActivityManager()
      : renderDashboard();
  root.innerHTML = renderAppShell(content);
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
            if (!state.invitationEditor.pendingCoverFile && !state.invitationEditor.pendingMusicFile) {
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
  const rsvpQuery = query(rsvpRef, where('inviteId', '==', invitationId), orderBy('createdAt', 'desc'), limit(250));
  unsubscribeInvitationRsvpsSnapshot = onSnapshot(
    rsvpQuery,
    (snapshot) => {
      state.invitationRsvps = snapshot.docs.map(hydrateInvitationRsvp);
      state.invitationRsvpsLoading = false;
      if (state.invitationEditor.open && state.invitationEditor.id === invitationId) render();
    },
    (error) => {
      state.invitationRsvpsLoading = false;
      state.invitationRsvpsError = error?.message || 'Unable to read invitation RSVPs.';
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
    error: '',
    pendingCoverFile: null,
    pendingMusicFile: null
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
    error: '',
    pendingCoverFile: null,
    pendingMusicFile: null
  };
  stopInvitationRsvpsSubscription();
  render();
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

const getSafeFileExtension = (file, fallback) => {
  const fromName = String(file?.name || '').split('.').pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  const fromType = String(file?.type || '').split('/').pop()?.toLowerCase();
  if (fromType && /^[a-z0-9.+-]{2,12}$/.test(fromType)) return fromType.replace('mpeg', 'mp3').replace('jpeg', 'jpg');
  return fallback;
};

const uploadInvitationCoverIfNeeded = async (draft) => {
  const file = state.invitationEditor.pendingCoverFile;
  if (!file) {
    return {
      coverImageUrl: draft.coverImageUrl || '',
      coverImageStoragePath: draft.coverImageStoragePath || ''
    };
  }

  const ext = getSafeFileExtension(file, 'jpg');
  const path = `invitations/${draft.slug}/cover.${ext}`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, file);
  const url = await getDownloadURL(ref);
  return { coverImageUrl: url, coverImageStoragePath: path };
};

const uploadInvitationMusicIfNeeded = async (draft) => {
  const file = state.invitationEditor.pendingMusicFile;
  if (!file) {
    return {
      musicUrl: draft.musicUrl || '',
      musicStoragePath: draft.musicStoragePath || ''
    };
  }

  const ext = getSafeFileExtension(file, 'mp3');
  const path = `invitations/${draft.slug}/music.${ext}`;
  const ref = storageRef(storage, path);
  await uploadBytes(ref, file);
  const url = await getDownloadURL(ref);
  return { musicUrl: url, musicStoragePath: path };
};

const deleteStoragePathIfPresent = async (path) => {
  if (!path) return;
  try {
    await deleteObject(storageRef(storage, path));
  } catch (error) {
    console.warn('[invitation-media] cleanup skipped:', error?.message || error);
  }
};

const saveInvitationEditor = async () => {
  const draft = ensureInvitationEditorData();

  if (!draft.brideName || !draft.groomName || !draft.slug || !draft.eventDate || !draft.venueName) {
    state.invitationEditor.error = 'Bride name, groom name, slug, event date, and venue name are required.';
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
    const coverPayload = await uploadInvitationCoverIfNeeded(draft);
    const musicPayload = await uploadInvitationMusicIfNeeded(draft);
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
      coverImageUrl: coverPayload.coverImageUrl,
      coverImageStoragePath: coverPayload.coverImageStoragePath,
      musicUrl: musicPayload.musicUrl,
      musicStoragePath: musicPayload.musicStoragePath,
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
      if (state.invitationEditor.pendingCoverFile && previous.coverImageStoragePath && previous.coverImageStoragePath !== payload.coverImageStoragePath) {
        await deleteStoragePathIfPresent(previous.coverImageStoragePath);
      }
      if (state.invitationEditor.pendingMusicFile && previous.musicStoragePath && previous.musicStoragePath !== payload.musicStoragePath) {
        await deleteStoragePathIfPresent(previous.musicStoragePath);
      }
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
    state.invitationEditor.error = error?.message || 'Could not save the wedding invitation.';
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
  await deleteStoragePathIfPresent(invitation.coverImageStoragePath);
  await deleteStoragePathIfPresent(invitation.musicStoragePath);
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

  if (action === 'logout') {
    await handleLogout();
    return;
  }

  if (action === 'set-admin-tab') {
    state.activeTab = actionTarget.dataset.tab || 'dashboard';
    if (state.activeTab === 'activity') {
      state.activityLoading = true;
      state.activityError = '';
    }
    syncAdminTabUrl();
    render();
    return;
  }

  if (action === 'set-dashboard-section') {
    const nextSection = actionTarget.dataset.section || 'overview';
    state.dashboardSection = dashboardSections.has(nextSection) ? nextSection : 'overview';
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
    state.quoteDrawer.dirty = true;
    render();
    return;
  }

  if (action === 'quote-add-custom-line') {
    if (!state.quoteDrawer.quote) return;
    state.quoteDrawer.quote.lineItems.push({
      catalogKey: null,
      name: { en: '', ar: '' },
      description: { en: '', ar: '' },
      qty: 1,
      unitPrice: 0
    });
    state.quoteDrawer.dirty = true;
    render();
    return;
  }

  if (action === 'quote-save-draft') {
    await saveQuoteDrawer({ markSent: false, copy: false });
    return;
  }

  if (action === 'quote-save-and-copy') {
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
  if (qfield || qline) {
    applyQuoteChange(qfield || qline, event.target.value);
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

document.addEventListener('input', (event) => {
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

  if (event.target.id === 'invite-cover-image') {
    state.invitationEditor.pendingCoverFile = event.target.files?.[0] || null;
    const hint = event.target.closest('.qd-admin-field')?.querySelector('.qd-admin-field-hint');
    if (hint) {
      hint.textContent = state.invitationEditor.pendingCoverFile?.name || state.invitationEditor.draft?.coverImageUrl || 'Uploads to Firebase Storage at invitations/[slug]/cover.*';
    }
    return;
  }

  if (event.target.id === 'invite-music-file') {
    state.invitationEditor.pendingMusicFile = event.target.files?.[0] || null;
    const hint = event.target.closest('.qd-admin-field')?.querySelector('.qd-admin-field-hint');
    if (hint) {
      hint.textContent = state.invitationEditor.pendingMusicFile?.name || state.invitationEditor.draft?.musicUrl || 'Uploads to Firebase Storage at invitations/[slug]/music.*';
    }
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

  if (event.target.dataset.qaction === 'add-from-catalog') {
    const key = event.target.value;
    if (!key || !state.quoteDrawer.quote) return;
    const line = catalogToLineItem(key);
    if (line) {
      state.quoteDrawer.quote.lineItems.push(line);
      state.quoteDrawer.dirty = true;
      event.target.value = '';
      render();
    }
  }

  if (event.target.dataset.qaction === 'add-package') {
    const pkgId = event.target.value;
    if (!pkgId || !state.quoteDrawer.quote) return;
    const pkg = getPackage(pkgId);
    if (pkg) {
      state.quoteDrawer.quote.lineItems.push({
        catalogKey: pkg.id,
        name: { en: pkg.name.en, ar: pkg.name.ar },
        description: { en: pkg.includes.join(' · '), ar: '' },
        qty: 1,
        unitPrice: pkg.oneTime
      });
      state.quoteDrawer.dirty = true;
      event.target.value = '';
      render();
    }
  }
});

document.addEventListener('submit', async (event) => {
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
    if (state.selectedId) closeDrawer();
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
      snap.forEach((d) => {
        const data = d.data();
        if (data.submissionId) map[data.submissionId] = { id: d.id, ...data };
      });
      state.quotesBySubmissionId = map;
      if (state.quoteDrawer.open && state.quoteDrawer.quote?.id) {
        const fresh = Object.values(map).find((q) => q.id === state.quoteDrawer.quote.id);
        if (fresh && !state.quoteDrawer.dirty) {
          state.quoteDrawer.quote = { ...fresh, lineItems: [...(fresh.lineItems || [])] };
          state.quoteDrawer.original = deepCloneForLog(getQuoteLogState(fresh));
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

const openQuoteFromSubmission = async (submissionId) => {
  const existing = state.quotesBySubmissionId[submissionId];
  if (existing) {
    openQuoteDrawer(existing);
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
        openQuoteDrawer(err.existing);
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
    openQuoteDrawer(created);
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

const openQuoteDrawer = (quote) => {
  lastModalOpenedAt = Date.now();
  state.quoteDrawer = {
    open: true,
    quote: {
      ...quote,
      lineItems: [...(quote.lineItems || [])],
      pages: { ...(quote.pages || {}), price: Number(quote.pages?.price) || 0 }
    },
    original: deepCloneForLog(getQuoteLogState(quote)),
    dirty: false
  };
  render();
};

const closeQuoteDrawer = ({ autosave = true } = {}) => {
  if (autosave && state.quoteDrawer.dirty) {
    saveQuoteDrawer({ markSent: false, copy: false, silent: true });
  }
  state.quoteDrawer = { open: false, quote: null, original: null, dirty: false };
  render();
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
    cur[last] = (last === 'qty' || last === 'unitPrice') ? Number(value) || 0 : value;
  } else {
    let cur = q;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    const last = parts[parts.length - 1];
    cur[last] = (last === 'validDays' || last === 'vatPercent' || path === 'pages.price') ? Number(value) || 0 : value;
  }
  state.quoteDrawer.dirty = true;
};

const updateQuoteTotalsPreview = () => {
  const q = state.quoteDrawer.quote;
  if (!q) return;
  const t = computeTotals(q.lineItems, q.vatPercent, q.pages?.price);
  const preview = document.querySelector('#qd-quote-drawer .qd-quote-totals');
  if (!preview) return;
  preview.innerHTML = `
    <div class="qd-quote-totals-row"><span>Line items</span><span>${formatAED(t.lineItemsSubtotal)}</span></div>
    <div class="qd-quote-totals-row"><span>Pages included</span><span>${formatAED(t.pagesSubtotal)}</span></div>
    <div class="qd-quote-totals-row"><span>Subtotal</span><span>${formatAED(t.subtotal)}</span></div>
    <div class="qd-quote-totals-row" style="opacity:0.85"><span>VAT ${q.vatPercent}%</span><span>${formatAED(t.vat)}</span></div>
    <div class="qd-quote-totals-row is-grand"><span>Total AED</span><span>${formatAED(t.grandTotal)}</span></div>
  `;
};

const saveQuoteDrawer = async ({ markSent = false, copy = false, silent = false } = {}) => {
  const q = state.quoteDrawer.quote;
  if (!q) return;
  const beforeState = state.quoteDrawer.original || getQuoteLogState(q);
  try {
    const user = auth.currentUser;
    if (!user) { if (!silent) showToast('Not signed in.'); return; }
    const token = await user.getIdToken();
    const updates = {
      customer: q.customer,
      lineItems: q.lineItems,
      pages: q.pages,
      terms: q.terms,
      notes: q.notes,
      validDays: q.validDays,
      vatPercent: q.vatPercent,
      language: q.language || 'en'
    };
    console.log('[quote-save] requesting API', { id: q.id, markSent, endpoint: '/api/quote-save', updates });
    const res = await fetch('/api/quote-save', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id: q.id, updates, markSent })
    });
    console.log('[quote-save] response status', res.status, res.statusText);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[quote-save] API failure payload:', err);
      if (!silent) showToast(`Save failed: ${err.error || res.status}`);
      return;
    }
    state.quoteDrawer.dirty = false;
    const afterState = getQuoteLogState(q);
    const changeSet = buildChangedMetadata(beforeState, afterState);
    if (changeSet.changedFields.length || markSent) {
      await logAdminActivity({
        action: 'update_quote',
        targetType: 'quote',
        targetId: q.submissionId || q.id,
        targetLabel: q.quoteNumber || q.id,
        metadata: {
          ...changeSet,
          quoteId: q.id,
          submissionId: q.submissionId || '',
          markSent
        }
      });
    }
    state.quoteDrawer.original = deepCloneForLog(afterState);
    if (copy) {
      const url = `${location.origin}/q/${q.id}`;
      const text = `Your quotation from QD Systems:\n${url}\nPasscode: ${q._passcodePlain || '(check admin)'}`;
      try {
        await navigator.clipboard.writeText(text);
        showToast('Link copied — paste into WhatsApp.');
      } catch {
        prompt('Copy this link manually:', text);
      }
    } else if (!silent) {
      showToast('Saved.');
    }
  } catch (e) {
    console.error('[quote-save] error:', e);
    if (!silent) showToast(`Error: ${e.message}`);
  }
};

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

const renderQuoteDrawer = () => {
  if (!state.quoteDrawer.open || !state.quoteDrawer.quote) {
    return state.quoteToast ? `<div class="qd-quote-toast">${escTxt(state.quoteToast)}</div>` : '';
  }
  const q = state.quoteDrawer.quote;
  const t = computeTotals(q.lineItems, q.vatPercent, q.pages?.price);
  const statusLabel = q.status === 'active' ? 'View / Edit' : 'Edit';

  return `
    <div class="qd-quote-overlay" data-action="close-quote-drawer"></div>
    <aside class="qd-quote-drawer" id="qd-quote-drawer" role="dialog" aria-modal="true" aria-label="Quote editor">
      <header class="qd-quote-head">
        <h2>${statusLabel} Quote · ${escTxt(q.quoteNumber)}</h2>
        <button type="button" class="qd-quote-close" data-action="close-quote-drawer" aria-label="Close">×</button>
      </header>

      <div class="qd-quote-body">

        <div class="qd-quote-section-label">CUSTOMER</div>
        <input class="qd-quote-input" data-qfield="customer.businessName" value="${escAttr(q.customer?.businessName || '')}" placeholder="Business name">
        <div class="qd-quote-row" style="margin-top:6px">
          <input class="qd-quote-input" data-qfield="customer.email" value="${escAttr(q.customer?.email || '')}" placeholder="Email">
          <input class="qd-quote-input" data-qfield="customer.phone" value="${escAttr(q.customer?.phone || '')}" placeholder="Phone">
        </div>

        <div class="qd-quote-section-label">LINE ITEMS</div>
        <table class="qd-quote-line-items">
          <thead>
            <tr>
              <th style="text-align:left">Service (EN)</th>
              <th style="text-align:left">Service (AR)</th>
              <th style="width:48px">Qty</th>
              <th style="width:80px">Unit AED</th>
              <th style="width:30px"></th>
            </tr>
          </thead>
          <tbody>
            ${(q.lineItems || []).map((li, idx) => `
              <tr>
                <td><input class="qd-quote-input" data-qline="${idx}.name.en" value="${escAttr(li.name?.en || '')}"></td>
                <td><input class="qd-quote-input" data-qline="${idx}.name.ar" value="${escAttr(li.name?.ar || '')}" dir="rtl"></td>
                <td><input class="qd-quote-input" type="number" min="0" data-qline="${idx}.qty" value="${escAttr(li.qty ?? 1)}"></td>
                <td><input class="qd-quote-input" type="number" min="0" data-qline="${idx}.unitPrice" value="${escAttr(li.unitPrice ?? 0)}"></td>
                <td><button type="button" class="qd-quote-remove" data-action="quote-remove-line" data-idx="${idx}" aria-label="Remove">×</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="qd-quote-row" style="margin-top:8px">
          <select class="qd-quote-input qd-quote-catalog" data-qaction="add-package" style="flex:1">
            <option value="">+ Add QD package…</option>
            ${PACKAGES.map((pkg) => `<option value="${escAttr(pkg.id)}">${escTxt(pkg.name.en)} — ${pkg.from ? 'from ' : ''}AED ${formatAED(pkg.oneTime)}</option>`).join('')}
          </select>
          <select class="qd-quote-input qd-quote-catalog" data-qaction="add-from-catalog" style="flex:1">
            <option value="">+ Add feature…</option>
            ${CATALOG.map((c) => `<option value="${escAttr(c.key)}">${escTxt(c.name.en)}${c.defaultPrice > 0 ? ` — AED ${formatAED(c.defaultPrice)}` : ' — scope-based'}</option>`).join('')}
          </select>
          <button type="button" class="qd-btn qd-btn-sm qd-admin-action-secondary" data-action="quote-add-custom-line">+ Custom</button>
        </div>

        <div class="qd-quote-section-label">PAGES INCLUDED</div>
        <input class="qd-quote-input" data-qfield="pages.en" value="${escAttr(q.pages?.en || '')}" placeholder="Home · About · Services · Contact">
        <input class="qd-quote-input" style="margin-top:6px" data-qfield="pages.ar" value="${escAttr(q.pages?.ar || '')}" placeholder="الرئيسية · ..." dir="rtl">
        <input class="qd-quote-input" style="margin-top:6px" type="number" min="0" data-qfield="pages.price" value="${escAttr(q.pages?.price ?? 0)}" placeholder="Pages total price (AED)">

        <div class="qd-quote-totals">
          <div class="qd-quote-totals-row"><span>Line items</span><span>${formatAED(t.lineItemsSubtotal)}</span></div>
          <div class="qd-quote-totals-row"><span>Pages included</span><span>${formatAED(t.pagesSubtotal)}</span></div>
          <div class="qd-quote-totals-row"><span>Subtotal</span><span>${formatAED(t.subtotal)}</span></div>
          <div class="qd-quote-totals-row" style="opacity:0.85"><span>VAT ${q.vatPercent}%</span><span>${formatAED(t.vat)}</span></div>
          <div class="qd-quote-totals-row is-grand"><span>Total AED</span><span>${formatAED(t.grandTotal)}</span></div>
        </div>

        <div class="qd-quote-meta-row">
          <label>VALID <input class="qd-quote-input" type="number" min="1" data-qfield="validDays" value="${escAttr(q.validDays ?? 30)}" style="width:54px"> days</label>
          <label>VAT <input class="qd-quote-input" type="number" min="0" max="100" data-qfield="vatPercent" value="${escAttr(q.vatPercent ?? 5)}" style="width:48px"> %</label>
          <label>CODE <span class="qd-quote-passcode">${escTxt(q._passcodePlain || '(hidden)')}</span></label>
        </div>

        <div class="qd-quote-section-label">TERMS (EN)</div>
        <textarea class="qd-quote-input qd-quote-textarea" data-qfield="terms.en">${escTxt(q.terms?.en || '')}</textarea>
        <div class="qd-quote-section-label">TERMS (AR)</div>
        <textarea class="qd-quote-input qd-quote-textarea" data-qfield="terms.ar" dir="rtl">${escTxt(q.terms?.ar || '')}</textarea>

      </div>

      <footer class="qd-quote-foot">
        <button type="button" class="qd-btn qd-btn-sm qd-admin-action-secondary" data-action="quote-save-draft">Save draft</button>
        <button type="button" class="qd-btn qd-btn-sm qd-admin-action-primary" data-action="quote-save-and-copy">Save + Copy link</button>
      </footer>
    </aside>
    ${state.quoteToast ? `<div class="qd-quote-toast">${escTxt(state.quoteToast)}</div>` : ''}
  `;
};

// ============================================================================
// PRICING ESTIMATOR TAB — drill-down builder (v3)
// Click what you're building → its options appear → industry systems →
// price updates live. Engine: pricing-model.js (UAE-verified, component sums).
// ============================================================================

const defaultPricingState = () => ({
  products: { website: false, store: null, dashboard: null, booking: false, ordering: false, chatbot: null },
  foundationId: null,
  pagesStandard: 0,
  pagesLanding: 0,
  bookingTier: 'mid',
  orderingTier: 'mid',
  chatbotTier: 'low',
  dashboardTier: 'low',
  addons: {},              // extra features: { [addonId]: { tier, qty } }
  industryGroupId: null,
  modules: {},             // { [moduleId]: true }
  carePlanId: 'none',
  clientName: '',
  briefText: '',
  analysis: null,
  founding: { enabled: false, percent: 10 },
  ui: { describeOpen: true, moreOpen: false, addonFilter: '' },
  copied: false
});

const getPricingSelection = () => {
  const p = state.pricing;
  const specials = [];
  if (p.products.store) specials.push(p.products.store);
  if (p.products.dashboard === 'standalone') specials.push('qd-ops-dashboard');
  if (p.products.chatbot === 'standalone') specials.push('qd-ai-chatbot');

  const addons = Object.entries(p.addons).map(([id, cfg]) => ({ id, tier: cfg.tier || 'low', qty: cfg.qty || 1 }));
  if (p.products.booking) addons.push({ id: 'booking-integration', tier: p.bookingTier, qty: 1 });
  if (p.products.ordering) addons.push({ id: 'ordering-integration', tier: p.orderingTier, qty: 1 });
  if (p.products.chatbot === 'attached') addons.push({ id: 'ai-chatbot-upgrade', tier: p.chatbotTier, qty: 1 });
  if (p.products.dashboard === 'attached') addons.push({ id: 'dashboard-pack', tier: p.dashboardTier, qty: 1 });

  return {
    foundationId: p.products.website ? p.foundationId : null,
    pagesStandard: p.products.website || p.products.store ? p.pagesStandard : 0,
    pagesLanding: p.products.website || p.products.store ? p.pagesLanding : 0,
    specials,
    modules: Object.keys(p.modules),
    addons,
    carePlanId: p.carePlanId,
    industryId: getIndustryGroup(p.industryGroupId)?.presetId || null,
    discountPercent: p.founding.enabled ? p.founding.percent : 0
  };
};

// Map a parseBrief() analysis onto the product-based state.
const applyBriefAnalysis = (analysis) => {
  const p = state.pricing;
  p.analysis = analysis;
  p.products = { website: false, store: null, dashboard: null, booking: false, ordering: false, chatbot: null };
  p.addons = {};
  p.modules = {};

  if (analysis.foundation) {
    p.products.website = true;
    p.foundationId = analysis.foundation.id;
    p.pagesStandard = analysis.pagesStandard || 5;
    p.pagesLanding = analysis.pagesLanding || 0;
  }
  (analysis.specials || []).forEach((s) => {
    if (s.id.startsWith('qd-commerce')) p.products.store = s.id;
    else if (s.id === 'qd-ops-dashboard') p.products.dashboard = 'standalone';
    else if (s.id === 'qd-ai-chatbot') p.products.chatbot = 'standalone';
  });
  (analysis.addons || []).forEach((a) => {
    if (a.id === 'booking-integration') { p.products.booking = true; p.bookingTier = a.tier || 'mid'; }
    else if (a.id === 'ordering-integration') { p.products.ordering = true; p.orderingTier = a.tier || 'mid'; }
    else if (a.id === 'ai-chatbot-upgrade') { p.products.chatbot = p.products.chatbot || 'attached'; p.chatbotTier = a.tier || 'low'; }
    else if (a.id === 'dashboard-pack') { p.products.dashboard = p.products.dashboard || 'attached'; p.dashboardTier = a.tier || 'low'; }
    else if (!a.coveredByPackage) p.addons[a.id] = { tier: a.tier || 'low', qty: a.qty || 1 };
  });
  if (analysis.industry) {
    const group = INDUSTRY_MODULES.find((g) => g.presetId === analysis.industry.id);
    if (group) p.industryGroupId = group.id;
  }
  p.carePlanId = analysis.carePlanId || 'none';
  p.copied = false;
};

const getPricingCoveredSets = () => {
  const sel = getPricingSelection();
  const full = new Set();
  const basic = new Set();
  if (sel.foundationId) (FOUNDATION_COVERS[sel.foundationId] || []).forEach((id) => basic.add(id));
  sel.specials.forEach((sid) => (PACKAGE_COVERS[sid] || []).forEach((id) => full.add(id)));
  return { full, basic };
};

const PRICING_PRODUCTS = [
  { key: 'website', name: 'Website', desc: 'Pages, design, forms, SEO basics', from: () => getFoundation('foundation-essential').base + 5 * PAGE_RATE_STANDARD },
  { key: 'store', name: 'Online Store', desc: 'Products, payments, shipping', from: () => getPackage('qd-commerce-start').oneTime },
  { key: 'dashboard', name: 'Dashboard / Portal', desc: 'Admin panel, reports, records', from: () => getAddon('dashboard-pack').low },
  { key: 'booking', name: 'Booking System', desc: 'Appointments, calendars, reminders', from: () => getAddon('booking-integration').low },
  { key: 'ordering', name: 'Ordering System', desc: 'Pickup / delivery, order flow', from: () => getAddon('ordering-integration').low },
  { key: 'chatbot', name: 'AI Chatbot', desc: 'Lead capture, FAQ, handoff', from: () => getPackage('qd-ai-chatbot').oneTime }
];

// Level cards: every choice shows a NAME, a definite PRICE, and exactly WHAT
// you get at that price — never a naked range.
const renderLevelCards = (addonId, action, current, coverage) => {
  const addon = getAddon(addonId);
  if (!addon || !addon.levels) return '';
  const isBasic = coverage && coverage.basic.has(addonId);
  return `
    <div class="qd-pricing-levels">
      ${addon.levels.map((lvl) => {
        const fullPrice = getAddonPrice(addonId, lvl.tier);
        const price = isBasic ? Math.max(0, fullPrice - getAddonPrice(addonId, 'low')) : fullPrice;
        const priceLabel = isBasic && price === 0 ? 'included in build' : `AED ${formatAED(price)}${isBasic ? ' (upgrade)' : ''}`;
        return `
          <button type="button" class="qd-pricing-level ${current === lvl.tier ? 'is-active' : ''}" data-action="${action}" data-tier="${lvl.tier}" ${action === 'pricing-set-addon-level' ? `data-addon="${addonId}"` : ''}>
            <span class="qd-pricing-level-head"><strong>${escTxt(lvl.label)}</strong><em>${priceLabel}</em></span>
            <span class="qd-pricing-level-spec">${escTxt(lvl.spec)}</span>
          </button>`;
      }).join('')}
    </div>`;
};

const renderPricingOptionChip = (addonId, coverage, labelOverride) => {
  const addon = getAddon(addonId);
  if (!addon) return '';
  const selected = state.pricing.addons[addonId];
  const isFull = coverage.full.has(addonId);
  const isBasic = !isFull && coverage.basic.has(addonId);
  const basicNoUpgrade = isBasic && addon.low === addon.high;
  const price = isFull || basicNoUpgrade
    ? 'included'
    : isBasic
      ? `basic included · upgrades from AED ${formatAED(getAddonPrice(addonId, 'mid') - addon.low)}`
      : addon.low === addon.high
        ? `AED ${formatAED(addon.low)}${addon.from ? '+' : ''}`
        : `from AED ${formatAED(addon.low)}`;
  return `
    <button type="button" class="qd-pricing-chip ${selected ? 'is-active' : ''} ${isFull || basicNoUpgrade ? 'is-covered' : ''}" data-action="pricing-toggle-addon" data-addon="${addonId}" title="${escAttr(addon.desc || '')}">
      <span>${escTxt(labelOverride || addon.name.en)}</span><small>${price}</small>
    </button>`;
};

// Level pickers for any leveled chips that are currently selected in a panel.
const renderActiveChipLevels = (addonIds, coverage) => {
  const p = state.pricing;
  return addonIds
    .filter((id) => p.addons[id] && getAddon(id)?.levels && !coverage.full.has(id))
    .map((id) => `
      <div class="qd-pricing-panel-row qd-pricing-level-row">
        <span>${escTxt(getAddon(id).name.en)} — choose level</span>
        ${renderLevelCards(id, 'pricing-set-addon-level', p.addons[id].tier || 'low', coverage)}
      </div>`)
    .join('');
};

const renderPricingManager = () => {
  const p = state.pricing;
  const estimate = buildEstimate(getPricingSelection());
  const coverage = getPricingCoveredSets();

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

  // ---- Step 1: products ------------------------------------------------------
  const productBtns = PRICING_PRODUCTS.map((prod) => {
    const active = prod.key === 'store' ? !!p.products.store : prod.key === 'dashboard' ? !!p.products.dashboard : prod.key === 'chatbot' ? !!p.products.chatbot : !!p.products[prod.key];
    return `
      <button type="button" class="qd-pricing-product ${active ? 'is-active' : ''}" data-action="pricing-toggle-product" data-product="${prod.key}">
        <span class="qd-pricing-product-name">${escTxt(prod.name)}</span>
        <span class="qd-pricing-product-desc">${escTxt(prod.desc)}</span>
        <span class="qd-pricing-product-price">from AED ${formatAED(prod.from())}</span>
      </button>`;
  }).join('');

  // ---- Step 2: per-product panels ---------------------------------------------
  const panels = [];

  if (p.products.website) {
    const sizeCards = FOUNDATIONS.map((f) => `
      <button type="button" class="qd-pricing-level qd-pricing-foundation ${p.foundationId === f.id ? 'is-active' : ''}" data-action="pricing-set-foundation" data-foundation="${f.id}">
        <span class="qd-pricing-level-head"><strong>${escTxt(f.name.en.replace(' build', ''))}</strong><em>AED ${formatAED(f.base)} + pages</em></span>
        <span class="qd-pricing-level-spec">${f.diff.map(escTxt).join('<br>')}</span>
      </button>`).join('');
    panels.push(`
      <div class="qd-pricing-panel">
        <div class="qd-pricing-panel-title">Website</div>
        <div class="qd-pricing-levels qd-pricing-foundations">${sizeCards}</div>
        <div class="qd-pricing-panel-row"><span>Content pages · AED ${PAGE_RATE_STANDARD} each</span>
          <div class="qd-pricing-qty-btns">
            <button type="button" class="qd-pricing-tier-btn" data-action="pricing-pages" data-kind="standard" data-delta="-1">−</button>
            <span class="qd-pricing-qty-value">${p.pagesStandard}</span>
            <button type="button" class="qd-pricing-tier-btn" data-action="pricing-pages" data-kind="standard" data-delta="1">+</button>
          </div>
        </div>
        <div class="qd-pricing-panel-row"><span>Landing pages (video / animated hero) · AED ${PAGE_RATE_LANDING} each</span>
          <div class="qd-pricing-qty-btns">
            <button type="button" class="qd-pricing-tier-btn" data-action="pricing-pages" data-kind="landing" data-delta="-1">−</button>
            <span class="qd-pricing-qty-value">${p.pagesLanding}</span>
            <button type="button" class="qd-pricing-tier-btn" data-action="pricing-pages" data-kind="landing" data-delta="1">+</button>
          </div>
        </div>
        <div class="qd-pricing-chips">
          ${renderPricingOptionChip('extra-language', coverage, 'Arabic + English')}
          ${renderPricingOptionChip('seo-pack', coverage)}
          ${renderPricingOptionChip('smart-form', coverage, 'Smart contact / quote form')}
          ${renderPricingOptionChip('reviews-integration', coverage)}
          ${renderPricingOptionChip('map-embed', coverage)}
          ${renderPricingOptionChip('gbp-setup', coverage)}
        </div>
        ${renderActiveChipLevels(['smart-form', 'reviews-integration'], coverage)}
      </div>`);
  }

  if (p.products.store) {
    panels.push(`
      <div class="qd-pricing-panel">
        <div class="qd-pricing-panel-title">Online Store</div>
        <div class="qd-pricing-panel-row"><span>Store size</span>
          <div class="qd-pricing-tier-btns">
            <button type="button" class="qd-pricing-tier-btn ${p.products.store === 'qd-commerce-start' ? 'is-active' : ''}" data-action="pricing-set-store" data-store="qd-commerce-start">Up to 50 products · AED ${formatAED(getPackage('qd-commerce-start').oneTime)}</button>
            <button type="button" class="qd-pricing-tier-btn ${p.products.store === 'qd-commerce-growth' ? 'is-active' : ''}" data-action="pricing-set-store" data-store="qd-commerce-growth">50–250 products · AED ${formatAED(getPackage('qd-commerce-growth').oneTime)}</button>
          </div>
        </div>
        <div class="qd-pricing-chips">
          ${renderPricingOptionChip('payment-gateway', coverage)}
          ${renderPricingOptionChip('reviews-integration', coverage)}
          ${renderPricingOptionChip('loyalty-integration', coverage)}
          ${renderPricingOptionChip('seo-pack', coverage)}
        </div>
        ${renderActiveChipLevels(['loyalty-integration', 'reviews-integration'], coverage)}
        <div class="qd-pricing-panel-note">Includes storefront, cart, checkout, shipping, coupons, training. Extra content pages billed per page via Website panel.</div>
      </div>`);
  }

  if (p.products.dashboard) {
    panels.push(`
      <div class="qd-pricing-panel">
        <div class="qd-pricing-panel-title">Dashboard / Portal</div>
        <div class="qd-pricing-panel-row"><span>Type</span>
          <div class="qd-pricing-tier-btns">
            <button type="button" class="qd-pricing-tier-btn ${p.products.dashboard === 'attached' ? 'is-active' : ''}" data-action="pricing-set-dashboard" data-mode="attached">Reporting pack on the site · from AED ${formatAED(getAddon('dashboard-pack').low)}</button>
            <button type="button" class="qd-pricing-tier-btn ${p.products.dashboard === 'standalone' ? 'is-active' : ''}" data-action="pricing-set-dashboard" data-mode="standalone">Standalone ops system (MVP) · from AED ${formatAED(getPackage('qd-ops-dashboard').oneTime)}</button>
          </div>
        </div>
        ${p.products.dashboard === 'attached' ? `
        <div class="qd-pricing-panel-row"><span>Analytics depth</span>${renderLevelCards('dashboard-pack', 'pricing-set-dashboard-tier', p.dashboardTier, coverage)}</div>` : ''}
        <div class="qd-pricing-chips">
          ${renderPricingOptionChip('roles-logic', coverage, 'Staff / driver / branch roles')}
          ${renderPricingOptionChip('file-uploads', coverage, 'Documents & approvals')}
          ${renderPricingOptionChip('crm-setup', coverage, 'Customer management (CRM)')}
        </div>
        ${renderActiveChipLevels(['roles-logic', 'file-uploads', 'crm-setup'], coverage)}
      </div>`);
  }

  if (p.products.booking) {
    panels.push(`
      <div class="qd-pricing-panel">
        <div class="qd-pricing-panel-title">Booking System</div>
        <div class="qd-pricing-panel-row"><span>Scope</span>${renderLevelCards('booking-integration', 'pricing-set-booking-tier', p.bookingTier, coverage)}</div>
        <div class="qd-pricing-panel-note">Light = simple booking link flow · Standard = calendars + approvals · Complex = staff calendars, reminders, no-show policies.</div>
      </div>`);
  }

  if (p.products.ordering) {
    panels.push(`
      <div class="qd-pricing-panel">
        <div class="qd-pricing-panel-title">Ordering System</div>
        <div class="qd-pricing-panel-row"><span>Scope</span>${renderLevelCards('ordering-integration', 'pricing-set-ordering-tier', p.orderingTier, coverage)}</div>
        <div class="qd-pricing-panel-note">Light = menu + basic orders · Standard = pickup/delivery logic · Complex = branch rules + live order status.</div>
      </div>`);
  }

  if (p.products.chatbot) {
    panels.push(`
      <div class="qd-pricing-panel">
        <div class="qd-pricing-panel-title">AI Chatbot</div>
        <div class="qd-pricing-panel-row"><span>Type</span>
          <div class="qd-pricing-tier-btns">
            <button type="button" class="qd-pricing-tier-btn ${p.products.chatbot === 'attached' ? 'is-active' : ''}" data-action="pricing-set-chatbot" data-mode="attached">On the website · from AED ${formatAED(getAddon('ai-chatbot-upgrade').low)}</button>
            <button type="button" class="qd-pricing-tier-btn ${p.products.chatbot === 'standalone' ? 'is-active' : ''}" data-action="pricing-set-chatbot" data-mode="standalone">Standalone launch · from AED ${formatAED(getPackage('qd-ai-chatbot').oneTime)}</button>
          </div>
        </div>
        ${p.products.chatbot === 'attached' ? `
        <div class="qd-pricing-panel-row"><span>Scope</span>${renderLevelCards('ai-chatbot-upgrade', 'pricing-set-chatbot-tier', p.chatbotTier, coverage)}</div>` : ''}
        <div class="qd-pricing-panel-note">Platform / API usage billed at cost (pass-through), never bundled flat.</div>
      </div>`);
  }

  // ---- Step 3: industry systems -----------------------------------------------
  const industryBtns = INDUSTRY_MODULES.map((g) => `
    <button type="button" class="qd-pricing-chip ${p.industryGroupId === g.id ? 'is-active' : ''}" data-action="pricing-set-industry" data-industry="${g.id}">
      <span>${escTxt(g.name.en)}</span>
    </button>`).join('');

  let modulesHtml = '';
  const group = getIndustryGroup(p.industryGroupId);
  if (group) {
    modulesHtml = `
      <div class="qd-pricing-modules">
        ${group.modules.map((mod) => {
          const price = getModulePrice(mod.id, coverage.full, coverage.basic);
          const standalone = getModulePrice(mod.id);
          const active = !!p.modules[mod.id];
          const parts = mod.components.map((c) => {
            const lvl = getAddonLevel(c.id, c.tier || 'low');
            const nm = getAddon(c.id)?.name.en || c.id;
            if (coverage.full.has(c.id)) return `${nm}: in base`;
            if (coverage.basic.has(c.id)) return `${lvl ? lvl.label : nm}: upgrade only`;
            return lvl ? `${nm} (${lvl.label})` : nm;
          });
          return `
            <button type="button" class="qd-pricing-module ${active ? 'is-active' : ''}" data-action="pricing-toggle-module" data-module="${mod.id}">
              <span class="qd-pricing-product-name">${escTxt(mod.name.en)}</span>
              <span class="qd-pricing-product-desc">${escTxt(mod.pitch)}</span>
              <span class="qd-pricing-product-price">AED ${formatAED(price)}${price < standalone ? ` <s>AED ${formatAED(standalone)}</s>` : ''}</span>
              <span class="qd-pricing-module-parts">= ${escTxt(parts.join(' + '))}</span>
            </button>`;
        }).join('')}
      </div>`;
  }

  // ---- Step 4: more features + care + discount ---------------------------------
  const filterValue = p.ui.addonFilter || '';
  const filterNorm = filterValue.trim().toLowerCase();
  const moreAddons = ADDONS.filter((a) => !['extra-page', 'extra-landing'].includes(a.id)).map((addon) => {
    const matches = !filterNorm || addon.name.en.toLowerCase().includes(filterNorm) || addon.name.ar.includes(filterValue.trim());
    return `<div data-pricing-addon-row="${escAttr(addon.name.en.toLowerCase())}" ${matches ? '' : 'hidden'} style="display:${matches ? 'block' : 'none'}">${renderPricingOptionChip(addon.id, coverage)}</div>`;
  }).join('');

  const carePlanOptions = CARE_PLANS.map((plan) => `
    <option value="${plan.id}" ${p.carePlanId === plan.id ? 'selected' : ''}>
      ${escTxt(plan.name.en)}${plan.monthly > 0 ? ` — AED ${formatAED(plan.monthly)}/mo${plan.usage ? ' + usage' : ''}` : ''}
    </option>`).join('');

  // ---- Summary panel -------------------------------------------------------------
  const lineRows = estimate.lines.filter((line) => line.kind !== 'discount').map((line) => `
    <div class="qd-pricing-summary-line ${line.covered ? 'is-muted' : ''}" ${line.note ? `title="${escAttr(line.note)}"` : ''}>
      <span>${escTxt(line.label)}${line.covered ? ' <em>(included)</em>' : ''}${line.upgraded ? ' <em>(upgrade only — basic in base)</em>' : ''}</span>
      <span>${line.covered ? '—' : `${line.from ? 'from ' : ''}AED ${formatAED(line.amount)}`}</span>
    </div>`).join('');

  const renderBandBox = (check, heading) => {
    if (!check) return '';
    const [lo, hi] = check.band;
    const statusText = {
      within: '✓ Within the verified range',
      below: '↓ Below the verified range — room to grow scope',
      above: '↑ Above the verified range — justify with scope, or trim'
    }[check.status];
    return `<div class="qd-pricing-band is-${check.status}"><strong>${escTxt(heading)}:</strong> AED ${formatAED(lo)}–${formatAED(hi)}<br>${statusText}</div>`;
  };
  const activePreset = getIndustryPreset(getPricingSelection().industryId);

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
            <div class="qd-pricing-step-title">1 · Business type</div>
            <div class="qd-pricing-chips">${industryBtns}</div>
            ${group ? `
              <div class="qd-pricing-step-sub">${escTxt(group.name.en)} systems — click to add</div>
              ${modulesHtml}` : ''}
          </div>

          <div class="qd-pricing-step">
            <div class="qd-pricing-step-title">2 · What are you building?</div>
            <div class="qd-pricing-products">${productBtns}</div>
          </div>

          ${panels.length ? `<div class="qd-pricing-step"><div class="qd-pricing-step-title">3 · Options</div>${panels.join('')}</div>` : ''}

          <div class="qd-pricing-step">
            <button type="button" class="qd-pricing-describe-bar" data-action="pricing-toggle-more">
              + More features ${Object.keys(p.addons).length ? `(${Object.keys(p.addons).length} selected)` : ''} ${p.ui.moreOpen ? '▾' : '▸'}
            </button>
            ${p.ui.moreOpen ? `
              <input class="qd-quote-input qd-pricing-filter" type="search" placeholder="Search features…" value="${escAttr(filterValue)}" data-pricing-filter>
              <div class="qd-pricing-chips">${moreAddons}</div>
              ${renderActiveChipLevels(ADDONS.filter((a) => a.levels).map((a) => a.id), coverage)}` : ''}
          </div>

          <div class="qd-pricing-step">
            <div class="qd-pricing-step-title">4 · Monthly care & discount</div>
            <div class="qd-pricing-care-row">
              <select class="qd-quote-input qd-pricing-care" data-pricing-field="care-plan">${carePlanOptions}</select>
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
          ${estimate.lines.length === 0
            ? '<div class="qd-pricing-empty">Click a product to start building the price.</div>'
            : `
            <div class="qd-pricing-summary-lines">${lineRows}</div>
            <div class="qd-pricing-summary-totals">
              <div class="qd-pricing-summary-line"><span>One-time subtotal</span><span>AED ${formatAED(estimate.subtotal)}</span></div>
              ${estimate.discountAmount > 0 ? `
                <div class="qd-pricing-summary-line is-discount"><span>Founding-client discount (−${estimate.discountPercent}%)</span><span>−AED ${formatAED(estimate.discountAmount)}</span></div>
                <div class="qd-pricing-summary-line"><span>After discount</span><span>AED ${formatAED(estimate.discountedSubtotal)}</span></div>` : ''}
              <div class="qd-pricing-summary-line is-muted"><span>VAT ${estimate.vatPercent}%</span><span>AED ${formatAED(estimate.vat)}</span></div>
              <div class="qd-pricing-summary-line is-grand"><span>One-time total</span><span>${estimate.openEnded ? 'from ' : ''}AED ${formatAED(estimate.grandTotal)}</span></div>
              ${estimate.monthly.amount > 0 ? `
                <div class="qd-pricing-summary-line is-monthly"><span>Monthly · ${escTxt(estimate.monthly.planName)}</span><span>AED ${formatAED(estimate.monthly.amount)}/mo${estimate.monthly.usage ? ' + usage' : ''}</span></div>` : ''}
            </div>
            ${estimate.monthly.softwarePassThrough ? '<div class="qd-pricing-passthrough">⚠ Third-party software & usage fees billed at cost on top.</div>' : ''}
            ${renderBandBox(estimate.uaeCheck, 'UAE market (verified live)')}
            ${renderBandBox(estimate.bandCheck && activePreset ? estimate.bandCheck : null, activePreset ? activePreset.name.en : '')}
            <button type="button" class="qd-btn qd-btn-sm qd-admin-action-primary qd-pricing-copy" data-action="pricing-copy-summary">
              ${p.copied ? '✓ Copied' : 'Copy estimate summary'}
            </button>
            <button type="button" class="qd-btn qd-btn-sm qd-admin-action-secondary" data-action="pricing-reset">Reset</button>
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
  state.pricing.copied = false;
  render();
};

// Live feature search: filters chips in place (no re-render, keeps focus).
const applyPricingAddonFilter = (value) => {
  state.pricing.ui.addonFilter = value;
  const norm = value.trim().toLowerCase();
  document.querySelectorAll('[data-pricing-addon-row]').forEach((row) => {
    const show = !norm || row.dataset.pricingAddonRow.includes(norm);
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
  if (action === 'pricing-toggle-more') { p.ui.moreOpen = !p.ui.moreOpen; return done(); }
  if (action === 'pricing-analyze-brief') {
    applyBriefAnalysis(parseBrief(p.briefText));
    return done();
  }
  if (action === 'pricing-toggle-product') {
    const key = actionTarget.dataset.product;
    if (key === 'website') {
      p.products.website = !p.products.website;
      if (p.products.website) {
        if (!p.foundationId) p.foundationId = 'foundation-essential';
        if (!p.pagesStandard) p.pagesStandard = 5;
      }
    } else if (key === 'store') {
      p.products.store = p.products.store ? null : 'qd-commerce-start';
    } else if (key === 'dashboard') {
      p.products.dashboard = p.products.dashboard ? null : (p.products.website ? 'attached' : 'standalone');
    } else if (key === 'chatbot') {
      p.products.chatbot = p.products.chatbot ? null : (p.products.website ? 'attached' : 'standalone');
    } else {
      p.products[key] = !p.products[key];
    }
    return done();
  }
  if (action === 'pricing-set-foundation') { p.foundationId = actionTarget.dataset.foundation; return done(); }
  if (action === 'pricing-set-store') { p.products.store = actionTarget.dataset.store; return done(); }
  if (action === 'pricing-set-dashboard') { p.products.dashboard = actionTarget.dataset.mode; return done(); }
  if (action === 'pricing-set-chatbot') { p.products.chatbot = actionTarget.dataset.mode; return done(); }
  if (action === 'pricing-set-addon-level') {
    const id = actionTarget.dataset.addon;
    if (p.addons[id]) p.addons[id].tier = actionTarget.dataset.tier;
    return done();
  }
  if (action === 'pricing-set-booking-tier') { p.bookingTier = actionTarget.dataset.tier; return done(); }
  if (action === 'pricing-set-ordering-tier') { p.orderingTier = actionTarget.dataset.tier; return done(); }
  if (action === 'pricing-set-chatbot-tier') { p.chatbotTier = actionTarget.dataset.tier; return done(); }
  if (action === 'pricing-set-dashboard-tier') { p.dashboardTier = actionTarget.dataset.tier; return done(); }
  if (action === 'pricing-toggle-addon') {
    const id = actionTarget.dataset.addon;
    if (p.addons[id]) delete p.addons[id];
    else p.addons[id] = { tier: 'low', qty: 1 };
    return done();
  }
  if (action === 'pricing-set-industry') {
    const id = actionTarget.dataset.industry;
    p.industryGroupId = p.industryGroupId === id ? null : id;
    return done();
  }
  if (action === 'pricing-toggle-module') {
    const id = actionTarget.dataset.module;
    if (p.modules[id]) delete p.modules[id];
    else p.modules[id] = true;
    return done();
  }
  if (action === 'pricing-pages') {
    const delta = Number(actionTarget.dataset.delta) || 0;
    if (actionTarget.dataset.kind === 'standard') p.pagesStandard = Math.max(0, Math.min(200, p.pagesStandard + delta));
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
  if (action === 'pricing-copy-summary') {
    const estimate = buildEstimate(getPricingSelection());
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
    subscribeToInvitations();
    subscribeToOutreachLeads();
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
    state.quoteDrawer = { open: false, quote: null, original: null, dirty: false };
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
      error: '',
      pendingCoverFile: null,
      pendingMusicFile: null
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
  window.history.replaceState({}, '', url);
};
