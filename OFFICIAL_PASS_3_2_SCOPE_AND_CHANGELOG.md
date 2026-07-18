# Aligned Print & Scan — Official Pass 3.2

## Purpose

Stabilize the complete quote → approval → invoice → payment → workflow lifecycle before Proof integration and additional dashboard modules are added.

## Customer request corrections

- Replaces the redundant RON fields with one **Number of Notarial Acts** field.
- Calculates the RON estimate immediately as:
  - Online Notarization Service Fee: $25
  - Number of Notarial Acts × $10
  - Aligned Print & Scan-provided witnesses × $25
- Hides the initial-payment button while a quote is only ready or awaiting approval.
- Shows payment only after approval creates a real Invoice #1 row.
- Passes the real Invoice #1 ID into Stripe Embedded Checkout.
- Keeps approved quote items visible after they are attached to Invoice #1.
- Adds a distinct **Payment Due** step to the customer progress tracker.
- Improves Stripe Embedded Checkout centering and bottom spacing.

## Invoice and payment corrections

- Customer quote approval creates or refreshes a real Invoice #1 record.
- Editable quote line items are attached to Invoice #1 upon approval.
- Existing pre-Pass-3.2 requests can materialize a missing Invoice #1 during a manual/test payment.
- Manual/test payments and Stripe payments now update the same invoice fields.
- Invoice #1 and Invoice #2 retain separate records and balances.
- Payment records link to `invoice_id`.
- Stripe webhook retries do not create duplicate payment records.
- Invoice paid state is derived from the invoice itself, not from a later workflow status.
- Payment-submitted states are no longer treated as paid states.

## Workflow corrections

- `status` and `workflow_status` are updated together.
- Payment state remains separate from workflow state.
- Appointment state remains separate from workflow state.
- Admin and customer workflow displays include a true **Payment Due** stage.
- The dashboard reads `workflow_status` when available.
- Final-balance creation sets the request to `final_balance_due` and records the balance.

## Database migration

Adds the fields used consistently by Stripe and manual payment paths:

- `invoices.payment_status`
- `invoices.balance_due`
- `service_requests.balance_due`

Migration:

`supabase/migrations/20260718060000_pass_3_2_transaction_lifecycle.sql`

## Files changed

- `pricing.html`
- `assets/js/script.js`
- `assets/js/admin.js`
- `assets/css/styles.css`
- `supabase/migrations/20260718060000_pass_3_2_transaction_lifecycle.sql`
- `supabase/functions/client-quote-action/index.ts`
- `supabase/functions/create-embedded-checkout/index.ts`
- `supabase/functions/record-admin-payment/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- `supabase/functions/update-request-status/index.ts`
- `supabase/functions/get-request-status/index.ts`
- `supabase/functions/create-additional-invoice/index.ts`

## Deferred

- Proof API integration
- RON session creation and invitation management
- Full communication-history implementation
- Reports and accounting integration
- Remaining customer portal visual refinements beyond the transaction lifecycle

## Suggested GitHub commit

`Official Pass 3.2: stabilize quote invoice payment and workflow lifecycle`
