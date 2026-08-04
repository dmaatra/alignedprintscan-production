# Deployment and Testing

This file is the current repository-level deployment reference. Historical release guides remain preserved at the root and may contain release-specific commands that are no longer complete.

## Deployment model

- **CONFIRMED IN CODE:** Frontend is static HTML/CSS/JavaScript and requires no build step.
- **CONFIRMED IN DOCUMENTATION:** Vercel is the approved, owner-controlled production hosting/deployment platform. Preview and production deployments use the GitHub-connected workflow, and production deploys from `main`.
- **CONFIRMED IN DOCUMENTATION:** GitHub is required for feature branches, focused commits, pull requests, owner review before merge, change/rollback history, collaboration, and Vercel deployment triggers. It is not an application-runtime dependency.
- **CONFIRMED IN CODE:** Backend changes are deployed separately through Supabase migrations and Edge Function deployments.
- **PRODUCTION VERIFICATION REQUIRED:** Actual GitHub branch protections, current Vercel project configuration/domain/Git settings, and remote Supabase deployment state.

## Required pre-deployment controls

1. Work on a reviewed feature/documentation branch.
2. Inspect `git status`, `git diff --stat`, and the full diff.
3. Back up the production database before schema changes.
4. Never commit `.env`, service-role, Stripe secret, Resend, routing, or webhook secrets.
5. Apply new forward migrations in timestamp order; do not rename or edit applied migrations.
6. Deploy only functions whose source/dependencies changed.
7. Validate in a non-production Supabase project and Vercel preview before production.
8. Obtain explicit owner approval before commit, push, migration, function deployment, merge, or production deployment.
9. Do not replace production through unmanaged ZIP upload/replacement while the managed GitHub workflow is available.
10. Production deployments are owner controlled. Codex may prepare instructions but must always wait for explicit owner approval before deployment.

These controls are **CONFIRMED IN DOCUMENTATION** and compatible with current architecture.

## Local static testing

From the repository root:

```bash
python3 -m http.server 8000
```

Review at minimum:

- `http://localhost:8000/`
- `http://localhost:8000/pricing.html#request`
- `http://localhost:8000/success.html` with a safe test request when backend-connected
- `http://localhost:8000/support.html`
- `http://localhost:8000/admin-login.html`
- `http://localhost:8000/admin-dashboard.html`

**CONFIRMED IN DOCUMENTATION.** Backend-connected tests require suitable Supabase data, policies, and secrets.

## Static validation

For changed JavaScript:

```bash
node --check assets/js/script.js
node --check assets/js/admin.js
node --check assets/js/admin-v3.js
node --check assets/js/pricing-config.js
```

For documentation-only changes, verify Markdown links/paths, required evidence labels, Git diff scope, and that no application/configuration files changed.

## Supabase deployment

### Migrations

Preferred controlled workflow:

```bash
supabase link --project-ref sfsdniavqldgbiretply
supabase db push
```

**CONFIRMED IN DOCUMENTATION:** SQL Editor was historically used as an alternative. Because the local migration set lacks the base schema and remote history is unknown, run a migration-state comparison before any future `db push`.

### Edge Functions

Deploy by exact function name, for example:

```bash
supabase functions deploy get-request-status
```

See `docs/INTEGRATIONS.md` for all 15 functions and security caveats. Do not assume `supabase/config.toml` records the configuration of every deployed function.

### Secrets inventory

Current source references:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `RESEND_FROM_EMAIL`
- `ADMIN_EMAIL`
- `ADMIN_EMAILS`
- `ADMIN_NOTIFICATION_EMAIL`
- `SUPPORT_EMAIL`
- `SUPPORT_PHONE`
- `EMAIL_LOGO_URL`
- `SITE_URL`

**HISTORICAL OR POSSIBLY OUTDATED:** `OWNER_EMAIL`, `ORS_API_KEY`, and `STRIPE_WEBHOOK_SECRET` appear in older setup documentation but are not consumed by the current corresponding source. `STRIPE_WEBHOOK_SECRET` should be revisited as a security requirement.

## Minimum regression matrix

### Public intake

- Submit RON, Mobile, and Print requests.
- Verify customer, request, service-detail, file, and status records.
- Verify APS reference and request-received email behavior.
- Verify witness allocation and “Not sure” review behavior.
- Verify current centralized pricing on desktop and mobile.

### Quote and initial invoice

- Build itemized quote and save without premature email/status movement.
- Send Quote Ready and verify customer email once.
- Approve quote and verify a real Invoice #1 plus linked items.
- Request quote changes and verify workflow/timeline behavior.

### Payments

- Stripe test payment for Invoice #1.
- Authorized admin test/offline payment for Invoice #1.
- Partial payment and exact remaining-balance payment.
- Duplicate webhook delivery without duplicate payment.
- Verify invoice and request paid/balance fields.
- Verify test payments remain identifiable.

### Final balance

- Issue Invoice #2 without changing Invoice #1.
- Reissue/update an existing open `-02` invoice without duplication.
- Pay Invoice #2 and retain both invoice/receipt records.
- Block completion before all non-void/non-cancelled balances are zero.
- Permit manual completion after balances are zero.

### Appointment/fulfillment

- Preserve requested date/time when admin leaves fields unchanged.
- Verify service-aware location/platform/link/instructions.
- Verify RON, mobile, and document-service status/email wording.

### Customer actions and documents

- Submit cancellation/reschedule with matching and non-matching email.
- Approve/deny and verify customer communication/timeline/refund-review record.
- Upload multiple customer and admin documents.
- Verify 10 MB customer upload limit and request-scoped metadata.

### Admin

- Login/session redirect and sign-out.
- Request filters/search and selection.
- Every workspace tab and action handler.
- Realtime request/support refresh.
- Responsive sidebar and selected-workspace access.
- Phase 4.1 acceptance criteria after any future repair.

### Email and status portal

- Request received, quote ready, payment received, appointment confirmed, final balance due, final payment received, completed, cancellation/reschedule messages.
- Correct sender branding and support contact.
- Status portal fallback, polling, payment mount, receipt links, print layout, and support links.

## Stripe checks

- **CONFIRMED IN DOCUMENTATION:** Webhook URL should point to the Supabase function, never `success.html`.
- At minimum test `checkout.session.completed`.
- Verify live/test mode separation.
- Verify webhook authenticity strategy before production; current code does not read `STRIPE_WEBHOOK_SECRET`.

## Rollback principles

- Revert frontend/function code to a known good Git revision.
- Treat additive migrations as forward-only unless a reviewed corrective migration is prepared.
- Do not drop columns or tables as an emergency frontend rollback.
- Preserve payment, invoice, document, communication, and audit history.

These principles are **CONFIRMED IN DOCUMENTATION**.
