# Codex Prompt — Phase 1: Spec-based estimator (SHIP NOW)

> The reliable core to put in front of a client this week. No voice yet. Builds on the shipped
> engine (`app/lib/pricing/`, v2 + v2.1 Sharjah). Read `docs/PRICING_BRAIN_SPEC.md` first. Keep
> every engine guarantee; `npm run test:pricing` must exit 0. Commit in layers (1→3). Paste
> everything between the rules into Codex.

---

## GOAL

Kill the package/tier complexity. The estimator becomes **"pick the specs → get a price."** One
website base that *includes 5 pages*, then a flat list of capabilities you toggle. Friendly
Sharjah pricing, VAT off by default, a clean client-ready quote. Deterministic and tested.

## ABSOLUTE RULES (unchanged)

Integer fils + one rounding site; pure deterministic `price()`; schema validation; coverage
de-dup (no double charge); founding-discount cap; golden + property tests. Any number/structure
change ⇒ bump `PRICING_VERSION='2026-06-14'` and regenerate `scripts/pricing-golden.json`. AI is
NOT part of this phase — every price comes from `price(selection)`.

## PART 1 — Engine (`app/lib/pricing/src/{catalog,config,engine,schema}.ts`)

1. **One website base that includes pages** (replaces the Starter/Essential/Pro/Premium ladder in
   the UI; you may keep the old foundations in the catalog for back-compat):
   ```
   id:'web-base', name:{en:'Website', ar:'موقع إلكتروني'}, base:3650, includedStandardPages:5,
   includes:['Custom responsive design','Up to 5 pages','Contact + WhatsApp','Google Business
   Profile','Analytics','Hosting & domain setup'], basis:'positioning'
   ```
   Bill standard pages only beyond the included 5: `max(0, pagesStandard - includedStandardPages)
   × 250`. Landing pages stay 450 each. Show the pages line only when overage > 0
   ("Extra pages × N · 5 included"). (At 0.70 Sharjah this base ≈ AED 2,550 incl. 5 pages — the
   number clients already see, minus the confusing separate page charge.) Old tier extras become
   specs (CRM, AR/EN `extra-language`, dashboard, blog).

2. **Value floor instead of cost-margin floor** (your cost is ~0 with AI + Vercel, so a cost floor
   does nothing useful or wrongly inflates price):
   ```
   MIN_REALIZATION = 0.55                  // never sell below 55% of the Dubai-anchored list value
   operativeFloor = max(roundFils(listPrice * MIN_REALIZATION), costFloor)   // cost≈0 ⇒ value wins
   ```
   Bounds total discounting (Sharjah 0.70 + founding 15% = 59.5% realized > 55% ✓; deeper stacking
   capped + flagged). Margin % becomes internal/informational.

3. Keep posture/tier glide path (`launch`→Sharjah 0.70, `standard`→Dubai later, per-emirate) and
   VAT default-off in the estimator. Tests: web-base+5 pages = 0 overage; +7 = 2×250; value floor
   caps a 50% discount; existing invariants/goldens green.

## PART 2 — Spec-based UI (`admin.js`, Pricing tab)

1. **Remove** the 4 website tier cards and the "3 · Customize / what are you building" archetype
   cards. Goal cards become an optional "quick start", not required.
2. **Website toggle** (on by default) → `web-base` (incl. 5 pages) + a stepper
   "Pages (5 included · AED 250 extra)".
3. **One flat "What do you need?" list** — each a toggle with its launch price + scope level
   (low/mid/high) where relevant: Online booking, Online store, Online ordering, CRM, AI chatbot,
   Analytics dashboard, Loyalty, Reviews, Staff/roles, Documents, SEO, Arabic+English, Maps,
   Online payments. **Each capability appears in exactly one place.**
4. **Coverage clarity:** when one selection already includes another, show the second as
   "✓ included" (engine coverage computes this) — never a second price.
5. **Optional industry quick-start** (Clinic/Restaurant/Salon/Retail/Services/Education)
   pre-toggles a sensible set via `INDUSTRY_PRESETS` — convenience, never required.
6. **Summary** keeps the friendly format and must reconcile (Σ lines − "Sharjah launch saving" =
   One-time build — the saving line already exists, keep it): hero "From AED X once + AED Y/mo",
   market→launch anchor, VAT toggle off, monthly Care Basic, internal strip (margin/floor/approval)
   visible only in admin.

## PART 3 — Client-ready quote

Three-line quote: (a) one-time build, (b) third-party software at cost, (c) small monthly care;
market→launch anchor; VAT off unless toggled; reconciling lines; internal numbers (margin, cost,
floor, approval) NEVER shown to the client. Create Quote keeps the existing passcode + quote-number
flow and persists audit fields (inputHash, version, listPrice, net, discountApplied, approval,
flags). Shareable passcode link + printable view. Plain warm language, AR/EN.

## ACCEPTANCE

1. `npm run test:pricing` exits 0; goldens regenerated; determinism/floor intact.
2. No tier ladder, no archetype cards; one base (incl. 5 pages) + flat spec list; each capability
   pickable once; coverage shows "included" not a second charge.
3. Website + 5 pages = one line ≈ AED 2,550 (Sharjah); a 6th page adds AED 250.
4. Summary always reconciles (Σ lines − saving = One-time build); VAT off by default.
5. Client quote is clean/friendly with internal numbers hidden; Create Quote + shareable link work.
6. One feature, layered commits; `PRICING_VERSION='2026-06-14'`.

> Tunables stay one-place in `config.ts`: `sharjah.factor`, `web-base.base`,
> `includedStandardPages`, `MIN_REALIZATION`, `care-basic.monthly`.
