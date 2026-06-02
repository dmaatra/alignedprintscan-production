# Patch 18.3 — Final Balance Invoice + Receipt Workflow

## What this patch changes

- Renames the dashboard action to **Issue Final Balance Invoice**.
- Creates real final balance invoices such as `INV-84EEAB2F-02` instead of adding more charges onto paid Invoice #1.
- Sends the customer a **Final Balance Due** email when Invoice #2 is issued.
- Lets the customer pay Invoice #2 from the success page.
- Sends the admin an email when a final balance payment is submitted.
- Adds **Final Payment Received** status and customer email.
- Updates appointment confirmation wording to explain that a final balance invoice may be issued for additional on-site services.
- Adds **View Receipt** links using receipt URLs saved from Stripe when available.
- Adds a dashboard invoice payment summary so paid/due final balance invoices can be seen on the request.
- Keeps admin Quote Ready emails disabled; Quote Ready remains customer-only with dashboard log.

## SQL to run first

Run:

```txt
supabase/migrations/20260602_v18_3_final_balance_receipts.sql
```

## Functions to redeploy

```bash
supabase functions deploy create-additional-invoice
supabase functions deploy stripe-webhook
supabase functions deploy send-order-email
supabase functions deploy update-request-status
```

## Frontend files to push

```txt
assets/js/admin.js
assets/js/script.js
```

## Testing order

1. Open an existing paid request in the dashboard.
2. Add final balance line items.
3. Click **Issue Final Balance Invoice**.
4. Confirm customer receives **Final Balance Due** email.
5. Open success page and confirm `INV-...-02` appears.
6. Pay Invoice #2.
7. Confirm admin receives **Final Balance Payment Submitted** email.
8. In dashboard, manually mark **Final Payment Received**.
9. Confirm customer receives **Final Payment Received** email.
10. Confirm final invoice status appears as paid and receipt link appears when Stripe provides it.
11. Mark order **Completed**.

## Receipt wording

Customer-facing buttons say **View Receipt**, not “Stripe Receipt.” Stripe is only the processor behind the scenes.
