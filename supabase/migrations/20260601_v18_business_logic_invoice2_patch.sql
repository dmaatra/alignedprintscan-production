-- Aligned Print & Scan v18 — Business logic, pricing, quote expiration, and Invoice #2 support.
-- Run once in Supabase SQL Editor before deploying the functions in this patch.

alter table if exists service_requests add column if not exists detected_pdf_page_count integer;
alter table if exists service_requests add column if not exists is_same_day_request boolean default false;
alter table if exists service_requests add column if not exists is_next_day_request boolean default false;
alter table if exists service_requests add column if not exists quote_expires_at timestamptz;
alter table if exists service_requests add column if not exists payment_submitted_at timestamptz;

alter table if exists request_files add column if not exists detected_page_count integer;

alter table if exists print_scan_requests add column if not exists copy_pages integer default 0;
alter table if exists print_scan_requests add column if not exists courier_requested boolean default false;
alter table if exists print_scan_requests add column if not exists mobile_document_service_requested boolean default false;
alter table if exists print_scan_requests add column if not exists courier_fee numeric default 0;
alter table if exists print_scan_requests add column if not exists mobile_document_service_fee numeric default 0;

alter table if exists mobile_notary_requests add column if not exists scan_to_pdf_needed boolean default false;

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  service_request_id uuid references service_requests(id) on delete cascade,
  invoice_number text,
  invoice_type text default 'main',
  status text default 'draft',
  amount_due numeric default 0,
  amount_paid numeric default 0,
  paid_amount numeric default 0,
  paid_at timestamptz,
  due_at timestamptz,
  note text,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text
);

alter table if exists invoice_items add column if not exists invoice_id uuid references invoices(id) on delete cascade;

alter table invoices enable row level security;

drop policy if exists "public read invoices" on invoices;
create policy "public read invoices" on invoices for select using (true);

drop policy if exists "admin invoice access" on invoices;
create policy "admin invoice access" on invoices for all to authenticated using (true) with check (true);

create index if not exists idx_invoices_service_request_created on invoices(service_request_id, created_at desc);
create index if not exists idx_invoice_items_invoice_id on invoice_items(invoice_id);
