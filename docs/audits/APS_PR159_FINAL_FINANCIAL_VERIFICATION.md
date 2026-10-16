# PR #159 — final financial verification and hosted preparation

2026-10-16, continued from `86472cb`. **CONFIRMED IN CODE** for local findings; hosted metadata findings are identified separately. **Not technically ready for a controlled release.** PR stays draft. No production DDL/DML, provider transaction, email send, installation, merge or deployment was performed.

## Paid conversion results

The new test executes the actual `admin-service-adjustment` Edge handler with mocked Auth/REST transport backed by the actual five migration functions in PGlite. It is stronger than a source-string assertion, but is not hosted Edge/Auth verification.

| Scenario | Result |
| --- | --- |
| Original invoice $100, paid $100; proposed service $140 / $100 / $60 / $20 | Each preview and conversion is rejected by `aps_convert_neighborhood_service` because financial history exists. Retry is also rejected. All captured request, quote, invoice, item, payment, refund, promotion, conversion, queue and timeline records remain identical. |
| Original invoice $100, paid $40; same four proposed totals | Same safe rejection. The cases span increased charges, unchanged charges, reduced charges with remaining balance, and refund exposure. They do **not** complete a conversion or prove a successful conversion retry. |
| Existing Stripe references | Synthetic original PaymentIntent and Checkout Session references remain unchanged in every case; no Stripe/Resend/supplemental-invoice request occurs. |
| Missing/nonadmin authentication | Actual Edge handler rejects before conversion RPC or financial access; administrator bearer is forwarded to the RPC for independent SQL authorization. Auth responses themselves are mocked. |
| Pricing-program increase, original $35 paid in full | Separate $35 invoice reconciles new net charges to $70; original invoice/payment remain identical and invoice balances sum to $35. |
| Pricing-program increase, original $35 with $10 paid | Separate $35 invoice reconciles to $70; original invoice/payment remain identical and invoice balances sum to $60. |
| Pricing-program reduction | Existing SQL suite passes linked successful refund reconciliation and rejects unlinked/altered/over-limit refund evidence. This does not prove provider refund completion or all unpaid-credit cases. |
| Atomic rollback / concurrency / successful retry | Existing reconciliation late-write rollback and exact retry tests pass in the full suite. Native multi-session evidence from `86472cb` remains valid because migrations are unchanged. These are reconciliation/pre-invoice tests, **not successful paid service-conversion tests**. |

**Genuine implementation blocker:** the neighborhood RPC explicitly rejects invoices, payments, refunds and checkout references. Removing that guard would expose the older sequential REST conversion, which mutates service/details before supplemental-invoice/refund work finishes. It is not an atomic or resumable substitute. Paid conversion needs an implemented approved destination quote/adjustment lifecycle that preserves issued history, handles original unpaid balances and refund exposure, and survives provider failures. A verification pass cannot certify that missing lifecycle.

## Providers and Edge Functions

- **Simulated Stripe adapter — PASS:** actual refund adapter retains original PaymentIntent, sends cents correctly, reuses a stable idempotency header, distinguishes pending from succeeded, and propagates provider rejection/failed status. These tests intercept all fetch calls; no HTTP request reaches Stripe. Sending the same mocked key twice is not proof of Stripe's own deduplication.
- **Refund validation — corrected and PASS:** nonfinite requested amounts, original payment values and corrupted refund totals are rejected. Added focused regression cases. No historical financial record is modified by the correction.
- **Simulated communication-history integration — PASS:** durable success/provider-ID evidence, redacted failure evidence, successful-send deduplication, failed-send retry, and insert-conflict deduplication pass. No Resend delivery or inbox receipt is claimed.
- **Invoice finalization — PASS locally:** injected item-link/request-write failure is repairable on retry without a duplicate invoice; partially paid invoice remains unchanged.
- **Actual provider-confirmed test transactions — BLOCKED:** the connected Stripe inventory exposes only `Aligned Print & Scan LLC` with `livemode=true`. No matching test-mode context is available through that connector. It was not switched or used for writes. Previously identified Resend connection is not a verified APS test route; no PATC resources were used. Existing provider mocks remain usable.
- **Hosted Edge/Auth/Storage/provider lifecycle — unverified:** no production-writing test was performed. Pending provider refunds, webhook reconciliation and retry after partially persisted financial work still require end-to-end evidence.

Current results: **614 Node tests passed, zero failures/skips; 201 Deno tests passed; affected `admin-service-adjustment` entrypoint type check passed using cached dependencies.** Existing desktop/mobile browser evidence from `86472cb` is retained; unchanged UI flows were not relabeled as newly executed hosted tests. Local logs: `/private/tmp/aps-final-financial-node.log` and `/private/tmp/aps-final-financial-deno.log`.

## Migration and rollback compatibility

Read-only APS production catalog checks confirmed PostgreSQL 17.6, all 13 queried base tables, `is_admin()`, and **308 expected fixture columns with none missing**. No October 16 migration entries and no `request_promotion_applications` table were present. Extension metadata remains pg_net 0.20.0 / supabase_vault 0.3.1. These checks read catalog metadata only, not customer rows. Column presence does not prove exact types, constraints, trigger order, privileges or production execution compatibility.

The five migrations are unchanged from `86472cb`. Prior fresh-fixture ordered application/rollback and restored-schema migration 3–5 validation remain valid. Production rollback-only execution has **not** occurred. The shared refund validator change requires the affected Edge deployment when release is authorized; reverting it would restore the invalid-number validation gap. Frontend or Edge rollback still leaves all database triggers/functions active. Retain financial/audit tables and prepare any database correction as a separately tested forward migration.

## Exact hosted checks still requiring authorization

Target only APS project `sfsdniavqldgbiretply`; no PATC. The historical methodology permits scoped tests, but is not itself authorization for production writes.

| Proposed check and purpose | Production objects affected / writes | Locking risk | Financial risk | Communication risk | Rollback behavior | Expected evidence |
| --- | --- | --- | --- | --- | --- | --- |
| **H1: rollback-only migration compatibility** — run `scripts/verify-neighborhood-migrations.sql` plus the exact five reviewed files | Creates promotion tables/indexes/policies/functions and triggers; seeds program row; replaces functions, adds snapshot column. All inside one transaction. | Table locks from trigger creation; exclusive lock from ALTER TABLE. `lock_timeout=2s`, statement timeout=30s, idle transaction timeout=60s; abort on contention/error. | No financial fixtures or provider calls; temporary blocking of real financial writers remains possible. | No email calls in this script. | Explicit ROLLBACK; confirm objects absent. Disconnect on error. No timeout increases/retries without review. | Migration success, expected RLS/grants/11-trigger inventory, post-rollback absence, sanitized timing and error log. |
| **H2: controlled synthetic intake and admin lifecycle** — six neighborhood services plus two standard-parity requests, maximum eight | Real persisted synthetic customer/request/service/document/participant/promotion/quote/timeline/queue rows; test Auth sessions. Exact payloads, fixture IDs and paths must be reviewed first. | Normal row/index locks; subsequent review/quote request locks. No load testing. | No live payment methods or checkout, no production financial ledger entries under this scope. | Must prove automatic email/admin-notification suppression or exact approved test recipient routing before submission. | Authorized archive/quarantine of exact run IDs and removal of synthetic Storage files per agreed inventory; not a transaction rollback. Keep audit history. | Persisted source/eligibility, $25/$4 or standard mileage, quote itemization, readiness, portal access/denial and appointment evidence. |
| **H3: synthetic paid conversion/provider lifecycle** — full/partial/increase/decrease/refund and duplicate delivery | Synthetic invoices/payments/refunds/communications/provider-event records and corresponding test-mode Stripe objects. Exact amounts, keys, event IDs and recipients require review. | Parent/financial row locking and potential deadlocks; whole-operation retry required. | Unacceptable until every provider route is verified test mode and synthetic ledger entries cannot affect real revenue. Currently blocked by missing paid-conversion implementation and unavailable connected test context. | Only verified APS test routing; no real customers. Test notifications can persist even if DB changes roll back. | Cannot roll back external calls with SQL. Preserve synthetic audit records; explicitly clean/archive test objects. Never compensate by issuing a live refund. | Provider-confirmed test IDs/mode, signed webhook/dedup evidence, original record equality, correct balances/refunds, one successful transition and communication history. |

H1 script SHA-256: `552346e7e622738974fea0183a597012c1b0271a055b906b966a039a91863463`.

Migration SHA-256 values, in order:

- `20261016032854`: `90ae53b4f8b6ba48534068df4b3bebe0e2ac68d35c3a0bcc03283d378bfeaf82`
- `20261016045905`: `61054ea683a8dcc6818cdd25bf5a9072c00465a3ca9563f82b17191c7e3103cc`
- `20261016092536`: `b71c96841ac626852a72655379ae05c2df3503821a1ad1a601c4cd7a40c6cf67`
- `20261016101212`: `54edf672c322f8f9efcefa6196d3ebf9db28c75f4dd133cc70671faf5464c87e`
- `20261016124235`: `82a3ba0b3f5665d87486fedb94cd5172b95390c9134de62b3d910d34592ef562`

**Hosted prerequisite:** H1 cannot make uncommitted schema changes available to separate PostgREST/Edge sessions. Because the preview points at production and production lacks these migrations, H2/H3 cannot exercise the PR's new backend merely by authorizing H1. Committing the schema/deploying functions is a real production release action, expressly not authorized now. This dependency must be resolved in the release policy after the implementation gate is complete; no installation or new project is requested here.

## Release decision

**NOT READY.** Paid service conversion is incomplete; provider-confirmed test lifecycle and controlled hosted workflows are unverified. H1, exact synthetic payload approval for H2, and a safe test-mode routing plan for H3 are still required before their respective production-writing checks.

Full disaster recovery also remains an explicit outstanding gate. Preserved partial-restore evidence (123 tables/2,436 rows) does not verify pg_net/Vault or complete Supabase/platform restoration. No recovery requirement was waived. The remaining owner decisions concern exact production-writing scopes and the applicable recovery release policy; they do not prevent further local implementation and tests.
