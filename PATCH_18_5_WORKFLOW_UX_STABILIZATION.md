# Patch 18.5 — Workflow UX Stabilization

## Purpose
This patch pauses feature expansion and cleans up the customer success page and admin dashboard workflow so quote, payment schedule, and invoice actions are easier to understand.

## Updated Files
- success.html
- assets/js/script.js
- assets/js/admin.js

## What changed
- Success page no longer flashes the “Preparing Your Status Page” placeholder.
- Customer success page separates:
  - Prepared Service Quote
  - Payment Schedule
  - Initial Payment
  - Final Balance
- Only the current due payment should show as payable.
- Customer tracker uses service-aware wording for RON, Mobile Notary, and Document Services.
- Dashboard adds an internal service-specific workflow guide.
- Dashboard financial summary now shows Service Value / Paid to Date / Balance Due.
- Dashboard quote/payment buttons are grouped more clearly.
- Save Quote no longer automatically changes status to Quote Ready.
- Quote Ready should now be sent from the Status Update buttons after quote review.

## Deploy
No SQL or Supabase function redeploy is required for this patch.

Commit/push these frontend files:
- success.html
- assets/js/script.js
- assets/js/admin.js

Then hard refresh the live site.
