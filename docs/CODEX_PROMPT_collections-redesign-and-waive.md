# Codex Prompt — Collections redesign + waive + client name + audit trail

> Next iteration on the Collections/quotation system. Three things: redesign the Collections tab,
> add the ability to waive monthly care (incl. "first month free"), and fix the client name showing
> as "CLIENT". Keep the reconciliation invariants from the last fix intact. `npm run test:pricing`
> green, `node --check` clean, stays under the Vercel Hobby function limit (reuse consolidated
> routes). Paste everything between the rules.

---

## PART 1 — Redesign the Collections tab (easier to scan + scales)

Replace the three big side-by-side buckets with a money cockpit:

1. **KPI strip** (4 metric cards, top): **Overdue**, **Due today**, **Next 7 days**, **Total due** —
   each shows amount + item count. Colour: overdue = danger, due-today = warning; others neutral.
2. **One prioritized list** below, sorted **overdue → due today → upcoming**, grouped with a slim
   section header per bucket (label · count · total). Each row: client avatar/initials, client name
   + reference, the item ("Final 70%" / "Monthly care · Jun 2026"), due date, amount (right,
   tabular), a status pill, and a **Mark collected** button.
3. **Empty buckets collapse** to a single quiet line (e.g. "Nothing overdue — you're caught up"),
   not a large empty card.
4. **Search** (client name or reference) + **filter chips** (All · Overdue · Due today · Upcoming ·
   Care · Milestones). Filter client-side from the `/api/collections` payload.
5. Keep it in the app's existing dark/mono theme. Render amounts with thousands separators.

(Reference layout: the approved mockup — KPIs, prioritized list, collapsed empties, search/filter.)

## PART 2 — Waive monthly care (e.g. first month free)

Add a third state to care months: **Waived** (alongside Due / Partial / Paid). A waived month owes
nothing, never appears in collections "due", and is excluded from balance/outstanding — but is still
shown in the quote's schedule labelled "Waived · free" so it's clear it was intentionally not billed.

- Quote fields: `careWaived: string[]` (YYYY-MM keys) and `firstMonthFree: boolean`.
- Care schedule builder (`quote-payments.js` / `collections.js`): a care month is **waived** if its
  `monthKey ∈ careWaived` OR (`firstMonthFree === true` AND it is the first care month from
  `goLiveDate`). Waived items: `amount` shown as `0` / "Free", `remaining = 0`, `state = 'waived'`,
  excluded from due buckets and from `careOutstanding`/`outstanding`.
- Actions (admin-only, via `quote-update`): `waiveCare {monthKey}`, `unwaiveCare {monthKey}`, and a
  `firstMonthFree` toggle. Cannot waive a month already collected; cannot collect a waived month
  (un-waive first). Recurring billing then continues normally for later months.
- UI: in the quote detail schedule, a **"First month of care free"** checkbox, and a
  **Waive / Un-waive** toggle on each upcoming care month. Waived months render as "Free".

## PART 3 — Fix the client name ("CLIENT" placeholder)

Collections rows and the quotations list show "CLIENT" because `customer.businessName` isn't being
captured/displayed. Capture the business name on quote create (and make it editable in the quote
editor), and display `customer.businessName` everywhere a client name is shown (collections rows,
quotations list, quote detail). Fall back to "—" only when genuinely empty, never the literal word
"CLIENT".

## PART 4 — Audit trail must capture EVERY action (authoritative, server-side)

Today only quote *edits* get logged (client-side `logActivity` → `adminActivityLogs` in
`admin.js`). Delete, mark-collected, waive, mark-sent, and status changes are missing. Make audit
logging **authoritative and server-side** so it can't be bypassed:

- In each admin mutation endpoint — `quote-update` (edit, delete, status, remarks, go-live,
  first-month-free, waive/un-waive) and `quote-payment` / `collections-collect` — after the write
  succeeds, append to `adminActivityLogs`:
  `{ action, targetType:'quote', targetId, targetLabel: quoteNumber,
  actorEmail (from requireAdmin), actorUid, details, createdAt: serverTimestamp() }`.
- For **delete**, write the audit entry BEFORE deleting the doc so the history persists.
- Action keys + labels to add: `deleted_quote` ("Deleted quote"), `recorded_payment`
  ("Recorded payment"), `waived_care` ("Waived monthly care"), `unwaived_care` ("Un-waived care"),
  `marked_sent` ("Marked as sent"), `changed_quote_status` ("Changed quote status"),
  `marked_go_live` ("Set go-live date"). Keep `update_quote` for edits.
- `details` must be specific and human-readable, e.g. "Recorded AED 500 against Final 70%",
  "Waived care 2026-06", "Deleted quote Q-2026-010", "Status: sent → accepted".
- The Activity tab's action filter must include these new actions (and they render with actor,
  target = quoteNumber, and details). Remove client-side duplicate logging for these actions so
  each event is logged exactly once.

## INVARIANTS / TESTS (keep it bulletproof)

1. A waived care month contributes **0** to paid, balance, and outstanding, and never appears in any
   due bucket.
2. `firstMonthFree` waives exactly the first care month from go-live; later months bill normally.
3. Reconciliation from the last fix still holds: `paid + balance == total`; collections due ≤
   outstanding; collecting all non-waived items → balance 0.
4. Waiving then un-waiving a month restores it to its normal due state with the correct amount.

## ACCEPTANCE

- Collections tab matches the redesign: KPI strip, single prioritized list, collapsed empty buckets,
  working search + filters; readable with 2 items or 200.
- I can waive a client's first month (or toggle "first month free"); that month shows "Free", isn't
  in due, and isn't counted in outstanding — billing resumes month 2.
- Client names show correctly (no "CLIENT" placeholder).
- Deleting a quote, recording a payment, waiving a month, marking sent, and changing status each
  create an Activity entry with the correct actor, target (quote number), and details — filterable
  in the Activity tab; a deleted quote still shows its history (logged before deletion).
- `npm run test:pricing` green; `node --check` clean; collection/payment internals never on `/q/`;
  function count stays within the Hobby limit.
