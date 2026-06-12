import { catalogToLineItem } from './quote-catalog.js';

// Maps a projectSubmissions doc → initial quote draft data.
// Each field is best-effort: missing submission fields are simply skipped.
// All returned line items are removable; admin can also add custom lines.

const ARABIC_RE = /[؀-ۿ]/;

function getAnswer(submission, key) {
  if (!submission) return '';
  const answers = submission.answers || {};
  if (answers[key] !== undefined && answers[key] !== null && answers[key] !== '') return answers[key];
  if (submission[key] !== undefined && submission[key] !== null && submission[key] !== '') return submission[key];
  return '';
}

function countNeededPages(rawPages) {
  if (!rawPages) return 0;
  if (Array.isArray(rawPages)) return rawPages.length;
  return String(rawPages).split(/[,·•/]| and /i).map((p) => p.trim()).filter(Boolean).length;
}

function pickSiteCatalogKey(pageCount) {
  if (pageCount <= 0) return null;
  if (pageCount <= 6) return 'site-5p';   // QD Launch Site
  if (pageCount <= 12) return 'site-10p'; // QD Growth Website
  return 'site-pro';                      // QD Business Pro Website
}

function detectLanguage(submission) {
  if (submission?.pageLang === 'ar') return 'ar';
  const name = getAnswer(submission, 'businessName') || '';
  if (ARABIC_RE.test(name)) return 'ar';
  return 'en';
}

function normalizeSelectionValues(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (typeof raw === 'object') return Object.keys(raw).filter(Boolean);
  return String(raw)
    .split(/[,·•/]| and /i)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function prefillFromSubmission(submission) {
  const lineItems = [];
  const seenCatalogKeys = new Set();
  const addLineItem = (key) => {
    if (!key || seenCatalogKeys.has(key)) return;
    const lineItem = catalogToLineItem(key);
    if (!lineItem) return;
    seenCatalogKeys.add(key);
    lineItems.push(lineItem);
  };

  // 1. Website line item, sized by neededPages count
  const pageCount = countNeededPages(getAnswer(submission, 'neededPages'));
  const siteKey = pickSiteCatalogKey(pageCount);
  addLineItem(siteKey);

  // 2. Required features → add matching feature line items directly.
  const reqFeatures = submission.selectedRequiredFeatures || getAnswer(submission, 'requiredFeatures') || {};
  normalizeSelectionValues(reqFeatures).forEach((featureKey) => {
    addLineItem(featureKey);
  });

  // 3. Optional services → catalog matches
  const optServices = submission.selectedOptionalServices || getAnswer(submission, 'optionalServices') || {};
  const optFlat = normalizeSelectionValues(optServices).join(' ').toLowerCase();
  if (optFlat.includes('maintenance')) addLineItem('maintenance-3m');

  // 4. Logo design — if client said they DON'T have a logo
  if (getAnswer(submission, 'hasLogo') === false || getAnswer(submission, 'hasLogo') === 'no') {
    addLineItem('logo-design');
  }

  // 5. Customer snapshot
  const customer = {
    businessName: getAnswer(submission, 'businessName') || '',
    email: getAnswer(submission, 'businessEmail') || '',
    phone: getAnswer(submission, 'businessPhone') || '',
  };

  // 6. Pages list (EN raw, AR blank for admin to fill)
  const rawPages = getAnswer(submission, 'neededPages');
  const pagesEn = Array.isArray(rawPages) ? rawPages.join(' · ') : String(rawPages || '');

  return {
    customer,
    lineItems: lineItems.filter(Boolean),
    pages: { en: pagesEn, ar: '', price: 0 },
    language: detectLanguage(submission),
    sourceSubmission: {
      businessName: getAnswer(submission, 'businessName') || '',
      businessEmail: getAnswer(submission, 'businessEmail') || '',
      businessPhone: getAnswer(submission, 'businessPhone') || '',
      industry: getAnswer(submission, 'industry') || '',
      mainPurpose: submission?.selectedMainPurpose || getAnswer(submission, 'mainPurpose') || '',
      requiredFeatures: submission?.selectedRequiredFeatures || getAnswer(submission, 'requiredFeatures') || '',
      customFeatures: getAnswer(submission, 'customFeatures') || '',
      contentReadiness: getAnswer(submission, 'contentReadiness') || '',
      supportLevel: getAnswer(submission, 'supportLevel') || '',
      language: getAnswer(submission, 'requiredFeatures__multi_language_languages') || submission?.pageLang || ''
    }
  };
}
