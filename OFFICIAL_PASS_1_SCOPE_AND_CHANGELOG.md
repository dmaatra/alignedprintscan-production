# Aligned Print & Scan — Official Pass 1 (Revised)

## Release goal

Establish an accurate pricing, witness-intake, invoice, policy, branding, and code-quality foundation before the customer portal and full Admin Portal v2 rebuild.

## Functional scope

1. Centralized pricing configuration.
2. RON starting estimate: $25 online service fee + $10 first notarial act = $35.
3. Additional notarial acts: $10 each.
4. Aligned Print & Scan-provided witnesses: $25 remote / $50 mobile.
5. Conditional witness intake for RON and mobile requests.
6. Manual-review path for “Not sure.”
7. Separate initial-invoice and final-balance invoice records.
8. Protect paid Invoice #1 from later editing.
9. Prevent initial quote saves from deleting final-balance invoice items.
10. FAQ additions for pricing, witnesses, cancellation, rescheduling, no-shows, outages, and identity failure.
11. Terms additions for cancellation, rescheduling, invoice separation, witnesses, readiness, and third-party platforms.
12. Customer-facing business name standardized as “Aligned Print & Scan.”
13. Initial Admin Portal v2 shell and functional/disabled navigation states.
14. Formatting and comments for every HTML and JavaScript file functionally changed in this pass.

## Files functionally changed

- `pricing.html`
- `faq.html`
- `terms.html`
- `admin-dashboard.html`
- `assets/js/pricing-config.js`
- `assets/js/script.js`
- `assets/js/admin.js`
- `assets/css/styles.css`
- `assets/css/admin-v2.css`
- `supabase/functions/create-additional-invoice/index.ts`
- `supabase/migrations/20260715_witness_intake_and_pricing.sql`
- `supabase/migrations/20260716_official_pass_1_invoice_safeguards.sql`

## Formatting-only impact

The touched HTML and JavaScript files were expanded into readable, indented source. Untouched legacy files were not globally reformatted in order to keep this release reviewable.

## Explicitly deferred

- Full Admin Portal v2 split workspace and tabs
- `success.html` customer request portal redesign
- Proof API integration
- Reporting, analytics, automation, and AI features
- Full codebase-wide formatting pass

## Recommended GitHub commit title

`Official Pass 1: pricing, witnesses, invoice safeguards, policies, and code formatting`

## Recommended pull request summary

- Corrects and centralizes service pricing.
- Adds complete witness intake and estimates.
- Protects paid initial invoices and preserves final-balance items.
- Adds cancellation and rescheduling policies to FAQ and Terms.
- Begins Admin Portal v2 styling/navigation foundation.
- Reformats and comments all functionally updated HTML/JS files.
