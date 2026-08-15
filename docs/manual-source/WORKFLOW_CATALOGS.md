# Workflow Catalogs

## Cancellation decision table

| Service/stage | Default review outcome | May retain | Must not do |
|---|---|---|---|
| Mobile, 24+ hours | cancel/reschedule without late fee | documented nonrecoverable cost | retain unperformed notarial work |
| Mobile, 2–24 hours | admin review; up to $25 | earned/committed work and disclosed costs | apply automatically without review |
| Mobile, under 2 hours/no-show | admin review; up to current $50 base | legitimately committed appointment/travel | retain unrelated unperformed acts |
| RON before substantive preparation/provider cost | refund unearned amount | actual earned work only | invent fixed Proof fee |
| RON after preparation/provider cost | stage/cost review | supported earned/nonrecoverable amount | falsely complete/cancel Proof |
| RON after notarization | service-remedy review | completed/earned service as appropriate | treat as ordinary cancellation |
| Print before production | generally refundable | documented nonrecoverable cost | charge for unperformed production |
| Print during production | partial review | completed work/materials | erase source/payment history |
| Print complete | generally nonrefundable unless APS error/remedy | correctly completed production | label customer source error as APS error |
| APS unable to fulfill | refund unearned APS charges | supported nonrecoverable external cost | charge customer merely because APS cancelled |

## Reschedule table

| State | Normal handling | Review considerations |
|---|---|---|
| 24+ hours | normally no fee | availability and external commitments |
| under 24 hours | admin discretion | dispatch, travel, preparation, provider cost |
| repeated | admin review | history and legitimately committed resources |
| RON | update appointment on existing mapping | never recreate Proof solely for schedule change |
| Mobile | update date/time/location as authorized | dispatch/travel state |
| Print & Scan | update production/delivery schedule | production already begun |

## Financial decision table

| Need | Use | Required evidence | Never |
|---|---|---|---|
| Card refund | Stripe refund command | exact original payment, amount, reason, idempotency | mark processed before provider confirmation |
| Offline refund | Record Refund | funds already returned, date/method/unique reference | claim APS moved money |
| Partial refund | Refund ledger | remaining refundable calculation | overwrite original payment |
| New later charge | Supplemental/final invoice | authorized later scope | rewrite paid primary invoice |
| Payment Received | existing invoice payment | actual external payment/reference | create an invoice as side effect |

## Template governance and action catalog

Create a template only for recurring, stable, predictable customer communication with known fields and meaningful branding/logging value. Do not template internal notes, temporary test copy, or unique conversations.

| Template family | Trigger | Action | Status effect | Attachment | Idempotency |
|---|---|---|---|---|---|
| Request Received | successful intake | automatic | Under Review | none | request/event |
| Quote Ready | quote finalized | Send & Update | Quote Ready/Awaiting Approval | quote allowed | quote/version |
| Quote Approved/Awaiting Payment | approval/invoice ready | automatic | Awaiting Payment | invoice allowed | invoice/event |
| Payment Received | authoritative payment | automatic/manual command | Payment Received | receipt allowed | payment/event |
| Appointment Confirmed/Rescheduled | authoritative schedule saved | Send & Update | appointment state | none | appointment/version |
| RON Session Ready | legitimate signer access | Send & Update | signer-access state | none | transaction/access |
| Document/Completed Scan Delivery | eligible released output | Send Message or guided transition | no false completion | exact eligible file only | document/release |
| Completion | completion gate passes | Send & Update | Completed | allowed final output | completion event |
| Cancellation Request Received | customer request persisted | automatic | Cancellation Requested | none | action request |
| Cancellation Confirmed — No Payment | admin resolution | guided send | Cancelled | none | resolution |
| Cancellation Confirmed — Refund Due | refund approved/pending | guided send | refund pending | none | resolution/refund |
| Refund Processed | authoritative refund result | automatic/guided | refund projection | receipt/reference as allowed | refund record |
| Late Retained Amount Explanation | reviewed retained amount | guided send | no arbitrary status | none | resolution |
| APS Unable to Fulfill | APS cancellation | guided send | Cancelled/refund pending | none | resolution |
| Neutral Review Request | eligible completed request | manual send | Review Sent only | none | request+destination |

**Send Message** sends information without changing authoritative workflow status. **Send & Update Status** is permitted only when the message represents a real maintained business transition.

## Document classification and release

| Class | Customer sees | Review | Release | Attachment |
|---|---:|---:|---:|---|
| Customer Upload | own source | readiness review may apply | not required back to same customer | permitted as source where appropriate |
| Admin/Internal | no | internal | normally prohibited | internal only |
| APS Deliverable | only after release | required where configured | explicit | exact eligible file |
| Proof Completed | only after APS review and release | required | explicit | never raw provider URL |
| Audit/Internal | no | internal | prohibited | prohibited |

Release procedure: open exact request → Documents → verify filename/provenance/classification → satisfy review → verify eligibility/customer → choose Release to Customer → confirm → verify release state/Timeline → verify correct portal group and scoped View/Download. Never release unfinished, wrong-request, wrong-customer, internal, audit, or unreviewed Proof output.

## Fulfillment field catalog

| Control/fact | RON | Mobile | Print | Customer visible | Completion effect |
|---|---:|---:|---:|---:|---|
| Appointment date/time/status | yes | yes | scheduling where used | confirmed values | required when service requires appointment |
| Location/instructions | limited/provider | yes | pickup/delivery | safe confirmed subset | Mobile/delivery gate |
| Signer/participant readiness | yes | yes | N/A | safe summary | RON/Mobile blocker |
| Witness readiness | conditional | conditional | N/A | safe summary | blocker only when requested |
| Document readiness | yes | yes | source/production | safe summary | service blocker |
| Proof draft/preparation/activation/access | yes | N/A | N/A | access only when legitimate | RON stage gate |
| Service performed | Proof-authoritative | operator | production facts | safe status | core gate |
| Production started/completed | N/A | N/A | yes | safe status | Print gate/refund policy |
| Delivery path | completed Proof output | physical or APS output | pickup/courier/portal | applicable path | release/delivery gate |
| Supplemental charge resolved | conditional | conditional | conditional | invoice totals | financial gate |

## Customer visibility matrix

| Data | Admin | Customer | Proof | Stripe | Analytics | Release required |
|---|---:|---:|---:|---:|---:|---:|
| Request/service | yes | scoped | mapped subset | no | category only | no |
| Signer | yes | scoped | mapped signer | no | no | no |
| Internal/waiver notes | yes | no | no | no | no | N/A |
| Customer upload | yes | own | intended RON source only | no | no | no |
| APS/Proof output | yes | only released | Proof native before return | no | no | yes |
| Payment/refund totals | yes | scoped | no | exact provider record | no | no |
| Provider refund ID | authorized | normally safe summary only | no | yes | no | no |
| Messages | yes | customer-facing only | invitation history where supported | no | no | no |
| Timeline | yes | filtered Activity | provider events map to APS | provider events map to APS | no | no |
| Proof ID/access | authorized | signer-specific route only | yes | no | never | legitimate access required |

## Support escalation matrix

| Issue | First check | Safe action | Escalate when |
|---|---|---|---|
| Missing information/document | Overview/Documents/Messages | request exact missing item | identity/legal ambiguity |
| Quote/payment question | Quote, invoice, payment, refund ledgers | explain current authoritative totals | provider mismatch or disputed money |
| Cancellation/reschedule | pending customer action and preview | guided review; no promise before decision | earned/provider-cost ambiguity |
| Offline refund | actual external return evidence | record only after money moved | reference/amount cannot be verified |
| Stripe issue | exact PaymentIntent/provider result | safe sync/retry idempotently | provider failure/dispute |
| Mobile arrival/location | appointment/location/communication log | clarify safely | safety, no-show, dispute |
| Print production | source/spec/production facts | confirm current stage | production error/remedy decision |
| RON invitation/KBA | APS stage + Proof record | sync/open Proof; refer signer to Proof support | identity failure or provider incident |
| Completed document delay | Proof completion/asset/retrieval state | wait or idempotent retry | persistent provider retrieval error |
| Portal/download | scoped access and release flags | regenerate only authorized access path | authorization/RLS concern |
| Complaint/correction | Timeline, Messages, fulfillment, documents | preserve facts and route review | legal, safety, chargeback, notarial misconduct |
