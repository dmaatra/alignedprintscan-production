# Batch 1 Source Register

| Subject | Authority | Batch 1 use |
|---|---|---|
| Certified baseline | `docs/audits/RELEASE_10_PRODUCTION_CERTIFICATION.md` | production status, maintained modules, counts, safety boundaries |
| Admin/workspace | `admin-dashboard.html`, `assets/js/admin.js`, `assets/js/admin-v3.js`, Admin tests | modules, tabs, Next Action, search/filter, review behavior |
| Customer journey/portal | `customer-status.html`, `assets/js/script.js`, customer-view/action functions/tests | six sections, actions, customer-safe visibility |
| People/participants | participant UI/domain/migrations/tests; maintained template/script catalogs | roles, Add/Edit/Review, no inference |
| Documents | upload/release/customer-view/storage functions/tests; `docs/manual-source/WORKFLOW_CATALOGS.md` | classification, review, release, access, recovery |
| RON completed assets | Proof document/completed-asset lifecycle modules/tests | source/completed distinction, retry/hold/release boundaries |
| State/gates | completion helpers, fulfillment tests, workflow catalogs | parallel dimensions and gate behavior |
| Money cross-references | invoice/payment/refund code/tests; `docs/BUSINESS_RULES.md` | high-level distinctions only; detailed operation deferred to Part V |
| Brand/layout | `assets/css/styles.css`, `docs/BRAND_AND_UI_GUIDELINES.md`, locked specification | palette, typography, logo, callouts, tables |
| Existing screenshots | `docs/manual-source/SCREENSHOT_MANIFEST.md`, `docs/assets/manual/` | governed synthetic visual evidence |

## Source verification required

- Exact operator-visible Proof failure/retry labels will be reconciled in Part VI; Batch 1 teaches hold/do-not-substitute/maintained-retry/escalation.
- Exact production classification labels will be mapped to the handbook-friendly teaching classes during final editorial reconciliation; current controls remain authoritative.
- Formal incident/legal response for wrong-document release is not defined here; operators escalate to owner/authorized incident review and do not invent notification policy.
- Future-Part procedures and final page-number cross-references remain intentionally unpopulated.
