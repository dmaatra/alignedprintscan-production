# Patch 18.8 — Dashboard Repair + Final Payment Completion

## Purpose
This patch stabilizes the final stretch of the request workflow:

Request → Quote → Initial Payment → Appointment/Fulfillment → Final Balance → Final Payment Received → Completed

## Fixes included

### Dashboard repair
- Fixes selected request panel failing to load because `detailMap` was missing.
- Keeps service detail rendering safe even when optional rows/fields are empty.
- Improves invoice/payment summary spacing.
- Improves internal workflow guide spacing enough to use while working the order.

### Final balance invoice safety
- Prevents double-click/double-issue behavior while the Final Balance Invoice is being created.
- Stops the final balance issue action from re-rendering duplicate line items after refresh.
- Keeps Invoice #1 and Invoice #2 display calculations separate.

### Correct payment totals
- Invoice #1 paid amount now reads from Invoice #1, not total request paid amount.
- Invoice #2 paid amount now reads from Invoice #2.
- Paid to Date and Balance Due are calculated from invoice records when invoices exist.

### Final payment state
- Stripe webhook now updates final balance invoice payments to `final_payment_received`.
- The request status is updated to `final_payment_received` after final balance payment.
- Customer status page shows final payment received, clean payment summary, service summary, and receipt links.
- Completed remains a manual admin action.

### Appointment / fulfillment wording
- Appointment confirmation email and status page use service-aware labels:
  - RON: RON platform/session link
  - Mobile/Document: Service Address / Delivery Address and Service Method

### Receipt wording
- Replaces confusing "processing" style language with processed/received language.
- Keeps View Receipt links.

## Files changed
- assets/js/admin.js
- assets/js/script.js
- assets/css/styles.css
- supabase/functions/stripe-webhook/index.ts
- supabase/functions/send-order-email/index.ts

## Deploy
Redeploy:
```bash
supabase functions deploy stripe-webhook
supabase functions deploy send-order-email
```

No SQL migration required.
