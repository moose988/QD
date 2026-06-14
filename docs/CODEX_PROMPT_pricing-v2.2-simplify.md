# Codex Change Prompt — Pricing v2.2 (Kill packages → spec-based estimator)

> Builds on v2.1. Goal: remove the package/tier complexity and make the estimator a simple
> **"pick the specs → get a price"** tool. Keep every engine guarantee (integer fils, floor,
> determinism, `npm run test:pricing` green). Read `docs/PRICING_BRAIN_SPEC.md` first.
> Paste everything between the rules into Codex.

---

## WHY (owner feedback, verbatim intent)

1. "I don't want packages — I want to put the specs and get a price. The packages complicate things."
2. "Why charge Starter + pages? The base should include ~5 pages, not bill them on top."

So: **one base website that already includes 5 pages, then a flat list of specs you toggle.**
No Starter/Essential/Professional/Premium ladder. No "what are you building" archetype cards.
No goal cards required. Price = base (if website selected) + extra pages beyond the included 5
+ each selected spec. The summary must reconcile (lines − saving = one-time build) — that
reconciliation line was just added in `admin.js` (`launchSaving`), keep it.

## ABSOLUTE RULES (unchanged)

- Integer fils, one rounding site, determinism, cost-floor intact. `npm run test:pricing` exits 0.
- Do not rewrite verified anchors; lower prices still come from the Sharjah tier factor (0.70).
- Any number/structure change ⇒ bump `PRICING_VERSION` (→ `'2026-06-14'`) and regenerate goldens.

## PART A — Engine: a single base that includes pages

In `app/lib/pricing/src/catalog.ts` + `engine.ts`:

1. **Introduce one website base** the estimator will use, replacing the 4-tier ladder *in the UI*
   (you may keep the other foundations in the catalog for back-compat, but the estimator uses only
   this one):
   ```
   id: 'web-base', name:{en:'Website', ar:'موقع إلكتروني'}, base: 3650, includedStandardPages: 5,
   includes:['Custom responsive design','Up to 5 pages','Contact form + WhatsApp',
             'Google Business Profile','Analytics','Hosting & domain setup'], basis:'positioning'
   ```
   (AED 3,650 market = the old Starter 2,400 + 5×250, so at the 0.70 Sharjah factor it shows
   **≈ AED 2,550 including 5 pages** — same number clients already see, just no separate page line.)

2. **Page charging respects included pages.** In `engine.ts` where standard pages are billed,
   charge only the overage:
   ```
   const billablePages = Math.max(0, pagesStandard - (base?.includedStandardPages ?? 0));
   // line amount = billablePages * PAGE_RATE_STANDARD
   ```
   Landing pages stay billed per page (AED 450). Show the pages line only when `billablePages > 0`,
   labelled e.g. "Extra pages × N (5 included)".

3. **Quality extras that were baked into the old tiers become optional specs** (reuse existing
   catalog items so nothing is invented): Blog/news → keep as part of base OR add a simple
   `blog-news` addon if you want it itemized; CRM handoff → `crm-setup`; Arabic+English →
   `extra-language`; Mini-dashboard → `dashboard-pack`. Do NOT recreate tiers.

4. Bump `PRICING_VERSION='2026-06-14'`; regenerate `scripts/pricing-golden.json`; keep all
   invariant + property tests green (add a test: `web-base` + 5 pages charges 0 page overage;
   + 7 pages charges exactly 2×250).

## PART B — UI: spec-based estimator (`admin.js`)

Replace the 3-step tier/archetype flow with a clean spec picker:

1. **Remove** the website tier cards (Starter/Essential/Professional/Premium) and the
   "3 · Customize / what are you building" archetype cards (`PRICING_PRODUCTS`). Remove or
   demote the goal cards (`PRICING_GOALS`) to an optional "quick start" — not required.
2. **New single flow:**
   - A **"Website"** toggle (on by default) → adds `web-base` (includes 5 pages). A stepper
     "Pages (5 included · AED 250 each extra)".
   - A **flat "What do you need?" spec list** — each item a toggle with a price, scope level
     where relevant (low/mid/high): Online booking, Online store, Online ordering, Customer
     management (CRM), AI chatbot, Analytics dashboard, Loyalty, Reviews, Staff/roles,
     Documents & approvals, SEO, Arabic + English, Maps, Online payments.
   - Each spec shows its launch price; selecting it adds the matching addon/module. Overlapping
     capabilities still de-dupe via the engine coverage (show "included" when covered) — so the
     double-charge confusion is gone because there's now only ONE place to pick each capability.
   - Keep business-type as an optional one-tap "suggest a starting set" (pre-toggles sensible
     specs) — never required.
3. **Summary stays as-is** (hero "From AED X once + AED Y/mo", market→launch anchor, reconciling
   lines incl. the `launchSaving` line, VAT toggle off by default, monthly Care Basic, internal
   strip). Just make sure the line items reflect the new single base + specs and still reconcile.

## ACCEPTANCE

1. `npm run test:pricing` exits 0; goldens regenerated; floor/determinism intact.
2. No tier ladder and no archetype cards anywhere in the estimator.
3. Selecting **Website** shows one line "Website (includes 5 pages) — AED 2,550" (Sharjah); adding
   a 6th page adds AED 250; the first 5 add nothing.
4. Every capability is pickable in exactly one place; the summary always reconciles
   (Σ line items − Sharjah launch saving = One-time build).
5. A plain 5-page website quote reads: From AED 2,550 once + AED 149/mo, VAT off by default.
6. One commit; `PRICING_VERSION='2026-06-14'`.

> Owner tunables remain one-place in `config.ts`: `sharjah.factor`, `web-base.base`,
> `includedStandardPages`, `care-basic.monthly`.
