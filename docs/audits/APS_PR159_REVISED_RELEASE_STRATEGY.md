# PR #159 — revised release strategy and verification

2026-10-16. **CONFIRMED IN CODE** unless explicitly qualified. PR remains draft; production is unchanged. This checkpoint supersedes earlier statements that an isolated hosted backend must be created merely to continue application testing. Existing infrastructure supports the work below. Full disaster recovery remains a separate, unpassed release gate.

## Changes and evidence

Added forward migration `20261016124235_neighborhood_reconciliation_retry_safety.sql`; none of the original four migrations was rewritten. The resolver now rejects draft/missing-status invoices and invalid amounts, preserves a completed operation's revision in its audit result, and returns the same result for an exact administrator/revision/reason retry without another event or revision. Historical rows are not backfilled or rewritten.

Five financial-table triggers serialize neighborhood financial writes against the service-request row lock. Existing invoice/payment/refund/item/quote rows are additionally locked during validation. Reassigning financial records into or out of a neighborhood request is rejected. Standard requests without promotion applications do not acquire this additional parent lock.

| Requirement | Result and scope |
| --- | --- |
| Atomic pricing-program reconciliation | PASS locally: injected final timeline failure rolls back application, review and timeline writes together. |
| Historical quotes, invoices, invoice items, payments and successful refunds | PASS for tested reconciliation: alteration is detected and resolution rejected; legitimate separate invoice/refund records resolve. This is not universal immutability enforcement for every APS writer. |
| Authorization and RLS | PASS in existing synthetic SQL/browser suites: anonymous/nonadmin denial and admin paths. Hosted identity/policy certification remains outstanding. |
| Idempotency | PASS: exact successful resolver retry returns the result with one audit event and one revision increment; different operation or unauthorized retry is rejected. |
| Concurrent financial inserts and reconciliation | PASS in native PostgreSQL separate sessions: all five financial inserts wait on parent lock; competing resolver waits and succeeds on retry with one audit event. Exhaustive webhook/admin deadlock and retry integration remains outstanding. |
| Reconciliation amounts | PASS: supplemental invoice and linked successful refund; draft, null-status, NaN/infinite amounts, changed originals and unlinked refunds rejected. |
| Already-paid pricing review | PASS locally: review marks adjustment pending and retains financial records; resolution requires separate financial records. |
| Paid service conversion | **FAILED / incomplete**: current conversion RPC still rejects invoice/payment/refund history before any write. This is application work, not an infrastructure blocker. |
| Customer communications after pricing change | Customer-visible audit events verified; automatic delivery, provider retry and correct revised service/quote email remain unverified. No messages sent in this checkpoint. |

Current regression: **597 Node tests passed, zero failures/skips; 201 Deno tests passed**. Actual local customer browser: all six service paths at desktop/mobile (12 submissions). Actual local Operations Portal: eligibility, $25/$4 bases, standard-mileage denial, quote itemization, appointment editing, pre-invoice conversions, invoice retry, partial/paid views, global modules and denied access. These use synthetic fixtures/mocked provider transport; they do not establish hosted Auth, Storage, Stripe or Resend end-to-end success.

Logs are private local artifacts at `/private/tmp/aps-revised-strategy-{node,deno,admin,customer,migrations,native-all}.log`. Native concurrency output reports five `CONCURRENT_INSERT_FENCED` results, `CONCURRENT_RESOLVER_FENCED`, and `RETRY_SUCCEEDED_WITH_ONE_AUDIT_EVENT`.

## Migration ordering and rollback

Apply only the exact reviewed sequence, after release gates and authorization permit deployment:

1. `20261016032854_neighborhood_pricing_program.sql`: private configuration, applications/review history, RLS, FKs/checks/indexes, review/reconciliation functions, quote/item/invoice/queue triggers.
2. `20261016045905_neighborhood_review_hardening.sql`: replaces quote guard, depends on (1), checks itemized totals and issued-price protections.
3. `20261016092536_neighborhood_atomic_conversion.sql`: atomic pre-invoice conversion RPC, depends on (1), existing service/Proof/conversion/queue tables; preserves original acquisition and estimate.
4. `20261016101212_neighborhood_financial_history_integrity.sql`: nullable payment snapshot column, snapshot trigger and replacement resolver; older reviews without snapshots fail closed, without invented backfill.
5. `20261016124235_neighborhood_reconciliation_retry_safety.sql`: resolver replacement plus five serialization triggers, depends on (4)'s snapshots and existing financial tables.

All five applied in order on fresh PGlite and native PostgreSQL fixtures. The native rollback script asserted RLS, RPC grants and trigger inventory, then confirmed rollback removed the objects. Migrations 3–5 also applied and rolled back against the existing restored production schema, where migrations 1–2 were already present. Final serialization triggers were absent after rollback. This establishes fixture/restored-schema compatibility, **not fresh production drift validation**. The PR migrations themselves do not require pg_net or Vault.

`CREATE TRIGGER` takes table locks; the snapshot `ALTER TABLE` requires an exclusive table lock. Financial operations now acquire request-row locks and may wait. Legacy child-first updates racing parent-first RPCs can deadlock: PostgreSQL aborts a transaction, so callers must retry the complete failed operation, not just its final REST request. Production workload behavior and provider retry handling remain release checks.

A frontend/Edge rollback does not reverse these guards, the payment snapshot trigger, review-queue synchronization, or financial serialization. Retain history tables, snapshots, and protections. If database behavior needs reversal, prepare and test a separate forward corrective migration with explicit trigger/function scope; never blindly disable all triggers or drop financial history. Stopping promotional intake alone does not stop callbacks for existing requests. Pause relevant administrative financial actions while coordinating rollback and provider retries.

## Controlled hosted verification plan — not executed

The preview uses the hosted APS backend; opening it is not backend isolation. The following scopes require separate review before any non-read-only production activity.

| Category | Exact proposed scope | Safeguards and approval boundary |
| --- | --- | --- |
| Read-only | APS project `sfsdniavqldgbiretply`: migration ledger, column/type/FK/check/index/trigger/function definitions and effective grants/RLS; Vercel PR preview identity; no customer row contents. | Recheck current drift and compare against restored baseline; output sanitized metadata only. No DDL, fixture writes or provider calls. |
| Rollback-only DDL | `scripts/verify-neighborhood-migrations.sql`, exact five migration hashes, APS project only. `BEGIN` and unconditional `ROLLBACK`; abort if neighborhood objects already exist. | **Not authorized/executed in production.** Review script/hash, low-traffic window, active transactions and target first. `lock_timeout=2s`, per-statement timeout=30s, idle transaction timeout=60s. Lock contention or any error means disconnect/rollback, not increased timeout or automated retry. Temporary locks still affect production despite rollback. These SQL files make no external provider calls. |
| Synthetic submissions | Proposed maximum eight requests: six neighborhood service combinations and two standard parity requests; fixed run marker, reserved `example.invalid` identities, synthetic address/documents, administrator-owned test identities. | **Not authorized/executed.** Review exact payloads, request IDs, document paths, notification suppression and cleanup/archival plan first. Exercise promotion review/denial, draft quote, portal, readiness and appointments without live money or email. These are real persisted production writes, even when synthetic. |
| Provider tests | Existing Stripe test mechanisms and mocked Resend first; hosted test requires verified test-mode credentials and a recipient allowlist/suppression path. | Never swap global live credentials, initiate live payments/refunds, email customers or use PATC. No shared live webhook replay. If safe request-scoped routing is unavailable, report blocked. |
| Actual production changes | Migration application, Edge deployment, real records, live charges/refunds/messages, merge or promotion. | Out of scope until every applicable release gate passes or owner explicitly revises policy. No blanket permission inferred from rollback/synthetic authorization. |

Proposed hosted success evidence: request IDs/run marker; persisted original source and eligibility; approved $25/$4 or standard/mileage amounts; preserved quote/invoice/payment/refund snapshots; item totals; portal/API responses; document access-denial results; request-to-appointment transition; zero unintended outbound events; exact synthetic archival inventory. Sanitized evidence must distinguish persisted success from mocked success.

## Reproducing native concurrency without installation

Use the already available PostgreSQL binaries/server on its private Unix socket, with TCP/preload workers disabled. Create an empty disposable database named `aps_pr159_revision_fixture`; do not reuse a development database or load the production dump. Run `tests/fixtures/neighborhood-native-bootstrap.sql` with psql and `ON_ERROR_STOP=1`; its guard rejects other database names. The existing cluster already provides anon/authenticated/service_role roles. Then run `tests/neighborhood-native-concurrency.py` with `APS_TEST_PSQL` pointing to the existing psql and `APS_TEST_DSN='host=/private/tmp/aps-isolated-restore port=55439 user=postgres dbname=aps_pr159_revision_fixture'`. This test accepts only that exact local target. Dispose of only the newly created fixture database after testing.

## Remaining release work and decisions

- Finish the paid service-conversion lifecycle: approved destination itemization, immutable old quote/invoice references, separate supplemental charges/refunds, customer approval and notification, resumable provider failures, and all-or-nothing service/pricing transition. Existing sequential REST conversion is not a safe substitute. No new software is necessary to implement its fixtures.
- Verify deadlock/retry behavior of actual payment/refund/quote handlers and the hosted lifecycle within an explicitly approved controlled scope.
- Fresh production schema compatibility remains a read-only follow-up; rollback-only production DDL and synthetic writes require the exact-scope authorization above.
- Full Supabase recovery remains **BLOCKED**, not waived. Existing partial restore/backup evidence is retained; missing pg_net and supabase_vault support prevents complete certification. The known partial recovery matches 123 tables/2,436 rows but does not certify extensions, Vault or platform configuration/storage recovery.
- The owner must either retain and satisfy full restoration as a deployment gate or explicitly revise that release policy. Application testing can continue without that decision. No infrastructure purchase or installation is requested by this report.

PR #159 remains draft and unmerged. This checkpoint does not certify release readiness.
