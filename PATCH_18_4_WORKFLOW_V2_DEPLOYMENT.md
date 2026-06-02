# Patch 18.4 — Workflow v2 + Financial Summary

## What changed

This patch separates the customer-facing full service quote from the actual payment schedule.

### New customer logic

- Prepared Service Quote = full expected service value.
- Initial Payment = upfront/dispatch/production/reservation payment.
- Final Balance Invoice = created later only when remaining or added charges are issued.
- Only the active unpaid payment shows a pay button.

### New dashboard logic

- Service Value
- Paid To Date
- Balance Due
- Internal workflow guide based on service type:
  - RON
  - Mobile Notary
  - Document Services

### New SQL columns

- `service_requests.full_quote_amount`
- `service_requests.initial_payment_amount`

## Deploy order

1. Run SQL:

```sql
supabase/migrations/20260602_v18_4_workflow_v2_financials.sql
```

2. Deploy functions:

```bash
supabase functions deploy create-embedded-checkout
supabase functions deploy create-additional-invoice
```

3. Commit and push frontend files:

```txt
assets/js/script.js
assets/js/admin.js
```

## Files changed

```txt
assets/js/script.js
assets/js/admin.js
supabase/functions/create-embedded-checkout/index.ts
supabase/functions/create-additional-invoice/index.ts
supabase/migrations/20260602_v18_4_workflow_v2_financials.sql
PATCH_18_4_WORKFLOW_V2_DEPLOYMENT.md
```

## Testing

1. Open an existing request.
2. Save a full quote.
3. Set the Initial Payment Due amount.
4. Send Quote Ready.
5. Customer approves and pays initial payment.
6. Admin marks Payment Received.
7. Admin confirms appointment/fulfillment.
8. Admin issues Final Balance Invoice.
9. Customer pays final balance.
10. Admin marks Final Payment Received / Completed.
