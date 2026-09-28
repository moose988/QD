# Quotation Generator — Design Spec

**Status:** Draft, pending user review
**Date:** 2026-05-19
**Owner:** Mohammed Qudaih
**Context:** QD Systems admin needs to generate per-submission quotations that get shared with clients as private web links. Built on top of the existing admin SPA (`admin.js`) and Firebase/Firestore stack already used by the chatbot work.

---

## 1. Problem & goal

Today, after a prospective client submits an intake form (`projectSubmissions`), the QD team contacts them manually and quotes prices ad hoc. There's no consistent quotation document, no record of what was quoted, and re-quoting requires re-typing everything.

**Goal:** From each submission in the admin page, generate a clean quotation in under 60 seconds and share it as a private link.

**Non-goals (v1):**
- Quote revisions / versioning (one freely editable quote per submission)
- Lock-after-send / immutable quotes
- USD currency or other-currency support
- Email or SMS delivery (admin shares the link via WhatsApp)
- Rate limiting / lockout on passcode entry
- Client-facing accept/reject buttons or quote analytics
- Catalog management UI (catalog is a JS file for v1; admin edits it directly)

---

## 2. Decisions log

Every load-bearing choice we made during brainstorming, captured here so the next person (or future-Mohammed) doesn't have to ask why:

| # | Decision | Why |
|---|----------|-----|
| Q1 | **Output is a shareable web link**, not a PDF. URL pattern `/q/<id>`. | Links are dynamic: admin can edit anytime, change reflects without re-sending. Client can print-to-PDF themselves if they want one. |
| Q2 | **Line items pre-fill from the submission**, with a preset catalog + custom-line additions on top. | The submission already contains needed pages, required features, optional services. Re-typing them is the friction we're removing. |
| Q3 | **EN/AR toggle on the quote page** (single page, two language renderings). | Both QD's clients and the rest of the site are bilingual. Toggle > forced single language at gen time. Cost: catalog and team-entered text need bilingual fields. |
| Q4 | **One freely editable quote per submission.** No lock-after-send. | User explicitly chose simplicity over the safety of an immutable "sent" state. Edits go live on the shared link. |
| Q5 | **AED + 5% VAT itemized.** VAT % editable per quote. | UAE B2B standard. QD is VAT-registered context. |
| Q6 | **Anyone with link + 6-digit passcode.** | Adds privacy beyond "long random ID alone." Friction is one screen the client sees once. |
| Q7 | **Classic invoice-style layout.** Logo top-left, quote number top-right, services table, totals box, pages list, terms. | Familiar to clients used to formal quotes. Dense, single-screen scan. |
| Q8 | **Slide-over drawer** for the editor inside the submission detail. | Keeps submission data visible behind the drawer for cross-reference while quoting. Lighter touch on `admin.js` than a separate route. |

---

## 3. Architecture

### 3.1 Data model — `quotes/{quoteId}` (new Firestore collection)

```js
{
  quoteNumber:  "Q-2026-001",          // sequential, human-readable
  submissionId: "abc123…",             // FK to projectSubmissions
  status:       "draft" | "active",    // admin badge only — never enforced for editing
  language:     "en" | "ar",           // initial render lang on the public page; defaults to "en"
                                       //   unless submission.pageLang === "ar" or
                                       //   businessName contains Arabic script

  validDays:    30,                    // default 30; integer
  vatPercent:   5,                     // default 5; number
  customer: {
    businessName: string,              // snapshotted from submission at create, editable
    email: string,
    phone: string,
  },
  lineItems: [
    {
      catalogKey: "site-5p" | null,    // present if added from catalog
      name:        { en: string, ar: string },
      description: { en: string, ar: string },   // optional sub-line under the name
      qty: number,
      unitPrice: number,               // AED, VAT-exclusive
    },
    // …
  ],
  pages:  { en: string, ar: string },  // free-text "pages included" line; default from submission.neededPages
  terms:  { en: string, ar: string },  // editable per quote; default from settings
  notes:  { en: string, ar: string },  // optional intro paragraph above totals

  passcodeHash:    string,             // sha256(salt + plainPasscode)
  _passcodePlain:  string,             // PLAINTEXT — needed so admin can re-retrieve later;
                                       //   Firestore rules deny client read of `quotes/*`,
                                       //   only Admin SDK in our API can access.
  createdAt:   FieldValue.serverTimestamp(),
  updatedAt:   FieldValue.serverTimestamp(),
  lastSentAt:  Timestamp | null,       // set on first "Save + Copy link"
}
```

**Counter doc — `quotes_meta/counter`:**
```js
{ year: 2026, nextNumber: 1 }
```
Read+incremented in a Firestore transaction by `quote-create`. Year change auto-resets the counter (e.g., on 2027-01-01 we transition `{year:2027, nextNumber:1}`).

**Firestore security rules** (add to existing rules file):
```
match /quotes/{document} {
  allow read, write: if false;    // admin SDK only
}
match /quotes_meta/{document} {
  allow read, write: if false;    // admin SDK only
}
```

### 3.2 URL routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/q/:id` | GET (static) | none | Vercel rewrite `/q/(.*) → /q/index.html`. Client-side JS reads ID from `location.pathname`. |
| `/api/quote-verify` | POST | passcode | Body `{ id, passcode }`. Server hashes input + project salt, compares to `passcodeHash`. Returns sanitized quote or 401. |
| `/api/quote-create` | POST | admin (Firebase Auth ID token in `Authorization: Bearer …`) | Body `{ submissionId }`. Reads submission, runs pre-fill mapping, generates passcode + quote number in a transaction, returns the created quote (incl. plaintext passcode). |
| `/api/quote-save` | PATCH | admin | Body `{ id, updates }`. Saves edits, bumps `updatedAt`. |

All four `/api/*` routes live as Vercel serverless functions next to the chatbot's `api/chat.js`.

### 3.3 Catalog source — `app/lib/quote-catalog.js`

Hardcoded JS module exporting an array. Edited directly in source (committed). Future migration path: move to Firestore + a `/admin/catalog` settings page; data shape stays the same.

```js
export const CATALOG = [
  { key: 'site-5p',         name: { en: '5-page responsive website',         ar: 'موقع متجاوب ٥ صفحات' },              defaultPrice: 3500 },
  { key: 'site-10p',        name: { en: '10-page responsive website',        ar: 'موقع متجاوب ١٠ صفحات' },             defaultPrice: 5500 },
  { key: 'logo-design',     name: { en: 'Logo design (3 concepts, 2 revs)',  ar: 'تصميم شعار (٣ مفاهيم، مراجعتان)' }, defaultPrice: 1200 },
  { key: 'online-ordering', name: { en: 'Online ordering integration',       ar: 'تكامل الطلب الإلكتروني' },            defaultPrice: 2000 },
  { key: 'multilang',       name: { en: 'Multi-language support (EN+AR)',    ar: 'دعم متعدد اللغات (إنجليزي+عربي)' },  defaultPrice: 1500 },
  { key: 'seo-foundation',  name: { en: 'SEO foundation',                    ar: 'تأسيس سيو' },                         defaultPrice: 800  },
  { key: 'maintenance-3m',  name: { en: '3-month maintenance',               ar: 'صيانة ٣ أشهر' },                      defaultPrice: 1500 },
  // Mohammed: prune / extend before launch
];
```

### 3.4 Pre-fill mapping (submission → quote)

When `quote-create` runs, it walks the submission and emits line items:

| Submission field | → | Mapping |
|---|---|---|
| `neededPages` (count) | → | catalog `site-Np` (snap to nearest: 5, 10). One line item, qty 1, unit = catalog default. |
| `selectedRequiredFeatures.online_ordering` truthy | → | catalog `online-ordering` |
| `selectedRequiredFeatures.multi_language` truthy | → | catalog `multilang` |
| `selectedRequiredFeatures.seo` truthy | → | catalog `seo-foundation` |
| `selectedOptionalServices.maintenance` truthy | → | catalog `maintenance-3m` |
| `hasLogo === false` OR submission mentions logo | → | catalog `logo-design` |
| `businessName / Email / Phone` | → | `customer.*` (snapshot) |
| `neededPages` raw text | → | `pages.en`; AR field left blank (admin fills) |

Anything without a catalog match → not pre-filled. Admin uses `+ Add custom line` if needed. Every pre-filled row is removable.

The mapping function lives in `app/lib/quote-prefill.js` and takes a submission doc, returns a `{ customer, lineItems, pages }` object.

---

## 4. Admin flow

### 4.1 Button placement

In the submission detail header (next to existing WhatsApp / Email / Call buttons in `admin.js`). Three visual states:

| Submission state | Button label | Action |
|---|---|---|
| No quote yet | `+ Generate Quotation` (primary, blue) | `POST /api/quote-create` → opens drawer with the returned quote |
| Has draft | `✎ Edit Quote · Q-2026-NNN` (secondary) | Opens drawer for existing draft |
| Has active | `📋 View Quote · Q-2026-NNN` + green dot | Opens drawer for active quote (still editable) |

State derivation: a single lookup on `quotes` collection keyed by `submissionId` (one quote per submission). Admin SPA fetches `quotesBySubmission` map on load alongside `submissions`.

### 4.2 Drawer contents

Layout per mockup A (file `04-admin-editor-ux.html` in the brainstorm session):

- **Customer block** — auto-filled from submission, fields editable
- **Line items table** — columns: name (EN inline, AR small below), qty, unit, total, ×. Custom-edit name fields toggle to show AR input on click.
- **`+ Add from catalog…`** select (catalog keys + names) and **`+ Custom line`** button
- **Pages included** — input (EN); AR pages input is collapsed by default, expandable
- **Meta strip** — `Valid [30] days · Passcode [847291] · VAT [5] %`
- **Terms** — collapsible; collapsed by default with sane defaults; click to expand and edit (EN + AR side-by-side)
- **Totals box** — auto-computed; recomputes on any field change
- **Actions** (sticky bottom) — `Save draft` / `Save + Copy link`

### 4.3 Save behavior

| Action | Persists | Status change | Side effects |
|---|---|---|---|
| Close drawer (no click) | Yes (auto-save) | none | Toast: "Draft saved" |
| Save draft | Yes | none | Toast: "Saved" |
| Save + Copy link | Yes | `draft → active` (or stays `active`) | Set `lastSentAt = now`. Copy to clipboard: `Your quotation from QD Systems:\n<url>\nPasscode: <code>`. Toast: "Link copied — paste into WhatsApp." |

---

## 5. Public quote page

### 5.1 File structure

- `q/index.html` — single static file. References `q/quote.js` and `q/quote.css`.
- `q/quote.js` — reads `location.pathname` for the ID, manages passcode gate state, fetches via `/api/quote-verify`, renders.
- `q/quote.css` — quote-page-specific styles + `@media print` block.
- `vercel.json` — add rewrite: `{ "source": "/q/(.*)", "destination": "/q/index.html" }`.

No client-side Firebase SDK loaded on this page. All data comes from one API call.

### 5.2 Flow

```
Load /q/abc123def456
   │
   ▼
[Passcode gate]
   │  POST /api/quote-verify { id, passcode }
   ▼
{ 200 → quote JSON }            { 401 → wrong code, shake input }
   │                               { 404 → "Quote not found" }
   ▼
[Render quote in chosen lang]
   │
   ├── EN/AR toggle (top-right) → flip layout dir, swap text from name.en/.ar
   └── 🖨 Print link (footer) → triggers window.print()
```

### 5.3 Verify API response shape (sanitized)

What the client receives — note what's NOT in here:

```js
{
  quoteNumber, status, language, validDays, vatPercent,
  customer, lineItems, pages, terms, notes,
  createdAt, lastSentAt,
  brandName: "QD Systems",           // for the heading
  brandPhone: "+971 50 461 1123",    // for the footer
}
```

**Stripped before send:** `_passcodePlain`, `passcodeHash`, `submissionId`, any field starting with `_`. Stripping happens in `quote-verify` after the passcode check passes.

### 5.4 Bilingual rendering

- Layout flips `<html dir="rtl">` when AR is active.
- Static labels (Subtotal, VAT, Total, Valid, Pages You'll Get, Prepared For, etc.) come from a hardcoded dictionary in `q/quote.js`.
- User content uses `name[lang]` / `terms[lang]` / `pages[lang]`. If a string is empty in the active language, falls back to the other language with a small `[EN]` / `[AR]` tag prefix.
- Toggle preference persists via `localStorage.quoteLang`.

### 5.5 Print-to-PDF

`@media print { .lang-toggle, .passcode-gate, .print-link { display: none; } @page { size: A4; margin: 18mm; } body { background: white; } }` — that's the whole footprint. Clean A4 PDF via browser's native print dialog. No PDF library dependency.

### 5.6 Error states

| State | UI |
|---|---|
| Quote ID not found (404 from API) | Centered card: "Quote not found. Double-check the link you received, or WhatsApp +971 50 461 1123." |
| Wrong passcode (401) | Input shakes (CSS animation), toast: "Incorrect passcode" |
| Network error | Toast: "Connection problem — try again" with retry button |
| Passcode entered, server returns OK but JSON malformed | Generic error toast + reload prompt (defensive only — not expected) |

---

## 6. Security model

| Asset | Protection |
|---|---|
| `quotes/*` reads/writes | Firestore rules `if false`. Only Admin SDK in our API functions can access. |
| Admin API endpoints (`quote-create`, `quote-save`) | Require Firebase Auth ID token verified server-side via `admin.auth().verifyIdToken()`. Same pattern as your existing admin endpoints. |
| Public API (`quote-verify`) | Open to anyone; passcode is the gate. |
| Passcode | 6-digit numeric, SHA-256 + project-wide salt (env var `QUOTE_PASSCODE_SALT`). Plaintext stored in `_passcodePlain` field — Firestore rules deny public read; only admin SDK can re-retrieve. |
| Quote IDs | Generated by `crypto.randomUUID()` then truncated to 16 chars hex (~10^19 possibilities — effectively unguessable for a quote system at QD's scale). |

**Acknowledged tradeoff:** storing plaintext passcode in `_passcodePlain` defeats half the benefit of hashing. The win is admin UX (can reopen a quote and re-share the passcode without resetting it for the client). Mitigation: Firestore rules block public read entirely; only our admin-only API can read it. If the admin's Firebase auth is compromised, every quote's passcode is also compromised — but at that point the attacker has all of `projectSubmissions` anyway. Net: acceptable for v1.

---

## 7. Testing strategy

Manual smoke test before going live (run through once after implementation):

1. **Create from real submission** — pick an existing `projectSubmissions` doc, click `+ Generate Quotation`. Verify pre-filled lineItems match the submission's selectedRequiredFeatures / neededPages.
2. **Save + Copy link** — confirm clipboard contains URL + passcode in the documented format. Confirm `lastSentAt` is set and status flipped to `active`.
3. **Open in incognito** — paste link, enter passcode, verify quote renders correctly in EN.
4. **Toggle to AR** — verify layout flips RTL, AR strings render, totals box still right-aligned correctly.
5. **Edit in admin → reload public** — confirm the change is visible (proves the "link is dynamic" promise).
6. **Wrong passcode** — confirm 401 + shake animation, no leak of correct code or hash.
7. **Print to PDF** — confirm passcode gate and language toggle are hidden in the print preview.
8. **Generate second quote in same year** — confirm number is `Q-2026-002`.
9. **Reopen first quote from admin** — confirm passcode field shows the same plaintext code (not regenerated).
10. **Quote with no catalog matches** — submit a sparse intake form, generate quote, confirm empty line items table + ability to `+ Add custom line` works.

No automated tests in v1 (matches the rest of the codebase — no test runner is set up). If we add Playwright later, port these as e2e tests.

---

## 8. Files to be created / modified

**New files:**
- `q/index.html` — public quote page shell
- `q/quote.js` — public quote page logic
- `q/quote.css` — public quote page styles (incl. print rules)
- `api/quote-create.js` — admin: create from submission
- `api/quote-save.js` — admin: save edits
- `api/quote-verify.js` — public: passcode check + return sanitized quote
- `api/_lib/quote-id.js` — ID + passcode generation helpers
- `api/_lib/quote-counter.js` — transactional sequential number issuer
- `app/lib/quote-catalog.js` — catalog data
- `app/lib/quote-prefill.js` — submission → quote pre-fill mapping
- `docs/superpowers/specs/2026-05-19-quotation-generator-design.md` — this doc

**Modified files:**
- `admin.js` — add `quotes` state slice, button in submission detail, slide-over drawer component
- `admin.css` — drawer + line-item table styles
- `vercel.json` — add `/q/(.*)` rewrite; set `maxDuration: 10` on the three quote API functions (they don't need the 30s the chatbot uses — no model load, no streaming)
- Firestore rules (paste into Firebase Console) — add `quotes` and `quotes_meta` deny-all rules
- `.env.local` and Vercel env vars — add `QUOTE_PASSCODE_SALT`

**No changes to:** the chatbot work (`api/chat.js`, `chatbot/*`, `knowledge/*`, `scripts/build-kb.mjs`), the public marketing site (`index.html`, `contact.html`).

---

## 9. Open questions for review

None — every decision was settled during brainstorming. If anything in this spec contradicts what you remember from our discussion, flag it.

---

## 10. Next step

After you sign off on this spec, I invoke `writing-plans` to produce a step-by-step implementation plan: file-by-file order, what to build first, what to defer, where the integration test points are.
