# APS Manual Expansion Source Pack

Baseline: production `723898096259aaa2a92bfe2008c4cb610424478d`

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
- **Captured:** synthetic-only production image passed visual privacy review.
- **Manual screenshot required:** useful state cannot be safely isolated without exposing protected data or causing a consequential action.
- **Future legitimate transaction capture required:** the state should be photographed only when it occurs naturally in a controlled legitimate workflow.

Files:

- `IMPLEMENTATION_INVENTORY.md` — modules, workspace, states, controls, security, and integrations.
- `WORKFLOW_CATALOGS.md` — decision tables, templates, documents, fulfillment, visibility, and support.
- `SCREENSHOT_MANIFEST.md` — instructional image plan and safe-capture status.

The manifest contains exactly 19 instructional states. Three controlled production screenshots are currently captured under `docs/assets/manual/`; the remaining states retain explicit safe-capture dispositions. No credentials, portal tokens, customer PII, legitimate payment references, legitimate document names, or Proof access links belong in this pack.
