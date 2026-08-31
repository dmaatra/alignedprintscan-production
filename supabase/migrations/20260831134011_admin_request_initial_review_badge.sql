-- APS Admin Requests badge: company-level initial review semantics.
--
-- The existing admin_request_views ledger remains the authoritative first-open
-- record. The earliest row for a request means APS has seen it; later operators
-- do not create competing unread state. The badge counts only active external
-- customer submissions and remains independent from Requests page totals,
-- Review Queue blockers, and general notifications.

create or replace function public.admin_mark_request_viewed(p_request uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_request public.service_requests%rowtype;
  v_remaining integer;
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'Administrator access is required.';
  end if;

  select * into v_request
  from public.service_requests
  where id = p_request
  for update;

  if not found then
    raise exception 'Request not found.';
  end if;

  -- Only legitimate external submissions participate in the new-request
  -- signal. Locking the request row makes the company-level first insert safe
  -- when two authorized operators open the same request concurrently.
  if lower(coalesce(v_request.request_source, '')) in ('website', 'business_portal')
     and not exists (
       select 1
       from public.admin_request_views v
       where v.service_request_id = p_request
     ) then
    insert into public.admin_request_views(admin_user_id, service_request_id)
    values (v_admin, p_request)
    on conflict do nothing;
  end if;

  select count(*)::integer into v_remaining
  from public.service_requests r
  where r.archived_at is null
    -- Do not turn requests that predate the original first-view ledger into
    -- fresh notifications merely because no historical view row was backfilled.
    and r.created_at >= timestamptz '2026-08-14 04:36:39+00'
    and r.completed_at is null
    and r.cancelled_at is null
    and lower(coalesce(r.request_source, '')) in ('website', 'business_portal')
    and lower(coalesce(r.status, '')) not in ('completed', 'cancelled', 'canceled', 'declined', 'refunded', 'void')
    and lower(coalesce(r.workflow_status, '')) not in ('completed', 'cancelled', 'canceled', 'declined', 'refunded', 'void')
    and not exists (
      select 1
      from public.admin_request_views v
      where v.service_request_id = r.id
    );

  return v_remaining;
end
$$;

create or replace function public.admin_unopened_request_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_count integer;
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'Administrator access is required.';
  end if;

  select count(*)::integer into v_count
  from public.service_requests r
  where r.archived_at is null
    and r.created_at >= timestamptz '2026-08-14 04:36:39+00'
    and r.completed_at is null
    and r.cancelled_at is null
    and lower(coalesce(r.request_source, '')) in ('website', 'business_portal')
    and lower(coalesce(r.status, '')) not in ('completed', 'cancelled', 'canceled', 'declined', 'refunded', 'void')
    and lower(coalesce(r.workflow_status, '')) not in ('completed', 'cancelled', 'canceled', 'declined', 'refunded', 'void')
    and not exists (
      select 1
      from public.admin_request_views v
      where v.service_request_id = r.id
    );

  return v_count;
end
$$;

revoke all on function public.admin_mark_request_viewed(uuid) from public, anon;
revoke all on function public.admin_unopened_request_count() from public, anon;
grant execute on function public.admin_mark_request_viewed(uuid) to authenticated;
grant execute on function public.admin_unopened_request_count() to authenticated;

comment on table public.admin_request_views is
  'Company-level APS initial-review ledger. The first row for an external request records its first authorized operator view; it is not message unread state.';
comment on function public.admin_mark_request_viewed(uuid) is
  'Records the first company-level APS operator view for a qualifying external request and returns the remaining awaiting-initial-review count.';
comment on function public.admin_unopened_request_count() is
  'Counts active website and Business Portal requests awaiting their first authorized APS operator view.';
