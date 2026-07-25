# Aligned Print & Scan — Phase 4.1 Milestone 1

## Purpose

Activate the first operational layer of the Admin Portal without replacing the existing request, invoice, payment, Supabase, Stripe, Resend, or authentication logic.

## Implemented

- Replaced inactive sidebar behavior with real in-app module navigation.
- Added an Operations Dashboard with active-request, review, upcoming-date, paid, and outstanding-balance summaries.
- Added functional Calendar, Invoices, Payments, Customers, Documents, Templates, Support, and Settings views.
- Added an administrator-created request form for requests received by phone, email, or in person.
- Admin-created requests insert a customer and service request through the existing authenticated Supabase client.
- Added direct “Open” actions from modules back into the correct request workspace.
- Kept request documents scoped to the request Documents tab rather than exposing a broad unsecured file list.
- Added live data bridges so module views refresh after request and support-ticket reloads.
- Corrected the v3 request search/count selectors to target the rendered `.request-row` elements.
- Preserved existing Stripe, Resend, invoice, payment, status, upload, authentication, and realtime systems.

## Files changed

- `admin-dashboard.html`
- `assets/css/admin-v3.css`
- `assets/js/admin.js`
- `assets/js/admin-v3.js`
- `PHASE_4_1_MILESTONE_1_CHANGELOG.md`

## Validation performed

- JavaScript syntax validation completed with `node --check` for both modified JavaScript files.
- ZIP structure retains the original repository root and existing deployment files.

## Deferred

- External calendar synchronization.
- Dedicated invoice/payment database-wide reporting beyond loaded request data.
- Full global document indexing.
- Saved editable email/document template records.
- Multi-user roles and permissions.
- Live Proof API session creation.
