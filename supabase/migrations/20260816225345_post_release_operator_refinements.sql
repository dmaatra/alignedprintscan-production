-- Post-release operator refinements. Forward-only and history preserving.

alter table if exists public.request_participants
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text;

create table if not exists public.request_service_conversions (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  previous_service_type text not null check (previous_service_type in ('ron','mobile')),
  new_service_type text not null check (new_service_type in ('ron','mobile')),
  previous_appointment jsonb not null default '{}'::jsonb,
  destination_requirements jsonb not null default '{}'::jsonb,
  prior_service_total numeric not null default 0,
  new_service_total numeric not null default 0,
  amount_paid_at_conversion numeric not null default 0,
  additional_amount_due numeric not null default 0,
  credit_or_refund_due numeric not null default 0,
  reason text not null,
  proof_transaction_preserved boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (previous_service_type <> new_service_type),
  check (prior_service_total >= 0 and new_service_total >= 0 and amount_paid_at_conversion >= 0),
  check (additional_amount_due >= 0 and credit_or_refund_due >= 0)
);

create index if not exists request_service_conversions_request_idx
  on public.request_service_conversions(service_request_id, created_at desc);

alter table public.request_service_conversions enable row level security;
drop policy if exists request_service_conversions_admin_all on public.request_service_conversions;
create policy request_service_conversions_admin_all on public.request_service_conversions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert on public.request_service_conversions to authenticated;

insert into public.message_templates
  (template_key,name,description,subject_template,html_template,text_template,associated_status,required_attachment_type,active,system_template)
values
  ('document_needed_for_quote','Document Needed to Complete Quote','Manual request for the document APS needs before accurately finalizing a quote.','Document needed to complete your quote: {{request_reference}}','<p>Hello {{customer_first_name}},</p><p>We reviewed your {{service_name}} request. To prepare an accurate quote, we need to review the relevant document.</p><p>Please upload it securely from your request page. If you cannot upload it, reply or contact APS for assistance.</p>','We need the relevant document to complete the quote for {{request_reference}}. Please upload it securely from your request page.',null,null,true,true),
  ('document_received_under_review','Document Received / Under Review','Optional manual acknowledgment that a newly supplied document was received and is under review.','Document received and under review: {{request_reference}}','<p>Hello {{customer_first_name}},</p><p>We received the document you supplied for your {{service_name}} request and it is now under review.</p><p>We will contact you if clarification or another document is needed.</p>','We received your document for {{request_reference}} and it is under review.',null,null,true,true),
  ('service_changed_appointment_conversion','Service Changed / Appointment Conversion','Manual explanation of an approved RON and Mobile service conversion, scheduling impact, and next action.','Service changed for {{request_reference}}','<p>Hello {{customer_first_name}},</p><p>Your request was changed from {{previous_service_name}} to {{service_name}}.</p><p>{{message_body}}</p><p>Your original APS reference and request history remain the same. Review your secure request for current scheduling and payment information.</p>','Your request {{request_reference}} was changed from {{previous_service_name}} to {{service_name}}. {{message_body}}',null,null,true,true)
on conflict (template_key) do update set
  name=excluded.name,description=excluded.description,subject_template=excluded.subject_template,
  html_template=excluded.html_template,text_template=excluded.text_template,
  associated_status=excluded.associated_status,required_attachment_type=excluded.required_attachment_type,
  active=true,system_template=true,updated_at=now();
