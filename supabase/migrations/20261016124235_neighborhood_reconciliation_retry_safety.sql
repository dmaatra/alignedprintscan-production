-- Forward-only reconciliation retry and invalid-charge safeguards.
-- Requires all four preceding neighborhood migrations; no historical data rewrite.
create or replace function public.aps_resolve_pricing_adjustment(p_request uuid,p_revision integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.request_promotion_applications; v public.request_pricing_reviews; before_total numeric; after_total numeric; target numeric; historical jsonb; current_record jsonb;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Record the financial reconciliation reason'; end if;
 perform 1 from public.service_requests where id=p_request for update;
 select * into a from public.request_promotion_applications where service_request_id=p_request for update;
 if not found then raise exception 'Refresh the pending financial adjustment'; end if;
 select * into v from public.request_pricing_reviews where promotion_application_id=a.id order by created_at desc,id desc limit 1;
 -- A lost response may be retried only for the exact completed operation.
 if not a.financial_adjustment_required and a.revision=p_revision+1
    and v.financial_resolution->>'request_revision'=p_revision::text
    and v.financial_resolution->>'reason'=p_reason
    and v.financial_resolution->>'reviewed_by'=auth.uid()::text then
   return jsonb_build_object('ok',true,'net_charges',v.financial_resolution->'verified_net_charges');
 end if;
 if not a.financial_adjustment_required or a.revision is distinct from p_revision then raise exception 'Refresh the pending financial adjustment'; end if;
 -- Stabilize existing records during validation. The financial write triggers
 -- below also serialize inserts from legacy writers against the request lock.
 perform 1 from public.invoices where service_request_id=p_request order by id for update;
 perform 1 from public.request_payments where service_request_id=p_request order by id for update;
 perform 1 from public.refunds where service_request_id=p_request order by id for update;
 perform 1 from public.invoice_items where service_request_id=p_request order by id for update;
 perform 1 from public.quotes where service_request_id=p_request order by id for update;
 if exists(select 1 from public.invoices where service_request_id=p_request
   and (status is null or trim(status)='' or status='draft'
     or amount_due is null or amount_due<0 or amount_due::text in ('NaN','Infinity','-Infinity'))) then
   raise exception 'Reconciliation requires issued invoices with finite nonnegative amounts and explicit status';
 end if;
 if v.proposed_travel_amount is null or v.proposed_travel_amount<0
    or v.proposed_travel_amount::text in ('NaN','Infinity','-Infinity') then
   raise exception 'Reviewed travel amount must be finite and nonnegative';
 end if;


 -- A matching total alone cannot establish reconciliation: preserve original
 -- financial terms and successful refunds, and require real payment linkage.
 if v.previous_payments is null then raise exception 'Payment history snapshot is missing; financial review must be investigated'; end if;
 for historical in select value from jsonb_array_elements(coalesce(v.previous_invoices,'[]')) loop
   select to_jsonb(i) into current_record from public.invoices i where id=(historical->>'id')::uuid and service_request_id=p_request;
   if current_record is null or
      (current_record->'amount_due') is distinct from (historical->'amount_due') or
      (current_record->'source_quote_id') is distinct from (historical->'source_quote_id') or
      (current_record->'invoice_number') is distinct from (historical->'invoice_number') or
      (coalesce(current_record->>'status','') in ('void','cancelled')) is distinct from (coalesce(historical->>'status','') in ('void','cancelled')) then
     raise exception 'Historical invoice terms changed; reconcile using separate records';
   end if;
 end loop;
 for historical in select value from jsonb_array_elements(v.previous_payments) loop
   select to_jsonb(p) into current_record from public.request_payments p where id=(historical->>'id')::uuid and service_request_id=p_request;
   if current_record is distinct from historical then raise exception 'Historical payment changed; preserve the original payment record'; end if;
 end loop;
 for historical in select value from jsonb_array_elements(coalesce(v.previous_refunds,'[]')) where value->>'status'='succeeded' loop
   select to_jsonb(f) into current_record from public.refunds f where id=(historical->>'id')::uuid and service_request_id=p_request;
   if current_record is distinct from historical then raise exception 'Historical successful refund changed'; end if;
 end loop;
 for historical in select value from jsonb_array_elements(coalesce(v.previous_items,'[]')) where value->>'invoice_id' is not null loop
   select to_jsonb(i) into current_record from public.invoice_items i where id=(historical->>'id')::uuid and service_request_id=p_request;
   if current_record is distinct from historical then raise exception 'Historical invoice item changed'; end if;
 end loop;
 if v.previous_quote->>'id' is not null and v.previous_quote->>'state' in ('sent','approved','awaiting_approval','accepted') then
   select to_jsonb(q) into current_record from public.quotes q where id=(v.previous_quote->>'id')::uuid and service_request_id=p_request;
   if current_record is distinct from v.previous_quote then raise exception 'Previously issued quote changed'; end if;
 end if;
 if exists(select 1 from public.refunds f left join public.request_payments p on p.id=f.payment_id and p.service_request_id=f.service_request_id and p.invoice_id=f.invoice_id
   where f.service_request_id=p_request and f.status='succeeded' and (p.id is null or f.amount is null or f.amount<=0 or f.amount::text in ('NaN','Infinity','-Infinity'))) then
   raise exception 'Successful refunds require a positive amount linked to the original request payment and invoice';
 end if;
 if exists(select 1 from public.request_payments p where p.service_request_id=p_request and
   (select coalesce(sum(f.amount),0) from public.refunds f where f.payment_id=p.id and f.status='succeeded')>p.amount) then
   raise exception 'Successful refunds exceed the original payment';
 end if;
 if v.previous_application->>'approved_travel_amount' is null then raise exception 'Prior authorized travel amount is required for financial reconciliation'; end if;
 if exists(select 1 from public.refunds where service_request_id=p_request and status in ('pending','processing','requires_action')) then raise exception 'Complete pending refunds before reconciliation'; end if;
 select coalesce(sum((x->>'amount_due')::numeric),0) into before_total from jsonb_array_elements(v.previous_invoices) x where coalesce(x->>'status','') not in ('void','cancelled');
 before_total:=before_total-(select coalesce(sum((x->>'amount')::numeric),0) from jsonb_array_elements(v.previous_refunds) x where x->>'status'='succeeded');
 target:=before_total+v.proposed_travel_amount-(v.previous_application->>'approved_travel_amount')::numeric;
 select coalesce(sum(amount_due),0) into after_total from public.invoices where service_request_id=p_request and status not in ('void','cancelled');
 after_total:=after_total-(select coalesce(sum(amount),0) from public.refunds where service_request_id=p_request and status='succeeded');
 if abs(after_total-target)>0.009 then raise exception 'Invoice/refund records must reconcile to the reviewed total of %; current net charges %',target,after_total; end if;
 update public.request_promotion_applications set financial_adjustment_required=false,applied_pricing_program=case when eligibility_status='denied' then 'STANDARD' else 'CAMDEN_PARK' end,standard_travel_amount=v.proposed_standard_travel_amount,promotional_adjustment=v.proposed_promotional_adjustment,approved_travel_amount=v.proposed_travel_amount,revision=revision+1,updated_at=now() where id=a.id;
 update public.request_pricing_reviews set financial_resolution=jsonb_build_object('request_revision',p_revision,'reason',p_reason,'reviewed_by',auth.uid(),'reviewed_at',now(),'prior_net_charges',before_total,'verified_net_charges',after_total,'target_net_charges',target) where id=v.id;
 insert into public.request_timeline_events(service_request_id,event_type,title,detail,actor_type,visibility,metadata) values(p_request,'pricing_adjustment_reconciled','Pricing adjustment reconciled','The reviewed pricing change is reflected in the separate invoice/refund records.','admin','customer',jsonb_build_object('review_id',v.id));
 return jsonb_build_object('ok',true,'net_charges',after_total);
end $$;
revoke all on function public.aps_resolve_pricing_adjustment(uuid,integer,text) from public,anon;
grant execute on function public.aps_resolve_pricing_adjustment(uuid,integer,text) to authenticated;

-- Every financial writer participates in the same request lock, including
-- legacy REST handlers and provider callbacks. Existing row updates can deadlock
-- with a parent-first RPC; PostgreSQL aborts one transaction rather than allowing
-- a stale reconciliation. Callers must retry the whole failed operation.
create function public.aps_serialize_neighborhood_finance() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare request_id uuid;
begin
 if tg_op='UPDATE' and old.service_request_id is distinct from new.service_request_id
    and exists(select 1 from public.request_promotion_applications where service_request_id in (old.service_request_id,new.service_request_id)) then
   raise exception 'Neighborhood financial records cannot be reassigned to another request';
 end if;
 if tg_op='DELETE' then request_id:=old.service_request_id; else request_id:=new.service_request_id; end if;
 if exists(select 1 from public.request_promotion_applications where service_request_id=request_id) then
   perform 1 from public.service_requests where id=request_id for update;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function public.aps_serialize_neighborhood_finance() from public,anon,authenticated,service_role;
create trigger aa_serialize_neighborhood_finance before insert or update or delete on public.invoices for each row execute function public.aps_serialize_neighborhood_finance();
create trigger aa_serialize_neighborhood_finance before insert or update or delete on public.request_payments for each row execute function public.aps_serialize_neighborhood_finance();
create trigger aa_serialize_neighborhood_finance before insert or update or delete on public.refunds for each row execute function public.aps_serialize_neighborhood_finance();
create trigger aa_serialize_neighborhood_finance before insert or update or delete on public.invoice_items for each row execute function public.aps_serialize_neighborhood_finance();
create trigger aa_serialize_neighborhood_finance before insert or update or delete on public.quotes for each row execute function public.aps_serialize_neighborhood_finance();
