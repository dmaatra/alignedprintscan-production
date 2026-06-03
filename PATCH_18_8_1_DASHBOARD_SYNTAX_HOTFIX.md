# Patch 18.8.1 — Dashboard Syntax Hotfix

## Purpose
Fixes the dashboard script error that prevented selected request details from loading after Patch 18.8.

## Fixed
- `assets/js/admin.js`
  - Changed `getInvoices(requestId)` to `async function getInvoices(requestId)` because it uses `await`.
  - Verified `admin.js` passes JavaScript syntax check.

## Deploy
No Supabase function redeploy required for this hotfix.

Commit/push frontend files and hard refresh the dashboard.
