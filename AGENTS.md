# Repository Instructions for AI and Automation

## Scope

These instructions apply to the entire repository.

## Project identity

- **CONFIRMED IN CODE:** Aligned Print & Scan (APS) is a static multi-page HTML/CSS/vanilla JavaScript application with Supabase as its backend.
- **CONFIRMED IN CODE:** Public pages live at the repository root. Shared assets live under `assets/`. Supabase migrations and Edge Functions live under `supabase/`.
- **CONFIRMED IN DOCUMENTATION:** The owner-approved architecture is static multi-page HTML, shared/page-specific CSS, vanilla JavaScript, Supabase Database/Auth/Storage/Realtime/Edge Functions, Stripe, Resend, Vercel, and GitHub.
- **CONFIRMED IN DOCUMENTATION:** Vercel is the approved production hosting/deployment platform. The production website deploys from the canonical GitHub production branch, `main`, through Vercel. Production deployments are owner controlled.
- **CONFIRMED IN DOCUMENTATION:** GitHub is required for repository hosting, change history, feature branches, focused commits, pull requests, owner review before merge, rollback/recovery history, collaboration, and connected Vercel deployment triggers. It is development governance, not an application-runtime dependency.
- **PRODUCTION VERIFICATION REQUIRED:** Vercel project settings, deployed migration version, deployed Edge Function versions, and live secret inventory cannot be established from this repository alone.

## Required reading before changes

Read the documents relevant to the work:

- `PROJECT_MEMORY.md`
- `docs/ARCHITECTURE.md`
- `docs/BUSINESS_RULES.md`
- `docs/BRAND_AND_UI_GUIDELINES.md`
- `docs/CUSTOMER_EXPERIENCE.md`
- `docs/ADMIN_OPERATIONS.md`
- `docs/DATABASE_AND_DATA_MODEL.md`
- `docs/INTEGRATIONS.md`
- `docs/ROADMAP.md`
- `docs/DEPLOYMENT_AND_TESTING.md`
- The applicable file under `docs/audits/`

Historical root-level deployment guides must be preserved. They record release history but may not describe the current system.

Version 1 governance documentation is frozen. Do not expand it unless implementation is blocked, a legal requirement is identified, or the owner explicitly requests additional documentation. Treat remaining owner decisions as intentionally deferred unless they directly block implementation.

## Evidence labels

When adding or correcting durable project documentation, use these exact labels:

- **CONFIRMED IN CODE** — directly supported by current frontend, migration, Edge Function, or configuration source.
- **CONFIRMED IN DOCUMENTATION** — stated in project documentation but not independently proven by current code.
- **HISTORICAL OR POSSIBLY OUTDATED** — once applicable, superseded, conflicting, or not verifiable in the current implementation.
- **UNKNOWN / OWNER CONFIRMATION REQUIRED** — cannot be answered safely from the repository.

Do not convert a documented aspiration into a confirmed capability.

## Change boundaries

- Continue improving the approved static architecture. Next.js is abandoned historical direction and is not an approved migration target. Do not introduce Next.js, React, Vue, another frontend framework, a bundler, or a package-based build system without a separate owner-approved architectural migration plan, risk analysis, data-preservation plan, testing plan, and deployment strategy.
- Favor simplicity, maintainability, reliability, transparency, and incremental improvement. Avoid unnecessary frameworks and infrastructure complexity.
- Proof is the approved future RON provider. Preserve Proof-related fields, terminology, workflows, and architecture; distinguish repository representation, Proof ODN workflows, APS-originated RON sessions powered by Proof, future API integration, and functionality that is not yet live. Do not claim live Proof API behavior unless verified in code and production.
- Do not expose service-role, Stripe secret, Resend, webhook, or routing keys in browser code.
- Treat the public Supabase anon key as browser-visible; privileged operations belong behind RLS, an authenticated function, or a service-role Edge Function.
- Add database changes as new forward migrations. Do not rewrite a migration that may already have been applied.
- Do not deploy migrations or functions merely because local files changed.
- Do not rewrite or delete historical deployment guides to make them look current.
- Do not infer production deployment state from local source.

## Financial and workflow safeguards

- Preserve separate invoice records. A paid Invoice #1 must not be rewritten to absorb later charges.
- Link payments to the invoice they settle and recalculate request-level totals from invoice/payment records.
- Do not mark an invoice paid until its own balance is zero.
- Do not allow order completion while any non-void/non-cancelled required invoice has an outstanding balance.
- Simulated/test payments must remain identifiable and excluded from real revenue reporting.
- Customer-facing notes and invoice lifecycle changes require history-safe handling. Review `docs/audits/PHASE_4_1_MILESTONE_1_AUDIT.md` before modifying note behavior.

## Validation expectations

- HTML/CSS-only changes: inspect affected pages at desktop and mobile widths.
- JavaScript changes: run `node --check` on each changed JavaScript file and perform the relevant browser flow.
- Edge Function changes: type/syntax check with the available Deno/Supabase tooling and test authorization, error, and idempotency paths.
- Migration changes: inspect dependencies and RLS, test on a non-production database, and document forward/rollback implications.
- Financial changes: test Invoice #1, Invoice #2, partial payment, final payment, duplicate webhook delivery, void/cancelled invoices, and completion protection.

## Git and deployment

- Review `git status` and the exact diff before staging.
- Use GitHub feature branches, focused commits, pull requests, and owner review before merging.
- Merge approved feature branches into `main`. Require pull requests before merge when practical, and do not make direct production edits except for owner-authorized emergencies.
- Do not make production changes through unmanaged ZIP replacement when the Git workflow is available.
- Codex may prepare deployment instructions but must never assume deployment authority and must wait for explicit owner approval.
- Do not commit, push, merge, migrate, or deploy without explicit owner authorization.
- Keep secrets and local environment files out of Git.
