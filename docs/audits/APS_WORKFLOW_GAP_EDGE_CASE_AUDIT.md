# APS Workflow Gap & Edge-Case Audit

Audit date: 2026-08-12
Branch: `codex/aps-workflow-refactor`
Starting commit: `9fde87a5c2c5bd2a5a5c1128d4ab650ac6f54366`

## Gap matrix

| ID | Area | Scenario | Current behavior at audit | Expected behavior | Gap? | Severity | Data risk | Customer impact | Recommended fix | Must fix before deploy? |
|---|---|---|---|---|---|---|---|---|---|---|
| SEC-01 | Portal privacy | Customer opens request portal | Public response returned raw `request_files`, internal Timeline, communications, and broad request/customer/invoice rows | Return only customer-safe fields, released documents, sent customer messages, and customer-visible milestones | Yes; fixed | P0 | Internal metadata and operational history exposure | Privacy breach through a valid or forwarded portal URL | Explicit response allowlists and visibility filtering | Yes |
| SEC-02 | Admin authorization | Forged status or supplemental-invoice request | Service-role functions accepted unauthenticated calls | Gateway JWT plus `is_admin()` authorization | Yes; fixed | P0 | Unauthorized status and financial mutation | False balance/status and unsolicited email | Require authenticated admin for status, supplemental invoice, and invoice-email functions | Yes |
| SEC-03 | Legacy email | Direct `send-order-email` invocation | Public endpoint could send arbitrary workflow email for a known request UUID | Accept only service-role internal calls or authenticated administrators | Yes; fixed | P1 | Communication abuse | Misleading or duplicate APS email | Internal-or-admin authorization in handler | Yes |
| FIN-01 | Quote approval | Double approval after partial payment | Existing primary invoice could be reset to unpaid with paid totals zeroed | Approval must reuse the existing invoice without mutating payment history | Yes; fixed | P0 | Lost payment state | Recharged amount and wrong balance | Treat paid, partially paid, and same-source approvals as idempotent | Yes |
| FIN-02 | Quote lifecycle | Customer approves stale portal quote | Approval used only request ID and whichever quote was current at execution | Reject an approval that does not name the current quote | Yes; fixed | P1 | Wrong source quote/invoice | Customer approves terms they did not see | Send and validate `quote_id` | Yes |
| FIN-03 | Quote concurrency | Two approval requests race | Both could attempt primary-invoice insertion | Unique source-quote rule must return the winning invoice | Yes; fixed | P1 | Duplicate/error-prone invoice creation | One approval appears to fail | Recover from uniqueness conflict by refetching source invoice | Yes |
| FIN-04 | Stripe | Partial or cumulative payment | Webhook overwrote invoice `amount_paid` and marked it paid | Add payment to existing paid amount; derive remaining balance and paid state | Yes; fixed | P0 | Lost/incorrect ledger state | False zero balance or reopened charge | Cumulative invoice update and partial-payment state | Yes |
| FIN-05 | Stripe idempotency | Two webhook deliveries race | Pre-check existed but payment insert response was ignored | Database uniqueness is authoritative and conflicts are successful duplicates | Yes; fixed | P0 | Duplicate payment or partial mutation | Duplicate receipt/status | Check insert result; treat unique conflict as duplicate | Yes |
| FIN-06 | Supplemental billing | Invoice #3 or later | Several helpers recognized only invoice `-02` | All supplemental/additional invoice types and suffixes `02+` must route correctly | Yes; fixed | P1 | Payment attached to wrong invoice | Wrong payment CTA/status | Generalized supplemental detection | Yes |
| FIN-07 | Request balance | Add supplemental invoice while another balance exists | Request balance was replaced with only the new invoice total | Aggregate all active invoice balances | Yes; fixed | P0 | Understated balance | Customer sees incorrect amount due | Recalculate from every non-void invoice | Yes |
| FIN-08 | Supplemental immutability | Add charges after partial payment | Open supplemental invoice could be rewritten after receiving money | Once payment exists, preserve it and create the next supplemental invoice | Yes; fixed | P1 | Paid line history mutation | Paid charges/receipts no longer match | Only reuse a zero-paid open supplemental invoice | Yes |
| MSG-01 | Delivery sequencing | Provider sends, then status update fails | Message could be relabeled failed, encouraging a duplicate resend | Preserve `sent`; report status-update failure separately | Yes; fixed | P1 | Audit history mismatch | Duplicate/conflicting email | Track provider acceptance independently and return recovery state | Yes |
| MSG-02 | Duplicate click | Admin double-clicks message send | Multiple browser invocations possible | One active send per admin page | Yes; fixed client-side | P2 | Duplicate communication rows | Duplicate email | In-flight guard; add server idempotency key later | No |
| DOC-01 | Deliverable release | Admin uploads a deliverable classification | Upload marked it customer-visible immediately | Upload alone must remain private until explicit release | Yes; fixed | P1 | Premature document exposure | Customer can access wrong/incomplete file | Default every admin upload private; release only through explicit action | Yes |
| DOC-02 | Release + send | File is released before message fails | Explicit release and email delivery are separate actions | Preserve explicit release and clearly report message failure | Partial | P2 | Low; release is intentional | File may be visible before notice arrives | Optionally add a combined release-and-send operation | No |
| WF-01 | Completion | Admin selects Completed | Balance is checked, but fulfillment, reviews, and required deliverables are not authoritative gates | Completion must evaluate service-aware underlying facts | Yes; unresolved | P1 | Incorrect terminal state | Service appears complete prematurely | Add service-aware completion RPC/gate after owner confirms legitimate exceptions | Yes |
| WF-02 | Status transitions | Free-text status update | No shared transition table or database constraint | Central transition graph with prerequisites and reversals | Yes | P2 | Contradictory state | Confusing next action | Add transition registry and regression matrix | No |
| WF-03 | Cancellation/refund | Cancel after payment/partial fulfillment | Review records exist; refund policy/processor action is intentionally manual | Preserve ledger and require owner-approved refund decision | Owner rule needed | P2 | Inconsistent handling | Unclear refund expectation | Define cancellation/refund matrix before automation | No |
| MSG-03 | Central templates | Legacy live emails | New library is registered, but `send-order-email` still contains live hardcoded HTML/wording | Central template library is runtime source of truth for all branded customer messages | Partial | P2 | Template drift | Inconsistent wording/branding | Migrate remaining live legacy rendering to `message_templates` without losing content | No |
| PORT-01 | Portal access | Forwarded/old portal link | Version 1 uses possession of request UUID/reference; no expiry or customer account | Preserve accepted V1 behavior but document link sensitivity and future revocation path | Accepted risk | P2 | Link-holder access | Forwarded link exposes customer-safe order data | Owner-approved token rotation/authentication phase | No |
| DATA-01 | Intake atomicity | Browser insert fails mid-request | Customer/request/service detail/file inserts are not one transaction | All-or-nothing intake creation | Existing gap | P2 | Orphan/incomplete records | Dead-end request | Authenticated/public RPC transaction in separate hardening increment | No |
| DATA-02 | Backward compatibility | Old records lack normalized fields | Defaults and broad fallback reads preserve most old orders | Render without manual repair and never expose legacy internal fields | Partial | P2 | Inconsistent old state | Missing sections/next action | Add fixture-based legacy order tests against representative production shapes | No |
| PROOF-01 | Proof readiness | Next APS↔Proof UX phase | Core IDs/lifecycle foundation exists; completion/deliverable gates are not yet unified | Proof results feed the same fulfillment and release state machine | Partial | P1 prerequisite | Rework/inconsistent completion | Incorrect join/download readiness | Finish authoritative completion/release architecture before Proof UX | Yes before Proof UX, not this deploy alone |
| UX-01 | Responsive/accessibility | Mobile admin/portal and keyboard flows | Static inspection only in this environment | Browser verification at phone/desktop widths with keyboard and error states | Environment verification gap | P2 | None | Possible unusable controls | Preview browser pass before release | Yes as a release gate |

## A. Must fix before production

The code fixes in SEC-01 through SEC-03, FIN-01 through FIN-08, MSG-01, and DOC-01 are required. WF-01 remains a deploy blocker because completion is not based on all authoritative service facts.

## B. Should fix in this refactor

- Make admin upload private by default and make release explicit.
- Define and enforce the release/send recovery state.
- Add a service-aware completion gate.
- Finish centralized runtime use of existing branded templates.
- Add transition-registry and legacy-record fixtures.

## C. Safe to defer

- Expiring/customer-account portal access, because request-reference access is an approved Version 1 constraint after the response is minimized.
- Full intake transaction redesign.
- Advanced responsive polish after the required preview accessibility pass.
- Proof session UX itself.

## D. Missing business rules requiring owner decision

1. Which paid cancellation outcomes are allowed: refund, partial refund, credit, forfeiture, or manual review, including processor-fee treatment.
2. Which service-specific exceptions permit completion without a portal deliverable (for example, physical-only courier handoff).
3. Whether an overpayment is retained as unapplied credit, automatically queued for refund, or requires manual owner resolution.
4. Whether Version 1 portal links need manual revocation/rotation before authenticated customer accounts are introduced.

## E. Proof UX readiness

The branch has useful Proof extension points and correctly preserves APS as system of record, but it is **not yet fully ready** for the next Proof UX phase. The prerequisite is one authoritative fulfillment/completion/document-release model that Proof webhook state and returned completed assets can enter without bypassing APS completion and customer-release gates.

## F. Coverage map

| Requirement area | Coverage |
|---|---|
| Service-aware intake (RON/Mobile/Print) | Implemented + static regression tested; live browser/database unverified |
| Copy/Scan/Courier as independent/hybrid fulfillment | Partial; represented within document services rather than fully independent state machines |
| Participant/requester/signer/witness model | Implemented but operational edit/remap coverage is incomplete |
| Document review/version/mapping | Partial; schema present, lifecycle and release transaction incomplete |
| Quote save/send/approve/supersede | Partial; save/approval safeguards tested, supersession UX incomplete |
| Primary invoice idempotency | Implemented + regression tested |
| Stripe/manual payment ledger | Implemented + targeted static regression tested; transaction-level concurrency test unavailable |
| Multiple supplemental invoices | Implemented by this audit + regression tested |
| Refunds/credits/waivers | Partial/blocked by owner rules |
| Central templates/messages | Partial; new composer uses library, legacy live renderer remains |
| Message failure recovery | Implemented for centralized send; legacy status email idempotency remains partial |
| Customer portal six sections/next action | Implemented + static regression tested |
| Portal privacy/RLS response minimization | Implemented by this audit + static regression tested; deployed RLS unverified |
| Admin next-action/review queue | Partial |
| Service-aware fulfillment | Partial |
| Completion gate | Partial and blocked before production |
| Cancellation/reschedule/reopen | Partial; owner policy required for paid cases |
| Backward compatibility | Implemented by fallbacks but fixture coverage missing |
| Mobile/responsive/accessibility | Implemented but browser verification unavailable |
| Proof foundation/readiness | Foundation implemented + tests present; completion/release prerequisite remains |

## Work outside APS

| Task | Classification | Reason |
|---|---|---|
| Perform the live notarization in Proof | A — legitimate external-platform work | Proof is the specialized RON execution engine |
| Resolve processor refunds in Stripe | B pending owner policy | APS records review intent but does not yet execute an approved automated refund model |
| Inspect Resend after ambiguous legacy send failure | C — workflow hole | Central message delivery has recovery state; legacy status email path still lacks end-to-end idempotency |
| Check Supabase to determine whether a deliverable/status is truly complete | C — workflow hole | Completion/release facts are not yet unified in one admin gate |
| Manually calculate normal invoice balance | C if still required | Ledger must remain authoritative; audit fixes supplemental aggregation but live migration verification remains required |

## Verification limitations

This audit is repository-based. It does not establish deployed migration/function versions, production secrets, production RLS, live Stripe/Resend behavior, or browser rendering. No production deployment or migration was performed.
