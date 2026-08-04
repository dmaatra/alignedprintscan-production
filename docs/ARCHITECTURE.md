# Architecture

## System statement

**CONFIRMED IN CODE:** Aligned Print & Scan is a static multi-page HTML/CSS/vanilla JavaScript application with Supabase as its backend. There is no frontend framework, build system, package manifest, or bundler in the repository.

**CONFIRMED IN DOCUMENTATION:** The owner-approved architecture is static multi-page HTML, shared/page-specific CSS, vanilla JavaScript, Supabase Database/Auth/Storage/Realtime/Edge Functions, Stripe, Resend, Vercel, and GitHub. Next.js is abandoned historical direction and is not an approved migration target. No frontend framework, bundler, or package-based build system may be introduced without a separately approved migration plan, risk analysis, data-preservation plan, testing plan, and deployment strategy.

## Runtime components

| Layer | Current implementation | Evidence |
|---|---|---|
| Public website | Root-level HTML pages using `assets/css/styles.css` and `assets/js/script.js` | **CONFIRMED IN CODE** |
| Pricing | Browser configuration in `assets/js/pricing-config.js` | **CONFIRMED IN CODE** |
| Customer portal | `success.html` plus status and action code in `assets/js/script.js` | **CONFIRMED IN CODE** |
| Admin authentication | `admin-login.html`, Supabase Auth, and `assets/js/admin.js` | **CONFIRMED IN CODE** |
| Admin application | `admin-dashboard.html`, `admin.js`, and `admin-v3.js` | **CONFIRMED IN CODE** |
| Database | Supabase Postgres accessed through supabase-js and REST from Edge Functions | **CONFIRMED IN CODE** |
| Object storage | Supabase Storage bucket `service-request-files` | **CONFIRMED IN CODE** |
| Server operations | 15 Supabase Edge Function directories under `supabase/functions/` | **CONFIRMED IN CODE** |
| Payments | Stripe Embedded Checkout and webhook processing | **CONFIRMED IN CODE** |
| Email | Resend called only from Edge Functions | **CONFIRMED IN CODE** |
| Hosting/deployment | Owner-controlled Vercel deployment connected to GitHub branch `main` | **CONFIRMED IN DOCUMENTATION**; live project settings are **PRODUCTION VERIFICATION REQUIRED** |
| Source governance | GitHub repository, branches, focused commits, pull requests, owner review, history, collaboration, rollback/recovery, Vercel triggers | **CONFIRMED IN DOCUMENTATION**; not an application-runtime dependency |

## Public entry points

- `index.html`: homepage and service overview.
- `pricing.html`: pricing menu and five-step guided intake.
- `success.html`: request-specific status, quote, payment, appointment, receipts, customer actions, and document uploads.
- `support.html`: support-ticket form.
- `remote-online-notary.html`, `mobile-notary.html`, and `print-scan.html`: service information.
- `faq.html`, `terms.html`, `privacy.html`, and `accessibility.html`: policy and informational pages.

All are **CONFIRMED IN CODE**.

## Public data flow

1. `pricing.html` gathers identity, service details, documents/add-ons, schedule, and acknowledgments.
2. `submitRequestToSupabase()` in `assets/js/script.js` inserts `customers`, `service_requests`, and one service-specific row.
3. Files are uploaded to `service-request-files`, with metadata inserted into `request_files`.
4. A `request_status_updates` row is inserted.
5. `send-request-email` is invoked; an email failure is treated as secondary to saving the request.
6. The browser redirects to `success.html` with request ID, service, and APS reference.

**CONFIRMED IN CODE.** These browser-side inserts rely on RLS policies that are only partially represented by local migrations.

## Customer-status flow

1. `success.html` invokes `get-request-status` using the request ID/reference.
2. The function uses the service role to assemble the request, customer, service details, files, invoices, items, actions, and communication summaries.
3. Status-specific views render quotes, payment schedules, appointment details, RON links, receipts, and support actions.
4. Quote approval invokes `client-quote-action`.
5. Payment invokes `create-embedded-checkout`; Stripe returns to `success.html`, and `stripe-webhook` performs authoritative payment updates.
6. Cancellation/reschedule and additional uploads invoke dedicated public Edge Functions.

**CONFIRMED IN CODE.** The portal is reference/request based and does not authenticate the customer as an account holder.

## Admin flow

1. `admin-login.html` signs in with Supabase email/password Auth.
2. `admin-dashboard.html` requires an active session, loads requests/support data, and subscribes to Realtime.
3. `admin.js` owns core data and workflow operations.
4. `admin-v3.js` reorganizes legacy detail sections into tabs and renders Phase 4.1 modules.
5. Browser-side admin queries depend on RLS. Privileged financial/customer-action operations use Edge Functions.

**CONFIRMED IN CODE.** The UI is a hybrid: core long-form markup is dynamically rendered, then moved into tab panels by heading-based rules.

## Architectural risks

- **CONFIRMED IN CODE:** Browser-side multi-table intake and admin order creation are not atomic.
- **CONFIRMED IN CODE:** Public status reads use an unauthenticated Edge Function and a request identifier; authorization is not customer-account based.
- **CONFIRMED IN CODE:** Public reads exist in migration history for invoices, invoice items, and status updates. Their production necessity and exposure require review.
- **CONFIRMED IN CODE:** Edge Functions repeat raw REST helper logic and status calculations, increasing drift risk.
- **CONFIRMED IN CODE:** Status values are free text, not a shared enum.
- **PRODUCTION VERIFICATION REQUIRED:** Whether remote Supabase policies differ from local migrations.

## Historical reconciliation

- **HISTORICAL OR POSSIBLY OUTDATED:** Next.js was previously listed as part of the stack. The owner has abandoned that direction; the approved application remains static HTML/CSS/vanilla JavaScript.
- **HISTORICAL OR POSSIBLY OUTDATED:** `README.md` says the intake is merely “front-end ready.” Current code is connected to Supabase and Edge Functions.
- **HISTORICAL OR POSSIBLY OUTDATED:** Early setup files list Twilio, Clerk SMS, BlueNotary, OneNotary, and Google Maps as recommendations. They are not active integrations in current code.
- **HISTORICAL OR POSSIBLY OUTDATED:** Earlier admin documents describe a long dashboard and disabled navigation; current code has the v3 split workspace and Phase 4.1 module layer.
