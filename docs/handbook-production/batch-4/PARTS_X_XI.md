# PART X — BUSINESS ACCOUNTS & BUSINESS PORTAL

## Chapter 41 — Business Account Lifecycle & Roles

### 41.1 Lifecycle Mental Model

A Business Account moves through application, review, approval, organization setup, invitation, activation, authenticated use, billing eligibility, ongoing service, and controlled closure. Keep application, organization, membership, request, and billing states separate. A change in one does not silently change the others.

### 41.2 Application, Review, and Approval

Confirm legal/display name, authorized contact, requested services, billing preference, and submitted evidence. Review missing or conflicting facts before approval. Approval authorizes organization setup; it does not create a service request, charge, or payment.

### 41.3 Organization and Invitation

Create or confirm the organization only from the approved application. Invite the authorized member to the correct organization and role. An invitation is pending until accepted; never describe an invited person as active before activation succeeds.

### 41.4 Activation, Authentication, and Recovery

Activation establishes the member’s authenticated access. Password recovery uses the maintained recovery path and verified destination. Operators do not learn, set, or retain customer passwords. Failed recovery, wrong organization, or unverified identity is a hold condition.

### 41.5 Roles and Membership

Use the least authority required. Organization administrators manage authorized organization-level activity; members work only within their assigned organization and role. Suspension removes current access without erasing historical ownership or audit records.

### 41.6 Organization Switching

Before switching organizations, confirm the selected organization in the Business Portal header/context. Requests, documents, messages, locations, and billing must remain scoped to the selected organization. Stop if the displayed organization does not match the intended work.

### 41.7 Locations and Service Eligibility

Maintain approved business locations separately from one-time service addresses. Location availability does not itself authorize a service, price, credit term, or assignment. Each request still passes its service-specific gates.

### 41.8 Business Account Lifecycle Map

Application → review → approval → organization → invitation → activation → authenticated membership → eligible requests and billing → hold/suspension if required → controlled closure with history preserved.

## Chapter 42 — Business Portal Operations, Requests & Documents

### 42.1 Portal Orientation

The Business Portal presents organization-scoped requests, locations, members where authorized, documents, messages, invoices, payments, and account status. Verify the organization context before acting.

### 42.2 Creating and Reviewing Requests

An authenticated member submits a request for an eligible service. APS reviews service facts, participants, documents, timing, location, pricing, and billing readiness. Submission does not guarantee acceptance or bypass quote, payment, appointment, or fulfillment controls.

### 42.3 Requests and Organization Ownership

Keep the requesting member, customer/contact, signer/participant, ordering organization, and service recipient distinct. Historical requests remain linked to the organization even if a member later leaves.

### 42.4 Documents

Apply the Chapter 8–14 document lifecycle. Organization access is not document-release authority. Customer-visible files must still be classified, reviewed, intentionally released, and scoped to the correct request and organization.

### 42.5 Messages and Communication History

Send only to an authorized eligible recipient. Successful delivery evidence belongs in the Communication Log and Timeline. A read-only script never sends a message. Inspect prior attempts before retrying.

### 42.6 Locations

Select or enter the actual service location without overwriting a maintained organization address. Validate access, travel, safety, and service-area requirements for the individual request.

### 42.7 Member Administration

Invite, change, suspend, or remove a member only with organization authority. Confirm the target identity, organization, and role. Preserve completed activity and do not transfer historical actions to another person.

### 42.8 Recovery and Escalation

For access failure, first identify whether the issue is invitation, activation, authentication, role, organization selection, or account status. Use recovery only for authentication problems; do not bypass a hold or suspension by creating a duplicate member.

## Chapter 43 — Business Account Status, Admin Action & Applicant Communication Sequence

### 43.1 Application Received, Review, Information Needed, Approved

| Stage | APS status / condition | Admin action | Applicant communication | Template / channel | Gate / do not advance until | Timeline / audit record |
|---|---|---|---|---|---|---|
| Received | application submitted | inspect organization/contact facts | acknowledge receipt when maintained | approved application channel | application exists | receipt and source |
| Review | under review | validate facts and terms | only factual review update | operator channel if needed | conflicts resolved | reviewer and outcome |
| Information needed | blocker identified | request exact missing item | applicant-safe request | approved operator message | item received and reviewed | request and response |
| Approved | approval authorized | create/confirm organization | approval and activation next step | maintained channel | decision recorded | approver and timestamp |

### 43.2 Organization, Invitation, and Activation

Create the organization from approved facts, send the invitation to the authorized address, and verify acceptance before describing access as active. Record invitation, delivery result, activation, role, and organization membership.

### 43.3 Service Eligibility and Business Requests

Eligibility permits request submission under the organization; it does not auto-approve service. Apply the relevant quote, payment, appointment, document, and fulfillment gates to each request.

### 43.4 Billing, Reminders, and Payment

Issue the authorized invoice under the organization’s terms. Communicate due date, current balance, and payment state without turning a scheduled reminder into a collection threat. Record successful delivery and payment evidence.

### 43.5 Credit Hold

A credit hold blocks new credit-dependent advancement according to maintained terms. It does not erase open work, rewrite invoices, or remove portal history. Communicate the exact condition and authorized resolution path.

### 43.6 Recovery, Suspension, and Closure

Use password recovery for authentication only. Suspension/removal changes access; closure ends future organization activity after open operational and financial matters are resolved. Preserve all lawful historical records.

### 43.7 Business Lifecycle Decision Guide

Is the organization approved? If NO, remain in application review. If YES, is the member invited and activated? If NO, resolve invitation/activation. If YES, is the role and selected organization correct? If NO, stop and correct access. If YES, is the account eligible and free of an applicable hold? If NO, follow the authorized hold path. If YES, proceed to request-specific gates.

## Chapter 44 — Business Billing & Completion

### 44.1 Billing Models

Prepaid work requires the applicable payment gate before service. Postpaid work uses only approved organization terms. A Business Account relationship does not by itself authorize credit.

### 44.2 Due on Receipt, Net 15, and Net 30

Apply the organization’s recorded term to the invoice date and due date. Do not switch terms to accelerate or delay collection. A due date is a recorded contractual/authorized fact, not an operator estimate.

### 44.3 Invoice Issue and Partial Payment

Issue an invoice only from authorized service and price facts. Partial payment reduces the legitimate balance but does not mark the invoice paid. Preserve Invoice #1 and add authorized supplemental invoices instead of rewriting history.

### 44.4 Due Soon, Due Today, Past Due, and Failed Payment

Use the maintained business billing template matching the actual state. Do not send multiple contradictory notices or call a failed attempt a completed payment. Inspect delivery and payment records before retrying.

### 44.5 Credit Hold Procedure

1. Confirm the organization, invoice, due date, current balance, payment attempts, and terms.
2. Confirm an authorized hold decision and scope.
3. Record the hold without altering invoice history.
4. Send the maintained hold notice to an eligible recipient.
5. Verify delivery and Timeline evidence.
6. Release the hold only after the authorized condition is satisfied and recorded.

### 44.6 Completion and Closure

Request completion and organization closure are different. Complete each service only when its operational, document, communication, and financial gates pass. Close an organization only after open requests, invoices, documents, memberships, and retention obligations are reconciled.

# PART XI — COMMUNICATIONS, TEMPLATES & SCRIPTS

## Chapter 45 — Communication Control & Delivery Truth

### 45.1 Templates, Scripts, and Operator Messages

A template is maintained communication content that may be rendered, sent, logged, and sometimes associated with a status. A script/card is read-only operator guidance. An operator-composed message is allowed only within the current authorized communication path.

### 45.2 AUTO, OPERATOR, and IF NEEDED

AUTO means the current system initiates delivery from a verified event. OPERATOR means an authorized operator selects and sends it. IF NEEDED means use only when the stated condition exists. Template existence is never proof of automation.

### 45.3 Before Sending

Confirm request/organization, recipient eligibility, current stage, exact condition, template, variables, attachments, release authority, and prior attempts. Stop for wrong recipient, wrong request, stale status, unresolved attachment, or inconsistent financial facts.

### 45.4 Send Message Versus Send & Update Status

Send Message records communication without changing authoritative workflow status. Send & Update Status is appropriate only for a maintained transition and only after successful delivery. Never use messaging to manufacture readiness.

### 45.5 Attachments and Released Deliverables

Attach only the exact eligible quote, invoice, or intentionally released customer deliverable. Internal, audit, source, wrong-request, wrong-customer, superseded, and unreleased files are prohibited.

### 45.6 Delivery Evidence and Retry

Successful delivery, failure, provider evidence, rendered content, recipient, template key, channel, and time belong in Communication Log/Timeline. Before retrying, inspect existing attempts and use the maintained idempotency boundary.

### 45.7 Customer-Safe Language

State what happened, what is needed, what the customer should do, and what happens next. Do not expose internal queue names, provider internals, technical error text, or unapproved legal/financial conclusions.

### 45.8 Communication Decision Tree

Is communication required now? If NO, do not send. If YES, is there an exact maintained template for the actual condition? If YES, verify prerequisites and recipient. If NO, is an authorized operator-composed message allowed? If NO, escalate. If YES, compose narrowly. In every path, verify delivery and record the result.

## Chapter 46 — Maintained Template Master Directory — All 54

### 46.1 Production Count and Reconciliation

The locked production inventory contains 54 active system-maintained keys. The 44-key preview catalog supplies rich metadata for most common workflows. Ten production keys require metadata completed from maintained migrations/functions or a source note; no missing metadata is guessed.

### 46.2 Indexes

The generated directory is ordered by production category and key. The master table supplies service, trigger/stage, audience, and category fields, supporting service, trigger, audience, category, and alphabetical lookup.

### 46.3 Preview Alias Reconciliation

`aps_unable_to_fulfill` maps to production `aps_cancellation_service_unavailable`; `late_retained_amount_explanation` maps to `late_cancellation_explanation`; `refund_due` maps to `cancellation_confirmed_refund_due`. Preview aliases are not claimed as separate active templates.

### 46.4 Template Entry Standard

Every generated entry includes the locked operational fields. A `SOURCE-NOTED` trigger/classification means the key is verified but automatic initiation was not established from code; use remains operator-controlled until verified.

{{TEMPLATE_DIRECTORY}}

## Chapter 47 — Maintained Scripts & Reference Cards — All 48

### 47.1 Reference-Only Safety Rule

SCRIPTS GUIDE THE OPERATOR. THEY DO NOT CHANGE THE REQUEST. Reading or using a script does not send communication, change status, move money, modify customer data, release a document, or create Proof activity.

### 47.2 Eight Maintained Categories

The generated catalog imports all 48 frozen entries from `assets/js/operator-reference-catalog.mjs` across RON Session, Notarial Acts, Mobile Notary, Print & Scan, Loan Signing, Problem / Stop / Refusal, Quick-Flip, and Checklists.

### 47.3 Use and Do-Not-Use Guidance

Use the maintained situation and boundaries. Do not use any card outside its service/stage, to bypass a stop, or as a substitute for the full procedure. Related-template mapping is stated only where supported.

### 47.4 Classification

Full Script contains maintained spoken wording; Quick-Flip/Quick Reference condenses a controlled workflow; Checklist verifies required facts; Decision/Stop Card protects a boundary. Classification never grants operational authority.

{{SCRIPT_DIRECTORY}}
