# Codex Implementation Prompt — QD Systems Pricing Brain v2

> Paste everything inside the horizontal rules into Codex as the task. It is self-contained.
> The companion design spec is `docs/PRICING_BRAIN_SPEC.md` (read it first). Do not invent
> prices, sources, or numbers — every value comes from the existing model or from this prompt.

---

## ROLE & MISSION

You are implementing the **QD Systems Pricing Brain v2**: an advanced, deterministic,
self-verifying pricing engine for a UAE (Sharjah-based) web & digital-systems agency. The goal
is that **a wrong price is structurally impossible** — guaranteed by integer-money arithmetic,
schema validation, a hard cost-floor, an auditable price waterfall, and an exhaustive test suite
(unit + property-based + golden snapshots) gated in CI.

This is an **evolution, not a rewrite**. The current model in `app/lib/pricing-model.js`
(version `2026-06-11`) is correct and stays the factual core. You ADD five layers (money core,
cost+floor, waterfall, posture/tiers/governance, determinism+tests) **without breaking any
existing export, number, or consumer**.

## ABSOLUTE RULES (do not violate)

1. **Backwards compatibility is mandatory.** These consumers must keep working unchanged:
   `app/lib/brief-parser.js`, `app/lib/quote-catalog.js`, `app/lib/quote-prefill.js`,
   `app/lib/estimate-quote.js`, `app/lib/quote-totals.js`, `admin.js`,
   `api/quote-from-estimate.js`, `scripts/test-pricing.mjs`. Every existing invariant test must
   still pass. `buildEstimate()` and `formatEstimateText()` keep their current signatures and
   return shapes (you may APPEND new fields, never remove or rename existing ones).
2. **No floats for money.** All monetary math is integer **fils** (1 AED = 100 fils). Exactly one
   rounding function (`roundFils`, round-half-up). Floating point may appear only in `hours`
   inputs and the display layer.
3. **Determinism.** The pricing core is pure: no `Date.now()`, no `Math.random()`, no network,
   no mutable module-level state. Caller injects timestamps/ids. Same input → byte-identical
   output and identical `inputHash`.
4. **Floor is absolute.** Net build price (pre-VAT, post-discount) is ALWAYS ≥ cost floor. If
   adjustments would breach it, cap the discount and set `floorBound=true`. Never emit a
   below-floor price.
5. **No invented data.** Reuse existing anchors/sources/coverage verbatim. New numbers
   (`INTERNAL_RATE`, hours table, margins, tiers) come ONLY from this prompt / the spec, and are
   tagged as tunable assumptions (`basis:'cost'`, `assumption:true`).
6. **Every priced line has a `basis`** ∈ `market|positioning|derived|cost` (+ `refs` when market).
7. **Pass-through software/usage is never QD revenue**, never marked up silently, never in the
   VAT-taxable subtotal. Separate output section, at cost, FX-converted.

## STACK DECISION (chosen for this codebase)

- Author the engine in **TypeScript** (strict) under `app/lib/pricing/src/`.
- Compile with `tsc` to **ESM JavaScript** committed at `app/lib/pricing/dist/` (target
  `es2022`, `module:esnext`, `declaration:true`, `strict:true`, `noUncheckedIndexedAccess:true`,
  `exactOptionalPropertyTypes:true`). **Commit the compiled `.js` + `.d.ts`** so runtime
  (Vercel serverless + browser `admin.js`) needs no build step.
- Runtime input validation with **zod**. Property tests with **fast-check**. Unit/golden tests
  with Node's built-in `node:test` (no new heavy test runner). Add `zod`, `fast-check`,
  `typescript` to `devDependencies` (zod to `dependencies` since the runtime validates input).
- `app/lib/pricing-model.js` becomes a **thin facade**: `export * from './pricing/dist/index.js'`
  plus the compatibility wrappers (below). All current import paths keep resolving.

## FILE PLAN

```
app/lib/pricing/
  src/
    money.ts          // Fils brand, AED(), roundFils(), pct(), displayAED(), FX
    config.ts         // ALL tunables: INTERNAL_RATE, HOURS, margins, MARKET_TIERS, POSTURE, VAT, thresholds, FX
    catalog.ts        // PACKAGES, ADDONS, FOUNDATIONS, CARE_PLANS, modules, SOURCES, bands, COVERS — ported 1:1 from current model + `cost` fields; deep-frozen
    schema.ts         // zod PricingInputSchema + normalize() → typed Selection
    coverage.ts       // buildIncludedMap, includedCharge, getModulePrice (ported, typed)
    cost.ts           // componentCost(), deliveryCost(), chargedCost(), costFloorNet()
    waterfall.ts      // ordered adjustment steps (tier, risk, bundle, founding, promo) + floor enforcement
    governance.ts     // approval thresholds, flags
    engine.ts         // price(input) → PricingResult  (orchestrates the §4 pipeline)
    format.ts         // formatEstimateText(), threeLineClientView()
    hash.ts           // stableStringify + sha256 inputHash
    compat.ts         // buildEstimate(selection) + legacy exports mapped onto price()
    index.ts          // public surface (re-exports everything used today + new API)
  dist/               // committed compiled output (.js + .d.ts)
  tsconfig.json
app/lib/pricing-model.js          // facade: re-export dist/index.js + compat
scripts/test-pricing.mjs          // EXTEND: keep all current checks, add new invariant checks
scripts/test-pricing-property.mjs // NEW: fast-check properties
scripts/test-pricing-golden.mjs   // NEW: golden snapshots
scripts/pricing-golden.json       // NEW: committed golden outputs
docs/PRICING_MODEL.md             // UPDATE: document v2 layers (keep the traceability table)
package.json                      // scripts: build:pricing, test:pricing (runs all 3), prebuild hook
```

## IMPLEMENTATION DETAIL

### money.ts
- `type Fils = number & { readonly __brand:'Fils' }`.
- `AED(n:number):Fils` → `assert Number.isFinite(n)`, return `Math.round(n*100)` branded.
- `roundFils(x:number):Fils` → round-half-up: `Math.sign(x)*Math.round(Math.abs(x))` on an
  already-fils-scaled number; THE only rounding site for money.
- `pct(base:Fils, p:number):Fils` → `roundFils(base * p / 100)`.
- `displayAED(f, mode)` → `exact`=f/100; `aed`=round to whole AED; `rack50`=round to nearest 50 AED.
- FX: `FX = { USD:3.6725, EUR:4.235, GBP:4.918, INR:0.03835 }`; `toAEDfromFX(amount,ccy)`.

### config.ts (the entire tuning surface — heavily commented, flagged ASSUMPTION where not sourced)
```ts
export const INTERNAL_RATE_AED_PER_HOUR = 80;   // ASSUMPTION: Sharjah lean team COST/hr (not billing). TUNE.
export const MIN_GROSS_MARGIN = 0.30;           // target floor margin. TUNE.
export const FLOOR_HARD_MIN  = 0.20;            // absolute hard minimum margin. TUNE.
export const VAT_PERCENT = 5;                   // UAE
export const FOUNDING_MAX_DISCOUNT_PERCENT = 15;// preserved from current model
export const APPROVAL = { auto: 15, manager: 25 }; // > manager ⇒ owner
export const MARKET_TIERS = { sharjah:{factor:0.90,label:'…'}, dubai:{factor:1.00,…}, 'abu-dhabi':{factor:1.00,…} };
export const DEFAULT_TIER = 'sharjah';
export const POSTURE = { launch:{tier:'sharjah',maxFoundingDiscount:15,attachCarePlan:true},
                         standard:{tier:'dubai',maxFoundingDiscount:10},
                         premium:{tier:'dubai',maxFoundingDiscount:5,premiumUplift:0.10} };
export const DEFAULT_POSTURE = 'launch';
export const HOURS = { /* exact table from PRICING_BRAIN_SPEC §3.1 */ };
```

### catalog.ts
- Port `PACKAGES, ADDONS (with levels), CARE_PLANS, INDUSTRY_PRESETS, FOUNDATIONS,
  FOUNDATION_COVERS, PACKAGE_COVERS, SPECIAL_BUILDS, OFFER_TEMPLATES, INDUSTRY_MODULES, SOURCES
  (R01–R32), UAE_MARKET_BANDS, PAGE_RATE_STANDARD=250, PAGE_RATE_LANDING=450` **verbatim** from
  the current `app/lib/pricing-model.js` (same ids, names EN/AR, prices, refs, levels, notes).
- Attach `cost` to each billable component from `HOURS` (spec §3.1). Convert all AED to fils and
  `deepFreeze`.

### schema.ts
```ts
PricingInputSchema = z.object({
  foundationId: z.enum([...]).nullable().default(null),
  pagesStandard: z.number().int().min(0).max(200).default(0),
  pagesLanding:  z.number().int().min(0).max(50).default(0),
  specials: z.array(z.enum([...])).default([]),
  packageId: z.enum([...]).nullable().default(null),
  modules: z.array(z.string()).default([]),
  addons: z.array(z.object({ id:z.enum([...]), tier:z.enum(['low','mid','high']).default('low'),
                             qty:z.number().int().min(1).max(200).default(1) })).default([]),
  carePlanId: z.enum([...]).default('none'),
  industryId: z.string().nullable().default(null),
  posture: z.enum(['launch','standard','premium']).default('launch'),
  marketTier: z.enum(['sharjah','dubai','abu-dhabi']).optional(),  // else from posture
  riskPercent: z.number().min(0).max(25).default(0),
  discountPercent: z.number().min(0).max(100).default(0),          // capped later
  promoPercent: z.number().min(0).max(100).default(0),
  bundleDiscountPercent: z.number().min(0).max(100).default(0),
  clientValueAnnualAED: z.number().min(0).optional(),
  ownerOverride: z.boolean().default(false),  // allows net below operativeFloor, never below hardFloor
  vatPercent: z.number().min(0).max(100).default(VAT_PERCENT),
}).strict();
normalize(input) → Selection  // dedupe addons (first wins), resolve posture→tier+caps, clamp
```
Invalid input throws `PricingError(field, message)`.

### cost.ts
- `componentCost(id, tier) = roundFils(HOURS[id][tier] * INTERNAL_RATE*100scaled) + direct`.
- `deliveryCost(selection)` = cost of EVERYTHING built incl. covered/included capabilities.
- `chargedCost(lines)` = cost of revenue-producing lines only (for displayed margin).
- Two floors, both as net pre-VAT fils:
  `operativeFloor = roundFils(deliveryCost / (1 − MIN_GROSS_MARGIN))` (30% → the normal floor),
  `hardFloor = roundFils(deliveryCost / (1 − FLOOR_HARD_MIN))` (20% → absolute minimum).
  Since higher margin ⇒ higher required net, `operativeFloor ≥ hardFloor`. Normal discounts are
  capped at `operativeFloor`. Only an explicit `ownerOverride:true` input may go below
  `operativeFloor`, and even then **never** below `hardFloor`. With no override, the engine caps
  at `operativeFloor`. `floorBound=true` whenever a cap was applied.

### waterfall.ts
- Steps in fixed order produce signed labelled lines on the defined base (post-coverage pre-VAT
  subtotal): `tier` (×factor), `risk` (+riskPercent, premiumUplift if posture=premium),
  `bundle` (−), `founding` (−, capped by posture+hard cap), `promo` (−).
- `enforceFloor(net, floor, discountLines)`: if `net < floor`, walk discount lines in reverse
  (promo→founding→bundle) reducing each until `net == floor`; mark `floorBound`, keep original
  requested vs applied. Never reduce below `FLOOR_HARD_MIN`-implied floor regardless of inputs.

### engine.ts — `price(input): PricingResult`
Run the exact §4 pipeline (1–13). Build `lines[]` reusing current `buildEstimate` line shapes
(foundation/pages/special/package/module/addon/discount) and ADD `costFils` per line + the new
top-level fields (`listPrice, waterfall, net, deliveryCost, chargedCost, marginAmount,
marginPercent, costFloorNet, floorBound, approval, flags, passThrough, valueCheck`). Preserve
`subtotal/subtotalLow/subtotalHigh, vat, grandTotal, monthly, bandCheck, uaeCheck, openEnded,
version`.

### compat.ts
- `buildEstimate(selection)` → call `price()` with `posture:'standard'`, `marketTier` absent
  **only if** caller didn't pass posture (so legacy callers get TODAY'S numbers: tier factor
  1.0, no auto Sharjah discount) — this guarantees existing golden numbers/invariants are
  unchanged. Map result back to the legacy shape + appended new fields.
- Re-export every symbol currently exported by `pricing-model.js` (functions + constants) so
  `import { … } from '../app/lib/pricing-model.js'` keeps resolving for all consumers.

> ⚠️ Compatibility gate: `buildEstimate` with no posture/tier MUST reproduce the current engine's
> exact outputs. The existing `scripts/test-pricing.mjs` checks are the proof. Make them pass
> first, before wiring posture/tier/cost defaults into the *default* path.

### hash.ts
- `stableStringify(obj)` (recursively sorted keys) → `crypto.subtle`/`node:crypto` SHA-256 hex of
  `stableStringify(normalizedSelection)+PRICING_VERSION`. Pure, deterministic.

## TESTS (CI-gated; `npm run test:pricing` runs all three and must exit 0)

Extend `scripts/test-pricing.mjs` — keep ALL existing checks, then add:
- `net ≥ costFloorNet` for a heavily-discounted custom build (floor binds; `floorBound===true`).
- Waterfall reconciles: `listPrice − Σ|adjustments| === net` and `net + vat === grandTotal`.
- Pass-through items never appear in taxable subtotal.
- Margin uses delivery cost: full-bundle-with-overlap shows margin vs delivery cost, not charged.
- Approval mapping: 10%→auto(launch), 20%→manager, 30%→owner.
- Market tier: `price({...,marketTier:'sharjah'}).net < price({...,marketTier:'dubai'}).net` and
  factor applied exactly once.
- Compatibility: `buildEstimate()` (no posture) reproduces the pre-v2 grandTotal for the 5
  templates and 5 presets (hardcode expected values from the current engine).

NEW `scripts/test-pricing-property.mjs` (fast-check, ≥1000 runs each):
- Generate arbitrary valid selections; assert: `net ≥ floor`; all money integer; waterfall
  balances; `inputHash` stable across two runs & deep-equal outputs; coverage permutation-
  invariant (shuffle addons/modules → identical totals); realized discount ≤ governed cap;
  adding a new uncovered charged addon never decreases `net`.

NEW `scripts/test-pricing-golden.mjs` + `scripts/pricing-golden.json`:
- Snapshot exact `price()` output (money as fils) for: 5 `OFFER_TEMPLATES`, 5 `INDUSTRY_PRESETS`,
  and these edge cases — max founding discount on Essential; floor-binding 40% discount on a
  custom Ops build; Premium + dashboard-pack high (upgrade-diff only); Commerce Growth + loyalty
  high (fully-included → 0); Sharjah vs Dubai tier on the same selection; AI-chatbot pass-through.
- First run writes the file if absent; subsequent runs diff and FAIL on any drift. A drift means
  bump `PRICING_VERSION` and regenerate intentionally.

`package.json`:
```
"build:pricing": "tsc -p app/lib/pricing/tsconfig.json",
"test:pricing": "node scripts/test-pricing.mjs && node scripts/test-pricing-property.mjs && node scripts/test-pricing-golden.mjs",
"prepricing": "npm run build:pricing"
```
Commit `dist/`. Document in `docs/PRICING_MODEL.md` that `build:pricing` regenerates it and
`test:pricing` must pass before any deploy.

## ACCEPTANCE CRITERIA (definition of done)

1. `npm run build:pricing` compiles with **zero** TS errors under the strict flags above.
2. `npm run test:pricing` exits 0 — all invariant + property + golden tests pass.
3. Every current consumer runs unchanged; the pre-v2 invariants in `test-pricing.mjs` still pass.
4. `price()` returns the full §6 contract; `buildEstimate()` returns the legacy shape + appended
   fields and reproduces pre-v2 numbers when no posture/tier is passed.
5. No `number` money value is ever non-integer (property-tested). No below-floor price is
   reachable (property-tested). Pass-through never taxed (unit-tested).
6. `config.ts` is the single place to change rate/hours/margins/tiers/posture/VAT/FX; changing a
   value + bumping `PRICING_VERSION` + regenerating goldens is the entire re-pricing workflow.
7. `inputHash` is stable and persisted by `api/quote-from-estimate.js` alongside the quote
   (extend the persisted record with `inputHash, version, deliveryCost, marginPercent,
   discountApplied, approval, flags`).
8. Output money is integer fils internally; `displayAED()` is the only path to human numbers.

## DELIVERY

Implement in small, verifiable commits in this order, running `npm run test:pricing` after each:
1. Scaffold `pricing/` + tsconfig + money.ts + config.ts + catalog.ts (port 1:1) + facade; prove
   existing `test-pricing.mjs` passes via `buildEstimate` compat (no behaviour change yet).
2. Add schema.ts + hash.ts + cost.ts (floor) + property/golden harnesses.
3. Add waterfall.ts + governance.ts + posture/tiers; wire `price()`; keep `buildEstimate`
   defaulting to legacy numbers.
4. Extend tests to full coverage; write goldens; update `docs/PRICING_MODEL.md`; wire
   `inputHash`/audit fields into `api/quote-from-estimate.js`.

Stop and surface a question if any existing invariant would have to change to proceed — do not
silently alter a price to make a test pass.

---

### Notes the human (QD) still owes the engine (safe defaults used until then)
- Real **internal cost/hour** and **measured hours** per build tier/add-on (replaces §3.1 defaults).
- Confirm **`MIN_GROSS_MARGIN` (0.30)** and **`FLOOR_HARD_MIN` (0.20)**.
- Confirm **Sharjah tier factor 0.90** (or per-service-line factors).
- These live only in `config.ts`; changing them is a one-file edit + version bump + golden refresh.
