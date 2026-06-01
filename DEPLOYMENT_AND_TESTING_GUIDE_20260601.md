# Aligned Print & Scan — Deployment + Testing Guide

## 1. Run SQL first
Open Supabase Dashboard → SQL Editor → New Query. Paste and run:

`supabase/migrations/20260601_complete_email_status_workflow_fix.sql`

This adds the columns and tables used by the success page, admin dashboard, emails, appointment details, Stripe payment submitted flow, and status movement log.

## 2. Confirm Edge Function secrets
Supabase Dashboard → Edge Functions → Secrets. Confirm these exist:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `SITE_URL` = `https://alignedprintscan.com`
- `SUPPORT_EMAIL` = `hello@alignedprintscan.com`
- `ADMIN_EMAIL` = `hello@alignedprintscan.com`
- `FROM_EMAIL` = `Aligned Print & Scan <hello@alignedprintscan.com>`

## 3. Deploy functions
From the project root folder:

```bash
supabase functions deploy send-request-email
supabase functions deploy send-invoice-email
supabase functions deploy send-order-email
supabase functions deploy client-quote-action
supabase functions deploy create-embedded-checkout
supabase functions deploy stripe-webhook
supabase functions deploy get-request-status
supabase functions deploy update-request-status
```

## 4. Commit and push frontend files
Push the changed site files to GitHub/hosting:

- `assets/js/script.js`
- `assets/js/admin.js`
- `assets/css/styles.css`
- `success.html` if your host shows it as changed
- `supabase/functions/**`
- `supabase/migrations/20260601_complete_email_status_workflow_fix.sql`

## 5. Stripe webhook endpoint
In Stripe Dashboard → Developers → Webhooks, the endpoint should be:

`https://sfsdniavqldgbiretply.supabase.co/functions/v1/stripe-webhook`

It should NOT be `success.html`.

Minimum event needed:

- `checkout.session.completed`

## 6. Test each phase

### A. Request Submitted
Submit a new request from the customer form.
Expected:
- Customer lands on `success.html?request_id=...`
- Customer gets “Request received” email.
- Admin gets “New request received” email at `hello@alignedprintscan.com`.
- Dashboard shows new request.

### B. Success Page Loading
Open the status page from the email button.
Expected:
- No 400 error from `get-request-status`.
- Status page shows current database status.

### C. Quote Ready
In admin dashboard, edit line items and send quote.
Expected:
- Customer gets quote ready email with request info + itemized price.
- Admin gets movement email.
- Success page shows Quote Ready / Awaiting Approval.

### D. Quote Approved
From customer success page, press Approve Quote.
Expected:
- Status becomes Awaiting Payment.
- Admin gets quote approved email.
- Dashboard shows movement.
- Success page shows secure payment button.

### E. Stripe Payment
Press Secure Payment and complete Stripe embedded checkout.
Expected:
- Stripe returns to `success.html?...&session_id=...`.
- Success page immediately shows Payment Submitted fallback.
- Webhook updates database to `payment_submitted`.
- Customer gets payment submitted email.
- Admin gets payment submitted email.

### F. Payment Received
In admin dashboard, manually mark Payment Received.
Expected:
- Customer gets payment received email.
- Admin gets movement email.
- Success page shows Payment Received and receipt/print option.

### G. Appointment Confirmed
Confirm appointment in dashboard.
Expected:
- Existing requested date/time stays if you do not change it.
- Optional edited date/time/platform/link/instructions save.
- Customer gets appointment confirmed email with appointment details, not price.
- Success page shows appointment details.

### H. Completed
Mark completed in dashboard.
Expected:
- Customer gets completed email without price.
- Admin gets movement email.
- Success page shows completed status and review options.

## 7. If admin emails still do not arrive
Check these first:
- Supabase Function Logs for `send-request-email`, `send-order-email`, `stripe-webhook`.
- Resend Dashboard → Logs.
- Confirm the verified sending domain allows `hello@alignedprintscan.com` as the From address.
- Confirm `ADMIN_EMAIL` secret is exactly `hello@alignedprintscan.com`.
