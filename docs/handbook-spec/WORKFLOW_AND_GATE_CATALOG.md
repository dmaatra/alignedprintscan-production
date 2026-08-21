# Workflow and Gate Catalog

Content standard status: **OWNER APPROVED — LOCKED**

Owner approval date: **2026-08-20**

## Universal lifecycle

Intake received → APS review → missing information/document resolution → reviewed quote → customer/orderer authorization → invoice/payment or approved terms → schedule/readiness → service execution → service-specific QC → document/delivery/return resolution → supplemental charges when authorized → financial resolution → completion gate → customer-safe completion/review eligibility.

No arrow authorizes the next action by itself. Each transition requires the governing evidence, permission, and service gate.

## Universal gate standard

Every final gate states: Purpose; Required Conditions; Where Operator Checks; What APS Shows; Blocker; Communication; Authorized Override if any; Prohibited Bypass; Next Stage.

| Gate | Required evidence | Operator action | Stop when |
|---|---|---|---|
| Scope | Correct customer/request/service and authoritative requirements | Reconcile source facts | Wrong/ambiguous request or unsupported service |
| Quote | Current facts, items, quantities, rates, versions, customer-safe note | Build and review quote | Page/distance/scope authority unresolved |
| Authorization | Customer/orderer approval when required | Preserve approval/version evidence | Approval absent or superseded |
| Financial | Eligible invoice and payment/terms state | Verify invoice-specific balance/terms | Pending, failed, mismatched, or prepaid balance |
| Readiness | Participants, documents, location/technology, schedule | Confirm authoritative facts | Identity, safety, document, witness, or schedule blocker |
| Fulfillment | Service actually performed and required facts recorded | Record service-specific result | A label or provider state is the only evidence |
| QC/delivery | Output/return path checked and authorized | Review, release, hand off, or return | Wrong file/version/customer, failed QC, approval hold |
| Finance close | Required invoices resolved or approved Net terms apply | Reconcile paid/refunded/net/outstanding | Required charge/refund unresolved |
| Completion | Every applicable gate clear | Complete and verify Timeline/portal | Any applicable blocker remains |

## Status, operator action, and communication standard

Every final service sequence uses: **Stage | APS Status/Condition | Operator Action | Customer/Recipient Communication | Template/Channel | Gate/Do Not Advance Until | Timeline/Audit**. Label communication **AUTO**, **OPERATOR**, or **IF NEEDED** only after implementation verification.

| Service | Required sequence events |
|---|---|
| RON | Request Received; Information Needed; Quote Ready/Approved; Payment Required/Received; Appointment Confirmation/Reminder; Preparation; Identity/Verification Issue; Session; Completed Document; Release; Completion; Cancellation/Reschedule; Failure/Alternative Path |
| Mobile | Request Received; Information Needed; Quote Ready/Approved; Payment Required/Received; Appointment Confirmation/Reminder; maintained Travel/Arrival notice; Service Completed; Supplemental Invoice; Scan Delivery; Completion; Cancellation/Reschedule |
| Print & Scan | File/Request Received; Information Needed; Quote Ready/Approved; Payment Required/Received; Production; Output Ready; Pickup/Courier/Portal Delivery; Completion; Cancellation/Problem |
| Loan Signing | Assignment Received through information/quote/payment/appointment; signer/package states; signing; scanback submission/review/rescan/approval; return/tracking; completion; cancellation/no-sign/partial/resign/wait/additional amount/refund |
| Business | Application Received/Review/Information Needed/Approved; organization/invitation/acceptance/active; service eligibility/request; billing/reminders/hold; recovery; suspension/removal; closure |
| Documents | Received; Information Needed; Replacement Requested; Completed Artifact Ready; Released; Post-Release Problem; Loan Package/Replacement; Scanback/Rescan/Approval; Return Proof |

## Service-specific quote procedures

| Service | Ready-to-quote facts and operator procedure |
|---|---|
| RON | Notarial acts, participants/witnesses, documents, and requirements → build → review → send → approval → payment; revise when authoritative inputs change. |
| Mobile | Address, travel origin, ORS/manual fallback, round trip, tier, after-hours, acts, witnesses, optional scan → build/review/send/approval/payment/revision. |
| Print & Scan | File opens, page count, B&W/color, copies, paper/sides, scanning/PDF support, delivery → build/review/send/approval/payment/revision. |
| Loan Signing | Type/method, travel, package/page count, printing, copies, scanbacks, approval, return, timing, instructions, pricing source, offered/counter/agreed fee, adjustments, terms → accepted snapshot → build/review/send/approval/revision. |
| Business | Apply the service procedure plus assigned prepaid/due-on-receipt/Net terms; a Business user cannot self-grant terms. |

## Service fulfillment gates

- **RON:** Request Review → Participants → Documents → Quote → Approval → Prepaid Payment → Appointment → Identity/Platform Readiness → Session Completion → Completed Proof Document → Release → Final Completion.
- **Mobile:** Request Review → Location → Distance/Travel → Participants → Documents → Quote → Approval → Payment → Appointment → Travel/Service Readiness → Notarization → Optional Scan → Final Money → Delivery → Completion.
- **Print & Scan:** File Received → File Opens → Page Count → Specifications → Quote → Approval → Payment → Production → QC → Delivery → Completion.
- **Business:** membership/tenant/service eligibility plus applicable service gates; assigned terms, credit hold, and postpaid rules govern financial advancement.

## Loan Signing ten-gate framework

1. **Assignment Review:** ordering party, reference, type/method, signers, locations, appointment, instructions, return, fee, and terms are authoritative.
2. **Pricing / Financial Readiness:** source, offered/counter/agreed fee, adjustments, accepted snapshot, authorization, and prepaid/approved postpaid path resolve.
3. **Package Readiness:** current package/version, trusted page count, borrower copies, scanbacks, return, and stipulations are explicit.
4. **Printing / QC:** paper, sides, copies, specifications, borrower copies, and final-set checks pass.
5. **Appointment Readiness:** signer confirmation when required, identity preparation, location, time, package, and supplies are ready.
6. **Signing Completion:** completed/no-sign/partial/resign facts, table QC, certificates, and stipulations are recorded neutrally.
7. **Scanback / Approval:** required/absent, full/selected, QC, rescan, submission, approval, and hold remain distinct.
8. **Physical Return:** method, custody, carrier, label, tracking, drop-off, and proof resolve; do not return during an approval hold.
9. **Exception / Financial Resolution:** cancellation, no-sign, partial, resign, wait, correction, additional charge, invoice, and refund are reviewed and authorized.
10. **Final Completion:** all applicable prior gates, communications, Timeline evidence, and financial rules are clear.

Required true decision trees: package version/reprint; scanbacks required; approval-before-return; physical return; signer question; signing exception; open exception/financial resolution; and Scanback → Approval → Return.

## Document lifecycle and release

The five questions are: who provided it; what it is for; who may see it; whether it is ready for release; and what happens next. **Upload ≠ Review ≠ Completion ≠ Release. INTERNAL MEANS INTERNAL.**

| Class | Review | Release | Customer visibility/attachment |
|---|---|---|---|
| Customer Upload | readiness review as applicable | not required back to same customer | own source only; attach only when allowed |
| Internal APS / Working | internal | normally prohibited | never merely because it is stored on request |
| Completed / Customer-Eligible | required where configured | explicit APS action | only after release; exact eligible file |
| Proof Completed | APS review required | explicit APS action | never raw provider URL; released output only |
| Loan Package / Borrower Copy / Scanback / Return Proof | service-specific version, QC, approval, and custody review | only where customer eligibility exists | follow ordering-party/tenant/release boundary |
| Invoice / Receipt | financial authority | maintained customer path | exact authorized financial artifact |
| Audit/Internal | internal | prohibited | never |

Release procedure: open exact request → verify filename, provenance, class, version, customer, and that file opens → satisfy operational review → verify completed/customer-eligible state → select **Release to Customer** → confirm → verify release state and Timeline → verify correct portal group and scoped access. Never release unfinished, wrong-version, wrong-request, wrong-customer, internal, audit, or unreviewed Proof output. Never release the pre-notarization RON source as the completed notarized document.

Exact current customer copy:

> Files provided to you by Aligned Print & Scan will appear here.

> No documents have been provided yet.

“Provided” remains presentation language; eligibility and explicit APS release authorization remain unchanged.

## Completion decision

Completion is the intersection of applicable service, document/delivery, participant/appointment, provider, exception, and financial rules. Approved postpaid Business terms may allow completion with an open balance; prepaid requests may not. A status label, completed provider meeting, uploaded file, submitted scanback, or one paid invoice never independently proves APS completion.
