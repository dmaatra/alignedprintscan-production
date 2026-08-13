-- APS operational workflow refactor.
-- Forward-only and additive: preserves every existing request, document,
-- quote item, invoice, payment, communication, and timeline row.

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  quote_number text not null,
  state text not null default 'draft' check (state in ('draft','saved','sent','approved','declined','superseded')),
  amount numeric not null default 0 check (amount >= 0),
  notes text,
  version integer not null default 1 check (version > 0),
  sent_at timestamptz,
  approved_at timestamptz,
  declined_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_request_id, version),
  unique (quote_number)
);

create table if not exists public.request_participants (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  participant_type text not null check (participant_type in ('requester','signer','witness')),
  witness_source text check (witness_source is null or witness_source in ('customer','aps','unsure')),
  full_legal_name text,
  email text,
  mobile_phone text,
  address jsonb,
  quantity integer not null default 1 check (quantity > 0),
  identity_name_confirmed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (participant_type = 'witness' or witness_source is null),
  check (witness_source <> 'aps' or full_legal_name is null)
);

create table if not exists public.request_notarial_acts (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  act_number integer not null check (act_number > 0),
  act_type text not null,
  requires_admin_review boolean not null default false,
  created_at timestamptz not null default now(),
  unique (service_request_id, act_number)
);

create table if not exists public.request_document_participants (
  id uuid primary key default gen_random_uuid(),
  request_file_id uuid not null references public.request_files(id) on delete cascade,
  participant_id uuid not null references public.request_participants(id) on delete cascade,
  role text not null check (role in ('signer','witness')),
  created_at timestamptz not null default now(),
  unique (request_file_id, participant_id, role)
);

create table if not exists public.review_queue_items (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  blocker_key text not null,
  title text not null,
  detail text,
  target_tab text not null default 'overview',
  state text not null default 'open' check (state in ('open','resolved','dismissed')),
  source_object_type text,
  source_object_id uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists review_queue_open_blocker_unique
  on public.review_queue_items(service_request_id, blocker_key, coalesce(source_object_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where state = 'open';

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  name text not null,
  description text,
  subject_template text not null,
  html_template text not null,
  text_template text,
  associated_status text,
  required_attachment_type text check (required_attachment_type is null or required_attachment_type in ('quote','invoice','deliverable')),
  active boolean not null default true,
  system_template boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid references public.service_requests(id) on delete restrict,
  template_id uuid references public.message_templates(id) on delete set null,
  direction text not null default 'outbound' check (direction in ('outbound','inbound')),
  visibility text not null default 'customer' check (visibility in ('customer','internal')),
  recipient text not null,
  cc text[] not null default '{}',
  subject text not null,
  rendered_html text,
  rendered_text text,
  delivery_state text not null default 'draft' check (delivery_state in ('draft','sending','sent','failed','skipped')),
  provider_message_id text,
  associated_status text,
  error_message text,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  attachment_type text not null check (attachment_type in ('quote','invoice','document')),
  quote_id uuid references public.quotes(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete restrict,
  request_file_id uuid references public.request_files(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (num_nonnulls(quote_id, invoice_id, request_file_id) = 1),
  unique (message_id, attachment_type, quote_id, invoice_id, request_file_id)
);

alter table public.service_requests add column if not exists request_completeness text not null default 'pending';
alter table public.service_requests add column if not exists document_state text not null default 'pending';
alter table public.service_requests add column if not exists participant_state text not null default 'pending';
alter table public.service_requests add column if not exists fulfillment_state text not null default 'not_started';
alter table public.service_requests add column if not exists document_upload_exception_reason text;
alter table public.service_requests add column if not exists document_upload_exception_detail text;
alter table public.service_requests add column if not exists current_quote_id uuid references public.quotes(id) on delete set null;

alter table public.request_files add column if not exists document_classification text not null default 'customer_document';
alter table public.request_files add column if not exists customer_visible boolean not null default false;
alter table public.request_files add column if not exists eligible_for_delivery boolean not null default false;
alter table public.request_files add column if not exists version integer not null default 1;
alter table public.request_files add column if not exists content_fingerprint text;
alter table public.request_files add column if not exists reviewed_fingerprint text;
alter table public.request_files add column if not exists review_state text not null default 'pending';
alter table public.request_files add column if not exists reviewed_at timestamptz;
alter table public.request_files add column if not exists reviewed_by uuid;

alter table public.invoices add column if not exists source_quote_id uuid references public.quotes(id) on delete restrict;
alter table public.invoices add column if not exists source_reason text;
update public.invoices set invoice_type = 'primary'
  where lower(coalesce(invoice_type,'')) in ('initial','invoice_1') or invoice_number like '%-01';
update public.invoices set invoice_type = 'supplemental'
  where lower(coalesce(invoice_type,'')) in ('final','final_balance','additional') or invoice_number like '%-02';

-- Historical duplicates are preserved for audit. Only rows linked to a new
-- approved quote participate in the durable primary-invoice uniqueness rule.
create unique index if not exists invoices_one_primary_per_source_quote
  on public.invoices(source_quote_id)
  where source_quote_id is not null and invoice_type = 'primary';
create unique index if not exists request_payments_external_reference_unique
  on public.request_payments(external_reference)
  where external_reference is not null and btrim(external_reference) <> '';

insert into public.message_templates
  (template_key,name,description,subject_template,html_template,text_template,associated_status,required_attachment_type)
values
 ('request_received','Request Received','Existing intake confirmation','Request received: {{request_reference}}','<h1>Request Received</h1><p>Hello {{customer_first_name}},</p><p>We received {{request_reference}} and will review it shortly.</p>','We received {{request_reference}} and will review it shortly.',null,null),
 ('quote_ready','Quote Ready','Quote review and approval','Quote ready: {{request_reference}}','<h1>Your Quote Is Ready</h1><p>Hello {{customer_first_name}},</p><p>Please review and approve the attached quote for {{request_reference}}.</p>','Please review and approve the quote for {{request_reference}}.','quote_ready','quote'),
 ('awaiting_payment_reminder','Awaiting Payment Reminder','Outstanding primary or supplemental balance','Payment reminder: {{request_reference}}','<h1>Payment Reminder</h1><p>Your balance of {{balance_due}} is still due for {{request_reference}}.</p>','Your balance of {{balance_due}} is still due.','awaiting_payment',null),
 ('payment_received','Payment Received','Payment confirmation','Payment received: {{request_reference}}','<h1>Payment Received</h1><p>Thank you. Your payment was received for {{request_reference}}.</p>','Your payment was received.','payment_received',null),
 ('appointment_confirmed','Appointment Confirmed','General appointment confirmation','Appointment confirmed: {{request_reference}}','<h1>Appointment Confirmed</h1><p>Your appointment details are confirmed.</p>','Your appointment is confirmed.','appointment_confirmed',null),
 ('appointment_reminder','Appointment Reminder','Upcoming appointment reminder','Appointment reminder: {{request_reference}}','<h1>Appointment Reminder</h1><p>This is a reminder for your upcoming appointment.</p>','Appointment reminder.',null,null),
 ('appointment_rescheduled','Appointment Rescheduled','Appointment date or time changed','Appointment rescheduled: {{request_reference}}','<h1>Appointment Rescheduled</h1><p>Your appointment details have changed. Please review them in your request.</p>','Your appointment has been rescheduled.','appointment_needs_rescheduling',null),
 ('ron_session_ready','RON Session Ready','Secure RON session details','RON session ready: {{request_reference}}','<h1>Your Online Notary Session Is Ready</h1><p>Review your preparation details and secure session link.</p>','Your online notary session is ready.',null,null),
 ('mobile_appointment_confirmation','Mobile Appointment Confirmation','Mobile location and preparation','Mobile appointment confirmed: {{request_reference}}','<h1>Mobile Appointment Confirmed</h1><p>Please review the appointment location and preparation instructions.</p>','Your mobile appointment is confirmed.','appointment_confirmed',null),
 ('completed_scan_delivery','Completed Scan Delivery','Completed scan attachment delivery','Your completed scans: {{request_reference}}','<h1>Your Scans Are Ready</h1><p>Your requested scans are attached and available in your request.</p>','Your requested scans are ready.',null,'deliverable'),
 ('document_delivery','Document Delivery','Customer deliverable documents','Your documents: {{request_reference}}','<h1>Your Documents Are Ready</h1><p>Your documents are attached and available in your request.</p>','Your documents are ready.',null,'deliverable'),
 ('final_invoice','Invoice / Final Invoice','Invoice delivery','Invoice ready: {{request_reference}}','<h1>Your Invoice Is Ready</h1><p>Please review the attached invoice.</p>','Your invoice is ready.',null,'invoice'),
 ('order_completed','Order Completed','Service completion confirmation','Service completed: {{request_reference}}','<h1>Your Service Is Complete</h1><p>Thank you for choosing Aligned Print & Scan.</p>','Your service is complete.','completed',null),
 ('cancellation','Cancellation','Approved cancellation notice','Request cancelled: {{request_reference}}','<h1>Request Cancelled</h1><p>Your request has been cancelled.</p>','Your request has been cancelled.','cancelled',null),
 ('general_customer_message','General Customer Message','Branded freeform message','Update for {{request_reference}}','<p>Hello {{customer_first_name}},</p><p>{{message_body}}</p>','{{message_body}}',null,null)
on conflict (template_key) do update set
  name=excluded.name, description=excluded.description,
  associated_status=excluded.associated_status,
  required_attachment_type=excluded.required_attachment_type,
  active=true, updated_at=now();

-- Existing communication history is retained and registered in the unified
-- message store without changing provider IDs or live wording.
insert into public.messages
  (service_request_id,direction,visibility,recipient,subject,rendered_text,delivery_state,provider_message_id,sent_at,created_at)
select c.service_request_id,coalesce(c.direction,'outbound'),'customer','legacy-recipient-unavailable',
       coalesce(c.subject,'APS message'),c.message,
       case when lower(coalesce(c.delivery_status,'')) in ('sent','delivered') then 'sent'
            when lower(coalesce(c.delivery_status,'')) = 'failed' then 'failed' else 'skipped' end,
       c.provider_message_id,c.created_at,c.created_at
from public.request_communications c
where not exists (
  select 1 from public.messages m
  where m.service_request_id=c.service_request_id
    and m.created_at=c.created_at
    and coalesce(m.subject,'')=coalesce(c.subject,'')
);

do $rls$
declare t text;
begin
  foreach t in array array['quotes','request_participants','request_notarial_acts','request_document_participants','review_queue_items','message_templates','messages','message_attachments'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from anon, authenticated',t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated',t);
    execute format('drop policy if exists %I on public.%I','aps_admin_only_'||t,t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))','aps_admin_only_'||t,t);
  end loop;
end
$rls$;

grant insert on public.request_participants, public.request_notarial_acts to anon;
create policy aps_intake_insert_participants on public.request_participants for insert to anon
  with check (participant_type in ('signer','witness') and service_request_id is not null);
create policy aps_intake_insert_notarial_acts on public.request_notarial_acts for insert to anon
  with check (service_request_id is not null and act_number > 0);

-- Remove historical test/public-read policies. Public intake retains INSERT
-- only; customer portal reads continue through the scoped service-role Edge
-- Function. Authenticated browser access is restricted to APS administrators.
drop policy if exists "Allow anon customers all during testing" on public.customers;
drop policy if exists "Allow customers select for public form users" on public.customers;
drop policy if exists "Allow form pipeline customers" on public.customers;
drop policy if exists "allow select customers" on public.customers;
drop policy if exists "public read invoice items" on public.invoice_items;
drop policy if exists "Allow admin invoice item access" on public.invoice_items;
drop policy if exists "admin invoice item access" on public.invoice_items;
drop policy if exists "public read invoices" on public.invoices;
drop policy if exists "admin invoice access" on public.invoices;
drop policy if exists "Allow form pipeline mobile requests" on public.mobile_notary_requests;
drop policy if exists "Allow mobile requests for public form users" on public.mobile_notary_requests;
drop policy if exists "Allow form pipeline print scan requests" on public.print_scan_requests;
drop policy if exists "Allow print scan requests for public form users" on public.print_scan_requests;
drop policy if exists "Allow form pipeline request files" on public.request_files;
drop policy if exists "Allow request files for public form users" on public.request_files;
drop policy if exists "Allow form pipeline ron requests" on public.ron_requests;
drop policy if exists "Allow ron requests for public form users" on public.ron_requests;
drop policy if exists "Allow form pipeline service requests" on public.service_requests;
drop policy if exists "Allow service requests for public form users" on public.service_requests;
drop policy if exists "public read status updates" on public.request_status_updates;
drop policy if exists "public update status updates" on public.request_status_updates;
drop policy if exists "admin status update access" on public.request_status_updates;
drop policy if exists "authenticated_read_customer_actions" on public.customer_action_requests;
drop policy if exists "authenticated_read_refunds" on public.refund_reviews;
drop policy if exists "authenticated_read_communications" on public.request_communications;
drop policy if exists "authenticated_read_timeline" on public.request_timeline_events;
drop policy if exists "Allow public reads from service request files" on storage.objects;

create policy aps_admin_invoice_items on public.invoice_items for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy aps_admin_invoices on public.invoices for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy aps_admin_customer_actions on public.customer_action_requests for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy aps_admin_refunds on public.refund_reviews for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy aps_admin_communications on public.request_communications for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy aps_admin_timeline on public.request_timeline_events for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy aps_admin_status_updates on public.request_status_updates for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.invalidate_changed_document_review()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if old.content_fingerprint is distinct from new.content_fingerprint
     or old.file_path is distinct from new.file_path then
    new.version := greatest(coalesce(old.version,1) + 1, coalesce(new.version,1));
    new.review_state := 're_review_required';
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.reviewed_fingerprint := null;
  end if;
  return new;
end $$;
drop trigger if exists request_files_invalidate_review on public.request_files;
create trigger request_files_invalidate_review before update of file_path,content_fingerprint on public.request_files
for each row execute function public.invalidate_changed_document_review();

comment on table public.message_templates is 'Unified source of truth for every APS customer-facing branded communication template.';
comment on column public.request_files.customer_visible is 'True only for documents intentionally released to the customer portal.';
comment on column public.invoices.source_quote_id is 'Durable approved quote relationship; unique for primary invoices.';
