# Resend + Supabase Email Setup for Aligned Print & Scan

This site submits requests to Supabase and then calls the Supabase Edge Function named `send-request-email`.

The Edge Function sends:

1. A client confirmation email from `hello@alignedprintscan.com`.
2. An internal owner notification email with the request details and signed document links for review.

## Why this uses an Edge Function

Do not put your Resend API key in the website JavaScript. Website JavaScript is public. Resend should be called from a secure server-side function. Supabase Edge Functions are server-side TypeScript functions and Supabase documents sending email from Edge Functions with Resend. Resend also recommends storing API keys in environment variables, not in frontend code.

## Step 1 — Verify your domain in Resend

In Resend, verify `alignedprintscan.com` so emails can come from:

`Aligned Print & Scan <hello@alignedprintscan.com>`

If the domain is not verified yet, Resend may restrict who you can send to.

## Step 2 — Create a Resend API key

In Resend, create an API key with sending access.

Copy it once. Do not paste it into the public website files.

## Step 3 — Install / open Supabase CLI

From the root of this project folder, log in and link the project:

```bash
supabase login
supabase link --project-ref sfsdniavqldgbiretply
```

## Step 4 — Set secrets in Supabase

Run:

```bash
supabase secrets set RESEND_API_KEY="re_your_resend_key_here"
supabase secrets set OWNER_EMAIL="hello@alignedprintscan.com"
supabase secrets set FROM_EMAIL="Aligned Print & Scan <hello@alignedprintscan.com>"
```

Supabase automatically provides `SUPABASE_URL`. You must also add your service role key as a secret so the function can create private signed document links:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your_service_role_key_here"
```

Never put the service role key in the website frontend.

## Step 5 — Deploy the function

```bash
supabase functions deploy send-request-email
```

## Step 6 — Test the website form

Submit a test request on `pricing.html#request`.

Expected result:

- Customer record is created.
- Service request is created.
- File uploads save to the private `service-request-files` bucket.
- The success page displays the reference number.
- Client receives confirmation email.
- You receive internal notification with signed upload links.

## Reference number logic

The form inserts a new row into `service_requests`. Supabase creates a unique UUID for that request.

The public-facing reference number is generated from the first 8 characters of that UUID:

`APS-` + first 8 characters of `service_requests.id`

Example:

`APS-7F3A91C2`

This keeps the number unique, short, and easy to reference without exposing the full database ID.


## Current function name

This project now uses the Supabase Edge Function name:

`send-request-email`

The request form calls this function after the request is saved in Supabase. If the email function is temporarily unavailable, the request can still be saved and the client can still be redirected to the confirmation page.

## Required Supabase secrets

Run these in Terminal from the project folder:

```bash
supabase secrets set RESEND_API_KEY=your_new_resend_api_key
supabase secrets set OWNER_EMAIL=hello@alignedprintscan.com
supabase secrets set FROM_EMAIL="Aligned Print & Scan <hello@alignedprintscan.com>"
```

## Deploy

```bash
supabase functions deploy send-request-email
```

## VS Code red warnings

The `.vscode/settings.json` file has been added to help VS Code understand Deno/Supabase Edge Functions. If warnings still appear but the function deploys successfully, the deploy result is the source of truth.

## Google Maps Address Autocomplete

Google Maps was not activated in this package yet because it requires a Google Maps Platform API key with billing enabled and HTTP referrer restrictions set. Add that after Resend is deployed and tested.


## V13 note
Deploy `send-request-email` after setting secrets. The website now treats email/status notifications as secondary so a saved request can still reach the confirmation page even if email delivery needs troubleshooting.
