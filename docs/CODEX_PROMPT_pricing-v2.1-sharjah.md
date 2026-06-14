# Codex Change Prompt — Pricing v2.1 (Sharjah Launch + UX)

> Builds on the shipped Pricing Brain v2 (`app/lib/pricing/`). This is a **tuning + wiring +
> UX** change, not a rewrite. Keep every v2 guarantee intact (integer fils, cost floor,
> determinism, `npm run test:pricing` green). Read `docs/PRICING_BRAIN_SPEC.md` first.
> Paste everything between the rules into Codex.

---

## CONTEXT / WHY

QD is a brand-new Sharjah startup landing its first clients in a soft market. The current
estimator shows full Dubai-rate prices (e.g. AED 5,900) because the UI still calls the legacy
`buildEstimate` path. We want, for ALL business types:

1. **Lower one-time prices** — sit clearly below Dubai market, without looking cheap.
2. **One-time + small monthly** framing on every quote.
3. **VAT optional, OFF by default** (QD isn't VAT-registered yet; UAE threshold is AED 375k).
4. **Market-anchoring** so the lower price reads as a deal, not a discount-shop ("market rate
   AED 5,900 → your Sharjah launch price AED 4,130").

Keep the cost floor doing its job: it will auto-cap discounts on heavy custom builds — that is
correct, do not weaken it.

## ABSOLUTE RULES (unchanged from v2)

- Integer fils only; one rounding site. Determinism preserved. Cost floor never breached.
- Do NOT rewrite catalog anchors — the verified R01–R32 numbers stay as the **market reference**
  (they power the anchoring display and band checks). Lower prices come from the **tier factor**,
  not from editing anchors.
- Any number change ⇒ bump `PRICING_VERSION` and regenerate goldens intentionally.
- `npm run test:pricing` must exit 0 (build + invariant + property + golden).

---

## PART A — Engine config (small, low-risk; `app/lib/pricing/src/config.ts`)

1. **Strengthen the Sharjah launch factor** — this is the single lever that lowers every
   one-time price for every business type:
   ```ts
   sharjah: { factor: 0.70, label: 'Sharjah / Northern Emirates launch price' }  // was 0.90
   ```
   (30% under the verified Dubai anchor — QD's chosen launch level. OWNER-TUNABLE in one place:
   0.75 ≈ 25% under, 0.80 ≈ 20% under.)

2. **Add a friendly Starter entry** so the opening number is never scary for a local SME. New
   foundation in `catalog.ts FOUNDATIONS` (below Essential), `basis:'positioning'`:
   ```
   { id:'foundation-starter', name:{en:'Starter site', ar:'موقع البداية'}, base:2400,
     bestFor:{en:'A small local business getting online fast', ar:'…'},
     includes:['1–3 page professional site','Mobile-friendly','Contact + WhatsApp button',
               'Google Business Profile setup','Basic analytics'], basis:'positioning' }
   ```
   Add hours `'foundation-starter': ranged(8,10,14)` (cost ≈ AED 800 → healthy margin) and
   `FOUNDATION_COVERS['foundation-starter']=['gbp-setup']`. With the 0.70 factor this opens at
   **"websites from ~AED 1,680"** — the friendly hook. Do NOT change Essential/Professional/
   Premium derivations or the `Essential+5pages=5,900` invariant.

3. **Add a small monthly plan** in `catalog.ts CARE_PLANS` (keep the others):
   ```
   { id:'care-basic', name:{en:'Care Basic', ar:'العناية المبدئية'}, monthly:149,
     scope:'Hosting, SSL, backups, uptime checks, security updates, 1 small content edit / month', refs:['R26'] }
   ```
   Set launch posture to suggest it by default:
   ```ts
   launch: { tier:'sharjah', maxFoundingDiscount:15, attachCarePlan:true,
             defaultCarePlan:'care-basic', label:'Launch / land-clients' }
   ```
   Foundations’ `suggestedCarePlan` stays as-is for standard posture; when `posture==='launch'`
   and the caller hasn’t chosen a plan, default the monthly to `care-basic`.

4. **VAT default** stays `VAT_PERCENT=5` in config (for when QD registers), but the **estimator
   passes `vatPercent:0` by default** (Part B). Do not hardcode 0 in the engine.

5. Bump `PRICING_VERSION` → `'2026-06-13'`. Regenerate `scripts/pricing-golden.json`.

> Floor sanity (with factor 0.70): a 5-page site 5,900×0.70 = AED 4,130 vs delivery cost ~2,040 →
> ~51% margin (healthy, still discountable). Lightweight builds (Starter, sites, booking, ordering)
> take the full 30% and stay profitable. Heavy custom builds hit the floor instead: Ops Dashboard
> 18,900×0.70 = 13,230 is below its ~30%-margin floor (~AED 17,143 at the default 150h cost), so the
> engine claws the reduction back to the floor and flags `floor_bound` — correct behaviour. Lower the
> Ops `HOURS`/rate if you want that build genuinely cheaper too.

## PART B — Estimator wiring (the part that makes prices actually drop on screen)

The live estimator (the "Pricing Estimator" panel; find where it computes the estimate — it
currently calls `buildEstimate(selection)` and/or imports the pricing facade in the browser):

1. **Drive pricing through launch posture**:
   ```js
   price({ ...selection, posture: 'launch', vatPercent: vatOn ? 5 : 0 })
   ```
   Replace the legacy `buildEstimate` call in the estimator with `price(...)` so the Sharjah
   factor, small-monthly default, and waterfall apply live. (Leave `buildEstimate` itself intact
   for any other legacy callers.)

2. **Render the waterfall, not just lines.** The −30% tier and any discounts live in
   `result.waterfall`. Show the build summary as:
   - `Market rate (Dubai): AED {listPrice}` — shown lightly / struck-through, labelled "market".
   - `Your Sharjah launch price: AED {net}` — bold, primary.
   This anchoring is the anti-"cheap" mechanism. Use `result.listPrice` and `result.net`.

3. **One-time + small monthly, prominent.** Summary shows two headline figures:
   - `One-time build: AED {net}` (+ VAT line only if `vatOn`).
   - `Monthly: AED {monthly.amount}/mo — {monthly.planName}` (defaults to Care Basic 149).
   - If `monthly.softwarePassThrough`, a small grey line: "Third-party software billed at cost."
   This is the benchmark's three-line quote (build / software at-cost / monthly care).

4. **VAT toggle**, default OFF. A checkbox "Add 5% VAT (if VAT-registered)". When off, pass
   `vatPercent:0` and render no VAT line. When on, pass 5.

5. **Internal vs client view.** `marginPercent`, `deliveryCost`, `floorBound`, `approval`, and
   the `flags` are INTERNAL ONLY — show them in the admin estimator (small muted "internal"
   strip) but NEVER in the client-facing/printed quote.

## PART C — "What does the client need" input (guided, less typing)

Make step 1–3 a cleaner guided flow using catalog data already present
(`INDUSTRY_PRESETS`, `INDUSTRY_MODULES`):

1. Pick **business type** → auto-suggest the preset's `packageId`/foundation + typical
   `addonIds` + the industry modules for that vertical (pre-checked, removable).
2. Pick **goal** (e.g. "get found & get calls", "take bookings", "sell online", "run operations")
   → maps to foundation tier + modules. Keep it to ≤4 clicks to a sensible quote.
3. Keep the manual options (pages, add-ons, tiers) available but collapsed under "Customize".

## PART D — Buttons / polish (light)

- Primary action **Create Quote** = solid, full-width, brand green; **Copy summary** = secondary
  outline; **Reset** = quiet/ghost. Consistent height, hover/disabled states, and spacing (the
  current trio looks unbalanced). Keep it accessible (focus rings, 44px tap targets).
- Show the estimate's `approval` + `floor_bound` as a small internal badge when relevant.

## PART E — Friendly tone & presentation (these are LOCAL businesses, not enterprises)

A high number up front loses an interested local owner. Make the whole pricing surface feel
approachable and reassuring:

- **Lead small.** Headline the build as a "from" price and pair it immediately with the small
  monthly — e.g. **"From AED 1,680 once + AED 149/month."** Never show a big scary total first.
- **Plain, warm language** on every option — say what the owner gets, not internal jargon:
  "Starter site" / "A professional site to get found and get calls" (not "Essential foundation");
  "Take bookings online" (not "booking-integration high tier"). Keep Arabic equally warm.
- **Gentle anchoring**, not aggressive: "Typical Dubai agency: AED 5,900 · Your Sharjah price:
  AED 4,130" — reassures it's a fair local rate, not a cut-rate job.
- **Reassurance microcopy** near the total: "One payment for the build, a small monthly to keep
  it running and supported. No hidden fees." (Adjust to QD's real terms.)
- **Soften the totals area**: friendly rounding for display (`displayAED(x,'rack50')`), AED with
  thousands separators, calm colors, generous spacing — not a dense invoice.
- Optional: a quiet "Prefer to split the build over 2–3 months? Ask us." line for cash-tight SMEs.
- Keep all internal numbers (margin, floor, approval) out of this friendly view entirely.

## ACCEPTANCE

1. `npm run test:pricing` exits 0; goldens regenerated; floor/determinism invariants still hold.
2. Estimator shows Sharjah launch prices live (5-page site ≈ AED 4,130, not 5,900), with the
   "market rate → launch price" anchor visible.
3. Every quote shows One-time + a small Monthly (Care Basic 149 by default).
4. VAT toggle defaults OFF; no VAT line until enabled; enabling adds exactly 5% on net.
5. Internal margin/approval/floor never appear in the client/printed quote.
6. Guided needs-input pre-selects sensible modules per business type; ≤4 clicks to a quote.
7. Starter tier exists; estimator opens with a friendly "from ~AED 1,680 once + AED 149/mo"
   headline; options use plain warm language; reassurance microcopy present near the total.
8. One commit; `PRICING_VERSION='2026-06-13'`.

> Owner still tunes (one place, `config.ts`): the `sharjah.factor` (how far under Dubai),
> `care-basic.monthly`, and real cost hours/rate. Changing the factor is the fastest way to go
> lower or higher.
