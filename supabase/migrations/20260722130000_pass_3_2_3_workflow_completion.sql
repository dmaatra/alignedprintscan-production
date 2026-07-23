-- Aligned Print & Scan — Pass 3.2.3 workflow completion and audit logging.
-- Additive migration: creates the audit/support tables used by the current
-- Edge Functions and Admin Portal, then enables RLS by default.

create table if not exists public.customer_action_requests (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  action_type text not null check (action_type in ('cancel', 'reschedule')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  customer_email text,
  reason text,
  proposed_appointment_at timestamptz,
  admin_message text,
  approved_refund_amount numeric not null default 0,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.request_timeline_events (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  event_type text not null,
  title text not null,
  detail text,
  actor_type text not null default 'system',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.request_communications (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  direction text not null default 'outbound',
  channel text not null default 'email',
  subject text,
  message text,
  delivery_status text not null default 'logged',
  provider_message_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.refund_reviews (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  customer_action_request_id uuid references public.customer_action_requests(id) on delete set null,
  requested_amount numeric not null default 0,
  approved_amount numeric not null default 0,
  status text not null default 'pending',
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists customer_action_requests_request_status_idx
  on public.customer_action_requests(service_request_id, status, created_at desc);
create index if not exists request_timeline_events_request_created_idx
  on public.request_timeline_events(service_request_id, created_at desc);
create index if not exists request_communications_request_created_idx
  on public.request_communications(service_request_id, created_at desc);
create index if not exists refund_reviews_request_status_idx
  on public.refund_reviews(service_request_id, status, created_at desc);

alter table public.customer_action_requests enable row level security;
alter table public.request_timeline_events enable row level security;
alter table public.request_communications enable row level security;
alter table public.refund_reviews enable row level security;

-- These records are intentionally accessed through Edge Functions or the
-- authenticated Admin Portal. The service role bypasses RLS. Authenticated
-- dashboard users may read the records; public/anonymous users receive no
-- direct table access.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='customer_action_requests' and policyname='authenticated_read_customer_actions') then
    create policy authenticated_read_customer_actions on public.customer_action_requests for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='request_timeline_events' and policyname='authenticated_read_timeline') then
    create policy authenticated_read_timeline on public.request_timeline_events for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='request_communications' and policyname='authenticated_read_communications') then
    create policy authenticated_read_communications on public.request_communications for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='refund_reviews' and policyname='authenticated_read_refunds') then
    create policy authenticated_read_refunds on public.refund_reviews for select to authenticated using (true);
  end if;
end $$;
