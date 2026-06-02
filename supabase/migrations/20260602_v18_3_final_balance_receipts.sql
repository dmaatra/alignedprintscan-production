-- Aligned Print & Scan v18.3 — Final balance invoice + receipt support.
-- Run once before deploying the v18.3 Edge Functions.

alter table if exists invoices add column if not exists receipt_url text;
alter table if exists invoices add column if not exists receipt_pdf_url text;
alter table if exists invoices add column if not exists amount_paid numeric default 0;
alter table if exists invoices add column if not exists paid_amount numeric default 0;
alter table if exists invoices add column if not exists paid_at timestamptz;
alter table if exists invoices add column if not exists invoice_type text default 'main';
alter table if exists invoices add column if not exists note text;

alter table if exists service_requests add column if not exists receipt_url text;
alter table if exists service_requests add column if not exists receipt_pdf_url text;
alter table if exists service_requests add column if not exists payment_submitted_at timestamptz;

alter table if exists invoice_items add column if not exists invoice_id uuid references invoices(id) on delete cascade;
alter table if exists invoice_items add column if not exists sort_order integer default 0;

create index if not exists idx_invoices_service_request_id on invoices(service_request_id);
create index if not exists idx_invoice_items_invoice_id on invoice_items(invoice_id);
