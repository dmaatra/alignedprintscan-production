-- Official Pass 2: payment testing and financial-state separation.

create table if not exists public.request_payments (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  invoice_id uuid null references public.invoices(id) on delete set null,
  payment_stage text not null default 'initial',
  amount numeric(10, 2) not null check (amount > 0),
  payment_method text not null default 'other',
  external_reference text null,
  note text null,
  is_test boolean not null default false,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists request_payments_request_id_idx
  on public.request_payments(service_request_id);

alter table public.service_requests
  add column if not exists workflow_status text,
  add column if not exists payment_state text default 'not_invoiced',
  add column if not exists appointment_state text default 'not_scheduled';

comment on table public.request_payments is
  'Confirmed offline, Stripe-synchronized, or simulated test payment records.';

comment on column public.request_payments.is_test is
  'True for simulated admin tests. Test records must be excluded from revenue reporting.';
