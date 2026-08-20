-- Release 8: Loan Signing policy, exception, visit, and reviewed financial decisions.
-- Facts and suggestions never create charges, invoices, refunds, or customer messages automatically.
create table public.loan_signing_policy_versions (
  id uuid primary key default gen_random_uuid(), policy_key text not null, version text not null,
  source_type text not null default 'default_aps_policy' check (source_type in ('default_aps_policy','organization_contract','assignment_specific_agreement','manual_authorized_exception')),
  configuration jsonb not null, effective_at timestamptz not null default now(), retired_at timestamptz,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
  unique(policy_key,version)
);

create table public.loan_signing_organization_terms (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  policy_key text not null, policy_version_id uuid references public.loan_signing_policy_versions(id) on delete restrict,
  terms jsonb not null default '{}'::jsonb, effective_at timestamptz not null default now(), retired_at timestamptz,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);

create table public.loan_signing_exceptions (
  id uuid primary key default gen_random_uuid(), loan_signing_assignment_id uuid not null references public.loan_signing_assignments(id) on delete restrict,
  service_request_id uuid not null references public.service_requests(id) on delete restrict, organization_id uuid references public.organizations(id) on delete restrict,
  outcome text not null check (outcome in ('cancelled','no_sign','partial_incomplete','resign_required','return_visit_required','excessive_wait_review','package_document_issue','signer_unavailable','identity_notarization_stop','orderer_instruction_stop','other_review')),
  status text not null default 'review_required' check (status in ('requested','review_required','financial_review','communication_needed','resolved','closed')),
  requested_by_type text check (requested_by_type is null or requested_by_type in ('ordering_organization','signer_customer','aps_staff','title_escrow','signing_service','lender','authorized_other_orderer')),
  requested_at timestamptz, reason_code text, directed_by text, neutral_internal_note text,
  lsa_stage_snapshot text not null, operational_facts jsonb not null default '{}'::jsonb,
  policy_source text not null default 'default_aps_policy' check (policy_source in ('default_aps_policy','organization_contract','assignment_specific_agreement','manual_authorized_exception')),
  policy_version_id uuid references public.loan_signing_policy_versions(id) on delete restrict, policy_snapshot jsonb not null default '{}'::jsonb,
  cause_category text check (cause_category is null or cause_category in ('aps_notary','signer','orderer_package','unknown_review')),
  customer_safe_status text not null default 'additional_review_needed', customer_safe_explanation text,
  resolved_by uuid references auth.users(id) on delete set null, resolved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.loan_signing_visits (
  id uuid primary key default gen_random_uuid(), loan_signing_assignment_id uuid not null references public.loan_signing_assignments(id) on delete restrict,
  service_request_id uuid not null references public.service_requests(id) on delete restrict, exception_id uuid references public.loan_signing_exceptions(id) on delete restrict,
  visit_number integer not null check (visit_number > 0), visit_type text not null check (visit_type in ('initial','resign','return_visit')),
  appointment_at timestamptz, travel_started_at timestamptz, arrival_at timestamptz, signing_started_at timestamptz, signing_ended_at timestamptz, departure_at timestamptz,
  outcome text, created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), unique(loan_signing_assignment_id,visit_number)
);

create table public.loan_signing_additional_charges (
  id uuid primary key default gen_random_uuid(), loan_signing_assignment_id uuid not null references public.loan_signing_assignments(id) on delete restrict,
  service_request_id uuid not null references public.service_requests(id) on delete restrict, organization_id uuid references public.organizations(id) on delete restrict,
  exception_id uuid references public.loan_signing_exceptions(id) on delete restrict,
  charge_type text not null check (charge_type in ('excessive_wait','additional_authorized_travel','authorized_reprint','replacement_package_preparation','additional_signing_visit','resign_fee','cancellation_charge','other_authorized_assignment_adjustment')),
  suggested_amount numeric(12,2) not null default 0 check (suggested_amount >= 0), authorized_amount numeric(12,2) check (authorized_amount is null or authorized_amount >= 0),
  decision text not null default 'pending_review' check (decision in ('pending_review','waived','authorized','invoiced','resolved')),
  reason text, customer_safe_explanation text, authorized_by uuid references auth.users(id) on delete set null, authorized_at timestamptz,
  invoice_id uuid references public.invoices(id) on delete restrict, communication_state text not null default 'not_required' check (communication_state in ('not_required','needed','sent')),
  policy_snapshot jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.loan_signing_financial_resolutions (
  id uuid primary key default gen_random_uuid(), loan_signing_assignment_id uuid not null references public.loan_signing_assignments(id) on delete restrict,
  service_request_id uuid not null references public.service_requests(id) on delete restrict, exception_id uuid not null unique references public.loan_signing_exceptions(id) on delete restrict,
  resolution_type text not null check (resolution_type in ('no_charge','partial_charge','full_agreed_fee','custom_authorized_amount','full_refund','partial_refund','no_refund','no_financial_change')),
  original_agreed_fee numeric(12,2) not null default 0, previously_invoiced numeric(12,2) not null default 0, previously_paid numeric(12,2) not null default 0,
  authorized_charge numeric(12,2) not null default 0, refund_due numeric(12,2) not null default 0, additional_amount_due numeric(12,2) not null default 0, net_retained numeric(12,2) not null default 0,
  decision_reason text not null, customer_safe_explanation text, decision_by uuid not null references auth.users(id) on delete restrict, decision_at timestamptz not null default now(),
  refund_id uuid references public.refunds(id) on delete restrict, invoice_id uuid references public.invoices(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index loan_signing_exceptions_request_status_idx on public.loan_signing_exceptions(service_request_id,status,created_at desc);
create index loan_signing_visits_assignment_idx on public.loan_signing_visits(loan_signing_assignment_id,visit_number);
create index loan_signing_charges_request_decision_idx on public.loan_signing_additional_charges(service_request_id,decision,created_at desc);
create index loan_signing_org_terms_active_idx on public.loan_signing_organization_terms(organization_id,policy_key,effective_at desc) where retired_at is null;

alter table public.loan_signing_policy_versions enable row level security;
alter table public.loan_signing_organization_terms enable row level security;
alter table public.loan_signing_exceptions enable row level security;
alter table public.loan_signing_visits enable row level security;
alter table public.loan_signing_additional_charges enable row level security;
alter table public.loan_signing_financial_resolutions enable row level security;
revoke all on public.loan_signing_policy_versions,public.loan_signing_organization_terms,public.loan_signing_exceptions,public.loan_signing_visits,public.loan_signing_additional_charges,public.loan_signing_financial_resolutions from public,anon,authenticated;
grant select,insert,update,delete on public.loan_signing_policy_versions,public.loan_signing_organization_terms,public.loan_signing_exceptions,public.loan_signing_visits,public.loan_signing_additional_charges,public.loan_signing_financial_resolutions to service_role;

insert into public.loan_signing_policy_versions(policy_key,version,configuration)
values ('lsa_operational_policy','lsa-policy-2026-08-v1','{"cancellation":{"before_preparation_percent":0,"after_preparation_before_travel_percent":50,"after_travel_or_arrival_percent":100,"after_signing_started_percent":100},"wait":{"included_minutes":30,"increment_minutes":30,"amount_per_increment":25},"resign":{"aps_notary_default":0,"orderer_package_review":true,"signer_review":true},"automatic_financial_action":false}'::jsonb)
on conflict(policy_key,version) do nothing;

insert into public.message_templates(template_key,name,description,subject_template,html_template,text_template,associated_status,active) values
('lsa_request_received','Loan Signing Request Received','Acknowledges receipt without confirming the assignment.','Loan Signing request received: {{request_reference}}','<p>We received your Loan Signing request. APS will review assignment details, package requirements, timing, and pricing before confirmation.</p>','We received your Loan Signing request {{request_reference}}.',null,true),
('lsa_information_needed','Loan Signing Assignment Information Needed','Requests missing assignment information.','Information needed: {{request_reference}}','<p>Additional assignment information is needed before APS can confirm this Loan Signing.</p><p>{{message_body}}</p>','Additional information is needed for {{request_reference}}. {{message_body}}',null,true),
('lsa_assignment_confirmed','Loan Signing Assignment Confirmed','Confirms an accepted assignment.','Loan Signing confirmed: {{request_reference}}','<p>Your Loan Signing assignment has been reviewed and confirmed. Current appointment and preparation details are available in your secure portal.</p>','Loan Signing {{request_reference}} is confirmed.',null,true),
('lsa_signer_confirmation','Loan Signing Signer Confirmation','Provides a neutral signer-confirmation update.','Signer confirmation update: {{request_reference}}','<p>APS has an update regarding signer confirmation for this assignment.</p><p>{{message_body}}</p>','Signer confirmation update for {{request_reference}}. {{message_body}}',null,true),
('lsa_cancellation_under_review','Loan Signing Cancellation Under Review','Acknowledges review without promising a charge or refund.','Cancellation review: {{request_reference}}','<p>The cancellation request is under review. APS will consider the work actually performed and the applicable assignment terms before confirming any financial result.</p>','Cancellation for {{request_reference}} is under review.',null,true),
('lsa_signing_not_completed','Loan Signing Could Not Be Completed','Neutral no-sign or incomplete-signing notice.','Signing follow-up: {{request_reference}}','<p>The signing could not be completed as planned. APS is reviewing the assignment and will provide the appropriate next step.</p>','The signing for {{request_reference}} could not be completed as planned.',null,true),
('lsa_additional_appointment_needed','Loan Signing Additional Appointment Needed','Neutral resign/return-visit notice.','Additional signing appointment: {{request_reference}}','<p>An additional signing appointment is needed. APS will confirm scheduling and any authorized financial update separately.</p>','An additional appointment is needed for {{request_reference}}.',null,true),
('lsa_exception_resolved','Loan Signing Exception Resolved','Communicates the customer-safe resolved outcome.','Loan Signing review resolved: {{request_reference}}','<p>The additional review for this assignment has been resolved.</p><p>{{message_body}}</p>','The review for {{request_reference}} has been resolved. {{message_body}}',null,true)
on conflict(template_key) do update set name=excluded.name,description=excluded.description,subject_template=excluded.subject_template,html_template=excluded.html_template,text_template=excluded.text_template,active=true,updated_at=now();

comment on table public.loan_signing_exceptions is 'Release 8 facts and policy review; records never imply an automatic financial charge.';
comment on table public.loan_signing_financial_resolutions is 'Admin-authorized decision linked to the existing APS invoice/refund ledgers; original pricing and payment history remain immutable.';
