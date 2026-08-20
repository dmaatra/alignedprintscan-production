# Integrations

## Supabase

### Database

**CONFIRMED IN CODE:** Supabase Postgres stores customers, requests, service details, documents, support, quotes/invoices, payments, statuses, customer actions, communications, timeline events, refund reviews, and customer-note history. See `docs/DATABASE_AND_DATA_MODEL.md`.

### Auth

**CONFIRMED IN CODE:** Admin login uses Supabase email/password Auth in `assets/js/admin.js`. The browser retains a Supabase session and uses its access token for protected admin payment recording.

**CONFIRMED IN PRODUCTION (Release 10 audit):** Admin access is enforced through Supabase Auth and maintained APS authorization helpers. Security-definer entry points were inventoried and checked for current-user/admin or tenant authorization.

### Storage

**CONFIRMED IN CODE AND PRODUCTION:** Current public intake and later customer uploads use validated Edge boundaries; admin upload uses authenticated authorization. All four production buckets are private, and permitted downloads use short-lived signed URLs or server-side document delivery.

**CONFIRMED IN CODE:** The local Proof document integration retrieves approved source PDFs server-side from `service-request-files`; signed URLs and storage paths are never returned by the Proof admin function. It enforces the existing APS 10 MB ceiling even though Proof documents may be up to 30 MB, computes SHA-256, and sends multipart bytes only through `ProofService` and `ProofClient`. The feature is not deployed and the supporting migrations are unapplied.

### Realtime

**CONFIRMED IN CODE:** Admin subscribes to `service_requests` and `support_tickets`, then reloads affected lists. Production publication state is **PRODUCTION VERIFICATION REQUIRED**.

### Migrations

**CONFIRMED IN CODE:** The repository contains additive SQL migrations, including the Phase 4.2 Proof foundation. They are overlapping release-era patches rather than a clean base-to-current schema. The initial schema is absent. Never infer that local migration presence means remote application.

## Edge Function catalog

**CONFIRMED IN CODE AND PRODUCTION (Release 10 audit):** APS maintains and deploys 33 Edge Functions. This includes public intake/status/resources, customer actions/documents, business account/auth/billing/portal functions, administrator operations, Stripe/Resend flows, route calculation, PDF page counting, and the three Proof functions. The table below is historical detail for the original catalog; current source and the Release 10 certification report are authoritative where it conflicts.

| Function | Purpose and caller | Auth/validation | Dependencies | Status |
|---|---|---|---|---|
| `send-request-email` | Sends request-received customer email and admin alert; invoked by intake | `verify_jwt=false`; requires request ID and uses service role | Supabase, Resend | **CONFIRMED IN CODE** |
| `route-distance` | Current handler echoes `Hello {name}` | Generated Supabase publishable/secret wrapper | Supabase runtime only | **CONFIRMED IN CODE: STUB** |
| `admin-route-distance` | Admin-only OpenRouteService travel calculation with private origin, cache, fallback/manual handling, and quote-lock safeguards | Authenticated APS administrator | Supabase, ORS | **CONFIRMED IN CODE AND PRODUCTION** |
| `get-request-status` | Assembles public customer-status payload | `verify_jwt=false`; request ID/reference checks in handler | Supabase service role | **CONFIRMED IN CODE** |
| `create-embedded-checkout` | Selects eligible invoice and creates Stripe Embedded Checkout | `verify_jwt=false`; request/invoice validation, no customer account auth | Supabase, Stripe | **CONFIRMED IN CODE** |
| `send-invoice-email` | Compatibility wrapper: updates awaiting-approval state then calls `send-order-email` | `verify_jwt=false` | Supabase, `send-order-email` | **CONFIRMED IN CODE; HISTORICAL PATH** |
| `stripe-webhook` | Processes Stripe checkout completion, records payment, updates invoice/request, emails status | `verify_jwt=false`; retrieves Stripe session/payment intent using secret key; no webhook-secret verification is visible | Supabase, Stripe, `send-order-email` | **CONFIRMED IN CODE; SECURITY REVIEW REQUIRED** |
| `send-order-email` | Sends status-specific customer/admin emails and logs status updates | `verify_jwt=false` | Supabase, Resend | **CONFIRMED IN CODE** |
| `update-request-status` | Updates workflow, blocks invalid completion, logs timeline, invokes eligible email | `verify_jwt=false`; does not visibly authenticate admin caller | Supabase, `send-order-email` | **CONFIRMED IN CODE; AUTH REVIEW REQUIRED** |
| `client-quote-action` | Approves quote or requests changes; materializes Invoice #1 and logs timeline/communications | `verify_jwt=false`; validates request/reference inputs | Supabase, Resend | **CONFIRMED IN CODE** |
| `create-additional-invoice` | Creates/updates open Invoice #2 and sends final-balance email | Not explicitly listed in config beyond `verify_jwt=false`; handler does not visibly authenticate admin caller | Supabase, `send-order-email` | **CONFIRMED IN CODE; AUTH REVIEW REQUIRED** |
| `record-admin-payment` | Records offline/test admin payments and recalculates financials | Bearer token validated through Supabase Auth; optional `ADMIN_EMAILS`/`ADMIN_EMAIL` allowlist | Supabase Auth/Database | **CONFIRMED IN CODE** |
| `customer-request-action` | Submits cancellation/reschedule request after request-email match; emails customer/admin | Not listed in config; handler validates email and action | Supabase, Resend | **CONFIRMED IN CODE** |
| `admin-resolve-customer-action` | Approves/denies customer action, updates request, creates refund review, emails customer | Not listed in config; handler does not visibly authenticate admin caller | Supabase, Resend | **CONFIRMED IN CODE; AUTH REVIEW REQUIRED** |
| `customer-upload-document` | Accepts base64 files up to 10 MB each after request-email match | Not listed in config; validates request and email | Supabase Database/Storage | **CONFIRMED IN CODE** |
| `proof-admin-transaction` | Organization check and APS-originated draft create/retrieve/refresh/delete/local-state commands | Valid Supabase user JWT plus `public.is_admin()` | Shared Proof lifecycle/service/client | **CONFIRMED IN CODE; LIVE CALLS OWNER-GATED** |
| `proof-admin-document` | Source uploads plus admin-only completed-document/audit retrieval into protected APS storage | Valid Supabase user JWT plus `public.is_admin()` | Shared Proof service, Database, private Storage | **CONFIRMED IN CODE** |
| `proof-webhook` | Webhooks V2 ingestion, durable deduplication, monotonic synchronization, retry/dead-letter state | Exact raw-body `X-Notarize-Signature` HMAC with `PROOF_WEBHOOK_SECRET`; no Supabase JWT | Database through service role after HMAC | **CONFIRMED IN CODE** |

### Function configuration gap

**CONFIRMED IN CODE:** `supabase/config.toml` does not explicitly configure `record-admin-payment`, `customer-request-action`, `admin-resolve-customer-action`, or `customer-upload-document`; it also does not contain a separate block for every function directory. Exact remote JWT settings are **PRODUCTION VERIFICATION REQUIRED**.

## Stripe

- **CONFIRMED IN CODE:** Browser loads Stripe.js on `success.html` and mounts Embedded Checkout.
- **CONFIRMED IN CODE:** `create-embedded-checkout` uses `STRIPE_SECRET_KEY`, returns the publishable key/client secret, and writes session identifiers.
- **CONFIRMED IN CODE:** `stripe-webhook` reads checkout session metadata, links a payment to an invoice, recalculates request totals, and invokes status email.
- **CONFIRMED IN CODE:** Duplicate payment records are avoided by checking Stripe identifiers.
- **CONFIRMED IN DOCUMENTATION:** Intended webhook endpoint is `https://sfsdniavqldgbiretply.supabase.co/functions/v1/stripe-webhook` with at least `checkout.session.completed`.
- **CONFIRMED IN DOCUMENTATION:** Earlier setup requires `STRIPE_WEBHOOK_SECRET`.
- **CONFIRMED IN CODE:** The current webhook file does not read or verify `STRIPE_WEBHOOK_SECRET`; it instead retrieves Stripe objects using `STRIPE_SECRET_KEY`.
- **PRODUCTION VERIFICATION REQUIRED:** Live/test mode, webhook events, endpoint health, and production secret configuration.

## Resend

- **CONFIRMED IN CODE:** Resend is called server-side from email and customer-action functions.
- **CONFIRMED IN CODE:** Common secrets include `RESEND_API_KEY`, `FROM_EMAIL` or `RESEND_FROM_EMAIL`, `ADMIN_EMAIL` or `ADMIN_NOTIFICATION_EMAIL`, `SUPPORT_EMAIL`, `SUPPORT_PHONE`, and `EMAIL_LOGO_URL`.
- **CONFIRMED IN CODE:** Secret naming is inconsistent between function generations.
- **CONFIRMED IN DOCUMENTATION:** `alignedprintscan.com` should be verified and email should normally originate from `hello@alignedprintscan.com`.
- **PRODUCTION VERIFICATION REQUIRED:** Verified domain, production sender identities, current secret values, bounce handling, and email-delivery monitoring.

## Proof and RON providers

- **CONFIRMED IN DOCUMENTATION:** Proof is the owner-approved future RON provider for APS and must not be removed or replaced without explicit owner approval.
- **CONFIRMED IN CODE:** Request records and UI can store/display `ron_session_url`, `appointment_link`, `appointment_platform`, and RON service-detail session fields.
- **CONFIRMED IN CODE:** Admin RON Session is currently a placeholder when no data-backed section exists.
- **CONFIRMED IN DOCUMENTATION:** Proof ODN workflows and APS-originated RON sessions powered by Proof are distinct workflow categories and must remain separately documented as integration work develops.
- **CONFIRMED IN CODE:** Increment 2 implements a database-backed APS-originated draft lifecycle with atomic claims, deliberate retry, ambiguous-result preservation, stored-ID refresh, incomplete-draft deletion, sanitized command audit records, and explicit Proof ODN separation. No document, activation, invitation, or webhook path is active.
- **CONFIRMED IN DOCUMENTATION:** Proof API session creation, invitations, identity-status tracking, recording synchronization, and audit-trail synchronization remain deferred and must not be described as operational without verification in both code and production.
- See `docs/PROOF_INTEGRATION.md` for the current boundary and future lifecycle.
- **HISTORICAL OR POSSIBLY OUTDATED:** BlueNotary, OneNotary, and generic RON providers were previously listed as options; Proof now supersedes them as the approved planned provider.
- **CONFIRMED IN DOCUMENTATION:** APS supports two planned Proof categories: Proof ODN assignments and APS-originated RON sessions powered by Proof. The customer-facing objective for APS-originated sessions is APS branding with Proof as the underlying compliant RON platform.
- **OWNER DECISION REQUIRED:** Approve detailed Proof API scope, workflow design, legal/retention requirements, webhook design, and rollout/testing plan before implementation.
- **PRODUCTION VERIFICATION REQUIRED:** Proof credentials and any live Proof enablement.

## Vercel

- **CONFIRMED IN DOCUMENTATION:** Vercel is the approved, owner-controlled APS production hosting/deployment platform. Production deploys from GitHub branch `main` through Vercel. Codex may prepare instructions but has no deployment authority without explicit owner approval.
- **CONFIRMED IN DOCUMENTATION:** Historical release guides use Vercel preview deployments from Git branches and production deployment after merge.
- **CONFIRMED IN CODE:** The repository contains deployable static files but no `vercel.json` or build manifest.
- **PRODUCTION VERIFICATION REQUIRED:** Vercel project ID/team, domains, redirects/headers, preview access, environment variables, Git connection, and current deployment state.

## GitHub

- **CONFIRMED IN DOCUMENTATION:** GitHub is required for repository hosting, source control, change history, feature branches, focused commits, pull requests, owner review before merge, rollback/recovery history, collaboration, and triggering connected Vercel deployments.
- **CONFIRMED IN DOCUMENTATION:** GitHub is development and deployment governance, not an application-runtime dependency like Supabase, Stripe, or Resend.
- **CONFIRMED IN DOCUMENTATION:** Production changes must not use unmanaged ZIP replacement when the Git workflow is available.
- **CONFIRMED IN DOCUMENTATION:** The canonical production branch is `main`. Feature branches are preferred; pull requests are required when practical; commits should be small and focused; owner approval is required before merge; direct production edits are reserved for emergencies.
- **PRODUCTION VERIFICATION REQUIRED:** Actual GitHub branch-protection settings, configured required checks, repository roles, and Vercel Git-integration settings.

## Route distance

- **CONFIRMED IN DOCUMENTATION:** V13 intended an admin-only OpenRouteService calculator using `ORS_API_KEY`; early README material also mentioned Google Maps as a possible future provider.
- **CONFIRMED IN CODE AND PRODUCTION:** `admin-route-distance` is the maintained administrator-only OpenRouteService implementation. It keeps origin configuration server-side, caches results, preserves exact tier-selection mileage, and fails to an explicit manual workflow.
- **INTENTIONAL / DEFERRED:** `route-distance` remains an unreferenced generated stub. It is not a production workflow dependency and may be removed in a separately reviewed hygiene change.

## Not active in current code

- **HISTORICAL OR POSSIBLY OUTDATED:** Twilio/Clerk SMS was recommended, but current code only records `sent_sms=false` and contains no SMS provider call.
- **HISTORICAL OR POSSIBLY OUTDATED:** Google Maps Address Autocomplete was planned but is not present.
- **CONFIRMED IN DOCUMENTATION:** SMS notifications, calendar synchronization, CRM, accounting, and analytics are long-term evaluation items only. No implementation or provider is approved.
- **CONFIRMED IN CODE:** Local Increment 4 Proof activation is administrator-only, explicitly confirmed, and gated by APS readiness. Proof sends invitations; APS does not send access links or phone numbers, mutate payment state, or activate automatically. It is not deployed and the migration is unapplied.
