# Customer Experience

## Experience map

### 1. Discover

**CONFIRMED IN CODE:** Customers can enter through the homepage, service pages, FAQ, pricing, or support. The public navigation directs service requests to `pricing.html#request`.

### 2. Estimate and submit

**CONFIRMED IN CODE:** The five-step intake collects:

1. Customer name, email, phone, and preferred contact.
2. Service-specific documents/location/page information.
3. Identification, witnesses, print/scan options, and fulfillment details.
4. Preferred date/time and readiness acknowledgments.
5. Notes plus legal-advice and quote acknowledgments.

The browser calculates a service estimate from `assets/js/pricing-config.js`. It then creates a customer, service request, service-specific record, file metadata, and status update. Email notification is attempted after the request is saved.

### 3. Request received

**CONFIRMED IN CODE:** The customer is redirected to `success.html` with request ID and APS reference. `send-request-email` sends a request-received email and attempts an administrator alert.

### 4. Review quote

**CONFIRMED IN CODE:** At quote-ready/awaiting-approval states, the status portal shows the prepared quote, service details, client note, Approve Quote, and Request Changes.

**CONFIRMED IN CODE:** Approval invokes `client-quote-action`, materializes/updates Invoice #1, attaches quote items, and moves the request to awaiting payment. Change requests can be routed through support or the quote action function, depending on the UI path.

### 5. Pay

**CONFIRMED IN CODE:** Only an existing eligible invoice with a positive balance receives a payment button. The status portal invokes `create-embedded-checkout`, which creates a Stripe Embedded Checkout session for that invoice.

**CONFIRMED IN CODE:** After Stripe return, the portal can show a payment-submitted fallback while polling for webhook state. The webhook records payment, updates invoice and request totals/state, and invokes status email.

### 6. Appointment or fulfillment

**CONFIRMED IN CODE:** Confirmed date/time, location, platform/method, secure link, preparation instructions, and optional additional amount/note can appear on the portal. RON requests may expose a secure session URL if populated.

### 7. Final balance and completion

**CONFIRMED IN CODE:** APS may issue a separate final-balance invoice. The customer can pay it independently. Final Payment Received and Completed views show compact summaries and receipt/support/review options.

## Customer self-service

- **CONFIRMED IN CODE:** Request cancellation for review.
- **CONFIRMED IN CODE:** Request rescheduling with a proposed date/time.
- **CONFIRMED IN CODE:** Upload multiple additional files after matching the request email.
- **CONFIRMED IN CODE:** Open support with the APS reference prefilled.
- **CONFIRMED IN CODE:** Print/save customer-facing quote, receipt, or confirmation content through browser printing.
- **CONFIRMED IN CODE:** Customer actions are review requests; paid services are not cancelled/refunded automatically.

## Trust and privacy boundaries

- **CONFIRMED IN CODE:** Uploaded files use a private Supabase Storage bucket; the admin generates signed links.
- **CONFIRMED IN CODE:** Public customer status is served by an Edge Function using request ID/reference, not by customer account authentication.
- **CONFIRMED IN CODE:** Cancellation/reschedule and additional-upload functions verify the supplied email against the request customer.
- **UNKNOWN / OWNER CONFIRMATION REQUIRED:** Whether request IDs in status links provide sufficient authentication for all returned fields under the intended risk model.
- **UNKNOWN / OWNER CONFIRMATION REQUIRED:** Retention periods for requests, documents, communications, receipts, recordings, and customer-action data.
- **CONFIRMED IN DOCUMENTATION:** Customer accounts are intentionally deferred. APS Version 1 continues using the existing request-reference workflow; authenticated customer accounts remain a future roadmap item.
- **CONFIRMED IN DOCUMENTATION:** APS will comply with Texas notary requirements and applicable legal/business record-retention obligations. Specific retention periods remain an intentionally deferred future policy decision.

## Experience constraints and gaps

- **CONFIRMED IN CODE:** Live Proof session creation and invitation management are not implemented.
- **CONFIRMED IN CODE:** Route-distance calculation is not implemented despite older setup notes.
- **CONFIRMED IN CODE:** There is no customer account/dashboard containing multiple requests.
- **CONFIRMED IN CODE:** Customer-facing note history is not displayed; only the active note is shown.
- **HISTORICAL OR POSSIBLY OUTDATED:** Early documents say emails, Stripe, and automation are not active. Current source contains those integrations, though live deployment remains unknown.

## Customer-experience test baseline

For each service, verify intake, request received, quote approval/change, initial payment, appointment/fulfillment, optional final invoice, final payment, completion, support, cancellation/reschedule, upload, and mobile/print rendering. This baseline is **CONFIRMED IN DOCUMENTATION** and remains applicable to current code.
