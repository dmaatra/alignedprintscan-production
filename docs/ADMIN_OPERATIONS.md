# Admin Operations

## Access

- **CONFIRMED IN CODE:** The admin area is not linked in public navigation. Entry is `admin-login.html`.
- **CONFIRMED IN CODE:** Login uses Supabase email/password Auth and redirects to `admin-dashboard.html`.
- **CONFIRMED IN CODE:** The dashboard redirects unauthenticated sessions back to login.
- **CONFIRMED IN DOCUMENTATION:** Admin users are expected to be allowlisted through `admin_users`/`is_admin()` RLS.
- **PRODUCTION VERIFICATION REQUIRED:** That admin table/function is not defined by repository migrations, so the production authorization implementation must be verified.

## Admin application structure

### Request workspace

**CONFIRMED IN CODE:** The request workspace contains a filterable request rail and selected-request panels for Overview, Customer, Documents, Payments, Appointment, RON Session, Communication, Timeline, and Notes.

Core capabilities:

- View request/customer/service details.
- Review uploaded files through signed URLs.
- Upload additional administrator files.
- Build and save quote items.
- Issue a final-balance invoice.
- Record authenticated offline/simulated payment.
- Update request status and trigger eligible emails.
- Save appointment/fulfillment details.
- Review cancellation/reschedule requests and record refund review amounts.
- View communications and timeline events.
- Archive/restore requests without deleting files/history.

All are **CONFIRMED IN CODE**, though the Phase 4.1 audit documents presentation and completeness defects.

### Operations modules

**CONFIRMED IN CODE:** Phase 4.1 adds Dashboard, Calendar, Invoices, Payments, Customers, Documents, Templates, Support, Settings, and a basic new-request form.

- Dashboard summarizes loaded active requests, review count, upcoming dates, paid-to-date, and outstanding balance.
- Calendar lists requested/confirmed dates from loaded requests.
- Invoices and Payments summarize request-level fields, not a complete database-wide ledger.
- Customers derives a directory from loaded requests.
- Documents links back to request-scoped workspaces.
- Templates is guidance/quick-start content, not persisted templates.
- Support summarizes loaded open tickets and links back to existing controls.
- Settings is integration-status copy, not editable configuration.
- New request inserts only customer and basic service-request rows.

## Standard operating workflow

1. Review a new `under_review` request and its files/service details.
2. Build and save the prepared quote; saving does not itself notify the customer.
3. Set Quote Ready/Awaiting Approval when ready to send customer email.
4. Customer approves, creating/refreshing Invoice #1.
5. Customer pays through Stripe or an authorized admin records an offline/test payment.
6. Confirm appointment/fulfillment details.
7. If later services add a balance, issue Invoice #2 rather than editing paid Invoice #1.
8. Collect final payment and verify all invoice balances are zero.
9. Mark Completed manually.

This sequence is **CONFIRMED IN CODE** and **CONFIRMED IN DOCUMENTATION**.

## Support and customer actions

- **CONFIRMED IN CODE:** Support tickets have new/in-progress/waiting/resolved/archive controls in the legacy admin rendering.
- **CONFIRMED IN CODE:** Customer cancellation/reschedule requests may be approved or denied with an admin message.
- **CONFIRMED IN CODE:** An approved refund amount creates a `refund_reviews` record for processing; it does not execute a Stripe refund.
- **CONFIRMED IN DOCUMENTATION:** Refund approval is an administrative responsibility. Refund history must preserve approving administrator, amount, reason, and timestamp.
- **UNKNOWN / OWNER CONFIRMATION REQUIRED:** The processor-execution procedure and how refund completion is recorded remain intentionally deferred.

## Alerts and Realtime

- **CONFIRMED IN CODE:** The dashboard subscribes to `service_requests` and `support_tickets` via Supabase Realtime and reloads on changes.
- **CONFIRMED IN CODE:** A soft browser-generated sound can play on new requests; browser interaction may be required before audio is allowed.
- **PRODUCTION VERIFICATION REQUIRED:** Whether both tables are enabled in the production Realtime publication.

## Known Phase 4.1 gaps

**CONFIRMED IN CODE:** See `docs/audits/PHASE_4_1_MILESTONE_1_AUDIT.md`. Search coverage, tab order, navigation cleanup, New Order wording/actions, complete admin order entry, Customer tab organization, note lifecycle, and archived-note display remain unresolved.
