# MASTER Codex Prompt — QD Pricing v3.0 (Voice-to-Quote, the full jump)

> One coherent build that takes the estimator from "click packages" all the way to **"talk to it,
> it asks what it needs, and a correct price comes back."** Supersedes the v2.2 and v2.3 prompts.
> Builds on the shipped engine (`app/lib/pricing/`, v2 + v2.1 Sharjah launch). Read
> `docs/PRICING_BRAIN_SPEC.md` first. Implement as ONE feature but commit + `npm run test:pricing`
> after each PART so nothing regresses. Paste everything between the rules into Codex.

---

## THE GUARDRAIL THAT MAKES ALL OF THIS SAFE

**AI turns words → a `Selection` of specs. The deterministic engine turns specs → price. The AI
NEVER outputs a price.** Every dirham still comes from `price(selection)` — integer fils, cost/min
floor, traceable. The voice/chat layer only fills the same `Selection` a human would click. If you
ever find a price produced anywhere but the engine, that's a bug.

Keep ALL existing guarantees: integer fils + one rounding site, determinism (pure `price()`),
schema validation, coverage de-dup (no double charge), founding-discount cap, golden + property
tests. `npm run test:pricing` must stay green; bump `PRICING_VERSION='2026-06-14'` and regenerate
goldens for the intended number/structure changes below.

## TARGET EXPERIENCE

```
🎤 "I run a small clinic, I want online booking and an Arabic + English site"
   → transcribe (EN/AR) → AI extracts specs → asks: "How many staff need their own calendar?"
   → owner taps "3" (or says it) → engine prices it → friendly quote shows, fully editable
   → Create Quote → shareable passcode link / print.
```

---

## PART A — Engine: spec model + value floor (fix the structure)

`app/lib/pricing/src/{catalog,config,engine,schema}.ts`

1. **One website base that includes pages** (removes the Starter/Essential/Pro/Premium ladder from
   the product). Add:
   ```
   id:'web-base', name:{en:'Website', ar:'موقع إلكتروني'}, base:3650, includedStandardPages:5,
   includes:['Custom responsive design','Up to 5 pages','Contact + WhatsApp','Google Business
   Profile','Analytics','Hosting & domain setup'], basis:'positioning'
   ```
   Bill standard pages only beyond the included 5: `max(0, pagesStandard - includedStandardPages)
   × 250`. (At the 0.70 Sharjah factor this base shows ≈ AED 2,550 incl. 5 pages — same number
   clients see today, minus the confusing separate page line.) Old tier extras become specs (CRM,
   AR/EN `extra-language`, dashboard, blog).

2. **Swap the cost-margin floor for a value floor** (your real cost is ~0 with AI + Vercel, so a
   cost floor either does nothing or wrongly inflates the price). Replace it:
   ```
   MIN_REALIZATION = 0.55           // never realize below 55% of the Dubai-anchored list value
   operativeFloor = roundFils(listPrice * MIN_REALIZATION)
   ```
   Keep the old cost floor only as `max(valueFloor, costFloor)` (cost ≈ 0 ⇒ value floor wins).
   This bounds total discounting (Sharjah 0.70 + founding 15% = realize 59.5% > 55% ✓ allowed;
   deeper stacking is capped + flagged). Margin % becomes informational/internal only.

3. Keep posture/tier glide path (`launch`→Sharjah 0.70 now, `standard`→Dubai later, per-emirate
   tiers) and VAT default-off in the estimator. Bump version; regenerate goldens; add tests:
   web-base + 5 pages = 0 page overage; +7 pages = 2×250; value floor caps a 50% discount.

## PART B — Spec-based estimator UI (no packages)

`admin.js` Pricing tab. Replace the tier/archetype/goal flow with:

1. **Website toggle** (on by default) → adds `web-base` (incl. 5 pages) + a stepper "Pages
   (5 included · AED 250 extra)". Remove the 4 tier cards and the "what are you building"
   archetype cards entirely.
2. **One flat "What do you need?" spec list** — each a toggle with its launch price and a scope
   level (low/mid/high) where relevant: Online booking, Online store, Online ordering, Customer
   management (CRM), AI chatbot, Analytics dashboard, Loyalty, Reviews, Staff/roles, Documents,
   SEO, Arabic + English, Maps, Online payments. Every capability appears in exactly ONE place.
3. **Coverage clarity:** when one spec already includes another, show the second as "✓ included"
   (engine coverage already computes this) — never a second price. Kills the double-charge
   confusion.
4. **Optional one-tap industry quick-start** (Clinic/Restaurant/Salon/Retail/Services/Education)
   pre-toggles a sensible spec set via `INDUSTRY_PRESETS` — convenience, never required.
5. Summary stays the friendly format and **must reconcile** (Σ lines − "Sharjah launch saving" =
   One-time build — that saving line already exists in `admin.js`, keep it). Hero "From AED X once
   + AED Y/mo", market→launch anchor, VAT toggle off, monthly Care Basic, internal strip
   (margin/floor/approval) visible only in admin, never on the client quote.

## PART C — Voice → specs

1. **`/api/transcribe`** — audio blob → Groq Whisper (`whisper-large-v3`, existing `groq-sdk`),
   returns `{ transcript }`. Supports EN + AR.
2. **`/api/extract-spec`** — transcript (or typed text) → Groq LLM with a STRICT system prompt:
   output ONLY JSON `{ website:bool, pages:int, specs:[{id,tier?}], businessType?, languages?,
   storeSize?, staff?, clarifyingQuestions:[{id,question,options[]}], confidence }`. Enumerate the
   allowed `specs` ids (= the Part B list). **No prices in the output.** Map JSON → engine
   `Selection`; cross-check with the deterministic `brief-parser.js` as a sanity net.

## PART D — Clarifying questions + conversational refinement

1. **Ask, don't guess.** When a price-driver is missing/ambiguous, the LLM returns
   `clarifyingQuestions` instead of assuming. Drivers to ask about: store size (≤50 vs 50–250),
   staff/branches (roles), languages (AR+EN?), website-or-system-only, booking scope. Render as
   quick-tap chips or accept a follow-up voice reply; merge answers; re-price. ≤2 rounds, then
   default unknowns to the safe/low tier shown as an **editable** line (never a silent price guess).
2. **Refine by talking.** Free-text/voice follow-ups — "make it cheaper", "add Arabic", "drop the
   chatbot", "they have 2 branches" — adjust the `Selection` (founding discount, add/remove spec,
   tier) and re-run `price()` live. Still: words → Selection → engine. ("cheaper" nudges the
   founding discount within its cap / suggests a leaner spec — never an arbitrary number.)

## PART E — Client-ready quote

1. **Three-line quote** (benchmark structure): (a) one-time build, (b) third-party software at
   cost, (c) small monthly care. Plus the market→launch anchor ("Typical Dubai AED X · your price
   Y"), VAT off unless toggled, reconciling lines. Internal numbers (margin, delivery cost, floor,
   approval, flags) NEVER appear here.
2. **Create Quote** (existing flow): passcode + quote number, persist v2 audit fields (inputHash,
   version, listPrice, net, deliveryCost?, discountApplied, approval, flags). Shareable passcode
   link; printable/PDF view. Plain warm language + AR/EN throughout.

## PART F — Robustness & polish

- Graceful fallbacks: mic denied / transcription fails / LLM returns junk → fall back to the typed
  "Describe the offer" box and the manual spec toggles (already the same code path → a `Selection`).
- Loading + error states on record/transcribe/extract; show the transcript for transparency.
- Mobile-friendly, accessible (focus rings, 44px targets, labelled mic button); EN/AR + RTL.
- The mic button is the hero of the Pricing tab; manual spec editing always available beneath it.

## ACCEPTANCE (definition of done)

1. `npm run test:pricing` exits 0 (build + invariant + property + golden), goldens regenerated.
2. Every price comes from `price()`; a test asserts the voice/extract endpoints never return a
   price the engine didn't compute for the returned `Selection`.
3. No package tiers / archetype cards anywhere; one base (incl. 5 pages) + a flat spec list; each
   capability pickable once; coverage shows "included" not a second charge.
4. Value floor (not cost) bounds discounts; a 50%+ discount is capped + flagged.
5. Voice (EN/AR) → transcript → extracted specs → price; missing price-driver ⇒ a clarifying
   question, not a guess; specs are shown and editable before Create Quote.
6. Conversational tweaks ("cheaper", "add Arabic", "2 branches") re-price live via the engine.
7. Client quote is clean, friendly, VAT-off-by-default, internal numbers hidden; Create Quote +
   shareable link works.
8. Determinism, integer fils, traceability unchanged. `PRICING_VERSION='2026-06-14'`. One feature,
   committed in layered commits (A→F), tests green at each.

> Owner tunables stay one-place in `config.ts`: `sharjah.factor`, `web-base.base`,
> `includedStandardPages`, `MIN_REALIZATION`, `care-basic.monthly`. Build A→B→C→D→E→F; each layer
> only ever produces or edits a `Selection`, and the same deterministic engine prices it.
