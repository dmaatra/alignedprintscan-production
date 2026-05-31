-- Final workflow additions for payments, support, receipts, and admin progress.
-- Run this in Supabase SQL Editor before deploying the final Edge Functions.
alter table if exists service_requests add column if not exists paid_amount numeric;
alter table if exists service_requests add column if not exists stripe_checkout_session_id text;
alter table if exists service_requests add column if not exists stripe_payment_intent_id text;
alter table if exists service_requests add column if not exists receipt_url text;
alter table if exists service_requests add column if not exists receipt_pdf_url text;
alter table if exists service_requests add column if not exists invoice_pdf_url text;
alter table if exists service_requests add column if not exists ron_session_url text;
alter table if exists service_requests add column if not exists archived_at timestamptz;
alter table if exists service_requests add column if not exists appointment_confirmed_at timestamptz;
alter table if exists service_requests add column if not exists invoice_status text;
alter table if exists service_requests add column if not exists payment_status text;

alter table if exists support_tickets add column if not exists phone text;
alter table if exists support_tickets add column if not exists preferred_contact_method text;
alter table if exists support_tickets add column if not exists issue_type text;
alter table if exists support_tickets add column if not exists urgency text default 'standard';
alter table if exists support_tickets add column if not exists internal_notes text;
alter table if exists support_tickets add column if not exists archived_at timestamptz;
alter table if exists support_tickets add column if not exists related_to_request boolean default false;

alter table if exists ron_requests add column if not exists session_link text;
alter table if exists ron_requests add column if not exists appointment_status text;

create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid references service_requests(id) on delete cascade,
  item_type text default 'service',
  description text not null,
  quantity numeric default 1,
  unit_price numeric default 0,
  line_total numeric default 0,
  taxable boolean default false,
  created_at timestamptz default now()
);

create table if not exists request_status_updates (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid references service_requests(id) on delete cascade,
  status text not null,
  message text,
  sent_email boolean default false,
  sent_sms boolean default false,
  created_at timestamptz default now()
);

alter table invoice_items enable row level security;
alter table request_status_updates enable row level security;

drop policy if exists "public read invoice items" on invoice_items;
create policy "public read invoice items" on invoice_items for select using (true);

drop policy if exists "public read status updates" on request_status_updates;
create policy "public read status updates" on request_status_updates for select using (true);
