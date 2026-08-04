# Database and Data Model

## Scope and certainty

**CONFIRMED IN CODE:** Supabase Postgres is the application database. Browser code uses supabase-js; Edge Functions use Supabase REST with the service-role key.

**PRODUCTION VERIFICATION REQUIRED:** The repository does not contain the original base migration that created `customers`, `service_requests`, `ron_requests`, `mobile_notary_requests`, `print_scan_requests`, `request_files`, `quotes`, `payments`, `admin_users`, or Storage buckets. Their complete live schemas and policies cannot be reconstructed with certainty from this repository.

## Core entities

| Entity | Role | Evidence |
|---|---|---|
| `customers` | Customer identity, email, phone, preferred contact | **CONFIRMED IN CODE** |
| `service_requests` | Parent request/order, workflow, quote, financial, appointment, receipt, and client-note state | **CONFIRMED IN CODE** |
| `ron_requests` | RON-specific intake and witness/session fields | **CONFIRMED IN CODE** |
| `mobile_notary_requests` | Mobile-specific address, notarial, witness, and add-on fields | **CONFIRMED IN CODE** |
| `print_scan_requests` | Print/scan/courier/fulfillment-specific fields | **CONFIRMED IN CODE** |
| `request_files` | Storage object metadata, uploader/category, and detected pages | **CONFIRMED IN CODE** |
| `support_tickets` | Public support requests and admin resolution state | **CONFIRMED IN CODE** |

Each service-specific row relates to `service_requests`; the exact live base foreign-key definitions are **PRODUCTION VERIFICATION REQUIRED** because the base schema is absent.

## Quote, invoice, and payment model

- `invoice_items`: itemized descriptions, quantity, unit price, line total, optional invoice linkage and sort order.
- `invoices`: separate invoice rows with number, type, status, amounts, balance, payment status, due/paid timestamps, Stripe IDs, note, and receipt URLs.
- `request_payments`: invoice-linked Stripe/offline/test payment records with stage, method, reference, note, and received time.
- Request-level financial fields include estimated/quote/full quote/initial payment/paid/balance values plus invoice/payment status compatibility fields.

All are **CONFIRMED IN CODE**.

`request_payments.is_test` must be excluded from real revenue reporting: **CONFIRMED IN MIGRATION COMMENT AND DOCUMENTATION**.

## Workflow and audit model

- `request_status_updates`: status movement and email/SMS flags.
- `customer_action_requests`: pending/approved/denied cancellation and reschedule requests.
- `request_timeline_events`: structured events with actor and JSON metadata.
- `request_communications`: outbound/inbound channel log and provider delivery ID.
- `refund_reviews`: refund-review amounts and state; not a processor refund ledger.
- `request_customer_note_history`: archived customer-facing note text linked to request/invoice.

All are **CONFIRMED IN CODE**.

## Storage

- **CONFIRMED IN CODE:** Bucket name is `service-request-files`.
- **CONFIRMED IN CODE:** Initial uploads use request-scoped paths; later customer uploads use `{requestId}/additional/{uuid}-{safeName}`; admin uploads use request-scoped admin paths.
- **CONFIRMED IN CODE:** `request_files` stores file name/path/type/size plus uploader/category metadata where newer columns exist.
- **CONFIRMED IN DOCUMENTATION:** The bucket is intended to be private, with signed admin links.
- **PRODUCTION VERIFICATION REQUIRED:** Live bucket creation, size/type restrictions, and current Storage RLS are not fully defined in migrations.
- **CONFIRMED IN DOCUMENTATION:** APS will comply with Texas notary requirements and applicable legal/business record-retention obligations. Specific retention periods remain an intentionally deferred future policy decision.

## Auth and RLS

- **CONFIRMED IN CODE:** Browser admin uses Supabase Auth session tokens.
- **CONFIRMED IN DOCUMENTATION:** Intended admin authorization uses `admin_users` plus `is_admin()`.
- **CONFIRMED IN CODE:** Later migrations often grant all authenticated users access instead of calling `is_admin()`.
- **CONFIRMED IN CODE:** Some migrations grant anonymous/public reads or writes to invoice items, invoices, and status updates.
- **PRODUCTION VERIFICATION REQUIRED:** Effective production policies and whether historical broad policies remain installed.

## Realtime

- **CONFIRMED IN CODE:** Admin subscribes to `service_requests` and `support_tickets` changes.
- **CONFIRMED IN DOCUMENTATION:** Setup SQL explicitly adds `service_requests` to `supabase_realtime`.
- **PRODUCTION VERIFICATION REQUIRED:** Publication state for `support_tickets` and production replica identity settings.

## Migration ledger

| Migration | Purpose |
|---|---|
| `20260524_v13_admin_and_submission_fixes.sql` | Preferred contact and anonymous status insertion |
| `20260527_invoice_support_payment_updates.sql` | Request invoice fields, invoice items, support tickets |
| `20260528_success_status_invoice_columns.sql` | Success/checkout compatibility fields |
| `20260529_support_quote_status_updates.sql` | Support enrichment |
| `20260530_final_workflow_support_webhook.sql` | Payment/support/RON helpers and public reads |
| `20260531_payment_submitted_workflow_fix.sql` | Payment-submitted fields/status log policies |
| `20260601_admin_status_email_appointment_details.sql` | Appointment fields/status reads |
| `20260601_complete_email_status_workflow_fix.sql` | Consolidated compatibility migration |
| `20260601_v18_business_logic_invoice2_patch.sql` | Invoice table, page/urgency/document fields |
| `20260602_v18_3_final_balance_receipts.sql` | Final invoice receipts/amounts |
| `20260602_v18_4_workflow_v2_financials.sql` | Full quote and initial payment separation |
| `20260715_witness_intake_and_pricing.sql` | Witness allocation fields |
| `20260716_official_pass_1_invoice_safeguards.sql` | Invoice separation indexes/fields |
| `20260716_official_pass_2_payment_testing.sql` | Payment ledger and separate state fields |
| `20260718060000_pass_3_2_transaction_lifecycle.sql` | Invoice/request balances and payment status |
| `20260718073000_pass_3_2_1_witness_allocation.sql` | Witness data normalization |
| `20260722130000_pass_3_2_3_workflow_completion.sql` | Actions, timeline, communication, refund review |
| `20260725050000_phase_4_1_m1_client_note_archive.sql` | Note history and defective paid-invoice trigger |

The ledger is **CONFIRMED IN CODE**. Several migrations overlap intentionally through `IF NOT EXISTS` compatibility changes.

## Known schema issues

- **CONFIRMED IN CODE:** The note-history trigger archives on any invoice paid transition, not all required invoices paid.
- **CONFIRMED IN CODE:** Note history lacks author and original note timestamp.
- **CONFIRMED IN CODE:** The note-history policy allows every authenticated user full access.
- **CONFIRMED IN DOCUMENTATION:** `PATCH_3_2_DEPLOYMENT_AND_ACCEPTANCE.md` references a `20260719150000...` migration that is absent; equivalent later tables appear in the `20260722130000...` migration.
- **PRODUCTION VERIFICATION REQUIRED:** Remote migration ledger and drift from local files.
