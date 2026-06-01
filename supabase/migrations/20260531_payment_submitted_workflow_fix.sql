-- Payment submitted workflow + dashboard movement support.
-- Run after prior V14 migrations.

alter table if exists service_requests add column if not exists paid_amount numeric;
alter table if exists service_requests add column if not exists stripe_checkout_session_id text;
alter table if exists service_requests add column if not exists stripe_payment_intent_id text;
alter table if exists service_requests add column if not exists paid_at timestamptz;
alter table if exists service_requests add column if not exists payment_status text;
alter table if exists service_requests add column if not exists appointment_confirmed_at timestamptz;
alter table if exists service_requests add column if not exists receipt_url text;
alter table if exists service_requests add column if not exists receipt_pdf_url text;

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

drop policy if exists "public update status updates" on request_status_updates;
create policy "public update status updates" on request_status_updates for update using (true) with check (true);

create index if not exists idx_request_status_updates_request_created on request_status_updates(service_request_id, created_at desc);
create index if not exists idx_service_requests_status_created on service_requests(status, created_at desc);
