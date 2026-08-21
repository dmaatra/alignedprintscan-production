# Part II — Customer & Portal Operations

## Chapter 3 — The Customer Journey

The customer journey is a series of controlled promises. A submitted request means APS received information; it does not mean the appointment is confirmed or service is guaranteed. An estimate is an early calculation; a reviewed quote is the current APS offer. Approval authorizes the quoted scope; payment resolves an invoice only when authoritative evidence says so. Scheduling, fulfillment, document release, and completion remain separate.

### The journey in operator language

**Discover and submit.** The customer selects a service, supplies contact and service facts, acknowledges boundaries, and submits. APS creates the request/reference and attempts the maintained acknowledgment. The operator checks the actual saved record rather than relying on an email alone.

**Review and quote.** APS verifies scope, participants, documents, page/distance/package facts, and pricing inputs. Missing facts create an information step. The quote is built, reviewed, and intentionally sent. Customer or ordering-party approval is recorded before the applicable invoice/payment stage.

**Schedule and fulfill.** Requested dates are preferences until APS confirms current appointment facts. Each service has its own readiness and performance requirements. A completed appointment or provider session is not necessarily APS completion; documents, delivery, return, exceptions, and money may remain.

**Close and support.** APS verifies applicable gates, sends the maintained customer-safe outcome, and preserves history. Cancellation and reschedule submissions are review requests, not automatic decisions. Support must remain scoped to the right request and customer.

### Procedure 3.1 — Identify the customer’s current stage

1. Open the correct request and match the reference/customer or organization.
2. Read the request status and Next Action.
3. Check the Quote, Payments, Fulfillment, Documents, Messages, and Timeline tabs for supporting facts.
4. Identify the last stage with complete evidence—not merely the most advanced-looking label.
5. Identify the current blocker and who can resolve it: APS, customer, ordering party, or provider.
6. Use the maintained message/action for that stage if communication is needed.
7. Verify what the customer portal now shows and what record was added.

| Customer stage | Operator verifies | Customer should see/receive | Do not imply |
|---|---|---|---|
| Request received | Saved request/reference | Acknowledgment and secure request path | Appointment or acceptance confirmed |
| Quote ready | Reviewed current quote/version | Quote and response action | Payment already due without invoice path |
| Approved/payment | Approval plus invoice-specific state | Accurate amount/status/payment action | Pending/partial is paid in full |
| Appointment | Confirmed date/time/method/location | Current confirmed facts | Requested time is confirmed |
| Fulfillment | Service-specific evidence | Safe progress/next action | Service label alone proves completion |
| Documents | Correct eligible released file | Scoped view/download | Upload or provider source is released output |
| Completed | All applicable gates clear | Settled summary and eligible final actions | Completion while blockers remain |

**CUSTOMER COMMUNICATION:** Say what has happened, what happens next, and what the customer needs to do. Do not promise a decision that is still under review.

Figure: **Universal Request Lifecycle**.

## Chapter 4 — Customer Portal Operations

The Customer Portal is a customer-safe view of one verified request. It is not the Admin workspace and it does not expose internal notes, policy calculations, provider errors, raw identifiers, audit files, or unreleased documents. Operators should compare portal behavior with APS facts whenever a customer reports a mismatch.

The maintained sections are **Overview**, **Documents**, **Quote & Payment**, **Appointment/Fulfillment**, **Messages**, and **Activity**. Overview summarizes current status and Next Action. Documents separates source and released customer files. Quote & Payment shows current customer-safe quote/invoice/payment/refund facts. Appointment/Fulfillment shows confirmed, service-appropriate information. Messages shows customer-facing communications. Activity is a filtered history, not the complete Admin Timeline.

### What customers can and cannot do

Customers can review current safe facts, approve/request quote changes where eligible, pay an eligible invoice, upload additional files through the maintained verification path, request cancellation/rescheduling, contact support, and access intentionally released files. They cannot view or edit internal APS records, authorize their own refund, mark service complete, release documents, see other requests, or turn a request into a confirmed appointment.

### Procedure 4.1 — Investigate a portal question

1. Obtain and verify the APS reference and customer relationship using the maintained support process.
2. Open the exact Admin request; never search by name alone and assume the result.
3. Identify the portal section involved.
4. Compare the portal-safe value with the authoritative Admin tab and Timeline.
5. For documents, verify classification, current version, review, release, and intended recipient.
6. For money, verify the exact invoice and authoritative payment/refund state.
7. For appointment/fulfillment, distinguish requested from confirmed and performed from completed.
8. Correct only through the maintained workflow. Do not send internal screenshots or raw protected links.
9. Confirm the customer-visible result and record the support outcome.

### Documents language

The heading is **DOCUMENTS FROM ALIGNED PRINT & SCAN**. The explanatory text is: “Files provided to you by Aligned Print & Scan will appear here.” The empty state is: “No documents have been provided yet.” This customer language does not weaken the internal rule that only an eligible, intentionally released file crosses into customer visibility.

### Portal troubleshooting

| Symptom | Check | Safe response | Escalate when |
|---|---|---|---|
| Customer cannot access request | Reference/email verification and correct URL | Re-establish only the maintained scoped path | Identity or authorization remains uncertain |
| Customer cannot open file | Release state, signed access, file integrity | Regenerate only authorized access; verify file | Wrong file, corruption, or access boundary suspected |
| Status seems wrong | Admin evidence and Timeline | Explain current verified stage; use maintained correction | Conflicting facts or impossible state |
| Payment not reflected | Invoice/provider result | Wait/reconcile through maintained path | Provider mismatch or duplicate-risk state |
| Missing message | Message Log and delivery evidence | Retry only when safe and idempotent | Recipient/delivery ambiguity |

**STOP:** Never ask the customer to provide a password, payment credential, full ID image, KBA answer, or protected token through ordinary support communication.

Screenshots: Portal Overview, Documents, Quote & Payment, Appointment/Fulfillment, Messages, and Activity. Figure: **Portal/System Relationship Map**.
