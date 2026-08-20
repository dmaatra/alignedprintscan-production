# Release 10 Production Certification

Date: 2026-08-20

Project: Aligned Print & Scan

Production: `alignedprintscan.com` / Supabase `sfsdniavqldgbiretply`

Final classification: **PASS**

## Evidence and classification

- **CONFIRMED IN CODE:** Full Node regression suite passed 451/451; Deno domain/function suites passed 192/192; changed Edge Functions type-checked; JavaScript syntax and diff checks passed.
- **CONFIRMED IN PRODUCTION:** GitHub PR #105 merged, Vercel production deployment is Ready, migration `20260820212518` is recorded, three changed Edge Functions are deployed, and live browser verification passed.
- **CONFIRMED IN PRODUCTION:** 85 public tables all have RLS; 33 maintained Edge Functions are active; four Storage buckets are private; production orphan checks returned zero.
- **FIXED:** Customer Portal Documents copy; direct browser execution of the canonical intake RPC; public execution of an internal trigger procedure; mutable normalization search paths; anonymous/public access to four superseded order/quote tables; support-ticket management by non-admin authenticated users; three type-check-only defects.
- **DEFERRED:** Supabase performance-advisor tuning, leaked-password-protection account setting, deletion of the unreferenced `route-distance` stub, retail customer accounts, and future SMS/calendar/accounting integrations. None is a Release 10 blocker.
- **INTENTIONAL:** Request/reference-scoped retail portal, server-only RLS tables with no browser policies, maintained authenticated security-definer helpers that revalidate current identity/role, and preservation of historical data without cosmetic backfill.

## Release record — 1–10

| # | Item | Result |
|---:|---|---|
| 1 | Starting `main` | `1170c9e5a42c6440672bfc5024459694a5634b13` |
| 2 | Final `main` | `6788efbfc321a0f3ec6e92b27696ed63b1769641` |
| 3 | Branch | `codex/release-10-production-certification` |
| 4 | Source commit | `7a6288605749fb86401c868f035852e789225a9b` |
| 5 | PR | [#105](https://github.com/dmaatra/alignedprintscan-production/pull/105), merged |
| 6 | Merge commit | `6788efbfc321a0f3ec6e92b27696ed63b1769641` |
| 7 | Migration | `20260820212518_release_10_harden_rpc_execution_and_search_paths.sql`, applied and recorded |
| 8 | Edge Functions | `admin-route-distance`, `admin-service-adjustment`, `customer-upload-document`, deployed |
| 9 | Vercel | Production `alignedprintscan-production-312xafhme-doneishas-projects.vercel.app`, Ready; canonical domain verified |
| 10 | Tests | Node 451/451; Deno 192/192; function checks PASS; responsive/browser PASS |

## Service, customer, business, and Loan Signing — 11–59

| # | Certification result |
|---:|---|
| 11 | RON — PASS: intake, Proof preparation/activation/return projections, document review/release, failure and completion gates covered. |
| 12 | Mobile — PASS: structured address, ORS/manual fallback, tier math, quote locks, appointment and completion covered. |
| 13 | Print & Scan — PASS: intake, page authority, production/payment/fulfillment combinations and completion covered. |
| 14 | Loan Signing — PASS: Releases 6–8 certified as one lifecycle. |
| 15 | Retail intake — PASS: one transactional, validated server boundary; direct RPC execution revoked. |
| 16 | Customer Portal — PASS: customer-safe server projection, reference-scoped access, six sections and primary action. |
| 17 | Customer documents — PASS: inbound provenance and outbound explicit release boundaries preserved. |
| 18 | Quote/payment — PASS: quote, invoice, payment, receipt and balance states remain separate. |
| 19 | Appointments — PASS: requested and confirmed facts remain distinct and service aware. |
| 20 | Customer messages — PASS: branded templates, customer-safe activity and visibility boundaries. |
| 21 | Completion — PASS: service and invoice gates enforce current requirements. |
| 22 | Customer-language audit — FIXED: internal APS shorthand removed from portal customer prose while APS references remain valid identifiers. |
| 23 | Documents-tab copy — FIXED and LIVE: both owner-specified replacements render; both retired strings are absent. |
| 24 | Business application — PASS: stepped, duplicate-safe, policy-aware intake. |
| 25 | Business approval — PASS: APS-controlled review and organization creation. |
| 26 | Organization — PASS: separate tenant model, statuses, terms and service eligibility. |
| 27 | Invitation — PASS: server-created Auth invitation and identity-bound acceptance. |
| 28 | Authentication — PASS: independent Business and APS staff boundaries. |
| 29 | Membership — PASS: active/revoked role validation. |
| 30 | Organization switching — PASS: stale data clears before authorized reload. |
| 31 | Locations — PASS: multiple locations, one active default, role-gated mutations. |
| 32 | Requests — PASS: canonical requests with organization and creator attribution. |
| 33 | Appointments — PASS: organization-safe projections and maintained workflows. |
| 34 | Documents — PASS: server derives paths, returns short-lived signed access, denies forged/cross-tenant access. |
| 35 | Messages — PASS: tenant/customer/internal visibility remains separated. |
| 36 | Billing — PASS: terms, Stripe/offline paths, partials, refunds, reminders and credit holds. |
| 37 | Password recovery — PASS: eligibility scoped, enumeration safe, audited, token-secret. |
| 38 | Closure — PASS: reviewed, blocker-aware, history preserving. |
| 39 | Tenant isolation — PASS: live membership and organization revalidation on every protected family. |
| 40 | Loan Signing intake — PASS: public/business/Admin structured paths. |
| 41 | Pricing — PASS: versioned standard/custom review with immutable snapshots. |
| 42 | Package — PASS: versions and active/superseded history. |
| 43 | Page counts — PASS: trusted parser, provenance and quote-change review. |
| 44 | Printing — PASS: paper, sides, copies, volume and QC requirements. |
| 45 | Borrower copies — PASS: conditional, explicit blocker only when required. |
| 46 | Signer confirmation — PASS: conditional requirement. |
| 47 | Appointment — PASS: requirements and visit facts remain distinct. |
| 48 | Scanbacks — PASS: absent/required/approval/rescan states covered. |
| 49 | QC — PASS: service-applicable print and scanback checks. |
| 50 | Approval/rescan — PASS: required approval blocks; correction remains unresolved until cleared. |
| 51 | Return — PASS: method-specific return requirements. |
| 52 | Tracking — PASS: conditional label/tracking/proof gates. |
| 53 | Cancellation — PASS: authoritative timing and neutral outcome labels. |
| 54 | No-Sign — PASS: policy suggestion only, never automatic charging. |
| 55 | Partial — PASS: financial result derives from paid history. |
| 56 | Resign — PASS: cause-aware, capped, APS-error exclusion. |
| 57 | Wait — PASS: included time and started-increment calculation. |
| 58 | Financial resolution — PASS: explicit review, communication and closeout requirements. |
| 59 | Completion — PASS: requirements engine plus prepaid/postpaid gate. |

## Admin, state, finance, communications, documents, and security — 60–137

| # | Certification result |
|---:|---|
| 60 | Dashboard — PASS. |
| 61 | Requests — PASS; live authenticated desktop/mobile. |
| 62 | Review Queue — PASS; terminal exclusion and blocker grouping. |
| 63 | Calendar — PASS. |
| 64 | RON Sessions — PASS. |
| 65 | Loan Signings — PASS. |
| 66 | Invoices — PASS. |
| 67 | Payments — PASS. |
| 68 | Customers — PASS. |
| 69 | Organizations — PASS. |
| 70 | Business Applications — PASS. |
| 71 | Messages — PASS. |
| 72 | Templates — PASS. |
| 73 | Scripts — PASS. |
| 74 | Resource Articles — PASS. |
| 75 | Resource Feedback — PASS. |
| 76 | Resource Analytics — PASS. |
| 77 | Settings — PASS. |
| 78 | Staff & Access — PASS. |
| 79 | Admin global search — PASS: typed request/customer/invoice results. |
| 80 | Filters — PASS: status/service/date and quick-tab behavior. |
| 81 | Next action — PASS: explicit, deterministic operational guidance. |
| 82 | State machine — PASS: workflow, financial, appointment, document, participant and fulfillment dimensions remain separate. |
| 83 | Completion gates — PASS across RON, Mobile, Print & Scan, hybrid, Loan Signing and invoices. |
| 84 | Review Queue blockers — PASS: inventory covered by state and integration tests; production has 33 open review items. |
| 85 | Duplicate/obsolete blockers — PASS: no unresolved duplicate blocker demonstrated; terminal items are excluded. |
| 86 | Quote/invoice separation — PASS. |
| 87 | Stripe Customer mapping — PASS: server-only unique mapping. |
| 88 | Stripe Invoice mapping — PASS: server-only unique mapping and immutable invoice identity. |
| 89 | Card — PASS through Stripe-hosted flow and webhook reconciliation. |
| 90 | ACH — PASS: pending never becomes paid prematurely. |
| 91 | Partial payments — PASS. |
| 92 | Refunds — PASS: original-payment limits, idempotency and no test refund execution. |
| 93 | Offline check — PASS: admin authorization, existing invoice, unique reference. |
| 94 | Reminders — PASS: persisted, milestone-idempotent. |
| 95 | Credit hold — PASS: staff-controlled without removing portal access. |
| 96 | Postpaid completion — PASS: approved Net terms may complete while open; prepaid cannot. |
| 97 | Financial idempotency — PASS: payments, webhooks, invoices and refunds covered. |
| 98 | Templates total — 54. |
| 99 | Active templates — 54. |
| 100 | Duplicate active templates — 0. |
| 101 | Obsolete active templates — 0 demonstrated. |
| 102 | Orphan triggers — 0 unresolved. |
| 103 | Missing trigger/template mappings — 0 unresolved; all 18 Loan Signing families specified or safely mapped. |
| 104 | Email branding — PASS: canonical Aligned Print & Scan shell. |
| 105 | Resend — PASS: server-only, history/idempotency and safe failure paths. |
| 106 | Admin notifications — PASS: durable, deduplicated, admin-only, private Realtime identifiers. |
| 107 | Customer/business boundaries — PASS: safe projections and tenant/request scope. |
| 108 | Scripts/cards total — 48 across 8 categories. |
| 109 | Duplicate scripts — 0 unresolved. |
| 110 | Obsolete scripts — 0 active conflicts demonstrated. |
| 111 | Conflicting scripts — 0 unresolved. |
| 112 | Reference-only safety — PASS: scripts do not execute workflow mutations. |
| 113 | Document classification — PASS. |
| 114 | Release authorization — PASS; explicit APS action remains authoritative. |
| 115 | Signed links — PASS: short-lived and authorized. |
| 116 | Page counts — PASS: trusted parser, provenance, source/status and admin correction. |
| 117 | Forged document IDs — denied by server derivation/authorization. |
| 118 | Forged paths — denied; client paths are not trusted. |
| 119 | Cross-tenant storage — denied. |
| 120 | Anonymous — PASS after removal of public legacy reads and direct RPC execution. |
| 121 | Retail customer — PASS for request-scoped projection/actions; intentional non-account model documented. |
| 122 | Business member — PASS: live membership, role and tenant checks. |
| 123 | Business admin — PASS: tenant-admin permissions do not become APS permissions. |
| 124 | APS staff — PASS: active role and granular permission checks. |
| 125 | APS owner/admin — PASS: admin helper and self-lockout protections. |
| 126 | Suspended user — denied. |
| 127 | Removed user — denied. |
| 128 | Stale session — revalidated against live membership/staff state. |
| 129 | Cross-organization attacks — denied. |
| 130 | Service-role secrecy — PASS: no browser bundle exposure. |
| 131 | Direct protected-table access — PASS; server-only tables deny browser roles; Release 10 removed four legacy exceptions. |
| 132 | Edge authorization — PASS: changed functions return 401 without JWT; protected handlers revalidate role/context. |
| 133 | Advisors — 39 notices after repair: 29 intentional INFO no-policy server tables; 9 reviewed authenticated helper warnings; 1 deferred leaked-password setting. Mutable-search-path and anonymous-definer warnings are cleared. [Remediation reference](https://supabase.com/docs/guides/database/database-linter) |
| 134 | Orphans — 0 request/customer, invoice/request, payment/invoice, file/request, member/org and loan/request orphans. |
| 135 | Impossible states — no paid invoice with positive/underpaid balance and no pending real payment on a paid invoice. Three historical completed/open-invoice rows and four legacy file flags remain compatible and cannot bypass current gates/projections. |
| 136 | Historical compatibility — PASS: no deletion/backfill; four legacy table histories preserved server-only. |
| 137 | Audit/timeline integrity — PASS: append-only/history-safe workflows and deduplication covered. |

## Resource Center, public UI, providers, hygiene, documentation, and safety — 138–191

| # | Certification result |
|---:|---|
| 138 | Managed resources — 12. |
| 139 | Published resources — 11. |
| 140 | Archived resources — 1. |
| 141 | Search — PASS. |
| 142 | Filters — PASS. |
| 143 | Helpful/Not Helpful — PASS: private, rate-limited submission. |
| 144 | Private questions — PASS: non-public and sensitive-data warning preserved. |
| 145 | Admin feedback — PASS. |
| 146 | Analytics — PASS: governed events and private submission boundaries. |
| 147 | SEO — PASS: canonical metadata/structured data without fabricated ratings/locations. |
| 148 | Sitemap — PASS: canonical public pages only. |
| 149 | Archived payment article — private/archived, not deleted. |
| 150 | RON hierarchy — PASS: APS customer guidance precedes official sources. |
| 151 | Header lock — preserved. |
| 152 | Footer lock — preserved. |
| 153 | Typography lock — Playfair/Montserrat preserved. |
| 154 | Palette lock — grey/navy/ivory/gold preserved. |
| 155 | Auth visual lock — preserved across Admin and Business. |
| 156 | Responsive — PASS at 390, 768, 1024, 1280 and 1440; public route matrix and Admin mobile/desktop had no page overflow. |
| 157 | Accessibility — PASS for maintained semantics, labels, keyboard-targeted controls, status regions, private-route noindex and responsive navigation; no formal third-party conformance claim. |
| 158 | Broken links/assets — none demonstrated in tested production routes. |
| 159 | Public language — FIXED in Customer Portal; no obsolete business name in customer-facing suite. |
| 160 | Stripe failure/retry — PASS: signed webhook strategy, provider retrieval, deduplication, pending states and retry-safe reconciliation. |
| 161 | Resend failure/retry — PASS: durable history, safe failure and retry-in-place without duplicate success. |
| 162 | Proof failure — PASS: ambiguity/manual-review, monotonic webhook, retry/dead-letter and no test transaction. |
| 163 | ORS failure/fallback — PASS: actionable server error and explicit manual pricing fallback. |
| 164 | PDF parser failure — PASS: error provenance and review-required state, never fabricated count. |
| 165 | Console errors — 0 in live public/Admin verification. A non-fatal duplicate Supabase-client warning after repeated audit reloads is deferred hygiene. |
| 166 | Unexpected 401 — 0; three deliberate unauthenticated function probes returned expected 401. |
| 167 | Unexpected 403 — 0. |
| 168 | Endless loading — 0 on tested healthy routes. |
| 169 | Dead/broken assets — 0 demonstrated; `route-distance` stub is unreferenced deferred source cleanup. |
| 170 | Secret exposure — 0; service/Stripe/Resend/Proof/ORS secrets remain server-side. |
| 171 | Robots/noindex — PASS: private portals excluded. |
| 172 | GA4 — PASS: exact owner ID, allowlisted/deduplicated events and sanitized portal URLs. |
| 173 | Vercel runtime — PASS: production deployment Ready in 3 seconds and canonical domain served merged source. |
| 174 | Architecture docs — reconciled for transactional intake, 33 functions, four private buckets, ORS and production RLS. |
| 175 | Release lineage — this record links start/source/PR/merge/migration/functions/deployment. |
| 176 | Deferred register — maintained in this report and `docs/ROADMAP.md`; separated from defects. |
| 177 | Intentional architecture register — maintained in this report and architecture docs. |
| 178 | Legitimate production customer records modified — **NO**. |
| 179 | Real money moved — **NO**. |
| 180 | Real refunds issued — **NO**. |
| 181 | Real customer communication sent for testing — **NO**. |
| 182 | Proof transaction created for testing — **NO**. |
| 183 | Real Business Account application submitted — **NO**. |
| 184 | Real Loan Signing assignment created — **NO**. |
| 185 | PASS findings — 175. |
| 186 | FIXED findings — 7. |
| 187 | DEFERRED findings — 5. |
| 188 | INTENTIONAL findings — 4. |
| 189 | BLOCKED findings — 0. |
| 190 | Unresolved release-blocking defects — 0. |
| 191 | Final classification — **PASS**. |

Counts 185–189 are the finding register and may overlap certification evidence; they are not intended to sum to 191 checklist lines.

## Explicit Release 10 acceptance — A–DT

| Acceptance | Result |
|---|---|
| A–E | YES: Release 9.2.2 design lock honored; no redesign, new service, Release 11 work, or Handbook rebuild. |
| F–I | YES: RON, Mobile, Print & Scan, and Loan Signing certified. |
| J–P | YES: retail/portal authorization and language certified; both required copy removals/replacements are live. |
| Q–Z | YES: Business application, approval, organization, invitations, auth, recovery, isolation, switching, locations and billing certified. |
| AA–AE | YES: Loan Signing core, fulfillment, exceptions, financial resolution and completion certified. |
| AF–AV | YES: all named Admin operational modules certified. |
| AW–AZ | YES: separated states, transitions, completion gates and Review Queue blockers certified. |
| BA–BK | YES: quote/invoice/payment/receipt, mappings, card/ACH/partials/refunds/check/reminders/hold/postpaid certified. |
| BL–BQ | YES: communication inventory/mappings/branding/Resend/visibility certified. |
| BR–BS | YES: script inventory and reference-only boundary certified. |
| BT–BZ | YES: classification, release, signed URLs, page counts and forged/cross-tenant denial certified. |
| CA–CL | YES: all named actor/security boundaries certified. |
| CM–CO | YES: historical compatibility, no destructive backfill, audit/timeline integrity. |
| CP–CU | YES: Resource Center preserved, 11 published/1 archived accurately reported, privacy/SEO/Search Console/RON hierarchy preserved. |
| CV–CZ | YES: public header/footer/type/palette/auth design preserved. |
| DA–DB | YES: accessibility and responsive certification completed. |
| DC | LIMITED: WebKit-specific engine was unavailable; standards/static/accessibility checks passed. |
| DD | YES: Chromium production verification completed. |
| DE–DI | YES: Stripe, Resend, Proof, ORS and PDF parser failure behavior certified. |
| DJ–DL | YES: architecture reconciled; deferred and intentional registers documented. |
| DM–DS | NO, as required: no legitimate record, money, refund, communication, Proof, application or assignment test mutation. |
| DT | NO, as required: no unresolved release-blocking defect. |

Release 10 is complete. Release 11 has not started, and the Operator Handbook was not rebuilt.
