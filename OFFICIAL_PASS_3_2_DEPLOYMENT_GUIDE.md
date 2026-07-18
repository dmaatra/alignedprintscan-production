# Official Pass 3.2 Deployment Guide

## 1. Upload the changed website files

Replace the listed HTML, JavaScript, CSS, function, and migration files with the Pass 3.2 versions. A GitHub commit connected to Vercel should deploy the public/admin frontend automatically.

## 2. Run the SQL migration

From the repository root:

```bash
supabase link --project-ref sfsdniavqldgbiretply
supabase db push
```

Or paste this file into the Supabase SQL Editor:

```text
supabase/migrations/20260718060000_pass_3_2_transaction_lifecycle.sql
```

Do not rerun or rename older migrations as part of this pass.

## 3. Deploy the updated Edge Functions

```bash
supabase functions deploy client-quote-action
supabase functions deploy create-embedded-checkout
supabase functions deploy record-admin-payment
supabase functions deploy stripe-webhook
supabase functions deploy update-request-status
supabase functions deploy get-request-status
supabase functions deploy create-additional-invoice
```

## 4. Hard refresh

After Vercel is ready:

- Safari/Chrome: `Command + Shift + R`
- Sign out and back into the admin portal once.

## 5. Required acceptance tests

### RON estimate

1. Select Remote Online Notary.
2. Enter 1 notarial act: estimate must be $35.
3. Enter 2 notarial acts: estimate must be $45 immediately.
4. Confirm there is no separate Additional Notarial Acts field.

### Quote approval

1. Save a $45 RON quote.
2. Mark it Quote Ready / Awaiting Approval.
3. Confirm the customer sees Approve Quote but no Pay button.
4. Approve the quote.
5. Confirm Invoice #1 exists in Supabase and the Pay button appears.

### Manual/test initial payment

1. On the admin Payments/Notes area, select Payment Received.
2. Record $45 with method `test`.
3. Confirm Invoice #1 becomes paid.
4. Confirm request status becomes Payment Received.
5. Confirm admin and customer workflow trackers advance.

### Final-balance payment

1. Issue Invoice #2.
2. Record the exact remaining amount using method `test`.
3. Confirm Invoice #2 becomes paid.
4. Confirm total request balance becomes $0.
5. Confirm Final Payment Received appears in admin and customer views.

### Stripe

Use Stripe test mode when testing the real checkout path. Confirm it produces the same invoice/request state as a manual test payment.

### Embedded checkout layout

Confirm the dark Stripe area and white Stripe checkout are visually centered with clear bottom spacing on desktop and mobile.
