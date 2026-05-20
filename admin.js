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

import { auth, db } from './firebase.js';
import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { CATALOG, catalogToLineItem } from '/app/lib/quote-catalog.js';
import { computeTotals, formatAED } from '/app/lib/quote-totals.js';

const root = document.getElementById('qd-admin-root');
const allowedAdminEmails = null;
const statusOptions = ['New', 'Reviewed', 'Contacted', 'Quoted', 'Accepted', 'Rejected', 'Archived'];
const priorityOptions = ['Low', 'Normal', 'High', 'VIP'];
const launchDateFilterOptions = [
  ['all', 'All launch dates'],
  ['this-week', 'This week'],
  ['this-month', 'This month'],
  ['next-30', 'Next 30 days'],
  ['flexible', 'Flexible / Not provided'],
  ['past', 'Past dates']
];

const state = {
  authLoading: true,
  dataLoading: false,
  isLoggingIn: false,
  isSaving: false,
  user: null,
  loginError: '',
  dataError: '',
  saveError: '',
  copyFeedback: '',
  submissions: [],
  filters: {
    search: '',
    status: 'All',
    priority: 'All',
    launchDate: 'all'
  },
  selectedId: null,
  drawerDraft: null,
  quotesBySubmissionId: {},
  quoteDrawer: { open: false, quote: null, dirty: false },
  quoteToast: ''
};

let unsubscribeSnapshot = null;
let unsubscribeQuotesSnapshot = null;
let copyFeedbackTimeout = null;

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

  state.drawerDraft = {
    id: selected.id,
    status: selected.status || 'New',
    priority: selected.priority || 'Normal',
    notes: selected.notes || ''
  };
};

const getFilteredSubmissions = () => {
  const search = state.filters.search.trim().toLowerCase();
  const today = new Date();
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weekOffset = (todayDate.getDay() + 6) % 7;
  const weekStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - weekOffset);
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  const nextThirtyDays = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() + 30);

  return state.submissions.filter((submission) => {
    const matchesStatus = state.filters.status === 'All' || submission.status === state.filters.status;
    const matchesPriority = state.filters.priority === 'All' || submission.priority === state.filters.priority;
    const launchDateValue = getAnswer(submission, 'launchDate');
    const parsedLaunchDate = parseLaunchDateValue(launchDateValue);
    const matchesLaunchDate = (() => {
      switch (state.filters.launchDate) {
        case 'this-week':
          return parsedLaunchDate ? parsedLaunchDate >= weekStart && parsedLaunchDate <= weekEnd : false;
        case 'this-month':
          return parsedLaunchDate
            ? parsedLaunchDate.getFullYear() === todayDate.getFullYear() && parsedLaunchDate.getMonth() === todayDate.getMonth()
            : false;
        case 'next-30':
          return parsedLaunchDate ? parsedLaunchDate >= todayDate && parsedLaunchDate <= nextThirtyDays : false;
        case 'flexible':
          return !parsedLaunchDate && isFlexibleLaunchValue(launchDateValue);
        case 'past':
          return parsedLaunchDate ? parsedLaunchDate < todayDate : false;
        default:
          return true;
      }
    })();

    if (!matchesStatus || !matchesPriority || !matchesLaunchDate) return false;

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

const getAnalytics = (items) => {
  const counts = {
    total: items.length,
    New: 0,
    Reviewed: 0,
    Contacted: 0,
    Quoted: 0,
    Accepted: 0,
    Rejected: 0,
    Archived: 0
  };

  const urgencyMap = new Map();
  const priorityMap = new Map();
  const budgetNumbers = [];
  let contactReadyCount = 0;

  items.forEach((submission) => {
    counts[submission.status] = (counts[submission.status] || 0) + 1;

    const urgency = formatLabel(getAnswer(submission, 'urgency') || 'Unspecified');
    urgencyMap.set(urgency, (urgencyMap.get(urgency) || 0) + 1);

    const priority = submission.priority || 'Normal';
    priorityMap.set(priority, (priorityMap.get(priority) || 0) + 1);

    const numericBudget = Number(String(getAnswer(submission, 'budgetRange') || '').replace(/[^\d.]/g, ''));
    if (!Number.isNaN(numericBudget) && numericBudget > 0) {
      budgetNumbers.push(numericBudget);
    }

    if (getAnswer(submission, 'businessEmail') && getAnswer(submission, 'businessPhone')) {
      contactReadyCount += 1;
    }
  });

  const averageBudget = budgetNumbers.length
    ? Math.round(budgetNumbers.reduce((sum, value) => sum + value, 0) / budgetNumbers.length)
    : null;
  const highestBudget = budgetNumbers.length ? Math.max(...budgetNumbers) : null;
  const lowestBudget = budgetNumbers.length ? Math.min(...budgetNumbers) : null;
  const budgetCaptureRate = items.length ? Math.round((budgetNumbers.length / items.length) * 100) : 0;

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
    contactReadyCount
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
  const cardMeta = [
    ['Total', analytics.counts.total, 'All live submissions'],
    ['New', analytics.counts.New || 0, 'Awaiting review'],
    ['Reviewed', analytics.counts.Reviewed || 0, 'Assessed'],
    ['Quoted', analytics.counts.Quoted || 0, 'Proposal stage'],
    ['Accepted', analytics.counts.Accepted || 0, 'Approved'],
    ['Archived', analytics.counts.Archived || 0, 'Closed or parked']
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
      ${cardMeta.map(([label, value, meta]) => `
        <article class="qd-admin-card qd-admin-kpi-card">
          <span class="qd-admin-card-label">${escapeHtml(label)}</span>
          <strong class="qd-admin-kpi-value">${value}</strong>
          <p>${escapeHtml(meta)}</p>
        </article>
      `).join('')}
      </div>
    </section>
  `;
};

const renderAnalyticsCards = (analytics) => {
  const hasBudgetSignal = Boolean(analytics.budgetCount && analytics.averageBudget);
  const budgetLabel = hasBudgetSignal ? formatCurrencyNumber(analytics.averageBudget) : 'Not enough data';
  const topStage = analytics.stage[0]?.[0] || 'No signal yet';
  const topPriority = analytics.priority[0]?.[0] || 'No signal yet';
  const topUrgency = analytics.urgency[0]?.[0] || 'No signal yet';
  const contactReadiness = analytics.counts.total
    ? `${analytics.contactReadyCount}/${analytics.counts.total}`
    : '0/0';

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
        <div class="qd-admin-card-label">Budget Signal</div>
        <h3 class="qd-admin-budget-value" ${hasBudgetSignal ? `title="${escapeHtml(formatCurrencyNumber(analytics.averageBudget))}"` : ''}>${escapeHtml(budgetLabel)}</h3>
        <p>${hasBudgetSignal ? 'Average captured project budget.' : 'Budget details will appear once numeric budget values are captured.'}</p>
        ${renderBudgetStats(analytics)}
      </article>

      <article class="qd-admin-card qd-admin-analytics-card">
        <div class="qd-admin-card-label">Lead Stage</div>
        <h3>${escapeHtml(topStage)}</h3>
        <p>Most common pipeline status across current submissions.</p>
        ${renderStageBars(analytics.stage)}
      </article>

      <article class="qd-admin-card qd-admin-analytics-card">
        <div class="qd-admin-card-label">Priority Mix</div>
        <h3>${escapeHtml(topPriority)}</h3>
        <p>How urgent the team should treat the current intake.</p>
        ${renderBreakdown(analytics.priority, 'Priority counts will appear here.')}
      </article>

      <article class="qd-admin-card qd-admin-analytics-card">
        <div class="qd-admin-card-label">Urgency Mix</div>
        <h3>${escapeHtml(topUrgency)}</h3>
        <p>How quickly incoming projects expect to launch.</p>
        ${renderBreakdown(analytics.urgency, 'Urgency selections will appear here.')}
      </article>

      <article class="qd-admin-card qd-admin-analytics-card">
        <div class="qd-admin-card-label">Contact Readiness</div>
        <h3>${escapeHtml(contactReadiness)}</h3>
        <p>Submissions that include both email and phone contact details.</p>
        <div class="qd-admin-list">
          <div class="qd-admin-list-item">
            <span>Ready to contact</span>
            <strong class="qd-admin-count-badge">${analytics.contactReadyCount}</strong>
          </div>
          <div class="qd-admin-list-item">
            <span>Need follow-up details</span>
            <strong class="qd-admin-count-badge">${Math.max(analytics.counts.total - analytics.contactReadyCount, 0)}</strong>
          </div>
        </div>
      </article>
      </div>
    </section>
  `;
};

const renderSubmissionRows = (items) => {
  if (!items.length) {
    return `
      <tr>
        <td colspan="8">
          <div class="qd-admin-empty">
            <strong>No submissions match this view</strong>
            Try a broader search or reset the pipeline filters.
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

const renderSubmissionCards = (items) => {
  if (!items.length) return '';

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

const renderDashboard = () => {
  const filteredSubmissions = getFilteredSubmissions();
  const analytics = getAnalytics(state.submissions);

  return `
    <section class="qd-admin-dashboard">
      ${state.dataError ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.dataError)}</div>` : ''}
      ${renderOverviewCards(analytics)}
      ${renderAnalyticsCards(analytics)}

      <article class="qd-admin-card qd-admin-table-card">
        <div class="qd-admin-section-head">
          <div>
            <div class="qd-eyebrow qd-admin-kicker">Submission Pipeline</div>
            <h2>Pipeline monitor</h2>
            <p>Search, filter, and open submissions to manage status, priority, notes, and client follow-up.</p>
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
          <select class="qd-admin-select" data-field="launchDate">
            ${launchDateFilterOptions.map(([value, label]) => `
              <option value="${escapeHtml(value)}" ${state.filters.launchDate === value ? 'selected' : ''}>${escapeHtml(label)}</option>
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
            <tbody>${renderSubmissionRows(filteredSubmissions)}</tbody>
          </table>
        </div>
        <div class="qd-admin-mobile-list">
          ${renderSubmissionCards(filteredSubmissions)}
        </div>
      </article>
    </section>
  `;
};

const renderDetailItem = (label, value, options = {}) => {
  const formatted = formatValue(value, options);
  const isArabic = options.isArabic || false;
  const multiline = options.multiline || false;

  return `
    <div class="qd-admin-detail-item ${isArabic ? 'is-rtl' : ''}">
      <strong>${escapeHtml(label)}</strong>
      <div class="qd-admin-detail-value ${multiline ? 'is-multiline' : ''}">${escapeHtml(formatted)}</div>
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

      <section class="qd-admin-client-profile">
        <div class="qd-admin-client-profile-main">
          <div class="qd-chip-row">
            <span class="qd-status-pill" data-tone="${escapeHtml(statusTone(submission.status))}">${escapeHtml(submission.status)}</span>
            <span class="qd-priority-pill" data-tone="${escapeHtml(priorityTone(submission.priority))}">${escapeHtml(submission.priority)}</span>
            <span class="qd-language-badge" data-language="${escapeHtml(language)}">${escapeHtml(formatLanguage(language))}</span>
          </div>
          <h2 class="qd-admin-client-name">${escapeHtml(formatValue(businessName))}</h2>
          <div class="qd-admin-client-meta">
            <span>${escapeHtml(formatValue(businessEmail))}</span>
            <span>${escapeHtml(formatValue(businessPhone))}</span>
          </div>
          ${state.copyFeedback ? `<div class="qd-admin-copy-feedback">${escapeHtml(state.copyFeedback)}</div>` : ''}
        </div>
        <div class="qd-admin-actions qd-admin-client-actions">
          ${whatsappLink ? `<a class="qd-btn qd-btn-sm qd-admin-action-whatsapp" href="${escapeHtml(whatsappLink)}" target="_blank" rel="noreferrer noopener">WhatsApp</a>` : ''}
          ${callLink
            ? `<a class="qd-btn qd-btn-sm qd-admin-action-call" href="${escapeHtml(callLink)}">Call</a>`
            : '<button class="qd-btn qd-btn-sm qd-admin-action-call is-disabled" type="button" disabled aria-disabled="true">Call</button>'}
          ${mailtoLink ? `<a class="qd-btn qd-btn-sm qd-admin-action-secondary" href="${escapeHtml(mailtoLink)}">Email</a>` : ''}
          ${renderQuoteButton(submission)}
          <button class="qd-btn qd-btn-sm qd-admin-action-primary" type="button" data-action="copy-summary">Copy Summary</button>
          <button class="qd-btn qd-btn-sm qd-admin-action-danger" type="button" data-action="archive-submission">Archive</button>
        </div>
      </section>

      <div class="qd-admin-quick-contact">
        <div class="qd-admin-contact-card">
          <strong>Email</strong>
          <span>${escapeHtml(formatValue(businessEmail))}</span>
        </div>
        <div class="qd-admin-contact-card">
          <strong>Phone</strong>
          <span>${escapeHtml(formatValue(businessPhone))}</span>
        </div>
      </div>

      <div class="qd-admin-meta-grid">
        <div class="qd-admin-detail-item">
          <strong>Created</strong>
          <div class="qd-admin-detail-value">${escapeHtml(formatDate(submission.createdAt || submission.submittedAt))}</div>
        </div>
        <div class="qd-admin-detail-item">
          <strong>Submitted</strong>
          <div class="qd-admin-detail-value">${escapeHtml(formatDate(submission.submittedAt || submission.createdAt))}</div>
        </div>
        <div class="qd-admin-detail-item">
          <strong>Last Updated</strong>
          <div class="qd-admin-detail-value">${escapeHtml(formatDate(submission.lastUpdatedAt || submission.createdAt || submission.submittedAt))}</div>
        </div>
      </div>

      ${state.saveError ? `<div class="qd-admin-alert" role="alert">${escapeHtml(state.saveError)}</div>` : ''}

      <section class="qd-admin-drawer-group qd-admin-drawer-admin">
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
            ${state.isSaving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </section>

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
            <a class="qd-admin-link" href="index.html" target="_blank" rel="noreferrer noopener">Home</a>
            <a class="qd-admin-link" href="contact.html" target="_blank" rel="noreferrer noopener">Contact Form</a>
            <a class="qd-admin-link" href="chat-admin.html">Chat Leads</a>
            ${userBadge}
            ${state.user ? '<button class="qd-btn qd-btn-ghost qd-btn-sm" type="button" data-action="logout">Logout</button>' : ''}
          </div>
        </header>

        ${content}
      </div>
      ${renderDrawer()}
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
  document.body.classList.toggle('qd-modal-open', Boolean(state.selectedId));

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

  root.innerHTML = renderAppShell(renderDashboard());
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
            state.drawerDraft = {
              id: fresh.id,
              status: state.drawerDraft?.status ?? fresh.status,
              priority: state.drawerDraft?.priority ?? fresh.priority,
              notes: state.drawerDraft?.notes ?? fresh.notes
            };
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

const saveDrawer = async (nextValues = {}) => {
  const selected = getSelectedSubmission();
  if (!selected) return;

  const payload = {
    status: nextValues.status ?? state.drawerDraft?.status ?? selected.status ?? 'New',
    priority: nextValues.priority ?? state.drawerDraft?.priority ?? selected.priority ?? 'Normal',
    notes: nextValues.notes ?? state.drawerDraft?.notes ?? selected.notes ?? '',
    lastUpdatedAt: serverTimestamp()
  };

  state.isSaving = true;
  state.saveError = '';
  render();

  try {
    await updateDoc(doc(db, 'projectSubmissions', selected.id), payload);
    state.drawerDraft = { id: selected.id, ...payload, lastUpdatedAt: undefined };
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

  if (action === 'open-submission') {
    openSubmission(actionTarget.dataset.id);
    return;
  }

  if (action === 'close-drawer') {
    closeDrawer();
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
  const filterField = event.target.dataset.field;
  if (filterField) {
    const { selectionStart, selectionEnd, value } = event.target;
    state.filters[filterField] = event.target.value;
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
      id: selected.id,
      status: drawerField === 'status' ? event.target.value : state.drawerDraft?.status ?? selected.status ?? 'New',
      priority: drawerField === 'priority' ? event.target.value : state.drawerDraft?.priority ?? selected.priority ?? 'Normal',
      notes: drawerField === 'notes' ? event.target.value : state.drawerDraft?.notes ?? selected.notes ?? ''
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

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
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
    const res = await fetch('/api/quote-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ submissionId })
    });
    if (!res.ok) {
      if (res.status === 404) {
        showToast('Quote API is missing or not deployed.');
        return;
      }
      const err = await res.json().catch(() => ({}));
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
    quote: { ...quote, lineItems: [...(quote.lineItems || [])] },
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
    cur[last] = (last === 'validDays' || last === 'vatPercent') ? Number(value) || 0 : value;
  }
  state.quoteDrawer.dirty = true;
};

const updateQuoteTotalsPreview = () => {
  const q = state.quoteDrawer.quote;
  if (!q) return;
  const t = computeTotals(q.lineItems, q.vatPercent);
  const preview = document.querySelector('#qd-quote-drawer .qd-quote-totals');
  if (!preview) return;
  preview.innerHTML = `
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
    const res = await fetch('/api/quote-save', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id: q.id, updates, markSent })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
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
  const t = computeTotals(q.lineItems, q.vatPercent);
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
            <option value="">+ Add from catalog…</option>
            ${CATALOG.map((c) => `<option value="${escAttr(c.key)}">${escTxt(c.name.en)} — AED ${c.defaultPrice}</option>`).join('')}
          </select>
          <button type="button" class="qd-btn qd-btn-sm qd-admin-action-secondary" data-action="quote-add-custom-line">+ Custom</button>
        </div>

        <div class="qd-quote-section-label">PAGES INCLUDED</div>
        <input class="qd-quote-input" data-qfield="pages.en" value="${escAttr(q.pages?.en || '')}" placeholder="Home · About · Services · Contact">
        <input class="qd-quote-input" style="margin-top:6px" data-qfield="pages.ar" value="${escAttr(q.pages?.ar || '')}" placeholder="الرئيسية · ..." dir="rtl">

        <div class="qd-quote-totals">
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
  } else {
    if (unsubscribeSnapshot) {
      unsubscribeSnapshot();
      unsubscribeSnapshot = null;
    }
    if (unsubscribeQuotesSnapshot) {
      unsubscribeQuotesSnapshot();
      unsubscribeQuotesSnapshot = null;
    }
    state.submissions = [];
    state.quotesBySubmissionId = {};
    state.quoteDrawer = { open: false, quote: null, dirty: false };
    state.dataLoading = false;
  }

  render();
});

render();
