# PR #159 recovery exception and focused-release checkpoint

2026-10-16. This checkpoint supersedes the recovery-policy blocker in APS_PR159_FOCUSED_RELEASE_DECISION.md only. It does not certify deployment.

## Owner exception — PR #159 only

**CONFIRMED IN DOCUMENTATION:** The Owner approved visual commit d073f2f and explicitly accepted the documented residual disaster-recovery risks for this release, authorizing a narrower recovery policy based on the preserved partial restore of 123 tables / 2,436 rows. Full restoration of pg_net, supabase_vault, Vault encryption, Storage object bytes and platform configuration remains unverified. This is a release-specific exception, not a fully verified backup and not a permanent change to APS recovery requirements.

The Owner conditionally authorized production migrations/backend deployment, hosted synthetic testing, merge and frontend deployment only after remaining mandatory safety checks pass. No live Stripe charges/refunds, real-customer test communications, software installation, purchase or scope expansion is authorized. A failed mandatory gate stops execution.

## Implemented locally

**CONFIRMED IN CODE:** New forward migration 20261016170000_focused_release_restrictions.sql follows the six reviewed migrations. It:

- Moves the preserved paid-conversion implementation into an inaccessible private schema and exposes an administrator-checked wrapper that locks the request and rejects issued/history-bearing requests before execution.
- Rejects service-type and promotion-review/pricing mutations for neighborhood requests with issued quotes, invoices, payment/refund history or checkout references, including direct database writes.
- Rejects the neighborhood pricing-adjustment resolver. It does not disable the ordinary APS refund/cancellation endpoint.
- Records quote issuance in an RLS-protected, non-client-writable table so expiry/supersession cannot reopen conversion/repricing. The first quote can still be approved; replacement issued quotes are blocked.
- Leaves ordinary non-neighborhood service changes and normal invoice/payment status updates untouched.

The current Edge handler already invokes the same public RPC, so no Edge edit is needed to obtain these database restrictions. There is no client-controlled enable flag. Re-enabling deferred behavior requires a separately reviewed forward migration. Do not drop history on rollback.

Local dedicated SQL tests cover fully/partially paid, issued-but-unpaid and checkout-reference requests; preview/execute/retry rejection; direct changes; unchanged history; ordinary financial writes; first-quote approval; expiry/replacement blocking; administrator authorization and private-schema permissions. Existing six-migration suites continue to test the preserved deferred implementation; the focused-release suite applies all seven and verifies the active restrictions. No new hosted or native multi-session concurrency certification is claimed for migration seven.

The rollback compatibility script includes all seven files and checks private-schema permissions, three focused triggers and issuance-table RLS. It retains 2s lock_timeout, 30s statement_timeout and 60s idle transaction timeout, with explicit ROLLBACK. It has NOT been executed against production in this checkpoint.

## Revised Stripe acceptance criterion

**CONFIRMED IN DOCUMENTATION:** Owner subsequently instructed that Stripe opening on click with proper behavior is sufficient acceptance for this focused release. The release criterion is now an actual checkout-launch smoke test: correct synthetic request/invoice, amount, mode and return behavior. No payment/refund submission or provider-confirmed settlement is required or claimed. Connected Stripe inventory exposes only APS live mode. Global keys must not be swapped. A synthetic request may exercise checkout launch only; no real customer request may be used. Test-mode payment processing remains deferred, not passed.

Authorized email audience remains the APS administrator and ra.doneisha@gmail.com for customer-role tests. Recipient authorization alone is not proof of provider routing. Resend routing, synthetic record inventory and the real hosted lifecycle must still pass.

## Evidence in progress

Read-only APS project sfsdniavqldgbiretply metadata refreshed: PostgreSQL 17.6; pg_net 0.20.0; supabase_vault 0.3.1; is_admin() present; migration head 20261003161014; request_promotion_applications absent. This is not full schema drift certification.

Final local Node regression: 629 passed, zero failures/skips. The first backup refresh attempt failed because the saved temporary CLI database credential was rejected. The existing APS-linked CLI successfully renewed its temporary connection; backup retry uses a new private folder, preserving original partial-restoration evidence. Final backup and release status are recorded below when known.

## Passed pre-deployment checks

- Fresh private backup: database and roles export, archive listing and all-block decode returned zero. SHA-256 `049a13e45fd32c92dcfb9b835f6b830f6d110ad161d1d1d167844b0f55bd1815`, 2,225,970 bytes, 2026-10-16T21:44:47Z. This proves readable export, not complete restoration.
- All seven migrations executed against APS production in one rollback-only compatibility transaction with the stated timeouts; verification and post-ROLLBACK absence checks passed, exit zero. No schema persisted from this check.
- Eight changed Edge entrypoints passed cached Deno type checks. Current production source bundles for all eight were downloaded into a separate private rollback directory; all downloads succeeded.
- Production ADMIN_EMAIL and SUPPORT_EMAIL overrides are absent in secret-name inventory; the verified functions fall back to authorized hello@alignedprintscan.com. RESEND_API_KEY and Stripe key names are present; values were not logged.
- Owner removed a visible synthetic-label requirement. Internal test-record inventory remains required to avoid touching real customer requests. Checkout launch/amount/return smoke is still pending; no payment-processing pass is claimed.

## Hosted verification access checkpoint

The existing Vercel preview was verified as project prj_4cNexKhxu8bOOQojeZ8KmktDKVMe, team team_QSapNMivK8QSY3fQxSQE2Xtm. Authorized temporary preview access succeeded; the application then correctly redirected to APS Admin Login. The production browser session is authenticated but is not shared across preview origins. Owner was asked to sign in to the open preview tab (no password requested in chat). Backend activation and merge remain pending so the required hosted administrator canary can be completed in the release window.

Preserved pre-release function versions/JWT enforcement: public-request-submit 17/false; get-request-status 38/false; send-request-email 46/false; admin-route-distance 29/true; admin-service-adjustment 8/true; client-quote-action 33/false; create-embedded-checkout 43/false; update-request-status 17/true. Do not change these JWT settings during deployment.

## 2026-10-17 execution checkpoint (supersedes pending-backend wording above)

**CONFIRMED IN CODE:** All seven reviewed migrations committed atomically in production after the successful rollback-only compatibility check. The exact seven versions were verified in migration history. Eight deployed functions are ACTIVE, with JWT settings preserved: public-request-submit 18/false; get-request-status 39/false; send-request-email 47/false; admin-route-distance 30/true; admin-service-adjustment 9/true; client-quote-action 34/false; create-embedded-checkout 44/false; update-request-status 18/true. These statements are supported by deployment logs and remote read-back, not inferred from local source.

**CONFIRMED IN CODE:** Controlled hosted request `4d0ded42-698e-4e35-b451-2075ebcb8ca5` (APS-4D0DED42) was submitted from the preview neighborhood form: scan-only, three pages, reserved example.invalid recipient, no real dispatch or payment. Pending eligibility, original address and yard_sign/offline/neighborhood_services attribution persisted. The authorized administrator approved eligibility and saved quote `0c0cae83-7d21-4eed-8100-1d97b493511f`: $3 scans + $20 standard base − $16 promotion = $7. Status transitioned to Quote Ready using Update Status Without Sending. The authenticated administrator customer preview displayed the same itemization and approved eligibility. Uncredentialed portal access was denied as expected.

**CONFIRMED IN CODE:** Hosted inspection found request-heading collapse at an intermediate viewport. Commit 0d6b8bb wraps header actions and measures the sticky header for tab positioning. The isolated established browser suite passed at 1440, 1034 and 390 pixels, including all workspace tabs, sticky-tab hit access, no page overflow, eligibility approval/denial and mileage, quote/invoice itemization, partial/full payment fixture views, completion protection, historical conversion fixtures, and anonymous/staff redirects. No browser JavaScript errors. Fixture provider traffic remained blocked. Screenshots are saved in output/owner-acceptance/admin-responsive-release. Historical paid-conversion fixtures test the preserved six-migration implementation; the separate seven-migration suite governs the deployed disabled paths.

**HISTORICAL OR POSSIBLY OUTDATED:** The first hosted Quote Ready action failed with a browser network error; server logs showed preflight only and no POST. A preview reload and scoped retry succeeded. No JWT or RLS setting was weakened.

**UNKNOWN / OWNER CONFIRMATION REQUIRED:** Final checkout-launch, remaining hosted lifecycle checks, public frontend release and live smoke verification are not yet certified at this checkpoint. PR remains draft/unmerged; production backend is updated but frontend has not been released. No charge/refund or real-customer test message was made. The release-specific recovery exception remains limited as documented above.

## Mandatory customer-access gate — not passed

**CONFIRMED IN CODE:** The administrator preview successfully reads the controlled request but intentionally does not authorize customer mutations (`authorizeAdminPreview` versus `authorizePortal`). The customer preview's Approve Quote action therefore did not pass. No invoice/payment success is claimed from this attempt.

**CONFIRMED IN CODE:** Investigation found a required link-issuance gap: `send-request-email` and `send-order-email` construct automatic customer links using `customerPortalUrl`, which contains request_id/tab only. Neither imports or calls `issuePortalToken`. The request-specific portal and quote/checkout mutations require a scoped token or a matching verified customer session. `send-message` contains the existing secure-token issuance implementation. Therefore an automatic email link alone does not establish the customer access required for the focused launch. Do not weaken authorization or treat admin preview as a customer end-to-end pass.

The shortest corrective path is to reuse existing secure token issuance for the affected automatic customer emails, test recipient scoping and replay/expiry/idempotent delivery, deploy only the reviewed corrected handlers, then complete the authorized recipient's real quote→invoice→checkout-launch test. No new infrastructure is required. Remaining hosted service parity, fulfillment and final live smoke checks also remain outstanding. Public frontend merge/deployment is held. No charge, refund, or real-customer test communication was performed.

## 2026-10-17 final Owner release decision and portal correction

**CONFIRMED IN DOCUMENTATION:** The Owner accepted the PR #159 visual design including d073f2f and 0d6b8bb, accepted the release-specific partial-restoration risk recorded above, and explicitly waived a completed live Stripe payment as a release gate. A real payment, webhook settlement, reconciliation and receipt remain post-release operational validation; no live charge/refund or fabricated payment record is authorized. This does not waive invoice integrity, payment authorization or webhook signature checks.

**CONFIRMED IN CODE:** Automatic request and workflow emails now use the existing request-scoped `issuePortalToken` mechanism. The server creates a token hash with expiry, inserts the secure link into the outbound customer content, and passes the recorded content to the email provider on a failed-delivery retry. Existing status/request idempotency keys remain in use; the workflow email now sends that key to Resend. The request acknowledgment requires a persisted request and customer and uses the stored customer email as recipient. Admin preview remains read-only and cannot authorize customer actions. The helper and two changed Edge entrypoints passed cached Deno checks. A focused fixture verified correct-request access, denial of cross-request access, stable link on retry, and no duplicate send after success. The full Node suite passed 630 tests with no failure or skip. The actual provider delivery and customer quote-to-checkout flow are still pending hosted verification at the time of this entry.

## 2026-10-17 hosted customer and provider checkpoint

**CONFIRMED IN CODE:** Controlled request `29bd785d-3d01-409d-b642-3fbe4a832b93` was submitted through the Vercel preview neighborhood intake for authorized recipient ra.doneisha@gmail.com. It retained the synthetic service address, scan-only three-page request, `yard_sign/offline/neighborhood_services` source and initial `pending_review`. The administrator used the documented owner-exception decision for the synthetic address, then saved quote `Q-29BD785D-01`: $3 scanning + $20 standard base − $16 Camden Park adjustment = $7. The quote email and status transition succeeded. The APS provider verification action returned `delivered` and confirmed a secure link; this is provider-confirmed delivery, not a claim that a human opened the mailbox.

**CONFIRMED IN CODE:** During hosted review, the administrator Communication Log exposed the bearer token in rendered message text. The preview was corrected in commit `fd5da25` to mask portal tokens in request communication text, rendered-message previews and general conversation threads while preserving the recorded customer email. The refreshed preview visibly showed `[REDACTED]`, and a DOM check found no raw token in visible text. No raw token is included in this report. The request acknowledgment had used generic `APS-REQUEST` text; commit `9540545` derives its reference from the persisted request ID for subsequent emails.

**CONFIRMED IN CODE:** The secure customer token returned the intended request and denied a different request with HTTP 403. Customer approval of the current $7 quote succeeded through `client-quote-action`. Read-back showed `awaiting_payment`, one Invoice #1 (`INV-29BD785D-01`) with $7 due, $0 paid, zero payment rows and zero refund rows. No paid state or receipt was fabricated. The 633-test Node regression and changed-handler Deno checks passed. The scoped Checkout preflight in `create-embedded-checkout` requires customer authorization and makes no provider call; fixture tests passed for test keys, live keys and unauthorized access.

**HISTORICAL OR POSSIBLY OUTDATED:** The initial `test_mode_ready: false` interpretation predates the Owner's final instruction. The Owner confirmed that APS uses live Stripe and authorized an unpaid live Checkout launch without a test payment. Test-mode routing is not a release gate under that instruction. No global key was changed.

## 2026-10-17 unpaid Checkout and payment-state gate

**CONFIRMED IN CODE:** The scoped preflight now reports the configured Stripe mode without exposing keys. APS reported `stripe_mode: live`. On the controlled $7 invoice, the customer Pay click opened Stripe Checkout with the expected USD amount and invoice label. Stripe's read-back showed a live payment-mode Session with `$7.00`, the intended request/invoice metadata, authorized test email and canonical return URL. The session remained `unpaid`; no charge, refund or payment row was created. This satisfies the Owner's Checkout-launch smoke criterion, not payment settlement certification.

**CONFIRMED IN CODE:** Payment-state review found that `checkout.session.completed` can arrive before an asynchronous method is paid. The earlier webhook would have recorded payment without checking `payment_status`, and its duplicate shortcut could leave a partially reconciled invoice. The revised webhook accepts completed and asynchronous-success events, writes a payment only for a signed paid USD session whose amount matches the outstanding invoice, and reconciles from invoice-linked payment rows on retries. It passed cached Deno check and dynamic signed-event fixtures for unpaid completion, mismatched amount and duplicate/retry repair. The full Node regression passed 637 tests, zero failures/skips. The revised Edge Function was deployed before public frontend release; no payment/refund test was submitted.

**HISTORICAL OR POSSIBLY OUTDATED:** At this earlier checkpoint, the live Stripe endpoint lacked `checkout.session.async_payment_succeeded` and the connected integration could not update it. This blocker was resolved by the Owner's manual update and the read-back below. The PR-specific partial-restoration exception does not certify full recovery.

## 2026-10-17 owner-completed Stripe event update

**CONFIRMED IN DOCUMENTATION:** The Owner manually added `checkout.session.async_payment_succeeded` to the existing APS live webhook destination and stated that its URL and signing secret were unchanged. The secret itself was not read or rotated for this check.

**CONFIRMED IN CODE:** Connected Stripe read-back returned the same enabled live endpoint `we_1TdbB7J4WgPgToZOqTDsyS7X` at `https://sfsdniavqldgbiretply.supabase.co/functions/v1/stripe-webhook`, now subscribed to exactly five events: `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `payment_intent.succeeded`, and `payment_intent.payment_failed`. The deployed `stripe-webhook` function is active at version 23 with JWT verification disabled so Stripe can deliver signed events; the function verifies the Stripe signature itself before processing. Focused Checkout/webhook fixtures passed 10/10 and the webhook Deno check passed. No payment or refund was submitted. The previous missing-event blocker is resolved.
