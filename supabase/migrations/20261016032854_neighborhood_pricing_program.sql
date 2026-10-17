-- Additive promotion metadata. No existing requests or financial records are rewritten.
create table public.promotion_programs (
  code text primary key,
  public_name text not null,
  enabled boolean not null default false,
  boundary_description text,
  boundary_configuration jsonb not null default '{"method":"manual_admin_review","future_street_list":null,"future_geojson":null}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  mobile_base numeric not null default 25 check (mobile_base = 25),
  document_base numeric not null default 4 check (document_base = 4),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
insert into public.promotion_programs(code,public_name,enabled,boundary_description)
values ('CAMDEN_PARK','Camden Park Neighborhood Services',true,'Camden Park Neighborhood in Waxahachie, Texas. An authorized APS administrator manually verifies the submitted service address.');

create table public.request_promotion_applications (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null unique references public.service_requests(id) on delete cascade,
  promotion_code text not null references public.promotion_programs(code),
  acquisition_source text not null default '/neighborhood',
  submitted_service_address text not null,
  eligibility_status text not null default 'pending_review' check (eligibility_status in ('pending_review','approved','denied','owner_exception')),
  applied_pricing_program text not null default 'pending_review' check (applied_pricing_program in ('pending_review','STANDARD','CAMDEN_PARK')),
  review_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  standard_travel_amount numeric check (standard_travel_amount >= 0),
  promotional_adjustment numeric check (promotional_adjustment >= 0),
  approved_travel_amount numeric check (approved_travel_amount >= 0),
  related_quote_id uuid references public.quotes(id),
  financial_adjustment_required boolean not null default false,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (approved_travel_amount = standard_travel_amount - promotional_adjustment)
);
create index request_promotion_status_idx on public.request_promotion_applications(eligibility_status,created_at desc);
create table public.request_pricing_reviews (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  promotion_application_id uuid not null references public.request_promotion_applications(id) on delete restrict,
  previous_application jsonb not null,
  reviewed_application jsonb not null,
  previous_quote jsonb,
  previous_invoices jsonb,
  previous_refunds jsonb,
  financial_resolution jsonb,
  proposed_standard_travel_amount numeric,
  proposed_promotional_adjustment numeric,
  proposed_travel_amount numeric,
  previous_items jsonb not null default '[]',
  reviewed_by uuid not null,
  created_at timestamptz not null default now()
);
create index request_pricing_reviews_request_idx on public.request_pricing_reviews(service_request_id,created_at desc);
alter table public.promotion_programs enable row level security;
alter table public.request_promotion_applications enable row level security;
alter table public.request_pricing_reviews enable row level security;
create policy promotion_config_admin on public.promotion_programs for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy promotion_application_admin_read on public.request_promotion_applications for select to authenticated using ((select public.is_admin()));
create policy pricing_review_admin_read on public.request_pricing_reviews for select to authenticated using ((select public.is_admin()));
revoke all on public.promotion_programs,public.request_promotion_applications,public.request_pricing_reviews from anon,authenticated;
grant select,update on public.promotion_programs to authenticated;
grant select on public.request_promotion_applications,public.request_pricing_reviews to authenticated;
grant all on public.promotion_programs,public.request_promotion_applications,public.request_pricing_reviews to service_role;

-- Authenticated administrator only. Serializes decisions with request/payment activity.
-- Existing invoice-linked rows are never edited. Paid requests require the existing adjustment/refund workflow.
create or replace function public.aps_review_pricing_program(p_request uuid,p_status text,p_reason text,p_revision integer,p_travel_calculation uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  r public.service_requests; a public.request_promotion_applications; old_a jsonb;
  cfg public.promotion_programs; q public.quotes; new_quote uuid; version_number integer;
  previous_items jsonb; calculated_items jsonb; line jsonb; base_key text; base_amount numeric;
  discount numeric; extra numeric:=0; total_amount numeric; paid boolean; review_id uuid;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_status not in ('approved','denied','owner_exception') or length(trim(coalesce(p_reason,'')))<3 then raise exception 'Decision and review reason are required'; end if;
  select * into r from public.service_requests where id=p_request for update;
  if not found then raise exception 'Request not found'; end if;
  select * into a from public.request_promotion_applications where service_request_id=p_request for update;
  if not found then raise exception 'Promotion application not found'; end if;
  if a.financial_adjustment_required then raise exception 'Resolve the recorded financial adjustment before another pricing review'; end if;
  if p_revision is null or a.revision<>p_revision then raise exception 'Pricing review changed; refresh before reviewing again'; end if;
  old_a:=to_jsonb(a);
  select * into cfg from public.promotion_programs where code=a.promotion_code;
  if p_status in ('approved','owner_exception') and (not cfg.enabled or nullif(trim(cfg.boundary_description),'') is null or cfg.starts_at>now() or cfg.ends_at<now()) then raise exception 'Configure and enable the approved neighborhood boundary before approval'; end if;
  if r.service_type not in ('mobile','print') then
    if p_status<>'denied' then raise exception 'This service retains standard pricing and has no neighborhood travel promotion'; end if;
    update public.request_promotion_applications set eligibility_status='denied',applied_pricing_program='STANDARD',review_reason=p_reason,reviewed_by=auth.uid(),reviewed_at=now(),revision=revision+1,standard_travel_amount=0,promotional_adjustment=0,approved_travel_amount=0,updated_at=now() where id=a.id returning * into a;
    insert into public.request_pricing_reviews(service_request_id,promotion_application_id,previous_application,reviewed_application,reviewed_by) values(p_request,a.id,old_a,to_jsonb(a),auth.uid());
    return jsonb_build_object('ok',true,'financial_adjustment_required',false,'standard_pricing_unchanged',true);
  end if;
  if r.service_type='mobile' then
    if not exists(select 1 from public.mobile_notary_requests where service_request_id=p_request and nullif(trim(street_address),'') is not null and nullif(trim(city),'') is not null and zip ~ '^[0-9]{5}(-[0-9]{4})?$') then raise exception 'Verify a complete service address first'; end if;
  elsif not exists(select 1 from public.print_scan_requests where service_request_id=p_request and length(trim(coalesce(delivery_address,'')))>=10) then raise exception 'Verify the service address first'; end if;
  if r.service_type='mobile' then base_key:='mobile:base'; else select case when fulfillment_type='courier' then 'print:courier' else 'print:mobile_service' end into base_key from public.print_scan_requests where service_request_id=p_request limit 1; end if;
  if base_key is null then raise exception 'An applicable travel base is required'; end if;
  base_amount:=case when base_key in ('mobile:base','print:mobile_base') then 50 else 20 end;
  discount:=case when p_status='denied' then 0 when base_amount=50 then 25 else 16 end;
  if p_status='denied' then
    select coalesce(applied_fee,suggested_fee) into extra from public.mobile_travel_calculations where id=p_travel_calculation and service_request_id=p_request;
    if not found or extra is null or extra<0 then raise exception 'Calculate and review standard mileage pricing first'; end if;
  end if;
  select * into q from public.quotes where id=r.current_quote_id;
  select coalesce(jsonb_agg(to_jsonb(i)),'[]') into previous_items from public.invoice_items i where service_request_id=p_request;
  paid:=coalesce(r.paid_amount,0)>0 or exists(select 1 from public.request_payments where service_request_id=p_request) or exists(select 1 from public.invoices where service_request_id=p_request and status not in ('void','cancelled'));
  update public.request_promotion_applications set eligibility_status=p_status, review_reason=p_reason,reviewed_by=auth.uid(),reviewed_at=now(),revision=revision+1,updated_at=now(),financial_adjustment_required=paid,
    applied_pricing_program=case when paid then applied_pricing_program when p_status='denied' then 'STANDARD' else 'CAMDEN_PARK' end,
    standard_travel_amount=case when paid then standard_travel_amount else base_amount+extra end,
    promotional_adjustment=case when paid then promotional_adjustment else discount end,
    approved_travel_amount=case when paid then approved_travel_amount else base_amount+extra-discount end
    where id=a.id returning * into a;
  insert into public.request_pricing_reviews(service_request_id,promotion_application_id,previous_application,reviewed_application,previous_quote,previous_invoices,previous_refunds,previous_items,reviewed_by,proposed_standard_travel_amount,proposed_promotional_adjustment,proposed_travel_amount)
    values(p_request,a.id,old_a,to_jsonb(a),to_jsonb(q),(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from public.invoices i where service_request_id=p_request),(select coalesce(jsonb_agg(to_jsonb(f)),'[]') from public.refunds f where service_request_id=p_request),previous_items,auth.uid(),base_amount+extra,discount,base_amount+extra-discount) returning id into review_id;
  if not paid then
    select coalesce(max(version),0)+1 into version_number from public.quotes where service_request_id=p_request;
    -- Preserve current editable quote rows; fall back to the immutable original intake components.
    select coalesce(jsonb_agg(jsonb_build_object('description',i.description,'quantity',i.quantity,'unit_price',i.unit_price,'line_total',i.line_total)),'[]') into calculated_items from public.invoice_items i where service_request_id=p_request and invoice_id is null and i.item_type not in ('promotion','travel','mobile_travel') and i.description not ilike '%Camden Park%' and i.description not ilike '%Appointment Base%' and i.description not ilike '%Delivery Base%' and i.description not ilike '%Document Service Base%';
    if jsonb_array_length(calculated_items)=0 then
      select coalesce(jsonb_agg(jsonb_build_object('description',v->>'label','quantity',v->'quantity','unit_price',v->'unit_amount','line_total',v->'line_amount')),'[]') into calculated_items from jsonb_array_elements(r.estimate_components->'components') v where coalesce((v->>'billable')::boolean,true) and v->>'key' not in ('mobile:base','print:courier','print:mobile_service','print:mobile_base','promotion:CAMDEN_PARK');
    end if;
    calculated_items:=calculated_items||jsonb_build_array(jsonb_build_object('description',case when base_amount=50 then 'Standard Mobile Appointment Base' when base_key='print:courier' then 'Standard Courier Delivery Base' else 'Standard Mobile Document Service Base' end,'quantity',1,'unit_price',base_amount,'line_total',base_amount,'item_type','travel'));
    if extra>0 then calculated_items:=calculated_items||jsonb_build_array(jsonb_build_object('description','Standard Mileage Travel Adjustment','quantity',1,'unit_price',extra,'line_total',extra,'item_type','travel')); end if;
    if discount>0 then calculated_items:=calculated_items||jsonb_build_array(jsonb_build_object('description','Camden Park Promotional Adjustment','quantity',1,'unit_price',-discount,'line_total',-discount,'item_type','promotion')); end if;
    select sum((v->>'line_total')::numeric) into total_amount from jsonb_array_elements(calculated_items) v;
    if total_amount<0 then raise exception 'Invalid negative quote total'; end if;
    update public.quotes set state='superseded',updated_at=now() where id=r.current_quote_id;
    insert into public.quotes(service_request_id,quote_number,state,amount,version,notes,created_by,updated_by) values(p_request,'Q-'||upper(left(p_request::text,8))||'-'||lpad(version_number::text,2,'0'),'draft',total_amount,version_number,case when p_status='denied' then 'Camden Park eligibility was not approved. Standard APS pricing applies.' else 'Camden Park Neighborhood Services pricing approved after address review.' end,auth.uid(),auth.uid()) returning id into new_quote;
    delete from public.invoice_items where service_request_id=p_request and invoice_id is null;
    for line in select value from jsonb_array_elements(calculated_items) loop
      insert into public.invoice_items(service_request_id,item_type,description,quantity,unit_price,line_total) values(p_request,coalesce(line->>'item_type','service'),line->>'description',(line->>'quantity')::numeric,(line->>'unit_price')::numeric,(line->>'line_total')::numeric);
    end loop;
    update public.service_requests set status='under_review',workflow_status='under_review',current_quote_id=new_quote,quote_amount=total_amount,full_quote_amount=total_amount,initial_payment_amount=total_amount,invoice_status='draft',quote_notes=case when p_status='denied' then 'Camden Park eligibility was not approved. Standard APS pricing applies.' else 'Camden Park Neighborhood Services pricing approved after address review.' end where id=p_request;
    update public.request_promotion_applications set related_quote_id=new_quote where id=a.id returning * into a;
    update public.request_pricing_reviews set reviewed_application=to_jsonb(a) where id=review_id;
  end if;
  insert into public.request_timeline_events(service_request_id,event_type,title,detail,actor_type,visibility,metadata) values(p_request,'pricing_program_review','Neighborhood pricing reviewed',case when paid then 'Pricing review recorded. Existing financial records are unchanged; financial adjustment review is required.' when p_status='denied' then 'Standard APS pricing applies. A revised itemized quote is being prepared.' else 'Camden Park Neighborhood Services pricing approved. An itemized quote is being prepared.' end,'admin','customer',jsonb_build_object('review_id',review_id,'admin_id',auth.uid()));
  return jsonb_build_object('ok',true,'financial_adjustment_required',paid,'quote_id',new_quote,'review_id',review_id);
end $$;
revoke all on function public.aps_review_pricing_program(uuid,text,text,integer,uuid) from public,anon;
grant execute on function public.aps_review_pricing_program(uuid,text,text,integer,uuid) to authenticated;

-- Defense in depth: neither browser quote edits nor another issuing path may
-- turn a pending intake discount into a payable quote.
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
  return new;
end $$;
revoke all on function public.aps_guard_neighborhood_quote() from public,anon,authenticated;
create trigger guard_neighborhood_quote before insert or update of state,amount on public.quotes for each row execute function public.aps_guard_neighborhood_quote();
create trigger guard_neighborhood_quote_status before update of status,quote_amount on public.service_requests for each row execute function public.aps_guard_neighborhood_quote();

-- Reconcile an issued-price change only after separate invoice/refund records
-- establish the exact reviewed difference. This function never moves money.
create function public.aps_resolve_pricing_adjustment(p_request uuid,p_revision integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.request_promotion_applications; v public.request_pricing_reviews; before_total numeric; after_total numeric; target numeric;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Record the financial reconciliation reason'; end if;
 perform 1 from public.service_requests where id=p_request for update;
 select * into a from public.request_promotion_applications where service_request_id=p_request for update;
 if not found or not a.financial_adjustment_required or a.revision is distinct from p_revision then raise exception 'Refresh the pending financial adjustment'; end if;
 select * into v from public.request_pricing_reviews where promotion_application_id=a.id order by created_at desc,id desc limit 1;
 if v.previous_application->>'approved_travel_amount' is null then raise exception 'Prior authorized travel amount is required for financial reconciliation'; end if;
 if exists(select 1 from public.refunds where service_request_id=p_request and status in ('pending','processing','requires_action')) then raise exception 'Complete pending refunds before reconciliation'; end if;
 select coalesce(sum((x->>'amount_due')::numeric),0) into before_total from jsonb_array_elements(v.previous_invoices) x where coalesce(x->>'status','') not in ('void','cancelled');
 before_total:=before_total-(select coalesce(sum((x->>'amount')::numeric),0) from jsonb_array_elements(v.previous_refunds) x where x->>'status'='succeeded');
 target:=before_total+v.proposed_travel_amount-(v.previous_application->>'approved_travel_amount')::numeric;
 select coalesce(sum(amount_due),0) into after_total from public.invoices where service_request_id=p_request and status not in ('void','cancelled');
 after_total:=after_total-(select coalesce(sum(amount),0) from public.refunds where service_request_id=p_request and status='succeeded');
 if abs(after_total-target)>0.009 then raise exception 'Invoice/refund records must reconcile to the reviewed total of %; current net charges %',target,after_total; end if;
 update public.request_promotion_applications set financial_adjustment_required=false,applied_pricing_program=case when eligibility_status='denied' then 'STANDARD' else 'CAMDEN_PARK' end,standard_travel_amount=v.proposed_standard_travel_amount,promotional_adjustment=v.proposed_promotional_adjustment,approved_travel_amount=v.proposed_travel_amount,revision=revision+1,updated_at=now() where id=a.id;
 update public.request_pricing_reviews set financial_resolution=jsonb_build_object('reason',p_reason,'reviewed_by',auth.uid(),'reviewed_at',now(),'prior_net_charges',before_total,'verified_net_charges',after_total,'target_net_charges',target) where id=v.id;
 insert into public.request_timeline_events(service_request_id,event_type,title,detail,actor_type,visibility,metadata) values(p_request,'pricing_adjustment_reconciled','Pricing adjustment reconciled','The reviewed pricing change is reflected in the separate invoice/refund records.','admin','customer',jsonb_build_object('review_id',v.id));
 return jsonb_build_object('ok',true,'net_charges',after_total);
end $$;
revoke all on function public.aps_resolve_pricing_adjustment(uuid,integer,text) from public,anon;
grant execute on function public.aps_resolve_pricing_adjustment(uuid,integer,text) to authenticated;

-- Keep an actionable review item in the existing operations/completion queue.
create function public.aps_sync_promotion_review_queue()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare needs_review boolean;
begin
 needs_review:=new.eligibility_status='pending_review' or new.financial_adjustment_required;
 update public.review_queue_items set state='resolved',resolved_at=now(),resolved_by=new.reviewed_by,updated_at=now() where service_request_id=new.service_request_id and blocker_key='neighborhood_pricing_review' and state='open';
 if needs_review then
  insert into public.review_queue_items(service_request_id,blocker_key,title,detail,target_tab,state,source_object_type,source_object_id) values(new.service_request_id,'neighborhood_pricing_review','Neighborhood pricing review',case when new.financial_adjustment_required then 'Reconcile the approved pricing change using separate invoices/refunds.' else 'Manually review the submitted address for Camden Park eligibility.' end,'overview','open','promotion_application',new.id);
 end if;
 return new;
end $$;
revoke all on function public.aps_sync_promotion_review_queue() from public,anon,authenticated;
create trigger sync_promotion_review_queue after insert or update of eligibility_status,financial_adjustment_required on public.request_promotion_applications for each row execute function public.aps_sync_promotion_review_queue();

create function public.aps_guard_issued_promotion_items()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare item_request uuid; item_invoice uuid;
begin
 if tg_op='INSERT' then item_request:=new.service_request_id; item_invoice:=new.invoice_id;
 else item_request:=old.service_request_id; item_invoice:=old.invoice_id; end if;
 if item_invoice is null and exists(select 1 from public.service_requests r join public.quotes q on q.id=r.current_quote_id join public.request_promotion_applications a on a.service_request_id=r.id where r.id=item_request and q.state in ('sent','approved')) then raise exception 'Issued neighborhood quote items are immutable; prepare a revised quote'; end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function public.aps_guard_issued_promotion_items() from public,anon,authenticated;
create trigger guard_issued_promotion_items before insert or delete or update of quantity,unit_price,line_total,description,item_type on public.invoice_items for each row execute function public.aps_guard_issued_promotion_items();

-- A direct/replayed approval cannot materialize an unreviewed intake estimate.
create function public.aps_guard_promotion_primary_invoice()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare app public.request_promotion_applications; current_id uuid;
begin
 select current_quote_id into current_id from public.service_requests where id=new.service_request_id for update;
 select * into app from public.request_promotion_applications where service_request_id=new.service_request_id;
 if not found then return new; end if;
 if new.source_quote_id is not null or new.invoice_type in ('primary','initial') then
  if app.eligibility_status='pending_review' or app.financial_adjustment_required or current_id is null or new.source_quote_id is distinct from current_id then raise exception 'Finish the current neighborhood quote review before creating its primary invoice'; end if;
 end if;
 return new;
end $$;
revoke all on function public.aps_guard_promotion_primary_invoice() from public,anon,authenticated;
create trigger guard_promotion_primary_invoice before insert on public.invoices for each row execute function public.aps_guard_promotion_primary_invoice();
