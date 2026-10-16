# APS unified neighborhood release — implementation and recovery report

**Latest financial verification:** [Final financial verification and hosted preparation](APS_PR159_FINAL_FINANCIAL_VERIFICATION.md). 614 Node / 201 Deno tests pass. Paid service conversion is confirmed blocked before writes; it is not certified complete. Fresh production checks were metadata-only.


**Current checkpoint:** [Revised release strategy and verification](APS_PR159_REVISED_RELEASE_STRATEGY.md). 597 Node / 201 Deno tests pass; local native concurrency verified. Paid conversion remains incomplete; hosted and full-recovery gates remain open. No merge/deployment authorization is inferred. Earlier counts and infrastructure recommendations below are historical.


Latest infrastructure investigation: [Comprehensive existing-infrastructure discovery](APS_EXISTING_INFRASTRUCTURE_DISCOVERY.md). Six APS checkout configurations, runtime/store locations, running services, CLI and connected project inventories, extension files, recovery scripts and historical setup were inspected. No compatible isolated target was found. The implementation and 592/201-test evidence from `2564921` are preserved; release gates remain open.

## Release-gate follow-up — 2026-10-16

**Final release decision: BLOCKED.** Owner authorization now permits merge/deploy automatically **after** all mandatory gates pass. It does not waive recovery, hosted lifecycle, or financial-history conversion. PR #159 remains draft and production is unchanged.

| Mandatory gate | Status | Evidence and exact limitation |
|---|---|---|
| Complete isolated recovery | **BLOCKED** | Fresh local inventory found no Docker, Podman, Colima, Docker.app, Postgres.app, or existing Docker/Colima configuration. Existing isolated PostgreSQL runs through a private Unix socket with TCP and preload workers disabled. Its `pg_available_extensions` contains neither `pg_net` nor `supabase_vault`. Prior full restore still has 11 extension/dependency errors; matching rows do not constitute full recovery. |
| Existing hosted test infrastructure | **BLOCKED** | Connected Supabase inventory returns only APS production `sfsdniavqldgbiretply` and zero development branches. Vercel preview `alignedprintscan-production-m4z1dcqa8-doneishas-projects.vercel.app` is READY at `6baedc6`, but public and admin scripts hardcode that production backend. No request/payment/refund/upload fixture was submitted there. |
| Hosted frontend smoke | **PASSED (limited scope)** | Actual preview `/neighborhood` renders the approved $25/$4 rates and pending-review disclosure. Synthetic scan-only intake with three pages progresses to Options with no file or upload exception and a $7 estimate. Direct unauthenticated Operations Portal access redirects to admin-login. This is not hosted end-to-end certification. |
| Financial-history service conversion | **FAILED / incomplete implementation** | Neighborhood conversion still rejects invoice/payment/refund history before writes. Existing non-neighborhood conversion performs sequential REST writes and cannot serve as an atomic replacement. Full conversion, adjustment issuance/approval, refund execution and final reconciliation remain required. This is an implementation gap, not solely an infrastructure limitation. |
| Issued-price reconciliation safeguards | **PASSED locally for tested scope** | New forward migration `20261016101212_neighborhood_financial_history_integrity.sql` snapshots original payments at review time and rejects changed invoice amount/number/source quote or void classification, altered historical payments/successful refunds/invoice-linked items/issued quote, unlinked successful refunds, and refunds exceeding the original payment. No history is backfilled or rewritten. Old reviews without snapshots fail closed for investigation. This does not complete service conversion. |
| Customer/admin regression | **PASSED locally; hosted gate remains blocked** | 592 Node tests, 201 Deno tests and eight cached-only Edge entrypoint type checks pass. Existing customer browser harness exercises six intake paths at desktop/mobile. Operations Portal harness covers eligibility, quote itemization, appointment edits, mileage denial, pre-invoice conversions, invoice retry and payment views, global financial/review/calendar modules and denied/anonymous access using synthetic fixtures. See the existing workflow matrix for provider/auth/storage limitations. |

**CONFIRMED IN CODE:** Previous reconciliation checked net invoice/refund totals without proving preservation of original records. New tests demonstrate that a rewritten original invoice or payment cannot satisfy reconciliation, an unlinked refund is rejected, a changed successful refund is rejected, and valid separate supplemental invoice/refund records still reconcile.

**Validation:** The new migration applies successfully to the existing real restored schema inside `BEGIN`/`ROLLBACK`; anonymous resolver execution is denied and authenticated execution remains granted subject to the function's admin checks. No local restored data changes persisted. The isolated server was stopped afterward. This check establishes migration compatibility, not disaster recovery or hosted authorization certification.

**Smallest external unblock:** Identify and grant access to an existing disposable APS Supabase-compatible target (local or hosted) with the required extensions and Vault recovery prerequisites. Its data-preservation/disposal status must be confirmed before restore. Hosted workflow testing additionally needs an isolated APS backend bound to the preview, authorized test identities, private test storage, Stripe test configuration and a controlled Resend recipient route. None was found in the connected APS project inventory. Do not use PATC resources. If no such target exists, establishing one requires a separate infrastructure decision; no installation, project creation, purchase or production reconfiguration was performed.

**Remaining engineering work:** Implement and verify an atomic, history-preserving financial conversion/reconciliation lifecycle, including partial/paid/void invoices, refunds, duplicate provider delivery, concurrent changes and completion guards. The new preservation checks are a correction toward this gate, not a claim that it has passed.

Evidence logs retained locally: `/private/tmp/aps-release-gate-node.log`, `/private/tmp/aps-release-gate-deno.log`, `/private/tmp/aps-release-gate-types.log`, `/private/tmp/aps-release-gate-admin.log`, `/private/tmp/aps-release-gate-customer.log`. Earlier sections below are historical checkpoints unless explicitly restated above.


Date: 2026-10-16. **CONFIRMED IN CODE** unless explicitly labeled otherwise.

## Release status

**Final release decision: BLOCKED.** Final local verification is complete for the documented scope. Full recovery, hosted lifecycle verification, and financial-history conversion remain unresolved. A read-only check on 2026-10-16 returned HTTP **404** for the approved public QR destination; artwork must not be put into public use before an authorized release and destination smoke test.

Implementation is prepared on `codex/aps-neighborhood-team-unified-update`. Production release is **incomplete and blocked** by recovery, service-conversion and hosted integration gaps. Draft PR: [#159](https://github.com/dmaatra/alignedprintscan-production/pull/159), OPEN and not merged. The current audit corrections are on this same branch. It must not merge while the recovery gate is open because `main` triggers production deployment.

No production migration, production Edge Function deployment, production application deployment, payment/refund, data deletion, or database reset was performed. The owner subsequently authorized two test correspondence emails, recorded below. PATC resources were not modified. The original APS checkout and its unrelated Supabase temporary changes remain untouched.

Verified targets:

- GitHub: `dmaatra/alignedprintscan-production`
- Supabase: `sfsdniavqldgbiretply`
- Vercel: `prj_4cNexKhxu8bOOQojeZ8KmktDKVMe`, team `team_QSapNMivK8QSY3fQxSQE2Xtm`
- Previous production Git revision: `ccbafd5b490a3b50ce8f56aa5c4a8bb7d47fa893`
- Previous production deployment: `dpl_7P6o1LoxuSiapwh39oGgcro8MsSQ`, `alignedprintscan-production-ra6c9ayqh-doneishas-projects.vercel.app`
- Canonical domain: `https://alignedprintscan.com`

The feature push automatically created a READY Vercel **preview**, `dpl_7UJy4Kw6FF4io71fMiqDjU2iFiay`, on the verified APS project; GitHub Vercel checks passed. This is not a production release or a verified hosted-backend lifecycle. Preview frontend code still points to the existing production backend, so no preview request submissions were performed.

## Backup and recovery verification

A complete custom-format PostgreSQL database archive and password-free roles export were created using PostgreSQL 17.11, exclusively from APS. The Supabase CLI temporary export credential was kept out of source and conversation output. No paid feature was enabled.

Private, owner-only directory (not Git or web assets):

`/Users/doneishawilson/Documents/APS Private Backups/2026-10-16-sfsdniavqldgbiretply/`

Files include `aps-production.dump`, `roles.sql`, `validated-restore.sql`, `archive-contents.txt`, `manifest.json`, private restore logs, and `RECOVERY-README.txt`. Directory permissions are 0700 and files 0600; this is an access-restricted local backup, not independently encrypted/offsite storage.

Archive size: **2,211,439 bytes**. SHA-256:

`c402f7b27c8dca91f6f81da41e9e54792a1d246947146d383cad0c7e806ebd58`

`pg_restore --list` and full archive decoding passed. A real isolated PostgreSQL 17.10 restore using a private Unix socket, with TCP listening disabled, matched **all 2,436 COPY rows across 123 public/auth/storage tables** exactly against the archive, independent of row order. Customer values were not printed. The new migration and final invoice guard also applied successfully against that restored production schema.

**Remaining recovery blocker:** full restore returned **11 errors**, all involving unavailable `pg_net` 0.20.0, `supabase_vault` 0.3.1, or dependent objects. Thus full recovery is **not yet verified**. Required action: provide an isolated compatible Supabase recovery target with those extensions and the required Vault recovery environment so a complete restore can be tested. Do not reset production or purchase an upgrade for this work. Homebrew installation was blocked by outdated Apple build tools; locally compiled PostgreSQL export tools and precompiled isolated-server binaries were used instead.

The archive contains schema/functions/triggers/policies/data and Storage metadata, but not Storage **file bytes**, Auth management configuration, Edge Function secrets, external Stripe/Resend/Proof records, Vercel settings, DNS, or Vault's managed encryption environment. The private recovery README details the restore procedure and separate dependencies. Those dependencies must be preserved/recreated through their existing secure administration paths.

## Website and intake

- `/team`: expandable staff directory using existing navy/gold/cream design, official portrait, role/credential text, and `/doneisha` profile link.
- `/doneisha`: expanded professional bio/services while preserving existing digital-card contacts, vCard, QR behavior, metadata and noindex policy.
- `/neighborhood`: Camden Park storefront, locked promotional bases and clear manual-review disclosure, local team links, exact shared guided intake.
- Homepage About: approved paragraph and outlined Meet the Team link.
- Public footer: Meet the Team immediately after About across all 28 shell pages; canonical shell synchronizer updated.
- Extensionless routes and sitemap updated. Standard pricing remains available.
- Scan-only intake allows physical originals without a file or false upload exception, stores `physical_originals_expected`, and still requires service address/schedule, actual scanning and released customer deliverable.
- Printing/combined requests retain source-document requirements and existing documented upload exceptions.
- Adding Mobile Notary from print/scan transfers print/scan selections into the **full** canonical Mobile Notary flow, including signer names, acts, documents, witness and readiness information.
- RON and existing witness fees remain unchanged, including **$25 per APS-provided remote witness**.

Production URLs intended for release: `/`, `/team`, `/doneisha`, `/neighborhood`, `/pricing.html`, `/success.html`. New/changed content is verified locally only; do not interpret these paths as a claim of deployment.

## Eligibility, pricing and operations

Initial additive migration: `supabase/migrations/20261016032854_neighborhood_pricing_program.sql`.

- `promotion_programs`: manual Camden Park Neighborhood in Waxahachie, Texas configuration, enabled/effective dates and extensible JSON boundary configuration. No ZIP/geofence auto-approval.
- `request_promotion_applications`: original acquisition source and submitted address; pending/approved/denied/exception decision; reviewer/reason/time; applied program; authorized travel amounts; revision and financial-adjustment state.
- `request_pricing_reviews`: prior application, quote, items, invoices/refunds, proposed amounts, reviewer and reconciliation evidence.
- All neighborhood requests begin `pending_review`. Only authenticated administrators can review through the RPC. Browser input cannot authorize a discount.
- Approved mobile appointment base: $50 standard minus $25 adjustment = **$25**. Approved courier/document service: $20 minus $16 = **$4**. One applicable base per physical visit; print/scan/acts/witnesses remain separately itemized. Remote/loan services retain standard pricing.
- Denial requires the existing mileage calculator or documented manual fallback, prepares standard itemization and preserves original estimate/source/documents/signers/witnesses/history.
- Review serializes on the request, checks stale revisions, supersedes prior quotes and retains history. Issued quotes/items cannot be silently rewritten. Quote approval, primary-invoice creation and Checkout reject unresolved neighborhood review.
- Issued/paid financial records are preserved. A later pricing decision requires separate invoice/refund records. The reconciliation RPC verifies the exact reviewed net difference before clearing the financial flag. It does not itself move money.
- Existing review queue and completion controls block unresolved eligibility/financial work. Admin has a Camden Park badge/filter and yard-sign campaign filter, review panel and financial reconciliation action.
- Customer Portal receives a request-authorized, limited promotion projection; internal review notes and operating address are not exposed.
- Existing Resend acknowledgment remains in the maintained communication history, with deterministic provider idempotency and independent admin-alert retry protection. Two explicitly authorized general-correspondence test emails were sent on 2026-10-16, as documented below; automatic request-trigger delivery is not verified.
- Existing Stripe Checkout uses the exact invoice balance when negative discount rows cannot be represented as Stripe prices. APS invoice itemization is retained. Existing webhook verification and invoice-linked payment handling are unchanged.

## Yard sign and QR assets

Approved geographic-neutral wording; no Camden Park name/prices/discounts or residential address appears in the sign. Existing official full APS logo is preserved with original colors/aspect. No vector logo source existed; original raster logo is placed at 100 effective DPI, matching the vendor's published full-size minimum. Brand fonts are embedded in PDF and outlined in SVG; source generator and licensed fonts are included.

Repository paths:

1. `output/print/neighborhood-services/aps-yard-sign-24x18-front-and-back.pdf`
2. `output/print/neighborhood-services/aps-yard-sign-24x18-front-and-back.png`
3. `output/print/neighborhood-services/aps-yard-sign-24x18-front-and-back.svg`
4. `assets/qr/neighborhood/neighborhood-services-qr.svg`
5. `assets/qr/neighborhood/neighborhood-services-qr.png`
6. Preview: `output/print/neighborhood-services/aps-yard-sign-preview.png`
7. Editable generator: `scripts/generate-neighborhood-sign.py`

PDF TrimBox: 24 × 18 inches; MediaBox/BleedBox: 24.25 × 18.25 inches (0.125-inch bleed each edge), no crop marks, at least 0.5-inch safe margin. PNG: **7200 × 5400 pixels, opaque RGB, 300 DPI**, finished trim size. Use the PDF for upload because it includes bleed.

[Bannerology coroplast specifications](https://bannerology.com/coroplast-yard-signs) and [FAQ](https://bannerology.com/faq), checked 2026-10-16, publish 100 DPI at full size, 0.125-inch bleed and 0.5-inch safety margin. Select landscape 24 × 18, full-color double-sided coroplast, quantity five, metal H-stakes. Upload the **same PDF for front and back**, without mirroring. No purchase/order was made.

Permanent static QR destination:

`https://alignedprintscan.com/neighborhood?utm_source=yard_sign&utm_medium=offline&utm_campaign=neighborhood_services`

Readable printed URL: `alignedprintscan.com/neighborhood`. No redirect service/subscription/expiry. Navy modules, solid white background, four-module quiet zone, error correction H, no logo overlay. Existing `/doneisha` QR assets are unchanged. Both SVG renderings (standalone and sign) and both PNG QR representations independently decoded to the exact approved URL. No physical phone-camera scan was performed.

## Attribution

Existing acquisition storage is reused; no separate analytics database. `/neighborhood` and `/team` were added to the sanitized public tracking allowlist. Internal navigation preserves the acquisition campaign. Frontend capture confirms the exact yard-sign UTM fields reach the request payload; server explicitly persists them because the existing request-creation RPC does not insert those fields itself.

Existing service request fields identify submissions, workflow completion, and payment status; join `request_promotion_applications.service_request_id` for approved/exception/denied outcomes. Original campaign remains `neighborhood_services`, independent of eligibility. Admin filtering supports yard-sign requests. Production persistence and live destination checks remain blocked with release; local payload and tracking tests are not a production claim.

## Verification

Latest complete Node suite: **589 passed, 0 failed, 0 skipped** using Node's TypeScript transform flag and isolated PGlite. Includes invoice/payment/webhook/portal/security regressions and new pricing, reconciliation, scan, attribution and Checkout cases. Tests cover both price increases and decreases using separate records, repeated approvals, stale review revisions, quote tampering, RLS, and scan fulfillment gates.

Deno checks cover the eight deployment entrypoints listed below. Changed JavaScript syntax and `git diff --check` pass. Browser verification covers six page/width combinations (390/1440) without overflow or JavaScript errors, two intercepted scan-only submissions with exact campaign payloads, and full-Mobile-intake transition. Intercepted submissions deliberately return a local error after payload capture; they do not create real requests. Screenshots are under `output/qa/`.

Database verification: full migration exercised in PGlite; migration and final guard also applied against the restored real schema. PGlite tests use schema-only fixtures, not customer data. The partial real restore is distinct from full platform recovery.

Blocked integration groups (not counted as skipped Node tests):
1. Full Supabase-compatible restore and recovery gate.
2. Isolated live-provider lifecycle (real hosted Auth/Storage, Resend delivery, Stripe sandbox payment/refund/webhook replay).
3. Production smoke, secure portal/admin workflows, QR destination and persisted campaign verification after release.

No claim of complete customer-ready production operation is made while these groups remain unverified.

## Deployment and rollback runbook

After full recovery verification and integration checks:

1. Reconfirm APS project/domain/repo identities and current production baseline; review any new main changes.
2. Once applicable release gates and the current owner policy permit deployment, apply only the reviewed migrations `20261016032854`, `20261016045905`, `20261016092536`, `20261016101212_neighborhood_financial_history_integrity.sql`, `20261016124235_neighborhood_reconciliation_retry_safety.sql`, and `20261016152822_neighborhood_paid_conversion.sql`, in that order. The sixth migration adds the atomic paid-conversion RPC, administrator-only operation/snapshot ledger, and issued conversion-quote guard. See `APS_PR159_OWNER_ACCEPTANCE_COMPLETION.md` for the current evidence and gates. Do not bulk-push the historical local migration directory because deployed migration history differs. See `APS_PR159_REVISED_RELEASE_STRATEGY.md` for dependencies, trigger locking, rollback scope and the unexecuted hosted-validation plan.
3. Deploy these functions to APS only, preserving current JWT settings: `public-request-submit`, `get-request-status`, `send-request-email`, `admin-route-distance`, `admin-service-adjustment`, `client-quote-action`, `create-embedded-checkout`, `update-request-status` (shared completion dependency).
4. Verify admin review, quote issue/approval, Invoice #1/#2, partial/final payment, refunds, duplicate webhook delivery, file authorization, completion and email retry using isolated/synthetic records.
5. Merge the reviewed PR and verify the Vercel deployment belongs to the recorded APS project. Check public pages, standard intake, protected portal/admin, QR URL/UTM persistence and source-to-completed/paid reporting.
6. On a release defect, stop new writes/deployments and restore the prior Vercel deployment/function versions. Retain additive promotion/history tables. Do **not** drop financial/history data or run an automatic down migration. Disable new promotional intake through configuration only as part of a coordinated rollback; previously reviewed requests still require their audit history.
7. Database recovery, if necessary, follows the private backup README after restore has been verified; never perform an untested destructive production restore.

Current owner instruction supersedes prior release authorization: keep PR #159 draft; do not merge, deploy, run production migrations, install/download software, or create cloud resources. No further pricing or eligibility decision is needed.


## Existing-environment investigation and expanded audit (2026-10-16)

### 1. Existing local environment

The established APS checkout is `/Users/doneishawilson/Development/alignedprintscan-production`. It is a static HTML/JavaScript application, started using `python3 -m http.server 8000` per `docs/DEPLOYMENT_AND_TESTING.md`. Both public/admin scripts point to hosted Supabase project `sfsdniavqldgbiretply`; the linked project ref matches. Repository configuration contains Edge Function settings, not a configured disposable local database stack. No root `.env` files were found. Git history, prior reports, existing scripts, older checkouts and active local servers were inspected. This explains why local application development worked: the local frontend uses hosted Supabase. It does not establish a local full-platform restore environment.

Available existing tools were reused: Supabase CLI 2.101.0, Python, Node 25.8.2, cached Playwright/Chrome, Deno and its populated default cache, PGlite, PostgreSQL 17.11 client/export tools, and the existing isolated PostgreSQL 17.10 server. No software was installed or downloaded during this investigation. No new project was created. No PostgreSQL tools/container runtime were on PATH; no Docker/Podman/Colima/OrbStack installation or local stack directory was found in the inspected locations. The Mac is Intel x86_64.

### 2. Exact recovery blocker

The existing standalone PostgreSQL server cannot restore `pg_net` 0.20.0 and `supabase_vault` 0.3.1 because their extension binaries/control files are absent. The 11 restore errors comprise extension creation/comments, Vault table data, and dependent net/Vault ACLs. A local web server, Supabase CLI, and PGlite do not provide these missing platform extensions or Vault's managed encryption environment.

The archive SHA-256 was independently rechecked. The existing private-socket isolated restore was restarted with TCP and shared preload workers disabled: all **123 tables / 2,436 rows** matched again, with zero mismatches. The new hardening migration applied there successfully. That server was stopped afterward. This is partial recovery evidence, not full Supabase recovery. No existing development or production database was overwritten. Full recovery remains blocked using the currently located resources; no installation or infrastructure workaround was attempted.

### 3. Customer-facing results

`tests/neighborhood-browser-customer.cjs` exercised the actual local wizard and actual server-side validation with synthetic data and blocked external transport. All **12 combinations** passed: Mobile Notary, RON, printing, scanning, print+scan, and Mobile Notary+print+scan at 1440 and 390 pixels. Each reached the synthetic success response and retained neighborhood campaign/source fields. Notification calls were mocked. Earlier six-page responsive checks and scan-only/combined-transition checks also passed without JavaScript errors or page overflow. This does not prove hosted request/storage persistence.

### 4. Administrative-side results

`tests/neighborhood-browser-admin.cjs` exercises the actual admin interface against synthetic PGlite records and the actual eligibility/reconciliation SQL functions. Passed: new pending-request visibility; campaign preservation; manual Mobile Notary approval with $25 base; document-service approval with $4 base; quote save; appointment date/time editing; denial blocked without mileage; denial after a synthetic recorded 18-mile/$10 calculation, producing the standard $70 quote; and two retained pricing-history entries. All eight request tabs were exercised at desktop/mobile widths without JavaScript errors or page overflow.

The harness mocks administrator authentication and provider APIs. Mileage recording uses a fixture adapter; it does not call a live mapping provider. Documents, participant, communications and notification list fixtures are empty. Those views passing layout checks is not functional verification of their full lifecycle. Existing Node tests cover invoice creation, payment status, financial reconciliation, webhook/idempotency and access/RLS rules; these are automated checks, not a hosted end-to-end payment or Auth test. Full invoice/payment/notification/provider lifecycle and live RLS remain unverified. No actual payment or customer-record modification occurred.

At the owner's explicit request, the authenticated APS production **Messages → Compose APS Email** interface sent two clearly labeled synthetic general-correspondence messages (no order): `[APS TEST] Neighborhood customer email — PR #159` to `ra.doneisha@gmail.com` at 01:20:52 local, and `[APS TEST] Neighborhood admin email — PR #159` to `hello@alignedprintscan.com` at 01:21:09 local. Both appeared as **Sent** in APS history. Inbox receipt was not independently verified. These manual sends verify the existing correspondence path, not the new automatic submission-notification trigger.

### 5. Corrections and regression evidence

- Used the owner's transparent long logo, preserving its exact pixels and alpha. The supplied asset itself contains faint semitransparent navy pixels.
- Forced neighborhood-origin submissions into eligibility review even after internal navigation; did not authorize discounts from URL/ZIP.
- Rejected nonfinite estimates.
- Added migration `20261016045905_neighborhood_review_hardening.sql` to reject issued quote totals that do not reconcile with reviewed line items.
- Blocked direct mileage-apply operations that could bypass neighborhood review.
- Initially blocked unsafe service conversion before writes. The subsequent atomic pre-invoice implementation supersedes that blanket guard; financial-history conversion remains blocked. See the conversion follow-up below.

Regression result: **589 Node tests passed**, **201 Deno tests passed**, and eight Deno entrypoint checks passed. Existing cached dependencies were used. No skipped tests are being counted as recovery/provider verification.

### 6. Remaining release blockers

1. Full compatible Supabase recovery, including missing extensions/Vault environment and separately preserved platform resources.
2. Conversion of requests with financial or unresolved provider history remains blocked. Pre-invoice atomic conversion is now implemented and locally verified, as described below.
3. Isolated hosted end-to-end customer/admin lifecycle: Auth/RLS, document storage, quote approval/invoices, partial/final payments and refunds, automatic communications/notifications, and appointment conversion/provider integrations. Local fixture/UI and unit tests do not replace this evidence.
4. Owner release authorization: the current instruction explicitly prohibits merge/deploy/production migrations. PR #159 must remain draft.


## Invoice lifecycle follow-up (2026-10-16)

Fault-injection tests against the actual `materializeInitialInvoice` helper reproduced two failures: invoice-item linking and request-status updates could fail while approval still returned success. Retrying then returned the already-created invoice without repairing those steps. The helper now checks both REST results and retries unfinished finalization for the same unpaid invoice. Paid/partially paid records and later request statuses remain preserved. Three new regression tests cover both failures/retries and payment preservation.

The existing admin browser harness now runs the actual quote-approval helper through a synthetic REST adapter into the same PGlite database used for manual eligibility review. Verified the approved $7 document-service quote creates one invoice, attaches all three reviewed line items, transitions to awaiting payment, and remains one invoice after retry. Synthetic partial ($2 paid/$5 balance) and full ($7 paid/$0 balance) states survive repeated approval unchanged and appear in the actual admin payment view. Desktop/mobile tabs still pass with no overflow or JavaScript errors. No payment provider was called; this is database/helper/UI integration, not a real payment test.

Updated complete suite: **579 passed, zero failed/skipped**. Changed Edge Function type-check passed with remote/npm resolution disabled. At that checkpoint, conversion was still blocked. The later pre-invoice conversion follow-up supersedes that status; no release is authorized.


## Atomic pre-invoice conversion follow-up (2026-10-16)

**CONFIRMED IN CODE:** Migration `20261016092536_neighborhood_atomic_conversion.sql` adds an authenticated-administrator RPC for neighborhood RON ↔ Mobile conversion. The Edge Function forwards the administrator's token; service-role and anonymous execution are revoked. Preview is read-only. Commit locks the request and application and checks the preview's eligibility revision/current quote. The UI invalidates a preview when its inputs change.

For requests without financial history, the same transaction updates destination requirements, snapshots prior request/service-detail/quote/item state into the private pricing-review history, creates conversion history and a revised draft quote, preserves original intake estimate/acquisition/address and related records, resets scheduling, and adds destination-review and timeline entries. Existing witness/add-on fields survive and require renewed compatibility review. No invoice, payment, refund or email is created by this action. The destination total remains administrator-entered; its draft service-charge allocation must be reviewed/itemized before quote issuance. Pricing catalog rates are unchanged.

Mobile destinations return to `pending_review` with no discount. Manual eligibility review subsequently applies the approved $25 base or standard pricing/mileage. RON uses standard pricing and no neighborhood travel discount. The admin panel separately labels the original submitted address and current service address to review, preventing an old address from being mistaken for the new destination.

**Compatibility limits:** Any invoice/payment/refund history (including void historical invoices), legacy checkout/payment references, unresolved financial adjustment, active/unresolved Proof transaction, started fulfillment, or completed/cancelled/archived request blocks this action before writes. Cancelled/failed Proof history is retained. Financial-history conversion still needs its own reviewed reconciliation workflow; this implementation does not claim that path is complete.

**Verification:** Synthetic PostgreSQL/PGlite tests cover authorization, revoked roles, read-only previews, financial/legacy checkout/provider guards, stale previews, both conversion directions, re-eligibility, and original-data preservation. An injected failure at the final timeline insert rolls back all earlier changes. Both directions also succeeded inside one rollback-only transaction against the existing isolated real restored schema; that server was stopped afterward. This is migration compatibility evidence, not full Supabase recovery.

The actual admin Customer-tab conversion dialogs passed against synthetic database adapters: Mobile → RON at desktop width and RON → Mobile at 390px. Editing the previewed amount disabled confirmation until a new preview. The returned Mobile request showed pending eligibility and the new destination address. Existing invoice/payment-view and eight-tab responsive checks still passed without page overflow or JavaScript errors. Updated Node suite: **589 passed, zero failed/skipped**; changed JavaScript syntax and Edge Function type checks passed without dependency downloads. Real hosted Auth/provider lifecycle and full recovery remain unverified. PR #159 remains draft; no production migration, merge or deployment was performed.


## Final verification matrix and handoff — 2026-10-16

**CONFIRMED IN CODE / local execution:** The final Node suite passed **589/589**, with zero failures/skips. The existing cached Deno suite passed **201/201**. All eight affected Edge Function entrypoints type-checked using `deno test --cached-only --no-run`; modules were not executed. No package/build framework is present, so an npm/framework build is not applicable. Changed JavaScript syntax and `git diff --check` passed. A credential-pattern scan of 79 changed text files found zero targeted live-secret/credential-URL patterns; no database archives are tracked. This scan is not a claim of comprehensive security certification.

| Required workflow | Verified evidence | Remaining limitation |
|---|---|---|
| Neighborhood customer submission | Actual wizard, six service combinations × desktop/mobile; all 12 pass | Transport/storage/provider calls mocked |
| Mobile/RON/print/scan/combined intake | Actual server validation, attachments represented by synthetic files; correct campaign payloads | Hosted persistence not tested |
| New administrative requests | Actual admin UI loads synthetic pending requests | Hosted data visibility not tested |
| Attribution and eligibility | Original source/campaign retained through review/conversion; real SQL review functions | Hosted reporting not tested |
| Approve/deny/exception pricing | $25/$4 approvals, standard mileage denial and immutable history pass; exception covered by SQL tests | Live route provider not called |
| Quote creation/edit/save/approval | Actual admin save and quote-approval helper; stale/forged totals and failed-write retries covered | Hosted portal approval not tested |
| Itemization and reconciliation | Invoice attaches all three $7 quote rows; separate invoice/refund reconciliation tests pass | Real charges/refunds not performed |
| Invoice generation/payment state | Actual helper → isolated SQL → actual admin view; retries preserve one invoice and partial/full payment state | Payment states are synthetic, not provider transactions |
| Financial history/audit trails | Original financial rows preserved; pricing and conversion history/rollback tests pass | Provider webhook lifecycle tested only in automated fixtures |
| Request scheduling/appointment management | Actual admin date/time editing and conversion scheduling reset pass | Real appointment/notification dispatch not performed |
| Service conversion/compatibility | Atomic pre-invoice RON ↔ Mobile, stale-preview/input-change guards, both directions on restored schema, final-write rollback | Financial-history conversion remains unsupported and blocked |
| Customer communications | Two explicitly authorized live test correspondence sends recorded as Sent | Inbox receipt and automatic neighborhood triggers unverified |
| Notifications | Existing automated notification tests pass; UI views exercised | Creation/realtime delivery with real hosted records unverified |
| Authentication/permissions/RLS | Actual UI redirects anonymous/denied staff sessions to sign-in without mutations; SQL roles/RPC guards tested | Browser identities are mocks; hosted Auth/RLS lifecycle unverified |
| Dashboard regressions | Actual Calendar, Review Queue, Invoices and Payments modules load; invoice summary reconciles $7 issued/$0 outstanding while excluding the $60 draft from receivables | Fixture scope; no production customer edits |
| Responsive/accessibility behavior | Eight admin tabs at 1440/390, desktop/mobile conversion dialogs, accessible status/selection checks, no page overflow or JS errors | Not a full assistive-technology audit |
| Artwork/QR | Five independent decodes: standalone PNG/SVG, sign PNG/SVG, PDF rendering; exact approved URL | Physical phone-camera/printed proof and vendor checkout upload not performed |
| Recovery | Archive checksum and 123-table/2,436-row partial restore verified; isolated real-schema conversion transaction rolled back | Complete Supabase recovery failed, as detailed below |

### Exact recovery failure inventory

The 11 failed restore statements are: (1) create `pg_net`; (2) comment on `pg_net`; (3) create `supabase_vault`; (4) comment on `supabase_vault`; (5) load `vault.secrets`; (6) apply `net` schema ACL; (7) apply ACL for `vault._crypto_aead_det_decrypt`; (8) apply ACL for `vault.create_secret`; (9) apply ACL for `vault.update_secret`; (10) apply `vault.secrets` ACL; (11) apply `vault.decrypted_secrets` ACL. Required extension versions are `pg_net` 0.20.0 and `supabase_vault` 0.3.1. The currently located standalone PostgreSQL binaries lack them and the managed Vault encryption environment. These are missing platform dependencies, not mismatched customer row counts.

Within the owner's no-install/no-new-cloud-resource constraints, an already available isolated, disposable Supabase-compatible target with those dependencies is required to proceed. None was found in the investigated APS environments. Once such an existing target is identified and its isolation verified: disable external email/payment/webhook/scheduled-job effects, restore roles/schema/data, require zero unexplained restore errors, verify extensions/functions/triggers/RLS and all table contents, and separately verify Storage file bytes and platform configuration. Do not restore into the hosted APS development/production database or weaken this requirement.

### Artwork and current destination

Final files remain in the existing APS Deliverables directory. Verified one-page 24×18-inch trim, 24.25×18.25-inch media/bleed, 0.125-inch bleed, 7200×5400 RGB/300-DPI PNG, embedded used fonts at weight 700, and the owner's transparent long logo byte-for-byte. The source logo retains its own faint semitransparent navy pixels. The identical single-page design is intended for both sides without mirroring. No order/payment was placed.

Five QR checks decode exactly to `https://alignedprintscan.com/neighborhood?utm_source=yard_sign&utm_medium=offline&utm_campaign=neighborhood_services`. A read-only live GET returned **HTTP 404**. This is consistent with the unreleased feature, but means the printed campaign is not operational. The URL/campaign were not changed and no deployment was attempted.

### Reproducible local commands

From the APS feature worktree, using only already installed dependencies:

```sh
APS_PGLITE_MODULE=/private/tmp/aps-unified-test-tools/node_modules/@electric-sql/pglite/dist/index.js node --experimental-transform-types --test tests/*.test.mjs
DENO_DIR=/Users/doneishawilson/Library/Caches/deno /private/tmp/aps-unified-test-tools/node_modules/.bin/deno test --cached-only --allow-env supabase/functions/_shared/*_test.ts supabase/functions/_shared/proof/*_test.ts
DENO_DIR=/Users/doneishawilson/Library/Caches/deno /private/tmp/aps-unified-test-tools/node_modules/.bin/deno test --cached-only --no-run supabase/functions/public-request-submit/index.ts supabase/functions/get-request-status/index.ts supabase/functions/send-request-email/index.ts supabase/functions/admin-route-distance/index.ts supabase/functions/admin-service-adjustment/index.ts supabase/functions/client-quote-action/index.ts supabase/functions/create-embedded-checkout/index.ts supabase/functions/update-request-status/index.ts
APS_PLAYWRIGHT_MODULE=/Users/doneishawilson/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright APS_PGLITE_MODULE=/private/tmp/aps-unified-test-tools/node_modules/@electric-sql/pglite/dist/index.js node tests/neighborhood-browser-admin.cjs
APS_PLAYWRIGHT_MODULE=/Users/doneishawilson/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright node tests/neighborhood-browser-customer.cjs
node --check assets/js/admin.js
git diff --check
```

Browser tests require the established static server at `127.0.0.1:8028`. They intercept external requests and use reserved synthetic identities. All authentication/provider limitations above still apply. Final safe artwork evidence is committed as `output/print/neighborhood-services/final-audit-verification.json`; synthetic admin screenshots are in `output/qa/`.

### Final checklist

- **Completed:** Existing infrastructure investigation; code corrections and pre-invoice conversion; local customer/admin/database/security/regression checks; authorized test emails; transparent-logo artwork and five QR decodes; report/branch/PR updates.
- **Pending manual checks:** Physical sign/phone-camera proof, vendor front/back upload review, mailbox receipt confirmation, and post-release public URL/attribution smoke checks.
- **Blocked mandatory gates:** Full compatible recovery; isolated hosted end-to-end workflow verification; financial-history conversion/reconciliation implementation; live neighborhood destination (currently 404).
- **Preserved controls:** PR #159 stays draft. No merge, production deployment/migration, customer-data edits, installations, new cloud resources, or purchases. The partial restore is not described as successful full recovery.
