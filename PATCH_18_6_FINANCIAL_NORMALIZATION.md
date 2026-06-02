# Patch 18.6 — Financial Normalization

Purpose: stop the success page and Stripe checkout from using different amount sources.

## What changed

- Stripe checkout now charges only the active payable amount:
  - Initial payment: `service_requests.quote_amount`
  - Final balance: selected invoice `amount_due`
- Admin quote save updates `quote_amount` and `estimated_total` together.
- Saving a quote only replaces main quote line items (`invoice_id IS NULL`), so final balance invoice items are not deleted.
- Success page payment schedule uses one source of truth for Service Quote, Paid to Date, Balance Due, Initial Payment, and Final Balance.
- Final Balance remains not issued until an invoice exists.
- Removed Mac junk files from the packaged ZIP.

## Deploy

Push frontend files, then redeploy:

```bash
supabase functions deploy create-embedded-checkout
```

No new SQL is required for this patch.
