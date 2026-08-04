# Aligned Print & Scan Project Bible

Status: Version 1 governance frozen for implementation; remaining decisions intentionally deferred
Created: 2026-08-03
Scope: Entire Aligned Print & Scan platform

## Authority and evidence

This document is the Version 1 governing document for Aligned Print & Scan. The owner has determined that current governance is sufficient for implementation. Remaining placeholders are intentionally deferred unless they directly block implementation, a legal requirement is identified, or the owner requests additional documentation.

The authoritative current project-source set is `AGENTS.md`, `PROJECT_MEMORY.md`, this `PROJECT_BIBLE.md`, current files under `docs/`, current application code, and current migrations and Edge Functions. Historical changelogs and deployment guides remain preserved but do not override these sources or later explicit owner decisions.

Evidence labels used throughout:

- **CONFIRMED IN CODE** — directly implemented in current frontend, migration, Edge Function, or configuration source.
- **CONFIRMED IN DOCUMENTATION** — explicitly stated in current project documentation or customer-facing policy, but not necessarily enforced by code.
- **OWNER VISION (Provided by Owner)** — reserved for owner-authored direction. No statements were designated as owner vision in the request that created this draft.
- **OWNER DECISION REQUIRED** — a governing choice the repository cannot make.
- **UNKNOWN** — not established by the repository or owner direction available for this draft.

This document does not turn implementation details into company philosophy. It does not treat historical aspirations as current owner decisions.

## Mission

**CONFIRMED IN DOCUMENTATION**

- APS publicly describes its work as “Secure Document & Notary Solutions.”
- APS offers Remote Online Notary, Mobile Notary, and professional Print, Scan, Copy, Document Support, and Courier-related services.
- Customer-facing pages emphasize professional service, secure handling, guided requests, and clear next steps.

**OWNER DECISION REQUIRED**

> Mission statement placeholder: The owner must provide or approve the official statement describing whom APS serves, what APS exists to do, and the outcome it seeks to deliver.

**UNKNOWN**

- Whether the existing “Secure Document & Notary Solutions” line is a tagline, mission shorthand, or both.
- Geographic and customer segments that should be named in the mission.

## Vision

**CONFIRMED IN DOCUMENTATION**

- The documented roadmap anticipates deeper admin operations, reporting, customer management, document management, templates, communications, calendar integration, roles, and a future live RON-platform integration.
- These items are documented product directions, not an approved company vision statement.

**OWNER DECISION REQUIRED**

> Vision statement placeholder: The owner must define the long-term future APS intends to create and the desired scope, market, and scale of the platform and business.

**UNKNOWN**

- Desired business scale, geographic reach, service expansion, staffing model, and platform boundaries.
- Whether APS intends to remain a service business with supporting software or develop the platform into a broader product.

## Core Values

**CONFIRMED IN DOCUMENTATION**

- The Privacy Policy explicitly states that APS values client privacy and handles personal and document-related information with professionalism and care.
- The Accessibility Notice states a commitment to professional and accessible service experiences and an aim for clear communication and readable website content.
- Pricing and request pages repeatedly describe estimates and pricing as clear, itemized, transparent, and subject to review.

These are documented commitments. Their wording and order as formal company values have not been owner-approved.

**OWNER DECISION REQUIRED**

> Core-values placeholder: The owner must approve the formal value names, definitions, priority, and expected behaviors. Candidate language must be reviewed rather than inferred from product copy.

**UNKNOWN**

- The complete owner-authored value system.
- Whether privacy, accessibility, transparency, professionalism, care, or security should be formal core values, operating principles, brand promises, or a combination.

## Brand Identity

**CONFIRMED IN CODE**

- The canonical customer-facing name is “Aligned Print & Scan.”
- Current service categories are Remote Online Notary, Mobile Notary, and Print & Scan/Document Services.
- The visual system uses a navy, cream/white, and muted-gold palette, serif display headings, sans-serif supporting text, rounded cards, restrained shadows, and premium spacing.
- Full and symbol logo assets exist in WebP and original PNG formats under `assets/images/`.

**CONFIRMED IN DOCUMENTATION**

- “Secure Document & Notary Solutions” is the recurring brand line.
- Customer-facing terminology should use “Print & Scan,” “View Receipt,” and “Color Paper.”
- Provider names such as Stripe should not replace the APS service relationship in primary customer calls to action.
- Email presentation is documented as white, navy, and gold with APS branding and support information.

**OWNER DECISION REQUIRED**

> Brand-governance placeholder: Approve the official tagline, voice attributes, logo-use rules, color specifications, typography licenses/fallbacks, and whether “premium” is an internal design goal or a public brand position.

**UNKNOWN**

- Formal brand manual, trademark policy, approved logo clear space, and prohibited treatments.
- Whether remaining “Aligned Document Services” wording is approved legacy language or must be removed.

## Customer Experience Philosophy

**CONFIRMED IN CODE**

- The public intake is guided, service-specific, multi-step, and estimate-driven.
- The status portal provides request progress, quote review, invoice/payment actions, appointment or fulfillment details, receipts, support, cancellation/reschedule requests, and additional document upload.
- Only actions applicable to the current request and invoice state are intended to appear.
- Customer actions involving cancellation, rescheduling, or refunds require review rather than automatic approval.

**CONFIRMED IN DOCUMENTATION**

- Communication should be clear and readable.
- Estimates should be itemized and reviewed before production, dispatch, or fulfillment.
- Final-payment and completed experiences should be concise, settled, and focused on status, service/payment summary, receipts, support, and review actions.
- APS does not provide legal advice or decide document requirements for the customer.

**OWNER DECISION REQUIRED**

> Customer-experience placeholder: Define the official service promise, communication response times, review turnaround, escalation standards, accommodation process, and acceptable level of customer self-service.

**UNKNOWN**

- Whether customers should eventually have authenticated accounts and a multi-request portal.
- Required service-level objectives for intake, quote review, scheduling, support, refunds, and completion.

## Admin Operations Philosophy

**CONFIRMED IN CODE**

- The admin application centralizes request review, customer/service details, documents, quotes, invoices, payments, appointments, support, communications, timeline events, and request status.
- The operational workflow preserves a request-level workspace and request-scoped document access.
- Completion remains a deliberate administrative action after financial requirements are satisfied.
- Customer cancellation/reschedule requests require an administrative decision and communication.

**CONFIRMED IN DOCUMENTATION**

- Existing working business logic should remain connected when the presentation layer is reorganized.
- Operational history, files, invoices, payments, and audit records should be preserved when a request is archived.
- Paid Invoice #1 must remain intact when later services require Invoice #2.
- Client-facing note history must preserve author, created timestamp, archived timestamp, and archived-by identity when available. Archive history must never be destroyed.

**OWNER DECISION REQUIRED**

> Operations placeholder: Define staff roles, approval authority, escalation paths, ownership of refunds, order-review checklists, handoff rules, and which actions require a second review.

**UNKNOWN**

- Future staffing model and role permissions.
- Formal operating procedures and service-level objectives.
- Whether administrators should reuse existing customer records when creating an order.

## Financial Philosophy

**CONFIRMED IN CODE**

- Prepared service value, initial payment, paid-to-date, and balance due are modeled separately.
- Each invoice retains its own amount, payment state, and balance.
- Payments can be linked to the invoice they settle.
- An invoice is not paid until its own balance reaches zero.
- Completion is blocked while a non-void/non-cancelled invoice has an outstanding balance.
- Simulated payments are identifiable through `is_test`.

**CONFIRMED IN DOCUMENTATION**

- Paid invoices must not be rewritten to absorb later charges.
- Invoice #1 contains all owner-approved charges known before work begins.
- Invoice #2 is created only when additional owner-approved charges arise after Invoice #1. APS supports both one-invoice and two-invoice workflows.
- A request is financially complete only when every required, non-void invoice associated with it has been paid or otherwise resolved under APS business rules. Implementation must not assume every request has two invoices.
- Test payments must be excluded from real revenue reporting.
- Approved advance production and dispatch charges are collected before applicable work begins; later completed services may be billed separately.
- Refund approval is an administrative responsibility. Refund history must preserve approving administrator, amount, reason, and timestamp.

**OWNER DECISION REQUIRED**

> Financial-governance placeholder: Define canonical pricing ownership, approved non-payment invoice resolutions, tax treatment, refund execution, processor fees, discounts, write-offs, reporting standards, and financial approval limits.

**UNKNOWN**

- Formal accounting system, reconciliation procedure, refund execution process, and revenue-recognition rules.

## Technology Philosophy

**CONFIRMED IN CODE**

- APS is currently a static multi-page HTML/CSS/vanilla JavaScript application with Supabase as its backend.
- Supabase provides Postgres, Auth, Storage, Realtime, and Edge Functions.
- Stripe supports embedded checkout and payment events; Resend supports transactional email.
- Current public pages require no frontend build step.

**CONFIRMED IN DOCUMENTATION**

- The approved current architecture is static multi-page HTML, shared/page-specific CSS, vanilla JavaScript, Supabase Database/Auth/Storage/Realtime/Edge Functions, Stripe, Resend, Vercel, and GitHub.
- Continue improving the existing architecture rather than rebuilding APS in another framework.
- Next.js is abandoned historical direction and is neither part of the current stack nor an approved future migration target. Next.js, React, Vue, other frontend frameworks, bundlers, and package-based build systems require a separate owner-approved architectural migration plan, risk analysis, data-preservation plan, testing plan, and deployment strategy.
- Privileged secrets and operations belong server-side.
- Proof is the approved future RON provider. Proof-related repository fields, terminology, workflows, and architecture must be preserved. Repository representation, Proof ODN workflows, APS-originated RON sessions powered by Proof, future API integration, and planned-but-not-live functionality must remain clearly distinguished.
- Vercel is the approved production hosting/deployment platform. APS production deploys from the approved GitHub production branch through Vercel; locally unverifiable settings require production verification.
- GitHub is required for source control and development governance: repository hosting, change history, feature branches, focused commits, pull requests, owner review before merge, rollback/recovery history, collaboration, and connected Vercel deployment triggers. GitHub is not an application-runtime dependency.
- The canonical production branch is `main`. Feature branches merge into `main` only after owner approval; pull requests are required when practical, commits should remain small and focused, and direct production edits are reserved for owner-authorized emergencies.
- Production deployments are owner controlled. Codex may prepare deployment instructions but must never assume deployment authority or deploy without explicit owner approval.
- APS favors simplicity, maintainability, reliability, transparency, and incremental improvement. Unnecessary framework or infrastructure complexity should not be introduced.

**OWNER DECISION REQUIRED**

> Technology-strategy placeholder: Define build-versus-buy criteria, provider concentration tolerance, availability goals, observability expectations, and infrastructure ownership not resolved by the approved architecture and simplicity principles above.

**UNKNOWN**

- **PRODUCTION VERIFICATION REQUIRED:** Production Vercel project configuration and exact deployed Supabase state.
- Long-term infrastructure ownership beyond the owner-controlled deployment authority already established.
- SMS notifications, calendar synchronization, CRM, accounting, and analytics are evaluation-only roadmap items; specific implementations are not approved.

## Engineering Standards

**CONFIRMED IN CODE**

- Shared pricing is centralized in `assets/js/pricing-config.js`.
- Browser-rendered data is passed through escaping helpers in major public/admin renderers.
- Financial workflows use invoice identifiers and separate invoice/payment state.
- Newer workflow operations record structured status, timeline, communication, or payment data.

**CONFIRMED IN DOCUMENTATION**

- Preserve existing behavior while changing presentation.
- Prefer one source of truth over duplicated amounts or status calculations.
- Validate JavaScript syntax and browser flows proportionate to changed risk.
- Validate financial changes across Invoice #1, Invoice #2, partial payment, final payment, duplicate webhook, void/cancelled invoices, and completion protection.
- Database changes must use forward migrations rather than rewriting migrations that may already be applied.

**OWNER DECISION REQUIRED**

> Engineering-governance placeholder: Approve code-review requirements, automated test thresholds, supported browsers, type-checking/linting policy, dependency policy, release criteria, and incident standards.

**UNKNOWN**

- Required automated coverage and CI platform.
- Formal performance, uptime, recovery-time, and recovery-point objectives.

## AI Engineering Standards

**CONFIRMED IN DOCUMENTATION**

- AI and automation must distinguish current code, documentation, historical material, and unknown owner decisions.
- AI must not convert aspirations into confirmed capabilities.
- AI must read relevant project memory, architecture, business, integration, deployment, roadmap, and audit documents before changes.
- AI must preserve secrets, use forward migrations, review Git scope, and avoid deployment without explicit authorization.
- AI must not rewrite or delete historical deployment guides to make them appear current.

**OWNER DECISION REQUIRED**

> AI-governance placeholder: Define whether AI may access production data, what data must be redacted, which actions always require approval, acceptable models/providers, logging/retention rules, and human-review requirements.

**UNKNOWN**

- Whether AI may ever make production changes.
- Whether customer documents, personal information, payment data, notarial data, or communications may be processed by external AI systems.
- Required disclosure, consent, audit, and deletion rules for AI-assisted work.

## UI/UX Standards

**CONFIRMED IN CODE**

- Public forms use native labels, required fields, live status regions, and keyboard-focusable controls.
- Service-specific intake fields appear conditionally.
- Admin v3 uses a compact top bar, operations sidebar, request rail, selected-request workspace, and tabs.
- The interface includes responsive navigation and mobile/tablet adaptations.
- Print styles support readable quotes, receipts, and confirmations.

**CONFIRMED IN DOCUMENTATION**

- UI should remain clear, readable, premium, and service-aware.
- Official Version 1 design tokens are Primary Navy `#161c4d`, Secondary Navy `#0d133c`, Dark Accent `#101744`, Primary Gold `#c8a96b`, Secondary Gold `#e8d28d`, and cream backgrounds `#f3eee4`, `#f6f3ee`, and `#f8f0d7`.
- Legacy Navy `#030431` and Legacy Gold `#d7b458` remain approved for historical assets and existing logos but are not default colors for new UI.
- Official APS logo files are authoritative. They must be reused without recreation, redrawing, recoloring, simplification, stretching, distortion, substitution, or regeneration; aspect ratio must be preserved. Use the long logo where space permits, the short logo where constrained, and favicon/icon assets only where appropriate.
- Button hierarchy should remain explicit.
- Customer status screens should avoid duplicate or inapplicable actions.
- Admin reorganization must preserve functional event handlers and accessible top-of-workspace navigation.
- Provider branding should not dominate the APS customer experience.

**OWNER DECISION REQUIRED**

> UI/UX placeholder: Approve a formal design system, accessibility target, browser/device matrix, responsive breakpoints, content standards, and usability acceptance process.

**UNKNOWN**

- WCAG target and results of any formal accessibility audit.
- Detailed logo sizing, clear-space, and placement rules beyond Version 1.

## Security Standards

**CONFIRMED IN CODE**

- Public browser code uses a Supabase anon key; server-side functions use service-role and third-party secrets.
- Admin login uses Supabase Auth.
- Uploaded files are stored in Supabase Storage, and admin code can create signed URLs.
- RLS is enabled on several migration-created tables.

**CONFIRMED IN DOCUMENTATION**

- Never expose service-role, Stripe secret, Resend, webhook, or routing credentials in browser code.
- Privileged operations must use RLS, verified authentication, or controlled server-side functions.
- Every exposed table should receive deliberate least-privilege review.
- Secrets and local environment files must not be committed.
- Production state must be inspected rather than inferred from local source.
- APS Version 1 intentionally uses the existing request-reference customer workflow; authenticated customer accounts are deferred.
- APS will comply with Texas notary requirements and applicable legal/business record-retention obligations. Specific retention periods remain an intentionally deferred future policy decision.

**CONFIRMED IN CODE**

- Current code and the read-only local/remote comparison reveal unresolved security risks: broad historical RLS policies, unauthenticated service-role Edge Functions, public status access based on request identifiers, and Storage access that differs from private/signed-only documentation.

**OWNER DECISION REQUIRED**

> Security-governance placeholder: Approve admin roles, data classification, specific retention periods, encryption/key ownership, incident response, audit cadence, vendor review, and acceptable public-link risk for the approved Version 1 request-reference workflow.

**UNKNOWN**

- Formal security owner, incident plan, breach-notification process, backup verification, penetration-test cadence, and compliance obligations.

## Development Standards

**CONFIRMED IN DOCUMENTATION**

- Confirm the repository root and branch before work.
- Inspect the exact local path before declaring a resource absent.
- Preserve unrelated work and historical files.
- Review `git status`, exact diffs, and validation results before staging.
- Do not commit, push, merge, migrate, deploy, or alter remote state without explicit owner authorization.
- Test changes in a safe local or preview environment before production.
- Back up the database before schema changes.
- Deploy only functions and assets whose reviewed changes require deployment.
- Preserve financial, document, communication, and audit history during rollback.
- Use GitHub feature branches, focused commits, pull requests, and owner review before merging.
- Retain Git history for rollback, recovery, collaboration, and connected Vercel deployments.
- Do not replace production through an unmanaged ZIP workflow when the managed Git workflow is available.
- Merge feature branches into `main` after owner approval; require pull requests when practical, prefer small focused commits, and avoid direct production edits except in owner-authorized emergencies.
- Production deployment authority remains with the owner. Codex may prepare instructions but must wait for explicit owner approval before deployment.
- Governance documentation is frozen for Version 1. Do not expand it unless implementation is blocked, a legal requirement is identified, or the owner explicitly requests more documentation. Remaining owner decisions are intentionally deferred unless they directly block implementation.

**OWNER DECISION REQUIRED**

> Development-process placeholder: Approve branch naming conventions, any additional required reviewers/checks, environment-promotion details, rollback ownership, and the emergency-change procedure beyond the owner-controlled release requirement already established.

**UNKNOWN**

- Current CI/CD enforcement and branch-protection rules.
- **PRODUCTION VERIFICATION REQUIRED:** Actual GitHub branch-protection configuration, connected Vercel Git settings, and production environment access assignments.

## Long-Term Roadmap

**CONFIRMED IN DOCUMENTATION**

Near-term documented work:

- Establish production truth for Supabase schema, migrations, policies, Storage, Realtime, and deployed functions.
- Repair Phase 4.1 Milestone 1 according to its approved audit.
- Improve transaction atomicity, shared status/financial contracts, idempotency, and least-privilege access.

Documented deferred capabilities:

- Database-wide invoice/payment reporting.
- Full customer CRM.
- Secure global document indexing.
- Saved editable templates.
- Reports, analytics, accounting, and automation.
- Multi-user roles and permissions.
- Unified communications and automated timeline.
- External calendar synchronization.
- Future Proof API integration for APS-originated RON sessions, invitations, identity state, recording, and audit-trail synchronization; these capabilities are planned and are not currently verified as live.
- Reliable distance and travel calculations supporting Mobile Notary pricing after an implementation/provider proposal receives owner approval; the current stubs are acceptable until replacement.
- Evaluation of SMS notifications, calendar synchronization, CRM, accounting, and analytics; these are roadmap items, not approved implementation work.
- Authenticated customer accounts; Version 1 intentionally continues the request-reference workflow.

**OWNER DECISION REQUIRED**

> Roadmap placeholder: The owner must prioritize, sequence, fund, defer, or reject these items and define measurable outcomes for each approved phase.

**UNKNOWN**

- Approved dates, budget, staffing, dependencies, and definition of success.
- Which, if any, evaluated future integrations should proceed to approved implementation.

## Decision-Making Principles

**CONFIRMED IN DOCUMENTATION**

When evidence conflicts, use this order for technical truth:

1. Verified deployed behavior and remote state when the decision concerns production.
2. Current executable code and migrations when the decision concerns the repository.
3. Current Supabase configuration.
4. This Project Bible after owner approval.
5. Current foundation documents and approved audits.
6. Historical changelogs and deployment guides.

Additional documented principles:

- Preserve records and avoid destructive shortcuts.
- Separate customer-facing workflow, payment state, and appointment state.
- Base financial state on invoice/payment facts rather than display labels.
- Treat security and authorization as explicit design requirements.
- Clearly distinguish confirmed behavior, documentation, owner direction, required decisions, and unknowns.
- Do not treat a local file, remote resource, or deployment as absent until the exact source has been checked.

**OWNER DECISION REQUIRED**

> Decision-framework placeholder: Approve who has final authority for business policy, legal/compliance questions, pricing, finance, security, product scope, engineering architecture, and production release.

> Conflict-resolution placeholder: Define when an owner decision overrides existing documentation, how that decision is recorded, and which downstream documents or implementations must be updated.

**UNKNOWN**

- Named decision owners and delegation limits.
- Required evidence, review, and sign-off for high-risk changes.

## Owner approval record

**OWNER VISION (Provided by Owner)**

> No owner-vision statements were provided for inclusion in this draft. Reserved for owner-authored content.

**OWNER DECISION REQUIRED**

- Approval status: `[DRAFT / APPROVED / REJECTED]`
- Approved by: `[OWNER NAME]`
- Approval date: `[DATE]`
- Version: `[VERSION]`
- Approved mission: `[OWNER INPUT]`
- Approved vision: `[OWNER INPUT]`
- Approved core values: `[OWNER INPUT]`
- Amendments or limitations: `[OWNER INPUT]`

**CONFIRMED IN DOCUMENTATION**

- Version 1 governance freeze: approved by owner direction on 2026-08-04.
- Implementation may proceed under the confirmed rules; unresolved placeholders do not block implementation unless a specific task reaches them.
