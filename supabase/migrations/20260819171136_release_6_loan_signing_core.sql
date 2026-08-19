-- Release 6: Loan Signing as the fourth canonical APS service.
create table public.loan_signing_assignments (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null unique references public.service_requests(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete restrict,
  ordering_party_type text not null default 'individual' check (ordering_party_type in ('individual','title_escrow','signing_service','lender','law_office','other_business')),
  ordering_party_name text,
  company_file_number text,
  escrow_transaction_number text,
  signing_type text not null check (signing_type in ('buyer_purchase','seller','refinance','heloc','loan_modification','reverse_mortgage','commercial','other_custom')),
  signing_method text not null check (signing_method in ('in_person_mobile','ron','either_tbd')),
  property_address_line1 text,
  property_address_line2 text,
  property_city text,
  property_state text,
  property_zip text,
  signing_address_line1 text,
  signing_address_line2 text,
  signing_city text,
  signing_state text,
  signing_zip text,
  signing_location_notes text,
  signer_confirmation_required boolean not null default false,
  package_status text not null default 'not_provided' check (package_status in ('not_provided','awaiting_package','package_received','replacement_received','package_ready')),
  package_received_at timestamptz,
  package_page_count integer check (package_page_count is null or package_page_count >= 0),
  borrower_copy_required text not null default 'unknown' check (borrower_copy_required in ('yes','no','unknown')),
  scanbacks_required text not null default 'unknown' check (scanbacks_required in ('yes','no','unknown')),
  approval_before_return_required text not null default 'unknown' check (approval_before_return_required in ('yes','no','unknown')),
  physical_return_required text not null default 'unknown' check (physical_return_required in ('yes','no','unknown')),
  return_method text check (return_method is null or return_method in ('prepaid_carrier_label','fedex','ups','usps','direct_title_escrow','other_authorized')),
  prepaid_label_provided text not null default 'unknown' check (prepaid_label_provided in ('yes','no','unknown')),
  stipulations text,
  lsa_stage text not null default 'assignment_received' check (lsa_stage in ('assignment_received','instructions_review','package_preparation','ready_for_appointment','signing','post_signing_requirements','return','completed')),
  pricing_source text not null default 'standard_aps' check (pricing_source in ('standard_aps','organization_contracted','offered_assignment_fee','aps_counter','custom_quote')),
  base_assignment_fee numeric(12,2) not null default 0 check (base_assignment_fee >= 0),
  offered_fee numeric(12,2) check (offered_fee is null or offered_fee >= 0),
  aps_counter numeric(12,2) check (aps_counter is null or aps_counter >= 0),
  agreed_fee numeric(12,2) check (agreed_fee is null or agreed_fee >= 0),
  travel_adjustment numeric(12,2) not null default 0,
  printing_overage numeric(12,2) not null default 0,
  after_hours_adjustment numeric(12,2) not null default 0,
  other_authorized_adjustment numeric(12,2) not null default 0,
  pricing_status text not null default 'draft' check (pricing_status in ('draft','offered','countered','accepted','declined','superseded')),
  payment_terms text not null check (payment_terms in ('prepaid','due_on_receipt','net_15','net_30')),
  appointment_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.loan_signing_pricing_snapshots (
  id uuid primary key default gen_random_uuid(),
  loan_signing_assignment_id uuid not null references public.loan_signing_assignments(id) on delete restrict,
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  pricing_source text not null,
  signing_type text not null,
  base_assignment_fee numeric(12,2) not null,
  offered_fee numeric(12,2),
  aps_counter numeric(12,2),
  agreed_fee numeric(12,2) not null,
  payment_terms text not null,
  pricing_status text not null,
  pricing_policy_version text not null default 'lsa-standard-2026-08',
  accepted_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index loan_signing_active_pricing_snapshot_unique on public.loan_signing_pricing_snapshots(loan_signing_assignment_id) where pricing_status='accepted';
create index loan_signing_assignments_org_stage_idx on public.loan_signing_assignments(organization_id,lsa_stage,created_at desc);
create index loan_signing_assignments_file_idx on public.loan_signing_assignments(company_file_number) where company_file_number is not null;

alter table public.loan_signing_assignments enable row level security;
alter table public.loan_signing_pricing_snapshots enable row level security;
revoke all on public.loan_signing_assignments, public.loan_signing_pricing_snapshots from public, anon, authenticated;
grant select,insert,update,delete on public.loan_signing_assignments, public.loan_signing_pricing_snapshots to service_role;

comment on table public.loan_signing_assignments is 'Release 6 Loan Signing core architecture; canonical parent is service_requests. Deep Release 7 fulfillment requirements are intentionally absent.';
comment on column public.loan_signing_assignments.property_address_line1 is 'Property address; never inferred as the signing location.';
comment on column public.loan_signing_assignments.signing_address_line1 is 'Signing location; independent from property and return destinations.';

alter table public.request_files drop constraint if exists request_files_document_classification_check;
alter table public.request_files add constraint request_files_document_classification_check check (document_classification in (
  'customer_document','customer_deliverable','internal_document','supporting_document','source_document','completed_notarized_document','audit_document','proof_audit_trail',
  'lsa_signing_package_source','lsa_signer_copy','lsa_closing_instructions','lsa_shipping_label',
  'lsa_scanback_instructions','lsa_return_instructions','lsa_redraw_correction','lsa_other_assignment_document'
));

create or replace function public.aps_create_request_with_customer(p_customer jsonb, p_request jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_email text := public.aps_normalize_email(p_customer->>'email');
  v_phone text := public.aps_normalize_phone(p_customer->>'phone');
  v_name text := public.aps_normalize_name(concat_ws(' ',p_customer->>'first_name',p_customer->>'last_name'));
  v_customer public.customers%rowtype; v_request_id uuid; v_exact_email_count integer;
  v_match_type text := 'new_customer'; v_basis text := 'new_identity'; v_confidence text := 'new';
begin
  if v_email is null or v_name is null then raise exception 'Customer name and valid email are required.'; end if;
  if coalesce(p_request->>'service_type','') not in ('ron','mobile','print','loan_signing') then raise exception 'A supported APS service is required.'; end if;
  if nullif(p_customer->>'customer_id','') is not null and public.is_admin() then
    select * into v_customer from public.customers where id=(p_customer->>'customer_id')::uuid and merged_at is null;
    if v_customer.id is null then raise exception 'Selected customer is unavailable.'; end if;
    v_match_type:='admin_confirmed'; v_basis:='explicit_customer_id'; v_confidence:='admin_confirmed';
  end if;
  select count(*) into v_exact_email_count from public.customers where merged_at is null and normalized_email=v_email;
  if v_customer.id is null then select * into v_customer from public.customers where merged_at is null and normalized_email=v_email and normalized_phone is not distinct from v_phone and normalized_name=v_name order by created_at limit 1; end if;
  if v_match_type='admin_confirmed' then null;
  elsif v_customer.id is not null then v_match_type:='automatic';v_basis:='email_phone_name';v_confidence:='very_high';
  elsif v_exact_email_count=1 then
    select * into v_customer from public.customers where merged_at is null and normalized_email=v_email and normalized_name=v_name order by created_at limit 1;
    if v_customer.id is not null then v_match_type:='automatic';v_basis:='email_compatible_name';v_confidence:='high'; end if;
  end if;
  if v_customer.id is null then
    if exists(select 1 from public.customers where merged_at is null and (normalized_email=v_email or (v_phone is not null and normalized_phone=v_phone))) then v_match_type:='ambiguous_review';v_basis:='conflicting_identity';v_confidence:='ambiguous'; end if;
    insert into public.customers(first_name,last_name,email,phone,preferred_contact) values(btrim(p_customer->>'first_name'),btrim(p_customer->>'last_name'),v_email,nullif(btrim(p_customer->>'phone'),''),nullif(p_customer->>'preferred_contact','')) returning * into v_customer;
  end if;
  insert into public.service_requests(customer_id,service_type,status,workflow_status,preferred_date,preferred_time_window,notes,estimated_total,request_completeness,document_state,participant_state,fulfillment_state,document_upload_exception_reason,document_upload_exception_detail,detected_pdf_page_count,is_same_day_request,is_next_day_request,request_source,appointment_date,appointment_time,appointment_timezone,appointment_location,appointment_link,appointment_platform,appointment_instructions)
  values(v_customer.id,p_request->>'service_type',coalesce(p_request->>'status','under_review'),coalesce(p_request->>'workflow_status','under_review'),nullif(p_request->>'preferred_date','')::date,nullif(p_request->>'preferred_time_window',''),nullif(p_request->>'notes',''),coalesce(nullif(p_request->>'estimated_total','')::numeric,0),coalesce(p_request->>'request_completeness','submitted'),coalesce(p_request->>'document_state','pending'),coalesce(p_request->>'participant_state','submitted'),coalesce(p_request->>'fulfillment_state','not_started'),nullif(p_request->>'document_upload_exception_reason',''),nullif(p_request->>'document_upload_exception_detail',''),nullif(p_request->>'detected_pdf_page_count','')::integer,coalesce((p_request->>'is_same_day_request')::boolean,false),coalesce((p_request->>'is_next_day_request')::boolean,false),case when public.is_admin() then coalesce(nullif(p_request->>'request_source',''),'admin') else 'website' end,nullif(p_request->>'appointment_date','')::date,nullif(p_request->>'appointment_time',''),nullif(p_request->>'appointment_timezone',''),nullif(p_request->>'appointment_location',''),nullif(p_request->>'appointment_link',''),nullif(p_request->>'appointment_platform',''),nullif(p_request->>'appointment_instructions','')) returning id into v_request_id;
  insert into public.customer_link_audits(service_request_id,customer_id,link_type,match_basis,confidence) values(v_request_id,v_customer.id,v_match_type,v_basis,v_confidence);
  if v_match_type='ambiguous_review' then insert into public.review_queue_items(service_request_id,blocker_key,title,detail,target_tab) values(v_request_id,'possible_existing_customer','Possible existing customer','Contact information matches another profile but identity data conflicts.','customer'); end if;
  return jsonb_build_object('request_id',v_request_id,'customer_id',v_customer.id,'customer_resolution',v_match_type,'confidence',v_confidence);
end $$;
revoke all on function public.aps_create_request_with_customer(jsonb,jsonb) from public;
grant execute on function public.aps_create_request_with_customer(jsonb,jsonb) to anon,authenticated;
