# APS Manual Expansion Source Pack

Baseline: production `07e466622923f9c640e20887b0e5afbbe77661d2`

This directory is the evidence pack for `docs/APS_SYSTEM_OPERATIONS_WORKFLOW_MANUAL.md`. It is not a second operating manual. The canonical manual remains the operator-facing source.

## Sources reviewed

- Public/admin/customer HTML and JavaScript
- Supabase migrations, RLS, storage policies, Edge Functions, and function configuration
- Node and Proof/Deno regression suites
- Production-safe browser inspection using synthetic APS records
- Current Terms, Privacy, Accessibility, FAQ, and support pages

## Evidence labels

- **Implemented:** enforced by current code/schema.
- **Production-inspected:** observed read-only in the live application.
- **Provider-native:** owned by Stripe, Proof, Resend, Google, or Vercel.
- **Owner-controlled pending:** requires an external owner value/action.
- **Manual screenshot required:** useful state cannot be captured without exposing real data or causing a consequential action.

Files:

- `IMPLEMENTATION_INVENTORY.md` — modules, workspace, states, controls, security, and integrations.
- `WORKFLOW_CATALOGS.md` — decision tables, templates, documents, fulfillment, visibility, and support.
- `SCREENSHOT_MANIFEST.md` — instructional image plan and safe-capture status.

No credentials, portal tokens, customer PII, real payment references, real document names, or Proof access links belong in this pack.
