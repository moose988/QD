# Codex Change Prompt — Pricing v2.3 (Voice → Price, with clarifying questions)

> The end goal: a mic button where the owner *describes* the system in voice, the assistant asks
> a clarifying question or two if needed, and a price comes back. Builds on v2.2 (spec-based
> estimator) and the deterministic engine. Read `docs/PRICING_BRAIN_SPEC.md` first.

---

## THE ONE GUARDRAIL THAT MAKES THIS SAFE

**The AI turns words → specs. The deterministic engine turns specs → price. The AI NEVER
outputs a price.** This is what keeps the "no mistakes" guarantee: every dirham still comes from
`price(selection)`, fully traceable. The LLM only fills the same `Selection` a human would click.

## FLOW

```
🎤 voice  →  /api/transcribe (Groq Whisper)  →  transcript
          →  /api/quote-from-voice (Groq LLM, strict JSON)  →  { selection, clarifyingQuestions[], confidence }
          →  if clarifyingQuestions: ask them (chips / another voice turn) → merge answers
          →  validate selection against the engine schema  →  price(selection)
          →  show the v2.2 spec estimator PRE-FILLED + the friendly summary  (owner can tweak before Create Quote)
```

## COMPONENTS

1. **`/api/transcribe`** — accept audio blob, call Groq Whisper (`whisper-large-v3`) via the
   existing `groq-sdk`, return `{ transcript }`. (EN + AR.)

2. **`/api/quote-from-voice`** — send the transcript to the Groq LLM with a STRICT system prompt:
   - "You are a spec extractor for QD's pricing engine. Output ONLY JSON matching this schema:
     `{ website:bool, pages:int, specs:[{id, tier?}], businessType?, languages?, storeSize?,
     staff?, clarifyingQuestions:[{id,question,options[]}], confidence:0-1 }`."
   - Enumerate the allowed `specs` ids (booking, store, ordering, crm, chatbot, dashboard,
     loyalty, reviews, roles, documents, seo, language, maps, payments) — same set as the v2.2
     spec list. **No prices in the output.**
   - **Ask, don't guess:** if a price-driving detail is missing or ambiguous, put it in
     `clarifyingQuestions` instead of assuming. Required drivers to ask about when unclear:
     store product count (≤50 vs 50–250), number of staff/branches (drives roles), languages
     (AR+EN?), website-or-system-only, booking scope (simple vs full scheduling).
   - Map the extracted JSON → the engine `Selection` (website→`web-base`, specs→addons/modules
     at the stated tier, languages→`extra-language`, etc.).

3. **Clarifying-question UI** — render `clarifyingQuestions` as quick-tap chips (or accept a
   second voice reply); merge answers into the selection; re-run extraction/price. Keep it to
   ≤2 rounds — anything still unknown defaults to the safe/low tier and is shown as an editable
   line (never a silent guess on price).

4. **Validate + price** — run the merged selection through the engine schema validator
   (rejects anything off-spec), then `price(selection, { posture:'launch' })`. Render the v2.2
   estimator **pre-filled** so the owner sees exactly what was understood and can adjust a toggle
   before hitting Create Quote.

5. **Mic button UI** — in the Pricing tab: "🎤 Describe what you're building" → record
   (MediaRecorder) → transcribe → show transcript + extracted specs + price. Falls back to the
   existing "Describe the offer in words" text box (already present) for typed input.

## GUARDRAILS / ACCEPTANCE

1. The LLM response is JSON-validated; any field outside the engine enums is dropped, not priced.
   The price ALWAYS comes from `price()` — add a test that the voice endpoint never returns a
   price the engine didn't compute for the returned selection.
2. Missing price-drivers produce a clarifying question, not a guess (test: "I want an online
   store" with no size → returns a `storeSize` clarifying question).
3. Arabic and English voice both work; transcript shown for transparency.
4. Extracted specs are shown and editable before Create Quote (owner stays in control).
5. `npm run test:pricing` still green; no engine determinism change.
6. Reuses existing infra: `groq-sdk`, `api/chat.js` patterns, `brief-parser.js` (as a
   deterministic fallback/cross-check on the LLM extraction).

> Build order: v2.2 (spec estimator) first — it's the surface the voice flow fills and the
> fallback editor — then this. The manual spec UI and the voice button share one code path:
> both just produce a `Selection`, and the same deterministic engine prices it.
