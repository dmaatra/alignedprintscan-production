-- Aligned Print & Scan complete email/status workflow fix
-- Run this once in Supabase SQL Editor before redeploying/testing functions.

-- Customer preference shown in admin dashboard and admin emails.
alter table if exists customers
add column if not exists preferred_contact text;

-- Status, quote, payment, receipt, appointment, and review fields used by success page and emails.
alter table if exists service_requests add column if not exists quote_amount numeric;
alter table if exists service_requests add column if not exists quote_notes text;
alter table if exists service_requests add column if not exists invoice_number text;
alter table if exists service_requests add column if not exists invoice_url text;
alter table if exists service_requests add column if not exists invoice_pdf_url text;
alter table if exists service_requests add column if not exists invoice_status text default 'draft';
alter table if exists service_requests add column if not exists invoice_due_at timestamptz;
alter table if exists service_requests add column if not exists receipt_url text;
alter table if exists service_requests add column if not exists receipt_pdf_url text;
alter table if exists service_requests add column if not exists payment_status text default 'unpaid';
alter table if exists service_requests add column if not exists paid_at timestamptz;
alter table if exists service_requests add column if not exists paid_amount numeric;
alter table if exists service_requests add column if not exists stripe_checkout_session_id text;
alter table if exists service_requests add column if not exists stripe_payment_intent_id text;
alter table if exists service_requests add column if not exists stripe_client_secret text;
alter table if exists service_requests add column if not exists payment_link_url text;
alter table if exists service_requests add column if not exists archived_at timestamptz;
alter table if exists service_requests add column if not exists customer_message text;
alter table if exists service_requests add column if not exists prep_video_url text;
alter table if exists service_requests add column if not exists review_link_google text;
alter table if exists service_requests add column if not exists review_link_yelp text;
alter table if exists service_requests add column if not exists ron_session_url text;
alter table if exists service_requests add column if not exists appointment_confirmed_at timestamptz;
alter table if exists service_requests add column if not exists appointment_date date;
alter table if exists service_requests add column if not exists appointment_time text;
alter table if exists service_requests add column if not exists appointment_timezone text default 'America/Chicago';
alter table if exists service_requests add column if not exists appointment_location text;
alter table if exists service_requests add column if not exists appointment_link text;
alter table if exists service_requests add column if not exists appointment_platform text;
alter table if exists service_requests add column if not exists appointment_instructions text;
alter table if exists service_requests add column if not exists balance_due_at_appointment numeric default 0;
alter table if exists service_requests add column if not exists appointment_line_items_note text;

-- Itemized quote/invoice lines.
create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  service_request_id uuid references service_requests(id) on delete cascade,
  item_type text default 'service',
  description text not null,
  quantity numeric default 1,
  unit_price numeric default 0,
  line_total numeric default 0,
  taxable boolean default false
);

alter table invoice_items enable row level security;

drop policy if exists "public read invoice items" on invoice_items;
create policy "public read invoice items" on invoice_items for select using (true);

drop policy if exists "admin invoice item access" on invoice_items;
create policy "admin invoice item access" on invoice_items for all to authenticated using (true) with check (true);

-- Public status history/dashboard movement log.
create table if not exists request_status_updates (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid references service_requests(id) on delete cascade,
  status text not null,
  message text,
  sent_email boolean default false,
  sent_sms boolean default false,
  created_at timestamptz default now()
);

alter table request_status_updates enable row level security;

drop policy if exists "public read status updates" on request_status_updates;
create policy "public read status updates" on request_status_updates for select using (true);

drop policy if exists "public insert status updates" on request_status_updates;
create policy "public insert status updates" on request_status_updates for insert with check (true);

drop policy if exists "admin status update access" on request_status_updates;
create policy "admin status update access" on request_status_updates for all to authenticated using (true) with check (true);

create index if not exists idx_request_status_updates_request_created on request_status_updates(service_request_id, created_at desc);
create index if not exists idx_service_requests_status_created on service_requests(status, created_at desc);

-- Support ticket columns used by quote changes and customer support flow.
alter table if exists support_tickets add column if not exists phone text;
alter table if exists support_tickets add column if not exists preferred_contact_method text default 'email';
alter table if exists support_tickets add column if not exists related_to_request boolean default false;
alter table if exists support_tickets add column if not exists issue_type text;
alter table if exists support_tickets add column if not exists urgency text default 'standard';
alter table if exists support_tickets add column if not exists internal_notes text;
alter table if exists support_tickets add column if not exists resolution_notes text;
alter table if exists support_tickets add column if not exists linked_service_request_id uuid references service_requests(id) on delete set null;
alter table if exists support_tickets add column if not exists archived_at timestamptz;

-- RON appointment/session helpers.
alter table if exists ron_requests add column if not exists session_link text;
alter table if exists ron_requests add column if not exists appointment_status text;
