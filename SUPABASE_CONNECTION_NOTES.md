# Supabase Connection Notes — Aligned Print & Scan v7

The request form is now connected to Supabase using the public anon key.

## What the form does now

When a client submits the request form, the site:

1. Creates a `customers` record.
2. Creates a `service_requests` record with status `under_review`.
3. Creates one service-specific record:
   - `ron_requests`
   - `mobile_notary_requests`
   - `print_scan_requests`
4. Uploads documents to the private `service-request-files` bucket.
5. Saves file paths in `request_files`.
6. Creates a `request_status_updates` record.
7. Redirects the client to the success page with an APS reference number.

## What is not active yet

Auto emails, SMS updates, Stripe payment links, and RON platform setup emails still require server-side automation through Supabase Edge Functions, Resend, Twilio, and Stripe.

Do not place a Supabase service role key in the public website files.
