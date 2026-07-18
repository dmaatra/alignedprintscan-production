# Aligned Print & Scan — Workspace Top Access Patch

## Scope

This focused UI patch fixes the admin request workspace retaining a prior scroll position, which could leave the selected request header and top controls above the visible area.

### Changed files

- `assets/css/admin-v3.css`
- `assets/js/admin-v3.js`

### Behavior changes

- The selected-request header stays visible at the top of the workspace on desktop.
- The request tabs stay immediately beneath the header.
- Selecting another request resets the workspace to the top.
- Switching tabs resets the workspace to the top of that tab.
- Mobile keeps the compact tab behavior without creating a double sticky offset.

## Deployment

Upload the two changed files to the same paths in GitHub. No SQL migration or Supabase Edge Function deployment is required. After Vercel deploys, hard-refresh the admin portal.

## Suggested commit

`Fix admin workspace header access and scroll restoration`
