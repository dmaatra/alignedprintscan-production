# PART XII — EXCEPTIONS, SECURITY & OPERATIONAL ASSURANCE

## Chapter 48 — Troubleshooting, Exceptions & Recovery

### 48.1 Required Recovery Pattern

Every exception record answers: SYMPTOM; WHAT TO CHECK; LIKELY CAUSE; WHAT TO DO; WHAT NOT TO DO; CUSTOMER COMMUNICATION; WHEN TO ESCALATE; WHAT GETS RECORDED. Begin from the exact request and authoritative evidence. Never manufacture a status, bypass a gate, duplicate a charge/send, or conceal an unresolved condition.

| Symptom | What to check / likely cause | What to do | What not to do / escalation / record |
|---|---|---|---|
| Missing information | current request, participants, documents, instructions, prior asks | request the exact missing fact through the maintained path; hold the affected gate | do not guess; escalate conflicting authority; record item, request, recipient, delivery, resolution |
| Wrong or replacement document | request, classification, version, source, release state | quarantine wrong/superseded item, identify active version, repeat review | do not delete history or release an unreviewed replacement; record lineage and decision |
| Page-count mismatch | authoritative source, parser output, manual count, color/copies | reconcile with the source; use governed manual count when parser cannot establish authority | do not price/produce from an unexplained count; record count method and evidence |
| Quote conflict | current scope, version, approval, invoice, service facts | revise prospectively and obtain authorization | do not overwrite approval or invoice history; escalate unauthorized concessions |
| Payment/refund ambiguity | ledger, provider evidence, invoice, authorization, prior attempts | hold fulfillment/financial closure and route authorized review | do not retry blindly, promise settlement time, or mark processed early |

### 48.2 Missing Information

Name the missing item, why it blocks advancement, who may supply it, and the safe next step. Recheck after receipt; a reply is not proof the blocker is resolved.

### 48.3 Wrong, Replacement, or Released Document

Keep source, internal, customer-visible, released, superseded, and replacement states distinct. If an incorrect file was released, stop further release, preserve audit evidence, identify recipients and scope, escalate privacy/security review, and use only approved correction communication.

### 48.4 Page Count

Compare the exact source file with authoritative page-count evidence. For parsing failure, password protection, unsupported format, mixed originals, or manual physical pages, record the governed fallback. Reconfirm after replacement.

### 48.5 Quote

Compare service, scope, rates, travel, pages/copies, timing, add-ons, approval, and invoice. Correct with a new version; do not retroactively rewrite the accepted quote.

### 48.6 Payment and Refund Ambiguity

Separate attempted, failed, pending, paid, partially paid, refund due, and refund processed. Provider evidence and the APS ledger must agree before customer-facing finality.

### 48.7 Appointment, No-Show, and Safety

Verify location, time/timezone, contact attempts, arrival/departure evidence, wait rule, access, and safety facts. Personal safety overrides schedule pressure. Record neutral facts and return instructions.

### 48.8 RON, Proof, KBA, and Identity

Do not coach KBA, store answers, create substitute identities, or describe a provider attempt as successful. Preserve the existing transaction where authorized, use provider-supported recovery, and route alternative service only after eligibility review.

### 48.9 ORS and PDF Parser

Treat ORS or parser output as an aid, not authority. If routing, mileage, file type, encryption, corruption, or page extraction prevents a dependable result, use the maintained manual path and document the basis.

### 48.10 Email and Delivery

Check recipient eligibility, address, template, rendered content, attachment/release authority, delivery result, and prior attempts. Never treat “send clicked” as delivery or resend blindly.

### 48.11 Loan Package, Scanback, and Return

Confirm active version, print count, completed signatures/initials/dates/certificates, scanback scope/QC, approval requirement, label/destination, drop-off, and tracking. Never return before required approval.

### 48.12 Cancellation, No-Sign, Partial, Resign, and Wait

Keep service outcome, operational cause, financial decision, communication, and any linked return visit separate. Policy suggestions do not authorize charges, waivers, or refunds.

### 48.13 Complaint, Chargeback, or Misconduct

Preserve records; use neutral language; restrict access; do not retaliate, diagnose, admit unsupported fault, alter history, or contact parties outside authority. Escalate promptly to the owner/authorized reviewer.

### 48.14 Admin Loading, Empty, and Error States

Loading means wait; empty means no matching visible records; error means retrieval failed. Recheck filters, organization, request, connectivity, and permissions. Do not act from stale or incomplete content.

## Chapter 49 — Security & Privacy for Operators

### 49.1 Customer Privacy

Access only the minimum information needed for the assigned task. Verify recipient, request, purpose, channel, and release authority before viewing, downloading, discussing, or sending protected information.

### 49.2 Business Tenant Separation

Confirm the selected organization before every Business action. Membership in one organization never grants access to another; do not copy records between organizations to solve an access problem.

### 49.3 Document Security and Protected Links

Keep internal/source/unreleased files out of customer-visible storage and ordinary email. Use approved protected links, verify expiration/access behavior, and record release/delivery evidence.

### 49.4 Passwords and Recovery

Never ask for, learn, store, or set a customer password. Use the maintained recovery path and verified destination. Recovery does not bypass suspension, role, organization, or eligibility controls.

### 49.5 Payment Information

Use approved payment interfaces. Do not place full card/bank data in notes, messages, screenshots, or documents. Record provider-safe references and outcomes only.

### 49.6 IDs and KBA

Use identity evidence only for the authorized process. Do not retain unnecessary images/details, coach KBA, record answers, or copy identity data into general notes.

### 49.7 Internal Notes

Write factual, necessary, professional notes suitable for audit. Exclude speculation, diagnoses, unnecessary sensitive data, passwords, secrets, and customer-inappropriate internal shorthand.

### 49.8 Admin, Business, and Customer Access

Use your own authorized account, least privilege, and the correct portal/context. Never share sessions, impersonate a user, or use access from one role to satisfy another role’s task.

### 49.9 Downloads and Emailing Documents

Download only when required; protect the device and local file; remove temporary copies under policy. Email only an intentionally released eligible deliverable to an eligible recipient.

### 49.10 Personal Devices

Use approved, updated, locked devices and networks. Avoid shared/public devices and untrusted networks. Do not sync protected files into personal photo, cloud, messaging, or backup services.

### 49.11 Screenshots and Training Data

Use synthetic fixtures or complete redaction. Do not capture legitimate PII, IDs, documents, tokens, financial data, or private messages for training.

### 49.12 Secrets

Passwords, recovery links, API keys, tokens, signing secrets, and private configuration never belong in the handbook, screenshots, messages, tickets, or ordinary notes.

### 49.13 Incident Escalation

Stop the affected action, preserve evidence, limit further exposure, notify the authorized owner/security contact, and record factual scope and time. Do not independently investigate beyond authority or erase evidence.

## Chapter 50 — Operational Assurance & Handbook Control

### 50.1 Pre-Action Checks

Verify identity/context, exact request, organization, current state, authority, source/version, recipient, variables, attachments, gate readiness, prior attempts, and expected audit result before consequential action.

### 50.2 Post-Action Verification

Confirm actual outcome rather than button click: persisted state, delivery/provider evidence, Timeline/Communication Log, document visibility, financial record, Next Action, and absence of duplicate/unintended effects.

### 50.3 Timeline and Audit Integrity

Preserve truthful sequence, actor, source, time, decision, delivery result, and exception. Never rewrite history to make an outcome appear cleaner.

### 50.4 Duplicate Prevention

Search for prior request, message, invoice, payment attempt, refund, provider transaction, upload, or assignment. When uncertainty remains, stop and reconcile before creating another.

### 50.5 End-of-Day Review

Review open holds, failed deliveries, pending payments/refunds, unreleased documents, upcoming appointments, scanback/return obligations, Business credit issues, and exceptions. Assign a truthful Next Action and owner.

### 50.6 Source Drift

If APS behavior, labels, templates, scripts, provider rules, law, or maintained policy differ from this handbook, stop relying on the affected instruction, mark the discrepancy, and escalate source verification.

### 50.7 Handbook Maintenance

Change controlled source, not compiled artifacts alone. Preserve chapter, figure, screenshot, photograph, template/script inventory, source-register, build, QA, and revision-history materials.

### 50.8 Legal and Provider Source Revalidation

Revalidate time-sensitive legal/notarial, lender/title, payment, identity, and provider facts against authoritative current sources before controlled revision. Do not fill gaps with general knowledge.

### 50.9 Controlled Revision and Owner Approval

Record proposed change, authority, affected sections/assets, reviewer, tests, date, edition, and owner decision. Publish only approved, reproducible artifacts; preserve superseded history.

# PART XIII — QUICK REFERENCES & APPENDICES

## Chapter 51 — Admin, State, People, Documents & Money Quick References

### 51.1 APS System Map

Public site → request/intake → Admin review/workspace → Customer or Business Portal visibility → provider/payment channels where authorized → Timeline/audit. Confirm system, actor, organization, request, and permitted action before work.

### 51.2 Universal Request Lifecycle

Received → review → information/quote → approval/payment → appointment/production → fulfillment/QC → eligible release/delivery → completion. STOP at the first unmet gate.

### 51.3 Where Do I Go in Admin?

Review Queue for new/blocked review; request workspace for service work; Customers/Participants for identity/roles; Documents for classification/release; Communications for delivery truth; financial views for quote/invoice/payment/refund; Business areas for organization/member/billing controls.

### 51.4 Request Workspace Tabs

Overview: scope/state/Next Action. Participants: roles and contact eligibility. Documents: source/classification/review/release. Communications: rendered message/delivery. Timeline: audit sequence. Service/financial areas: only when the request and role authorize them.

### 51.5 Review Queue Decision Guide

Correct request and service? Required facts present? Participants/roles clear? Documents safe and classified? Quote/payment/appointment gates known? If NO, request/record the exact blocker. If YES, assign the truthful Next Action.

### 51.6 State Mental Map

Keep request status, Next Action, document state, communication delivery, financial state, appointment/fulfillment state, and provider state separate. One does not silently prove another.

### 51.7 Loading vs Empty vs Error

Loading: wait. Empty: verify filters/context. Error: do not infer; retry safely and escalate persistent failure. Never act from partial/stale data.

### 51.8 Customer vs Signer vs Ordering Party

Customer requests/pays or owns the relationship; signer/participant performs an act; ordering party controls an assignment. Verify who may receive which information and who may authorize change.

### 51.9 Document Classification

Identify request → source/creator → purpose → class → review state → release eligibility → recipient/scope. Five questions: what is it, whose is it, why retained, may customer see it, what proves release?

### 51.10 Document Release Checklist

Correct request and recipient; intended final file; classification permits release; review complete; no sensitive/internal/superseded content; exact filename; authorized release action; portal/email visibility checked; Timeline/delivery evidence recorded.

### 51.11 Document Mistake Recovery

Stop release → preserve evidence → identify file/request/recipients/scope → restrict further access where authorized → notify owner/security → prepare verified correction → record recovery. Never delete history or conceal exposure.

### 51.12 Quote vs Invoice vs Payment vs Receipt

Quote proposes scope/price. Invoice states amount due. Payment is provider/ledger outcome. Receipt confirms an actual payment. Never use one as proof of another.

### 51.13 Send vs Send & Update Status

Send records communication only. Send & Update Status is used only for a maintained authorized transition after successful delivery. Verify rendered message, recipient, attachments, delivery, transition, and audit result.

## Chapter 52 — Service Quick References

### 52.1 Remote Online Notarization Quick References

Quote readiness: service/document/jurisdiction, signers, timing, platform, copies, price/payment. Appointment: signer/contact, technology, ID/readiness, document, Proof path. Session: identity/willingness/awareness, act/certificate, recording/provider controls. Closeout: completed Proof/notarized asset reviewed, correct request/classification, intentionally released, delivery verified. Failure: preserve transaction, no KBA coaching, retry only supported path, assess lawful alternative.

### 52.2 Mobile Notary Quick References

Quote readiness: acts/signers/documents, location, round-trip mileage/tier, timing/after-hours, witnesses, scan/delivery. Before leaving: payment/appointment, route/safety, supplies, journal, instructions. At table: identity/willingness/awareness, act/certificate, signatures, journal, counts. Before driving away: every certificate/document/accounting item checked. Optional scan: authority, completeness, legibility, naming, upload/release. Closeout: delivery, final charges, Timeline. Stop for safety, identity, coercion, incomplete documents, or unsupported act.

### 52.3 Print & Scan Quick References

Quote readiness: authoritative page count, B&W/color, copies, paper, sidedness, finishing, scan/PDF support, timing/delivery. Production: active source/version and payment gate. First-copy QC: count/order/orientation/color/legibility/crop/scale. Scan QC: every page, order, orientation, readability, completeness. Naming/integrity: request-safe name, final format, open/check file. Delivery: exact eligible output and recipient. Closeout: production/delivery evidence and completion gates.

### 52.4 Loan Signing Quick References

Mental map: assignment/orderer/signer/package/version/appointment/scanback/approval/return/financial closeout. Packages: Buyer, Seller, Refinance, HELOC, Modification, Reverse Mortgage, Commercial/Custom. COMMONLY NOTARIZED DOES NOT MEAN ALWAYS NOTARIZE; actual document, certificate, law, and authorized instructions control. Ten gates: Assignment Review; Pricing/Financial; Package; Print/QC; Appointment; Signing; Scanback/Approval; Return; Exception/Financial; Final Completion. Print/prep and before leaving: active version, sets/copies, page count, instructions, signers, route, label. Table: neutral presentation, signatures/initials/dates, certificates, referral boundaries. Post-table/scanback: complete count/QC. Return only after required approval with label/destination/tracking. Preserve package and escalate exceptions; close only when all gates agree.

### 52.5 Business Account Quick References

Lifecycle: application → review → approval → organization → invitation/activation → authenticated role → eligible requests/billing → hold/suspension/closure with history preserved. Verify organization switch before every action. Roles never transfer across tenants. Billing: prepaid or authorized Due on Receipt/Net 15/Net 30. Credit hold blocks credit-dependent work; it does not erase records or silently cancel work. Closure requires open operational/financial matters resolved and history preserved.

## Chapter 53 — Communication, Safety & Reference Indexes

### 53.1 Which Message Do I Send Now?

| Service/stage | Condition | Maintained message family | Classification | Do not send if |
|---|---|---|---|---|
| Any / intake-review | received or exact information missing | Request Received / information-needed template | IF NEEDED | wrong recipient, stale request, missing variables |
| Any / quote-payment | quote ready, invoice, payment outcome | Quote Ready / Invoice / Payment template | IF NEEDED or verified event | scope/version/payment evidence conflicts |
| RON/Mobile/Print | readiness, appointment, delivery, completion | service-specific maintained template | IF NEEDED | gate not satisfied or file unreleased |
| Loan Signing | assignment, package, signer, scanback, return, exception | `lsa_` maintained family | IF NEEDED | orderer/signer audience or authoritative stage unclear |
| Business | billing, password recovery, credit hold | `business_` maintained family | IF NEEDED or source-noted event | organization/recipient/terms not verified |
| Any / reminder-review | maintained timed event | reminder/review family | SOURCE-NOTED | current automation/event timing not verified |

### 53.2 Template Quick Index

Use Chapter 46’s 54-key directory by service, category, stage/trigger, audience, and alphabet. Template existence is not proof of automation. Verify actual condition, recipient, variables, attachment/release, channel, prior attempts, delivery evidence, and status effect.

### 53.3 Script and Card Quick Index

Use Chapter 47’s 48-entry catalog by service, category, stage, and classification. Scripts guide the operator; they do not change the request, send communication, move money, release documents, or create provider activity.

### 53.4 Security Checklist

Correct account/portal/organization/request; least access; protected device/network; recipient and release authority; no secrets/passwords/KBA answers; approved channel; minimum necessary data; safe local handling; post-action access/delivery verified; incident escalated.

### 53.5 Stop, Hold, and Escalate Guide

STOP the action for identity, willingness, awareness, safety, suspected fraud/coercion, unlawful/unsupported act, wrong recipient/request, unreleased document, uncertain money movement, duplicate risk, or missing authority. HOLD the affected gate while facts can be resolved. ESCALATE persistent conflict, exposure, misconduct, provider/legal uncertainty, or any action beyond role.

### 53.6 Daily Opening and End-of-Day

Opening: secure session/device; correct date/time; review appointments, queues, holds, failed deliveries, provider/financial exceptions; confirm supplies and assigned priorities. End-of-day: reconcile open requests, documents, messages, payments/refunds, appointments, scanbacks/returns, Business holds, exceptions, Timeline, Next Action, and responsible owner; secure materials and sign out.

### 53.7 Independent Print and Lamination Controls

Every Quick Reference carries its title, governing chapter, edition/baseline, scope, stop rule, and reminder that the detailed chapter controls. Reprint after controlled revision; remove superseded copies.

# APPENDICES

## Appendix A — Glossary and Acronyms

APS: Aligned Print & Scan. Gate: required conditions before advancement. Next Action: truthful controlled work item. Ordering party: assignment authority distinct from signer. Released deliverable: customer-eligible file intentionally authorized for visibility. RON: Remote Online Notarization. KBA: knowledge-based authentication controlled by the provider. Scanback: governed electronic copy submitted for review. SOURCE VERIFICATION REQUIRED: material statement withheld from authority until verified.

## Appendix B — Status and State Catalog

Request, Next Action, document, communication, financial, appointment, fulfillment, Business organization/member, and provider states are independent controlled dimensions. Use the current APS label and governing chapter; never infer one state from another.

## Appendix C — Template Index and Production Reconciliation

Authoritative inventory: 54 unique maintained production keys documented in Chapter 46. Three preview aliases are reconciled and not double-counted. Timing-sensitive automation claims remain source-noted until current implementation proves the event.

## Appendix D — Script and Card Index

Authoritative inventory: 48 maintained entries across eight categories documented in Chapter 47. Each is reference-only and classified as Full Script, Quick-Flip/Quick Reference, Checklist, or Decision/Stop Card.

## Appendix E — Package Comparison

Buyer/Purchase, Seller, Refinance, HELOC, Loan Modification, Reverse Mortgage, and Commercial/Custom are compared in Chapter 30. Actual package and instructions control; package label never substitutes for document/version review.

## Appendix F — Loan Document Source Register

Chapter 31 and `batch-3/LOAN_DOCUMENT_SOURCE_REGISTER.md` govern the common-document entries and unresolved source notes. Commonly notarized never means always notarize.

## Appendix G — Figure, Table, Procedure, Checklist, and Decision Tree Index

The final assembly generates controlled lists from captions and headings. Batch figures retain stable numbers and descriptive captions; procedures, checklists, and decision trees link to their governing chapters.

## Appendix H — Source Authority and Traceability

Authority order: certified Release 10 behavior; current repository source/configuration/schema; Release 10 certification; maintained APS documentation/training; authoritative Texas sources; legally available maintained signing-agent training; authoritative provider and lender/title/agency material. A lower source never silently overrides a higher current authority.

## Appendix I — Revision History and Owner Approval

Specification: OWNER APPROVED — LOCKED, PR #107. Batch 1: PRs #108–109. Batches 2–5 and final assembly retain branch, commit, PR, merge, QA, source notes, and owner-authorized publication evidence. Release 11 is outside this edition.
