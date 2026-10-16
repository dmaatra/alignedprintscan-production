# PR #159 — owner acceptance and completion checkpoint

2026-10-16. **CONFIRMED IN CODE** unless qualified below. Supersedes the application status in the previous financial-verification checkpoint. PR remains draft and unmerged; nothing was deployed and no production data was changed.

## Visible deliverables

The owner reviewed the first visual package and requested the following refinements, now implemented:

- One neighborhood pricing section with Remote Online Notary, Mobile Notary and Document Services cards. Standard Mobile starting price is struck through beside the neighborhood starting price; Document Services shows the $20-to-$4 visit base. The Mobile explanation specifies the $25 base plus a $10 notarial act. Remote Online Notary and witness prices remain unchanged.
- A boxed “One Visit, One Base Charge” explanation, matching the pricing-review note styling.
- Neighborhood-specific estimate, dispatch and travel notes. Address eligibility remains pending, standard pricing/mileage applies on denial, and no appointment is promised before confirmation.
- Full “Aligned Print & Scan” wording throughout the neighborhood page and promotion estimate explanations; internal JavaScript identifiers and request reference formats remain unchanged.
- The reviewed shared footer is synchronized on all 28 public website/resource pages, with root-relative links that also work on nested resources. Standalone digital business cards retain their card-signature component; authenticated portals and authentication forms are not marketing pages.

The permanent owner package is `/Users/doneishawilson/Documents/APS Deliverables/PR159 Owner Acceptance/index.html`. The local review URL is `http://127.0.0.1:8032/review`; actual public pages are available on that origin. The review server binds only to localhost, blocks backend connections by CSP, and rejects submission writes. The Operations Portal snapshot is a static visual aid; functional evidence comes from the actual portal browser tests with a synthetic SQL backend. The gallery includes full desktop/mobile pages, footer captures, intake stages, administrative stages, and the existing transparent-logo front/back yard-sign proof. QR campaign remains `neighborhood_services`.

## Paid conversion implementation

The new `aps_convert_neighborhood_paid_service` RPC handles previously paid Mobile/RON neighborhood requests. Pre-invoice requests delegate to the existing conversion function. Both paths now have stable operation IDs and exact retry results. Administrative authorization is rechecked inside SQL; the operation ledger is RLS protected and cannot be written directly by an authenticated administrator.

For paid requests, the RPC locks the request, application and financial rows; migration 5's serialization triggers also fence concurrent inserts. A preview fingerprint rejects changed financial/request state. All conversion writes, the new draft quote, any supplemental invoice, review tasks, timeline and operation snapshot commit together or roll back together. Original invoices, payments, successful refunds, Stripe references and issued quotes are not rewritten.

**Charge calculation:** additional invoice = destination total minus prior net invoice charges, never destination total minus cash paid. A $100 invoice with $40 paid converting to $140 creates only a $40 supplemental invoice; the original $60 balance remains, making $100 due. Equal-total conversion creates no invoice. A separately completed $20 refund on a $100 fully paid request permits an $80 conversion with zero balance; the same refund with $40 originally paid leaves the original $60 balance. These refund records are simulated fixtures, not provider-confirmed refunds.

Reductions needing new financial adjustments remain blocked until independent approval and completed, linked records reconcile. Pending/invalid refunds, unreconciled invoice balances, active payment links, active Proof work, started fulfillment and terminal requests fail closed. No conversion invokes Stripe or issues a refund. Changing an unpaid balance through a separate credit memo remains a business-policy decision, not an invented permission.

The administrator must review destination requirements/itemization and issue the revised quote. Issued itemization is snapshotted and protected. The quote must match the separate ledger charges. Customer approval reuses the retained invoices instead of creating another full-price invoice; checkout requires the current quote to be approved. Customer-visible history is written atomically and a Messages review task requests a customer update. Automatic conversion email delivery is not implemented or claimed; the existing administrator messaging process must be used after review.

## Verification results

| Workflow / requirement | Outcome and evidence |
| --- | --- |
| Public visual review | PASS: eight page/viewport combinations, no page errors, horizontal overflow or broken images. Approved logos/portrait retained. |
| Site-wide shared footer | PASS: 28 pages × desktop/mobile = 56 browser captures; About/Team destinations verified; no horizontal overflow. |
| Customer intake | PASS: Mobile, RON, print, scan-only, combined document services and Mobile combined at desktop/mobile (12 submissions). Actual form and server validator; persistence/provider response mocked. |
| Admin receipt and attribution | PASS: actual Operations Portal displays synthetic requests, campaign and pending eligibility. |
| Eligibility and pricing | PASS: $25 Mobile / $4 document base; denial requires mileage and produces standard quote; history/source retained. |
| Quote and appointment controls | PASS: actual browser quote saving/itemization and appointment editing; quote approval helper executes against fixture SQL. |
| Invoice/payment views | PASS: separate invoice finalization/retry, partial/paid invoice views. Payment states seeded as simulated provider outcomes. |
| Completion | PASS: actual status handler rejects premature completion; after synthetic released-scan metadata and browser fulfillment controls, completion succeeds with one event. Document upload/release itself was not exercised end-to-end here. |
| Paid conversion | PASS: full/partial, increase/equal, completed separate-refund reductions, pending-refund/reduction blocks, immutable original rows/Stripe references, stale preview, exact retries, conflicting operation key, injected final-write rollback. |
| Paid conversion browser | PASS: reduction disables confirmation; increase uses separate invoice and preserves original balance/history; notification review task exists; subsequent quote approval/retry adds no duplicate invoice. |
| Concurrency | PASS: native PostgreSQL independent sessions fence all five financial inserts, competing reconciliation and competing paid conversion; retry produces one adjustment and the correct $55 balance on the $70-to-$90 / $35-paid fixture. |
| Quote/payment safeguards | PASS: revised quote issuance/immutability and current-quote approval requirement before any checkout provider call. |
| Authorization | PASS in local SQL/Edge/browser fixtures: admin requirements and anonymous/nonadmin denial. Hosted Auth/RLS/Storage behavior is not certified by mocks. |
| Administrative regressions | PASS: all eight request tabs on both widths; calendar, review, invoices, payments; no browser JS errors. Auxiliary notification/message/participant tables are mocked empty in this browser harness. |
| Node regression | PASS: 621 tests; zero failures/skips. |
| Deno / TypeScript | PASS: 201 shared Deno tests; cached type checks for all three changed Edge Functions. |
| Migration compatibility / rollback | PASS: six migrations applied in order and rolled back in a fresh native PostgreSQL fixture; RLS, privileges and 12 financial/workflow triggers checked. Final PGlite/browser fixtures load all six. This does not certify current production drift. |
| Stripe / Resend | Existing provider-boundary tests simulate cents/reference/idempotency, refund responses/failures and communication history/retries. No provider-confirmed test charge/refund/email occurred. Existing connection inventory did not expose an APS Stripe test context; PATC resources were not used. |

Reproducible entry points: `tests/neighborhood-{paid-conversion-edge,conversion-checkout,invoice-finalization}.test.mjs`, both neighborhood browser scripts, `tests/neighborhood-native-concurrency.py`, `scripts/verify-neighborhood-migrations.sql`, and the public capture scripts. Sanitized test logs are copied into the permanent owner package's `evidence/` folder.

## Migration and rollback runbook addition

Apply the exact reviewed sequence only after release authorization/gates allow it:

1. `20261016032854_neighborhood_pricing_program.sql`
2. `20261016045905_neighborhood_review_hardening.sql`
3. `20261016092536_neighborhood_atomic_conversion.sql`
4. `20261016101212_neighborhood_financial_history_integrity.sql`
5. `20261016124235_neighborhood_reconciliation_retry_safety.sql`
6. `20261016152822_neighborhood_paid_conversion.sql`

Migration 6 depends on all five and existing conversion/quote/invoice/payment/refund/service/queue tables. It adds an operation/snapshot table, admin-read RLS, RPC grants and a quote trigger. Trigger creation takes a table lock; conversion obtains row locks. Existing child-first writers can deadlock against parent-first RPCs; PostgreSQL aborts one transaction, and the entire failed operation must be retried. Native tests establish serialization, not exhaustive hosted webhook retry behavior.

The updated Edge functions are `admin-service-adjustment`, `client-quote-action`, and `create-embedded-checkout`; release still includes earlier changed functions listed in the unified release runbook. Coordinate database/Edge/frontend versions. Reverting the frontend or an Edge Function does not remove triggers or undo financial records. Retain operation history, issued item snapshots and invoices. Any database reversal must be a reviewed forward correction, not dropping tables or disabling safeguards. No production migration/rollback script was executed.

## Remaining decisions and release gates

| Gate | Status / smallest required next action |
| --- | --- |
| Unpaid-balance reductions | **UNKNOWN / OWNER CONFIRMATION REQUIRED:** may a $100 invoice with $40 paid changing to a $60 service receive a separate audited $40 credit adjustment, leaving $20 due, while preserving original invoice/payment? Refunds still require approval. Pending answer: no credit memo is created, and this path remains blocked. |
| Customer conversion communications | Manual administrator review task and customer portal history are implemented. Actual approved-message delivery/retry through APS Resend remains unverified; do not describe the review task as email delivery. |
| Hosted workflow | BLOCKED pending exact-scope authorization and safe provider routing. Existing preview points to production Supabase. Local browser fixtures do not prove hosted Auth, storage, customer portal, or provider callbacks. |
| Production schema check | Read-only drift review may proceed; rollback-only DDL still needs authorization of the six final hashes, target, maintenance window and lock budget. |
| Complete recovery | BLOCKED, separately tracked and not waived. Prior partial restore matched 123 tables / 2,436 rows. Missing compatible pg_net/supabase_vault support prevents full Supabase restoration certification. No new software or infrastructure was installed. |
| Release decision | Keep PR draft/unmerged. Production release is not certified until applicable gates pass or the owner explicitly revises release policy. |

## Controlled hosted checks still requiring authorization

| Check | Purpose / objects / writes | Locks and financial/communication risk | Rollback / evidence |
| --- | --- | --- | --- |
| H1 rollback-only DDL | Apply the six exact files via `scripts/verify-neighborhood-migrations.sql`; temporary tables/policies/functions/triggers and program seed. Real transactional writes. | 2-second lock timeout, 30-second statement timeout, 60-second idle transaction limit. Table/exclusive locks can briefly block production writers. No provider call or financial fixture. | Explicit rollback; abort on contention without raising limits. Verify RLS, RPC grants, 12-trigger inventory and object absence after rollback; record hashes/timings. |
| H2 synthetic lifecycle | At most eight explicitly marked requests: six neighborhood combinations plus two standard parity cases; synthetic documents, authorized admin/test identities; quote, eligibility, appointment and portal checks. Persisted production rows/storage objects. | Request/financial row locks and possible triggers/notifications. No live financial transaction; review recipient suppression and request-scoped provider isolation before running. | Maintain exact row/object inventory; archive via established process. Do not delete audit history or real records. Evidence: IDs, original attribution, item totals, permissions, transitions, zero unintended outbound calls. |
| H3 provider confirmation | Verified APS Stripe test context and authorized Resend test recipient/routing; isolated synthetic invoice and webhook IDs. Test provider writes. | Must not replace global live keys or replay events into live financial records. Recipient allowlist mandatory. | Preserve test receipts/logs and delivery IDs; show test mode and zero live financial changes. If safe routing is unavailable, leave blocked. |

Read-only metadata checks do not authorize H1–H3. No merge or production deployment is authorized by passing local checks alone.
