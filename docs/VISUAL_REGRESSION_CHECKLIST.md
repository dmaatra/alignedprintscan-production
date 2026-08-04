# APS Visual Regression Checklist

Use this checklist during the approved APS Design System & Visual Consistency Pass. Mark a review only after inspecting the rendered surface at that viewport and confirming keyboard/focus behavior for the accessibility column.

Legend: `[ ]` pending · `[x]` complete · `[—]` outside the current pass

## Public pages

| Surface | Desktop Review | Tablet Review | Mobile Review | Accessibility Review | Complete |
|---|---|---|---|---|---|
| Home (`index.html`) | [x] | [x] | [x] | [x] | [x] |
| Mobile Notary (`mobile-notary.html`) | [x] | [x] | [x] | [x] | [x] |
| Remote Online Notary (`remote-online-notary.html`) | [x] | [x] | [x] | [x] | [x] |
| Print & Scan (`print-scan.html`) | [x] | [x] | [x] | [x] | [x] |
| Pricing (`pricing.html`) | [x] | [x] | [x] | [x] | [x] |
| Support (`support.html`) | [x] | [x] | [x] | [x] | [x] |
| FAQ (`faq.html`) | [x] | [x] | [x] | [x] | [x] |
| Privacy (`privacy.html`) | [x] | [x] | [x] | [x] | [x] |
| Terms (`terms.html`) | [x] | [x] | [x] | [x] | [x] |
| Accessibility (`accessibility.html`) | [x] | [x] | [x] | [x] | [x] |

## Authentication

| Surface | Desktop Review | Tablet Review | Mobile Review | Accessibility Review | Complete |
|---|---|---|---|---|---|
| Admin Login (`admin-login.html`) | [x] | [x] | [x] | [x] | [x] |

## Admin

| Surface | Desktop Review | Tablet Review | Mobile Review | Accessibility Review | Complete |
|---|---|---|---|---|---|
| Dashboard shell | [x] | [x] | [x] | [x] | [x] |
| Request Workspace | [x] | [x] | [x] | [x] | [x] |
| Requests module | [x] | [x] | [x] | [x] | [x] |
| Calendar module | [x] | [x] | [x] | [x] | [x] |
| RON Sessions module | [x] | [x] | [x] | [x] | [x] |
| Invoices module | [x] | [x] | [x] | [x] | [x] |
| Payments module | [x] | [x] | [x] | [x] | [x] |
| Customers module | [x] | [x] | [x] | [x] | [x] |
| Documents module | [x] | [x] | [x] | [x] | [x] |
| Templates module | [x] | [x] | [x] | [x] | [x] |
| Support Tickets module | [x] | [x] | [x] | [x] | [x] |
| Settings module | [x] | [x] | [x] | [x] | [x] |

Admin review note: authenticated request selection, all current workspace tabs, populated records, module navigation, invoice and payment tables, the current New Request form, empty states, responsive layout, and accessibility presentation were reviewed at 1440px, 1180px, 900px, 768px, 390px, and 320px. No production records were created for QA.

## Pass tracking

| Pass | Scope | Status | Notes |
|---|---|---|---|
| Pass 1 | Design foundations | Complete | Canonical tokens and shared typography, spacing, button, card, form, badge, alert, table, and focus foundations added. Page-level reviews remain pending. |
| Pass 2 | Shared public shell, service pages, Admin Login | Complete | Verified at 1440px desktop, 768px tablet, 390px mobile, and 320px mobile. Shared mobile navigation, visible focus, logo aspect ratio, and Admin Login reflow reviewed. |
| Pass 3 | Pricing, Support, FAQ, legal pages | Complete | Verified at 1440px desktop, 768px tablet, 390px mobile, and 320px mobile, plus 720px CSS-width reflow as a 200% zoom equivalent. Pricing paths, labels, controls, disclosures, policy readability, focus states, and inherited shared-page smoke tests reviewed. |
| Pass 4 | Admin Dashboard normalization | Complete; authenticated exceptions closed in Pass 5 | Pass 4 completed static shell and responsive presentation. Pass 5 subsequently completed the authenticated and populated-state review. |
| Pass 5 | Responsive polish, accessibility, print, regression, visual QA | Complete | Final public, authentication, authenticated admin, populated customer-portal smoke, 200% reflow, landscape tablet, accessibility, shared-style, and print-style reviews completed. |

## Excluded milestone

The Customer Portal (`success.html`) is excluded from redesign in this consistency pass. A populated read-only smoke test was completed at 1440px, 1180px, 900px, 768px, 390px, and 320px with no page-level overflow, hidden required actions, or inherited structural damage observed. Its dedicated redesign and full workflow milestone remain separate.
