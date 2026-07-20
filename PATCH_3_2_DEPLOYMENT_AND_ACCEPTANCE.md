# Patch 3.2 — Deployment & Acceptance

## Deploy

1. Apply `supabase/migrations/20260719150000_patch_3_2_workflow_financial_integrity.sql`.
2. Deploy these Edge Functions:
   - `get-request-status`
   - `create-embedded-checkout`
   - `stripe-webhook`
   - `update-request-status`
   - `customer-request-action`
   - `admin-resolve-customer-action`
   - `customer-upload-document`
3. Confirm secrets: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_NOTIFICATION_EMAIL`, and `SITE_URL`.
4. Deploy the website files.

## Acceptance tests

### Invoice #1
1. Submit request and prepare quote.
2. Customer approves quote.
3. Confirm Invoice #1 exists and the Pay button appears.
4. Complete Stripe test payment.
5. Confirm Invoice #1 is paid and request balance is recalculated.

### Invoice #2
1. From the paid request, issue a final-balance invoice.
2. Confirm Invoice #1 remains unchanged.
3. Confirm Invoice #2 appears with its own Pay Final Balance button.
4. Pay Invoice #2 and confirm both invoices remain visible.
5. Confirm request balance reaches `$0.00`.
6. Confirm completion is blocked before payment and allowed after payment.

### Customer actions
- Submit cancellation and reschedule requests.
- Verify customer confirmation and administrator alert emails.
- Approve/deny from Admin Portal and verify resolution email and timeline.

### Documents
- Upload multiple customer documents after email verification.
- Upload multiple administrator documents.
- Confirm uploader/category history and timeline entries.
