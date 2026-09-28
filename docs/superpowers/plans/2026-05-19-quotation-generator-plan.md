# Quotation Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the per-submission quotation generator: admin creates a quote inside the submission detail (slide-over drawer), the client gets a private passcode-protected web link (`/q/:id`), bilingual EN/AR with editable line items pre-filled from the submission.

**Architecture:** New Firestore collection `quotes` (admin-only access; all client traffic flows through 3 Vercel functions). Public page is a single static HTML + JS file. Catalog and pre-fill mapping live in shared `app/lib/` modules so both `api/quote-create.js` and `admin.js` can import them.

**Tech Stack:** Vanilla ES modules, Vercel serverless functions (Node), `firebase-admin` (already wired by chatbot work), Web Crypto API for passcode hashing.

**Approved spec:** [docs/superpowers/specs/2026-05-19-quotation-generator-design.md](../specs/2026-05-19-quotation-generator-design.md)

**Prerequisites (NOT part of this plan):**
1. The chatbot work must be committed first (separate feature → separate commit set). Working tree should be clean before starting Task 1.
2. The dev environment from CHATBOT_SETUP.md must be working (`npm install` done, `.env.local` has `GROQ_API_KEY` and `FIREBASE_SERVICE_ACCOUNT`).

**Testing note:** This codebase has no test runner (matches `services-detailed.md` build philosophy + spec Section 7). Each task ends with **manual verification** (curl / browser / node REPL) instead of TDD test steps. Skip automated test generation.

**Local dev server:** Tasks reference `_dev-server.mjs` (the no-vercel-login Node HTTP server from the chatbot smoke test). If it's not present, recreate from this content:

```js
// _dev-server.mjs — runs api/ functions + serves static files on localhost:3000
import dotenv from 'dotenv';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';
const ROOT = process.cwd();
const PORT = 3000;
dotenv.config({ path: path.join(ROOT, '.env.local') });
const MIME = {'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.mjs':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json','.jpeg':'image/jpeg','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
async function readBody(req){const c=[];for await(const x of req)c.push(x);const r=Buffer.concat(c).toString('utf8');if(!r)return undefined;try{return JSON.parse(r);}catch{return r;}}
function shim(res){res.status=c=>{res.statusCode=c;return res;};res.json=d=>{if(!res.headersSent)res.setHeader('Content-Type','application/json;charset=utf-8');res.end(JSON.stringify(d));return res;};return res;}
const apiRoute = (p) => p.startsWith('/api/') ? p.slice(5) : null;
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const apiName = apiRoute(url.pathname);
  if (apiName) {
    shim(res);
    const file = path.join(ROOT, 'api', apiName + '.js');
    if (!fs.existsSync(file)) { res.statusCode=404; res.end('No such API'); return; }
    try {
      if (req.method !== 'GET' && req.method !== 'OPTIONS') req.body = await readBody(req);
      const mod = await import(file + '?t=' + Date.now()); // cache-bust for hot iteration
      await mod.default(req, res);
    } catch (e) { console.error(e); if (!res.headersSent) res.statusCode = 500; res.end(JSON.stringify({error: e.message})); }
    return;
  }
  // /q/* rewrites to /q/index.html
  let fp = url.pathname;
  if (fp.startsWith('/q/') && fp !== '/q/index.html') fp = '/q/index.html';
  if (fp === '/' || fp === '') fp = '/index.html';
  fp = path.normalize(path.join(ROOT, decodeURIComponent(fp)));
  if (!fp.startsWith(ROOT)) { res.statusCode=403; res.end('Forbidden'); return; }
  let stat; try { stat = fs.statSync(fp); } catch {}
  if (stat?.isDirectory()) { fp = path.join(fp, 'index.html'); try { stat = fs.statSync(fp); } catch { stat = null; } }
  if (!stat?.isFile()) { res.statusCode = 404; res.end('Not Found'); return; }
  res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
  fs.createReadStream(fp).pipe(res);
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
```

Note: this version adds `/q/*` rewrite (so the public quote page works) and dynamic import with cache-bust (so API changes hot-reload).

**Commit message style:** match existing — lowercase casual ("add quote catalog", "wire admin drawer to /api/quote-create").

---

## File structure

**New files:**

| Path | Responsibility |
|---|---|
| `app/lib/quote-catalog.js` | Hardcoded catalog of preset services (bilingual + default prices). |
| `app/lib/quote-prefill.js` | Pure function: `prefillFromSubmission(submission) → {customer, lineItems, pages, language}`. |
| `app/lib/quote-totals.js` | Pure function: `computeTotals(lineItems, vatPercent) → {subtotal, vat, grandTotal}`. Used by admin drawer + public page. |
| `app/lib/quote-labels.js` | Static label dictionary `LABELS[lang][key]`. Used by public page + admin drawer. |
| `api/_lib/quote-id.js` | `generateQuoteId()`, `generatePasscode()`, `hashPasscode(plain)`, `verifyPasscode(plain, hash)`. |
| `api/_lib/quote-counter.js` | `getNextQuoteNumber()` — Firestore transaction over `quotes_meta/counter`. |
| `api/_lib/admin-auth.js` | `requireAdmin(req)` — verifies Firebase ID token from `Authorization: Bearer …` header. Reused later by other admin endpoints. |
| `api/quote-create.js` | POST. Body `{ submissionId }`. Admin-only. Pre-fills, generates ID/passcode/number, writes. Returns full quote incl. plaintext passcode. |
| `api/quote-save.js` | PATCH. Body `{ id, updates }`. Admin-only. Validates and saves. |
| `api/quote-verify.js` | POST. Body `{ id, passcode }`. Public. Returns sanitized quote or 401/404. |
| `q/index.html` | Public quote page shell. Loads `/q/quote.css` and `/q/quote.js`. |
| `q/quote.css` | Quote page styles + passcode gate + `@media print`. |
| `q/quote.js` | Reads ID from URL, manages passcode gate, fetches via `/api/quote-verify`, renders quote + EN/AR toggle. No Firebase SDK loaded. |

**Modified files:**

| Path | Change |
|---|---|
| `admin.js` | Add `quotes` state slice; load quotes alongside submissions; new "Generate Quotation" button in submission detail; slide-over drawer component; save handlers. |
| `admin.css` | Drawer slide-over animation; line-item table; quote-status badges. |
| `vercel.json` | Add rewrite `/q/(.*) → /q/index.html`; set `maxDuration: 10` on three new API functions. |
| `.env.local` | Add `QUOTE_PASSCODE_SALT=<32 random hex>`. |
| Firestore rules (Firebase Console, manual step) | Add deny-all rules for `quotes/{doc}` and `quotes_meta/{doc}`. |
| `_dev-server.mjs` | If present, replace with the version above (adds `/q/*` rewrite + dynamic import). |

---

## Tasks

### Task 1: Setup — env var, Firestore rules, dev server

**Files:**
- Modify: `.env.local` (add `QUOTE_PASSCODE_SALT`)
- Replace: `_dev-server.mjs` (with the version in the header that supports `/q/*`)
- Manual: Firestore rules (Firebase Console)

- [ ] **Step 1: Generate a random passcode salt and add to `.env.local`**

```bash
cd /Users/mohammedqudaih/Desktop/Projects/Webs/QD_WEB
echo "QUOTE_PASSCODE_SALT=$(node -e 'console.log(require(\"crypto\").randomBytes(32).toString(\"hex\"))')" >> .env.local
```

- [ ] **Step 2: Verify it landed**

```bash
grep -c '^QUOTE_PASSCODE_SALT=' .env.local
```
Expected output: `1`

- [ ] **Step 3: Update `_dev-server.mjs` with the `/q/*` rewrite version**

Replace the contents of `_dev-server.mjs` with the version in this plan's header.

- [ ] **Step 4: Restart the dev server and confirm `/q/anything` returns `q/index.html` would-be**

Kill any old `node _dev-server.mjs` process. Run:
```bash
node _dev-server.mjs &
sleep 1
curl -s -o /dev/null -w "GET /q/test-123 → HTTP %{http_code}\n" http://localhost:3000/q/test-123
```
Expected: `404` (since `q/index.html` doesn't exist yet — we'll create it in Task 9). The fact that it didn't 500 confirms the rewrite logic works.

- [ ] **Step 5: Update Firestore rules in Firebase Console (manual step)**

Open https://console.firebase.google.com/project/qdsystems-67764/firestore/rules

Add the following two blocks inside `match /databases/{database}/documents { ... }`, alongside the existing chatbot rules:

```
match /quotes/{document} {
  allow read, write: if false;
}
match /quotes_meta/{document} {
  allow read, write: if false;
}
```

Click **Publish**. Confirm publication completes without error.

- [ ] **Step 6: Commit**

```bash
git add .env.example _dev-server.mjs
git commit -m "setup quote env: passcode salt, dev server q/ rewrite"
```

(`.env.local` is gitignored — won't be in the commit.)

---

### Task 2: Quote catalog — `app/lib/quote-catalog.js`

**Files:**
- Create: `app/lib/quote-catalog.js`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p app/lib
```

- [ ] **Step 2: Write the catalog module**

`app/lib/quote-catalog.js`:
```js
// Hardcoded catalog of QD preset services. Edit defaults here, then re-deploy.
// Future: move to Firestore + a /admin/catalog settings page.

export const CATALOG = [
  { key: 'site-5p',         name: { en: '5-page responsive website',           ar: 'موقع متجاوب ٥ صفحات' },              defaultPrice: 3500 },
  { key: 'site-10p',        name: { en: '10-page responsive website',          ar: 'موقع متجاوب ١٠ صفحات' },             defaultPrice: 5500 },
  { key: 'logo-design',     name: { en: 'Logo design (3 concepts, 2 revs)',    ar: 'تصميم شعار (٣ مفاهيم، مراجعتان)' },  defaultPrice: 1200 },
  { key: 'online-ordering', name: { en: 'Online ordering integration',         ar: 'تكامل الطلب الإلكتروني' },             defaultPrice: 2000 },
  { key: 'multilang',       name: { en: 'Multi-language support (EN+AR)',      ar: 'دعم متعدد اللغات (إنجليزي+عربي)' },  defaultPrice: 1500 },
  { key: 'seo-foundation',  name: { en: 'SEO foundation',                      ar: 'تأسيس سيو' },                          defaultPrice: 800  },
  { key: 'maintenance-3m',  name: { en: '3-month maintenance',                 ar: 'صيانة ٣ أشهر' },                       defaultPrice: 1500 },
];

export function getCatalogItem(key) {
  return CATALOG.find((c) => c.key === key) || null;
}

export function catalogToLineItem(key, overrides = {}) {
  const c = getCatalogItem(key);
  if (!c) return null;
  return {
    catalogKey: c.key,
    name:        { en: c.name.en, ar: c.name.ar },
    description: { en: '', ar: '' },
    qty: 1,
    unitPrice: c.defaultPrice,
    ...overrides,
  };
}
```

- [ ] **Step 3: Manually verify with node REPL**

```bash
node -e "import('./app/lib/quote-catalog.js').then(m => console.log(m.catalogToLineItem('site-5p')))"
```
Expected output:
```js
{
  catalogKey: 'site-5p',
  name: { en: '5-page responsive website', ar: 'موقع متجاوب ٥ صفحات' },
  description: { en: '', ar: '' },
  qty: 1,
  unitPrice: 3500
}
```

- [ ] **Step 4: Commit**

```bash
git add app/lib/quote-catalog.js
git commit -m "add quote catalog"
```

---

### Task 3: Pre-fill mapping — `app/lib/quote-prefill.js`

**Files:**
- Create: `app/lib/quote-prefill.js`

- [ ] **Step 1: Write the prefill module**

`app/lib/quote-prefill.js`:
```js
import { catalogToLineItem } from './quote-catalog.js';

// Maps a projectSubmissions doc → initial quote draft data.
// Each field is best-effort: missing submission fields are simply skipped.
// All returned line items are removable; admin can also add custom lines.

const ARABIC_RE = /[؀-ۿ]/;

function getAnswer(submission, key) {
  if (!submission) return '';
  if (submission[key] !== undefined && submission[key] !== null && submission[key] !== '') return submission[key];
  const answers = submission.answers || {};
  return answers[key] ?? '';
}

function countNeededPages(rawPages) {
  if (!rawPages) return 0;
  if (Array.isArray(rawPages)) return rawPages.length;
  return String(rawPages).split(/[,·•/]| and /i).map((p) => p.trim()).filter(Boolean).length;
}

function pickSiteCatalogKey(pageCount) {
  if (pageCount <= 0) return null;
  if (pageCount <= 6) return 'site-5p';
  return 'site-10p';
}

function detectLanguage(submission) {
  if (submission?.pageLang === 'ar') return 'ar';
  const name = getAnswer(submission, 'businessName') || '';
  if (ARABIC_RE.test(name)) return 'ar';
  return 'en';
}

export function prefillFromSubmission(submission) {
  const lineItems = [];

  // 1. Website line item, sized by neededPages count
  const pageCount = countNeededPages(getAnswer(submission, 'neededPages'));
  const siteKey = pickSiteCatalogKey(pageCount);
  if (siteKey) lineItems.push(catalogToLineItem(siteKey));

  // 2. Required features → catalog matches
  const reqFeatures = submission.selectedRequiredFeatures || getAnswer(submission, 'requiredFeatures') || {};
  const featuresFlat = typeof reqFeatures === 'string'
    ? reqFeatures.toLowerCase()
    : (Array.isArray(reqFeatures) ? reqFeatures.join(' ').toLowerCase() : Object.keys(reqFeatures).join(' ').toLowerCase());

  if (featuresFlat.includes('online') && featuresFlat.includes('order')) lineItems.push(catalogToLineItem('online-ordering'));
  if (featuresFlat.includes('multi') && featuresFlat.includes('lang'))    lineItems.push(catalogToLineItem('multilang'));
  if (featuresFlat.includes('seo'))                                       lineItems.push(catalogToLineItem('seo-foundation'));

  // 3. Optional services → catalog matches
  const optServices = submission.selectedOptionalServices || getAnswer(submission, 'optionalServices') || {};
  const optFlat = typeof optServices === 'string'
    ? optServices.toLowerCase()
    : (Array.isArray(optServices) ? optServices.join(' ').toLowerCase() : Object.keys(optServices).join(' ').toLowerCase());
  if (optFlat.includes('maintenance')) lineItems.push(catalogToLineItem('maintenance-3m'));

  // 4. Logo design — if client said they DON'T have a logo
  if (getAnswer(submission, 'hasLogo') === false || getAnswer(submission, 'hasLogo') === 'no') {
    lineItems.push(catalogToLineItem('logo-design'));
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
    pages: { en: pagesEn, ar: '' },
    language: detectLanguage(submission),
  };
}
```

- [ ] **Step 2: Manually verify with node REPL using a synthetic submission**

```bash
node -e "
import('./app/lib/quote-prefill.js').then(m => {
  const sample = {
    businessName: 'Al Taj Al Malaki',
    businessEmail: 'contact@altaj.ae',
    businessPhone: '+971501234567',
    neededPages: 'Home, About, Menu, Order Online, Contact',
    selectedRequiredFeatures: ['Online ordering', 'SEO setup', 'Multi-language support'],
    selectedOptionalServices: ['Maintenance'],
    hasLogo: 'no',
  };
  console.log(JSON.stringify(m.prefillFromSubmission(sample), null, 2));
});
"
```

Expected: customer block filled, `lineItems` contains 5 items (`site-5p`, `online-ordering`, `seo-foundation`, `multilang`, `maintenance-3m`, `logo-design`), `pages.en` is the raw string, `language: 'en'`.

- [ ] **Step 3: Commit**

```bash
git add app/lib/quote-prefill.js
git commit -m "add submission → quote prefill mapping"
```

---

### Task 4: Totals + labels — shared utilities

**Files:**
- Create: `app/lib/quote-totals.js`
- Create: `app/lib/quote-labels.js`

- [ ] **Step 1: Write totals helper**

`app/lib/quote-totals.js`:
```js
// Pure function used by both the admin drawer (live preview) and the public quote page.
// Returns whole-dirham integer values; no rounding tricks needed at AED scale.

export function computeTotals(lineItems = [], vatPercent = 5) {
  const subtotal = lineItems.reduce((sum, li) => {
    const qty = Number(li.qty) || 0;
    const unit = Number(li.unitPrice) || 0;
    return sum + qty * unit;
  }, 0);
  const vat = Math.round((subtotal * vatPercent) / 100);
  const grandTotal = subtotal + vat;
  return { subtotal, vat, grandTotal };
}

export function formatAED(n) {
  return new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(n);
}
```

- [ ] **Step 2: Write labels dictionary**

`app/lib/quote-labels.js`:
```js
// Static UI labels for the public quote page and the admin drawer.
// User-content fields (line item names, terms, etc.) come from the quote doc, NOT this dictionary.

export const LABELS = {
  en: {
    quotation: 'QUOTATION',
    quoteNumber: 'Quote',
    issued: 'Issued',
    valid: 'Valid',
    days: 'days',
    preparedFor: 'PREPARED FOR',
    service: 'Service',
    qty: 'Qty',
    unit: 'Unit (AED)',
    total: 'Total',
    subtotal: 'Subtotal',
    vat: 'VAT',
    grandTotal: 'Total (AED)',
    pagesIncluded: 'PAGES YOU’LL GET',
    payment: 'Payment',
    timeline: 'Timeline',
    excludes: 'Excludes',
    unlock: 'Unlock',
    passcodePrompt: 'Enter the passcode shared with you',
    incorrectPasscode: 'Incorrect passcode',
    quoteNotFound: 'Quote not found. Double-check the link, or WhatsApp +971 50 461 1123.',
    expired: 'This quote has expired. Contact us for an updated offer.',
    print: 'Print',
    questions: 'Questions? WhatsApp +971 50 461 1123',
  },
  ar: {
    quotation: 'عرض سعر',
    quoteNumber: 'رقم العرض',
    issued: 'الإصدار',
    valid: 'صالح لمدة',
    days: 'يوم',
    preparedFor: 'مُعدّ لـ',
    service: 'الخدمة',
    qty: 'الكمية',
    unit: 'السعر (درهم)',
    total: 'الإجمالي',
    subtotal: 'المجموع الفرعي',
    vat: 'ضريبة القيمة المضافة',
    grandTotal: 'الإجمالي (درهم)',
    pagesIncluded: 'الصفحات المشمولة',
    payment: 'الدفع',
    timeline: 'المدة',
    excludes: 'لا يشمل',
    unlock: 'فتح',
    passcodePrompt: 'أدخل الرمز المرسل إليك',
    incorrectPasscode: 'الرمز غير صحيح',
    quoteNotFound: 'العرض غير موجود. تأكد من الرابط أو راسلنا على واتساب +971 50 461 1123.',
    expired: 'انتهت صلاحية هذا العرض. تواصل معنا للحصول على عرض محدّث.',
    print: 'طباعة',
    questions: 'استفسار؟ واتساب +971 50 461 1123',
  },
};

export function L(lang, key) {
  return (LABELS[lang] && LABELS[lang][key]) || LABELS.en[key] || key;
}
```

- [ ] **Step 3: Manually verify**

```bash
node -e "
Promise.all([
  import('./app/lib/quote-totals.js'),
  import('./app/lib/quote-labels.js')
]).then(([t, l]) => {
  console.log(t.computeTotals([{qty:1,unitPrice:3500},{qty:1,unitPrice:1200},{qty:1,unitPrice:2000},{qty:1,unitPrice:800}], 5));
  console.log(l.L('ar', 'subtotal'));
});
"
```
Expected: `{ subtotal: 7500, vat: 375, grandTotal: 7875 }` then `المجموع الفرعي`.

- [ ] **Step 4: Commit**

```bash
git add app/lib/quote-totals.js app/lib/quote-labels.js
git commit -m "add quote totals + bilingual labels"
```

---

### Task 5: Quote ID + passcode helpers — `api/_lib/quote-id.js`

**Files:**
- Create: `api/_lib/quote-id.js`

- [ ] **Step 1: Write the helpers**

`api/_lib/quote-id.js`:
```js
import crypto from 'node:crypto';

// 16 hex chars = 64 bits of entropy. Unguessable for QD's scale.
export function generateQuoteId() {
  return crypto.randomBytes(8).toString('hex');
}

// 6-digit numeric. Easy for clients to type on a phone.
export function generatePasscode() {
  // Inclusive [100000, 999999]
  return String(crypto.randomInt(100000, 1000000));
}

function getSalt() {
  const salt = process.env.QUOTE_PASSCODE_SALT;
  if (!salt) throw new Error('QUOTE_PASSCODE_SALT env var is required');
  return salt;
}

export function hashPasscode(plain) {
  return crypto.createHash('sha256').update(getSalt() + ':' + String(plain)).digest('hex');
}

export function verifyPasscode(plain, expectedHash) {
  if (!plain || !expectedHash) return false;
  const actual = hashPasscode(plain);
  // Timing-safe compare
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
```

- [ ] **Step 2: Manually verify each function**

```bash
node --input-type=module -e "
import { generateQuoteId, generatePasscode, hashPasscode, verifyPasscode } from './api/_lib/quote-id.js';
process.env.QUOTE_PASSCODE_SALT = 'test-salt-just-for-this-check';
console.log('id:', generateQuoteId(), '(should be 16 hex chars)');
const p = generatePasscode();
console.log('passcode:', p, '(should be 6 digits)');
const h = hashPasscode(p);
console.log('hash length:', h.length, '(should be 64)');
console.log('verify good:', verifyPasscode(p, h), '(should be true)');
console.log('verify bad:', verifyPasscode('000000', h), '(should be false)');
"
```
Expected: all four assertions match.

- [ ] **Step 3: Commit**

```bash
git add api/_lib/quote-id.js
git commit -m "add quote id, passcode, and hashing helpers"
```

---

### Task 6: Quote number counter — `api/_lib/quote-counter.js`

**Files:**
- Create: `api/_lib/quote-counter.js`

- [ ] **Step 1: Write the counter**

`api/_lib/quote-counter.js`:
```js
import { getDb } from './firebase.js';

// Reads quotes_meta/counter inside a transaction, increments, returns "Q-YYYY-NNN".
// Auto-resets the counter on year change.
// Caller is responsible for being inside any outer transaction; this opens its own.

export async function getNextQuoteNumber() {
  const db = getDb();
  const ref = db.collection('quotes_meta').doc('counter');
  const year = new Date().getUTCFullYear();

  const next = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    let cur = snap.exists ? snap.data() : { year, nextNumber: 1 };
    if (cur.year !== year) cur = { year, nextNumber: 1 };
    const number = cur.nextNumber;
    tx.set(ref, { year, nextNumber: number + 1 });
    return { year, number };
  });

  return `Q-${next.year}-${String(next.number).padStart(3, '0')}`;
}
```

- [ ] **Step 2: Manually verify (writes to live Firestore!)**

```bash
node --input-type=module -e "
import('dotenv').then(d => d.default.config({ path: '.env.local' }));
import('./api/_lib/quote-counter.js').then(async m => {
  console.log(await m.getNextQuoteNumber());
  console.log(await m.getNextQuoteNumber());
});
" 2>&1 | tail -5
```
Expected: two consecutive quote numbers, e.g., `Q-2026-001` then `Q-2026-002`. (Subsequent runs will continue incrementing — that's fine; we can reset the counter doc in Firebase Console before going live.)

- [ ] **Step 3: Commit**

```bash
git add api/_lib/quote-counter.js
git commit -m "add transactional quote number counter"
```

---

### Task 7: Admin auth helper — `api/_lib/admin-auth.js`

**Files:**
- Create: `api/_lib/admin-auth.js`

- [ ] **Step 1: Write the auth helper**

`api/_lib/admin-auth.js`:
```js
import { admin } from './firebase.js';

// Verifies the Firebase ID token from the Authorization header.
// Throws on failure (which the caller should catch → 401).
//
// Usage in a handler:
//   try { const user = await requireAdmin(req); }
//   catch (e) { return res.status(401).json({ error: e.message }); }

export async function requireAdmin(req) {
  const auth = req.headers['authorization'] || req.headers['Authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    throw new Error('Missing bearer token');
  }
  const idToken = auth.slice('Bearer '.length).trim();
  const decoded = await admin.auth().verifyIdToken(idToken);
  // v1: any authenticated Firebase user is admin (matches the existing pattern where
  // the rules just check `request.auth != null`). If we add roles later, gate here.
  return decoded;
}
```

- [ ] **Step 2: Manually verify it errors cleanly without a token**

```bash
node --input-type=module -e "
import('dotenv').then(d => d.default.config({ path: '.env.local' }));
import('./api/_lib/admin-auth.js').then(async m => {
  try { await m.requireAdmin({ headers: {} }); console.log('NO ERROR — bug'); }
  catch (e) { console.log('OK errors with:', e.message); }
});
"
```
Expected: `OK errors with: Missing bearer token`.

- [ ] **Step 3: Commit**

```bash
git add api/_lib/admin-auth.js
git commit -m "add admin auth helper for api functions"
```

---

### Task 8: API — `POST /api/quote-create`

**Files:**
- Create: `api/quote-create.js`

- [ ] **Step 1: Write the handler**

`api/quote-create.js`:
```js
// POST /api/quote-create  { submissionId } → { quote }
// Admin-only. Pre-fills from submission, generates passcode + quote number, persists.

import { getDb, admin } from './_lib/firebase.js';
import { requireAdmin } from './_lib/admin-auth.js';
import { generateQuoteId, generatePasscode, hashPasscode } from './_lib/quote-id.js';
import { getNextQuoteNumber } from './_lib/quote-counter.js';
import { prefillFromSubmission } from '../app/lib/quote-prefill.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try { await requireAdmin(req); } catch (e) { return res.status(401).json({ error: e.message }); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); } }
  const submissionId = (body?.submissionId || '').toString().trim();
  if (!submissionId) return res.status(400).json({ error: 'submissionId is required' });

  const db = getDb();

  // 1. Load submission
  const subSnap = await db.collection('projectSubmissions').doc(submissionId).get();
  if (!subSnap.exists) return res.status(404).json({ error: 'Submission not found' });
  const submission = subSnap.data();

  // 2. Reject if a quote already exists for this submission (admin should open it, not recreate)
  const existing = await db.collection('quotes').where('submissionId', '==', submissionId).limit(1).get();
  if (!existing.empty) {
    const doc = existing.docs[0];
    return res.status(409).json({ error: 'Quote already exists', existing: { id: doc.id, ...doc.data(), _passcodePlain: doc.data()._passcodePlain } });
  }

  // 3. Pre-fill
  const draft = prefillFromSubmission(submission);

  // 4. Generate IDs and passcode
  const id = generateQuoteId();
  const passcodePlain = generatePasscode();
  const passcodeHash = hashPasscode(passcodePlain);
  const quoteNumber = await getNextQuoteNumber();

  // 5. Persist
  const now = admin.firestore.FieldValue.serverTimestamp();
  const quote = {
    quoteNumber,
    submissionId,
    status: 'draft',
    language: draft.language,
    validDays: 30,
    vatPercent: 5,
    customer: draft.customer,
    lineItems: draft.lineItems,
    pages: draft.pages,
    terms: { en: '50% upfront, 50% on delivery. Excludes hosting (we recommend Vercel free).', ar: '٥٠٪ مقدماً، ٥٠٪ عند التسليم. لا يشمل الاستضافة (نوصي بـ Vercel المجاني).' },
    notes: { en: '', ar: '' },
    passcodeHash,
    _passcodePlain: passcodePlain,
    createdAt: now,
    updatedAt: now,
    lastSentAt: null,
  };
  await db.collection('quotes').doc(id).set(quote);

  return res.status(201).json({ id, ...quote, passcodePlain });
}
```

- [ ] **Step 2: Manually verify with curl, using a real submission ID**

First, get a Firebase ID token. From the admin page in your browser (logged in), open DevTools console and run:
```js
firebase.auth().currentUser.getIdToken().then(t => console.log(t))
```
Copy the token. Find a real `projectSubmissions` doc ID (also from the admin page or Firestore).

Then in terminal:
```bash
TOKEN="<paste token>"
SUB_ID="<paste submission id>"
curl -s -X POST http://localhost:3000/api/quote-create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"submissionId\":\"$SUB_ID\"}" | python3 -m json.tool
```
Expected: `201` with a JSON object containing `id`, `quoteNumber: "Q-2026-NNN"`, `passcodePlain` (6 digits), `lineItems` (array), `customer`, etc.

Re-run the same curl: expected `409` with `existing` containing the same quote.

- [ ] **Step 3: Commit**

```bash
git add api/quote-create.js
git commit -m "add api/quote-create — admin endpoint for new quote"
```

---

### Task 9: API — `PATCH /api/quote-save`

**Files:**
- Create: `api/quote-save.js`

- [ ] **Step 1: Write the handler**

`api/quote-save.js`:
```js
// PATCH /api/quote-save  { id, updates, markSent? } → { quote }
// Admin-only. Whitelisted field updates. Optional markSent flips status to 'active' + sets lastSentAt.

import { getDb, admin } from './_lib/firebase.js';
import { requireAdmin } from './_lib/admin-auth.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

// Fields the admin is allowed to update directly. Everything else is locked.
const ALLOWED = new Set([
  'language', 'validDays', 'vatPercent',
  'customer', 'lineItems', 'pages', 'terms', 'notes',
]);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  try { await requireAdmin(req); } catch (e) { return res.status(401).json({ error: e.message }); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); } }
  const id = (body?.id || '').toString().trim();
  const updates = body?.updates || {};
  const markSent = body?.markSent === true;
  if (!id) return res.status(400).json({ error: 'id is required' });

  // Filter to allowed fields only
  const safe = {};
  for (const key of Object.keys(updates)) {
    if (ALLOWED.has(key)) safe[key] = updates[key];
  }

  safe.updatedAt = admin.firestore.FieldValue.serverTimestamp();
  if (markSent) {
    safe.status = 'active';
    safe.lastSentAt = admin.firestore.FieldValue.serverTimestamp();
  }

  const db = getDb();
  const ref = db.collection('quotes').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: 'Quote not found' });

  await ref.set(safe, { merge: true });
  const after = await ref.get();
  return res.status(200).json({ id, ...after.data() });
}
```

- [ ] **Step 2: Manually verify with curl**

```bash
TOKEN="<paste token>"
QUOTE_ID="<paste id from Task 8>"
curl -s -X PATCH http://localhost:3000/api/quote-save \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$QUOTE_ID\",\"updates\":{\"vatPercent\":7},\"markSent\":true}" | python3 -m json.tool
```
Expected: `200` with the quote object showing `vatPercent: 7`, `status: "active"`, `lastSentAt` populated.

Sanity check: send an attempt to update a non-allowed field:
```bash
curl -s -X PATCH http://localhost:3000/api/quote-save \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$QUOTE_ID\",\"updates\":{\"passcodeHash\":\"hacked\"}}" | python3 -m json.tool
```
Expected: `200` but `passcodeHash` is unchanged (filtered out by the allowlist).

- [ ] **Step 3: Commit**

```bash
git add api/quote-save.js
git commit -m "add api/quote-save — admin endpoint for edits + send"
```

---

### Task 10: API — `POST /api/quote-verify`

**Files:**
- Create: `api/quote-verify.js`

- [ ] **Step 1: Write the handler**

`api/quote-verify.js`:
```js
// POST /api/quote-verify  { id, passcode } → { quote } or 401
// Public. Hashes input, compares to stored hash. Strips private fields before returning.

import { getDb } from './_lib/firebase.js';
import { verifyPasscode } from './_lib/quote-id.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

const BRAND = {
  name: 'QD Systems',
  phone: '+971 50 461 1123',
  site: 'qdsystems.ae',
};

// Strip fields that should never leave the server.
function sanitize(quote) {
  const { passcodeHash, _passcodePlain, submissionId, ...safe } = quote;
  // Also remove any field starting with underscore (reserved for internal).
  for (const k of Object.keys(safe)) {
    if (k.startsWith('_')) delete safe[k];
  }
  return safe;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); } }
  const id = (body?.id || '').toString().trim();
  const passcode = (body?.passcode || '').toString().trim();
  if (!id || !passcode) return res.status(400).json({ error: 'id and passcode are required' });

  const snap = await getDb().collection('quotes').doc(id).get();
  if (!snap.exists) return res.status(404).json({ error: 'Quote not found' });

  const quote = snap.data();
  if (!verifyPasscode(passcode, quote.passcodeHash)) {
    return res.status(401).json({ error: 'Incorrect passcode' });
  }

  return res.status(200).json({ id, ...sanitize(quote), brand: BRAND });
}
```

- [ ] **Step 2: Manually verify with curl — wrong passcode, then right passcode**

```bash
QUOTE_ID="<paste id from Task 8>"
# Wrong passcode → 401
curl -s -o /dev/null -w "wrong passcode → HTTP %{http_code}\n" \
  -X POST http://localhost:3000/api/quote-verify \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$QUOTE_ID\",\"passcode\":\"000000\"}"

# Right passcode (use the plaintext from Task 8 response) → 200
PASSCODE="<paste plaintext passcode>"
curl -s -X POST http://localhost:3000/api/quote-verify \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$QUOTE_ID\",\"passcode\":\"$PASSCODE\"}" | python3 -m json.tool | head -20
```
Expected: first request prints `wrong passcode → HTTP 401`. Second request returns the quote JSON. Confirm response does **not** contain `passcodeHash`, `_passcodePlain`, or `submissionId`.

- [ ] **Step 3: Commit**

```bash
git add api/quote-verify.js
git commit -m "add api/quote-verify — public passcode-gated quote read"
```

---

### Task 11: Public quote page — HTML + CSS shell

**Files:**
- Create: `q/index.html`
- Create: `q/quote.css`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p q
```

- [ ] **Step 2: Write `q/index.html`**

```html
<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quotation · QD Systems</title>
  <link rel="icon" href="/assets/favicon.svg">
  <link rel="stylesheet" href="/q/quote.css">
</head>
<body>
  <main id="quote-root">
    <!-- Passcode gate by default; replaced after successful verify. -->
    <section class="passcode-gate" id="passcode-gate">
      <div class="passcode-card">
        <img src="/assets/qd-logo.jpeg" alt="QD Systems" class="passcode-logo">
        <h1 class="passcode-prompt" data-l="passcodePrompt"></h1>
        <form id="passcode-form" autocomplete="off">
          <input
            type="text"
            inputmode="numeric"
            pattern="[0-9]{6}"
            maxlength="6"
            id="passcode-input"
            class="passcode-input"
            placeholder="••••••"
            required>
          <button type="submit" class="passcode-submit" data-l="unlock"></button>
        </form>
        <p class="passcode-error" id="passcode-error" hidden></p>
      </div>
    </section>
  </main>
  <script type="module" src="/q/quote.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write `q/quote.css`**

```css
:root {
  --qd-blue: #0066cc;
  --qd-ink: #1a1a1a;
  --qd-muted: #666;
  --qd-soft: #f7f8fa;
  --qd-border: #e5e7eb;
  --qd-bg: #fafafa;
  --qd-accent: #fff7ed;
  --qd-accent-ink: #c2410c;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
  background: var(--qd-bg);
  color: var(--qd-ink);
  line-height: 1.5;
}

[dir="rtl"] body {
  font-family: "SF Arabic", "Helvetica Neue", Arial, sans-serif;
}

/* ─── Passcode gate ───────────────────────────────────────────── */
.passcode-gate {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.passcode-card {
  background: white;
  border: 1px solid var(--qd-border);
  padding: 36px 32px;
  border-radius: 8px;
  max-width: 360px;
  width: 100%;
  text-align: center;
  box-shadow: 0 4px 24px rgba(0,0,0,0.04);
}
.passcode-logo { height: 56px; margin-bottom: 16px; border-radius: 6px; }
.passcode-prompt {
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 20px;
  color: var(--qd-muted);
  letter-spacing: 0.3px;
}
.passcode-input {
  width: 100%;
  padding: 14px 12px;
  font-size: 22px;
  text-align: center;
  letter-spacing: 8px;
  font-family: ui-monospace, "SF Mono", monospace;
  border: 1px solid var(--qd-border);
  border-radius: 6px;
  margin-bottom: 14px;
}
.passcode-input:focus { outline: 2px solid var(--qd-blue); outline-offset: -1px; border-color: var(--qd-blue); }
.passcode-submit {
  width: 100%;
  padding: 12px;
  background: var(--qd-blue);
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.5px;
  cursor: pointer;
}
.passcode-submit:hover { filter: brightness(1.08); }
.passcode-error {
  margin: 12px 0 0;
  color: #c00;
  font-size: 13px;
  min-height: 1em;
}
.passcode-card.shake { animation: shake 0.4s; }
@keyframes shake { 0%,100%{transform:translateX(0);} 20%,60%{transform:translateX(-6px);} 40%,80%{transform:translateX(6px);} }

/* ─── Quote layout ────────────────────────────────────────────── */
.quote-shell {
  max-width: 800px;
  margin: 24px auto;
  background: white;
  border: 1px solid var(--qd-border);
  padding: 40px 48px;
  border-radius: 8px;
}
.quote-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 12px;
  color: var(--qd-muted);
}
.quote-toolbar button { background: none; border: none; cursor: pointer; color: var(--qd-muted); font-size: 12px; padding: 4px 8px; }
.quote-toolbar button.active { color: var(--qd-blue); font-weight: 700; }
.quote-toolbar button:hover { color: var(--qd-blue); }

.quote-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 2px solid var(--qd-blue);
  padding-bottom: 18px;
  margin-bottom: 24px;
}
.quote-header-brand img { height: 60px; border-radius: 4px; display: block; }
.quote-header-brand .brand-sub { font-size: 9px; color: #888; letter-spacing: 2px; margin-top: 8px; font-family: ui-monospace, monospace; }
.quote-header-brand .brand-contact { font-size: 11px; color: var(--qd-muted); margin-top: 4px; }
.quote-header-meta { text-align: right; }
[dir="rtl"] .quote-header-meta { text-align: left; }
.quote-header-meta .quote-title { font-weight: 700; font-size: 20px; letter-spacing: 2.5px; }
.quote-header-meta .quote-num { font-family: ui-monospace, monospace; font-size: 12px; color: var(--qd-blue); margin-top: 4px; }
.quote-header-meta .quote-date { font-size: 11px; color: #888; margin-top: 6px; }

.client-block {
  background: var(--qd-soft);
  padding: 14px 16px;
  margin-bottom: 22px;
  border-left: 3px solid var(--qd-blue);
}
[dir="rtl"] .client-block { border-left: none; border-right: 3px solid var(--qd-blue); }
.client-block .label { font-weight: 700; font-size: 10px; color: #888; letter-spacing: 1.5px; margin-bottom: 4px; }
.client-block .name { font-weight: 600; font-size: 14px; }
.client-block .contact { font-size: 12px; color: var(--qd-muted); margin-top: 2px; }

table.line-items {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin-bottom: 18px;
}
.line-items thead tr { background: var(--qd-blue); color: white; }
.line-items th { padding: 10px 12px; font-weight: 600; letter-spacing: 0.5px; text-align: left; }
.line-items th.num, .line-items td.num { text-align: right; }
.line-items th.center, .line-items td.center { text-align: center; }
.line-items tbody tr { border-bottom: 1px solid #eee; }
.line-items td { padding: 10px 12px; vertical-align: top; }
.line-items td.desc small { display: block; font-size: 10px; color: #888; margin-top: 3px; }

.totals-row { display: flex; justify-content: flex-end; margin-bottom: 22px; }
.totals-box { width: 280px; font-size: 13px; }
.totals-box .row { display: flex; justify-content: space-between; padding: 4px 0; color: #555; }
.totals-box .row.grand {
  border-top: 2px solid var(--qd-blue);
  padding-top: 10px;
  margin-top: 4px;
  font-weight: 700;
  font-size: 15px;
  color: var(--qd-ink);
}

.pages-block {
  background: #fafbfc;
  border: 1px solid var(--qd-border);
  padding: 14px 16px;
  margin-bottom: 18px;
  border-radius: 4px;
}
.pages-block .label { font-weight: 700; font-size: 10px; color: #888; letter-spacing: 1.5px; margin-bottom: 6px; }
.pages-block .pages-text { font-size: 13px; color: #333; }

.terms-block {
  font-size: 11px;
  color: var(--qd-muted);
  border-top: 1px solid #eee;
  padding-top: 12px;
  line-height: 1.7;
}

.expired-banner, .not-found {
  max-width: 480px;
  margin: 60px auto;
  background: white;
  border: 1px solid var(--qd-border);
  padding: 28px;
  border-radius: 8px;
  text-align: center;
  color: var(--qd-muted);
}

/* ─── Print ───────────────────────────────────────────────────── */
@media print {
  .quote-toolbar, .passcode-gate { display: none !important; }
  body { background: white; }
  .quote-shell { border: none; box-shadow: none; margin: 0; padding: 0; max-width: 100%; }
  @page { size: A4; margin: 18mm; }
}
```

- [ ] **Step 4: Manually verify the static page loads**

```bash
curl -s -o /dev/null -w "GET /q/test-id → HTTP %{http_code}\n" http://localhost:3000/q/test-id
curl -s -o /dev/null -w "GET /q/quote.css → HTTP %{http_code}  bytes %{size_download}\n" http://localhost:3000/q/quote.css
```
Expected: both `200`. Open `http://localhost:3000/q/test-id` in a browser — you should see the empty passcode gate (logo + prompt + input + button). Labels are blank because `quote.js` hasn't been added yet — that's the next task.

- [ ] **Step 5: Commit**

```bash
git add q/index.html q/quote.css
git commit -m "add public quote page shell + styles"
```

---

### Task 12: Public quote page — JS (passcode + render + toggle)

**Files:**
- Create: `q/quote.js`

- [ ] **Step 1: Write `q/quote.js`**

```js
import { L, LABELS } from '/app/lib/quote-labels.js';
import { computeTotals, formatAED } from '/app/lib/quote-totals.js';

const QD_BRAND = { name: 'QD Systems', phone: '+971 50 461 1123', site: 'qdsystems.ae' };
const ID = location.pathname.replace(/^\/q\//, '').trim();

let currentLang = localStorage.getItem('quoteLang') || 'en';

function applyStaticLabels(root = document) {
  root.querySelectorAll('[data-l]').forEach((el) => {
    el.textContent = L(currentLang, el.dataset.l);
  });
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
}

function showError(msg, shake = false) {
  const errEl = document.getElementById('passcode-error');
  if (!errEl) return;
  errEl.textContent = msg;
  errEl.hidden = false;
  if (shake) {
    const card = document.querySelector('.passcode-card');
    card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
  }
}

async function verifyAndRender(passcode) {
  const res = await fetch('/api/quote-verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: ID, passcode }),
  });
  if (res.status === 401) { showError(L(currentLang, 'incorrectPasscode'), true); return; }
  if (res.status === 404) { renderNotFound(); return; }
  if (!res.ok) { showError('Network error'); return; }
  const data = await res.json();
  // First successful unlock: pick the quote's preferred language UNLESS user already overrode
  if (!localStorage.getItem('quoteLang')) {
    currentLang = data.language || 'en';
    localStorage.setItem('quoteLang', currentLang);
  }
  renderQuote(data);
}

function renderNotFound() {
  document.getElementById('quote-root').innerHTML = `
    <div class="not-found">
      <p>${L(currentLang, 'quoteNotFound')}</p>
    </div>`;
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function pickText(field) {
  if (!field) return '';
  const primary = field[currentLang];
  if (primary) return primary;
  const other = currentLang === 'en' ? field.ar : field.en;
  if (!other) return '';
  const tag = currentLang === 'en' ? '[AR]' : '[EN]';
  return `${tag} ${other}`;
}

function renderQuote(data) {
  const totals = computeTotals(data.lineItems, data.vatPercent);
  const issued = data.createdAt
    ? new Date(data.createdAt._seconds ? data.createdAt._seconds * 1000 : data.createdAt).toLocaleDateString(currentLang === 'ar' ? 'ar-AE' : 'en-AE', { year:'numeric', month:'short', day:'numeric' })
    : '';
  const root = document.getElementById('quote-root');
  root.innerHTML = `
    <div class="quote-shell">
      <div class="quote-toolbar">
        <button id="lang-en" type="button" class="${currentLang==='en'?'active':''}">EN</button>
        <span style="color:#ccc">·</span>
        <button id="lang-ar" type="button" class="${currentLang==='ar'?'active':''}">AR</button>
        <button id="print-btn" type="button">🖨 ${L(currentLang,'print')}</button>
      </div>
      <div class="quote-header">
        <div class="quote-header-brand">
          <img src="/assets/qd-logo.jpeg" alt="${QD_BRAND.name}">
          <div class="brand-sub">WEB · BRAND · DIGITAL SYSTEMS</div>
          <div class="brand-contact">${QD_BRAND.site} · ${QD_BRAND.phone}</div>
        </div>
        <div class="quote-header-meta">
          <div class="quote-title">${L(currentLang,'quotation')}</div>
          <div class="quote-num">${escape(data.quoteNumber)}</div>
          <div class="quote-date">${L(currentLang,'issued')} · ${escape(issued)}</div>
          <div class="quote-date">${L(currentLang,'valid')} · ${escape(data.validDays)} ${L(currentLang,'days')}</div>
        </div>
      </div>
      <div class="client-block">
        <div class="label">${L(currentLang,'preparedFor')}</div>
        <div class="name">${escape(data.customer?.businessName || '')}</div>
        <div class="contact">${escape([data.customer?.email, data.customer?.phone].filter(Boolean).join(' · '))}</div>
      </div>
      <table class="line-items">
        <thead>
          <tr>
            <th>${L(currentLang,'service')}</th>
            <th class="center" style="width:48px">${L(currentLang,'qty')}</th>
            <th class="num" style="width:90px">${L(currentLang,'unit')}</th>
            <th class="num" style="width:90px">${L(currentLang,'total')}</th>
          </tr>
        </thead>
        <tbody>
          ${(data.lineItems||[]).map((li) => `
            <tr>
              <td class="desc">${escape(pickText(li.name))}${li.description && pickText(li.description) ? `<small>${escape(pickText(li.description))}</small>`:''}</td>
              <td class="center">${escape(li.qty)}</td>
              <td class="num">${formatAED(li.unitPrice)}</td>
              <td class="num">${formatAED((Number(li.qty)||0)*(Number(li.unitPrice)||0))}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <div class="totals-row">
        <div class="totals-box">
          <div class="row"><span>${L(currentLang,'subtotal')}</span><span>${formatAED(totals.subtotal)}</span></div>
          <div class="row"><span>${L(currentLang,'vat')} ${escape(data.vatPercent)}%</span><span>${formatAED(totals.vat)}</span></div>
          <div class="row grand"><span>${L(currentLang,'grandTotal')}</span><span>${formatAED(totals.grandTotal)}</span></div>
        </div>
      </div>
      ${pickText(data.pages) ? `
        <div class="pages-block">
          <div class="label">${L(currentLang,'pagesIncluded')}</div>
          <div class="pages-text">${escape(pickText(data.pages))}</div>
        </div>` : ''}
      <div class="terms-block">${escape(pickText(data.terms))}<br>${L(currentLang,'questions')}</div>
    </div>
  `;
  applyStaticLabels();
  document.getElementById('lang-en').addEventListener('click', () => setLang('en', data));
  document.getElementById('lang-ar').addEventListener('click', () => setLang('ar', data));
  document.getElementById('print-btn').addEventListener('click', () => window.print());
}

function setLang(lang, data) {
  if (lang === currentLang) return;
  currentLang = lang;
  localStorage.setItem('quoteLang', lang);
  renderQuote(data);
}

// ─── Boot ─────────────────────────────────────────────────────
applyStaticLabels();
document.getElementById('passcode-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = document.getElementById('passcode-input').value.trim();
  if (!/^[0-9]{6}$/.test(code)) { showError(L(currentLang, 'incorrectPasscode'), true); return; }
  verifyAndRender(code);
});

if (!ID) renderNotFound();
```

- [ ] **Step 2: Verify the public page works end-to-end in a browser**

Restart the dev server (`pkill -f _dev-server.mjs; node _dev-server.mjs &`). Open `http://localhost:3000/q/<id-from-Task-8>`.

Expected flow:
1. Passcode gate appears with logo + "Enter the passcode shared with you" + 6-digit input.
2. Enter a wrong code → input shakes, error text appears.
3. Enter the right code → quote renders with logo header, quote number, client block, line items, totals box, pages, terms.
4. Click **AR** in the top-right toolbar → layout flips to RTL, labels in Arabic, content from the AR side of each bilingual field.
5. Click **EN** → flips back.
6. Click **🖨 Print** → browser print preview opens; toolbar and passcode gate are hidden.
7. Refresh the page → goes back to passcode gate (good), but after unlock the language preference is preserved.

Also check `localStorage.getItem('quoteLang')` in DevTools — should match the last selected language.

- [ ] **Step 3: Commit**

```bash
git add q/quote.js
git commit -m "add public quote page logic + en/ar toggle"
```

---

### Task 13: vercel.json — add `/q/*` rewrite + function durations

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Read current `vercel.json`**

```bash
cat vercel.json
```

- [ ] **Step 2: Replace with the updated config**

`vercel.json`:
```json
{
  "cleanUrls": false,
  "trailingSlash": false,
  "rewrites": [
    { "source": "/q/(.*)", "destination": "/q/index.html" }
  ],
  "functions": {
    "api/chat.js":         { "memory": 1024, "maxDuration": 30 },
    "api/quote-create.js": { "memory": 512,  "maxDuration": 10 },
    "api/quote-save.js":   { "memory": 512,  "maxDuration": 10 },
    "api/quote-verify.js": { "memory": 512,  "maxDuration": 10 }
  },
  "headers": [
    {
      "source": "/api/chat",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Access-Control-Allow-Methods", "value": "POST, OPTIONS" }
      ]
    }
  ]
}
```

Note: the existing `api/chat.js` config is preserved exactly; we only added quote endpoints + the `rewrites` block. The rewrite handles `/q/abc123` → serves `/q/index.html` on Vercel (matches `_dev-server.mjs`).

- [ ] **Step 3: Validate JSON parses**

```bash
node -e "JSON.parse(require('fs').readFileSync('vercel.json'))" && echo "OK"
```
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add vercel.json
git commit -m "vercel config: q/ rewrite + quote function durations"
```

---

### Task 14: Admin — state slice + load quotes

**Files:**
- Modify: `admin.js` (around the `state` object near line 64 — `submissions: []`)

- [ ] **Step 1: Read the admin.js area that manages state + initial load**

```bash
grep -n "submissions:" admin.js | head -5
grep -n "onSnapshot\|collection(" admin.js | head -10
```

Identify (a) where `state` is declared, (b) where submissions are loaded from Firestore.

- [ ] **Step 2: Add a `quotesBySubmissionId` slice to `state`**

Find the state initializer (near line 64). Add a sibling field:
```js
const state = {
  user: null,
  submissions: [],
  quotesBySubmissionId: {},    // <-- ADD THIS — keyed by submissionId, value is the full quote doc with id
  selectedId: null,
  // … existing fields …
};
```

- [ ] **Step 3: Subscribe to the `quotes` collection alongside submissions**

Find where `db.collection('projectSubmissions').onSnapshot(...)` is wired up. Add a parallel subscription on `quotes`. Example (adapt to the actual handler shape in admin.js):
```js
db.collection('quotes').onSnapshot((snap) => {
  const map = {};
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.submissionId) map[d.submissionId] = { id: doc.id, ...d };
  });
  state.quotesBySubmissionId = map;
  render(); // or whatever the existing function is called
});
```

If admin.js uses a different pattern (e.g., a single `loadAll()` function that fires both), inline that style instead.

- [ ] **Step 4: Manually verify the subscription fires**

Open admin in browser (`http://localhost:3000/admin.html`), log in. In DevTools console:
```js
// After page load, inspect state (depends on whether state is exposed; if not, add a temporary `window.state = state` line at the bottom of admin.js for this test)
console.log(Object.keys(state.quotesBySubmissionId || {}));
```
Expected: an array (possibly empty if no quotes exist for your user's submissions, or 1+ if you created one in Task 8).

Remove the temporary `window.state` line after verifying.

- [ ] **Step 5: Commit**

```bash
git add admin.js
git commit -m "admin: load and subscribe to quotes collection"
```

---

### Task 15: Admin — "Generate Quotation" button in submission detail

**Files:**
- Modify: `admin.js` (the submission detail render function)
- Modify: `admin.css` (button + status badge styles)

- [ ] **Step 1: Locate the submission detail render function**

```bash
grep -n "renderDetail\|selectedSubmission\|getSelectedSubmission" admin.js | head -10
```

The render likely lives in or near where existing action buttons (WhatsApp / Email / Call links — `buildWhatsAppLink`, `buildMailtoLink`, `buildCallLink`) are placed.

- [ ] **Step 2: Add the button HTML inside the detail render**

Near the existing action buttons in the detail header, add:
```js
function renderQuoteButton(submission) {
  const quote = state.quotesBySubmissionId[submission.id];
  if (!quote) {
    return `<button class="qd-btn qd-btn-primary" data-action="generate-quote" data-submission-id="${submission.id}">+ Generate Quotation</button>`;
  }
  if (quote.status === 'draft') {
    return `<button class="qd-btn qd-btn-secondary" data-action="edit-quote" data-quote-id="${quote.id}">✎ Edit Quote · ${quote.quoteNumber}</button>`;
  }
  return `<button class="qd-btn qd-btn-secondary qd-btn-with-dot" data-action="edit-quote" data-quote-id="${quote.id}">📋 View Quote · ${quote.quoteNumber}</button>`;
}
```

Wire it into the detail render (call `renderQuoteButton(submission)` where the action buttons live).

- [ ] **Step 3: Add CSS for the button states**

Append to `admin.css`:
```css
.qd-btn { padding: 6px 12px; border-radius: 4px; font-size: 12px; font-weight: 600; border: 1px solid transparent; cursor: pointer; }
.qd-btn-primary { background: #0066cc; color: white; }
.qd-btn-primary:hover { filter: brightness(1.08); }
.qd-btn-secondary { background: white; color: #333; border-color: #d1d5db; }
.qd-btn-secondary:hover { background: #f3f4f6; }
.qd-btn-with-dot::before { content: '●'; color: #10b981; margin-right: 6px; font-size: 10px; vertical-align: middle; }
```

- [ ] **Step 4: Hook up click handler (drawer logic comes in Task 16 — for now just log)**

Add a delegated click handler near other admin event bindings:
```js
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="generate-quote"], [data-action="edit-quote"]');
  if (!btn) return;
  console.log('[quote button]', btn.dataset);
  // Real handler in Task 16
});
```

- [ ] **Step 5: Verify in browser**

Reload `/admin.html`. For a submission with no quote → button reads `+ Generate Quotation` (blue). For the one you created in Task 8 → button reads `📋 View Quote · Q-2026-NNN` (with green dot). Click → DevTools console logs the dataset.

- [ ] **Step 6: Commit**

```bash
git add admin.js admin.css
git commit -m "admin: generate quotation button per submission state"
```

---

### Task 16: Admin — slide-over drawer component (open + populate)

**Files:**
- Modify: `admin.js` (drawer state, open/close, populate)
- Modify: `admin.css` (drawer styles, animation)

- [ ] **Step 1: Add drawer mount point + state**

In `admin.html`, add (right before `</body>` or just after `#qd-admin-root`):
```html
<div id="qd-quote-drawer-root"></div>
```

In `admin.js`, add to `state`:
```js
state.drawer = { open: false, quote: null, dirty: false };
```

- [ ] **Step 2: Add drawer CSS**

Append to `admin.css`:
```css
.qd-drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.35); opacity: 0; pointer-events: none; transition: opacity 0.18s; z-index: 100; }
.qd-drawer-overlay.open { opacity: 1; pointer-events: auto; }
.qd-drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(620px, 90vw); background: #fcfcfd; transform: translateX(100%); transition: transform 0.22s ease-out; z-index: 101; box-shadow: -8px 0 24px rgba(0,0,0,0.12); display: flex; flex-direction: column; }
.qd-drawer.open { transform: translateX(0); }
.qd-drawer-head { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid #e5e7eb; }
.qd-drawer-head h2 { margin: 0; font-size: 14px; font-weight: 600; }
.qd-drawer-close { background: none; border: none; font-size: 22px; color: #888; cursor: pointer; padding: 0 4px; line-height: 1; }
.qd-drawer-body { flex: 1; overflow-y: auto; padding: 16px 18px; }
.qd-drawer-foot { border-top: 1px solid #e5e7eb; padding: 10px 18px; display: flex; justify-content: flex-end; gap: 8px; background: white; }
.qd-drawer .section-label { font-size: 9px; color: #888; letter-spacing: 1.5px; font-weight: 700; margin: 14px 0 6px; }
.qd-drawer .section-label:first-child { margin-top: 0; }
.qd-drawer input, .qd-drawer textarea, .qd-drawer select { width: 100%; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 3px; font-size: 12px; font-family: inherit; }
.qd-drawer textarea { resize: vertical; min-height: 50px; }
.qd-drawer .row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.qd-drawer .row .grow { flex: 1; }
.qd-drawer .line-items-table { width: 100%; font-size: 12px; border-collapse: collapse; }
.qd-drawer .line-items-table input { padding: 4px 6px; font-size: 11px; }
.qd-drawer .line-items-table td { padding: 4px; vertical-align: top; }
.qd-drawer .line-items-table .remove { color: #c00; cursor: pointer; padding: 0 6px; }
.qd-drawer .totals-preview { background: #0066cc; color: white; padding: 8px 12px; font-size: 12px; margin: 10px 0; }
.qd-drawer .totals-preview .row { display: flex; justify-content: space-between; align-items: baseline; margin: 0; }
.qd-drawer .totals-preview .row.grand { font-weight: 700; font-size: 14px; border-top: 1px solid rgba(255,255,255,0.3); margin-top: 4px; padding-top: 4px; }
.qd-drawer .passcode-display { font-family: ui-monospace, "SF Mono", monospace; background: #fff7ed; color: #c2410c; padding: 3px 8px; border-radius: 3px; }
```

- [ ] **Step 3: Write drawer render + open/close**

Add to `admin.js`:
```js
import { CATALOG, catalogToLineItem } from '/app/lib/quote-catalog.js';
import { computeTotals, formatAED } from '/app/lib/quote-totals.js';

async function openDrawerForSubmission(submission) {
  // Find existing quote or create one
  const existing = state.quotesBySubmissionId[submission.id];
  let quote = existing;
  if (!quote) {
    const token = await firebase.auth().currentUser.getIdToken();
    const res = await fetch('/api/quote-create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ submissionId: submission.id }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert('Could not create quote: ' + (err.error || res.status));
      return;
    }
    quote = await res.json();
    // Will also arrive via the onSnapshot subscription, but seed state immediately for snappy UX
    state.quotesBySubmissionId[submission.id] = quote;
  }
  state.drawer = { open: true, quote: { ...quote }, dirty: false };
  renderDrawer();
}

function openDrawerForQuote(quoteId) {
  // Find quote in current state
  let quote = null;
  for (const sid in state.quotesBySubmissionId) {
    if (state.quotesBySubmissionId[sid].id === quoteId) { quote = state.quotesBySubmissionId[sid]; break; }
  }
  if (!quote) { alert('Quote not found'); return; }
  state.drawer = { open: true, quote: { ...quote }, dirty: false };
  renderDrawer();
}

function closeDrawer() {
  if (state.drawer.dirty) saveDrawer(); // auto-save on close
  state.drawer = { open: false, quote: null, dirty: false };
  document.getElementById('qd-quote-drawer-root').innerHTML = '';
}

function renderDrawer() {
  const q = state.drawer.quote;
  if (!q) { document.getElementById('qd-quote-drawer-root').innerHTML = ''; return; }
  const totals = computeTotals(q.lineItems, q.vatPercent);

  const root = document.getElementById('qd-quote-drawer-root');
  root.innerHTML = `
    <div class="qd-drawer-overlay open" data-action="close-drawer"></div>
    <aside class="qd-drawer open">
      <div class="qd-drawer-head">
        <h2>${q.status === 'active' ? '📋 View / Edit' : '✎ Edit'} Quote · ${q.quoteNumber}</h2>
        <button class="qd-drawer-close" data-action="close-drawer">×</button>
      </div>
      <div class="qd-drawer-body">

        <div class="section-label">CUSTOMER</div>
        <input class="grow" data-field="customer.businessName" value="${escAttr(q.customer?.businessName||'')}">
        <div class="row" style="margin-top:6px"><input data-field="customer.email" value="${escAttr(q.customer?.email||'')}"><input data-field="customer.phone" value="${escAttr(q.customer?.phone||'')}"></div>

        <div class="section-label">LINE ITEMS</div>
        <table class="line-items-table">
          <thead><tr><th style="text-align:left">Service (EN)</th><th style="text-align:left">Service (AR)</th><th style="width:40px">Qty</th><th style="width:70px">Unit AED</th><th style="width:24px"></th></tr></thead>
          <tbody>
            ${q.lineItems.map((li, idx) => `
              <tr>
                <td><input data-line="${idx}.name.en" value="${escAttr(li.name?.en||'')}"></td>
                <td><input data-line="${idx}.name.ar" value="${escAttr(li.name?.ar||'')}" dir="rtl"></td>
                <td><input type="number" min="0" data-line="${idx}.qty" value="${li.qty||1}"></td>
                <td><input type="number" min="0" data-line="${idx}.unitPrice" value="${li.unitPrice||0}"></td>
                <td class="remove" data-action="remove-line" data-idx="${idx}">×</td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div class="row" style="margin-top:8px">
          <select data-action="add-from-catalog" class="grow">
            <option value="">+ Add from catalog…</option>
            ${CATALOG.map(c => `<option value="${c.key}">${c.name.en} — AED ${c.defaultPrice}</option>`).join('')}
          </select>
          <button class="qd-btn qd-btn-secondary" data-action="add-custom-line">+ Custom</button>
        </div>

        <div class="section-label">PAGES INCLUDED</div>
        <input data-field="pages.en" value="${escAttr(q.pages?.en||'')}" placeholder="Home · About · …">
        <input style="margin-top:6px" data-field="pages.ar" value="${escAttr(q.pages?.ar||'')}" placeholder="الرئيسية · …" dir="rtl">

        <div class="totals-preview">
          <div class="row"><span>Subtotal</span><span>${formatAED(totals.subtotal)}</span></div>
          <div class="row" style="opacity:0.85"><span>VAT ${q.vatPercent}%</span><span>${formatAED(totals.vat)}</span></div>
          <div class="row grand"><span>Total AED</span><span>${formatAED(totals.grandTotal)}</span></div>
        </div>

        <div class="row" style="font-size:11px;color:#666">
          <span style="letter-spacing:1px">VALID</span>
          <input type="number" min="1" data-field="validDays" value="${q.validDays}" style="width:60px">
          <span>days</span>
          <span style="margin-left:14px;letter-spacing:1px">VAT</span>
          <input type="number" min="0" max="100" data-field="vatPercent" value="${q.vatPercent}" style="width:50px">
          <span>%</span>
          <span style="margin-left:14px;letter-spacing:1px">CODE</span>
          <span class="passcode-display">${escAttr(q._passcodePlain || 'hidden')}</span>
        </div>

        <div class="section-label">TERMS (EN)</div>
        <textarea data-field="terms.en">${escHtml(q.terms?.en||'')}</textarea>
        <div class="section-label">TERMS (AR)</div>
        <textarea data-field="terms.ar" dir="rtl">${escHtml(q.terms?.ar||'')}</textarea>

      </div>
      <div class="qd-drawer-foot">
        <button class="qd-btn qd-btn-secondary" data-action="save-draft">Save draft</button>
        <button class="qd-btn qd-btn-primary" data-action="save-and-copy">Save + Copy link</button>
      </div>
    </aside>
  `;
}

function escAttr(s) { return String(s ?? '').replace(/"/g, '&quot;').replace(/</g,'&lt;'); }
function escHtml(s) { return String(s ?? '').replace(/[<>]/g, (c) => ({ '<':'&lt;','>':'&gt;' }[c])); }
```

Update the delegated click handler from Task 15 to route both actions:
```js
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const a = btn.dataset.action;
  if (a === 'generate-quote') {
    const sub = state.submissions.find((s) => s.id === btn.dataset.submissionId);
    if (sub) await openDrawerForSubmission(sub);
  } else if (a === 'edit-quote') {
    openDrawerForQuote(btn.dataset.quoteId);
  } else if (a === 'close-drawer') {
    closeDrawer();
  }
  // remove-line, add-custom-line, save-* handled in Task 17
});
```

- [ ] **Step 4: Manually verify the drawer opens and shows the right data**

In `/admin.html` (browser, logged in):
1. Pick a submission with no quote → click `+ Generate Quotation`. Expected: API call fires, drawer slides in from the right, populated with pre-filled line items, customer info, passcode shown in the orange chip.
2. Click outside the drawer (the overlay) or × → drawer closes.
3. Open the same submission again → button now reads `✎ Edit Quote · Q-2026-NNN`, click → drawer opens with the persisted data.

- [ ] **Step 5: Commit**

```bash
git add admin.html admin.js admin.css
git commit -m "admin: slide-over quote drawer with prefilled fields"
```

---

### Task 17: Admin — drawer save handlers + clipboard

**Files:**
- Modify: `admin.js` (input bindings, line-item add/remove, save handlers)

- [ ] **Step 1: Bind input changes to drawer state**

Add to `admin.js` (after `renderDrawer`):
```js
function applyChange(path, value) {
  // path = "customer.email"  or "0.name.en"  (for line items) or "validDays"
  const q = state.drawer.quote;
  const parts = path.split('.');
  const isLine = /^\d+$/.test(parts[0]);
  if (isLine) {
    const idx = Number(parts[0]);
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
  state.drawer.dirty = true;
}

// One delegated input handler — re-render only the totals preview to avoid losing focus
document.addEventListener('input', (e) => {
  if (!state.drawer.open) return;
  const fieldPath = e.target.dataset.field || e.target.dataset.line;
  if (!fieldPath) return;
  applyChange(fieldPath, e.target.value);
  // Live-update totals preview without re-rendering the whole drawer
  const q = state.drawer.quote;
  const t = computeTotals(q.lineItems, q.vatPercent);
  const preview = document.querySelector('.qd-drawer .totals-preview');
  if (preview) {
    preview.innerHTML = `
      <div class="row"><span>Subtotal</span><span>${formatAED(t.subtotal)}</span></div>
      <div class="row" style="opacity:0.85"><span>VAT ${q.vatPercent}%</span><span>${formatAED(t.vat)}</span></div>
      <div class="row grand"><span>Total AED</span><span>${formatAED(t.grandTotal)}</span></div>`;
  }
});
```

- [ ] **Step 2: Add line-item add/remove + catalog dropdown handler**

Extend the click handler from Task 16:
```js
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const a = btn.dataset.action;
  if (a === 'generate-quote') { /* …unchanged… */ }
  else if (a === 'edit-quote')   { /* …unchanged… */ }
  else if (a === 'close-drawer') { /* …unchanged… */ }
  else if (a === 'remove-line') {
    const idx = Number(btn.dataset.idx);
    state.drawer.quote.lineItems.splice(idx, 1);
    state.drawer.dirty = true;
    renderDrawer();
  }
  else if (a === 'add-custom-line') {
    state.drawer.quote.lineItems.push({ catalogKey: null, name: { en: '', ar: '' }, description: { en: '', ar: '' }, qty: 1, unitPrice: 0 });
    state.drawer.dirty = true;
    renderDrawer();
  }
  else if (a === 'save-draft')   { await saveDrawer({ markSent: false, copy: false }); }
  else if (a === 'save-and-copy'){ await saveDrawer({ markSent: true,  copy: true  }); }
});

// Catalog dropdown handler (change event, not click)
document.addEventListener('change', (e) => {
  if (e.target.dataset.action !== 'add-from-catalog') return;
  const key = e.target.value;
  if (!key) return;
  const line = catalogToLineItem(key);
  if (line) {
    state.drawer.quote.lineItems.push(line);
    state.drawer.dirty = true;
    renderDrawer();
  }
});
```

- [ ] **Step 3: Implement saveDrawer**

```js
async function saveDrawer({ markSent, copy }) {
  const q = state.drawer.quote;
  if (!q) return;
  const token = await firebase.auth().currentUser.getIdToken();
  const updates = {
    customer: q.customer, lineItems: q.lineItems, pages: q.pages,
    terms: q.terms, notes: q.notes, validDays: q.validDays, vatPercent: q.vatPercent,
    language: q.language || 'en',
  };
  const res = await fetch('/api/quote-save', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ id: q.id, updates, markSent: !!markSent }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert('Save failed: ' + (err.error || res.status));
    return;
  }
  state.drawer.dirty = false;
  if (copy) {
    const url = `${location.origin}/q/${q.id}`;
    const text = `Your quotation from QD Systems:\n${url}\nPasscode: ${q._passcodePlain}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast('Link copied — paste into WhatsApp.');
    } catch {
      // Fallback: show a modal with the text so user can copy manually
      alert(text);
    }
  } else {
    showToast('Draft saved.');
  }
}

function showToast(msg) {
  let toast = document.getElementById('qd-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'qd-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#0a0a0a;color:white;padding:10px 20px;border-radius:6px;font-size:13px;z-index:200;opacity:0;transition:opacity 0.2s';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.style.opacity = '0'; }, 2400);
}
```

- [ ] **Step 4: Manually verify the full admin flow**

1. Open a submission → click `+ Generate Quotation` → drawer opens (already tested).
2. Edit the customer business name in the drawer → type. No focus loss; totals don't change.
3. Click `+ Custom` → blank row appears. Fill name + price → totals preview updates.
4. Pick a service from `+ Add from catalog…` → new row appears with pre-filled name + default price.
5. Click `×` on a row → row removed; totals preview drops accordingly.
6. Click **Save draft** → toast: "Draft saved." Close drawer, reopen → all changes persisted.
7. Click **Save + Copy link** → toast: "Link copied — paste into WhatsApp." Paste into a text editor — should be the 3-line block (intro, URL, passcode).
8. Open the URL in incognito, enter the passcode → quote renders correctly.

- [ ] **Step 5: Commit**

```bash
git add admin.js
git commit -m "admin: drawer save handlers + clipboard share"
```

---

### Task 18: End-to-end smoke test against the spec

**Files:** none (test only)

- [ ] **Step 1: Run the 10-step manual smoke test from spec Section 7**

For each step below, perform the action and note PASS/FAIL:

1. **Create from real submission** — pick a real `projectSubmissions` doc, click `+ Generate Quotation`. Confirm pre-filled lineItems match `selectedRequiredFeatures` / `neededPages` count.
2. **Save + Copy link** — confirm clipboard contains URL + passcode in the spec format. Confirm `lastSentAt` populated (check the quote doc in Firestore directly), `status: "active"`.
3. **Open in incognito** — paste link, enter passcode, verify quote renders in EN.
4. **Toggle to AR** — verify layout flips RTL, AR strings render, totals box still right-aligned correctly.
5. **Edit in admin → reload public** — change a price in the drawer, save. Reload incognito tab. Confirm the new price is visible.
6. **Wrong passcode** — type 6 wrong digits, verify shake + error text. Confirm DevTools network tab shows 401 with no quote payload.
7. **Print to PDF** — click 🖨 Print on the public page. Confirm preview hides passcode gate (already closed) and the EN/AR toolbar. Confirm A4 layout looks clean.
8. **Generate a second quote in the same year** — pick another submission, generate. Quote number should be `Q-2026-002` (or next sequential after Task 6 testing).
9. **Reopen first quote from admin** — open the original submission again. Drawer should show the same plaintext passcode as initially (NOT regenerated).
10. **Sparse submission** — find or create a submission with empty `selectedRequiredFeatures`. Generate quote → confirm empty line-items table + `+ Add custom line` works.

- [ ] **Step 2: Fix anything that failed**

Common likely failures and where to look:
- **Pre-fill missing items** → check `app/lib/quote-prefill.js` mapping logic + the actual shape of your submission docs (open one in Firestore console).
- **AR layout broken** → check `[dir="rtl"]` rules in `q/quote.css`.
- **Clipboard fails** → some browsers block `navigator.clipboard` without HTTPS or user gesture; fallback alert covers this.
- **`/q/:id` 404s** → confirm `vercel.json` rewrite is correct and dev server was restarted.
- **`firebase-admin` auth errors** → confirm `.env.local` has the service account on a single line and the dev server was restarted after edits.

For each fix: edit, manually re-verify, commit with a focused message like `fix(quote): handle empty needed pages` or `fix(quote): rtl alignment for totals box`.

- [ ] **Step 3: Final commit if any fixes were made**

```bash
git status
# If clean: skip. If dirty:
git commit -am "smoke-test fixes for quote generator"
```

---

## Self-review

Walking through this plan against the spec, with fresh eyes:

**Spec coverage check:**
- Spec §3.1 data model → Task 8 (`quote-create`) writes every field listed; Task 9 (`quote-save`) updates the allowed subset; Task 6 handles the counter.
- Spec §3.2 routes → Task 8 / 9 / 10 cover the three API endpoints; Task 13 wires the `/q/(.*)` rewrite.
- Spec §3.3 catalog → Task 2.
- Spec §3.4 pre-fill mapping → Task 3.
- Spec §4 admin flow → Tasks 14 / 15 / 16 / 17 cover state, button, drawer, save.
- Spec §5 public quote page → Tasks 11 / 12.
- Spec §6 security → Tasks 1 (Firestore rules, salt env) + 7 (admin-auth) + 10 (sanitize on verify).
- Spec §7 testing → Task 18 (all 10 steps quoted directly from the spec).
- Spec §8 file list → matches my "File structure" section.

**Placeholder scan:** zero TBD/TODO. All code blocks contain real, complete code.

**Type consistency:**
- `prefillFromSubmission` (Task 3) returns `{ customer, lineItems, pages, language }`. Task 8 (`quote-create`) consumes exactly those four properties — match. ✓
- `computeTotals` (Task 4) returns `{ subtotal, vat, grandTotal }`. Task 12 and Task 16 both consume those three properties — match. ✓
- `LABELS[lang][key]` (Task 4) and `L(lang, key)` (Task 4). Task 12 uses both `L(currentLang, '…')` and `LABELS` import — match. ✓
- Quote field names (`vatPercent`, `validDays`, `lineItems`, `_passcodePlain`, etc.) match between data model (spec §3.1), creation (Task 8), saving (Task 9), verification (Task 10), and admin drawer (Task 16) — match. ✓
- Catalog item shape `{ key, name: { en, ar }, defaultPrice }` (Task 2) → consumed by `catalogToLineItem` (Task 2) and admin drawer dropdown (Task 16) — match. ✓

**Scope check:** This plan stays within v1 (one quote per submission, no revisioning, no catalog editing UI, no email delivery, no rate limiting) — matches spec §1 non-goals.

---

## Execution Handoff

Plan complete and saved to [docs/superpowers/plans/2026-05-19-quotation-generator-plan.md](docs/superpowers/plans/2026-05-19-quotation-generator-plan.md). Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Good when you want to step away and review at checkpoints.

**2. Inline Execution** — I execute tasks in this session using executing-plans, batch execution with checkpoints for your review. Good when you want to watch each step happen and can answer questions as they come up.

Which approach?
