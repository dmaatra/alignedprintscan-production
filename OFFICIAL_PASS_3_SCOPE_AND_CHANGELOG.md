# Aligned Print & Scan — Official Pass 3

## Release purpose

Pass 3 replaces the legacy long-form admin presentation with the approved split-view operations workspace while preserving the existing Supabase, Stripe, Resend, authentication, request, invoice, and status logic.

This pass also includes the financial hotfixes discovered during Pass 2 testing so the new interface is not built on top of inaccurate Invoice #2 state.

## Primary scope

### Admin Portal v3

- New compact application top bar.
- New scalable operations sidebar.
- Persistent request queue on the left.
- Selected-request workspace on the right.
- Request search and quick filters.
- Request workspace tabs:
  - Overview
  - Customer
  - Documents
  - Payments
  - Appointment
  - RON Session
  - Communication
  - Timeline
  - Notes
- Compact request header with reference, customer, service, status, and metadata.
- Responsive tablet sidebar.
- Mobile request-detail slide-over behavior.
- Existing request-management functions remain connected.
- Existing long detail sections are reorganized into tabs after rendering.

### Invoice #2 simulated-payment hotfix

- Simulated and offline payments now locate the correct unpaid invoice.
- `request_payments.invoice_id` is populated.
- Invoice #1 and Invoice #2 update independently.
- Invoice amount paid and balance due are recalculated.
- Invoice status changes to paid only when that invoice reaches a zero balance.
- Request-level paid amount and balance are recalculated from all invoices and payments.
- The Initial Payment card no longer appears paid merely because the request moved to a later workflow stage.
- Completion is blocked while an invoice still has a remaining balance.

### Pricing correction

- Color Letter, Double-Sided is corrected from `$0.65/page` to `$0.60/page` in both public pricing display and estimate calculation.

### Embedded Stripe layout

- Checkout mount is centered consistently.
- Desktop and mobile bottom padding are increased.
- The embedded checkout no longer visually crowds the lower edge of its container.

## Files functionally changed

- `admin-dashboard.html`
- `assets/css/admin-v3.css` — new
- `assets/css/styles.css`
- `assets/js/admin.js`
- `assets/js/admin-v3.js` — new
- `assets/js/script.js`
- `pricing.html`
- `supabase/functions/record-admin-payment/index.ts`

## Preserved systems

- Supabase schema and existing data.
- Stripe live and test integrations.
- Resend email functions.
- Public intake workflow.
- Existing authentication.
- Invoice creation functions.
- Request status functions.
- Uploaded files and historical records.

## Structured placeholders

The RON Session, Communication, and Timeline tabs are included as stable interface destinations. Their deeper Proof API, unified communications, and automated timeline connections are scheduled for later implementation inside the same architecture.

## Deferred from Pass 3

- Live Proof API credentials and session creation.
- Calendar synchronization.
- Customer CRM page.
- Global document manager.
- Reports and analytics.
- Multi-user team roles.
- Full redesign of `success.html` customer request portal.

## Recommended Git commit

```bash
git commit -m "Official Pass 3: rebuild admin workspace and synchronize invoice payments"
```

## Pull request summary

Rebuilds the Aligned Print & Scan admin portal as a split-view operations workspace, reorganizes request details into tabs, links simulated payments to the correct invoice, corrects Invoice #2 paid-state behavior, fixes Color Letter Double-Sided pricing, and improves embedded Stripe checkout spacing.
