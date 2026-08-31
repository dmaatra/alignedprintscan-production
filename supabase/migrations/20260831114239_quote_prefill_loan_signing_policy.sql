-- Preserve the exact customer-safe component snapshot used for each new
-- estimate. Existing rows remain null and keep the legacy bundled fallback.
alter table public.service_requests
  add column if not exists estimate_components jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'service_requests_estimate_components_object_check'
      and conrelid = 'public.service_requests'::regclass
  ) then
    alter table public.service_requests
      add constraint service_requests_estimate_components_object_check
      check (estimate_components is null or jsonb_typeof(estimate_components) = 'object')
      not valid;
  end if;
end $$;

alter table public.loan_signing_assignments
  add column if not exists round_trip_miles numeric(8,2)
    check (round_trip_miles is null or round_trip_miles >= 0),
  add column if not exists pricing_review_required boolean not null default false,
  add column if not exists pricing_review_reason text;

comment on column public.service_requests.estimate_components is
  'Immutable intake-time estimate component snapshot. Null on historical requests; Quote Builder uses the legacy bundled fallback for those rows.';
comment on column public.loan_signing_assignments.round_trip_miles is
  'Operator-reviewed APS dispatch-origin-to-signing-location round-trip mileage; never inferred from ordinary Mobile Notary travel tiers.';
