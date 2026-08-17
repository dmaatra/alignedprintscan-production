alter table public.mobile_travel_calculations
  add column if not exists display_one_way_miles numeric
    check (display_one_way_miles is null or display_one_way_miles >= 0),
  add column if not exists display_round_trip_miles numeric
    check (display_round_trip_miles is null or display_round_trip_miles >= 0),
  add column if not exists display_duration_minutes integer
    check (display_duration_minutes is null or display_duration_minutes >= 0);

comment on column public.mobile_travel_calculations.display_one_way_miles is
  'One-decimal operator display value; exact one_way_miles remains authoritative for calculations.';
comment on column public.mobile_travel_calculations.display_round_trip_miles is
  'One-decimal operator display value; exact round_trip_miles remains authoritative for APS tier selection.';
comment on column public.mobile_travel_calculations.display_duration_minutes is
  'Whole-minute operator display value derived from the ORS route duration.';
