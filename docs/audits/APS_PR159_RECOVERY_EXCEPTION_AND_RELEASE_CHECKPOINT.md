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
