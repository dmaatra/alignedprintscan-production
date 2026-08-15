-- APS cancellation, rescheduling, and refund operating system.
-- Additive/history-preserving: original invoices and payments are never rewritten.

alter table public.customer_action_requests
  add column if not exists requested_by text not null default 'customer',
  add column if not exists requested_by_admin uuid,
  add column if not exists effective_at timestamptz,
  add column if not exists cancellation_reason_code text,
  add column if not exists policy_band text,
  add column if not exists work_performed boolean,
  add column if not exists earned_amount numeric(12,2) not null default 0,
  add column if not exists nonrecoverable_cost numeric(12,2) not null default 0,
  add column if not exists fee_amount numeric(12,2) not null default 0,
  add column if not exists fee_waived boolean not null default false,
  add column if not exists internal_waiver_reason text,
  add column if not exists customer_explanation text,
  add column if not exists customer_requested boolean not null default true,
  add column if not exists previous_appointment_at timestamptz,
  add column if not exists resolved_by uuid,
  add column if not exists updated_at timestamptz not null default now();

alter table public.service_requests
  add column if not exists cancellation_state text not null default 'none',
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists rescheduled_at timestamptz,
  add column if not exists refunded_amount numeric(12,2) not null default 0,
  add column if not exists net_retained_amount numeric(12,2) not null default 0;

alter table public.invoices
  add column if not exists refunded_amount numeric(12,2) not null default 0,
  add column if not exists net_paid_amount numeric(12,2) not null default 0;

alter table public.request_payments
  add column if not exists stripe_payment_intent_id text,
  add column if not exists refundable_amount numeric(12,2);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  payment_id uuid not null references public.request_payments(id) on delete restrict,
  customer_action_request_id uuid references public.customer_action_requests(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  refund_method text not null check (refund_method in ('stripe','zelle','cash_app','cash','check','other')),
  status text not null check (status in ('pending','processing','succeeded','failed','cancelled')),
  external_reference text,
  provider_refund_id text,
  provider_status text,
  reason text not null,
  admin_note text,
  issued_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  idempotency_key text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists refunds_idempotency_key_unique on public.refunds(idempotency_key);
create unique index if not exists refunds_provider_refund_id_unique on public.refunds(provider_refund_id) where provider_refund_id is not null;
create unique index if not exists refunds_offline_reference_unique on public.refunds(refund_method, external_reference)
  where refund_method <> 'stripe' and external_reference is not null and btrim(external_reference) <> '';
create index if not exists refunds_request_created_idx on public.refunds(service_request_id, created_at desc);
create index if not exists refunds_payment_status_idx on public.refunds(payment_id, status);

alter table public.refunds enable row level security;
revoke all on public.refunds from anon, authenticated;
grant select on public.refunds to authenticated;
grant select, insert, update on public.refunds to service_role;
drop policy if exists aps_admin_read_refunds on public.refunds;
create policy aps_admin_read_refunds on public.refunds for select to authenticated
  using ((select public.is_admin()));

do $$ begin
  if not exists (select 1 from pg_constraint where conname='customer_action_requested_by_check') then
    alter table public.customer_action_requests add constraint customer_action_requested_by_check check (requested_by in ('customer','admin'));
  end if;
  if not exists (select 1 from pg_constraint where conname='customer_action_policy_amounts_check') then
    alter table public.customer_action_requests add constraint customer_action_policy_amounts_check
      check (earned_amount >= 0 and nonrecoverable_cost >= 0 and fee_amount >= 0 and approved_refund_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='service_requests_cancellation_state_check') then
    alter table public.service_requests add constraint service_requests_cancellation_state_check
      check (cancellation_state in ('none','requested','under_review','cancelled','refund_pending','partially_refunded','refunded'));
  end if;
end $$;

insert into public.message_templates
  (template_key,name,description,subject_template,html_template,text_template,associated_status,active)
values
  ('cancellation_request_received','Cancellation Request Received','Automatic acknowledgment when a customer requests cancellation; no status or financial mutation beyond review state.','Cancellation request received: {{request_reference}}','<p>Hello {{customer_first_name}},</p><p>We received your cancellation request. APS will review applicable work already performed, nonrecoverable costs, cancellation terms, and refund eligibility. Your financial state remains unchanged until review is complete.</p>','We received your cancellation request for {{request_reference}}. APS will review it before changing the service or financial state.',null,true),
  ('cancellation_confirmed_no_payment','Cancellation Confirmed — No Payment','Manual cancellation confirmation where no refund is due; status effect cancelled.','Cancellation confirmed: {{request_reference}}','<p>Hello {{customer_first_name}},</p><p>Your request has been cancelled. No refund is due because no payment requiring return was identified.</p><p>{{message_body}}</p>','Your request {{request_reference}} has been cancelled. {{message_body}}','cancelled',true),
  ('cancellation_confirmed_refund_due','Cancellation Confirmed — Refund Due','Manual cancellation confirmation with approved refund handling; status effect cancelled.','Cancellation and refund update: {{request_reference}}','<p>Hello {{customer_first_name}},</p><p>Your request has been cancelled and a refund has been approved. Approved refunds are initiated promptly; posting time depends on the original payment method, provider, and financial institution.</p><p>{{message_body}}</p>','Cancellation and refund update for {{request_reference}}. {{message_body}}','cancelled',true),
  ('refund_processed','Refund Processed','Automatic confirmation only after an authoritative successful refund record.','Refund processed: {{request_reference}}','<p>Hello {{customer_first_name}},</p><p>Your approved refund has been processed. Posting time depends on the original payment method, provider, and financial institution.</p><p>{{message_body}}</p>','A refund for {{request_reference}} was processed. {{message_body}}',null,true),
  ('late_cancellation_explanation','Late Cancellation / Retained Earned Amount Explanation','Manual explanation of earned work, capacity, travel, materials, or nonrecoverable cost; never punitive.','Cancellation amount explanation: {{request_reference}}','<p>Hello {{customer_first_name}},</p><p>Your cancellation was reviewed based on work performed, reserved appointment capacity, travel or committed service, materials consumed, and nonrecoverable provider costs. Unperformed or unearned service is not retained.</p><p>{{message_body}}</p>','Cancellation amount explanation for {{request_reference}}. {{message_body}}','cancelled',true),
  ('aps_cancellation_service_unavailable','APS Cancellation / Service Unable to Fulfill','Manual APS-caused cancellation confirmation; unearned APS charges are refundable.','Service cancellation update: {{request_reference}}','<p>Hello {{customer_first_name}},</p><p>APS is unable to perform the promised service. Unearned APS charges will be refunded; any actual nonrecoverable external cost is handled according to the disclosed policy and circumstances.</p><p>{{message_body}}</p>','APS is unable to fulfill {{request_reference}}. Unearned APS charges will be refunded. {{message_body}}','cancelled',true)
on conflict (template_key) do update set
  name=excluded.name,description=excluded.description,subject_template=excluded.subject_template,html_template=excluded.html_template,
  text_template=excluded.text_template,associated_status=excluded.associated_status,active=true,updated_at=now();

comment on table public.refunds is 'Authoritative history-preserving refund ledger. A refund never deletes or rewrites its original payment.';
comment on column public.refunds.external_reference is 'Required unique evidence for a refund already issued outside APS; never implies APS moved offline funds.';
