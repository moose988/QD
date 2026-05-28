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

const root = document.getElementById('qd-admin-root');
const allowedAdminEmails = null;
const statusOptions = ['New', 'Reviewed', 'Contacted', 'Quoted', 'Accepted', 'Under Construction', 'Completed', 'Rejected', 'Archived'];
const priorityOptions = ['Low', 'Normal', 'High', 'VIP'];
const CARD_SITE_URL = 'https://qdsystems.ae';
const CARD_DEFAULT_WEBSITE = 'https://qdsystems.ae';
const CARD_DEFAULT_CTA_LABEL = 'Start a Build';
const CARD_DEFAULT_CTA_URL = 'https://qdsystems.ae/contact.html';
const cardIconOptions = ['website', 'email', 'phone', 'whatsapp', 'instagram', 'linkedin', 'link'];

const state = {
  authLoading: true,
  dataLoading: false,
  cardsLoading: false,
  isLoggingIn: false,
  isSaving: false,
  user: null,
  loginError: '',
  dataError: '',
  cardsError: '',
  saveError: '',
  copyFeedback: '',
  adminToast: '',
  activeTab: new URLSearchParams(window.location.search).get('tab') === 'cards' ? 'cards' : 'dashboard',
  submissions: [],
  cards: [],
  filters: {
    search: '',
    status: 'All',
    priority: 'All'
  },
  pipelinePage: 0,
  budgetProjectsPage: 0,
  budgetSortDirection: 'desc',
  selectedId: null,
  drawerDraft: null,
  quotesBySubmissionId: {},
  quoteDrawer: { open: false, quote: null, dirty: false },
  quoteToast: '',
  cardEditor: {
    open: false,
    mode: 'create',
    id: null,
    draft: null,
    slugState: { status: 'idle', message: '' },
    slugTouched: false,
    isSaving: false,
    error: '',
    pendingAvatarFile: null
  }
};

let unsubscribeSnapshot = null;
let unsubscribeQuotesSnapshot = null;
let unsubscribeCardsSnapshot = null;
let copyFeedbackTimeout = null;
let adminToastTimeout = null;

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
  blog_news_offers: 'Blog / News / Offers'
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

const hydrateCard = (snapshot) => ({
  id: snapshot.id,
  ...snapshot.data()
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

const createDrawerDraft = (submission, previousDraft = {}) => {
  if (!submission) return null;

  const base = {
    id: submission.id,
    status: previousDraft.status ?? submission.status ?? 'New',
    priority: previousDraft.priority ?? submission.priority ?? 'Normal',
    notes: previousDraft.notes ?? submission.notes ?? '',
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
  if (!Array.isArray(allowedAdminEmails) || allowedAdminEmails.length === 0) return true;
  return allowedAdminEmails.includes((user.email || '').toLowerCase());
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

const parseSubmissionServices = (submission) => {
  const raw = getAnswer(submission, 'services');
  if (Array.isArray(raw)) {
    return raw.map((item) => formatLabel(item)).filter((item) => item && item !== 'Not Provided');
  }

  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((item) => formatLabel(item.trim()))
      .filter((item) => item && item !== 'Not Provided');
  }

  return [];
};

const scrollToPipelineSection = () => {
  requestAnimationFrame(() => {
    const pipelineSection = document.getElementById('qd-submission-pipeline');
    pipelineSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const serviceDemandMap = new Map();
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
  const openStatuses = new Set(['New', 'Reviewed', 'Contacted', 'Quoted', 'Under Construction']);
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
    const services = parseSubmissionServices(submission);
    const createdMs = submission.createdAtMs || submission.submittedAtMs || 0;
    const updatedMs = submission.lastUpdatedAtMs || 0;

    if (isContactReady) {
      contactReadyCount += 1;
    }

    services.forEach((service) => {
      serviceDemandMap.set(service, (serviceDemandMap.get(service) || 0) + 1);
    });

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
  const serviceDemand = [...serviceDemandMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topService = serviceDemand[0]?.[0] || '—';

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
    serviceDemand,
    topService,
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
  const highestServiceCount = analytics.serviceDemand[0]?.[1] || 0;

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

      <article class="qd-admin-card qd-admin-analytics-card">
        <div class="qd-admin-card-label">Service Demand</div>
        <h3>${escapeHtml(analytics.serviceDemand.length ? analytics.topService : '—')}</h3>
        <p>${escapeHtml(analytics.serviceDemand.length ? 'Most requested service this pipeline' : 'No service data yet')}</p>
        ${analytics.serviceDemand.length ? `
          <div class="qd-admin-list">
            ${analytics.serviceDemand.map(([service, count]) => {
              const percent = highestServiceCount ? Math.max(8, Math.round((count / highestServiceCount) * 100)) : 0;
              return `
                <div class="qd-admin-service-demand-item">
                  <div class="qd-admin-list-item">
                    <span>${escapeHtml(service)}</span>
                    <strong class="qd-admin-count-badge">${count}</strong>
                  </div>
                  <div class="qd-admin-stage-track qd-admin-service-demand-track">
                    <span class="qd-admin-stage-fill" style="width:${percent}%"></span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : '<div class="qd-admin-empty"><strong>No service data yet</strong>Service demand will appear once submissions include service selections.</div>'}
      </article>
      </div>
    </section>
  `;
};

const renderSubmissionRows = (items, emptyTitle = 'No submissions match this view', emptyText = 'Try a broader search or reset the pipeline filters.') => {
  if (!items.length) {
    return `
      <tr>
        <td colspan="8">
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
      <td>${escapeHtml(formatValue(getAnswer(submission, 'industry')))}</td>
      <td>${escapeHtml(formatCurrency(getAnswer(submission, 'budgetRange')))}</td>
      <td>${escapeHtml(formatValue(getAnswer(submission, 'launchDate'), { type: 'launch-date' }))}</td>
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
          <div class="qd-admin-subline">${escapeHtml(formatValue(getAnswer(submission, 'industry')))}</div>
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
          <strong>Budget</strong>
          <span>${escapeHtml(formatCurrency(getAnswer(submission, 'budgetRange')))}</span>
        </div>
        <div>
          <strong>Launch Date</strong>
          <span>${escapeHtml(formatValue(getAnswer(submission, 'launchDate'), { type: 'launch-date' }))}</span>
        </div>
        <div>
          <strong>Date</strong>
          <span>${escapeHtml(formatDate(submission.createdAt || submission.submittedAt))}</span>
        </div>
        <div>
          <strong>Industry</strong>
          <span>${escapeHtml(formatValue(getAnswer(submission, 'industry')))}</span>
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

  return `
    <section class="qd-admin-dashboard">
      ${state.dataError ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.dataError)}</div>` : ''}
      ${renderOverviewCards(analytics)}
      ${renderAnalyticsCards(analytics)}

      <article class="qd-admin-card qd-admin-table-card" id="qd-submission-pipeline">
        <div class="qd-admin-section-head">
          <div>
            <div class="qd-eyebrow qd-admin-kicker">Submission Pipeline</div>
            <h2>Pipeline monitor</h2>
          </div>
        </div>

        <div class="qd-admin-table-toolbar">
          <input
            class="qd-admin-search"
            type="search"
            placeholder="Search business, email, phone, industry, budget, service..."
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
                <th>Industry</th>
                <th>Budget</th>
                <th>Launch Date</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>${renderSubmissionRows(paginatedActiveSubmissions)}</tbody>
          </table>
        </div>
        <div class="qd-admin-mobile-list">
          ${renderSubmissionCards(paginatedActiveSubmissions)}
        </div>
        ${renderPipelinePagination(activeSubmissions.length)}
      </article>

      <article class="qd-admin-card qd-admin-table-card" id="qd-archived-submissions">
        <div class="qd-admin-section-head">
          <div>
            <div class="qd-eyebrow qd-admin-kicker">Archived</div>
            <h2>Archived submissions</h2>
            <p>Closed or parked projects live here so the active pipeline stays focused on current work.</p>
          </div>
        </div>

        <div class="qd-admin-table-wrap">
          <table class="qd-admin-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Contact</th>
                <th>Industry</th>
                <th>Budget</th>
                <th>Launch Date</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>${renderSubmissionRows(
              archivedSubmissions,
              'No archived submissions in this view',
              'Archived projects will appear here when they match the current search and filters.'
            )}</tbody>
          </table>
        </div>
        <div class="qd-admin-mobile-list">
          ${renderSubmissionCards(
            archivedSubmissions,
            'No archived submissions in this view',
            'Archived projects will appear here when they match the current search and filters.'
          )}
        </div>
      </article>
    </section>
  `;
};

const renderAdminTabs = () => `
  <nav class="qd-admin-tabs" aria-label="Admin sections">
    <button class="qd-admin-tab ${state.activeTab === 'dashboard' ? 'is-active' : ''}" type="button" data-action="set-admin-tab" data-tab="dashboard">Pipeline</button>
    <button class="qd-admin-tab ${state.activeTab === 'cards' ? 'is-active' : ''}" type="button" data-action="set-admin-tab" data-tab="cards">Smart Cards</button>
    <a class="qd-admin-tab qd-admin-tab-link" href="chat-admin.html?returnTo=${escapeHtml(state.activeTab)}">Chat Leads</a>
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
              <input id="card-cta-url" class="qd-admin-input" name="ctaUrl" type="url" value="${escapeHtml(draft.ctaUrl || CARD_DEFAULT_CTA_URL)}" placeholder="https://qdsystems.ae/contact.html">
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
          <button class="qd-btn qd-btn-sm qd-admin-action-secondary" type="button" data-action="seed-qd-card">Seed QD Test Card</button>
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
      <h2>Signed in, but not allowed</h2>
      <p>This page is ready for stricter admin-email allowlisting later. For now, update the allowlist in <code>admin.js</code> if you want to restrict access.</p>
      <div class="qd-admin-alert is-soft">Current account: ${escapeHtml(state.user?.email || 'Unknown')}</div>
    </div>
  </section>
`);

const render = () => {
  document.body.classList.toggle('qd-modal-open', Boolean(state.selectedId || state.cardEditor.open || state.quoteDrawer.open));

  if (state.authLoading) {
    root.innerHTML = renderLoading('Authenticating', 'Checking your Firebase session and restoring persistence.');
    return;
  }

  if (!state.user) {
    root.innerHTML = renderLogin();
    attachLoginFormListener();
    return;
  }

  if (!isAllowedAdminUser(state.user)) {
    root.innerHTML = renderAccessDenied();
    return;
  }

  if (state.dataLoading && state.submissions.length === 0) {
    root.innerHTML = renderLoading('Syncing submissions', 'Opening the realtime Firestore listener for projectSubmissions.');
    return;
  }

  root.innerHTML = renderAppShell(state.activeTab === 'cards' ? renderCardsManager() : renderDashboard());
};

const openSubmission = (id) => {
  state.selectedId = id;
  state.drawerDraft = null;
  state.saveError = '';
  state.copyFeedback = '';
  render();
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
    await signInWithEmailAndPassword(auth, email, password);
    clearLoginError();
  } catch (error) {
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

const getCardById = (id) => state.cards.find((card) => card.id === id) || null;

const openCardEditor = (mode, card = null) => {
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
    slugState: { status: 'idle', message: 'Use lowercase letters, numbers, and hyphens only.' },
    slugTouched: Boolean(card?.slug),
    isSaving: false,
    error: '',
    pendingAvatarFile: null
  };
  render();
};

const closeCardEditor = () => {
  state.cardEditor = {
    open: false,
    mode: 'create',
    id: null,
    draft: null,
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
      showAdminToast(`Saved ${draft.slug}`);
    } else {
      await addDoc(collection(db, 'cards'), {
        ...payload,
        createdAt: serverTimestamp()
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

const downloadCardQr = async (card) => {
  const QRCode = await ensureQrCodeLibrary();
  const mount = document.createElement('div');
  mount.style.position = 'fixed';
  mount.style.left = '-9999px';
  mount.style.top = '0';
  document.body.appendChild(mount);

  new QRCode(mount, {
    text: getCardPublicUrl(card.slug),
    width: 1024,
    height: 1024,
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

  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = `qd-card-${card.slug}-qr.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  mount.remove();
  showAdminToast(`Downloaded QR for ${card.slug}`);
};

const toggleCardActive = async (card) => {
  await updateDoc(doc(db, 'cards', card.id), {
    active: card.active === false,
    updatedAt: serverTimestamp()
  });
  showAdminToast(card.active === false ? `Activated ${card.slug}` : `Deactivated ${card.slug}`);
};

const deleteCardRecord = async (card) => {
  const confirmed = window.confirm(`Delete the smart card for ${card.name || card.slug}?`);
  if (!confirmed) return;
  await deleteDoc(doc(db, 'cards', card.id));
  await deleteCardAvatarIfNeeded(card);
  showAdminToast(`Deleted ${card.slug}`);
};

const seedQdCard = async () => {
  const exists = state.cards.some((card) => card.slug === 'qd');
  if (exists) {
    showAdminToast('The qd seed card already exists.');
    return;
  }

  await addDoc(collection(db, 'cards'), {
    slug: 'qd',
    name: 'QD SYSTEMS',
    role: 'Digital Systems Agency',
    company: 'QD SYSTEMS',
    phone: '+971500000000',
    email: 'hello@qdsystems.ae',
    website: 'https://qdsystems.ae',
    avatar: '',
    avatarStoragePath: '',
    links: [
      { label: 'Instagram', url: 'https://instagram.com/qdsystems', icon: 'instagram' },
      { label: 'WhatsApp', url: 'https://wa.me/971500000000', icon: 'whatsapp' }
    ],
    ctaLabel: 'Start a Build',
    ctaUrl: 'https://qdsystems.ae/contact.html',
    active: true,
    views: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  showAdminToast('Seed card created.');
};

const saveDrawer = async (nextValues = {}) => {
  const selected = getSelectedSubmission();
  if (!selected) return;
  const previousStatus = selected.status ?? 'New';

  const nextAnswers = { ...(selected.answers || {}) };
  for (const field of editableSubmissionFields) {
    nextAnswers[field.key] = nextValues[field.key] ?? state.drawerDraft?.[field.key] ?? getAnswer(selected, field.key);
  }

  const payload = {
    status: nextValues.status ?? state.drawerDraft?.status ?? selected.status ?? 'New',
    priority: nextValues.priority ?? state.drawerDraft?.priority ?? selected.priority ?? 'Normal',
    notes: nextValues.notes ?? state.drawerDraft?.notes ?? selected.notes ?? '',
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
    state.drawerDraft = {
      ...(state.drawerDraft || createDrawerDraft(selected)),
      ...payload,
      editMode: false,
      lastUpdatedAt: undefined
    };
    if (payload.status !== previousStatus) {
      showAdminToast(`Status changed to ${payload.status}`);
    }
  } catch (error) {
    state.saveError = error?.message || 'Could not save submission changes.';
  } finally {
    state.isSaving = false;
    render();
  }
};

const handleDocumentClick = async (event) => {
  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) return;

  const action = actionTarget.dataset.action;

  if (action === 'logout') {
    await handleLogout();
    return;
  }

  if (action === 'set-admin-tab') {
    state.activeTab = actionTarget.dataset.tab || 'dashboard';
    syncAdminTabUrl();
    render();
    return;
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

  if (action === 'close-drawer') {
    closeDrawer();
    return;
  }

  if (action === 'open-card-create') {
    openCardEditor('create');
    return;
  }

  if (action === 'close-card-editor') {
    closeCardEditor();
    return;
  }

  if (action === 'edit-card') {
    const card = getCardById(actionTarget.dataset.id);
    if (!card) return;
    openCardEditor('edit', card);
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

  if (action === 'copy-card-link') {
    const card = getCardById(actionTarget.dataset.id);
    if (!card) return;
    await copyCardUrl(card);
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

  if (action === 'delete-card') {
    const card = getCardById(actionTarget.dataset.id);
    if (!card) return;
    await deleteCardRecord(card);
    return;
  }

  if (action === 'seed-qd-card') {
    await seedQdCard();
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
      notes: drawerField === 'notes' ? event.target.value : state.drawerDraft?.notes ?? selected.notes ?? ''
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
  handleDocumentInput(event);
});

document.addEventListener('change', (event) => {
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
});

document.addEventListener('submit', async (event) => {
  if (event.target.id === 'card-editor-form') {
    event.preventDefault();
    await saveCardEditor();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (state.cardEditor.open) {
      closeCardEditor();
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
  state.quoteDrawer = {
    open: true,
    quote: {
      ...quote,
      lineItems: [...(quote.lineItems || [])],
      pages: { ...(quote.pages || {}), price: Number(quote.pages?.price) || 0 }
    },
    dirty: false
  };
  render();
};

const closeQuoteDrawer = ({ autosave = true } = {}) => {
  if (autosave && state.quoteDrawer.dirty) {
    saveQuoteDrawer({ markSent: false, copy: false, silent: true });
  }
  state.quoteDrawer = { open: false, quote: null, dirty: false };
  render();
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
          <select class="qd-quote-input qd-quote-catalog" data-qaction="add-from-catalog" style="flex:1">
            <option value="">+ Add feature…</option>
            ${CATALOG.map((c) => `<option value="${escAttr(c.key)}">${escTxt(c.name.en)}${c.defaultPrice > 0 ? ` — AED ${c.defaultPrice}` : ''}</option>`).join('')}
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

await setPersistence(auth, browserLocalPersistence).catch(() => {});

onAuthStateChanged(auth, (user) => {
  state.authLoading = false;
  state.user = user;
  state.loginError = '';
  state.selectedId = null;
  state.drawerDraft = null;
  state.saveError = '';

  if (user && isAllowedAdminUser(user)) {
    subscribeToSubmissions();
    subscribeToQuotes();
    subscribeToCards();
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
    state.submissions = [];
    state.cards = [];
    state.quotesBySubmissionId = {};
    state.quoteDrawer = { open: false, quote: null, dirty: false };
    state.cardEditor = {
      open: false,
      mode: 'create',
      id: null,
      draft: null,
      slugState: { status: 'idle', message: '' },
      slugTouched: false,
      isSaving: false,
      error: '',
      pendingAvatarFile: null
    };
    state.dataLoading = false;
    state.cardsLoading = false;
  }

  render();
});

render();
const syncAdminTabUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.set('tab', state.activeTab);
  window.history.replaceState({}, '', url);
};
