-- Release 5: APS-authoritative business ledger with Stripe Invoicing mapping.
alter table public.organizations
  add column if not exists stripe_customer_id text,
  add column if not exists credit_hold_removed_at timestamptz,
  add column if not exists credit_hold_removed_by uuid references auth.users(id) on delete set null;
create unique index if not exists organizations_stripe_customer_unique
  on public.organizations(stripe_customer_id) where stripe_customer_id is not null;

alter table public.invoices
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict,
  add column if not exists payment_terms text,
  add column if not exists issued_at timestamptz,
  add column if not exists financial_status text not null default 'not_yet_billable',
  add column if not exists currency text not null default 'usd',
  add column if not exists stripe_invoice_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_hosted_invoice_url text,
  add column if not exists stripe_invoice_pdf_url text,
  add column if not exists stripe_status text,
  add column if not exists provider_updated_at timestamptz,
  add column if not exists provider_metadata jsonb not null default '{}'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='invoices_business_payment_terms_check') then
    alter table public.invoices add constraint invoices_business_payment_terms_check
      check (payment_terms is null or payment_terms in ('prepaid','due_on_receipt','net_15','net_30'));
  end if;
  if not exists (select 1 from pg_constraint where conname='invoices_financial_status_check') then
    alter table public.invoices add constraint invoices_financial_status_check check (financial_status in (
      'not_yet_billable','authorized_pending_finalization','prepayment_required',
      'open_due_on_receipt','open_net_15','open_net_30','due_soon','due_today',
      'past_due','payment_processing','partially_paid','paid','payment_failed',
      'partially_refunded','refunded','voided','check_expected'));
  end if;
  if not exists (select 1 from pg_constraint where conname='invoices_currency_usd_check') then
    alter table public.invoices add constraint invoices_currency_usd_check check (currency = 'usd');
  end if;
end $$;

create unique index if not exists invoices_stripe_invoice_unique
  on public.invoices(stripe_invoice_id) where stripe_invoice_id is not null;
create index if not exists invoices_organization_status_due_idx
  on public.invoices(organization_id, financial_status, due_at);
create index if not exists invoices_organization_created_idx
  on public.invoices(organization_id, created_at desc);

alter table public.request_payments
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict,
  add column if not exists payment_state text not null default 'succeeded',
  add column if not exists provider_event_id text,
  add column if not exists idempotency_key text,
  add column if not exists receipt_url text;
create unique index if not exists request_payments_provider_event_unique
  on public.request_payments(provider_event_id) where provider_event_id is not null;
create unique index if not exists request_payments_idempotency_unique
  on public.request_payments(idempotency_key) where idempotency_key is not null;
create index if not exists request_payments_organization_received_idx
  on public.request_payments(organization_id, received_at desc);

create table if not exists public.business_financial_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  service_request_id uuid references public.service_requests(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete restrict,
  payment_id uuid references public.request_payments(id) on delete restrict,
  refund_id uuid references public.refunds(id) on delete restrict,
  event_type text not null,
  amount numeric(12,2),
  actor_type text not null check (actor_type in ('aps_staff','organization_member','stripe','system')),
  actor_user_id uuid,
  idempotency_key text not null,
  customer_safe_detail text,
  internal_detail text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists business_financial_events_idempotency_unique
  on public.business_financial_events(idempotency_key);
create index if not exists business_financial_events_org_created_idx
  on public.business_financial_events(organization_id, created_at desc);

create table if not exists public.business_invoice_reminders (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  milestone text not null check (milestone in ('due_on_receipt_day_3','due_on_receipt_day_7','due_soon','due_today','past_due')),
  status text not null default 'pending' check (status in ('pending','sent','failed','cancelled')),
  scheduled_for date not null,
  sent_at timestamptz,
  communication_id uuid references public.request_communications(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(invoice_id, milestone)
);

create table if not exists public.stripe_business_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  object_id text,
  livemode boolean not null,
  processing_status text not null default 'received' check (processing_status in ('received','processed','ignored','failed')),
  failure_detail text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.business_financial_events enable row level security;
alter table public.business_invoice_reminders enable row level security;
alter table public.stripe_business_webhook_events enable row level security;
revoke all on public.business_financial_events, public.business_invoice_reminders, public.stripe_business_webhook_events from public, anon, authenticated;
grant select, insert, update on public.business_financial_events, public.business_invoice_reminders, public.stripe_business_webhook_events to service_role;

insert into public.message_templates
  (template_key,name,description,subject_template,html_template,text_template,associated_status,active)
values
  ('business_invoice_issued','Business Invoice Issued','APS-branded notice linking to the Stripe Hosted Invoice Page.','Invoice issued: {{invoice_number}}','<p>Your APS invoice {{invoice_number}} is ready. Review the payment terms, due date, and authoritative balance in the APS Business Portal.</p>','Invoice {{invoice_number}} is ready in the APS Business Portal.',null,true),
  ('business_payment_due_receipt','Business Payment Due — Due on Receipt','Due-on-receipt reminder governed by APS.','Payment due: {{invoice_number}}','<p>Invoice {{invoice_number}} is due. Review the current authoritative balance in the APS Business Portal.</p>','Invoice {{invoice_number}} is due. Review it in the APS Business Portal.',null,true),
  ('business_payment_due_soon','Business Payment Due Soon','Exactly-once five-day reminder.','Payment due soon: {{invoice_number}}','<p>Invoice {{invoice_number}} is due soon. Review the current balance in the APS Business Portal.</p>','Invoice {{invoice_number}} is due soon.',null,true),
  ('business_payment_due_today','Business Payment Due Today','Exactly-once due-date reminder.','Payment due today: {{invoice_number}}','<p>Invoice {{invoice_number}} is due today. Review the current balance in the APS Business Portal.</p>','Invoice {{invoice_number}} is due today.',null,true),
  ('business_payment_past_due','Business Payment Past Due','Exactly-once initial past-due notice.','Payment past due: {{invoice_number}}','<p>Invoice {{invoice_number}} has an outstanding past-due balance. Please review it in the APS Business Portal.</p>','Invoice {{invoice_number}} has a past-due balance.',null,true),
  ('business_payment_received','Business Payment Received','Provider-confirmed payment receipt notice.','Payment received: {{invoice_number}}','<p>Payment was received for {{invoice_number}}. The authoritative balance is available in the APS Business Portal.</p>','Payment was received for {{invoice_number}}.',null,true),
  ('business_partial_payment','Business Partial Payment Received','Confirmation of a partial payment without implying paid in full.','Partial payment received: {{invoice_number}}','<p>A partial payment was received for {{invoice_number}}. The remaining balance is available in the APS Business Portal.</p>','A partial payment was received for {{invoice_number}}.',null,true),
  ('business_payment_failed','Business Payment Failed','Provider-confirmed failed payment notice.','Payment needs attention: {{invoice_number}}','<p>A payment attempt for {{invoice_number}} did not complete. The invoice remains open.</p>','A payment attempt did not complete; invoice {{invoice_number}} remains open.',null,true),
  ('business_credit_hold_notice','Business Credit Hold Notice','Optional customer-safe account review notice.','Business account payment review','<p>This account requires payment review before new service can proceed. Existing authorized records and payment access remain available.</p>','This account requires payment review before new service can proceed.',null,true)
on conflict (template_key) do update set
  name=excluded.name,description=excluded.description,subject_template=excluded.subject_template,
  html_template=excluded.html_template,text_template=excluded.text_template,active=true,updated_at=now();

comment on table public.business_financial_events is 'APS-authoritative, idempotent business financial audit ledger; raw provider payloads are prohibited.';
comment on column public.invoices.payment_terms is 'Immutable organization payment-terms snapshot taken when the business invoice is created.';
comment on column public.invoices.stripe_hosted_invoice_url is 'Customer-safe Stripe Hosted Invoice Page URL; APS Business Portal remains the customer portal.';
