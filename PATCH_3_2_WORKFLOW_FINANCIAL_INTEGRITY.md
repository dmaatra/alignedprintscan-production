# Patch 3.2 — Workflow & Financial Integrity

## Financial repairs

- Restored the initial **Pay** button by determining payability from the actual open Invoice #1 record rather than relying only on a fragile request-status match.
- Broadened Invoice #1 recognition to support `initial`, `deposit`, `invoice_1`, and `-01` invoice numbering.
- Final-balance payment buttons use each invoice's remaining `balance_due` and only appear for an active, unpaid final invoice.
- Invoice #1 and subsequent invoices remain separate records; Invoice #2 is created/updated independently by `create-additional-invoice`.
- Stripe Checkout is always opened against a specific invoice ID.
- Stripe webhook payments update the matching invoice, then recalculate request paid-to-date and remaining balance.
- Completion is blocked while any non-void/non-cancelled invoice has an outstanding balance.

## Customer status page

- Multiple additional document upload with customer email verification.
- Cancellation request submission.
- Reschedule request submission with proposed date/time.
- Confirmation messaging clarifying that paid services are reviewed rather than cancelled automatically.

## Admin Portal

- Pending cancellation/reschedule review.
- Approve and deny controls.
- Administrator resolution message.
- Optional approved refund amount recorded for processing.
- Communication Log.
- Automatic Timeline.
- Multiple administrator document uploads.
- Customer/admin uploader history metadata.

## Database and email

- Request source tracking.
- Customer action requests.
- Timeline events.
- Communication records.
- Refund-review records.
- Cancellation/reschedule timestamps.
- Document uploader/category metadata.
- Resend customer confirmations, administrator alerts, and customer resolution emails.
