# Patch 18.1 Hotfix Notes

This hotfix addresses the issues found during testing after Patch 18.

## Fixed

1. Success page hero/header double render
   - The success page now starts with a neutral loading state instead of a fake request status.
   - The final status header renders after the live request status is loaded.

2. Stripe embedded checkout missing request_id
   - The payment button now sends request_id using a direct fetch payload.
   - The checkout function now accepts request_id, requestId, id, or URL query fallback.
   - Added clearer logging if request_id is missing.

3. Quote Ready admin email removed
   - Quote Ready still sends the customer email.
   - Quote Ready no longer sends an admin email, since admin initiated the action.
   - Dashboard/request movement logs still record the status.

## Redeploy Needed

```bash
supabase functions deploy create-embedded-checkout
supabase functions deploy send-order-email
```

Then commit/push frontend files so `success.html` and `assets/js/script.js` update on the live site.
