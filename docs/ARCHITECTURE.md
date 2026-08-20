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
| Object storage | Four private Supabase Storage buckets: `service-request-files`, `request-files`, `order_files`, and `proof-assets` | **CONFIRMED IN PRODUCTION (Release 10 audit)** |
| Server operations | 33 deployed Supabase Edge Functions, matching 33 maintained function directories | **CONFIRMED IN CODE AND PRODUCTION (Release 10 audit)** |
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
2. The active submit handler invokes `public-request-submit`; the older browser multi-table helper remains unreachable compatibility code.
3. The Edge Function validates the request and files, uses the transactional `aps_create_request_with_customer` service-role RPC, and rolls back failed request assembly.
4. Documents are stored in the private request-document path with request-scoped metadata and authoritative PDF page-count handling.
5. The function invokes maintained notification delivery; customer success remains independent of a secondary administrator-alert failure.
6. The browser redirects to `success.html` with request ID, service, and APS reference.

**CONFIRMED IN CODE.** Release 10 removes browser execution of the transactional intake RPC and retires anonymous access to superseded order/quote intake tables while preserving their history.

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

- **CONFIRMED IN CODE:** Public intake is transactional; some administrator workflows remain multi-step but use server authorization and durable history.
- **INTENTIONAL ARCHITECTURE:** Version 1 Customer Portal access is request/reference scoped rather than a retail customer account. The server returns a customer-safe projection and filters unreleased/internal documents.
- **FIXED IN RELEASE 10:** Superseded `orders`, `order_files`, `quote_requests`, and `quote_request_files` retained historical data behind anonymous/public read policies. Release 10 removes browser access without deleting records.
- **CONFIRMED IN CODE:** Edge Functions repeat raw REST helper logic and status calculations, increasing drift risk.
- **CONFIRMED IN CODE:** Status values are free text, not a shared enum.
- **CONFIRMED IN PRODUCTION (Release 10 audit):** 85 public tables have RLS enabled. Advisor findings and effective browser policies were reviewed; the Release 10 hardening migration addresses the release-blocking policy/function findings.

## Historical reconciliation

- **HISTORICAL OR POSSIBLY OUTDATED:** Next.js was previously listed as part of the stack. The owner has abandoned that direction; the approved application remains static HTML/CSS/vanilla JavaScript.
- **HISTORICAL OR POSSIBLY OUTDATED:** `README.md` says the intake is merely “front-end ready.” Current code is connected to Supabase and Edge Functions.
- **HISTORICAL OR POSSIBLY OUTDATED:** Early setup files list Twilio, Clerk SMS, BlueNotary, OneNotary, and Google Maps as recommendations. They are not active integrations in current code.
- **HISTORICAL OR POSSIBLY OUTDATED:** Earlier admin documents describe a long dashboard and disabled navigation; current code has the v3 split workspace and Phase 4.1 module layer.
