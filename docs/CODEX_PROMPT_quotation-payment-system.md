# Codex Prompt — Quotations, Payments & Collections system

> Build the full quotation + payment tracking system on QD web. Most of the **backend already
> exists** — extend it, don't rebuild. Read this whole file first. Keep `npm run test:pricing`
> green and `node --check` clean. Paste everything between the rules into Codex.

---

## WHAT ALREADY EXISTS (reuse, do not duplicate)

- Firestore **`quotes`** collection. Each quote doc has: `quoteNumber` (e.g. Q-2026-007), `status`
  ('draft'), `customer`, `lineItems`, `pages`, `terms`, `notes`, `payments[]`, `paid`, `balance`,
  `paymentStatus` (Unpaid/Partial/Paid), `lastPaymentAt`, `lastSentAt`, `createdAt`, `updatedAt`,
  `passcodeHash`, `_passcodePlain`, `estimateSnapshot`.
- APIs: `api/quote-create.js`, `api/_lib/create-quote-from-estimate.js`, `api/quote-payment.js`
  (GET payment summary / POST append payment, by `quoteRef`, admin-only), `api/_lib/quote-payments.js`
  (normalize/compute, `getQuotePaymentStatus`, `buildQuotePaymentView/Fields`), `api/quote-id.js`,
  `api/_lib/quote-counter.js`, `quote-save.js`, `quote-verify.js`.
- Admin **`payments` tab** in `admin.js`: `renderPaymentsManager()` (currently a SINGLE-quote
  lookup by ref → `loadQuotePaymentsByRef` → `/api/quote-payment`), `renderPaymentsTable()`.
- Client page **`q/quote.js` + `q/quote.css`**: passcode-gated, renders a basic quote.
- "**+ Generate Quotation**" action already exists in the admin (`data-action="generate-quote"`).

## GOAL

A full follow-up system: every quotation we create is saved, listed, searchable by reference
number, with status (sent / accepted / paid) and free-text remarks — so we can see at a glance
who we quoted, who we sent to, who paid, who hasn't. Plus the client-facing quote page must use
the professional template (see `docs/quote-template-reference.html`).

It also includes a **collections cockpit**: open the app any day and instantly see who owes money
today — recurring monthly care fees (due on each client's go-live anniversary) and outstanding
milestone payments — split into overdue / due-today / upcoming, with a daily email reminder, so
nothing slips as we scale.

## PART A — List endpoint (NEW)

`GET /api/quotes` (admin-only via `requireAdmin`): return all quotes from the `quotes` collection,
newest first. Support `?q=` (match on `quoteNumber` or `customer.businessName`, case-insensitive)
and `?status=` (filter). Return only safe fields — **never** `passcodeHash`, `_passcodePlain`, or
`estimateSnapshot` internals like margin/cost/floor. Shape per row:
`{ id, quoteNumber, businessName, createdAt, total, status, paid, balance, paymentStatus, lastSentAt, remarks }`.
Compute `total` via `computeTotals(lineItems, vatPercent, pages.price)`.

## PART B — Quote doc: status + remarks + sent (extend)

- Status workflow values: `draft · sent · accepted · paid · declined` (keep existing `paymentStatus`
  Unpaid/Partial/Paid as the derived payment state; `status` is the manual workflow state).
- Add a `remarks` string field (default '').
- NEW `POST /api/quote-update` (admin-only): `{ ref|id, status?, remarks?, markSent? }` → update
  `status` and/or `remarks`; if `markSent:true`, set `status:'sent'` and `lastSentAt` = server
  timestamp. Update `updatedAt`. Reuse the quote-lookup-by-ref helper already in `quote-payment.js`.

## PART C — Admin "Quotations" view (upgrade the `payments` tab)

Rename the tab label to **"Quotations"** (keep tab key `payments` to avoid breaking routing, or
add a `quotations` key — your call, but keep it one tab). Replace the single-ref-only manager with:

1. **List table** (calls `GET /api/quotes`): columns — Ref (quoteNumber), Client, Date, Total,
   **Status** (chip), **Paid**, **Balance**, **Last sent**. Newest first.
2. **Search by reference number** (and client name) — a search box bound to `?q=`. Must work at
   scale. **Status filter** chips (All · Draft · Sent · Accepted · Paid · Declined).
3. **Row → detail panel/drawer** showing:
   - Header: quoteNumber, client, created date, status.
   - **Status control** (dropdown: draft/sent/accepted/paid/declined) → `POST /api/quote-update`.
   - **"Mark as sent"** button → `quote-update { markSent:true }` (sets status + lastSentAt).
   - **Remarks** textarea + Save → `quote-update { remarks }`. (e.g. "Paid 30%, follow up Mon".)
   - **Payments**: existing `renderPaymentsTable` + the existing add-payment form
     (`/api/quote-payment`), showing Total / Paid / Balance.
   - **Client link**: copy `https://qdsystems.ae/q/<id>` + the passcode (from create response;
     do not expose `passcodeHash`).
   - **View / Print** the professional quote (Part E).
4. Keep a quick "jump to ref" search that opens a quote directly.

## PART D — On create, go to the quotation

After **+ Generate Quotation** (and the Pricing-tab "Create quote") succeeds, route to the
Quotations tab and open that new quote's detail (by id/ref). So creating a quote lands you on its
follow-up page, as requested.

## PART E — Client `/q/` page: professional template

Rebuild `q/quote.js` + `q/quote.css` to render the design in
`docs/quote-template-reference.html` (branded header with QD monogram, From/Prepared-for, scope
banner, grouped line items with **✓ Included** sub-bullets, totals, payment schedule, terms,
acceptance). To get the grouped sub-bullets: in `app/lib/estimate-quote.js`, attach each priced
line's `includes[]` (already present on FOUNDATIONS / ADDONS / modules in the catalog) to the
corresponding `lineItems` entry, so the client page can render parent + included sub-items.
**Never** render internal fields (margin, delivery cost, floor, approval, payments) on `/q/`.
Keep the passcode gate.

## DATA SAFETY / RULES

- All new admin endpoints use `requireAdmin`. Payment/remarks/status are internal — never on `/q/`.
- Search by `quoteNumber` must be indexed (add to `firestore.indexes.json` if needed).
- Don't change pricing logic or the engine. `npm run test:pricing` stays green; `node --check`
  passes on changed JS. Update `firestore.rules` only if a new read path needs it (keep `quotes`
  admin-only for reads except the passcode-verified `/q/` path that already exists).

## PART F — Recurring monthly care (the "due today" engine)

When a project goes live, the admin sets a **Go-live date** on the quote (a "Mark go-live" action
in the detail). That sets `goLiveDate`, `billingDay` = day-of-month of go-live (clamped to month
length, so the 31st → last day of shorter months), and `careMonthly` = the quote's care-plan
monthly fee (`estimateSnapshot.monthly.amount`; 0 = no care plan, no recurring).

Recurring charges are **computed, not pre-stored**: for every month from `goLiveDate` through
today, a care charge of `careMonthly` is due on `billingDay`. Collected months are tracked in
`careCollected: ['YYYY-MM', …]`. A month is paid if its key is in `careCollected`, else it is due
(today) or overdue (past). "Mark collected" for a month adds its `YYYY-MM` key AND appends to
`payments[]` (note `Care YYYY-MM`) so the paid/balance ledger stays consistent.

## PART G — Milestone payments (30% / 70%)

Derive two milestones from the quote total: `advance` = round(total × 0.30), `final` = total −
advance, stored as `milestones:[{ key, label, amount, dueDate?, status, collectedAt }]`. The admin
can set an optional due date per milestone and **Mark collected** (sets status + appends to
`payments[]`). Reminders: advance becomes due when `status:'accepted'` and not collected; final
becomes due at go-live and not collected.

## PART H — Collections cockpit (NEW)

`GET /api/collections?on=YYYY-MM-DD` (admin-only; default `on` = today) computes, across ALL
quotes, every payment item that is due — `{ quoteId, quoteNumber, client, type ('Monthly care' |
'30% advance' | '70% completion'), amount, dueDate, bucket }` — bucketed as **Overdue**,
**Due today**, and **Upcoming (next 7 days)**, with a total per bucket. This is the single source
of truth for both the UI and the email digest.

In the admin, add a **Collections** view (its own tab, or the top of the Quotations tab) showing
the three buckets with amounts and a **count badge** on the tab (e.g. "Collections 5"). Each row:
client, ref, what's owed, due date, amount, and **Mark collected** (→ Part F/G) + open the quote.
Overdue in red, due-today highlighted. This is the screen QD opens every morning.

## PART I — Daily email reminder (scheduled)

Add a Vercel Cron (in `vercel.json` `crons`) that calls `GET /api/collections-digest` once daily
at ~08:00 Gulf time (`"0 4 * * *"`, UTC). The endpoint is protected by a **`CRON_SECRET`** env var
(reject requests without the matching secret header/query). It runs the Part H logic for today and
emails the admin list (`QD_ADMIN_EMAILS`) via the existing Zoho SMTP / nodemailer setup used by
`api/contact-email.js`. Subject e.g. **"QD Collections — 5 due today, 2 overdue (AED 1,043)"**;
body groups Overdue then Due-today with client, ref, amount, due date, and a link to each quote.
Internal only — never email the client.

> Owner must add **`CRON_SECRET`** to Vercel env (like `QUOTE_PASSCODE_SALT`) — I'll generate one.

## ACCEPTANCE

1. Creating a quote saves it and lands on its detail in the Quotations tab.
2. Quotations tab lists ALL quotes; searching a reference number finds it instantly; status filter
   works.
3. Each quote shows status, paid/balance, remarks; I can change status, mark as sent (sets
   lastSentAt), add remarks, and log a payment — all persisted.
4. The client `/q/<id>` page renders the professional template (grouped, itemized, branded) behind
   the passcode, with no internal numbers.
5. A **Collections** view shows Overdue / Due-today / Upcoming with amounts and a count badge; it's
   the screen to open each morning. A care-plan client that went live on the 7th shows a charge due
   every 7th; marking it collected logs a payment and clears that month. 30% / 70% milestones appear
   and can be marked collected.
6. A **daily email digest** of due + overdue payments reaches `QD_ADMIN_EMAILS` (test by calling
   `/api/collections-digest` with the `CRON_SECRET`); clients are never emailed.
7. `npm run test:pricing` green; `node --check admin.js q/quote.js` clean; existing quote create /
   verify / payment flows still work; collections & payment data never appear on `/q/`.
