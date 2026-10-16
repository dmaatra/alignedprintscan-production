-- PR #159 focused release: preserve deferred implementation, deny its execution.
-- No customer/financial/history rows are rewritten. No runtime enable flag.
create function public.aps_neighborhood_history_locked(p_request uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.service_requests r where r.id=p_request and
   (coalesce(r.paid_amount,0)>0 or r.stripe_payment_intent_id is not null or r.stripe_checkout_session_id is not null or r.payment_link_url is not null))
 or exists(select 1 from public.quotes where service_request_id=p_request and state in ('sent','approved'))
 or exists(select 1 from public.invoices where service_request_id=p_request)
 or exists(select 1 from public.request_payments where service_request_id=p_request)
 or exists(select 1 from public.refunds where service_request_id=p_request);
$$;
revoke all on function public.aps_neighborhood_history_locked(uuid) from public,anon,authenticated,service_role;

-- A private-schema preserved implementation is not a PostgREST RPC endpoint.
create schema if not exists aps_deferred;
revoke all on schema aps_deferred from public,anon,authenticated,service_role;
alter function public.aps_convert_neighborhood_paid_service(uuid,text,numeric,jsonb,text,boolean,integer,uuid,text,uuid) set schema aps_deferred;
revoke all on function aps_deferred.aps_convert_neighborhood_paid_service(uuid,text,numeric,jsonb,text,boolean,integer,uuid,text,uuid) from public,anon,authenticated,service_role;
create function public.aps_convert_neighborhood_paid_service(
 p_request uuid,p_target text,p_total numeric,p_details jsonb,p_reason text,
 p_preview boolean default true,p_revision integer default null,p_expected_quote uuid default null,
 p_financial_version text default null,p_operation uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 perform 1 from public.service_requests where id=p_request for update;
 if public.aps_neighborhood_history_locked(p_request) then
   raise exception 'Neighborhood conversion after quote issuance or financial history is deferred for this release';
 end if;
 return aps_deferred.aps_convert_neighborhood_paid_service(p_request,p_target,p_total,p_details,p_reason,p_preview,p_revision,p_expected_quote,p_financial_version,p_operation);
end $$;
revoke all on function public.aps_convert_neighborhood_paid_service(uuid,text,numeric,jsonb,text,boolean,integer,uuid,text,uuid) from public,anon,service_role;
grant execute on function public.aps_convert_neighborhood_paid_service(uuid,text,numeric,jsonb,text,boolean,integer,uuid,text,uuid) to authenticated;

-- Protect direct table writes as well as the existing review/conversion RPCs.
create function public.aps_guard_focused_neighborhood_changes()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid;
begin
 if tg_table_name='service_requests' then
   if new.service_type is not distinct from old.service_type then return new; end if;
   target:=old.id;
   if not exists(select 1 from public.request_promotion_applications where service_request_id=target) then return new; end if;
 else
   target:=old.service_request_id;
   if new.service_request_id is distinct from old.service_request_id then raise exception 'Neighborhood request identity is immutable'; end if;
   if new.eligibility_status is not distinct from old.eligibility_status
      and new.applied_pricing_program is not distinct from old.applied_pricing_program
      and new.standard_travel_amount is not distinct from old.standard_travel_amount
      and new.promotional_adjustment is not distinct from old.promotional_adjustment
      and new.approved_travel_amount is not distinct from old.approved_travel_amount
      and new.promotion_code is not distinct from old.promotion_code
      and new.revision is not distinct from old.revision
      and new.financial_adjustment_required is not distinct from old.financial_adjustment_required then return new; end if;
 end if;
 perform 1 from public.service_requests where id=target for update;
 if public.aps_neighborhood_history_locked(target) then
   raise exception 'Neighborhood conversion or pricing review after quote issuance or financial history is deferred for this release';
 end if;
 return new;
end $$;
revoke all on function public.aps_guard_focused_neighborhood_changes() from public,anon,authenticated,service_role;
create trigger guard_focused_neighborhood_service before update of service_type on public.service_requests for each row execute function public.aps_guard_focused_neighborhood_changes();
create trigger guard_focused_neighborhood_review before update on public.request_promotion_applications for each row execute function public.aps_guard_focused_neighborhood_changes();

-- This RPC exists only to resolve the deferred neighborhood adjustments.
create or replace function public.aps_resolve_pricing_adjustment(p_request uuid,p_revision integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 raise exception 'Post-issue neighborhood pricing adjustments are deferred for this release';
end $$;

-- Persist issuance even if the quote is later declined/expired/superseded.
create table public.neighborhood_release_issued_requests (
 service_request_id uuid primary key references public.service_requests(id),
 first_quote_id uuid not null,
 locked_at timestamptz not null default now()
);
alter table public.neighborhood_release_issued_requests enable row level security;
revoke all on public.neighborhood_release_issued_requests from public,anon,authenticated,service_role;
insert into public.neighborhood_release_issued_requests(service_request_id,first_quote_id)
 select distinct on (q.service_request_id) q.service_request_id,q.id
 from public.quotes q join public.request_promotion_applications a on a.service_request_id=q.service_request_id
 where q.state not in ('draft','saved') order by q.service_request_id,q.id;

create or replace function public.aps_neighborhood_history_locked(p_request uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.neighborhood_release_issued_requests where service_request_id=p_request)
 or exists(select 1 from public.service_requests r where r.id=p_request and
   (coalesce(r.paid_amount,0)>0 or r.stripe_payment_intent_id is not null or r.stripe_checkout_session_id is not null or r.payment_link_url is not null))
 or exists(select 1 from public.quotes where service_request_id=p_request and state not in ('draft','saved'))
 or exists(select 1 from public.invoices where service_request_id=p_request)
 or exists(select 1 from public.request_payments where service_request_id=p_request)
 or exists(select 1 from public.refunds where service_request_id=p_request);
$$;
create function public.aps_guard_focused_neighborhood_quote()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare issued uuid;
begin
 if not exists(select 1 from public.request_promotion_applications where service_request_id=new.service_request_id) then return new; end if;
 if new.state not in ('sent','approved') then return new; end if;
 perform 1 from public.service_requests where id=new.service_request_id for update;
 select first_quote_id into issued from public.neighborhood_release_issued_requests where service_request_id=new.service_request_id;
 if issued is not null and issued<>new.id then raise exception 'Post-issue neighborhood replacement quotes are deferred for this release'; end if;
 insert into public.neighborhood_release_issued_requests(service_request_id,first_quote_id)
 values(new.service_request_id,new.id) on conflict do nothing;
 return new;
end $$;
revoke all on function public.aps_guard_focused_neighborhood_quote() from public,anon,authenticated,service_role;
create trigger guard_focused_neighborhood_quote before insert or update on public.quotes for each row execute function public.aps_guard_focused_neighborhood_quote();
