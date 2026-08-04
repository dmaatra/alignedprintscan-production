# Phase 4.1 Milestone 1 Audit

Audit date: 2026-08-03
Scope: Local repository only
Result: Approved by the project owner as an accurate assessment of the repository

No application code, migrations, Edge Functions, configuration, or deployment state was changed during this audit.

## Status summary

| # | Requirement | Status | Responsible code | Actual behavior |
|---|---|---|---|---|
| 1 | Search by APS reference, customer name, email, phone, service type, status, and invoice number | **PARTIALLY IMPLEMENTED** | `filterVisibleRequestCards()` in `assets/js/admin-v3.js`; `renderRequestList()` and `loadRequests()` in `assets/js/admin.js` | Search matches text rendered in request cards. APS reference, customer name, service, status, date, urgency, and archive state are searchable. Email, phone, and invoice number are not rendered in the card and are therefore not searchable. |
| 2 | Notes tab directly next to Payments | **MISSING** | Workspace tab markup in `admin-dashboard.html` | Notes is the last tab, after Timeline. Appointment follows Payments. |
| 3 | Remove left-navigation icons while preserving labels and spacing | **MISSING** | Navigation markup in `admin-dashboard.html`; navigation grid in `assets/css/admin-v3.css` | Icon spans remain in every navigation link, and CSS reserves and styles an icon column. |
| 4 | Rename New Request to New Order | **MISSING** | Header markup in `admin-dashboard.html`; `moduleTitles` and order form text in `assets/js/admin-v3.js` | The header, module title, and submission action still use “New Request” or “Create Request.” |
| 5 | Remove the two buttons immediately right of New Order | **MISSING** | Header markup in `admin-dashboard.html` | Notification and message icon buttons remain and have no functional handlers. |
| 6 | New Order opens a functional administrator order-entry wizard | **PARTIALLY IMPLEMENTED** | `renderNewRequest()`, `createAdminRequest()`, and `showAdminView()` in `assets/js/admin-v3.js` | A working single-page form inserts a customer and basic service request. It is not a wizard and does not create service-specific intake details, pricing, documents, fulfillment choices, or invoices. |
| 7 | Customer tab shows identity/contact first and separates service intake data | **BROKEN** | `selectRequest()` in `assets/js/admin.js`; `tabForNode()` and `organizeRequestDetail()` in `assets/js/admin-v3.js` | Identity/contact information remains in the Overview grid. The Customer tab receives only the Service Details section. |
| 8 | Archive the active client note only after all required invoices are paid, preserving history, author, and timestamp | **BROKEN** | `archive_paid_invoice_client_note()` in `supabase/migrations/20260725050000_phase_4_1_m1_client_note_archive.sql` | Any single invoice entering a recognized paid state archives and clears the note. Sibling invoices are not checked. Archive time is stored, but author and original note timestamp are not. |
| 9 | Display archived client-facing notes in Notes | **MISSING** | `tabForNode()` in `assets/js/admin-v3.js`; `selectRequest()` in `assets/js/admin.js` | The Notes tab receives the Status Update section. No application code queries or renders `request_customer_note_history`. |

## Requirement findings

### 1. Request search

**PARTIALLY IMPLEMENTED — CONFIRMED IN CODE**

Both search inputs call `filterVisibleRequestCards()`, which compares the normalized term with each rendered `.request-row` element's `textContent`. The rendered row includes the APS reference, customer name, creation date, service label, status, urgency, and archive badge. Although `loadRequests()` selects customer email, phone, and the request-level `invoice_number`, these values are not part of the row text. Additional invoice numbers from the `invoices` table are not loaded into the queue.

The Phase 4.1 changelog accurately says the search selector was corrected to target `.request-row`, but it does not establish the required field coverage.

Database dependency: complete invoice-number search requires invoice records to be loaded or searched in addition to the request-level invoice field.

### 2. Notes placement

**MISSING — CONFIRMED IN CODE**

`admin-dashboard.html` orders the tabs as Overview, Customer, Documents, Payments, Appointment, RON Session, Communication, Timeline, and Notes. Notes is not directly next to Payments.

The changelog does not claim this requirement was completed. Frontend deployment is the only operational dependency.

### 3. Navigation icons

**MISSING — CONFIRMED IN CODE**

Each left-navigation link contains an icon-like first `span`. The navigation CSS defines a three-column grid with a 20-pixel first column and styles the first span as an icon. Labels and spacing therefore have not been converted to an icon-free layout.

The changelog does not claim this requirement was completed. Frontend deployment is the only operational dependency.

### 4. New Order label

**MISSING — CONFIRMED IN CODE**

The header says “New Request,” the module metadata says “New Request,” and the submission action says “Create Request.”

The changelog does not claim the rename. Frontend deployment is the only operational dependency.

### 5. Header action removal

**MISSING — CONFIRMED IN CODE**

The notification and message buttons remain immediately to the right of the request-creation button. No event handlers provide functionality for them.

The changelog does not claim their removal. Frontend deployment is the only operational dependency.

### 6. Administrator order-entry wizard

**PARTIALLY IMPLEMENTED — CONFIRMED IN CODE**

The Phase 4.1 form is operational in a narrow sense: it inserts a new `customers` row, inserts a basic `service_requests` row, reloads the queue, and opens the new request. It is a single form rather than a multi-step wizard. It always inserts a new customer, does not create a `ron_requests`, `mobile_notary_requests`, or `print_scan_requests` record, and omits service-specific intake, pricing, fulfillment, documents, and invoice setup. The customer and service-request inserts are separate, so a request-insert failure can leave an orphan customer record.

The changelog accurately describes an administrator-created request form and the two basic inserts, but that is narrower than a functional administrator order-entry wizard.

Database dependency: a complete and atomic workflow likely requires an authenticated Edge Function or database RPC plus appropriate RLS for customer, request, and service-detail records.

### 7. Customer tab organization

**BROKEN — CONFIRMED IN CODE**

`selectRequest()` renders identity/contact, service, status, and page count in one summary grid. `organizeRequestDetail()` assigns that complete first grid to Overview and maps the later “Service Details” section to Customer. As a result, the Customer tab begins with service-specific data and does not contain the customer identity/contact block.

The changelog does not claim this reorganization. No database change is required if the current customer and service-detail queries remain sufficient.

### 8. Client-facing note archive lifecycle

**BROKEN — CONFIRMED IN CODE**

The trigger is row-level and runs after an update to an individual invoice's `status` or `payment_status`. It tests only the old and new values for that invoice. It never queries other invoices for the same `service_request_id`, never checks an order-level remaining balance, and never identifies whether another required invoice is unpaid.

Therefore, the trigger archives a note when **any single invoice becomes paid**, not only after all required invoices for the order are paid.

Additional findings:

- `archived_at` captures the archive event time, not the original note timestamp.
- The history table has no author or original-author field.
- `coalesce(customer_message, quote_notes)` records only one value if the fields differ.
- Both active fields are cleared after the archive.
- The trigger fires on updates, not on an invoice initially inserted as paid.
- The history RLS policy gives every authenticated user full access and does not verify an administrator role.

The migration is omitted from the changelog's changed-file list, and this behavior is not documented there. Deployment dependency: the migration must be applied to Supabase to exist remotely; deployment status was not inspected.

### 9. Archived notes display

**MISSING — CONFIRMED IN CODE**

No frontend code or Edge Function references `request_customer_note_history`. The Notes tab contains status update actions, a blank status-note input, and request archive controls because `tabForNode()` maps the “Status Update” section to Notes. It does not show the active client note or archived note history.

The changelog does not claim archived-note display. This feature depends on the history table, suitable admin-only RLS, a query, and frontend rendering.

## Recommended repair plan

1. Build a normalized search index containing APS reference, customer identity/contact, service, status, request invoice number, and all loaded invoice numbers.
2. Place Notes immediately after Payments.
3. Remove navigation icon spans and preserve label alignment with an icon-free CSS grid.
4. Rename all user-facing request-creation strings to New Order and remove the two inert header buttons.
5. Replace the basic form with a stepped customer, service, intake, scheduling, pricing, and review wizard.
6. Use a transactional RPC or authenticated Edge Function so customer, request, and service-detail creation succeeds or fails atomically.
7. Render the Customer tab explicitly with identity/contact first and separated service-specific intake second.
8. Add a forward corrective migration that verifies all required non-void invoices are paid before archiving; preserves author and original timestamp when available; resets active fields atomically; and prevents duplicate archives.
9. Query and render active and archived client-facing notes chronologically in the Notes tab.
10. Test first-of-two paid, final required invoice paid, partial payment, void/cancelled invoice, duplicate webhook, missing metadata, and repeated note cycles.
