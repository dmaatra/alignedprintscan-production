-- Invoice, support, archive, and embedded payment readiness updates.

alter table service_requests
add column if not exists archived_at timestamptz,
add column if not exists quote_amount numeric,
add column if not exists quote_notes text,
add column if not exists invoice_number text,
add column if not exists invoice_url text,
add column if not exists receipt_url text,
add column if not exists payment_status text default 'unpaid',
add column if not exists paid_at timestamptz,
add column if not exists appointment_confirmed_at timestamptz,
add column if not exists customer_message text,
add column if not exists review_link_google text,
add column if not exists review_link_yelp text,
add column if not exists prep_video_url text,
add column if not exists invoice_status text default 'draft',
add column if not exists stripe_checkout_session_id text,
add column if not exists stripe_payment_intent_id text,
add column if not exists paid_amount numeric;

create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  service_request_id uuid references service_requests(id) on delete cascade,
  item_type text,
  description text not null,
  quantity numeric default 1,
  unit_price numeric default 0,
  line_total numeric default 0,
  taxable boolean default false
);

alter table invoice_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_items' and policyname = 'Allow admin invoice item access') then
    create policy "Allow admin invoice item access"
    on invoice_items
    for all
    to authenticated
    using (true)
    with check (true);
  end if;
end $$;

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  first_name text not null,
  last_name text not null,
  company text,
  email text not null,
  reference_number text,
  reason text default 'order_related',
  message text not null,
  status text default 'new',
  archived_at timestamptz
);

alter table support_tickets enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'support_tickets' and policyname = 'Allow public support ticket insert') then
    create policy "Allow public support ticket insert"
    on support_tickets
    for insert
    to anon
    with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'support_tickets' and policyname = 'Allow admin support ticket access') then
    create policy "Allow admin support ticket access"
    on support_tickets
    for all
    to authenticated
    using (true)
    with check (true);
  end if;
end $$;
