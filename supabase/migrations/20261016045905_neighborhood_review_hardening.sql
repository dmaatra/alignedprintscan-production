-- Forward correction: enforce itemized quote totals before issuance.
create or replace function public.aps_guard_neighborhood_quote()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare request_id uuid; a public.request_promotion_applications; service text; adjustment numeric; adjustment_count integer; item_total numeric; travel_total numeric;
begin
  if tg_table_name='quotes' then
    if tg_op='UPDATE' and old.state in ('sent','approved') and (new.amount is distinct from old.amount or new.state in ('draft','saved')) and exists(select 1 from public.request_promotion_applications where service_request_id=new.service_request_id) then raise exception 'Issued neighborhood quotes are immutable; use a revised pricing review'; end if;
    if new.state not in ('sent','approved') then return new; end if;
    request_id:=new.service_request_id;
  else
    if new.quote_amount is distinct from old.quote_amount and new.current_quote_id is not distinct from old.current_quote_id and exists(select 1 from public.quotes q join public.request_promotion_applications app on app.service_request_id=q.service_request_id where q.id=old.current_quote_id and q.state in ('sent','approved')) then raise exception 'Use a revised neighborhood quote; issued amounts are immutable'; end if;
    if new.status='completed' and exists(select 1 from public.request_promotion_applications where service_request_id=new.id and (eligibility_status='pending_review' or financial_adjustment_required)) then raise exception 'Complete neighborhood eligibility and financial review before completing the request'; end if;
    if new.status not in ('quote_ready','awaiting_approval') then return new; end if;
    request_id:=new.id;
  end if;
  select service_type into service from public.service_requests where id=request_id for update;
  if service not in ('mobile','print') then return new; end if;
  select * into a from public.request_promotion_applications where service_request_id=request_id;
  if not found then return new; end if;
  if tg_table_name='quotes' then
    if new.id is distinct from (select current_quote_id from public.service_requests where id=request_id) then raise exception 'This quote has been superseded; refresh before approving'; end if;
    if tg_op='UPDATE' and old.state='approved' and new.state='approved' and new.amount=old.amount then return new; end if;
  end if;
  if a.applied_pricing_program='pending_review' or a.eligibility_status='pending_review' or a.financial_adjustment_required then raise exception 'Complete neighborhood pricing review and any financial adjustment before issuing a quote'; end if;
  select coalesce(sum(line_total),0),count(*) into adjustment,adjustment_count from public.invoice_items where service_request_id=request_id and invoice_id is null and (item_type='promotion' or description ilike '%Camden Park%');
  if adjustment <> -coalesce(a.promotional_adjustment,0) or adjustment_count <> (case when a.promotional_adjustment>0 then 1 else 0 end) then raise exception 'Quote promotion does not match the authorized pricing decision'; end if;
  select coalesce(sum(line_total),0) into travel_total from public.invoice_items where service_request_id=request_id and invoice_id is null and (item_type in ('travel','mobile_travel') or description ilike '%Appointment Base%' or description ilike '%Delivery Base%' or description ilike '%Document Service Base%');
  if travel_total <> a.standard_travel_amount then raise exception 'Quote travel does not match the authorized pricing decision'; end if;
  select coalesce(sum(line_total),0) into item_total from public.invoice_items where service_request_id=request_id and invoice_id is null;
  if (tg_table_name='quotes' and (to_jsonb(new)->>'amount')::numeric is distinct from item_total)
     or (tg_table_name='service_requests' and (to_jsonb(new)->>'quote_amount')::numeric is distinct from item_total) then
    raise exception 'Quote total must equal its reviewed itemized charges';
  end if;
  return new;
end $$;

revoke all on function public.aps_guard_neighborhood_quote() from public,anon,authenticated;
