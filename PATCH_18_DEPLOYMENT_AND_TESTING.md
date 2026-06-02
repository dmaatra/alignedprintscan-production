# Aligned Print & Scan v18 — Business Logic + Workflow Stabilization Patch

## What this patch includes

- Fixes Stripe embedded checkout JSON/request body handling.
- Keeps `Payment Submitted` visible on the success page after Stripe checkout.
- Sends **admin email only** when Stripe checkout completes, so the customer does not receive duplicate payment emails.
- Keeps `Payment Received` as the manual admin-confirmed email to the customer.
- Adds `Appointment Needs Rescheduling` and `Quote Expired` statuses.
- Removes the separate dashboard **Send Quote Email** button.
- Adds same-day / next-day dashboard badges.
- Adds PDF page-count detection support when the browser can detect it.
- Updates pricing language to:
  - RON starting at $40
  - Mobile Notary starting at $60
  - Document Services: printing, copies, scanning, courier delivery
- Removes customer-facing references to digital delivery and scanbacks.
- Adds Color Paper wording.
- Adds Courier Delivery starting at $20.
- Adds Invoice #2 / Additional Invoice support.

## Important workflow decision

Do **not** edit a paid invoice. Use Invoice #2 / Additional Invoice for final balances and add-ons.

Example:

- Invoice #1: dispatch / print / courier / preparation fees
- Invoice #2: final appointment balance, additional notarizations, added copies, scanning, courier additions, witness/custom line items

## SQL to run first

Run this file in Supabase SQL Editor:

```txt
supabase/migrations/20260601_v18_business_logic_invoice2_patch.sql
```

## Functions to deploy

From the project folder:

```bash
supabase functions deploy get-request-status
supabase functions deploy update-request-status
supabase functions deploy send-order-email
supabase functions deploy send-request-email
supabase functions deploy client-quote-action
supabase functions deploy create-embedded-checkout
supabase functions deploy create-additional-invoice
supabase functions deploy stripe-webhook
```

`send-invoice-email` is no longer part of the normal Quote Ready workflow. Keep it deployed only if you want it available for old tests, but the dashboard button that triggered duplicate quote emails has been removed.

## Frontend files to commit/push

```bash
git status
git add .
git commit -m "Add v18 business workflow pricing and invoice patch"
git push
```

## Testing order

1. Submit a new RON request.
2. Confirm customer receives Request Submitted email.
3. Confirm admin receives Request Submitted email.
4. Submit a new Mobile Notary request for today or tomorrow.
5. Confirm dashboard shows SAME-DAY or NEXT-DAY badge.
6. Open the request and verify preferred contact + detected page count area.
7. Add invoice line items using presets.
8. Save Invoice #1 / Quote.
9. Update status to Quote Ready.
10. Confirm customer receives ONE Quote Ready email.
11. Open customer success page from the email.
12. Approve quote.
13. Confirm admin receives Quote Approved email.
14. Click Proceed to Secure Payment.
15. Confirm embedded Stripe checkout loads on desktop and mobile.
16. Complete Stripe payment.
17. Confirm success page shows Payment Submitted.
18. Confirm admin receives Payment Submitted email.
19. Manually update status to Payment Received.
20. Confirm customer receives Payment Received email.
21. Confirm Appointment Needs Rescheduling sends correct customer email.
22. Confirm Appointment Confirmed sends appointment details only.
23. Confirm Completed sends completion/review language only.
24. Test Create Additional Invoice from dashboard.
25. Confirm additional invoice appears on success page with its own payment button.

## Stripe webhook endpoint

Your Stripe webhook endpoint should remain:

```txt
https://sfsdniavqldgbiretply.supabase.co/functions/v1/stripe-webhook
```

Recommended events:

```txt
checkout.session.completed
checkout.session.expired
payment_intent.succeeded
payment_intent.payment_failed
```

At minimum, `checkout.session.completed` is required.

## Notes

- Quote expiration is supported as a manual status (`Quote Expired`) in this patch.
- Full automatic quote-expiration timers can be added later with a scheduled function.
- Loan Signing remains a homepage-only “Coming Soon” item and is not part of the active request workflow.
