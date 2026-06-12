# QD Systems Pricing Model — Traceability Document

**Version:** 2026-06-11 · **Currency:** AED · **VAT:** 5% (UAE)
**Code:** `app/lib/pricing-model.js` (single source of truth) → consumed by `app/lib/brief-parser.js`, `app/lib/quote-catalog.js`, `app/lib/quote-prefill.js`, and the admin **Pricing** tab + quote drawer in `admin.js`.

## Component-based pricing (primary model — not package based)

An offer is priced as **base build + pages + features** (+ care plan, − capped founding-client discount). Foundations are arithmetic derivations of the package anchors (anchor − pages × 250), so foundation + N pages reproduces each anchor exactly:

| Foundation | Base (AED) | Derivation |
|---|---|---|
| Essential build | 4,650 | Launch anchor 5,900 − 5 × 250 |
| Professional build | 7,400 | Growth anchor 9,900 − 10 × 250 |
| Premium build | 10,900 | Business Pro anchor 14,900 − 16 × 250 |

Pages always billed per page: **250 standard / 450 landing**. Self-contained system builds (online store ≤50 / 50–250 products, internal ops MVP, standalone chatbot) reuse the package anchors 1:1. Quick-offer templates are priced as the **sum of their components** — never a separate number. Add-ons covered by the selected base are shown at AED 0 ("included"), never dropped and never double-charged.

## UAE market verification (independent of the original research)

Fetched directly on 2026-06-11 (R30–R32): RDS Dubai guide, Tenet Dubai 2026 guide (450+ projects), Upscape Tech. The engine checks every estimate against these bands and warns above/below: simple site 2,000–12,000 · CMS business site 7,000–55,000 · e-commerce 8,000–110,000 · custom system 15,000–145,000. **Conclusion: QD prices sit lower-middle of the verified UAE market — not overcharging.**

## Provenance

All numbers derive from the deep-research report *"QD Systems UAE Web and Digital Systems Pricing Benchmark"* (June 11, 2026), built on 29 public sources (R01–R29). A second uploaded document ("prices for QD") contained only the research prompt, no data — it was not used as a source.

Four load-bearing anchors were independently re-verified live on 2026-06-11:

| Anchor | Report claim | Verified live | Status |
|---|---|---|---|
| WordPress.com Custom Development (R05) | from US$5,000 | $5,000 starting price | ✓ exact |
| WP Buffs maintenance (R26) | $89 / $179 / $239 / $359 per month | identical | ✓ exact |
| GloriaFood (R20) | core free; promo $19/mo; POS $49/mo/location | identical | ✓ exact |
| Retool (R09) | Team $10 builder + $5 user; Business $50 + $15 | identical | ✓ exact |

## Pricing discipline rules

1. **`basis: 'market'`** — the price range is traceable to public source refs (R##) listed on the item.
2. **`basis: 'positioning'`** — a QD strategic price. Not a market claim. Positioned between the public freelancer/template band (R29: ≈AED 1,100–2,200 for template jobs) and custom-build anchors (R05/R29: ≈AED 18,362–110,175+).
3. **Usage costs are always pass-through** — WhatsApp/SMS (R16, R17), Maps API (R28), payment fees, AI bot outcome fees (R13). Never bundled flat without a cap.
4. **Mid tier** = arithmetic midpoint of the documented low–high range, rounded to nearest 50. A convenience default, not a sourced number.
5. **Recommended commercial structure** (from the report): three-line quotes — (a) QD build fee, (b) third-party software billed direct/at cost, (c) QD monthly care fee.

## Packages (one-time build, AED)

| Package | Price | Basis |
|---|---|---|
| QD Launch Site | 5,900 | positioning (above R29 freelancer band, below R05) |
| QD Growth Website | 9,900 | positioning (below R05 US$5,000 anchor) |
| QD Business Pro Website | 14,900 | positioning (under custom-build anchors R05/R29) |
| QD Commerce Start | 12,900 | positioning (vs R03/R04 + implementation) |
| QD Commerce Growth | 21,900 | positioning (vs R03, R22, R23) |
| QD Booking Pro | 13,900 | positioning (above software cost R18/R19/R21 + workflow labour) |
| QD Ordering Pro | 13,900 | positioning (vs R18/R20 software + integration labour) |
| QD Ops Dashboard MVP | from 18,900 | positioning (supported by R09–R11 + R05) |
| QD AI Chatbot Launch | from 2,900 | positioning (platform/API usage pass-through, R12–R15) |

## Add-ons (one-time, AED)

| Add-on | Low | High | Basis / refs |
|---|---|---|---|
| Extra standard content page | 250/page | — | positioning |
| Extra advanced landing page | 450/page | — | positioning |
| Additional language enablement | 1,500/language | — | positioning |
| Quote / calculator / smart form | 1,500 | 3,500 | market (R24) |
| CRM setup & pipeline customisation | 1,900 | 4,900 | market (R06–R08) |
| Booking engine integration | 1,500 | 3,900 | market (R18, R19, R21) |
| Ordering system integration | 2,500 | 5,900 | market (R20) |
| Payment gateway integration | 1,500 | — | positioning |
| Reviews integration | 750 | 1,500 | market (R22) |
| Loyalty programme integration | 1,500 | 3,500 | market (R23) |
| AI chatbot setup / upgrade | 2,900 | 6,900 | market (R12–R15) |
| Dashboard reporting pack | 2,500 | 6,900 | market (R09–R11) |
| Staff / driver / branch role logic | 3,900 | 8,900 | positioning |
| File upload, approvals, document trail | 1,250 | 3,500 | positioning |
| Google Business Profile setup | 600 | — | positioning (tool free, R27) |
| Basic map embed / branch map | 750 | — | positioning |
| API-based map / locator | from 2,500 + API fees | — | positioning (R28 pass-through) |
| SEO launch pack | 1,500 | — | positioning |

## Monthly care plans (AED/mo)

Benchmarked against WP Buffs' verified public range ≈ AED 327–1,318/mo (R26).

| Plan | Monthly | Scope summary |
|---|---|---|
| Care Lite | 249 | Updates, backups, uptime, minor edits, monthly report |
| Care Growth | 599 | + improvement task, form testing, GA4 review, SEO hygiene |
| Care Commerce | 1,299 | + checkout/order-flow checks, plugin monitoring, promo support |
| Portal Ops | 1,999 | Dashboard/roles/workflow support, monthly ops review |
| Automation Desk | 349 + usage | Chatbot tuning, CRM automations, campaign support |

## Industry bands (from the report)

| Industry | Build band | Monthly band |
|---|---|---|
| Clinics / salons / med spas | 9,900–15,900 | 499–799 |
| Restaurants / cafés / dark kitchens | 11,900–18,900 | 599–899 |
| Real estate / brokerages | 14,900–24,900 | 699–1,099 |
| Professional services / contractors | 8,900–14,900 | 399–699 |
| Training / education / coaching | 12,900–19,900 | 599–999 |

## Items NOT covered by the benchmark

- `logo-design` (AED 1,200) — pre-existing QD estimate, kept, labeled as such.
- Feature-catalog entries with `defaultPrice: 0` + `scopeNote` (inventory management, order tracking standalone, gallery, blog, newsletter, user accounts, memberships, social feeds) — no clean public standalone benchmark exists; they are either included in packages or priced per scope. **Do not invent prices for these; quote per project.**

## How to update prices

Edit **only** `app/lib/pricing-model.js`. The quote catalog, submission prefill, quote drawer, and Pricing tab all read from it. When changing a number, update its `basis`/`refs` and bump `PRICING_VERSION`. Re-verify anchors periodically (sources list with URLs is in `SOURCES`).
