# APS Workflow Refactor — Phase 0 Inspection

Inspection date: 2026-08-12  
Branch: `codex/aps-workflow-refactor`  
Base verified: local `main` and `origin/main` both `d2aaf9ead7d0bb5a278d7f5d94a8009ee1a11236`

## Architecture findings

- **CONFIRMED IN CODE:** APS remains a static multi-page HTML/CSS/vanilla-JavaScript application. `admin-dashboard.html`, `assets/js/admin.js`, and `assets/js/admin-v3.js` form a hybrid admin application: `admin.js` renders and mutates data, while `admin-v3.js` reorganizes rendered sections into the shell and tabs.
- **CONFIRMED IN CODE:** `success.html` is both the post-intake page and the request-reference customer portal. Customer access is supplied by `get-request-status`; Version 1 does not use customer accounts.
- **CONFIRMED IN CODE:** `service_requests.status`/`workflow_status` are operational state. Invoices and `request_payments` are the financial ledger, although request-level compatibility totals remain.
- **CONFIRMED IN CODE:** Documents use private bucket `service-request-files`; metadata is stored in `request_files`. Existing code does not distinguish internal files from released customer deliverables.
- **CONFIRMED IN CODE:** Timeline (`request_timeline_events`) and communication (`request_communications`) exist, but event keys are inconsistent and email templates are embedded in Edge Functions.
- **CONFIRMED IN CODE:** Support Tickets is real, not a placeholder: public creation and admin resolution/archive behavior exist. It is removed from primary navigation but its data and code are preserved.
- **CONFIRMED IN CODE:** Phase 4.2 Proof tables and exactly three Proof Edge Functions are present. RON transaction controls remain fail-closed where signer identity/witness mapping is incomplete.
- **CONFIRMED IN PRODUCTION:** Supabase project `sfsdniavqldgbiretply` is healthy on Postgres 17.6. The five Phase 4.2 migrations and three Proof functions are deployed. The remote migration versions differ from repository filenames, so migration deployment must be drift-aware.
- **CONFIRMED IN PRODUCTION:** The live database contains real customer/request/document/financial records. Forward-only migrations and compatibility backfills are mandatory.

## Duplicate-invoice root cause

`updateRequestStatus("payment_received")` in `assets/js/admin.js` always calls `recordAdminPayment("initial")`. After Stripe has paid Invoice #1, `record-admin-payment` excludes the paid invoice from its target search. Its legacy fallback then assumes Invoice #1 is missing and calls `createMissingInitialInvoice()`, which inserts a new primary invoice. The status control therefore crosses the operational/financial boundary and creates the reported duplicate.

The repair separates explicit payment recording from status selection, rejects fallback materialization whenever any primary invoice already exists, preserves paid invoices as immutable, links new primary invoices to their approved quote, and adds database uniqueness for primary invoice/source-quote and Stripe external references.

## Existing template inventory

| Existing live communication | Current source before refactor |
|---|---|
| Request received / admin alert | `supabase/functions/send-request-email/index.ts` |
| Quote ready, reschedule, quote expired, final balance, payment received, final payment, appointment confirmed, completed, fallback status | `supabase/functions/send-order-email/index.ts` |
| Quote approved admin alert | `supabase/functions/client-quote-action/index.ts` |
| Invoice email | `supabase/functions/send-invoice-email/index.ts` |
| Customer cancellation/reschedule receipt | `supabase/functions/customer-request-action/index.ts` |
| Cancellation/reschedule decision | `supabase/functions/admin-resolve-customer-action/index.ts` |
| Payment confirmations | Stripe/manual payment workflow plus `send-order-email` |

The forward migration registers these operational categories plus appointment reminders, RON session ready, mobile confirmation, scan/document delivery, final invoice, cancellation, and general customer message in `message_templates`. Existing `request_communications` rows are copied into `messages` without deleting or rewriting historical records.

## Implementation plan

1. Add additive normalized quote, participant, act, document mapping, review queue, message/template, attachment, and state fields.
2. Enforce invoice/payment idempotency and Stripe webhook authenticity.
3. Separate the global cross-order sidebar from the eight transaction tabs.
4. Add intake signer identity, per-act selection, controlled upload exception, and witness-source behavior.
5. Prioritize a single customer Action Required card and simplify post-intake entry into the request.
6. Validate syntax, database compatibility/RLS, browser behavior, financial regression paths, deployment, and existing live records before release.

## Release gates

- The repository has no base migration and the remote migration ledger uses different versions. Apply the new migration explicitly only after dry-run/transaction validation against the connected schema.
- Stripe webhook deployment requires `STRIPE_WEBHOOK_SECRET`; the function now fails closed without it.
- GitHub CLI is not installed in the current runtime. Local Git remains usable, and the connected GitHub app can create the PR after a branch is pushed, but the repository publish skill treats missing `gh` as a publish blocker.
- Production deployment remains blocked until automated checks, preview smoke tests, migration/RLS validation, and production credentials/deployment access succeed.
