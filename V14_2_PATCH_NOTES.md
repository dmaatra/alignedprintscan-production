# V14.2 Payment, Webhook, Email, and Status Workflow Patch

## Important webhook URL
The Stripe webhook/Event Destination URL must point to the Supabase Edge Function, not the customer success page:

```text
https://sfsdniavqldgbiretply.supabase.co/functions/v1/stripe-webhook
```

`success.html` is only the customer-facing return/status page. Stripe uses the webhook URL to notify Supabase after payment.

## Deploy functions
From the project folder:

```bash
cd ~/Documents/GitHub/alignedprintscan-production

supabase functions deploy create-embedded-checkout --project-ref sfsdniavqldgbiretply
supabase functions deploy stripe-webhook --project-ref sfsdniavqldgbiretply
supabase functions deploy send-request-email --project-ref sfsdniavqldgbiretply
supabase functions deploy send-invoice-email --project-ref sfsdniavqldgbiretply
supabase functions deploy send-order-email --project-ref sfsdniavqldgbiretply
```

## Supabase secrets needed
Confirm these are saved in Supabase Edge Function Secrets:

```text
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
SITE_URL=https://alignedprintscan.com
FROM_EMAIL=Aligned Print & Scan <hello@alignedprintscan.com>
SUPPORT_EMAIL=hello@alignedprintscan.com
SUPPORT_PHONE=(469) 383-8879
EMAIL_LOGO_URL=https://alignedprintscan.com/assets/images/logo-full.webp
```

## What changed
- Added missing `send-order-email` function.
- Admin manual status updates now trigger customer emails for `payment_received`, `appointment_confirmed`, and `completed`.
- Success page now polls for status changes after payment so the customer page can refresh itself once the webhook updates the request.
- Secondary buttons on success page are forced visible with gold outline styling.
- Email headers were changed to a white, branded layout with navy/gold accents and no lavender/purple header.

## Test checklist
1. Create a new request.
2. Confirm request received email uses the updated white branded template.
3. Save invoice for at least $0.50.
4. Send quote email and confirm branded quote email.
5. Approve quote from customer success page.
6. Complete Stripe payment.
7. Confirm Stripe Event Destination receives `checkout.session.completed`.
8. Confirm Supabase dashboard status changes to `payment_received`.
9. Confirm customer receives payment received email.
10. Confirm success page refreshes/updates to Payment Received.
11. Manually set status to Appointment Confirmed in dashboard.
12. Confirm customer receives appointment confirmation email.
13. Manually set status to Completed.
14. Confirm customer receives completed service email.
