# PR #159 — focused release decision, 2026-10-16

**CONFIRMED IN CODE:** Owner's three final revisions are implemented without redesign: eligibility wording moved to the existing pricing-disclaimer card immediately below One Visit; team display name is Doneisha Maat Ra; neighborhood team copy and sole /team CTA match the approved text. Existing repeating team-card grid is retained. Node regression: 621 pass, zero skipped/failed, with installed PGlite and TypeScript transform configuration. Screenshot evidence: output/owner-acceptance/final-visual-revisions.

## Decision: NO-GO under the retained recovery gate

Owner authorization now permits execution of a safe final release plan, including migrations and test financial transactions. It does not waive recovery or establish test-mode isolation. No production action was taken. Do not spend time on another broad infrastructure audit. Existing discovery establishes no compatible isolated full-restore target: pg_net 0.20.0, supabase_vault 0.3.1 and Vault encryption environment are missing. Preserved 123-table/2,436-row partial recovery is not complete recovery; Storage bytes/platform configuration also need separate recovery evidence.

The smallest decision is either identify an already available compatible disposable recovery target, or explicitly adopt a narrower release recovery policy accepting the documented application-schema restore evidence and residual platform risk. Neither decision is assumed. No installation, purchase or new resource is requested by this report.

## Focused launch boundary

Required: new neighborhood submission/attribution, manual eligibility, standard-denial mileage, pre-financial-history quote itemization/approval, existing ordinary invoice/payment/fulfillment, access control, hosted standard-intake parity. Hosted Auth/RLS/Storage, notification routing and checkout regressions are genuine launch gates because these paths are shared.

Deferrable: neighborhood service conversion after invoice/payment history, post-issue promotional repricing/reconciliation, new credit adjustments and conversion-triggered additional invoices/refunds. Unapproved credit creation already fails closed. Existing APS refunds and standard conversions must not be globally disabled.

**CONFIRMED IN CODE:** The paid-conversion RPC is currently granted to authenticated administrators and the Edge handler routes neighborhood conversions to it. There is no release-off switch. A focused release therefore requires a forward migration with database-level denial of deferred neighborhood paths, including direct RPC attempts; an Edge-only or browser-only flag is insufficient. Preserve ordinary non-neighborhood workflows. Test paid/partial/issued-history attempts and concurrency; allow only pre-history review/conversion. Do not silently drop migration 6 while deploying its callers. This enforcement change is proposed, not implemented or certified.

## Migration/function scope

1. 20261016032854: required promotion schema, attribution/eligibility review, quote/invoice guards.
2. 20261016045905: required review/quote hardening.
3. 20261016092536: atomic pre-invoice conversion; optional if all neighborhood service conversion is deferred, but current callers/dependencies assume it.
4. 20261016101212: financial-history snapshot/reconciliation protection; retain safeguards even if adjustment execution is deferred.
5. 20261016124235: reconciliation retries and shared financial serialization triggers; retain with current implementation, explicitly verify effects on existing writers.
6. 20261016152822: paid conversion and quote/history guard; optional product capability, but current Edge/quote/checkout code depends on its objects. Safest focused preparation retains all six plus a narrow forward disable migration, rather than selectively omitting files without refactoring and retesting.

Current coordinated Edge set: public-request-submit, get-request-status, send-request-email, admin-route-distance, admin-service-adjustment, client-quote-action, create-embedded-checkout, update-request-status. Intake/review/status functions support the core launch; conversion changes are partly deferrable but share existing cancellation/refund paths. Quote/checkout/completion functions must remain compatible with the selected schema. All eight are required for the current branch as packaged; reducing this set requires an explicit source/dependency diff and regression validation.

## Ordered plan and estimates (hands-on estimates, not guarantees)

1. Resolve retained recovery policy/target decision — external prerequisite, duration unknown. If compatible existing target is supplied: approximately 1–3 hours for isolated complete restore/integrity/platform checks, depending on data and access.
2. Implement/test narrow database and Edge deferral controls — 45–90 minutes. No production writes. Include direct SQL/RPC denial, ordinary existing-workflow parity, issued-history immutability and rollback tests.
3. Refresh read-only production schema/function baseline and backup manifest — 15–30 minutes. Catalog reads only; no customer changes. Record exact six-plus-disable migration hashes.
4. Rollback-only compatibility transaction — 10–20 minutes. Actual DDL writes/locks, explicit ROLLBACK; 2s lock timeout, 30s statement timeout, 60s idle transaction timeout, abort on contention. No fixture financial writes/provider calls. User's conditional release authorization applies only after recovery/policy permits proceeding.
5. Establish request-scoped test routing — 20–45 minutes if existing credentials support it. Verify APS Stripe test mode, synthetic ledger exclusion, authorized email recipients; never swap global live secrets. Missing test context remains a blocker, not permission for live charges/refunds.
6. Coordinated backend release and hosted canary — 45–90 minutes. Apply reviewed migrations individually, deploy only changed functions, then at most eight marked synthetic lifecycle requests with synthetic documents. Verify admin eligibility, quote totals, portal/file permissions, appointment/fulfillment, standard parity. Persistent rows/storage and outbound messages are real writes; preserve exact IDs/audit history, archive synthetic requests, route email only to authorized admin/test recipient. Financial tests only in verified test mode. External sends cannot be SQL-rolled-back. Hosted preview currently points to production: rollback-only DDL cannot expose uncommitted schema to separate Edge sessions. Backend activation is therefore a release action, not a pre-release isolated test.
7. Merge/deploy public frontend through existing GitHub/Vercel process after canary passes — 10–20 minutes; check deployment identity, desktop/mobile, QR destination, standard intake and admin access. On failure, halt new campaign intake and restore known frontend/function versions; database triggers remain and require reviewed forward correction. Never drop financial/audit history.

Shortest path: resolve item 1 first, then narrow financial deferral and scoped hosted verification. No live financial transactions are necessary to prove deferred conversion behavior. Further unrelated auditing or UI redesign does not resolve the release gate.
