# QD Events — Stage 1 Implementation Plan

## Checkout baseline

| Project | Local path | Branch / status | Remote freshness |
|---|---|---|---|
| QD Systems | `C:\Users\mohda\OneDrive\Desktop\qdsystems\QD` | `main`, clean | `HEAD` equals fetched `origin/main` (`860c61f`); named `moose988/QD` `main` also resolves to the same commit |
| Event platform | `C:\Users\mohda\OneDrive\Desktop\wedding invitaion` | `main`, clean | `HEAD` equals fetched `origin/main` (`085539f`) |

Both checkouts were fetched for remote metadata only. QD's configured `origin` is `https://github.com/MoQudaih/QD.git`, while the requested repository is `https://github.com/moose988/QD.git`; their `main` tips currently match exactly. No working files were changed during inspection. No applicable `AGENTS.md` files were found. Keep the repositories and Vercel projects separate.

## Findings and likely implementation files

### QD Systems

- Static multi-page site with Vercel configuration and serverless booking/API routes. Production home entry is `index.html`; clean URL pages use folders such as `website-development/index.html` and shared layout/translation logic in `assets/service-page.js`, `assets/service-pages.css`, and `assets/service-header.css`.
- Add the page at `event-management/index.html` following the existing service page pattern; extend `assets/service-page.js` with its localized copy and `assets/service-pages.css` only for page-specific needs. Add discovery to the homepage “What we build” cards in `index.html` and translations in `i18n.js`. Add `https://www.qdsystems.ae/event-management` to `sitemap.xml` and provide page metadata/canonical URL consistent with sibling service pages. Existing `cleanUrls: true` supports `/event-management`.
- Languages are English (default), Arabic, Simplified Chinese, and Russian (`en`, `ar`, `zh`, `ru`). The `qd_lang` preference is retained; Arabic sets document direction to RTL. The service-page bundle already contains four-locale copy patterns.
- Keep QD’s existing header, footer, logo, and call-to-action styles. The booking modal is wired by `[data-book]` in `index.html`, posts to `/api/book`, and exposes WhatsApp fallback/contact at `wa.me/971504611123`. Reuse these actions and preserve the existing booking flow.

### Event platform

- Production entry files include `index.html` plus `home-route.js`; invitation resolution is handled by `invitation-early-route.js`, `invitations/router.js`, and `invitations/wedding-designs/registry.js`. The Layla & Zaid design is `invitations/wedding-designs/layla-zaid/index.html` with shared invitation logic in `script.js`.
- Customer and administrator sign-in are separate at `customer-login.html` and `dashboard-login.html`. Dashboard capabilities are in `dashboard.html` / `dashboard.js`; sender in `send.html` / `send.js`; side-access routes in `side.html` and `firebase-service-scopes.js`; check-in in `checkin.html` / `checkin.js`. Existing features confirm invitations, RSVP, additional guests, seating, and QR check-in. Event categories currently distinguish `wedding_engagement` and generic `celebration`; validate individual celebration types before claiming them.
- URL compatibility matters: invitation URLs use `?wedding=<id>#guest=<token>` (and may include `recipient`); auth URLs use query parameters such as `wedding`, `side`, `workspace`, and `message`. Keep existing deep paths and tokens intact. Review builders and deployment-address assumptions in `invitations/shared/invitation-data.js`, `firebase-service-scopes.js`, `share-link.js`, `fallback-redirect.js`, and login/side/check-in links when adding the custom host.
- Current root `/` is the platform home, not customer login. Root routing must open customer login for ordinary visits while preserving recognized invitation requests, query strings, hashes, and existing direct invitation routes. Avoid a blanket root rewrite that bypasses the early invitation route; cover both `/` and `/index.html` behavior.
- The isolated invitation preview already exists at `?wedding=luxury-wedding-demo&sample=1`. It uses a built-in fictional Layla & Zaid fixture, reads no live event/guest/token, and its RSVP changes stay in memory. Use this mode in the product-page phone frame. Dashboard `?demo=1` uses built-in fictional data and browser `localStorage`, not Firestore; clear/use a dedicated browser profile before capturing dashboard screenshots so no old demo edits leak into the images.
- `firebase.json` sets `frame-ancestors 'none'` and `X-Frame-Options: DENY` for Firebase Hosting. The Vercel-linked checkout currently has no `vercel.json`; verify actual response headers on the current Vercel deployment before embedding. If those restrictions are active at the chosen host, allow only the QD origin needed for the invitation frame. The iframe is cross-origin, so parent-page scripts cannot inspect its contents.

## Deployment and external setup to verify later

- Both repositories have separate Vercel project linkage; the event project is linked locally as `wedding-invitation-nlsf`. Do not relink either project. Event Firebase project configuration is present; do not expose or change credentials/configuration during this work.
- In the connection stage, confirm the correct Vercel project before attaching `events.qdsystems.ae`, obtain the DNS target from that project’s domain setup, and then configure Tasjeel DNS and verify DNS propagation and HTTPS. Do not guess a DNS record or target.
- Verify Firebase Auth authorized domains include the event subdomain, and audit generated invitation, sender, side-access, and check-in links plus redirects so they use the intended host without changing existing deployment URLs.
- Hosting constraint: the user reports Vercel Hobby. Vercel’s current terms/docs restrict Hobby use to personal/non-commercial use; business launch eligibility is unresolved and must be settled before launch. No plan change or purchase is included in this plan. [Hobby plan](https://vercel.com/docs/plans/hobby) · [Fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines).

## Stages

- [x] 1. Inspect and prepare.
- [x] 2. Build the localized product page.
- [x] 3. Add demos, screenshots, and homepage discovery.
- [x] 4. Connect the subdomain and configure routing.
- [ ] 5. Verify, publish, and check live behavior (release prep complete; publication blocked).

## Stage 2 completion

- Added the localized QD Events page at `event-management/index.html`, page-scoped theme at `assets/event-management.css`, and four-language page copy at `assets/event-management-copy.js`. Extended the service-page renderer only to support explicit page copy keys, page-specific accessible labels, translated social metadata, and translated contact destinations. Added the requested route to `sitemap.xml`.
- The page reuses the QD header, footer, language switch, and booking modal. Its call-to-action opens the existing modal through `/?book=1`; the homepage removes that one-shot parameter before opening, and no booking was submitted. The customer login link still points to the supplied current Vercel login URL. Homepage content/discovery was not changed.
- Preview command: `node _dev-server.mjs` (same server as `npm run dev`). Current local URL: `http://localhost:3000/event-management`.
- Focused browser validation passed at 360, 390, 430, and 1440 px in English, Arabic, Simplified Chinese, and Russian. Checked no horizontal overflow, localized title/description/social metadata, RTL direction, saved language through refresh, direct route refresh, native FAQ disclosure, mobile navigation, existing booking-modal opening without submission, and translated `wa.me` URLs without opening them. Homepage and `/website-development` retained their dark shared appearance. JavaScript syntax and sitemap XML/entry checks passed; no browser console or page errors remained.
- QA screenshots (outside the repository): `C:\Users\mohda\OneDrive\Desktop\QD-Events-desktop.png` and `C:\Users\mohda\OneDrive\Desktop\QD-Events-mobile.png` (full page); `C:\Users\mohda\OneDrive\Desktop\QD-Events-desktop-view.png` and `C:\Users\mohda\OneDrive\Desktop\QD-Events-mobile-view.png` (initial viewport).

## Stage 3 completion

- Replaced the preview placeholder with an on-demand, sandboxed phone iframe using the existing Layla & Zaid sample flow (`?wedding=luxury-wedding-demo&sample=1`). Its built-in fixture is fictional; sample mode skips live event, guest, seating, RSVP-token and Firebase reads, and the RSVP response lives only in memory. The page explains that demo responses are not saved. Restart reloads the invitation; Open full demo opens the same sample in a new tab. The iframe stays empty until requested. The sample supports its existing envelope opening, invitation navigation, EN/AR language switch and available sample interactions.
- Local QD preview at `http://localhost:3000` builds the event sample URL for the separate local event preview at `http://localhost:3001`. Production page code points to the currently available Vercel event app; no local address is embedded in the production route. The local page labels the planned production URL as `https://events.qdsystems.ae/?wedding=luxury-wedding-demo&sample=1`. The current Vercel sample route was opened in a browser, redirected to the Layla & Zaid design page, and displayed its sample banner. Its response currently has no CSP or X-Frame-Options restriction. The event app’s `firebase.json` still denies framing globally for Firebase Hosting; Stage 4/5 must preserve that policy unless the actual selected host needs a narrowly scoped demo-only exception.
- Captured the real dashboard in a fresh, isolated browser context at `dashboard.html?demo=1`, using the product’s fictional `Sara & Khalid` fixture. Four optimized JPEG captures are in `assets/events/`: overview (1600×1000, 115 KB), guests (1600×1000, 114 KB), seating (1600×1000, 141 KB) and mobile overview (390×844, 57 KB). No Firebase/auth requests were observed and the isolated dashboard context had no stored state. The screenshot capture replaces only visible Phone-column cells with an em dash; no contact numbers appear in the published images. The QD page uses accessible tabs with touch and keyboard controls, explicit dimensions and alt text. Captures remain English and the localized description says so.
- Added the approved `Pearlescent Champagne LZ Wax Seal.png` from the Layla & Zaid template to the QD showcase as `assets/events/layla-zaid-wax-seal.webp` (1254×1254, 254 KB), retaining its transparent background and initials. The homepage feature also uses the seal as its product preview image.
- Added a QD Events discovery feature below the existing four “What we build” offers in `index.html`, linking to `/event-management` with translated copy in `i18n.js`. It preserves the dark homepage theme and existing top navigation. The link inherits the selected language through the existing `qd_lang` storage.
- Stage 3 QD repository files: `assets/event-management-preview.js`, `assets/event-management-copy.js`, `assets/event-management.css`, `assets/events/dashboard-overview.jpg`, `assets/events/dashboard-guests.jpg`, `assets/events/dashboard-seating.jpg`, `assets/events/dashboard-mobile-overview.jpg`, `assets/events/layla-zaid-wax-seal.webp`, `event-management/index.html`, `assets/service-page.js` (localized alt/title attributes), `index.html`, `i18n.js`, and this plan. `sitemap.xml` retains the Stage 2 product-page route. Stage 3 made no changes to the event-platform repository.
- Product-page screenshots saved outside the repositories: `C:\Users\mohda\OneDrive\Desktop\QD-Events-stage3-desktop-view.png` (1440×980), `C:\Users\mohda\OneDrive\Desktop\QD-Events-stage3-mobile-view.png` (390×844), plus full-page versions `C:\Users\mohda\OneDrive\Desktop\QD-Events-stage3-desktop.png` and `C:\Users\mohda\OneDrive\Desktop\QD-Events-stage3-mobile.png`.

### Stage 3 validation

- Browser checks passed at 360, 390, 430 and 1440 px; localized mobile overflow checks passed at 360 px for English, Arabic RTL, Simplified Chinese and Russian. The separate homepage feature also had no overflow at 360, 390 or 430 px.
- Loaded and scrolled the phone demo, opened the full demo in a new tab, submitted a fictional RSVP, confirmed it appeared in memory, then restarted and confirmed the response was reset. The event-origin storage sentinel remained unchanged, there were no Firebase/Auth requests, and no browser console or page errors were observed. The embedded viewport measured 314×699 with a 3085 px scrollable invitation.
- Dashboard gallery mouse/touch-style tab selection, arrow-key navigation, mobile image sizing, alt text, and screenshot image dimensions passed. Homepage-to-product navigation preserved Russian; the homepage retained its dark background. The existing booking modal opened without submitting an enquiry, and the WhatsApp destination remained `wa.me/971504611123`.
- Focused event-platform checks passed: `node --test tests/sample-invitation.test.mjs tests/invitation-early-route.test.mjs tests/share-link.test.mjs` (11 tests). QD JavaScript syntax checks, `git diff --check`, sitemap XML parsing and product-route presence checks passed.
- Both local previews are running for review: QD product page `http://localhost:3000/event-management`; full sample invitation `http://localhost:3001/?wedding=luxury-wedding-demo&sample=1`.

## Stage 4 completion — 2026-10-19

- Verified the event checkout’s `.vercel/project.json` linkage and Vercel CLI project/deployment metadata. The confirmed project is `wedding-invitation-nlsf` (`prj_slfgifedQw8rHhxemJ7rtNGwxNjk`, team `moose988s-projects`); latest ready production deployment `dpl_H1c9zRNADkn91TqA48W5PmK3qkbs` lists `wedding-invitation-nlsf.vercel.app` among its aliases. The QD marketing project was not touched. Vercel MCP requests returned a scope 403, so the already-authenticated, explicitly scoped Vercel CLI was used for inspection and domain setup.
- Added `events.qdsystems.ae` to that event-platform project. Vercel reports the domain verified, correctly configured, and with no DNS conflicts. It supplied CNAME target `c3e81b52c322ed98.vercel-dns-017.com.`. Authoritative servers are `ns3.tasjeel.ae` and `ns4.tasjeel.ae`; both now return that CNAME, and Cloudflare’s public resolver returned it as well. The record was added in Tasjeel as `events` / CNAME / TTL `14440` (the form’s default). Existing apex A, `www`, Zoho MX, SPF, verification, and DKIM records were left intact. Nameservers were not changed.
- HTTPS checks through the Vercel-supplied edge address returned 200 for `/`, the sample query, `/customer-login.html`, and direct dashboard, sender, side-access, and check-in paths. TLS validation succeeded. The default Windows/Chrome resolver still has a cached “name not resolved” result, so those clients did not resolve the new host directly yet; authoritative DNS, Cloudflare DNS, and Vercel configuration agree. This local resolver cache is recorded rather than repeatedly polled.
- The served Vercel responses for the root and sample route include neither CSP nor `X-Frame-Options`, so the product-page iframe is not blocked on the current Vercel host. Firebase Hosting’s global frame denial remains untouched and is not the selected platform host.
- Firebase project identified from the event app config and confirmed in Firebase Console as `weddinginvitaion-b4f36`. Authentication currently enables Email/Password only; Firebase’s Authorized Domains screen describes its domain allowlist as applying to Phone, Google, and third-party OAuth redirects. `events.qdsystems.ae` is not in the list, and no domain was added because this app’s current sign-in flow uses `signInWithEmailAndPassword`, not an OAuth redirect.
- Changed the event app’s plain `/` and `/index.html` routing to open `customer-login.html` before the invitation page paints. Root invitation context is detected by key presence, so valid, invalid, blank, and incomplete `wedding`, `guest`, `recipient`, and `sample` parameters/fragments remain on the invitation path; `demo=1` and non-root routes remain unchanged. Existing invitation redirects continue carrying query and hash values. Share-link creation on `events.qdsystems.ae` retains that origin and its wedding, guest, and recipient values.
- Updated the QD Events source links to the verified custom host: customer login now targets `/customer-login.html` (the customer login page, not administrator sign-in), and the sample link retains `?wedding=luxury-wedding-demo&sample=1`. Local preview still switches the demo to port 3001. Production link changes are in the working tree only; neither project was deployed.
- Event app files changed in Stage 4: `home-route.js`, `index.html`, `tests/home-route.test.mjs`, `tests/share-link.test.mjs` (custom-host origin coverage), `tests/sample-invitation.test.mjs`, and `tests/layla-luxury-routing.test.mjs` (updated a stale cache-version assertion). `share-link.js` behavior is unchanged. QD files changed: `assets/event-management-preview.js`, `event-management/index.html`, and this plan.

### Stage 4 focused verification

- Passed 19 focused event-platform tests: `node --test tests/home-route.test.mjs tests/share-link.test.mjs tests/invitation-early-route.test.mjs tests/sample-invitation.test.mjs tests/invitation-refresh-url.test.mjs tests/layla-luxury-routing.test.mjs`.
- Passed JavaScript syntax checks for `home-route.js`, `share-link.js`, and `tests/home-route.test.mjs`, plus `git diff --check`.
- Local browser opened the plain root and landed on Customer Access; the sample root query redirected to the Layla & Zaid sample and remained intact after refresh; an unmapped event ID stayed on the root error state (“Invitation unavailable”) instead of opening login. No credentials were entered or authentication action submitted.
- The QD production page source contains no localhost URLs. Its local preview still constructs the sample link from the local event server only when QD is served on port 3000.

### Stage 4/5 dependencies

- Stage 5 must first deploy the routing change to the verified event project, then smoke-test `/` and `/index.html` as customer login, invitation IDs and guest/hash credentials, the sample invitation, invalid-invitation error state, refresh, and direct dashboard/sender/side/check-in/assets. Confirm the domain’s normal resolver and HTTPS from a client without a stale negative cache.
- The QD page’s demo and customer-login links now target `events.qdsystems.ae` in source; deploy the QD site only after the event routes are live and verified. Then open the embedded and full sample from the production marketing page and recheck iframe headers. Firebase Auth settings require no change unless a redirect-based provider is later enabled.
- The custom domain currently serves the already deployed event app. Its deployed `home-route.js` still redirects a plain root visit to `dashboard-login.html`; Stage 4’s new customer-login root routing and QD link edits are not live until Stage 5. The old Vercel hostname remains attached and working. No manual DNS action remains; only the local Windows/Chrome negative DNS cache has not caught up yet.
- The Vercel Hobby commercial-use constraint remains unresolved; resolve eligibility before a commercial launch. No plan change, purchase, upgrade, deployment, commit, push, migration, or real customer-data edit was made.

### Stage 5 deployment order and rollback

1. Resolve the recorded Vercel Hobby commercial-use constraint before a commercial launch; do not bypass plan terms or purchase an upgrade as part of this stage.
2. Deploy the event-platform routing changes to `wedding-invitation-nlsf` and keep `wedding-invitation-nlsf.vercel.app` attached. Do not change DNS during that deployment.
3. Verify the deployed root and direct production routes, sample flow, invalid invitation state, refresh behavior, TLS, and absence of framing restrictions on the sample.
4. Deploy the QD marketing changes that use `https://events.qdsystems.ae/customer-login.html` and `https://events.qdsystems.ae/?wedding=luxury-wedding-demo&sample=1`; then test both the iframe and full-demo link from the production page.
5. If event routing fails, roll the event Vercel project back to its previous deployment; the custom domain stays on that project and the old Vercel hostname remains available. If the domain connection itself must be undone, remove only the `events.qdsystems.ae` project-domain binding and Tasjeel `events` CNAME, restoring its prior no-record state. If the QD page fails, roll back only its Stage 2/3/4 product-page and discovery release, leaving the event project and existing DNS records intact.

## Focused validation and rollback

- Validate the page at desktop and mobile widths, all four locales including Arabic RTL, metadata/canonical/sitemap, existing booking and WhatsApp actions, and homepage discovery. Verify the sample invitation’s RSVP remains isolated; test invitation root/deep-link preservation with query and hash values; exercise customer login at the subdomain root. Check iframe headers and generated links on the deployed preview before production connection.
- Use existing focused tests where available (`tests/sample-invitation.test.mjs`, `tests/invitation-early-route.test.mjs`, `tests/share-link.test.mjs`) plus targeted route/browser checks. Do not run the full test suite for these small changes.
- Keep changes scoped to each repository. If a release fails, revert only the QD Events page/discovery changes in QD and the routing changes in the event project; restore the recorded prior DNS values if a connection was made. Preserve existing routes, project URLs, and unrelated work.

## Open blockers / information needed

- No source-code information is needed from the user for planning.
- Before commercial launch, resolve the Vercel Hobby commercial-use constraint. The event project, Vercel DNS target, Tasjeel DNS access, and Firebase Auth settings were verified in Stage 4.
- No specific birthday, gender reveal, or graduation support claim is confirmed yet; validate product workflows and category handling before publishing those claims.

## Stage 5 final verification — 2026-10-19

### Status and publication gate

### Completed

- Release diff audit, project-linkage check, production-deployment/rollback inventory, source scans, focused checks, DNS-cache retry, local QD browser verification, and old production-host browser smoke checks are complete. Details and limitations are recorded below.
- Deployment order remains event platform first, then QD only after event routes work. No deployment was triggered by either Git or CLI.

### Blocked

- Production publication is **blocked** because the Vercel team `moose988s-projects` is still on the active `hobby` plan (`billing.plan=hobby`, `billing.status=active`), and this is a commercial QD Events product. Vercel's current [Hobby plan terms](https://vercel.com/docs/plans/hobby) restrict Hobby to personal/non-commercial use; its [Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines) say commercial use requires Pro or Enterprise. Stage 5 forbids upgrading, purchasing, or bypassing the restriction, so no deployment, commit, or push was made. This is a hosting blocker, not an implementation blocker.

### Release inventory and project linkage

- No `AGENTS.md` instructions were found in either checkout. Both diffs contain only the planned QD Events work plus its checkpoint: QD changes are `assets/service-page.js`, `i18n.js`, `index.html`, `sitemap.xml`, `assets/event-management-copy.js`, `assets/event-management-preview.js`, `assets/event-management.css`, `assets/events/*`, `event-management/index.html`, and this plan. Event-platform changes are `home-route.js`, `index.html`, and the four focused test files `tests/home-route.test.mjs`, `tests/share-link.test.mjs`, `tests/sample-invitation.test.mjs`, and `tests/layla-luxury-routing.test.mjs`. No unrelated files were included. The image files are the intended dashboard and wax-seal assets.
- Event platform Vercel project: `wedding-invitation-nlsf`, ID `prj_slfgifedQw8rHhxemJ7rtNGwxNjk`, linked by Vercel to GitHub `moose988/wedding-invitation`, branch `main`; local `.vercel/project.json` agrees.
- QD Vercel project: `qd`, ID `prj_9gOIxmKRION7X3ygj9i7YmCIEfw1`, linked by Vercel to GitHub `moose988/QD`, branch `main`; local `.vercel/project.json` agrees. The local QD checkout's `origin` is `https://github.com/MoQudaih/QD.git`, while Stage 1 recorded `https://github.com/moose988/QD.git` as the intended repository and matching `main` tip at that time. This discrepancy is confirmed; the remote was not changed and nothing was pushed to a guessed repository.
- Production rollback anchors confirmed through the scoped Vercel CLI: QD current ready deployment `dpl_J5QpjbT9GxbDpZ3SirjBCUn2YjMt` (`https://qd-6qk8qjuu5-moose988s-projects.vercel.app`, aliases include `https://www.qdsystems.ae` and `https://qdsystems.ae`); event platform current ready deployment `dpl_H1c9zRNADkn91TqA48W5PmK3qkbs` (`https://wedding-invitation-nlsf-ejfgi4cb4-moose988s-projects.vercel.app`, alias `https://wedding-invitation-nlsf.vercel.app`). If a future release regresses, use the supported `vercel rollback <deploymentId> --scope moose988s-projects` command with the appropriate recorded ID. Keep domain bindings and DNS intact during application rollback. There are no new commit SHAs or deployment IDs for this stage.
- Release-source scans found no localhost/127.0.0.1 URLs, debugger statements, source-map references, or common secret patterns in the changed QD production files. The QD product page's absolute asset references resolve to files in the checkout; its logo, dashboard image, and wax-seal image loaded in the browser. The local-preview script switches the sample URL to port 3001 only for a local QD preview; production destinations are `https://events.qdsystems.ae`. No Firebase configuration, rules, indexes, Functions, or authentication settings were changed. Existing booking-console logging in the QD homepage is pre-existing, not part of this change.

### DNS and live platform checks

- After `Clear-DnsClientCache`, ordinary Windows resolution still returns `DNS name does not exist`, and ordinary `curl.exe -I https://events.qdsystems.ae/` fails with `Could not resolve host`. A fresh ChatGPT in-app browser context also returned `ERR_NAME_NOT_RESOLVED`. No system DNS settings or hosts file were changed. A direct query to Cloudflare `1.1.1.1` resolves the configured CNAME to `c3e81b52c322ed98.vercel-dns-017.com`; this confirms an external DNS answer, not ordinary browser reachability from this machine. Stage 4's forced-edge TLS checks are not counted as browser verification.
- On the existing stable `.vercel.app` host, a normal browser loaded the fictional Layla & Zaid sample and displayed its sample banner. The current production root still redirects to the planner/admin login, confirming the Stage 4 customer-root routing is not live. Direct unauthenticated `/dashboard.html` correctly redirects to `dashboard-login.html?message=session-required`; `/dashboard-login.html`, `/send.html`, `/side.html`, and `/checkin.html` load their expected page titles. These route observations do not establish authenticated authorization or persistence.
- `events.qdsystems.ae` and the new QD login/demo journey could not be exercised in an ordinary browser because local resolution fails. The QD production page has not been deployed, and the customer-login root change is still unpublished.

### Local product-page verification

- The QD preview at `http://localhost:3000/event-management` loaded. Document width did not exceed viewport width at 360, 390, 430, or 1440 px. English, Arabic, Simplified Chinese, and Russian switching worked; Arabic set `dir=rtl` and remained selected after refresh. The customer login destination is `https://events.qdsystems.ae/customer-login.html`.
- The interactive demo starts only after clicking Load, opens the local fictional sample at `http://localhost:3001/?wedding=luxury-wedding-demo&sample=1`, and Restart retains/reloads that sample route. The dashboard overview and wax-seal assets loaded. The embedded sample and click targets were not connected to authenticated/customer data; Stage 3's isolation checks remain applicable. No browser console errors were observed in this Stage 5 local product-page session.
- The local homepage contains the QD Events discovery card linking to `/event-management`. Its existing `/?book=1` action opened the booking modal and removed the one-shot parameter; no enquiry was submitted. The product-page WhatsApp destination and the homepage/service-page regression checks from Stage 2/3 remain unchanged and previously passed. No WhatsApp link was opened and no message was sent.
- Focused event-platform suite rerun: 19/19 pass (`node --test tests/home-route.test.mjs tests/share-link.test.mjs tests/invitation-early-route.test.mjs tests/sample-invitation.test.mjs tests/invitation-refresh-url.test.mjs tests/layla-luxury-routing.test.mjs`). `node --check` passed for the changed routing/test files; QD changed JavaScript syntax checks and both repositories' `git diff --check` passed. No site build command is configured for either static project.
- Existing Stage 2/3 screenshots remain available outside the repositories: `C:\Users\mohda\OneDrive\Desktop\QD-Events-stage3-desktop-view.png`, `C:\Users\mohda\OneDrive\Desktop\QD-Events-stage3-mobile-view.png`, `C:\Users\mohda\OneDrive\Desktop\QD-Events-stage3-desktop.png`, and `C:\Users\mohda\OneDrive\Desktop\QD-Events-stage3-mobile.png` (all files confirmed present).

### Unverified and next actions

- Commercial publication, custom-host root/login/sample behavior in an ordinary browser, the production QD page, and the end-to-end journey remain blocked until hosting eligibility is resolved on an allowed plan. Do not publish to the Hobby project as a workaround.
- No customer/admin credentials or dedicated isolated live test event were supplied. Authentication destination, customer/admin roles, event visibility, persistence after reload, guest editing, invitation creation/link opening, RSVP persistence, seating/My Seats, sender/side authorization, and QR/check-in writes remain unverified against live authenticated data. No real records were edited and no permissions were weakened.
- Custom-host root/login, iframe from `www.qdsystems.ae`, live QD 4-locale and responsive checks, live homepage discovery, live booking/WhatsApp, and live metadata/canonical/sitemap checks remain unpublished checks. Stage 2/3 local browser checks passed; screenshots above document that local product page.
- Once hosting is permitted without violating the no-upgrade/no-cost constraint, deploy only the event-platform changes first, verify ordinary browser behavior on `events.qdsystems.ae`, then deploy only the intended QD Events changes to the confirmed QD Vercel project/repository. Recheck the local QD remote discrepancy before any Git push; never change the remote or push to an inferred repository. Use the recorded Vercel rollback IDs if a published release regresses.

## Publication continuation — 2026-10-19

The user has explicitly superseded the earlier Stage 5 instruction to stop publication solely because the team is on Vercel Hobby. Proceed using the existing account without purchase or upgrade. This does not establish commercial eligibility under Vercel terms, and no provider restriction may be bypassed. No force-push, unrelated Firebase deployment, or real customer-data modification is authorized.

### Verified event-platform publication

- Vercel Git linkage confirmed `moose988/wedding-invitation`, production branch `main`; local repository remote matches. Prior production rollback deployment: `dpl_H1c9zRNADkn91TqA48W5PmK3qkbs`.
- Pushed the intended event-platform routing commit `6ec159d` (full SHA recorded in Git) to `main`. Vercel's existing Git integration produced one Ready production deployment: `dpl_FtqcPvavD9NZxmKNigDBDM51hk59`, alias `https://events.qdsystems.ae`. No manual/duplicate deployment was started. The old `https://wedding-invitation-nlsf.vercel.app` alias remains attached and its sample route works.
- An ordinary browser loaded `https://events.qdsystems.ae/` and redirected to customer access at `/customer-login.html`. The root sample URL with `wedding=luxury-wedding-demo&sample=1#guests` opened the Layla & Zaid sample, preserved query/hash, and displayed the Sample invitation banner. The protected `/dashboard.html` redirected to planner sign-in with `message=session-required`. Both the custom hostname and old `.vercel.app` sample URL loaded through a normal browser; this is not inferred from HTTP status or forced-IP access.
- OS/PowerShell default DNS and `curl.exe` still report NXDOMAIN for the custom hostname, while the in-app browser successfully resolves it. Cloudflare DNS had previously returned the configured CNAME. This records a client resolver discrepancy; it is not counted as a global DNS failure or as universal DNS propagation.

### QD release linkage and publication

- Vercel project `qd` (`prj_9gOIxmKRION7X3ygj9i7YmCIEfw1`) is linked to `moose988/QD`, production branch `main`. The working checkout's `origin` remains `https://github.com/MoQudaih/QD.git`; it was not overwritten. Before publication, both the linked repo's `main` and local `HEAD` were `860c61f21cbcb735a3139c5efaf7a657c3ca5974`.
- QD rollback anchor before the release: `dpl_J5QpjbT9GxbDpZ3SirjBCUn2YjMt`.
- The scoped QD release consists only of the localized Events product page and homepage discovery work: `assets/service-page.js`, `i18n.js`, `index.html`, `sitemap.xml`, `assets/event-management-copy.js`, `assets/event-management-preview.js`, `assets/event-management.css`, `assets/events/*`, `event-management/index.html`, and this checkpoint.
- Source/diff audit and `git diff --check` passed. The event-platform focused suite passed 19/19 before its deployment. QD syntax checks and previous local browser checks are detailed above. QD production commit and Vercel deployment ID are recorded in the final continuation below after the Git-triggered production deployment completes.

### Remaining verification limits

- No authorized test credentials or dedicated isolated live event were supplied. No live login, RSVP persistence, booking submission, authenticated dashboard mutation, or real customer record was attempted. These remain unverified.
- Vercel Hobby commercial-use eligibility remains unresolved. The user authorized proceeding on the existing account but no upgrade was made and no claim of commercial eligibility is made.
- Complete ordinary-browser route/assets checks and QD production verification are recorded after the QD production deployment below.
