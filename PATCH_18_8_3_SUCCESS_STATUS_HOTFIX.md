# Patch 18.8.3 — Success Status Lookup Hotfix

Fixes the customer status page not loading because `getPublicStatus` was referenced but not defined.

## Changed files

- `assets/js/script.js`
- `PATCH_18_8_3_SUCCESS_STATUS_HOTFIX.md`

## Notes

- Adds a safe `getPublicStatus()` wrapper around the deployed `get-request-status` Edge Function.
- Adds a minimal `renderSuccessFallback()` so the page does not crash if a public status lookup temporarily fails.
- No Supabase function redeploy is required.

## Deployment

Commit/push the frontend file and hard refresh the customer status page.
