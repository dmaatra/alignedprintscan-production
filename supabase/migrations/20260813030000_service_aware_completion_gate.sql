-- APS service-aware completion gate facts and exception audit trail.
create table if not exists public.request_completion_facts (
  service_request_id uuid primary key references public.service_requests(id) on delete restrict,
  components text[] not null default '{}',
  ron_session_completed boolean not null default false,
  mobile_service_completed boolean not null default false,
  production_completed boolean not null default false,
  scan_completed boolean not null default false,
  pickup_required boolean not null default true,
  pickup_completed boolean not null default false,
  delivery_completed boolean not null default false,
  proof_of_delivery_required boolean not null default false,
  proof_of_delivery_present boolean not null default false,
  aps_deliverable_required boolean,
  external_platform_delivery boolean not null default false,
  physical_only boolean not null default false,
  customer_declined_optional_deliverable boolean not null default false,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.request_completion_exceptions (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  exception_type text not null check (exception_type in ('approved_balance_exception','physical_only_no_portal_deliverable','customer_declined_optional_deliverable','external_platform_delivery','administrative_closure','other')),
  explanation text not null check (length(btrim(explanation)) >= 5),
  overridden_blockers jsonb not null default '[]'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

alter table public.service_requests add column if not exists completed_at timestamptz;
alter table public.service_requests add column if not exists completion_path text check (completion_path is null or completion_path in ('normal','exception'));
alter table public.service_requests add column if not exists completion_exception_id uuid references public.request_completion_exceptions(id) on delete restrict;

alter table public.request_completion_facts enable row level security;
alter table public.request_completion_exceptions enable row level security;
revoke all on public.request_completion_facts, public.request_completion_exceptions from anon, authenticated;
grant select, insert, update, delete on public.request_completion_facts to authenticated;
grant select, insert on public.request_completion_exceptions to authenticated;
create policy aps_admin_completion_facts on public.request_completion_facts for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy aps_admin_completion_exceptions on public.request_completion_exceptions for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

comment on table public.request_completion_facts is 'Authoritative service-component fulfillment facts used by the APS completion gate and future Proof synchronization.';
comment on table public.request_completion_exceptions is 'Append-only audit of intentional administrator completion overrides.';
