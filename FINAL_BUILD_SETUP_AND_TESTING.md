# Aligned Print & Scan — Final Build Setup + Test Checklist

## What this build adds
- Premium client status portal with progress steps.
- Itemized quote/invoice table with quantity, rate, and total.
- Print / Save PDF options for quote, receipt, and confirmation pages.
- Stripe Embedded Checkout polish.
- Stripe webhook function for payment completion updates.
- Payment Received status updates in Supabase and dashboard.
- Branded Resend email templates with white background, navy/gold header, logo, footer, support language, email, phone, and Customer Support link.
- RON appointment placeholders for platform, session link, appointment status, and preparation checklist.
- Support tickets linked to APS references and visible in the admin dashboard.
- Footer consistency with Customer Support at the bottom of the Company section.
- Calculator pricing aligned to listed prices: RON starts at $40, mobile notary travel/appointment base starts at $50, notarial acts/signatures at $10, delivery starts at $20, print and scan rates match the pricing menu.

## Supabase setup checklist
1. Run the SQL migration in Supabase SQL Editor:
   `supabase/migrations/20260530_final_workflow_support_webhook.sql`
2. Confirm these Edge Function secrets exist:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `STRIPE_SECRET_KEY` = live `sk_live_...`
   - `STRIPE_PUBLISHABLE_KEY` = live `pk_live_...`
   - `RESEND_API_KEY`
   - `SITE_URL` = `https://alignedprintscan.com`
   - `FROM_EMAIL` = `Aligned Print & Scan <hello@alignedprintscan.com>`
   - Optional: `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `EMAIL_LOGO_URL`
3. Deploy functions:
   ```bash
   cd ~/Documents/GitHub/alignedprintscan-production
   supabase functions deploy create-embedded-checkout --project-ref sfsdniavqldgbiretply
   supabase functions deploy client-quote-action --project-ref sfsdniavqldgbiretply
   supabase functions deploy get-request-status --project-ref sfsdniavqldgbiretply
   supabase functions deploy send-invoice-email --project-ref sfsdniavqldgbiretply
   supabase functions deploy send-request-email --project-ref sfsdniavqldgbiretply
   supabase functions deploy stripe-webhook --project-ref sfsdniavqldgbiretply
   ```
4. In Supabase → Edge Functions → `stripe-webhook` → Settings, turn **Verify JWT OFF** so Stripe can call it.

## Stripe webhook setup checklist
1. Stripe → Developers → Webhooks / Event Destinations.
2. Add destination → Webhook endpoint.
3. Endpoint URL:
   `https://sfsdniavqldgbiretply.supabase.co/functions/v1/stripe-webhook`
4. Select event:
   - `checkout.session.completed`
5. Save.
6. Send a test event after the endpoint is created.
7. Confirm Supabase function logs show a successful webhook call.

## Site flow test checklist
### Public request form
- Submit a RON request.
- Submit a Mobile Notary request.
- Submit a Print & Scan request.
- Confirm each shows APS reference on the success page.
- Confirm customer details, service details, uploaded file count, and estimate appear.
- Confirm request appears in admin dashboard.

### Pricing calculator
- RON initial session should show $40.
- RON additional notarizations should add $25 each.
- Mobile notary base should show $50.
- Mobile notarial acts/signatures should add $10 each.
- Print rates should match the pricing page.
- Scan to PDF should show $1/page.
- Delivery should show $20 starting estimate.

### Quote/admin flow
- Select request in dashboard.
- Add itemized invoice rows.
- Save invoice.
- Confirm status becomes Quote Ready.
- Send quote email.
- Confirm email is branded and includes logo/header/footer/support language.
- Click quote button from email.
- Confirm status page shows itemized invoice, client info, print/save option, Approve Quote, and visible Request Changes button.

### Payment flow
- Approve quote.
- Confirm page changes to Awaiting Payment.
- Click Proceed to Secure Payment.
- Confirm Stripe Embedded Checkout loads centered and clean.
- Complete a small live test payment or use test-mode keys if preferred.
- Confirm Stripe Dashboard shows successful payment.
- Confirm webhook updates Supabase status to Payment Received.
- Confirm dashboard shows Payment Received / paid amount / paid date.
- Confirm customer success page updates to Payment Received / receipt / confirmation.
- Confirm payment receipt email is sent.

### Support flow
- Click Request Changes from success page.
- Confirm support form prefills APS reference.
- Submit support ticket.
- Confirm ticket appears in dashboard Customer Support section.
- Confirm linked request card appears when APS reference matches.
- Test ticket statuses: In Progress, Waiting on Customer, Resolved, Archive.

### Footer/navigation
- Confirm Customer Support is removed from top nav.
- Confirm Customer Support is at the bottom of Company footer on all public pages.
- Confirm logo/social/email/phone appear consistently.

### Print/download
- On quote page, click Print / Save PDF.
- On payment received page, click Print Receipt / Confirmation.
- Confirm print layout hides nav/footer/buttons and keeps invoice/receipt readable.
