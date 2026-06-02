# Patch 18.7 — Payment Flow + Display Stabilization

## Purpose
Stabilizes the customer payment experience and dashboard financial display after initial payment and final balance invoice testing.

## Changes
- Prevents multiple Stripe Embedded Checkout objects from mounting in the same page session.
- Stops status polling/auto-refresh while Embedded Checkout is open.
- Improves mobile embedded payment container sizing and horizontal overflow behavior.
- Cleans customer payment schedule wording:
  - Original Service Quote
  - Paid to Date
  - Additional Final Balance / Balance Due
  - Total After Final Payment when a final invoice exists
- Replaces receipt placeholder wording from `Processing` to `Received / processing receipt details`.
- Uses service-specific appointment wording and supports service/delivery address display.
- Adds separate dashboard field for service address / delivery address.
- Improves dashboard invoice summary spacing and financial cards.
- Keeps the quote builder from reloading final balance invoice items as duplicate editable rows.
- Clears the quote/final-balance builder after a final balance invoice is issued.
- Makes `create-additional-invoice` safer/idempotent: if an open `-02` final balance invoice exists, it updates that invoice instead of creating another duplicate.

## Changed Files
- assets/js/script.js
- assets/js/admin.js
- assets/css/styles.css
- supabase/functions/create-additional-invoice/index.ts

## Deploy
Commit/push frontend files, then redeploy:

```bash
supabase functions deploy create-additional-invoice
```

No new SQL migration is required.
