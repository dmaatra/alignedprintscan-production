# Patch 18.8.5 — Status Helpers + Dashboard Hotfix

## Purpose
Fix remaining customer status page and dashboard load failures caused by missing helper functions after the 18.8 workflow repairs.

## Fixes
- Restored `escapePublic` helper for customer-facing status rendering.
- Restored `refFromPublicId` helper for APS reference fallback generation.
- Restored customer status page helper sections:
  - customer card
  - print/contact controls
  - service-specific detail summary
  - appointment/service details panel
  - RON session panel
  - quote approval action
  - embedded payment mount
  - status polling
- Restored `defaultInvoiceRows` in `admin.js` so selected requests can load without breaking.
- Confirmed `assets/js/script.js` and `assets/js/admin.js` pass JavaScript syntax checks.

## Changed files
- `assets/js/script.js`
- `assets/js/admin.js`

## Deployment
No Supabase function redeploy required.
Commit/push frontend files and hard refresh the dashboard and success page.
