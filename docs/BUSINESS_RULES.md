# Business Rules

This file separates executable behavior from policy text and historical guidance. It does not create new policy.

## Services and estimates

- **CONFIRMED IN CODE:** Intake supports `ron`, `mobile`, and `print` service types.
- **CONFIRMED IN CODE:** APS references are `APS-` plus the first eight uppercase characters of the service-request UUID.
- **CONFIRMED IN CODE:** RON estimate = $25 online service fee + $10 per notarial act + $25 per APS-provided remote witness.
- **CONFIRMED IN CODE:** Mobile estimate = $50 appointment base + $10 per notarial act + $50 per APS-provided mobile witness, plus selected document add-ons.
- **CONFIRMED IN CODE:** Current mobile travel tiers are $0 for 0–15 miles, then $10/$20/$30/$45 for 16–20/21–25/26–30/31–40 miles. The public form does not calculate mileage.
- **CONFIRMED IN CODE:** Document pricing configuration: B&W letter $0.25/page, B&W legal $0.35/page, color letter $0.50/page, color legal $0.60/page, color-paper add-on $0.15/page, cardstock add-on $0.40/page, scan $1/page, PDF merge $5, courier base $20, and mobile document base $20.
- **CONFIRMED IN DOCUMENTATION:** Estimates are reviewed and a finalized quote is provided before production, dispatch, or fulfillment.
- **HISTORICAL OR POSSIBLY OUTDATED:** Documents citing RON $40, mobile $20 travel base, or mobile $60 as the base conflict with current centralized pricing. A $60 mobile one-act estimate is currently the sum of $50 base and one $10 act.

## Witnesses

- **CONFIRMED IN CODE:** RON and mobile intake ask whether witnesses are needed, count, provider, and shared allocation.
- **CONFIRMED IN CODE:** “Not sure” sets a review-required path and does not automatically add a witness fee.
- **CONFIRMED IN DOCUMENTATION:** APS may coordinate document witnesses but does not determine legal document requirements.
- **CONFIRMED IN DOCUMENTATION:** A document witness is distinct from a credible witness used for identification.
- **CONFIRMED IN DOCUMENTATION:** Witness availability is not guaranteed, and incurred/reserved witness costs may remain due.

## Quote and invoice separation

- **CONFIRMED IN CODE:** Prepared service value, initial payment, paid amount, and balance can be stored separately.
- **CONFIRMED IN CODE:** Quote approval creates or refreshes a real initial invoice and attaches eligible quote line items.
- **CONFIRMED IN CODE:** Later/final charges belong to a separate invoice, normally numbered with `-02`.
- **CONFIRMED IN CODE:** `create-additional-invoice` updates an existing open `-02` invoice instead of creating another open duplicate.
- **CONFIRMED IN DOCUMENTATION:** A paid invoice must not be rewritten to include later charges.
- **CONFIRMED IN CODE:** Invoice paid state is based on that invoice's balance/payment amounts, not merely the request workflow status.
- **CONFIRMED IN DOCUMENTATION:** Invoice #1 contains all owner-approved charges known before work begins. Invoice #2 is created only when additional owner-approved charges arise after Invoice #1. APS supports both one-invoice and two-invoice workflows.

## Payments

- **CONFIRMED IN CODE:** Stripe Checkout is opened for a specific invoice ID.
- **CONFIRMED IN CODE:** Stripe and authenticated admin-recorded payments update invoice-level and request-level financial state.
- **CONFIRMED IN CODE:** Simulated payments are recorded with `is_test`; documentation requires excluding them from revenue reporting.
- **CONFIRMED IN CODE:** Current completion logic blocks completion if a non-void/non-cancelled invoice has a positive remaining balance.
- **CONFIRMED IN DOCUMENTATION:** Canonically, a request is financially complete only when every required, non-void invoice associated with it has been paid or otherwise resolved under APS business rules. Future implementation must use this definition and must not assume every request has two invoices.
- **CONFIRMED IN DOCUMENTATION:** Mobile travel/dispatch and approved advance print preparation are collected before travel/production; later completed services can be invoiced separately.
- **CONFIRMED IN DOCUMENTATION:** Approved document-service fees are collected before production, delivery, courier coordination, or mobile handoff.
- **UNKNOWN / OWNER CONFIRMATION REQUIRED:** Exact refund timing, processor fee handling, tax behavior, and the approved forms of non-payment resolution remain intentionally deferred.

## Scheduling and readiness

- **CONFIRMED IN CODE:** Requests may store preferred date/time and confirmed appointment date/time, timezone, location, method/platform, link, instructions, and additional onsite amount/note.
- **CONFIRMED IN DOCUMENTATION:** A request does not guarantee an appointment until APS confirms it.
- **CONFIRMED IN DOCUMENTATION:** One courtesy reschedule may be offered before service begins; later or post-dispatch rescheduling may require a new charge.
- **CONFIRMED IN DOCUMENTATION:** Customers and required participants must have identification, documents, witnesses, and technology ready. Failure may prevent service and may require new payment.
- **CONFIRMED IN DOCUMENTATION:** Verified third-party provider outages should be rescheduled without an additional APS service fee.

## Cancellation and refunds

- **CONFIRMED IN CODE:** Customers may request cancellation or rescheduling from the status portal after verifying the request email.
- **CONFIRMED IN CODE:** These requests remain pending until an administrator approves or denies them.
- **CONFIRMED IN CODE:** Approval may create a refund-review record; it does not issue an automatic processor refund.
- **CONFIRMED IN DOCUMENTATION:** Completed notarial acts and completed document production are non-refundable.
- **CONFIRMED IN DOCUMENTATION:** Mobile charges are generally non-refundable after dispatch; remote platform/witness costs may be non-refundable after activation/reservation; courier charges are generally non-refundable after pickup/dispatch.
- **CONFIRMED IN DOCUMENTATION:** Refund approval is an administrative responsibility. Refund history must preserve the approving administrator, amount, reason, and timestamp.
- **UNKNOWN / OWNER CONFIRMATION REQUIRED:** Refund timing, processor steps, and customer-notification SLA remain intentionally deferred.

## Notarial boundaries

- **CONFIRMED IN DOCUMENTATION:** APS may refuse or stop a service when identity cannot be established, a signer is unwilling/unaware, documents are incomplete, fraud or illegality is suspected, or the requested act cannot lawfully proceed.
- **CONFIRMED IN CODE:** Intake requires acknowledgments that APS is not providing legal advice and that displayed totals are estimates/quotes.
- **UNKNOWN / OWNER CONFIRMATION REQUIRED:** Any jurisdiction-specific operating checklist beyond the public Terms and FAQ.

## Notes and history

- **CONFIRMED IN CODE:** `quote_notes` and `customer_message` are active client-facing note fields.
- **CONFIRMED IN CODE:** Phase 4.1 added `request_customer_note_history` and a paid-invoice trigger.
- **CONFIRMED IN CODE:** The trigger is defective relative to the approved requirement: it archives after any single invoice becomes paid and does not preserve author/original timestamp.
- **CONFIRMED IN DOCUMENTATION:** Client-facing note history must preserve author, created timestamp, archived timestamp, and archived-by identity when available. Archive history must never be destroyed.
