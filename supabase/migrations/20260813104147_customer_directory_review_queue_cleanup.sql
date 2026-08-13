-- APS customer identity, lifecycle, and cleanup controls.
-- Forward-only: historical display/legal values are preserved. Only deterministic
-- normalized matching columns are backfilled; no customer is merged or removed.

create or replace function public.aps_normalize_email(value text)
returns text language sql immutable parallel safe as $$
  select nullif(lower(btrim(coalesce(value, ''))), '')
$$;

create or replace function public.aps_normalize_phone(value text)
returns text language sql immutable parallel safe as $$
  select case
    when regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') ~ '^1[0-9]{10}$'
      then '+' || regexp_replace(value, '[^0-9]', '', 'g')
    when regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
      then '+1' || regexp_replace(value, '[^0-9]', '', 'g')
    else nullif(regexp_replace(coalesce(value, ''), '[^0-9+]', '', 'g'), '')
  end
$$;

create or replace function public.aps_normalize_name(value text)
returns text language sql immutable parallel safe as $$
  select nullif(lower(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g')), '')
$$;

alter table public.customers
  add column if not exists normalized_email text,
  add column if not exists normalized_phone text,
  add column if not exists normalized_name text,
  add column if not exists merged_into_customer_id uuid references public.customers(id) on delete restrict,
  add column if not exists merged_at timestamptz;

update public.customers
set normalized_email = public.aps_normalize_email(email),
    normalized_phone = public.aps_normalize_phone(phone),
    normalized_name = public.aps_normalize_name(concat_ws(' ', first_name, last_name))
where normalized_email is distinct from public.aps_normalize_email(email)
   or normalized_phone is distinct from public.aps_normalize_phone(phone)
   or normalized_name is distinct from public.aps_normalize_name(concat_ws(' ', first_name, last_name));

create index if not exists customers_normalized_email_idx on public.customers(normalized_email) where merged_at is null;
create index if not exists customers_normalized_phone_idx on public.customers(normalized_phone) where merged_at is null;
create index if not exists customers_normalized_name_idx on public.customers(normalized_name) where merged_at is null;

create or replace function public.aps_sync_customer_normalized_values()
returns trigger language plpgsql set search_path = public as $$
begin
  new.normalized_email := public.aps_normalize_email(new.email);
  new.normalized_phone := public.aps_normalize_phone(new.phone);
  new.normalized_name := public.aps_normalize_name(concat_ws(' ', new.first_name, new.last_name));
  return new;
end $$;

drop trigger if exists aps_sync_customer_normalized_values on public.customers;
create trigger aps_sync_customer_normalized_values
before insert or update of first_name, last_name, email, phone on public.customers
for each row execute function public.aps_sync_customer_normalized_values();

alter table public.service_requests
  add column if not exists archived_by uuid,
  add column if not exists archive_reason text;

create table if not exists public.customer_link_audits (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  link_type text not null check (link_type in ('automatic','admin_confirmed','new_customer','ambiguous_review')),
  match_basis text not null check (match_basis in ('email_phone_name','email_compatible_name','explicit_customer_id','new_identity','conflicting_identity')),
  confidence text not null check (confidence in ('very_high','high','admin_confirmed','new','ambiguous')),
  actor_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_merge_audits (
  id uuid primary key default gen_random_uuid(),
  source_customer_id uuid not null references public.customers(id) on delete restrict,
  surviving_customer_id uuid not null references public.customers(id) on delete restrict,
  actor_id uuid not null,
  affected_request_count integer not null,
  reason text not null,
  created_at timestamptz not null default now(),
  check (source_customer_id <> surviving_customer_id)
);

create table if not exists public.request_lifecycle_audits (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid,
  request_reference text not null,
  action text not null check (action in ('archived','restored','permanently_deleted')),
  actor_id uuid not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.customer_link_audits enable row level security;
alter table public.customer_merge_audits enable row level security;
alter table public.request_lifecycle_audits enable row level security;
revoke all on public.customer_link_audits, public.customer_merge_audits, public.request_lifecycle_audits from anon, authenticated;
grant select on public.customer_link_audits, public.customer_merge_audits, public.request_lifecycle_audits to authenticated;

drop policy if exists "admins read customer link audits" on public.customer_link_audits;
create policy "admins read customer link audits" on public.customer_link_audits for select to authenticated using (public.is_admin());
drop policy if exists "admins read customer merge audits" on public.customer_merge_audits;
create policy "admins read customer merge audits" on public.customer_merge_audits for select to authenticated using (public.is_admin());
drop policy if exists "admins read request lifecycle audits" on public.request_lifecycle_audits;
create policy "admins read request lifecycle audits" on public.request_lifecycle_audits for select to authenticated using (public.is_admin());

create or replace function public.aps_create_request_with_customer(p_customer jsonb, p_request jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := public.aps_normalize_email(p_customer->>'email');
  v_phone text := public.aps_normalize_phone(p_customer->>'phone');
  v_name text := public.aps_normalize_name(concat_ws(' ', p_customer->>'first_name', p_customer->>'last_name'));
  v_customer public.customers%rowtype;
  v_request_id uuid;
  v_exact_email_count integer;
  v_match_type text := 'new_customer';
  v_basis text := 'new_identity';
  v_confidence text := 'new';
begin
  if v_email is null or v_name is null then raise exception 'Customer name and valid email are required.'; end if;
  if coalesce(p_request->>'service_type','') not in ('ron','mobile','print') then raise exception 'A supported APS service is required.'; end if;

  if nullif(p_customer->>'customer_id','') is not null and public.is_admin() then
    select * into v_customer from public.customers where id=(p_customer->>'customer_id')::uuid and merged_at is null;
    if v_customer.id is null then raise exception 'Selected customer is unavailable.'; end if;
    v_match_type := 'admin_confirmed'; v_basis := 'explicit_customer_id'; v_confidence := 'admin_confirmed';
  end if;

  select count(*) into v_exact_email_count from public.customers
  where merged_at is null and normalized_email = v_email;

  if v_customer.id is null then select * into v_customer from public.customers
  where merged_at is null
    and normalized_email = v_email
    and normalized_phone is not distinct from v_phone
    and normalized_name = v_name
  order by created_at asc limit 1; end if;

  if v_match_type = 'admin_confirmed' then
    null;
  elsif v_customer.id is not null then
    v_match_type := 'automatic'; v_basis := 'email_phone_name'; v_confidence := 'very_high';
  elsif v_exact_email_count = 1 then
    select * into v_customer from public.customers
    where merged_at is null and normalized_email = v_email and normalized_name = v_name
    order by created_at asc limit 1;
    if v_customer.id is not null then
      v_match_type := 'automatic'; v_basis := 'email_compatible_name'; v_confidence := 'high';
    end if;
  end if;

  if v_customer.id is null then
    if exists (select 1 from public.customers where merged_at is null and (normalized_email = v_email or (v_phone is not null and normalized_phone = v_phone))) then
      v_match_type := 'ambiguous_review'; v_basis := 'conflicting_identity'; v_confidence := 'ambiguous';
    end if;
    insert into public.customers(first_name,last_name,email,phone,preferred_contact)
    values (btrim(p_customer->>'first_name'),btrim(p_customer->>'last_name'),v_email,nullif(btrim(p_customer->>'phone'),''),nullif(p_customer->>'preferred_contact',''))
    returning * into v_customer;
  end if;

  insert into public.service_requests(customer_id,service_type,status,workflow_status,preferred_date,preferred_time_window,notes,estimated_total,request_completeness,document_state,participant_state,fulfillment_state,document_upload_exception_reason,document_upload_exception_detail,detected_pdf_page_count,is_same_day_request,is_next_day_request,request_source,appointment_date,appointment_time,appointment_timezone,appointment_location,appointment_link,appointment_platform,appointment_instructions)
  values (v_customer.id,p_request->>'service_type',coalesce(p_request->>'status','under_review'),coalesce(p_request->>'workflow_status','under_review'),nullif(p_request->>'preferred_date','')::date,nullif(p_request->>'preferred_time_window',''),nullif(p_request->>'notes',''),coalesce(nullif(p_request->>'estimated_total','')::numeric,0),coalesce(p_request->>'request_completeness','submitted'),coalesce(p_request->>'document_state','pending'),coalesce(p_request->>'participant_state','submitted'),coalesce(p_request->>'fulfillment_state','not_started'),nullif(p_request->>'document_upload_exception_reason',''),nullif(p_request->>'document_upload_exception_detail',''),nullif(p_request->>'detected_pdf_page_count','')::integer,coalesce((p_request->>'is_same_day_request')::boolean,false),coalesce((p_request->>'is_next_day_request')::boolean,false),case when public.is_admin() then coalesce(nullif(p_request->>'request_source',''),'admin') else 'website' end,nullif(p_request->>'appointment_date','')::date,nullif(p_request->>'appointment_time',''),nullif(p_request->>'appointment_timezone',''),nullif(p_request->>'appointment_location',''),nullif(p_request->>'appointment_link',''),nullif(p_request->>'appointment_platform',''),nullif(p_request->>'appointment_instructions',''))
  returning id into v_request_id;

  insert into public.customer_link_audits(service_request_id,customer_id,link_type,match_basis,confidence)
  values (v_request_id,v_customer.id,v_match_type,v_basis,v_confidence);
  if v_match_type = 'ambiguous_review' then
    insert into public.review_queue_items(service_request_id,blocker_key,title,detail,target_tab)
    values (v_request_id,'possible_existing_customer','Possible existing customer','Contact information matches another profile but identity data conflicts.','customer');
  end if;
  return jsonb_build_object('request_id',v_request_id,'customer_id',v_customer.id,'customer_resolution',v_match_type,'confidence',v_confidence);
end $$;

revoke all on function public.aps_create_request_with_customer(jsonb,jsonb) from public;
grant execute on function public.aps_create_request_with_customer(jsonb,jsonb) to anon, authenticated;

create or replace function public.admin_merge_customer_profiles(p_source uuid,p_survivor uuid,p_actor uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  if p_source = p_survivor then raise exception 'Source and survivor must differ.'; end if;
  if length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'Merge reason is required.'; end if;
  perform 1 from public.customers where id=p_source and merged_at is null for update;
  if not found then raise exception 'Source customer is unavailable.'; end if;
  perform 1 from public.customers where id=p_survivor and merged_at is null for update;
  if not found then raise exception 'Surviving customer is unavailable.'; end if;
  update public.service_requests set customer_id=p_survivor where customer_id=p_source;
  get diagnostics v_count = row_count;
  update public.customers set merged_into_customer_id=p_survivor,merged_at=now() where id=p_source;
  insert into public.customer_merge_audits(source_customer_id,surviving_customer_id,actor_id,affected_request_count,reason)
  values(p_source,p_survivor,p_actor,v_count,btrim(p_reason));
  return jsonb_build_object('ok',true,'affected_request_count',v_count);
end $$;
revoke all on function public.admin_merge_customer_profiles(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_merge_customer_profiles(uuid,uuid,uuid,text) to service_role;

create or replace function public.admin_request_delete_eligibility(p_request uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.service_requests%rowtype; blockers text[] := '{}';
begin
  select * into r from public.service_requests where id=p_request;
  if r.id is null then raise exception 'Request not found.'; end if;
  if coalesce(r.request_source,'website') not in ('test','development','junk','spam') then blockers:=array_append(blockers,'Request is not explicitly classified as test, development, junk, or spam.'); end if;
  if coalesce(r.status,'')='completed' or r.completed_at is not null then blockers:=array_append(blockers,'Completed requests are protected.'); end if;
  if exists(select 1 from public.invoices where service_request_id=p_request) then blockers:=array_append(blockers,'Invoice history is protected.'); end if;
  if exists(select 1 from public.request_payments where service_request_id=p_request and coalesce(is_test,false)=false) or exists(select 1 from public.payments where service_request_id=p_request) then blockers:=array_append(blockers,'Real payment history is protected.'); end if;
  if exists(select 1 from public.proof_transactions where service_request_id=p_request) then blockers:=array_append(blockers,'Proof/RON provider history is protected.'); end if;
  if exists(select 1 from public.request_completion_exceptions where service_request_id=p_request) or exists(select 1 from public.request_completion_facts where service_request_id=p_request and (ron_session_completed or mobile_service_completed or production_completed or scan_completed)) then blockers:=array_append(blockers,'Fulfillment or legal completion history is protected.'); end if;
  return jsonb_build_object('eligible',cardinality(blockers)=0,'blockers',to_jsonb(blockers),'reference','APS-'||upper(substr(r.id::text,1,8)),'request_source',r.request_source);
end $$;
revoke all on function public.admin_request_delete_eligibility(uuid) from public,anon,authenticated;
grant execute on function public.admin_request_delete_eligibility(uuid) to service_role;

create or replace function public.admin_delete_eligible_request(p_request uuid,p_actor uuid,p_confirmation text,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare eligibility jsonb; customer uuid; remaining integer; reference text;
begin
  if p_confirmation <> 'DELETE' then raise exception 'Type DELETE to confirm.'; end if;
  eligibility:=public.admin_request_delete_eligibility(p_request);
  if not (eligibility->>'eligible')::boolean then raise exception 'Request is protected and cannot be permanently deleted.'; end if;
  select customer_id,'APS-'||upper(substr(id::text,1,8)) into customer,reference from public.service_requests where id=p_request for update;
  delete from public.message_attachments where message_id in(select id from public.messages where service_request_id=p_request);
  delete from public.messages where service_request_id=p_request;
  delete from public.request_document_participants where participant_id in(select id from public.request_participants where service_request_id=p_request) or request_file_id in(select id from public.request_files where service_request_id=p_request);
  delete from public.request_participants where service_request_id=p_request;
  delete from public.request_notarial_acts where service_request_id=p_request;
  delete from public.request_completion_facts where service_request_id=p_request;
  delete from public.customer_link_audits where service_request_id=p_request;
  delete from public.service_requests where id=p_request;
  insert into public.request_lifecycle_audits(service_request_id,request_reference,action,actor_id,reason,metadata)
  values(null,reference,'permanently_deleted',p_actor,nullif(btrim(p_reason),''),jsonb_build_object('customer_id',customer));
  select count(*) into remaining from public.service_requests where customer_id=customer;
  return jsonb_build_object('ok',true,'reference',reference,'customer_id',customer,'customer_remaining_requests',remaining);
end $$;
revoke all on function public.admin_delete_eligible_request(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_delete_eligible_request(uuid,uuid,text,text) to service_role;
