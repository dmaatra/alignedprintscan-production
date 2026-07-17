# Aligned Print & Scan — Pass 3.1 Stability Patch

## Scope

This patch fixes the two browser-console failures found during Pass 3 testing:

1. Protected `record-admin-payment` calls were missing the signed-in
   administrator's Supabase Auth access token.
2. `admin.js` referenced `PRICING.mobile.travelTiers`, but the centralized
   pricing file was not loaded before the dashboard scripts.

## Files changed

- `admin-dashboard.html`
- `assets/js/admin.js`

No SQL migration is included.

## Functional changes

- Loads `assets/js/pricing-config.js` before `admin.js`.
- Expands the defensive pricing fallback to include travel tiers, after-hours
  rates, and document-service rates.
- Retrieves the current email/password Supabase Auth session before recording
  an admin payment.
- Sends `Authorization: Bearer <access_token>` to the protected Edge Function.
- Displays the actual safe Edge Function error instead of a generic deployment
  warning.

## Deployment

Upload the two changed files to GitHub and allow Vercel to deploy them.

The Edge Function itself is unchanged in this patch, so it does not need to be
redeployed if the Pass 3 version is already deployed.

No SQL command or `supabase db push` is required.

## Retest

1. Hard-refresh the dashboard or open a private browser window.
2. Sign out and sign back in.
3. Open a request containing an unpaid Invoice #2.
4. Select `Final Payment Received`.
5. Enter the remaining balance and use payment method `test`.
6. Confirm Invoice #2 changes to paid and the request balance becomes `$0.00`.
7. Confirm the console no longer reports an undefined
   `PRICING.mobile.travelTiers` error.

## Suggested GitHub commit

`Pass 3.1: authorize admin payments and restore centralized pricing`
