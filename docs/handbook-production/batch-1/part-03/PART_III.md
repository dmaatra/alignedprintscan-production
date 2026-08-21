# Part III — Admin Operations

## Chapter 5 — Admin Navigation & Daily Triage

Admin is the operator’s working environment. Start with the module that answers the operational question, then open the exact request for consequential work. The Dashboard summarizes; Requests is the working queue; Review Queue identifies actionable blockers; Calendar organizes requested/confirmed dates. Service, finance, customer, organization, communication, resource, settings, and access modules provide focused views without replacing the request record.

### Where to go

| Need | Start here | Verify before acting |
|---|---|---|
| Find/process request | Requests or global search | Reference, service, customer/organization |
| Resolve blocker | Review Queue | Reason, waiting age, supporting tab/evidence |
| Review schedule | Calendar | Requested versus confirmed date/time |
| RON work | RON Sessions then request Fulfillment/Documents | APS stage, Proof facts, returned asset |
| Loan Signing | Loan Signings then request Fulfillment | Assignment/package/gates |
| Money question | Invoices/Payments then exact request | Invoice identity and ledger |
| Customer/Business | Customers, Organizations, Applications | Correct relationship/membership |
| Communication | Messages/Templates plus request Messages | Recipient, trigger, delivery history |
| Guidance | Scripts or Resource Center | Reference only; no workflow change |
| Access | Staff & Access | Active role/permission and self-lockout safety |

### Procedure 5.1 — Daily opening triage

1. Sign in through the maintained Admin login and verify your active authorized role.
2. Review Dashboard counts for new, waiting, scheduled, and financially unresolved work.
3. Open Review Queue; start with safety, authorization, document, money, and time-sensitive blockers.
4. Review Calendar for today and the next operating window. Confirm whether each time is requested or confirmed.
5. Review RON Sessions and Loan Signings that require provider/package action.
6. Review failed or pending communications and payments without blind retries.
7. Use global search and filters to locate exact references; clear stale filters when counts appear inconsistent.
8. Open the request before any consequential action and verify its evidence.

### Loading, empty, and error

Loading means APS has not finished retrieving the view. Empty means the completed view contains no matching items. Error means APS could not complete the load. Do not treat prolonged loading as empty, and do not treat an error as proof there is no work. Refresh once safely, confirm session/network context, try the authoritative module, and escalate repeated errors with the time, module, visible message, and non-sensitive context.

**OPERATOR RULE:** A summary card is a pointer, not the record. Open the exact request/invoice/document before changing anything.

### Procedure 5.2 — Daily closeout

1. Revisit Review Queue and today’s Calendar items.
2. Confirm completed actions have Timeline/message/financial/document evidence.
3. Identify work intentionally left on hold and the named blocker/owner.
4. Verify failed messages or provider operations have a safe next step rather than duplicate retries.
5. Secure documents, close private screens, and follow clear-desk/device controls.

Quick Reference: **Where Do I Go in Admin?** Screenshots: Dashboard, Requests, Review Queue, Calendar, global search/filters, and loading/empty/error.

## Chapter 6 — The Request Workspace

The request workspace holds the evidence needed to operate one request. Verify the request before reading individual fields: reference, service, customer/organization, and current status. Similar names, repeated customers, replacement documents, and related visits create wrong-record risk.

The eight maintained tabs are Overview, Customer, Documents, Quote, Payments, Messages, Fulfillment, and Timeline. Overview explains current state and Next Action. Customer identifies the relationship and contact context. Documents controls files and release. Quote controls current prepared scope. Payments preserves invoices/payments/refunds. Messages records customer-facing communication. Fulfillment holds service facts and gates. Timeline preserves event history.

### Procedure 6.1 — Work an Admin next action

1. Match the APS reference, service, customer/organization, and status in the selected-request header.
2. Read Next Action as guidance, then open the supporting tab.
3. Verify prerequisites and blockers in the underlying record.
4. Review related documents, money, participant, appointment, and provider facts as applicable.
5. Perform the smallest maintained action that advances the verified condition.
6. Re-open or refresh the affected tab and confirm the visible result.
7. Check Timeline and Messages if the action should create history or communication.
8. Check the Customer Portal view when the customer should see a change.

### Tab operating guide

| Tab | Primary question | Common risk |
|---|---|---|
| Overview | Where is this request and what is next? | Treating summary/status as proof |
| Customer | Who is connected and how may APS contact them? | Wrong identity/recipient |
| Documents | What file is this, and who may see it? | Wrong version/customer/release |
| Quote | What reviewed scope is currently offered? | Sending stale/unreviewed quote |
| Payments | Which invoice/payment/refund is authoritative? | Combining invoices or treating pending as paid |
| Messages | What was prepared/sent/accepted/failed? | Blind duplicate send |
| Fulfillment | What service facts and gates remain? | Completing from status alone |
| Timeline | What occurred and when? | Editing history instead of correcting forward |

Archive removes a request from active work without deleting history. Restore returns it to active operation. Before either action, verify it is the correct request and that the action will not conceal unresolved work.

**STOP:** Do not act if the header and supporting tab describe different customers, organizations, services, versions, or financial relationships. Preserve evidence and escalate the mismatch.

Figure: **Request Workspace Evidence Flow**. Screenshot plan: one annotated workspace overview plus focused crops for each tab and Next Action.

## Chapter 7 — Understanding Status, Next Action & Gates

APS work moves across parallel dimensions. Request/service status summarizes the overall stage. Appointment facts distinguish requested, confirmed, rescheduled, and performed. Financial facts belong to individual invoices/payments/refunds. Documents have source, review, completion, eligibility, and release states. Participants have role/readiness. Providers have their own progress. Fulfillment records what was actually done. Loan Signing and exceptions add further controlled dimensions.

**OPERATOR RULE — STATUS IS NOT PROOF.** Payment status does not prove service completion. Appointment status does not prove fulfillment. A Review Queue blocker is not the request status. A file upload does not prove review or release. A provider meeting ending does not prove APS completion.

Next Action is the recommended operational step derived from current facts. It helps the operator navigate, but the underlying tab remains the evidence. A gate is a required condition before advancement. A blocker explains what is missing. An authorized override exists only when the maintained workflow provides it; a manually convenient status change is not an override.

### Procedure 7.1 — Evaluate an advancement gate

1. Name the intended next stage.
2. List the required conditions for that stage.
3. Open the APS tabs that hold each condition; do not rely on one summary.
4. Classify every condition as satisfied, not applicable, missing, conflicting, or requiring authorized review.
5. If any applicable condition is missing/conflicting, hold advancement and create/use the maintained next action or communication.
6. If an override is permitted, verify the authorized person, reason, and record before using it.
7. Advance only through the maintained action.
8. Verify resulting status, blocker clearance, customer visibility, and Timeline evidence.

### Decision guide

- **YES — evidence satisfies every applicable condition:** continue through the maintained action.
- **NO — required evidence is absent:** hold and obtain the missing fact.
- **CONFLICT:** stop and reconcile; never choose one value silently.
- **REVIEW/AUTHORIZED OVERRIDE:** route to the authorized reviewer; preserve the reason and outcome.
- **TERMINAL WORK:** do not resurrect a completed/cancelled/archived item merely to clear a cosmetic blocker.

The **State Mental Map** shows these dimensions as parallel lanes converging only at applicable advancement and completion gates. The **Review Queue Decision Guide** explains whether to act, wait, communicate, or escalate.
