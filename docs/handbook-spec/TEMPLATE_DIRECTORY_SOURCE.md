# Maintained Template Directory Source

Template coverage standard: **OWNER APPROVED — LOCKED**

Owner approval date: **2026-08-20**

## Verification and use

**CONFIRMED IN PRODUCTION:** A read-only query on 2026-08-20 returned 54 active, system-maintained templates, 54 distinct keys, with no active duplicate. The list below is the production master directory. The shared preview catalog currently supplies rich operator metadata for 44 keys; the remaining 10 production entries must receive equivalent metadata during drafting rather than being omitted or guessed.

Each final entry must contain: Template Name; Template Key; Category; Service; Purpose; Audience; Recipient; **WHEN TO USE**; **WHEN NOT TO USE**; **WHAT MUST BE TRUE BEFORE SENDING**; **AUTO / OPERATOR / IF NEEDED**; authoritative Trigger; Channel; recipient outcome; Related Status; Related Next Action; Related Gate; What Happens Next; What APS Records; Important Variables; Operator Cautions; subject/key message/CTA or approved readable preview; and related procedure/script. Raw HTML is not handbook content.

Navigation requirements: indexes by Service, Workflow Stage/Trigger, Audience, Category, and Alphabetical order. Operational chapters teach when/why; Chapter 46 identifies the maintained template and complete entry.

## Master directory (54)

### Appointment, intake, quote, payment, completion, and general (14)

Handbook mapping: Chapters 15–17, 19–28, 33–45, and detailed entries in Chapter 46.

- `appointment_confirmed` — Appointment Confirmed
- `appointment_reminder` — Appointment Reminder
- `appointment_rescheduled` — Appointment Rescheduled
- `awaiting_payment_reminder` — Awaiting Payment Reminder
- `final_invoice` — Invoice / Final Invoice (invoice attachment)
- `general_customer_message` — General Customer Message
- `mobile_appointment_confirmation` — Mobile Appointment Confirmation
- `order_completed` — Order Completed
- `payment_received` — Payment Received
- `quote_ready` — Quote Ready (quote attachment)
- `request_received` — Request Received
- `review_request` — Customer Experience Review
- `ron_session_ready` — RON Session Ready
- `service_changed_appointment_conversion` — Service Changed / Appointment Conversion

### Documents and participant information (5)

Handbook mapping: Chapters 8–14, service document applications, Chapter 45, and detailed entries in Chapter 46.

- `completed_scan_delivery` — Completed Scan Delivery (released deliverable only)
- `document_delivery` — Document Delivery (released deliverable only)
- `document_needed_for_quote` — Document Needed to Complete Quote
- `document_received_under_review` — Document Received / Under Review
- `participant_information_needed` — Additional Participant Information Needed

### Cancellation and refund (7)

Handbook mapping: Chapters 17, 20–28, 34, 39, 45, 48, and detailed entries in Chapter 46.

- `aps_cancellation_service_unavailable` — APS Cancellation / Service Unable to Fulfill
- `cancellation` — Cancellation
- `cancellation_confirmed_no_payment` — Cancellation Confirmed — No Payment
- `cancellation_confirmed_refund_due` — Cancellation Confirmed — Refund Due
- `cancellation_request_received` — Cancellation Request Received
- `late_cancellation_explanation` — Late Cancellation / Retained Earned Amount Explanation
- `refund_processed` — Refund Processed

### Business, security, and resources (11)

Handbook mapping: Chapters 41–45 and detailed entries in Chapter 46.

- `business_credit_hold_notice` — Business Credit Hold Notice
- `business_invoice_issued` — Business Invoice Issued
- `business_partial_payment` — Business Partial Payment Received
- `business_password_reset` — Business Account Password Reset
- `business_payment_due_receipt` — Business Payment Due — Due on Receipt
- `business_payment_due_soon` — Business Payment Due Soon
- `business_payment_due_today` — Business Payment Due Today
- `business_payment_failed` — Business Payment Failed
- `business_payment_past_due` — Business Payment Past Due
- `business_payment_received` — Business Payment Received
- `resource_center_response` — Resource Center Response

### Loan Signing (17)

Handbook mapping: Chapters 32–40 and detailed entries in Chapter 46.

- `lsa_request_received` — Loan Signing Request Received
- `lsa_information_needed` — Loan Signing Assignment Information Needed
- `lsa_assignment_confirmed` — Loan Signing Assignment Confirmed
- `lsa_signer_confirmation` — Loan Signing Signer Confirmation
- `lsa_cancellation_under_review` — Loan Signing Cancellation Under Review
- `lsa_signing_not_completed` — Loan Signing Could Not Be Completed
- `lsa_additional_appointment_needed` — Loan Signing Additional Appointment Needed
- `lsa_exception_resolved` — Loan Signing Exception Resolved
- `lsa_package_documents_needed` — Loan Signing Package or Documents Needed
- `lsa_replacement_package_received` — Loan Signing Replacement Package Received
- `lsa_signing_follow_up` — Loan Signing Requires Follow-Up
- `lsa_cancellation_requested` — Loan Signing Cancellation Requested
- `lsa_cancellation_resolution` — Loan Signing Cancellation Resolution
- `lsa_additional_charge_review` — Loan Signing Additional Charge Authorization Needed
- `lsa_additional_charge_issued` — Loan Signing Additional Charge Issued
- `lsa_scanback_return_follow_up` — Loan Signing Scanback or Return Follow-Up
- `lsa_completed` — Loan Signing Completed

## Reconciliation note

The category subtotals above total 54. Automated publication must still assert exactly 54 unique keys from production rather than rely on typed subtotals. Rich preview metadata names `aps_unable_to_fulfill`, `late_retained_amount_explanation`, and `refund_due`, while production retains differently keyed governed entries. The handbook must label production keys as authoritative and map aliases explicitly; it must not claim that a preview-only key is an active template.

## Source verification required before template-entry drafting

- Confirm actual automatic trigger behavior and therefore AUTO/OPERATOR/IF NEEDED classification for every production key; template existence is not automation evidence.
- Reconcile the three preview-only names above to the active production cancellation/refund keys.
- Complete rich operator metadata for the ten production entries missing from the 44-key preview catalog, especially Business billing, Resource Center, participant information, and governed cancellation families.
- Verify whether any requested sequence event intentionally uses a general/nearest maintained template or operator-composed channel rather than inventing a non-existent template (for example “scanbacks approved”).
- Verify channel, recipient eligibility, status effect, attachment eligibility, delivery evidence, and idempotency boundary from current implementation before final wording.

## Attachment and action rules

- Quote, invoice, and deliverable attachments require the exact eligible artifact.
- A deliverable is attachable only after its maintained review/release conditions are satisfied.
- Internal, audit, source, wrong-request, wrong-customer, and unreleased files are prohibited.
- **Send Message** does not mutate authoritative workflow status.
- **Send & Update Status** is used only for a real maintained transition and only after successful delivery under the current implementation.
- Before retrying, inspect Communication Log/Timeline and use the maintained idempotency boundary.
