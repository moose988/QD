# QD Systems — Pricing Brain Specification (v2)

**Status:** Design authority. This document is the *brain*. `app/lib/pricing/` is the
*implementation* of this brain. The Codex build prompt (`docs/CODEX_PROMPT_pricing-engine.md`)
turns this spec into code. If code and this spec disagree, this spec wins until the spec is
deliberately changed.

**Author intent:** A pricing engine so accurate, traceable, and self-checking that a wrong
price is *structurally impossible* — not merely unlikely. Every number is either traceable to a
public source, derived arithmetically from a sourced anchor, or an explicitly-labelled QD
positioning decision. The engine never guesses, never silently sells below cost, never
double-charges, and can always explain itself line by line.

**Business context (load-bearing):**
- QD Systems is a **startup** in **customer-acquisition mode** → entry prices must feel
  *friendly* and winnable, and the engine must support disciplined, *bounded* discounting.
- QD is **based in Sharjah (SHJ)**, not Dubai → the home market tier sits *below* Dubai agency
  rates. The engine models emirate market tiers explicitly.
- The danger of "friendly + startup + discounting" is **selling below profitability**. The
  single most important guarantee in this spec is the **cost floor**: the engine will *cap any
  discount* before it ever breaches a minimum gross margin, and flag it.

---

## 0. What changes vs. the current model

The current `app/lib/pricing-model.js` (v `2026-06-11`) is excellent and **stays the factual
core**: all anchors, sources, coverage logic, and invariants are preserved exactly. The brain
adds five capability layers on top, without breaking any existing export or number:

| # | New layer | Why it makes the model "advanced" |
|---|---|---|
| 1 | **Integer-money core (fils)** + centralized rounding | Eliminates floating-point error entirely. |
| 2 | **Cost model + margin floor** | Turns a positioning calculator into a true *pricing brain*: it knows the profit floor and protects it. |
| 3 | **Price waterfall** (list → adjustments → net → tax → pocket) | McKinsey pocket-price discipline; every deduction is a labelled, reconciling step. |
| 4 | **Posture + emirate market tiers + discount governance** | Encodes the Sharjah-startup strategy as bounded, auditable rules with approval thresholds. |
| 5 | **Determinism guarantees**: schema validation, frozen catalog, input hash, golden + property tests | Makes wrong output structurally testable and CI-gated. |

Backwards compatibility is a hard requirement: `buildEstimate`, `formatEstimateText`, all
catalog exports, and the existing `scripts/test-pricing.mjs` invariants must keep passing.

---

## 1. First principles (non-negotiable invariants)

These are the laws. The test suite exists to prove them. Breaking one is a bug, not a tradeoff.

1. **Determinism.** `price(input)` is a pure function. Same validated input → byte-identical
   output, always. No `Date.now()`, no randomness, no network, no global mutable state inside
   the pricing core. (Timestamps/IDs are injected by the caller and live only in quote metadata.)
2. **No floats.** All money is integer **fils** (1 AED = 100 fils). Arithmetic is integer.
   Rounding happens in exactly one function, `roundFils`, using **round-half-up**. Display
   rounding (to AED, or to the nearest 50 for rack prices) is a *presentation* step applied
   once, never fed back into math.
3. **Floor before everything.** Net build price (pre-VAT, post-discount) is **always** ≥ the
   cost floor. If any combination of adjustments would breach it, the engine **caps the
   discount** to the floor and emits a `floor_bound` flag. The engine *cannot* output a
   below-floor price.
4. **No double-charge.** A capability already included by a foundation, special build, package,
   or selected module is charged **0** ("included") or, for an upgrade, charged **only the
   difference**. True under every selection permutation.
5. **Traceability.** Every priced line carries a `basis` (`market` | `positioning` |
   `derived` | `cost`) and, where `market`, the public source `refs`. No number exists without
   a basis.
6. **The waterfall reconciles.** `list − Σ(adjustments) = net`; `net + vat = grandTotal`;
   `Σ(line.amount) = subtotal`. These identities are asserted in tests (accounting balance).
7. **Validation is total.** Every input is parsed by a schema. Invalid input yields a typed
   `PricingError`, never a silent default that could produce a wrong price.
8. **Versioned + hashed.** Every output carries `PRICING_VERSION` and a stable `inputHash`.
   Changing any catalog number requires bumping the version and updating golden snapshots.
9. **Pass-through is sacred.** Third-party software/usage (payments, WhatsApp, SMS, maps API,
   AI outcome fees) is **never** bundled into QD revenue and never marked up silently. It is a
   separate, at-cost, clearly-labelled output section. (Benchmark rule; sources R13/R16/R17/R19/R28.)
10. **Ranges are honest.** Every ranged item resolves to a named level (low/mid/high) with a
    concrete deliverable spec. A price is never shown as a naked range.

---

## 2. Money & arithmetic

```
type Fils = number & { __brand: 'Fils' }   // integer; 1 AED = 100 fils
AED(n)        → Fils      // 5900 → 590000 ; throws on non-finite
toAED(f)      → number    // display only
roundFils(x)  → Fils      // round-half-up to integer fils, the ONLY rounding site
pct(base, p)  → Fils      // roundFils(base * p / 100)  — percentages defined on an explicit base
displayAED(f, mode='exact'|'aed'|'rack50') → number
```

- Internal catalog numbers may be authored in AED for readability but are converted to fils at
  load and **frozen**.
- Percentage discounts/markups are always computed via `pct()` on a **single defined base**
  (the post-coverage, pre-VAT subtotal) so order-independence is provable.
- VAT = `pct(taxableSubtotal, vatPercent)`. Applied **after** discounts. Pass-through lines are
  not QD-taxable revenue and are excluded from `taxableSubtotal`.

**FX (pass-through only).** Software costs quoted by vendors in USD use the UAE peg
**AED 3.6725 / USD 1** (R-FX). EUR/GBP/INR use the indicative cross-rates from the benchmark
(EUR/AED ≈ 4.235, GBP/AED ≈ 4.918, INR/AED ≈ 0.03835), explicitly labelled *indicative*. FX is
used only to present pass-through costs at-cost; it never enters QD build pricing.

---

## 3. Data model (catalog — frozen, typed)

All current structures are preserved and extended with two fields: `cost` and (where relevant)
`taxable`. Authored in AED, frozen as fils at load.

### 3.1 Cost model (NEW — the floor's input)

Every billable component gains a `cost` descriptor:

```
cost: {
  hours:   { low: number, mid: number, high: number },  // delivery hours by scope tier
  direct:  Fils                                          // direct out-of-pocket (paid theme/app), default 0
}
componentCost(tier) = roundFils(hours[tier] * INTERNAL_RATE) + direct
```

**`INTERNAL_RATE`** = fully-loaded internal delivery cost per hour, **AED 80/hr default**
(Sharjah lean/founder-led team; well below Dubai *billing* rates of AED 200–550/hr per R31 —
this is COST, not price). **TUNE THIS** when real cost data arrives.

**Default hour table** (lean, modern, partly-AI-assisted productized delivery — *defaults,
flagged for tuning*; replace with QD's measured hours):

| Component | low | mid | high | Notes |
|---|---|---|---|---|
| Essential foundation | 16 | 18 | 22 | productized 5-page-class build |
| Professional foundation | 26 | 30 | 36 | |
| Premium foundation | 44 | 50 | 60 | bilingual + roles + mini-dashboard |
| Standard page | — | 1.5 | — | per page |
| Landing page | — | 4 | — | per page |
| Commerce Start build | 70 | 90 | 110 | |
| Commerce Growth build | 120 | 150 | 185 | |
| Ops Dashboard MVP | 120 | 150 | 190 | |
| AI Chatbot launch | 14 | 20 | 30 | |
| smart-form | 6 | 12 | 20 | |
| crm-setup | 10 | 18 | 28 | |
| booking-integration | 8 | 16 | 26 | |
| ordering-integration | 14 | 24 | 38 | |
| payment-gateway | — | 8 | — | fixed |
| reviews-integration | 4 | 8 | 12 | |
| loyalty-integration | 8 | 16 | 26 | |
| ai-chatbot-upgrade | 10 | 20 | 34 | |
| dashboard-pack | 12 | 22 | 36 | |
| roles-logic | 20 | 36 | 58 | |
| file-uploads | 6 | 12 | 20 | |
| extra-language | — | 12 | — | fixed |
| gbp-setup | — | 5 | — | fixed |
| map-embed | — | 5 | — | fixed |
| api-map | — | 18 | — | from |
| seo-pack | — | 12 | — | fixed |

**Sanity (mid tier, rate 80):** Essential 5-page offer cost ≈ 18h + 5×1.5h = 25.5h → AED 2,040
vs list 5,900 → **~65% gross margin**. Professional 10-page ≈ AED 3,600 vs 9,900 → **~64%**.
Premium 16-page ≈ AED 5,920 vs 14,900 → **~60%**. Healthy productized margins → the founding
discount (≤15%) never approaches the floor; the floor exists to catch *heavy custom discounts*
and *underpriced bespoke work*.

### 3.2 Preserved structures (unchanged numbers)
`PACKAGES`, `ADDONS` (with `levels`), `CARE_PLANS`, `INDUSTRY_PRESETS`, `FOUNDATIONS`
(+ derivations), `FOUNDATION_COVERS`, `PACKAGE_COVERS`, `SPECIAL_BUILDS`, `OFFER_TEMPLATES`,
`INDUSTRY_MODULES`, `SOURCES` (R01–R32), `UAE_MARKET_BANDS`, `FOUNDING_MAX_DISCOUNT_PERCENT=15`,
`PAGE_RATE_STANDARD=250`, `PAGE_RATE_LANDING=450`.

### 3.3 Market tiers (NEW — emirate positioning)

```
MARKET_TIERS = {
  sharjah:   { factor: 0.90, label: 'Sharjah / Northern Emirates (home market)' },  // default
  dubai:     { factor: 1.00, label: 'Dubai market rate' },
  abu-dhabi: { factor: 1.00, label: 'Abu Dhabi market rate' },
}
```
`factor` is a **positioning** multiplier on the build subtotal (not a market claim, not a
discount). Default tier = `sharjah`. Tunable. Applied as a labelled waterfall line, floor-bound
like any other reduction.

### 3.4 Posture (NEW — strategy mode)

```
POSTURE = {
  launch:   { tier:'sharjah', maxFoundingDiscount:15, attachCarePlan:true,  label:'Launch / land-clients' },  // default now
  standard: { tier:'dubai',   maxFoundingDiscount:10, attachCarePlan:false, label:'Standard' },
  premium:  { tier:'dubai',   maxFoundingDiscount:5,  premiumUplift:0.10,   label:'Premium' },
}
```
Posture only *selects governed defaults*; it cannot override the floor or the discount cap.

---

## 4. The pricing pipeline (ordered, each step labelled & reconciling)

`price(input) → PricingResult`. Stages run in this exact order:

1. **Parse & validate** (`PricingInputSchema`). On failure → `PricingError` with field paths.
   Normalize: clamp page counts (std ≤200, landing ≤50), dedupe addon ids (first wins),
   resolve posture → tier + governed caps.
2. **Resolve catalog** → normalized line set (foundation, pages, specials, package, modules,
   addons) with tiers and quantities.
3. **Coverage / bundling** → build `includedMap` (existing logic). Covered → 0; partial →
   upgrade diff. (Invariant #4.)
4. **List price** = Σ component list prices (the rack rate, pre-adjustment). Compute
   `subtotalLow/mid/high` ranges in parallel.
5. **Cost** = Σ `componentCost(tier)` over all *charged* lines (covered lines cost 0 to QD only
   if not delivered; included-but-delivered capabilities still cost — see §5). Produces
   `costFloorNet = roundFils(cost / (1 − MIN_GROSS_MARGIN))`.
6. **Waterfall adjustments** (each a labelled line with `reason`, applied on the defined base,
   in this order):
   a. **Market-tier positioning** (`× tier.factor`).
   b. **Risk / complexity multiplier** (optional input `riskPercent` 0–25, *increases* price for
      uncertain scope, integrations, tight timeline).
   c. **Bundle / volume discount** (optional, rule-driven).
   d. **Founding-client / acquisition discount** (explicit, capped by posture & hard cap 15%).
   e. **Promo** (optional, dated, capped).
7. **Floor enforcement.** Compute `netCandidate`. If `netCandidate < costFloorNet`: reduce the
   *discount* lines (in reverse order e→a) until `net = costFloorNet`; set `floorBound=true` and
   record the original vs capped discount. Net can never be below floor. (Invariant #3.)
8. **Governance.** Compute realized total discount %. Map to `approval`:
   `≤ posture.maxFoundingDiscount → auto`; `≤ 25 → manager`; `> 25 → owner`. Also `floorBound`,
   `belowMarketBand`, `belowValue` raise flags. The engine prices the deal *and reports what
   sign-off it needs* — it never blocks, it governs.
9. **Value ceiling check** (optional). If `clientValue` inputs given (expected annual ROI/uplift),
   warn if net ≪ value (leaving money on table). Informational only.
10. **Market-band check** (existing UAE bands R30–R32 + Sharjah-adjusted band) → `within/above/below`.
11. **Tax.** `taxableSubtotal` = net build (QD revenue). `vat = pct(taxableSubtotal, vatPercent)`.
    `grandTotal = taxableSubtotal + vat`. Pass-through summarized separately, untaxed as QD rev.
12. **Recurring** (care plan MRR + usage flag) + **pass-through** (FX-converted, at cost).
13. **Assemble `PricingResult`** with full trace, ranges, margins, flags, version, `inputHash`.

---

## 5. Cost accounting subtlety (must be exact)

A capability "included" in a foundation is **charged 0** to the client but may still **cost** QD
to deliver. Two cost concepts, both tracked:

- **Charged cost** — cost of lines that produce client-charged revenue. Used for the *margin %*
  shown on the quote.
- **Delivery cost** — cost of *everything actually built*, including included/covered
  capabilities. Used for the *floor* so heavy "everything included" discounting can't go below
  true delivery cost.

The **floor uses delivery cost**. The displayed margin uses charged revenue vs delivery cost
(the honest figure). This prevents the classic error of discounting a bundle to near-zero
because its "charged" lines looked cheap while the real build was expensive.

---

## 6. Output contract (`PricingResult`)

```
{
  version, inputHash, currency:'AED', vatPercent,
  posture, marketTier,

  // Money (all fils internally; helpers expose AED)
  listPrice,                       // rack, pre-adjustment
  waterfall: [ { step, label, reason, amount(±), basis } ],  // reconciles list→net
  net,                             // pre-VAT, post-discount, post-floor  (== taxableSubtotal)
  vat, grandTotal,
  subtotalLow, subtotalMid, subtotalHigh,   // scope range

  // Cost & margin (NEW)
  deliveryCost, chargedCost,
  marginAmount, marginPercent,     // (net − deliveryCost) / net
  costFloorNet, floorBound, floorDetail,

  // Lines (existing shape + cost fields)
  lines: [ { kind,id,label,labelAr,amount,unit,qty,tier,basis,refs,covered,upgraded,
             costFils, note } ],

  // Recurring + pass-through
  monthly: { planId, planName, amount, usage, softwarePassThrough },
  passThrough: [ { item, vendor, original:{amount,currency}, aed, refs, note } ],

  // Governance & checks
  discountPercentRequested, discountPercentApplied, discountCapped,
  approval: 'auto'|'manager'|'owner',
  flags: [ 'floor_bound'|'below_market_band'|'below_value'|'discount_capped'|... ],
  bandCheck, uaeCheck, valueCheck,

  openEnded
}
```

Plus `formatEstimateText(result)` (preserved, extended with margin/floor/approval lines for the
*internal* draft) and a **client-safe three-line view** (build fee / software at-cost / monthly
care) exactly as the benchmark recommends (PDF p.14).

---

## 7. Determinism, validation & audit

- **Schema**: `PricingInputSchema` (Zod). Parse at the boundary; the core consumes a typed,
  normalized `Selection`. Unknown fields rejected. Enumerations exhaustive.
- **Frozen catalog**: deep-`Object.freeze` (TS `as const`); any runtime mutation throws.
- **`inputHash`**: stable stringify (sorted keys) → SHA-256 of the normalized selection +
  `PRICING_VERSION`. Same input → same hash → reproducible quote. Persisted with every quote.
- **Audit record** (append-only; the quote APIs persist it): `{ quoteId, ts, actor, inputHash,
  version, listPrice, net, vat, grandTotal, deliveryCost, marginPercent, discountApplied,
  approval, flags, waterfall }`. This is the source of truth for "why was this price given."
- **No I/O in core.** APIs/admin pass data in and persist the result out.

---

## 8. Test strategy (this is how "no mistakes" is proven)

Three tiers, all gated in CI via `npm run test:pricing` (must exit 0 before deploy):

**A. Invariant unit tests** (extend existing `scripts/test-pricing.mjs`):
- All current invariants (anchors reproduce, ranges have 3 levels, modules lean, no
  double-charge, discount cap, VAT-after-discount, UAE bands, brief parser, quote bridge).
- NEW: floor never breached; waterfall reconciles (`list−Σadj==net`, `net+vat==grand`);
  pass-through never in `taxableSubtotal`; margin computed on delivery cost; approval thresholds
  map correctly; market-tier factor applied once; posture selects governed defaults.

**B. Property-based tests** (`fast-check`): generate thousands of random valid selections and
assert the laws hold for *all* of them:
- `net ≥ costFloorNet` always (Invariant #3).
- `Σ line.amount == subtotal`; waterfall balances (Invariant #6).
- Monotonic-ish: adding a *new, uncovered* charged component never *decreases* `net`.
- Idempotence: `price(x)` deep-equals `price(x)` and equal `inputHash`.
- No float ever appears (all money `Number.isInteger`).
- Coverage permutation-invariant: shuffling addon/module order yields identical totals.
- Discount cap: realized discount ≤ governed cap; never below floor.

**C. Golden snapshot tests**: lock exact byte output for canonical quotes — the 5
`OFFER_TEMPLATES`, the 5 `INDUSTRY_PRESETS`, and ~10 hand-picked edge scenarios (max discount,
floor-binding custom build, full bundle with overlap, Sharjah vs Dubai tier, pass-through-heavy
chatbot). Any change to a number fails the snapshot → forces an intentional version bump.

A red test = the *change* is wrong, never the test (unless the owner deliberately changed pricing
and updated version + goldens).

---

## 9. Migration & compatibility

- New code lives in `app/lib/pricing/` (TypeScript source) compiled to committed ESM JS so
  runtime needs **no build step** (Vercel/browser import the `.js` directly). TS + tests are the
  source of truth, CI-checked.
- `app/lib/pricing-model.js` becomes a **thin facade** re-exporting the compiled engine, so
  every current importer (`brief-parser.js`, `quote-catalog.js`, `quote-prefill.js`, `admin.js`,
  `api/quote-from-estimate.js`, `scripts/test-pricing.mjs`) keeps working unchanged.
- `buildEstimate(selection)` is preserved as a compatibility wrapper over the new `price()`
  (same return shape + the new fields appended). Existing invariants keep passing — proof of
  non-regression.

---

## 10. Tuning surface (one place to change the business)

A single `config` block at the top of the engine holds everything QD will realistically tune:
`INTERNAL_RATE`, the hours table, `MIN_GROSS_MARGIN` (default 0.30), `FLOOR_HARD_MIN` (default
0.20), `MARKET_TIERS`, `POSTURE`, `FOUNDING_MAX_DISCOUNT_PERCENT`, approval thresholds, VAT,
FX rates. Changing a value here + bumping `PRICING_VERSION` + updating goldens is the *entire*
workflow to re-price the business. Nothing else needs editing.

> **Pending QD inputs** (replace the flagged defaults): real internal cost/hour, measured hours
> per build tier, target & hard-floor margins, and whether Sharjah factor should be 0.90 or
> tuned per service line. Until provided, the research-backed defaults above are used and
> labelled as such in output (`basis:'cost'`, `assumption:true`).
