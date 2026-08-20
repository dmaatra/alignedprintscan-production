# Roadmap

This roadmap distinguishes approved known repair work from documented deferrals. It does not authorize implementation.

## Release 10 reconciliation

**CONFIRMED IN PRODUCTION:** Release 10 completed the production-truth inventory for Supabase schema/RLS/Storage/functions, current GitHub main, and Vercel runtime. Proven release-blocking browser-access defects were repaired with a forward migration; historical rows were preserved. Remaining advisor performance items, customer accounts, external calendar/SMS/accounting work, and deletion of the unreferenced `route-distance` stub are deferred enhancements rather than Release 10 defects.

## Immediate: production truth and security baseline

1. **PRODUCTION VERIFICATION REQUIRED:** Export or inspect the production Supabase schema, migration ledger, RLS policies, Storage policies, Realtime publication, and deployed-function settings.
2. **CONFIRMED IN CODE:** Audit unauthenticated/service-role Edge Functions, especially `update-request-status`, `create-additional-invoice`, `admin-resolve-customer-action`, and Stripe webhook verification.
3. **CONFIRMED IN CODE:** Reconcile the five function directories not explicitly represented in `supabase/config.toml`.
4. **CONFIRMED IN DOCUMENTATION:** Vercel is the approved, owner-controlled production platform connected to GitHub branch `main`. **PRODUCTION VERIFICATION REQUIRED:** domains, headers, redirects, preview policy, Git integration, and access settings.

## Phase 4.1 Milestone 1 repair

Approved audit source: `docs/audits/PHASE_4_1_MILESTONE_1_AUDIT.md`.

1. Complete search coverage for APS reference, customer name/email/phone, service, status, and every invoice number.
2. Place Notes directly after Payments.
3. Remove left-navigation icons while preserving label layout.
4. Rename New Request to New Order and remove the two adjacent inert actions.
5. Replace the basic admin form with a complete, transactional service-specific order wizard.
6. Rebuild Customer tab grouping explicitly.
7. Correct note archive to run only at canonical financial completion; preserve author, created timestamp, archived timestamp, and archived-by identity when available; prevent duplicates and never destroy history.
8. Render current and archived client-facing notes in Notes.

All are **CONFIRMED IN CODE AS OPEN GAPS**. Repair has not been authorized by this documentation effort.

## Transaction and data integrity

1. **CONFIRMED IN CODE:** Move multi-table public intake and admin order creation to transactional server operations.
2. **CONFIRMED IN CODE:** Establish one shared status vocabulary and financial calculation contract across browser and Edge Functions.
3. **CONFIRMED IN CODE:** Add idempotency coverage for all payment, invoice, status-email, and customer-action operations.
4. **CONFIRMED IN DOCUMENTATION:** Use the canonical financial-completion rule: Invoice #1 contains known pre-work charges; Invoice #2 exists only for later owner-approved charges; one- and two-invoice workflows are supported; every required, non-void invoice must be paid or otherwise resolved. Tax, refund execution, processor fees, and reporting treatment remain intentionally deferred.
5. **CONFIRMED IN CODE:** Replace broad public/authenticated policies with least-privilege RLS after production policy inventory.

## Admin operations expansion

- **CONFIRMED IN DOCUMENTATION:** Dedicated database-wide invoice/payment reporting.
- **CONFIRMED IN DOCUMENTATION:** Full customer CRM page.
- **CONFIRMED IN DOCUMENTATION:** Global document indexing with secure request boundaries.
- **CONFIRMED IN DOCUMENTATION:** Saved editable email/document templates.
- **CONFIRMED IN DOCUMENTATION:** Reports, analytics, automation, and accounting integration.
- **CONFIRMED IN DOCUMENTATION:** Multi-user roles and permissions.
- **CONFIRMED IN DOCUMENTATION:** Unified communications and fully automated timeline.

## Integrations

- **CONFIRMED IN CODE:** Route-distance functions remain stubs. **CONFIRMED IN DOCUMENTATION:** This is acceptable until an owner-approved replacement provides reliable Mobile Notary distance/travel calculations.
- **OWNER DECISION REQUIRED:** Approve the future provider and implementation proposal before replacement.
- **CONFIRMED IN DOCUMENTATION:** External calendar synchronization is deferred.
- **CONFIRMED IN CODE:** Phase 4.2 Increment 1 establishes the local Proof integration foundation without creating transactions, uploading documents, activating sessions, or accepting provider webhooks.
- **CONFIRMED IN DOCUMENTATION:** Proof is the approved RON provider. Design and implement separately verified Proof ODN and APS-originated RON workflows; live API session creation, invitations, identity tracking, recording synchronization, and audit-trail synchronization remain future increments.
- **HISTORICAL OR POSSIBLY OUTDATED:** SMS integration was recommended but never implemented.
- **CONFIRMED IN DOCUMENTATION:** SMS notifications, calendar synchronization, CRM, accounting, and analytics are evaluation-only roadmap items and are not approved implementation work.

## Customer experience

- **CONFIRMED IN DOCUMENTATION:** Remaining customer portal visual refinements after transaction stability.
- **CONFIRMED IN DOCUMENTATION:** Customer accounts are intentionally deferred. Version 1 continues the request-reference workflow; authenticated accounts remain a future roadmap item.
- **UNKNOWN / OWNER CONFIRMATION REQUIRED:** Accessibility conformance target and formal audit.
- **CONFIRMED IN DOCUMENTATION:** APS will comply with Texas notary and applicable legal/business retention obligations. Specific retention periods and deletion experience are intentionally deferred.

## Consolidated unresolved questions

### Business

1. What prices are canonical, and who may approve pricing changes?
2. Are tax, parking, waiting, specialty preparation, shipping, or processor fees charged, and how?
3. Which non-payment resolutions satisfy the canonical financial-completion rule?
4. What are the detailed refund execution and customer-notification procedures? Administrative approval and required history fields are already established.
5. What specific customer/service/document retention periods apply under Texas notary and other legal/business obligations?

### Product and operations

6. Should administrators reuse existing customers or always create a new customer record?
7. What fields and steps are mandatory in the New Order wizard for each service?
8. Which staff roles are needed, and what may each role read or change?
9. What future conditions would justify moving beyond the approved Version 1 request-reference workflow to authenticated customer accounts?
10. What are the operational SLAs for review, support, rescheduling, refunds, and completion?

### Integrations and infrastructure

11. Which routing provider and implementation design should be approved before replacement, including private origin/service area handling?
12. What detailed Proof API scope, ODN/APS-originated workflow design, webhook design, legal/retention requirements, and rollout plan should be approved?
13. **PRODUCTION VERIFICATION REQUIRED:** What Vercel project settings, domains, headers, redirects, preview policy, Git connection, and access assignments are live?
14. Which Edge Function secrets and sender identities are live?
15. Is the Stripe webhook expected to verify signatures with `STRIPE_WEBHOOK_SECRET`?
16. Are SMS, calendar, CRM, accounting, or analytics integrations planned and funded?

### Data and security

17. **PRODUCTION VERIFICATION REQUIRED:** What is the actual remote schema and migration ledger?
18. **PRODUCTION VERIFICATION REQUIRED:** Which production RLS/Storage policies are active?
19. Is request-ID/reference access sufficient for the public status payload?
20. Implement capture of note author, created timestamp, archived timestamp, and archived-by identity when available, without destroying history.

Questions without another label remain **UNKNOWN / OWNER CONFIRMATION REQUIRED**. Live-environment questions are explicitly **PRODUCTION VERIFICATION REQUIRED**.
