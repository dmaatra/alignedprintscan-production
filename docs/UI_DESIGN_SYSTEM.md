# APS UI Design System

> Status: Draft for owner review. This document records the current interface and proposes a unified standard; it does not authorize or implement a redesign.

## Purpose and evidence

This document is the proposed single source of truth for the Aligned Print & Scan (APS) interface. APS is a static multi-page HTML/CSS/vanilla JavaScript application with Supabase as its backend.

The audit covered every root HTML page, the active public stylesheet (`assets/css/styles.css`), the active admin stylesheet (`assets/css/admin-v3.css`), generated customer/admin markup in JavaScript, and existing repository documentation. Public pages and the admin login were rendered at 1440 × 1000 and 390 × 844. The dashboard redirects to the login page without an authenticated Supabase session, so dashboard findings are confirmed from its HTML/CSS/JavaScript rather than an authenticated live render.

Labels used below:

- **EXISTS:** the proposed pattern already exists consistently enough to reuse.
- **PARTIAL:** a recognizable pattern exists, but implementations differ.
- **MISSING:** no shared pattern or token exists.
- **DIFFERENCE:** the current deviation that should be reconciled during a separately approved implementation.
- **STANDARD:** the recommendation.

## Audit inventory

| Surface | Pages inspected | Current stylesheet/system | Principal findings |
|---|---|---|---|
| Marketing | `index.html`, `remote-online-notary.html`, `mobile-notary.html`, `print-scan.html` | `styles.css` | Shared header, footer, hero, cards, serif headings, sans-serif body and responsive stacking are consistent. Card radii, internal spacing, image radii and CTA variants are not tokenized. |
| Pricing and intake | `pricing.html` | `styles.css` plus generated wizard/estimate UI | Base type and navigation match marketing. Wizard cards, option cards, estimates, notices and controls add parallel radius, spacing and status patterns. |
| Customer status portal | `success.html` | `styles.css` plus generated portal UI | Base shell matches public pages. Status panels, invoices, timeline, action panels, tables and pills use many locally defined values rather than shared components. |
| Support | `support.html` | `styles.css` | Shared shell; form controls differ from pricing in font weight and component-specific rules. |
| Information/legal | `faq.html`, `privacy.html`, `terms.html`, `accessibility.html` | `styles.css` | Shared shell. Policy `h2` renders at 32px while general desktop section `h2` renders at 57.6px; this is appropriate hierarchy but is implicit rather than named. |
| Admin authentication | `admin-login.html` | `styles.css` | Reuses public display scale; the form button inherits the browser's Arial because native `button` does not globally inherit typography. Horizontal overflow occurs at 390px. |
| Admin operations | `admin-dashboard.html` | `styles.css` + `admin-v3.css` | Separate compact application language is intentional, but font sizes reach 0.53–0.62rem, controls/radii differ from public components, and navigation uses text/Unicode symbols as icons. Live dashboard rendering requires authentication. |

## Page-by-page inconsistency register

| Page | Confirmed inconsistencies |
|---|---|
| `index.html` | Desktop `h1` reaches 86.4px and `h2` 57.6px; mobile drops to 42.4px/32px. CTA, service-card, image-frame, hero-card, trust-item and pill styles use several radii and spacing values without a component scale. |
| `remote-online-notary.html` | Consistent public shell and responsive type; content cards inherit the same unstandardized public card/radius variants. |
| `mobile-notary.html` | Consistent public shell; four service cards use generic card treatment but no documented density or equal-height rule. |
| `print-scan.html` | Consistent public shell; split/image pattern and list spacing are locally expressed rather than layout tokens. |
| `pricing.html` | Public controls render at 16px, 14px radius and 13px × 14px padding, while option cards, upload boxes, estimate panels and wizard steps introduce separate 14–30px radii and several spacing scales. Validation/status colors are not centralized. |
| `success.html` | Portal controls may render at 14.08px/700 and 12px radius, unlike pricing controls. Invoice tables, receipt panels, workflow pills, customer-action cards and alerts duplicate visual primitives. |
| `support.html` | The first form control renders at 14.08px/800, unlike the 16px/400 pricing control. It otherwise shares the public shell. |
| `faq.html` | FAQ disclosure styling is page-specific; no shared disclosure/focus standard is documented. |
| `privacy.html` | Policy `h2` is 32px on desktop, versus the default 57.6px section heading; the useful compact policy scale is unnamed. |
| `terms.html` | Same implicit policy typography difference as Privacy. |
| `accessibility.html` | Same implicit policy typography difference as Privacy; the statement does not establish a repository-wide conformance target. |
| `admin-login.html` | Native button typography is Arial 13.33px rather than Montserrat. The page horizontally overflows at 390px. Its public-sized 86.4px desktop heading is disproportionate for an authentication card. |
| `admin-dashboard.html` | Sidebar labels and metadata use 0.53–0.75rem type; public body starts at 1rem. Sidebar, top bar, request rail and workspace have separate dimensions/radii. Multiple Unicode icons have inconsistent visual weight. Tabs, badges, tables, controls, toasts and module cards each have local rules. Dashboard could not be directly rendered without an authenticated session. |

## Cross-interface findings

- **Typography:** Playfair Display and Montserrat are consistent brand families, but native admin-login buttons fall back to Arial. Public text includes many one-off sizes from 0.68rem to 2.4rem plus fluid headings; admin uses another dense scale down to 0.53rem.
- **Weights:** CSS uses 600, 700, 800 and 900 heavily. Labels and small controls frequently use 800/900, reducing hierarchy and readability.
- **Spacing:** common values exist, especially 8, 10, 12, 14, 16, 18, 22, 24 and 28px, but there is no declared spacing scale. Equivalent cards use different padding.
- **Radius:** the public stylesheet contains at least 12, 14, 16, 18, 20, 22, 24, 26, 28, 30 and 34px plus 999px; admin adds 5, 7, 8, 9, 10, 12, 14 and 16px. Shape is therefore contextual rather than systematic.
- **Color:** core navy/gold/cream values are duplicated under `--blue` and `--aps-*`. Numerous raw grays, reds, greens, ambers and alpha variants bypass tokens.
- **Buttons:** public `.btn` styles do not normalize `font-family`; admin has a separate button family. Height, padding, radius, casing, icon treatment, disabled states and focus behavior vary.
- **Cards:** rounded light surfaces are a shared visual language, but cards range from 14px to 34px radius and 12px to 40px padding.
- **Forms:** labels, required attributes and native controls exist. Control typography, label weight, help/error placement and compound/select/upload treatments differ by page.
- **Tables:** customer invoice/receipt tables and admin operations tables have separate density, header and mobile behavior with no shared contract.
- **Navigation:** public navigation is shared and becomes a menu at 900px. Admin has a fixed sidebar/top bar and separate breakpoints at 1180, 900, 760 and 680px. Breakpoint vocabulary is fragmented across both stylesheets.
- **Badges/status:** pill shapes are common, but `.badge`, `.pill`, service tags, request states, invoice states and admin status badges do not share semantic tokens.
- **Alerts:** form status, email notice, portal notice, admin toast, empty state and error/warning panels use overlapping but independently styled semantics.
- **Headers/footers:** public header/footer markup is duplicated across pages and visually consistent. Admin intentionally has no public footer and uses application chrome. Duplication creates future drift risk.
- **Responsive behavior:** public pages tested without horizontal overflow at 390px. Admin login did overflow. Dashboard CSS supports collapsing sidebar/request rail, but authenticated rendering still needs verification. The stylesheet contains many breakpoint values (600, 640, 680, 720, 760, 768, 900, 1050, 1100 and 1180px).

## 1. Typography scale

**EXISTS:** Playfair Display is the display family; Montserrat with system fallbacks is the body/UI family. Public fluid `h1`–`h3` rules and 16px body copy already establish a sound base.

**DIFFERENCE:** policy headings, portal headings, admin headings and microcopy use unnamed parallel scales. Admin type below 12px and widespread 800/900 weights impair legibility. Native buttons are not universally assigned the UI family.

**STANDARD:**

| Token | Size/line height | Weight | Use |
|---|---:|---:|---|
| `display-xl` | `clamp(2.65rem, 6vw, 5.4rem)` / 1.08 | 700 | Marketing hero only |
| `display-lg` | `clamp(2rem, 4vw, 3.6rem)` / 1.08 | 700 | Major public section heading |
| `display-md` | `clamp(1.75rem, 3vw, 2.5rem)` / 1.12 | 700 | Page/application heading |
| `heading-lg` | 2rem / 1.2 | 700 | Policy and prominent card headings |
| `heading-md` | 1.5rem / 1.25 | 700 | Card/module headings |
| `heading-sm` | 1.125rem / 1.35 | 700 | Subsections |
| `body-lg` | 1.125rem / 1.65 | 400 | Leads |
| `body-md` | 1rem / 1.6 | 400 | Default copy and controls |
| `body-sm` | 0.875rem / 1.5 | 400 or 600 | Secondary copy |
| `label` | 0.8125rem / 1.4 | 600 | Labels and table headers |
| `caption` | 0.75rem / 1.4 | 600 | Metadata; minimum routine UI size |

Use Playfair Display only for display/heading tokens. Use Montserrat for all controls, labels, navigation and data. Reserve 800/900 for rare emphasis or compact numeric badges; never use it as the default form-label weight.

## 2. Color palette

**EXISTS:** The canonical APS Version 1 brand colors are present in the current interface. Admin also declares success, warning and danger colors.

**DIFFERENCE:** equivalent colors have duplicate variable names; raw values such as `#555`, `#666`, `#5b5a61`, `#6b6d78`, `#fff1f0` and many alpha blends are embedded in component rules.

**STANDARD:** use these official Version 1 APS design tokens:

| Token | Value | Use |
|---|---|---|
| `brand-navy-primary` | `#161c4d` | Primary navigation, headers, primary buttons, primary branding, major section titles |
| `brand-navy-secondary` | `#0d133c` | Secondary navigation, hover states, section emphasis, supporting UI |
| `brand-dark-accent` | `#101744` | Footer, high-contrast areas, overlays, administrative emphasis |
| `brand-gold-primary` | `#c8a96b` | Primary accents, highlights, active indicators, important actions |
| `brand-gold-secondary` | `#e8d28d` | Hover accents, secondary highlights, decorative emphasis |
| `surface-cream-1` | `#f3eee4` | Page backgrounds, cards, content sections, forms |
| `surface-cream-2` | `#f6f3ee` | Page backgrounds, cards, content sections, forms |
| `surface-cream-3` | `#f8f0d7` | Page backgrounds, cards, content sections, forms |
| `surface-white` | `#ffffff` | Controls/data surfaces |
| `text-primary` | `#171a2e` | Primary text |
| `text-muted` | `#6b6d78` | Secondary text |
| `border-default` | `#e4e0d8` | Neutral border |
| `status-success` | `#2f8f5b` | Positive/completed |
| `status-warning` | `#a46b00` | Attention/pending |
| `status-danger` | `#b33a3a` | Error/destructive/failed |

Legacy Navy `#030431` and Legacy Gold `#d7b458` remain approved for historical brand assets and existing APS logos, but they are not default UI colors for new interface development. Future UI work must reuse the Version 1 tokens rather than introduce additional primary colors without owner approval.

Every foreground/background combination must pass the approved accessibility contrast target before implementation. Gold should not be used for small text on white/cream without a verified darker text treatment.

## 3. Button standards

**PARTIAL:** public primary, secondary and dark buttons and admin gold, navy and outline buttons already express a hierarchy.

**DIFFERENCE:** public and admin implementations use different radii, padding, minimum heights, focus states and font inheritance. Icon-only controls and mobile menu buttons are not normalized.

**STANDARD:** `primary` (gold), `secondary` (navy), `outline`, `ghost`, and `danger` variants; `sm`, `md`, and `lg` sizes. Default minimum height 44px, 14px radius for application controls, full pill only for marketing CTAs. All buttons inherit Montserrat, use weight 700, expose visible hover/focus/disabled/loading states, and keep text labels for consequential actions. Icon-only buttons require an accessible name and 44 × 44px touch target.

## 4. Card standards

**PARTIAL:** cards consistently use light surfaces, borders, rounded corners and restrained shadows.

**DIFFERENCE:** radius spans 14–34px and padding spans 12–40px; interactive and static cards are not visually distinguished.

**STANDARD:** three card types: `content` (24px radius, 24px padding), `application` (14px radius, 16–20px padding), and `featured` (24px radius, 28–32px padding plus approved shadow). Interactive cards must have hover and focus-visible states; static cards must not imply clickability. Nested cards step down one radius/spacing level.

## 5. Form standards

**PARTIAL:** forms use labels, native inputs, required attributes and live status regions. Public controls commonly use 14px radius and approximately 13px vertical padding.

**DIFFERENCE:** pricing controls render at 16px/400, support at approximately 14px/800, and portal controls at approximately 14px/700. Help text, validation, uploads and grouped options use separate patterns.

**STANDARD:** visible label above every control; 16px input text (also prevents mobile browser zoom), 44px minimum height, 12px radius, 12px × 14px padding. Labels use `label`; help/error text uses `caption`. Keep descriptions, errors and requirements adjacent to the field and connect them with `aria-describedby`. Use one error, warning, success and disabled treatment. Field groups require `fieldset`/`legend` where choices share a question.

## 6. Table standards

**PARTIAL:** invoice and admin operational tables exist with headers, rows and numeric data.

**DIFFERENCE:** density, header treatment, borders, numeric alignment, action placement and small-screen behavior differ.

**STANDARD:** use a shared data-table shell with 44px minimum rows, `label` headers, 14–16px cells, left-aligned text and right-aligned currency/quantities. Use `scope="col"`/`scope="row"`, a caption or accessible name, clear hover/focus only when rows are interactive, and an explicit empty/loading/error state. On narrow screens, choose one documented behavior per table: horizontal scroll with a visible affordance, or labeled stacked rows—never silent clipping.

## 7. Badge standards

**PARTIAL:** pills, service tags and status badges are common.

**DIFFERENCE:** badge radius, padding, uppercase use, weight and colors vary, and decorative credentials use the same shape as operational status.

**STANDARD:** separate `tag` (classification), `status` (state), and `count` (numeric) components. Use 999px radius, 0.75–0.8125rem text, weight 600/700, 6px × 10px padding. Status badges must include readable text and may not communicate meaning by color alone.

## 8. Status color rules

**PARTIAL:** admin variables define success/warning/danger; customer portal has red, amber and green panels.

**DIFFERENCE:** request, invoice, payment, support and form statuses are styled through multiple selectors and raw colors. Similar pending states may appear gold, cream or navy.

**STANDARD:**

| Semantic state | Color | Applies to |
|---|---|---|
| Neutral | navy/neutral gray | draft, informational or not-started state |
| Informational | navy with light navy tint | reviewed/available state without urgency |
| Pending/attention | warning amber | awaiting customer/admin action, scheduled attention |
| Success | success green | paid, confirmed, completed or successful submission |
| Danger | danger red | failed, expired, declined, cancelled or destructive action |

Business statuses remain exactly those defined by application/database rules; this table maps presentation only. Every status includes a text label and, where useful, an icon—not color alone.

## 9. Layout spacing system

**PARTIAL:** 8–28px values recur, and public containers consistently use `min(1160px, 92vw)` or `min(900px, 92vw)`.

**DIFFERENCE:** spacing uses overlapping px/rem values and one-offs; public section padding, application density and card interiors lack named tiers.

**STANDARD:** a 4px base scale: `0, 4, 8, 12, 16, 24, 32, 48, 64, 96`. Use 16px mobile gutters, 24px tablet gutters and 32px desktop gutters; retain 1160px standard and 900px reading widths. Public sections use 64px mobile/96px desktop; application panels use 16–24px. Exceptions require a named component token, not an arbitrary value.

## 10. Icon usage

**PARTIAL:** public pages use restrained image/logo marks; admin uses Unicode symbols in navigation, search, notifications, messages, refresh and menu controls.

**DIFFERENCE:** Unicode glyphs render with platform-dependent weight and alignment. Admin navigation icons are decorative but occupy a fixed column; social links use text abbreviations.

**STANDARD:** do not use decorative icons in the admin left navigation; preserve labels and spacing. For functional icons elsewhere, use one approved SVG set at 16, 20 or 24px with consistent 1.5–2px stroke. Decorative icons use `aria-hidden="true"`; icon-only controls require an accessible name and tooltip where meaning is not universal. Do not mix emoji, Unicode symbols and SVG icons in one control system.

## Logo Standards

**EXISTS:** Official full/long, symbol/short, favicon, and icon assets are present under `assets/images/` and are the authoritative APS logo files.

**DIFFERENCE:** Version 1 does not yet define a complete size matrix or measured clear-space system.

**STANDARD:**

- Always reuse official APS logo files.
- Never recreate, redraw, recolor, simplify, stretch, distort, substitute, or regenerate an APS logo.
- Preserve the original aspect ratio.
- Use the long logo wherever horizontal space permits.
- Use the short logo where space is constrained.
- Use favicon/icon assets only in contexts appropriate to those assets.
- Future versions may add detailed sizing and clear-space rules without changing these protections.

## 11. Navigation standards

**PARTIAL:** all public pages share the same sticky header/nav/footer pattern. Admin has a clear sidebar, top bar and workspace tabs.

**DIFFERENCE:** public shared markup is duplicated per page; active-page indication is not consistently visible. Admin uses decorative left-nav icons, multiple nav label sizes and several breakpoint behaviors.

**STANDARD:** public navigation keeps logo, core links and one primary CTA, with a visible active state and keyboard-operable mobile disclosure. Admin navigation is label-first, icon-free in the left rail, groups destinations with consistent 12px group labels and 14px links, and preserves a clear active marker. Tabs use one row when possible and documented horizontal scrolling on narrow widths. Focus order must follow visual order.

## 12. Dashboard standards

**PARTIAL:** the admin v3 structure already defines fixed application chrome, request rail, workspace header, tabs, modules, badges, buttons, tables and toast feedback.

**DIFFERENCE:** microtype is smaller than the proposed minimum; the dashboard has its own radius/spacing vocabulary; generated legacy sections are moved into tabs; authentication prevented direct rendered verification in this audit.

**STANDARD:** retain the three-part operations model—navigation, request queue, active workspace. Use application typography, 14px panel radius, 16–24px panel padding and 44px interactive rows. Keep primary actions in the workspace header, one semantic status badge beside the request title, and tabs in workflow order. Every module must define loading, empty, error and success states. Any visual reorganization must preserve existing IDs, handlers and data behavior unless separately approved.

## 13. Customer Portal standards

**PARTIAL:** the portal uses the public brand shell and service-aware status, quote, invoice, appointment, support and action panels.

**DIFFERENCE:** each workflow state creates bespoke pills/cards/notices, and controls differ from intake/support. Dense financial content has separate print/mobile rules.

**STANDARD:** retain the public typography and color language with application-scale headings. Present, in order: request identity/status, current required action, financial/service summary, contextual detail, history/support. Use shared form, alert, badge, card and table components. Financial state must be explicit in text; receipt/payment actions must remain distinguishable. Print output may simplify chrome but must preserve labels, totals and APS reference.

## 14. Mobile standards

**PARTIAL:** public navigation collapses at 900px, content grids stack, headings scale down, and all public pages tested without horizontal overflow at 390px.

**DIFFERENCE:** at least ten breakpoint values are used across stylesheets. Admin login overflows at 390px. Dashboard mobile behavior is present in CSS but was not authenticated-render tested.

**STANDARD:** design and test at 320, 390, 768, 1024 and 1440px, using content-driven breakpoints from a reduced set (`640`, `900`, `1180px`) unless a component documents an exception. No page-level horizontal overflow. Use 16px gutters, 44px targets, readable 16px inputs, stacked primary actions and explicit scrolling for tabs/tables. Mobile menus must trap neither focus nor page scrolling and must close predictably. Verify both portrait and landscape for the dashboard.

## 15. Accessibility standards

**PARTIAL:** semantic headings, labels, required fields, native controls, live regions, reduced-motion handling and a public accessibility statement exist.

**DIFFERENCE:** no formal WCAG target or browser/device matrix is documented. Focus-visible styling is not a unified component rule; Unicode icons, very small admin text, color-dependent states and the admin-login overflow require attention.

**STANDARD:** owner must approve a formal conformance target; until then, new UI should be designed and tested against WCAG 2.2 AA as the engineering baseline. Require keyboard access, visible focus, logical heading/focus order, programmatic names/descriptions, text alternatives, semantic tables/forms, reduced-motion support, 200% zoom resilience, 320px reflow, 44px targets, non-color status cues and contrast verification. Automated checks supplement—not replace—keyboard and screen-reader review.

## Component governance

1. This document defines design intent; current CSS remains the implementation truth until an approved migration.
2. Prefer semantic tokens over raw values and shared primitives over page-specific selectors.
3. New variants require a documented use case, responsive behavior and accessibility states.
4. Do not change business workflow, labels, pricing, status logic or data behavior as part of visual normalization.
5. Review all 13 HTML entry pages plus generated customer/admin states before accepting a design-system implementation.
6. Keep a visual regression checklist for desktop, tablet, mobile and print surfaces.

## Intentionally deferred design decisions

The governance documentation is frozen for Version 1. The following refinements are not implementation blockers and remain deferred unless implementation is blocked, a legal requirement arises, or the owner requests more documentation:

- Formal accessibility-conformance target and full browser/device matrix.
- Final SVG icon set beyond the icon-free admin left navigation rule.
- Whether public header/footer duplication should be reduced without introducing a build system.
- Final dashboard density after authenticated visual testing.
- Detailed logo sizing, clear-space, and placement measurements.
