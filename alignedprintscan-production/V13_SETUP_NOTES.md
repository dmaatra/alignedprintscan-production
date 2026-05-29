# V13 Setup Notes — Aligned Print & Scan

## 1. Required Supabase SQL

Run the SQL in:

`supabase/migrations/20260524_v13_admin_and_submission_fixes.sql`

This adds `customers.preferred_contact` and allows website submissions to insert a non-blocking status record.

## 2. Resend

Your website calls the Supabase Edge Function:

`send-request-email`

Deploy it from Terminal inside this project folder:

```bash
supabase functions deploy send-request-email
```

Make sure these secrets are set:

```bash
supabase secrets set RESEND_API_KEY=your_resend_key
supabase secrets set OWNER_EMAIL=hello@alignedprintscan.com
supabase secrets set FROM_EMAIL="Aligned Print & Scan <hello@alignedprintscan.com>"
```

## 3. OpenRouteService — Admin Dashboard Only

The public request form does NOT use routing. The admin dashboard has an optional Route Assist tool.

Create a free OpenRouteService API key, then set it as a Supabase secret:

```bash
supabase secrets set ORS_API_KEY=your_openrouteservice_key
supabase functions deploy route-distance
```

The admin calculator lets you enter your private starting address and the client's service address. It calculates round-trip miles/minutes through the Edge Function so your starting point is not shown to the client.

## 4. Public Estimate

The public estimate calculator stays itemized and transparent. It does not ask the client to estimate mileage. Mobile travel starts at $20 and includes the first 5 miles from the service area. Final travel/dispatch pricing is reviewed after the service address is received.
