# Codex Prompt — Quotation/Payments/Collections FIXES (make it bulletproof)

> QA pass on the in-progress quotation system. Three real bugs + a clarity overhaul. The headline
> bug is a money-math inconsistency that must be fixed at the architecture level. Keep
> `npm run test:pricing` green and `node --check` clean. Paste everything between the rules.

---

## BUG 1 (CRITICAL) — payments and collections are two disconnected ledgers

**Today:** `api/quote-payment.js` appends free-floating `{amount,date,method}` to `payments[]`,
which drives `paid`/`balance` (`quote-payments.js`). But `api/_lib/collections.js` builds "due"
ONLY from `milestones[]` and `careCollected[]` — it **never reads `payments[]`**. So logging a
AED 500 payment drops the balance (8,120 → 7,620) but the collections schedule ignores it and
still shows a milestone/care figure. The two never reconcile. **This is why the math looks wrong.**

**Fix — one reconciled ledger. The payment SCHEDULE is the single source of truth:**

A quote's schedule = the only place money is recorded:
- **Build (one-time):** two milestones — **Advance 30%** and **Final 70%** (`advance.amount +
  final.amount == buildTotal`, where `buildTotal = computeTotals(...).grandTotal`).
- **Care (recurring):** one item per month from `goLiveDate`, `amount = careMonthly`, due on
  `billingDay`.

Each schedule item carries `amount`, `dueDate`, **`paidAmount`** (default 0); derive
`remaining = amount − paidAmount` and `state` = **Paid** (remaining ≤ 0) / **Partial** /
**Unpaid**.

**Money in = applying a payment to a specific schedule item.** Remove the free-floating payment
path. "Log payment / Mark collected" MUST target an item (Advance, Final, or a specific care
month): it increases that item's `paidAmount` and appends a payment record
`{ itemKey, amount, date, method, note }`. Nothing may change `paid`/`balance` without touching a
schedule item.

Everything else is **derived** from the schedule:
- `paid` = Σ `paidAmount` over all items (== Σ payment records).
- `buildBalance` = `buildTotal − (advance.paidAmount + final.paidAmount)`.
- `careOutstanding` = Σ `remaining` of care months due on/before today.
- `outstanding` (owed today) = `buildBalance + careOutstanding`.
- **Collections "due"** = schedule items with `remaining > 0` whose `dueDate` is overdue / today /
  within 7 days; each item shows its **`remaining`** (never the full amount once partly paid).

**Migration for existing quotes:** map any legacy free-floating `payments[]` onto the schedule —
apply to Advance first, then Final, then the oldest unpaid care month — so old quotes reconcile.

## BUG 2 — "View quotation" is read-only; make it editable

From the Quotations list, opening a quote must open an **editable** drawer (reuse the existing
Edit Quote modal), not a read-only view. Editable: customer, line items, pages, terms, validDays,
status, `goLiveDate`. **Save** via `quote-save`/`quote-update`. On save, recompute `buildTotal`
and re-derive milestone amounts from the new total **while preserving recorded `paidAmount`s**; if
a milestone's new amount < its `paidAmount`, keep the payment and show a warning (overpaid/credit).

## BUG 3 — delete a quotation

Add an admin-only **Delete** action (confirm dialog: "Delete quote QD-009-2026? This can't be
undone."). New `DELETE /api/quotes/:id` (or a `quote-update` delete action) — removes the doc;
it disappears from the list and collections. `requireAdmin`.

## CLARITY — make paid vs unpaid unmistakable everywhere

- Every quote (list row + detail) shows **one** status badge: **Unpaid · Partial · Paid**, plus
  three labelled figures: **Total · Paid · Balance**.
- The schedule renders as a checklist: `Advance 30% — AED 2,436 — Paid ✓ / Due {date} / Overdue`,
  `Final 70% — AED 5,684 — …`, and care months similarly.
- Collections cockpit rows must name the item: e.g. **"Sea Land · Advance 30% · AED 1,936 · due
  today"**, and clearly separate **Due now** from the quote's **total Balance**. Never display a
  "due" number that doesn't tie to a specific schedule item.

## INVARIANTS / TESTS (this is the "bulletproof" part — add as automated checks)

1. For every quote, `paid + buildBalance == buildTotal`.
2. A quote's collections **due-now ≤ its outstanding**, and outstanding == buildBalance + overdue
   care. No "due" figure can exceed what's owed.
3. Logging a payment of `X` against an item increases `paid` by exactly `X`, reduces that item's
   `remaining` by `X`, and reduces balance by `X` — and changes nothing else.
4. Collecting every schedule item → `buildBalance == 0`, `paid == buildTotal`.
5. No code path creates a payment not attached to a schedule item.
6. Worked example must hold: total 8,120; log 500 against Advance → Advance 500/2,436, balance
   7,620, collections shows Advance **1,936** due (not 568); `paid + balance == 8,120`.

## ACCEPTANCE

- The 8,120 / 500 / 7,620 example reconciles end-to-end; collections and the quote agree.
- View opens editable; saving recomputes totals + schedule while keeping payments.
- Delete works with confirmation.
- Status (Unpaid/Partial/Paid) + Total/Paid/Balance are clear on every quote and in collections.
- Invariant tests pass; `node --check` clean on changed files; `npm run test:pricing` green;
  internal payment/collection data never exposed on `/q/`.
