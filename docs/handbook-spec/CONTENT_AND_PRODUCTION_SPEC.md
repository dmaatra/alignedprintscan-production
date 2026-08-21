# Content and Production Specification

Standard status: **OWNER APPROVED — LOCKED**

Owner approval date: **2026-08-20**

## Editorial contract

Every substantive operational section naturally answers: what it is; why it matters; where it is in APS; what the operator checks and does; what the customer sees or receives; what blocks advancement; what must not be done; what happens when something goes wrong; and what record remains. Do not print these as a repetitive form.

Every procedure uses: purpose; when to use; prerequisites; role/permission; authoritative inputs; actual numbered actions using exact production labels; decision points; visible result; required record; customer effect; verification; stop conditions; escalation; related template/script; and cross-reference. Every consequential action includes a **Before you act** and **Verify afterward** block. “Process according to APS procedures” is not a procedure.

Use plain, direct operator language. Prefer “what APS shows,” “what the operator verifies,” and “what comes from the provider” over engineering terms. Distinguish requested from confirmed, prepared from sent, sent from delivered, uploaded from reviewed, reviewed from completed, completed from released, payment pending from paid, provider complete from APS complete, and policy suggestion from authorized financial decision. Never promise legal effect, provider success, appointment availability, refund timing, or completion without authoritative evidence.

Warnings use four controlled types:

- **Stop:** proceeding could violate law, authorization, security, money, or document controls.
- **Gate:** required facts are not yet satisfied.
- **Caution:** reversible error or customer confusion is likely.
- **Boundary:** APS versus customer/provider/legal responsibility.

## Publication architecture

- Word uses true Heading 1–4 styles; no visual-only headings.
- Contents, figures, tables, procedures, bookmarks, page references, and cross-references are fields/links, not typed page numbers.
- Every figure/table/procedure has a unique stable ID and descriptive caption.
- “Back to Contents” and “Back to Part” links appear after long reference entries.
- Portrait is default; landscape is reserved for wide matrices. Tables repeat headers and do not split critical rows.
- Running header: part and chapter. Footer: handbook title, Release 10 Certified Operations Edition, controlled-copy status, page x of y.
- PDF bookmarks mirror Heading 1–3. Links and alt text survive export.

## Brand system

| Role | Production token | Value |
|---|---|---|
| Primary navy | `--aps-navy-primary` | `#161C4D` |
| Secondary navy | `--aps-navy-secondary` | `#0D133C` |
| Primary gold | `--aps-gold-primary` | `#C8A96B` |
| Light gold | `--aps-gold-secondary` | `#E8D28D` |
| Ivory / primary page field | `--aps-cream-2` | `#F6F3EE` |
| Warm creams | `--aps-cream-1`, `--aps-cream-3` | `#F3EEE4`, `#F8F0D7` |
| Body grey | `--aps-text-body` | `#2D2D2D` |
| Muted grey | `--aps-text-muted` | `#6B6D78` |
| Border grey | `--aps-border` | `#E4E0D8` |

Playfair Display is used for cover, part titles, and chapter titles; Montserrat is used for body, labels, tables, captions, headers, and footers. Reuse official logo assets without recreation, recoloring, distortion, or regeneration.

## Page patterns

- **Cover:** official logo; title; edition; certified baseline; owner-controlled publication label. No stock collage.
- **Part divider:** navy field, gold part number, Playfair title, one-sentence operating promise, three to five chapter outcomes.
- **Chapter opener:** outcome statement, prerequisites, chapter map, and “Use this chapter when…” panel.
- **Procedure:** one column for prose; optional narrow evidence rail; numbered steps; decision and verification blocks adjacent to the relevant action.
- **Quick reference:** one task per page/spread, large labels, minimal prose, exact cross-reference, and version footer.
- **Template/script entry:** consistent field table; never reproduce a script as a template or imply a script sends/changes data.

## Tables and diagrams

Tables require a task-specific title, row/column headers, units, state legend, source note, and accessible reading order. Do not use color as the only carrier of meaning. Diagrams must be editable vectors in the source, have text alternatives, and distinguish actor, system, state, decision, document, money, and external-provider shapes. Final publication must not contain ASCII diagrams.

Every decision tool shows the condition and explicit **YES**, **NO**, and **HOLD/STOP** paths where applicable, followed by escalation and next stage. Every gate states its purpose, required conditions, where to check, what APS shows, blocker, communication, authorized override if one exists, prohibited bypass, and next stage.

Every service communication table uses: Stage; APS Status/Condition; Operator Action; Customer/Recipient Communication; Template/Channel; Gate/Do Not Advance Until; Timeline/Audit. Every row labels communication **AUTO**, **OPERATOR**, or **IF NEEDED** only after trigger behavior is verified.

## Teach / apply / reference control

- **Teach here:** the complete concept appears once in its authoritative chapter—especially people, documents, money, communication control, and security.
- **Apply here:** each service chapter applies the concept with exact service facts, quote steps, communication timing, gates, and exceptions.
- **Reference here:** Quick References and template/script directories summarize or link without silently redefining the procedure.

## Operational content requirements matrix

| Service/area | Workflow map | Status/action/communication | Quote procedure | Timing | Gates | Documents | Exceptions | Screens | Diagrams | Quick reference | Templates | Scripts |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| RON | required | required | required | required | required | required | required | required | required | required | mapped | mapped |
| Mobile | required | required | required | required | required | required | required | required | required | required | mapped | mapped |
| Print & Scan | required | required | required | required | required | required | required | required | required | required | mapped | mapped |
| Loan Signing | required | required | dedicated chapter | dedicated chapter | dedicated chapter | package/reference chapters | dedicated chapter | required | required | expanded set | all applicable mapped | all applicable mapped |
| Business | required | required | Part V cross-reference plus terms | required | required | tenant lifecycle | required | required | required | required | all applicable mapped | applicable mapped |

## Template, script, and loan-document standards

Each of the 54 maintained templates receives its own entry with WHEN TO USE, WHEN NOT TO USE, prerequisites, AUTO/OPERATOR/IF NEEDED classification, trigger/channel, recipient/outcome, related status/action/gate, next step, APS record, variables, caution, and operator-readable message reference. Existence never proves automation.

Each of the 48 maintained scripts/cards receives its own entry with WHEN TO USE, WHEN NOT TO USE, situation/audience, boundary, related stage/gate/template, and type: Full Script, Quick-Flip, Checklist, or Decision/Stop Card. **Scripts guide the operator; they do not change the request.**

Every detailed loan-document entry includes: document name, common packages, what it is, why it appears, signer interaction, operator focus, commonly notarized, presentation guidance, prohibited conduct, and question referral. Package-type tables additionally show “Signer Usually Does” and “Caution/Referral.” “Commonly notarized” never authorizes notarization; the actual document, certificate, law, and authorized instructions control. Unverified entries are visibly marked **SOURCE VERIFICATION REQUIRED**.

## Screenshots and photographs

Screenshots must use synthetic or safely governed records, show the relevant production UI, exclude tokens and private data, retain an unannotated master, and add numbered editorial callouts outside the raster when possible. Each caption says what the operator should notice—not merely the screen name. Recapture when production labels/layout materially drift.

Photographs are instructional evidence, not decoration. Each must orient, demonstrate, or separate/provide chapter orientation. Use only when posture, physical handling, equipment, environment, or tangible QC is clearer than an illustration. Photography should be Black/P.O.C.-forward and representative without tokenism. Obtain documented rights/model/property releases; avoid real customer documents, IDs, addresses, seals, certificates, shipping labels, screens, or credentials. Stage obviously synthetic materials. Record alt text, source, license, release status, purpose, and expiration/review date.

## Accessibility and output QA

- Logical reading order, tagged headings, tagged tables, alt text, and meaningful link text.
- Minimum effective body size 10.5 pt, captions 8.5 pt, and comfortable leading.
- Contrast checked for text, callouts, diagrams, and print output; color never acts alone.
- Avoid orphan headings, clipped tables, stretched images, broken links, stale page references, blank spill pages, and rasterized body text.
- Validate DOCX structure, render every page, visually inspect every rendered page, export PDF, compare page count/links/bookmarks, and inspect at least cover, every divider, every landscape section, dense reference spreads, and final index at 100%.
- Design Quick Reference pages for independent printing, lamination, mobile-bag use, and workstation use without adjacent pages.

## Controlled drafting gates

1. Owner approves and locks the detailed TOC.
2. Source inventory and traceability are refreshed against the intended certified baseline.
3. Draft chapter text and vector diagram storyboards are reviewed before media capture.
4. Screenshots are captured only from safe synthetic states.
5. Legal/notarial source wording receives current authoritative review.
6. Editorial, operational, security, and owner acceptance reviews pass.
7. DOCX/PDF are generated reproducibly and visually verified before release.
