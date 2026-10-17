-- Atomic paid conversion with immutable historical financial rows. Refunds are
-- separately approved and processed; this RPC never contacts payment providers.
create table public.neighborhood_conversion_operations (
 id uuid primary key, service_request_id uuid not null references public.service_requests(id),
 created_by uuid not null, created_at timestamptz not null default now(),
 payload jsonb not null, result jsonb not null, financial_snapshot jsonb, issued_item_snapshot jsonb
);
alter table public.neighborhood_conversion_operations enable row level security;
revoke all on public.neighborhood_conversion_operations from public,anon,authenticated,service_role;
grant select on public.neighborhood_conversion_operations to authenticated,service_role;
create policy neighborhood_conversion_admin_read on public.neighborhood_conversion_operations for select to authenticated using (public.is_admin());
create function public.aps_convert_neighborhood_paid_service(
 p_request uuid, p_target text, p_total numeric, p_details jsonb,
 p_reason text, p_preview boolean default true, p_revision integer default null,
 p_expected_quote uuid default null, p_financial_version text default null, p_operation uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 r public.service_requests; a public.request_promotion_applications; old_a jsonb;
 old_q public.quotes; new_quote uuid; conversion_id uuid; target_id uuid;
 previous_items jsonb; version_number integer; signers integer; acts integer;
 base numeric; response jsonb; financial_version text; financial_snapshot jsonb;
 paid numeric; refunded numeric; charges numeric; additional numeric; outstanding numeric;
 adjustment_invoice uuid; operation_payload jsonb; prior_operation public.neighborhood_conversion_operations;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 if p_preview is null then raise exception 'Preview mode is required'; end if;
 select * into r from public.service_requests where id=p_request for update;
 if not found then raise exception 'Request not found'; end if;
 select * into a from public.request_promotion_applications where service_request_id=p_request for update;
 if not found then raise exception 'Neighborhood application not found'; end if;
 operation_payload:=jsonb_build_object('request',p_request,'target',p_target,'total',p_total,'details',p_details,'reason',p_reason,'revision',p_revision,'quote',p_expected_quote,'financial_version',p_financial_version);
 if not p_preview then
   if p_operation is null then raise exception 'A stable conversion operation ID is required'; end if;
   select * into prior_operation from public.neighborhood_conversion_operations where id=p_operation;
   if found then
     if prior_operation.created_by<>auth.uid() or prior_operation.payload is distinct from operation_payload then raise exception 'Conversion operation ID belongs to a different operation'; end if;
     return prior_operation.result||jsonb_build_object('duplicate',true);
   end if;
 end if;
 -- No financial history follows the established pre-invoice path.
 if not exists(select 1 from public.invoices where service_request_id=p_request)
    and not exists(select 1 from public.request_payments where service_request_id=p_request)
    and not exists(select 1 from public.refunds where service_request_id=p_request) then
   response:=public.aps_convert_neighborhood_service(p_request,p_target,p_total,p_details,p_reason,p_preview,p_revision,p_expected_quote);
   if not p_preview then insert into public.neighborhood_conversion_operations(id,service_request_id,created_by,payload,result) values(p_operation,p_request,auth.uid(),operation_payload,response); end if;
   return response;
 end if;
 if r.service_type not in ('mobile','ron') or p_target is null or p_target not in ('mobile','ron') or p_target=r.service_type then raise exception 'Choose the other supported notary service'; end if;
 if r.archived_at is not null or r.completed_at is not null or r.cancelled_at is not null or r.status in ('completed','cancelled','archived') then raise exception 'Completed, cancelled or archived requests cannot be converted'; end if;
 if a.financial_adjustment_required then raise exception 'Resolve the pending pricing-program adjustment before service conversion'; end if;
 -- Lock both existing records and their parent. Migration 5 serializes all new
 -- financial writes against this same parent lock, including provider callbacks.
 perform 1 from public.invoices where service_request_id=p_request order by id for update;
 perform 1 from public.request_payments where service_request_id=p_request order by id for update;
 perform 1 from public.refunds where service_request_id=p_request order by id for update;
 perform 1 from public.invoice_items where service_request_id=p_request order by id for update;
 perform 1 from public.quotes where service_request_id=p_request order by id for update;
 if exists(select 1 from public.invoices where service_request_id=p_request and
   (status is null or trim(status)='' or status='draft' or amount_due is null or amount_due<0 or amount_due::text in ('NaN','Infinity','-Infinity') or round(amount_due,2)<>amount_due)) then
   raise exception 'Conversion requires reconciled issued invoices';
 end if;
 if exists(select 1 from public.request_payments p left join public.invoices i on i.id=p.invoice_id and i.service_request_id=p.service_request_id where p.service_request_id=p_request and
   (i.id is null or i.status in ('void','cancelled') or p.amount is null or p.amount<=0 or p.amount::text in ('NaN','Infinity','-Infinity') or round(p.amount,2)<>p.amount or coalesce(p.payment_state,'recorded') not in ('recorded','paid','succeeded','completed'))) then
   raise exception 'Conversion requires authoritative payments linked to issued invoices';
 end if;
 if exists(select 1 from public.refunds f left join public.request_payments p on p.id=f.payment_id and p.service_request_id=f.service_request_id and p.invoice_id=f.invoice_id where f.service_request_id=p_request and
   (f.status is null or f.status not in ('succeeded','failed','cancelled') or (f.status='succeeded' and (p.id is null or f.amount is null or f.amount<=0 or f.amount::text in ('NaN','Infinity','-Infinity') or round(f.amount,2)<>f.amount)))) then
   raise exception 'Resolve pending or invalid refunds before conversion; no refund is initiated by conversion';
 end if;
 if exists(select 1 from public.request_payments p where p.service_request_id=p_request and (select coalesce(sum(amount),0) from public.refunds where payment_id=p.id and status='succeeded')>p.amount) then raise exception 'Refunds exceed the original payment'; end if;
 -- Active payment links must be expired/cleared through the existing provider
 -- process. Completed original Stripe references remain untouched.
 if r.payment_link_url is not null or (r.stripe_checkout_session_id is not null and not exists(select 1 from public.request_payments where service_request_id=p_request and stripe_payment_intent_id=r.stripe_payment_intent_id)) or exists(select 1 from public.invoices where service_request_id=p_request and coalesce(balance_due,0)>0 and stripe_checkout_session_id is not null) then raise exception 'Resolve active payment links before conversion'; end if;
 select coalesce(sum(amount),0) into paid from public.request_payments where service_request_id=p_request;
 select coalesce(sum(amount),0) into refunded from public.refunds where service_request_id=p_request and status='succeeded';
 select coalesce(sum(amount_due),0) into charges from public.invoices where service_request_id=p_request and status not in ('void','cancelled');
 if paid<=0 or paid>charges then raise exception 'Paid conversion requires reconciled payment history'; end if;
 if exists(select 1 from public.invoices i where i.service_request_id=p_request and i.status not in ('void','cancelled') and
   (coalesce(i.amount_paid,i.paid_amount,0)<>(select coalesce(sum(p.amount),0) from public.request_payments p where p.invoice_id=i.id)
    or i.balance_due is null or i.balance_due<0 or i.balance_due<>i.amount_due-(select coalesce(sum(p.amount),0) from public.request_payments p where p.invoice_id=i.id))) then raise exception 'Invoice balances must reconcile with original payments'; end if;
 charges:=charges-refunded;
 outstanding:=charges-(paid-refunded);
 financial_snapshot:=jsonb_build_object(
   'invoices',(select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') from public.invoices i where service_request_id=p_request),
   'payments',(select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') from public.request_payments i where service_request_id=p_request),
   'refunds',(select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') from public.refunds i where service_request_id=p_request),
   'quotes',(select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') from public.quotes i where service_request_id=p_request),
   'items',(select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') from public.invoice_items i where service_request_id=p_request),
   'request',to_jsonb(r));
 financial_version:=md5(financial_snapshot::text);
 if exists(select 1 from public.proof_transactions where service_request_id=p_request and coalesce(aps_status,'') not in ('cancelled','failed')) then
   raise exception 'Resolve the existing Proof transaction before conversion; provider history will be preserved';
 end if;
 if coalesce(r.fulfillment_state,'') not in ('','not_started','pending') then raise exception 'Review started fulfillment before converting this request'; end if;
 if p_total is null or p_total::text in ('NaN','Infinity','-Infinity') or p_total<=0 or round(p_total,2)<>p_total then raise exception 'Enter a positive destination total with at most two decimal places'; end if;
 if jsonb_typeof(p_details) is distinct from 'object' or length(trim(coalesce(p_reason,'')))<3 then raise exception 'Destination details and conversion reason are required'; end if;
 signers:=(p_details->>'number_of_signers')::integer; acts:=(p_details->>'number_of_notarizations')::integer;
 if signers is null or signers<1 or acts is null or acts<1 then raise exception 'Confirm signer and notarial-act counts'; end if;
 base:=case when p_target='mobile' then 50 else 0 end;
 if p_total<base then raise exception 'Mobile destination total must include the standard $50 base before eligibility review'; end if;
 if p_target='mobile' and (nullif(trim(p_details->>'street_address'),'') is null or nullif(trim(p_details->>'city'),'') is null or nullif(trim(p_details->>'state'),'') is null or coalesce(p_details->>'zip','') !~ '^[0-9]{5}(-[0-9]{4})?$') then raise exception 'Complete the Mobile service address'; end if;
 additional:=greatest(0,p_total-charges);
 response:=jsonb_build_object('ok',true,'request',jsonb_build_object('id',r.id,'service_type',r.service_type),'financials',jsonb_build_object('paid',paid,'refunded',refunded,'net_retained',paid-refunded,'net_charges',charges,'outstanding',outstanding),'new_service_type',p_target,'new_service_total',p_total,'additional_amount_due',additional,'balance_after_conversion',outstanding+additional,'credit_or_refund_due',greatest(0,charges-p_total),'same_request',true,'proof_history_preserved',exists(select 1 from public.proof_transactions where service_request_id=p_request),'revision',a.revision,'expected_quote',r.current_quote_id,'financial_version',financial_version,'requires_quote_review',true,'requires_neighborhood_review',p_target='mobile','requires_financial_review',p_total<charges,'separate_invoice',additional>0,'financial_review_message',case when p_total<charges then 'A reduction requires separately approved and completed refund or credit records before conversion. Original invoices and payments cannot be edited. Credit adjustments against unpaid balances require Owner policy approval.' else null end);
 if p_preview then return response; end if;
 if p_revision is null or p_revision<>a.revision or p_expected_quote is distinct from r.current_quote_id or p_financial_version is distinct from financial_version then raise exception 'Conversion preview changed; refresh and preview again'; end if;
 if p_total<charges then raise exception 'Complete separate financial review before conversion; no refund or historical change was made'; end if;
 old_a:=to_jsonb(a)||jsonb_build_object('conversion_previous_request',to_jsonb(r),'conversion_previous_mobile',(select coalesce(jsonb_agg(to_jsonb(m)),'[]') from public.mobile_notary_requests m where service_request_id=p_request),'conversion_previous_ron',(select coalesce(jsonb_agg(to_jsonb(n)),'[]') from public.ron_requests n where service_request_id=p_request));
 select * into old_q from public.quotes where id=r.current_quote_id;
 select coalesce(jsonb_agg(to_jsonb(i)),'[]') into previous_items from public.invoice_items i where service_request_id=p_request;
 -- Preserve both source/destination details; update only supplied destination
 -- requirements. Existing witness/add-on fields and related records survive.
 if p_target='mobile' then
   select id into target_id from public.mobile_notary_requests where service_request_id=p_request order by id limit 1;
   if target_id is null then
     insert into public.mobile_notary_requests(service_request_id,street_address,unit,city,state,zip,number_of_signers,number_of_notarizations,witness_review_required) values(p_request,trim(p_details->>'street_address'),nullif(trim(p_details->>'unit'),''),trim(p_details->>'city'),trim(p_details->>'state'),trim(p_details->>'zip'),signers,acts,true);
   else
     update public.mobile_notary_requests set street_address=trim(p_details->>'street_address'),unit=nullif(trim(p_details->>'unit'),''),city=trim(p_details->>'city'),state=trim(p_details->>'state'),zip=trim(p_details->>'zip'),number_of_signers=signers,number_of_notarizations=acts,witness_review_required=true where id=target_id;
   end if;
 else
   select id into target_id from public.ron_requests where service_request_id=p_request order by id limit 1;
   if target_id is null then
     insert into public.ron_requests(service_request_id,number_of_signers,number_of_notarizations,witness_review_required) values(p_request,signers,acts,true);
   else
     update public.ron_requests set number_of_signers=signers,number_of_notarizations=acts,witness_review_required=true where id=target_id;
   end if;
 end if;
 insert into public.request_service_conversions(service_request_id,previous_service_type,new_service_type,previous_appointment,destination_requirements,prior_service_total,new_service_total,amount_paid_at_conversion,additional_amount_due,credit_or_refund_due,reason,proof_transaction_preserved,created_by)
 values(p_request,r.service_type,p_target,jsonb_build_object('date',r.appointment_date,'time',r.appointment_time,'timezone',r.appointment_timezone,'location',r.appointment_location,'platform',r.appointment_platform,'confirmed_at',r.appointment_confirmed_at),p_details,coalesce(r.quote_amount,r.estimated_total),p_total,paid-refunded,additional,0,p_reason,(response->>'proof_history_preserved')::boolean,auth.uid()) returning id into conversion_id;
 -- Previously issued quotes remain byte-for-byte unchanged.
 select coalesce(max(version),0)+1 into version_number from public.quotes where service_request_id=p_request;
 insert into public.quotes(service_request_id,quote_number,state,amount,version,notes,created_by,updated_by) values(p_request,'Q-'||upper(left(p_request::text,8))||'-'||lpad(version_number::text,2,'0'),'draft',p_total,version_number,'Converted service: review destination charges, participants, documents and witnesses before issuing.',auth.uid(),auth.uid()) returning id into new_quote;
 -- Keep historical and unlinked itemization intact for financial review.
 -- The new draft is deliberately not issuable until its itemization is reviewed.
 if additional>0 then
   insert into public.invoices(service_request_id,invoice_number,invoice_type,status,payment_status,amount_due,amount_paid,paid_amount,balance_due,source_reason,note)
   values(p_request,'INV-CONV-'||p_operation::text,'supplemental','final_balance_due','unpaid',additional,0,0,additional,'service_conversion','Separate service conversion adjustment. Original invoice remains unchanged.') returning id into adjustment_invoice;
   insert into public.invoice_items(service_request_id,invoice_id,item_type,description,quantity,unit_price,line_total)
   values(p_request,adjustment_invoice,'service','Service conversion difference: '||r.service_type||' to '||p_target,1,additional,additional);
 end if;
 update public.request_promotion_applications set eligibility_status=case when p_target='mobile' then 'pending_review' else 'denied' end,applied_pricing_program=case when p_target='mobile' then 'pending_review' else 'STANDARD' end,standard_travel_amount=base,promotional_adjustment=0,approved_travel_amount=base,related_quote_id=new_quote,review_reason=case when p_target='mobile' then 'Destination address requires a new eligibility review after conversion.' else 'RON retains standard pricing; neighborhood travel promotion is not applicable.' end,reviewed_by=case when p_target='ron' then auth.uid() else null end,reviewed_at=case when p_target='ron' then now() else null end,revision=revision+1,updated_at=now() where id=a.id returning * into a;
 insert into public.request_pricing_reviews(service_request_id,promotion_application_id,previous_application,reviewed_application,previous_quote,previous_items,reviewed_by) values(p_request,a.id,old_a,to_jsonb(a),to_jsonb(old_q),previous_items,auth.uid());
 update public.service_requests set service_type=p_target,status='under_review',workflow_status='under_review',current_quote_id=new_quote,quote_amount=p_total,full_quote_amount=p_total,initial_payment_amount=p_total,invoice_status=case when outstanding+additional>0 then 'final_balance_due' else 'paid' end,payment_state=case when outstanding+additional>0 then 'final_invoice_due' else 'paid' end,payment_status=case when outstanding+additional>0 then 'partially_paid' else 'paid' end,participant_state='pending',document_state='pending',fulfillment_state='not_started',appointment_state='pending',appointment_confirmed_at=null,appointment_date=null,appointment_time=null,appointment_location=case when p_target='mobile' then concat_ws(', ',p_details->>'street_address',p_details->>'city',p_details->>'state',p_details->>'zip') else null end,appointment_link=null,appointment_platform=null,appointment_instructions=null,ron_session_url=null,balance_due=outstanding+additional,balance_due_at_appointment=outstanding+additional where id=p_request;
 insert into public.review_queue_items(service_request_id,blocker_key,title,detail,target_tab,state,source_object_type,source_object_id) values(p_request,'service_conversion_review','Review converted service','Verify destination itemization, document compatibility, signer information and witness arrangements before issuing a quote or scheduling.','overview','open','service_conversion',conversion_id);
 insert into public.request_timeline_events(service_request_id,event_type,title,detail,actor_type,visibility,metadata) values(p_request,'service_changed','Service changed','Service conversion recorded. A revised quote and destination requirements require review. Original financial records are preserved. Review the revised quote and any separate adjustment before making a payment.','admin','customer',jsonb_build_object('conversion_id',conversion_id,'admin_id',auth.uid()));
 insert into public.review_queue_items(service_request_id,blocker_key,title,detail,target_tab,state,source_object_type,source_object_id) values(p_request,'conversion_customer_notification','Notify customer of service conversion','Send the revised service, itemized charges, retained payments and remaining balance through Messages. No email is sent automatically by this transaction.','messages','open','service_conversion',conversion_id);
 response:=response||jsonb_build_object('conversion_id',conversion_id,'quote_id',new_quote,'revision',a.revision,'adjustment_invoice_id',adjustment_invoice,'customer_notification','pending_admin_review');
 insert into public.neighborhood_conversion_operations(id,service_request_id,created_by,payload,result,financial_snapshot) values(p_operation,p_request,auth.uid(),operation_payload,response,financial_snapshot);
 return response;
end $$;
revoke all on function public.aps_convert_neighborhood_paid_service(uuid,text,numeric,jsonb,text,boolean,integer,uuid,text,uuid) from public,anon,service_role;
grant execute on function public.aps_convert_neighborhood_paid_service(uuid,text,numeric,jsonb,text,boolean,integer,uuid,text,uuid) to authenticated;

-- A revised paid quote may not authorize a second full-price invoice or an
-- amount that differs from the separately reconciled invoice/refund ledger.
create function public.aps_guard_paid_conversion_quote() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare net_charges numeric; reviewed_items jsonb; issued_items jsonb;
begin
 if new.state in ('sent','approved') and exists(select 1 from public.neighborhood_conversion_operations where service_request_id=new.service_request_id and result->>'quote_id'=new.id::text and result ? 'financial_version') then
   if new.id is distinct from (select current_quote_id from public.service_requests where id=new.service_request_id) then raise exception 'This conversion quote is no longer current'; end if;
   if tg_op='UPDATE' and new.state='approved' and old.state not in ('sent','approved') then raise exception 'Administrator must issue the revised conversion quote before customer approval'; end if;
   if new.amount is distinct from (select coalesce(sum(line_total),0) from public.invoice_items where service_request_id=new.service_request_id and invoice_id is null) then raise exception 'Review the complete destination itemization before issuing the conversion quote'; end if;
   select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]') into reviewed_items from public.invoice_items i where service_request_id=new.service_request_id and invoice_id is null;
   select issued_item_snapshot into issued_items from public.neighborhood_conversion_operations where service_request_id=new.service_request_id and result->>'quote_id'=new.id::text;
   if issued_items is not null and issued_items is distinct from reviewed_items then raise exception 'Issued conversion quote itemization changed; preserve its issued history'; end if;
   update public.neighborhood_conversion_operations set issued_item_snapshot=reviewed_items where service_request_id=new.service_request_id and result->>'quote_id'=new.id::text and issued_item_snapshot is null;
   select coalesce(sum(amount_due),0) into net_charges from public.invoices where service_request_id=new.service_request_id and status not in ('void','cancelled');
   net_charges:=net_charges-(select coalesce(sum(amount),0) from public.refunds where service_request_id=new.service_request_id and status='succeeded');
   if new.amount is distinct from net_charges then raise exception 'Revised quote must match the separate reconciled conversion charges'; end if;
 end if;
 return new;
end $$;
revoke all on function public.aps_guard_paid_conversion_quote() from public,anon,authenticated,service_role;
create trigger guard_paid_conversion_quote before insert or update on public.quotes for each row execute function public.aps_guard_paid_conversion_quote();
