-- Release 7: deep Loan Signing fulfillment and authoritative assignment requirements.
alter table public.loan_signing_assignments
  add column instructions_reviewed_at timestamptz,
  add column instructions_reviewed_by uuid references auth.users(id) on delete set null,
  add column callback_confirmation_required text not null default 'unknown' check (callback_confirmation_required in ('yes','no','unknown')),
  add column signer_confirmation_status text not null default 'not_required' check (signer_confirmation_status in ('not_required','required_pending','confirmed','unable_to_reach','reschedule_needed','other_review')),
  add column signer_contacted_at timestamptz,
  add column signer_contact_method text,
  add column signer_confirmation_note text,
  add column printing_required boolean,
  add column paper_size text check (paper_size is null or paper_size in ('letter','legal','mixed_letter_legal','other')),
  add column sidedness text check (sidedness is null or sidedness in ('single_sided','double_sided','mixed_per_instructions','unknown')),
  add column print_color text check (print_color is null or print_color in ('black_white','color','mixed','per_instructions')),
  add column print_scaling text check (print_scaling is null or print_scaling in ('actual_size_100','fit_shrink','mixed_per_instructions','other_authorized')),
  add column signing_set_count integer not null default 1 check (signing_set_count >= 0),
  add column borrower_copy_count integer not null default 0 check (borrower_copy_count >= 0),
  add column additional_copy_count integer not null default 0 check (additional_copy_count >= 0),
  add column expected_printed_pages integer check (expected_printed_pages is null or expected_printed_pages >= 0),
  add column expected_printed_sheets integer check (expected_printed_sheets is null or expected_printed_sheets >= 0),
  add column print_status text not null default 'not_ready' check (print_status in ('not_required','not_ready','ready_to_print','printing','printed','qc_required','qc_passed','reprint_required')),
  add column print_qc_status text not null default 'not_required' check (print_qc_status in ('not_required','pending','passed','failed_reprint_required')),
  add column borrower_copy_status text not null default 'not_required' check (borrower_copy_status in ('not_required','pending','prepared','digital_per_instructions','other_authorized')),
  add column stacking_order_required text not null default 'unknown' check (stacking_order_required in ('yes','no','unknown')),
  add column stacking_order_type text check (stacking_order_type is null or stacking_order_type in ('original_order','specified_return_order','scanback_order','other_authorized')),
  add column stacking_instructions text,
  add column signing_outcome text check (signing_outcome is null or signing_outcome in ('completed','partially_completed_review','did_not_complete_review')),
  add column post_signing_qc_status text not null default 'pending' check (post_signing_qc_status in ('pending','passed','issue_review')),
  add column arrival_at timestamptz,
  add column signing_started_at timestamptz,
  add column signing_ended_at timestamptz,
  add column departure_at timestamptz,
  add column resign_review_required boolean not null default false,
  add column scope_review_required boolean not null default false,
  add column completed_at timestamptz;

alter table public.loan_signing_assignments drop constraint if exists loan_signing_assignments_return_method_check;
alter table public.loan_signing_assignments add constraint loan_signing_assignments_return_method_check check (return_method is null or return_method in ('prepaid_carrier_label','fedex','ups','usps','direct_title_escrow','other_authorized','no_physical_return'));

create table public.loan_signing_requirements (
  id uuid primary key default gen_random_uuid(), loan_signing_assignment_id uuid not null references public.loan_signing_assignments(id) on delete cascade,
  service_request_id uuid not null references public.service_requests(id) on delete cascade, organization_id uuid references public.organizations(id) on delete restrict,
  requirement_group text not null check (requirement_group in ('assignment','signers','appointment','printing','package','stipulations','signing','scanbacks','return','completion')),
  requirement_key text not null, title text not null, instructions text, applicability text not null default 'unknown' check (applicability in ('not_applicable','unknown','required')),
  status text not null default 'unknown' check (status in ('not_applicable','unknown','needs_review','required','pending','satisfied','blocked','issue','waived')),
  source_type text check (source_type is null or source_type in ('orderer_instructions','closing_instructions','shipping_label','email_message','title_escrow_instruction','signing_service_instruction','admin_verified','other_authoritative_source')),
  source_note text, customer_visible boolean not null default false, sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null, satisfied_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(loan_signing_assignment_id, requirement_key)
);

create table public.loan_signing_package_versions (
  id uuid primary key default gen_random_uuid(), loan_signing_assignment_id uuid not null references public.loan_signing_assignments(id) on delete restrict,
  service_request_id uuid not null references public.service_requests(id) on delete cascade, organization_id uuid references public.organizations(id) on delete restrict,
  version_number integer not null check (version_number > 0), source_file_id uuid references public.request_files(id) on delete restrict,
  authoritative_page_count integer check (authoritative_page_count is null or authoritative_page_count >= 0), letter_page_count integer check (letter_page_count is null or letter_page_count >= 0), legal_page_count integer check (legal_page_count is null or legal_page_count >= 0),
  status text not null default 'active' check (status in ('active','superseded')), received_at timestamptz not null default now(), superseded_at timestamptz,
  replacement_reason text, dependent_review_required boolean not null default false, pricing_impact_review boolean not null default false,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), unique(loan_signing_assignment_id, version_number)
);
create unique index loan_signing_one_active_package on public.loan_signing_package_versions(loan_signing_assignment_id) where status='active';

create table public.loan_signing_stipulations (
  id uuid primary key default gen_random_uuid(), loan_signing_assignment_id uuid not null references public.loan_signing_assignments(id) on delete cascade,
  service_request_id uuid not null references public.service_requests(id) on delete cascade, organization_id uuid references public.organizations(id) on delete restrict,
  title text not null, instructions text, required boolean not null default true, status text not null default 'pending' check (status in ('pending','collected','satisfied','unable_to_obtain','waived_by_authorized_orderer','needs_review')),
  source_type text, waiver_source text, proof_file_id uuid references public.request_files(id) on delete restrict, proof_private boolean not null default true,
  created_by uuid references auth.users(id) on delete set null, resolved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.loan_signing_scanbacks (
  id uuid primary key default gen_random_uuid(), loan_signing_assignment_id uuid not null references public.loan_signing_assignments(id) on delete cascade,
  service_request_id uuid not null references public.service_requests(id) on delete cascade, organization_id uuid references public.organizations(id) on delete restrict,
  package_version_id uuid references public.loan_signing_package_versions(id) on delete restrict, content_scope text not null default 'full_package' check (content_scope in ('full_package','specified_pages','other_per_instructions')),
  instructions text, status text not null default 'needed' check (status in ('needed','scanning','qc','ready_to_submit','submitted','accepted','approval_pending','approved_for_return','correction_required')),
  qc_status text not null default 'pending' check (qc_status in ('pending','passed','failed')), submitted_at timestamptz, submitted_by uuid references auth.users(id) on delete set null,
  submission_method text, recipient_destination text, confirmation_reference text, approval_source text, approved_at timestamptz, correction_instructions text, resolved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.loan_signing_returns (
  id uuid primary key default gen_random_uuid(), loan_signing_assignment_id uuid not null references public.loan_signing_assignments(id) on delete cascade,
  service_request_id uuid not null references public.service_requests(id) on delete cascade, organization_id uuid references public.organizations(id) on delete restrict,
  return_method text not null check (return_method in ('prepaid_carrier_label','fedex','ups','usps','direct_title_escrow','other_authorized','no_physical_return')),
  destination_name text, destination_department text, destination_address_line1 text, destination_address_line2 text, destination_city text, destination_state text, destination_zip text,
  delivery_window text, delivery_instructions text, carrier text, label_required boolean not null default false, label_provided boolean not null default false,
  tracking_required boolean not null default false, tracking_number text, tracking_status text not null default 'not_yet_available' check (tracking_status in ('not_yet_available','recorded','in_transit','delivered','exception')),
  drop_off_location text, drop_off_at timestamptz, proof_required boolean not null default false, proof_file_id uuid references public.request_files(id) on delete restrict,
  proof_recorded_at timestamptz, status text not null default 'pending' check (status in ('pending','ready','returned','superseded')), completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index loan_signing_requirements_assignment_group on public.loan_signing_requirements(loan_signing_assignment_id, requirement_group, sort_order);
create index loan_signing_packages_assignment on public.loan_signing_package_versions(loan_signing_assignment_id, version_number desc);
create index loan_signing_stipulations_assignment on public.loan_signing_stipulations(loan_signing_assignment_id, status);
create index loan_signing_scanbacks_assignment on public.loan_signing_scanbacks(loan_signing_assignment_id, created_at desc);
create index loan_signing_returns_assignment on public.loan_signing_returns(loan_signing_assignment_id, created_at desc);

alter table public.loan_signing_requirements enable row level security;
alter table public.loan_signing_package_versions enable row level security;
alter table public.loan_signing_stipulations enable row level security;
alter table public.loan_signing_scanbacks enable row level security;
alter table public.loan_signing_returns enable row level security;
revoke all on public.loan_signing_requirements, public.loan_signing_package_versions, public.loan_signing_stipulations, public.loan_signing_scanbacks, public.loan_signing_returns from public, anon, authenticated;
grant select,insert,update,delete on public.loan_signing_requirements, public.loan_signing_package_versions, public.loan_signing_stipulations, public.loan_signing_scanbacks, public.loan_signing_returns to service_role;

alter table public.request_files drop constraint if exists request_files_document_classification_check;
alter table public.request_files add constraint request_files_document_classification_check check (document_classification in (
  'customer_document','customer_deliverable','internal_document','supporting_document','source_document','completed_notarized_document','audit_document','proof_audit_trail',
  'lsa_signing_package_source','lsa_signer_copy','lsa_closing_instructions','lsa_shipping_label','lsa_scanback_instructions','lsa_return_instructions','lsa_redraw_correction','lsa_other_assignment_document',
  'lsa_scanback_private','lsa_stipulation_proof_private','lsa_dropoff_proof_private'
));
comment on table public.loan_signing_requirements is 'Authoritative Release 7 requirements; applicability and source are recorded, never inferred from package text.';
comment on table public.loan_signing_package_versions is 'Immutable Loan Signing package version history; replacement packages supersede rather than overwrite.';
comment on column public.loan_signing_stipulations.proof_private is 'Sensitive stipulation proof remains internal unless separately and deliberately released through the existing document boundary.';
