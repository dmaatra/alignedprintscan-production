-- Private Mobile Notary travel origins and route/quote audit history.
create table if not exists public.travel_origins (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(trim(label)) between 2 and 80),
  street_address text not null check (length(trim(street_address)) > 0),
  city text not null check (length(trim(city)) > 0),
  state text not null check (length(trim(state)) between 2 and 30),
  zip text not null check (length(trim(zip)) between 5 and 10),
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_default or is_active)
);

create unique index if not exists travel_origins_one_active_default
  on public.travel_origins ((is_default)) where is_default and is_active;

create table if not exists public.mobile_travel_pricing_tiers (
  tier_key text primary key,
  label text not null,
  minimum_round_trip_miles numeric not null check (minimum_round_trip_miles >= 0),
  maximum_round_trip_miles numeric check (maximum_round_trip_miles >= minimum_round_trip_miles),
  fee numeric check (fee is null or fee >= 0),
  sort_order integer not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.mobile_travel_pricing_tiers
  (tier_key,label,minimum_round_trip_miles,maximum_round_trip_miles,fee,sort_order)
values
  ('0-15','0–15 round-trip miles',0,15,0,10),
  ('16-20','16–20 round-trip miles',15,20,10,20),
  ('21-25','21–25 round-trip miles',20,25,20,30),
  ('26-30','26–30 round-trip miles',25,30,30,40),
  ('31-40','31–40 round-trip miles',30,40,45,50),
  ('41+','Over 40 round-trip miles — manual pricing required',40,null,null,60)
on conflict (tier_key) do update set
  label=excluded.label,
  minimum_round_trip_miles=excluded.minimum_round_trip_miles,
  maximum_round_trip_miles=excluded.maximum_round_trip_miles,
  fee=excluded.fee,
  sort_order=excluded.sort_order,
  active=true,
  updated_at=now();

create table if not exists public.mobile_travel_calculations (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  origin_id uuid references public.travel_origins(id) on delete set null,
  origin_label text not null,
  origin_address jsonb not null,
  destination_address text not null,
  routing_profile text not null default 'driving-car',
  routing_version text not null default 'ors-v2',
  cache_key text not null,
  distance_meters numeric not null check (distance_meters >= 0),
  duration_seconds numeric not null check (duration_seconds >= 0),
  one_way_miles numeric not null check (one_way_miles >= 0),
  round_trip_miles numeric not null check (round_trip_miles >= 0),
  pricing_tier_key text not null references public.mobile_travel_pricing_tiers(tier_key),
  pricing_tier_label text not null,
  suggested_fee numeric,
  applied_fee numeric,
  operator_note text,
  quote_id uuid references public.quotes(id) on delete set null,
  invoice_item_id uuid references public.invoice_items(id) on delete set null,
  application_state text not null default 'preview' check (application_state in ('preview','applied','superseded')),
  calculated_by uuid,
  applied_by uuid,
  calculated_at timestamptz not null default now(),
  applied_at timestamptz
);

create index if not exists mobile_travel_calculations_request_idx
  on public.mobile_travel_calculations(service_request_id,calculated_at desc);
create index if not exists mobile_travel_calculations_cache_idx
  on public.mobile_travel_calculations(cache_key,calculated_at desc);

alter table public.travel_origins enable row level security;
alter table public.mobile_travel_pricing_tiers enable row level security;
alter table public.mobile_travel_calculations enable row level security;

drop policy if exists aps_admin_travel_origins on public.travel_origins;
create policy aps_admin_travel_origins on public.travel_origins for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists aps_admin_mobile_travel_tiers on public.mobile_travel_pricing_tiers;
create policy aps_admin_mobile_travel_tiers on public.mobile_travel_pricing_tiers for select to authenticated
  using ((select public.is_admin()));
drop policy if exists aps_admin_mobile_travel_calculations on public.mobile_travel_calculations;
create policy aps_admin_mobile_travel_calculations on public.mobile_travel_calculations for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

grant select,insert,update on public.travel_origins to authenticated;
grant select on public.mobile_travel_pricing_tiers to authenticated;
grant select,insert,update on public.mobile_travel_calculations to authenticated;

revoke all on public.travel_origins from anon;
revoke all on public.mobile_travel_pricing_tiers from anon;
revoke all on public.mobile_travel_calculations from anon;

comment on table public.mobile_travel_pricing_tiers is
  'Server-authoritative APS Mobile round-trip pricing, promoted from the production pricing configuration. ORS supplies route facts only.';
comment on column public.mobile_travel_calculations.round_trip_miles is
  'Exact one-way ORS driving meters converted with 1609.344 meters per mile and multiplied by two. Tier assignment uses this unrounded value.';
