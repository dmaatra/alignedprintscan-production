-- Atomic, pre-invoice neighborhood conversion. Financial/provider history is
-- never unwound by this RPC; those cases remain a separate release limitation.
create function public.aps_convert_neighborhood_service(
 p_request uuid, p_target text, p_total numeric, p_details jsonb,
 p_reason text, p_preview boolean default true, p_revision integer default null,
 p_expected_quote uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 r public.service_requests; a public.request_promotion_applications; old_a jsonb;
 old_q public.quotes; new_quote uuid; conversion_id uuid; target_id uuid;
 previous_items jsonb; version_number integer; signers integer; acts integer;
 base numeric; response jsonb;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
 if p_preview is null then raise exception 'Preview mode is required'; end if;
 select * into r from public.service_requests where id=p_request for update;
 if not found then raise exception 'Request not found'; end if;
 select * into a from public.request_promotion_applications where service_request_id=p_request for update;
 if not found then raise exception 'Neighborhood application not found'; end if;
 if r.service_type not in ('mobile','ron') or p_target is null or p_target not in ('mobile','ron') or p_target=r.service_type then raise exception 'Choose the other supported notary service'; end if;
 if r.archived_at is not null or r.completed_at is not null or r.cancelled_at is not null or r.status in ('completed','cancelled','archived') then raise exception 'Completed, cancelled or archived requests cannot be converted'; end if;
 if a.financial_adjustment_required or coalesce(r.paid_amount,0)<>0 or r.stripe_payment_intent_id is not null or r.stripe_checkout_session_id is not null or r.payment_link_url is not null
   or exists(select 1 from public.invoices where service_request_id=p_request)
   or exists(select 1 from public.request_payments where service_request_id=p_request)
   or exists(select 1 from public.refunds where service_request_id=p_request) then
   raise exception 'Conversion with financial history requires separate financial review; no changes were made';
 end if;
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
 response:=jsonb_build_object('ok',true,'request',jsonb_build_object('id',r.id,'service_type',r.service_type),'financials',jsonb_build_object('net_retained',0),'new_service_type',p_target,'new_service_total',p_total,'additional_amount_due',0,'credit_or_refund_due',0,'same_request',true,'proof_history_preserved',exists(select 1 from public.proof_transactions where service_request_id=p_request),'revision',a.revision,'expected_quote',r.current_quote_id,'requires_quote_review',true,'requires_neighborhood_review',p_target='mobile');
 if p_preview then return response; end if;
 if p_revision is null or p_revision<>a.revision or p_expected_quote is distinct from r.current_quote_id then raise exception 'Conversion preview changed; refresh and preview again'; end if;
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
 values(p_request,r.service_type,p_target,jsonb_build_object('date',r.appointment_date,'time',r.appointment_time,'timezone',r.appointment_timezone,'location',r.appointment_location,'platform',r.appointment_platform,'confirmed_at',r.appointment_confirmed_at),p_details,coalesce(r.quote_amount,r.estimated_total),p_total,0,0,0,p_reason,(response->>'proof_history_preserved')::boolean,auth.uid()) returning id into conversion_id;
 update public.quotes set state='superseded',updated_at=now() where id=r.current_quote_id;
 select coalesce(max(version),0)+1 into version_number from public.quotes where service_request_id=p_request;
 insert into public.quotes(service_request_id,quote_number,state,amount,version,notes,created_by,updated_by) values(p_request,'Q-'||upper(left(p_request::text,8))||'-'||lpad(version_number::text,2,'0'),'draft',p_total,version_number,'Converted service: review destination charges, participants, documents and witnesses before issuing.',auth.uid(),auth.uid()) returning id into new_quote;
 delete from public.invoice_items where service_request_id=p_request and invoice_id is null;
 insert into public.invoice_items(service_request_id,item_type,description,quantity,unit_price,line_total) values(p_request,'service',case when p_target='ron' then 'Recalculated Remote Online Notary service charges' else 'Recalculated Mobile Notary service charges' end,1,p_total-base,p_total-base);
 if base>0 then insert into public.invoice_items(service_request_id,item_type,description,quantity,unit_price,line_total) values(p_request,'travel','Standard Mobile Appointment Base',1,base,base); end if;
 update public.request_promotion_applications set eligibility_status=case when p_target='mobile' then 'pending_review' else 'denied' end,applied_pricing_program=case when p_target='mobile' then 'pending_review' else 'STANDARD' end,standard_travel_amount=base,promotional_adjustment=0,approved_travel_amount=base,related_quote_id=new_quote,review_reason=case when p_target='mobile' then 'Destination address requires a new eligibility review after conversion.' else 'RON retains standard pricing; neighborhood travel promotion is not applicable.' end,reviewed_by=case when p_target='ron' then auth.uid() else null end,reviewed_at=case when p_target='ron' then now() else null end,revision=revision+1,updated_at=now() where id=a.id returning * into a;
 insert into public.request_pricing_reviews(service_request_id,promotion_application_id,previous_application,reviewed_application,previous_quote,previous_items,reviewed_by) values(p_request,a.id,old_a,to_jsonb(a),to_jsonb(old_q),previous_items,auth.uid());
 update public.service_requests set service_type=p_target,status='under_review',workflow_status='under_review',current_quote_id=new_quote,quote_amount=p_total,full_quote_amount=p_total,initial_payment_amount=p_total,invoice_status='draft',participant_state='pending',document_state='pending',fulfillment_state='not_started',appointment_state='pending',appointment_confirmed_at=null,appointment_date=null,appointment_time=null,appointment_location=case when p_target='mobile' then concat_ws(', ',p_details->>'street_address',p_details->>'city',p_details->>'state',p_details->>'zip') else null end,appointment_link=null,appointment_platform=null,appointment_instructions=null,ron_session_url=null,balance_due=0,balance_due_at_appointment=0 where id=p_request;
 insert into public.review_queue_items(service_request_id,blocker_key,title,detail,target_tab,state,source_object_type,source_object_id) values(p_request,'service_conversion_review','Review converted service','Verify destination itemization, document compatibility, signer information and witness arrangements before issuing a quote or scheduling.','overview','open','service_conversion',conversion_id);
 insert into public.request_timeline_events(service_request_id,event_type,title,detail,actor_type,visibility,metadata) values(p_request,'service_changed','Service changed','Service conversion recorded. A revised quote and destination requirements require review. No payment was requested.','admin','customer',jsonb_build_object('conversion_id',conversion_id,'admin_id',auth.uid()));
 return response||jsonb_build_object('conversion_id',conversion_id,'quote_id',new_quote,'revision',a.revision);
end $$;
revoke all on function public.aps_convert_neighborhood_service(uuid,text,numeric,jsonb,text,boolean,integer,uuid) from public,anon,service_role;
grant execute on function public.aps_convert_neighborhood_service(uuid,text,numeric,jsonb,text,boolean,integer,uuid) to authenticated;
