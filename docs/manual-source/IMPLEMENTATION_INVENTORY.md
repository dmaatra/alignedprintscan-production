# Implementation Inventory

## Global admin modules

| Module | Source of truth | Primary controls | Consequential actions |
|---|---|---|---|
| Requests | `service_requests` and service detail tables | search, filter, sort, open | archive/restore, protected deletion |
| Review Queue | derived blockers/actions | open exact request/tab | resolving business state |
| Customers | customers + request relationships | search, profile, active count | merge/link identity |
| RON Sessions | Proof transaction projection | inspect/sync/open Proof | draft/activate provider transaction |
| Calendar | request appointment fields | filter/open request | reschedule/confirm appointment |
| Payments | invoices, payments, refunds | inspect totals | record external payment/refund |
| Invoices | invoice ledger | filter/open request | issue or void under maintained rules |
| Messages | canonical communication ledger | inspect delivery | send customer communication |
| Templates | `message_templates` | preview/edit maintained template | template activation/content change |
| Notifications | authenticated realtime rows | open/mark read | no customer-side effect |
| Settings | maintained preferences/config | update authorized setting | configuration change |
| New Order | server-authorized intake | six-step wizard | create request and acknowledgment |

## Request workspace

The maintained tabs are exactly Overview, Customer, Documents, Quote, Payments, Messages, Fulfillment, and Timeline. Obsolete Notes, Communication, Appointment, and RON Session tabs are not maintained.

| Tab | Reads | Writes | Customer effect |
|---|---|---|---|
| Overview | status, next action, totals, schedule, acquisition | guided status/actions | portal status/next action |
| Customer | profile and request relationship | authorized contact/linking changes | communication destination |
| Documents | files, provenance, review/release state | upload/review/release | only released eligible outputs appear |
| Quote | current quote/items | save/send quote | customer approval surface |
| Payments | invoices/payments/refunds | manual TEST/payment/refund workflows | accurate paid/refunded/net/outstanding |
| Messages | templates and communication log | send or send+transition | email plus portal message/activity |
| Fulfillment | service-specific facts/blockers | appointments, production, delivery, Proof orchestration | fulfillment summary/access |
| Timeline | immutable event history | system actions append events | filtered customer Activity only |

## Customer portal

Sections: Overview, Documents, Quote & Payment, Appointment/Fulfillment, Messages, Activity. Existing-request access is server scoped and token/email validated. Internal notes, admin policy calculations, waiver reasons, provider error payloads, raw Proof IDs, audit files, and unreleased documents are filtered server-side.

## Maintained state families

- Request: Under Review, Quote Ready, Awaiting Approval, Awaiting Payment, Payment Received, Appointment Confirmed, service fulfillment states, Completed, Cancellation Requested, Cancelled, Archived.
- Invoice: Draft/open, paid, void/cancelled where allowed; amount, paid, refunded, net retained, outstanding are separate projections.
- Refund: pending provider confirmation, processed, failed/review required; partial/full is derived from sums.
- Document: customer upload, admin/internal, APS deliverable, Proof completed, audit/internal; review and release are independent.
- Customer action: pending, approved, denied; cancellation and reschedule are review requests.
- Proof: 13 APS stages from Business Readiness through APS Completion; Proof owns identity/notarization-native states.
- Review: Not Eligible, Eligible, Sent. Clicking Google never means Review Received.

## Authorization boundaries

- Admin financial/service-adjustment endpoints require authenticated admin authorization.
- Public customer actions use custom request/email validation and do not accept admin-only fields.
- Refund execution is server-side; browser code never receives Stripe secrets.
- Proof credentials and provider payloads remain server-side.
- Storage is private; customer access is scoped and release-filtered.
- Realtime notifications are authenticated and cannot substitute for authoritative rows.

## Integration inventory

| Integration | APS sends | APS receives | External/native boundary |
|---|---|---|---|
| Stripe | exact PaymentIntent/refund amount and idempotency key | authoritative payment/refund result | settlement and bank timing |
| Resend | rendered branded message | provider ID/delivery result | external email delivery |
| Proof | mapped signer/source document and authorized commands | transaction/status/assets | KBA, identity, meeting, signing, certificate, seal |
| Google | anonymous public events only when configured; review/browser CTA | aggregate analytics/search/review destination | account ownership and review content |
| Vercel | static production release | deployment status/runtime delivery | hosting/CDN |

## Analytics state

GA4 is active with the owner-supplied public Measurement ID `G-4KXRE49B0B`. It initializes once on the maintained analytics path, uses an allowlisted/deduplicated event taxonomy, disables advertising signals, and sends only sanitized service category and canonical path context. Search Console technical prerequisites exist, but property verification is owner-controlled. The APS database remains authoritative for request, quote, payment, completion, service, attribution, and revenue relationships; GA4 measures public traffic and approved funnel interactions only.
