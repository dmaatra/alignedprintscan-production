# APS Project Memory

Last repository review: 2026-08-03

## Current foundation

- **CONFIRMED IN CODE:** APS is a static multi-page HTML/CSS/vanilla JavaScript application with Supabase as its backend.
- **CONFIRMED IN CODE:** The public intake begins primarily at `pricing.html`; `assets/js/script.js` creates customer, request, service-detail, file, and status records.
- **CONFIRMED IN CODE:** `success.html` is a request-specific customer status portal, not an authenticated customer account area.
- **CONFIRMED IN CODE:** `admin-login.html` and `admin-dashboard.html` form the private admin application. Supabase Auth establishes the browser session; database access also depends on RLS.
- **CONFIRMED IN CODE:** Stripe Embedded Checkout, Stripe webhook processing, Resend email, Supabase Storage, and Supabase Realtime are represented in current source.
- **CONFIRMED IN DOCUMENTATION:** Vercel is the approved, owner-controlled production hosting/deployment platform, connected to the canonical GitHub production branch `main`. Vercel project settings require production verification.
- **CONFIRMED IN DOCUMENTATION:** GitHub is required for source control and development governance; it is not an application-runtime dependency.
- **CONFIRMED IN DOCUMENTATION:** Next.js is abandoned historical direction. APS must remain static HTML/CSS/vanilla JavaScript unless a separately approved architectural migration is authorized.
- **CONFIRMED IN DOCUMENTATION:** Proof is the approved future RON provider. Existing Proof-related data and workflows must be preserved, but live API session creation and synchronization are not current verified capabilities.

## Authoritative source order

The authoritative current project sources are `AGENTS.md`, `PROJECT_MEMORY.md`, `PROJECT_BIBLE.md`, current files under `docs/`, current application code, and current migrations and Edge Functions. Use this order when technical evidence conflicts:

1. Verified deployed behavior and remote state for production questions.
2. Current application code, migrations, and Edge Functions for repository behavior.
3. Current Supabase configuration.
4. Explicit owner decisions recorded in `PROJECT_BIBLE.md`, `AGENTS.md`, and `PROJECT_MEMORY.md`.
5. Current foundation documents and approved audits under `docs/`.
6. Historical root-level changelogs and deployment guides.

This order does not prove what is deployed remotely.

## Current service and pricing baseline

- **CONFIRMED IN CODE:** Active intake services are Remote Online Notary, Mobile Notary, and Print & Scan/Document Services.
- **CONFIRMED IN CODE:** Central pricing is in `assets/js/pricing-config.js`: RON online fee $25, notarial act $10, APS remote witness $25; mobile base $50, notarial act $10, APS mobile witness $50; document and courier rates are listed in that file.
- **HISTORICAL OR POSSIBLY OUTDATED:** Older documents cite RON starts at $40, mobile starts at $60, or mobile travel starts at $20. Current code instead produces a $35 one-act RON estimate and a $60 one-act mobile estimate from a $50 base plus $10 act.
- **CONFIRMED IN CODE:** Public estimates are estimates; current pricing and terms state that final quotes are reviewed before production, dispatch, or fulfillment.

## Current workflow baseline

- **CONFIRMED IN CODE:** Typical lifecycle: intake → under review → quote ready/approval → awaiting payment → payment received → appointment/fulfillment → optional final balance → final payment received → completed.
- **CONFIRMED IN CODE:** Workflow, payment, and appointment states are stored separately where newer fields exist.
- **CONFIRMED IN CODE:** Invoice #1 and later/final-balance invoices are separate `invoices` records. Payments can be linked by `invoice_id`.
- **CONFIRMED IN CODE:** Completion is blocked by `update-request-status` while a non-void/non-cancelled invoice has a positive remaining balance.
- **CONFIRMED IN DOCUMENTATION:** Invoice #1 contains all owner-approved charges known before work begins. Invoice #2 exists only for additional owner-approved charges arising afterward. APS supports one- and two-invoice workflows and is financially complete only when every required, non-void invoice is paid or otherwise resolved under APS rules.
- **CONFIRMED IN DOCUMENTATION:** Version 1 intentionally retains request-reference customer access; authenticated accounts are deferred.
- **CONFIRMED IN DOCUMENTATION:** Client-note history must preserve author, created timestamp, archived timestamp, and archived-by identity when available, and must never be destroyed.
- **CONFIRMED IN DOCUMENTATION:** Refund approval is administrative and must preserve approving administrator, amount, reason, and timestamp.
- **CONFIRMED IN DOCUMENTATION:** Specific retention periods are deferred, while APS remains obligated to comply with Texas notary and applicable legal/business retention requirements.

## Known defects and constraints

- **CONFIRMED IN CODE:** Phase 4.1 Milestone 1 is incomplete. See `docs/audits/PHASE_4_1_MILESTONE_1_AUDIT.md`.
- **CONFIRMED IN CODE:** Its note-archive trigger archives after any single invoice becomes paid, rather than after every required invoice is paid.
- **CONFIRMED IN CODE:** Archived customer-note history is not displayed in the Admin Notes tab.
- **CONFIRMED IN CODE:** Request search does not cover email, phone, or all invoice numbers.
- **CONFIRMED IN CODE:** The administrator order form is a basic form, not a complete order-entry wizard.
- **CONFIRMED IN CODE:** `route-distance` and `admin-route-distance` are generated hello-world handlers, not route calculators. **CONFIRMED IN DOCUMENTATION:** The current implementation is acceptable until an owner-approved replacement provides reliable distance/travel calculations for Mobile Notary pricing.
- **CONFIRMED IN CODE:** `supabase/config.toml` explicitly configures only 10 of the 15 function directories.
- **CONFIRMED IN CODE:** The repository has additive migrations for later tables but no base migration creating `customers`, `service_requests`, service-specific tables, `request_files`, or the admin-user system.

## Security memory

- **CONFIRMED IN DOCUMENTATION:** Admin setup expects an `admin_users` table and `is_admin()` RLS helper, but those definitions are not in repository migrations.
- **CONFIRMED IN CODE:** Several later migrations grant broad public reads or broad authenticated access. A full RLS audit is outstanding.
- **CONFIRMED IN CODE:** Several public Edge Functions run with `verify_jwt = false` and use the service role internally. Each must perform its own validation.
- **CONFIRMED IN CODE:** `record-admin-payment` validates a Supabase Auth bearer token and can enforce an admin-email allowlist.

## Unresolved owner decisions

See the consolidated questions in `docs/ROADMAP.md`. Highest priority:

1. Confirm the actual production schema/migration state and whether all migrations in this repository were applied.
2. Confirm the canonical pricing and whether tax, waiting, parking, and specialty fees require structured configuration.
3. Define the permitted non-payment resolutions that satisfy the established required-invoice financial-completion rule when implementation reaches that case.
4. Confirm the desired admin authorization model and staff roles.
5. Confirm whether route distance should use OpenRouteService, Google Maps, or another provider.
6. **PRODUCTION VERIFICATION REQUIRED:** Verify the connected Vercel project settings, domains, headers, redirects, preview policy, Git integration, and environment ownership.
7. Define Proof API credentials, ODN/APS-originated workflow boundaries, webhook design, identity/recording/audit synchronization, legal requirements, and rollout plan before live integration.
