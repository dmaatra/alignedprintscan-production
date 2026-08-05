-- Phase 4.2 / Increment 2: draft transaction lifecycle controls.
-- Forward-only and intentionally requires the unused Increment 1 Proof tables.

do $precondition$
begin
  if exists (select 1 from public.proof_transactions limit 1) then
    raise exception 'Increment 2 requires proof_transactions to be empty before lifecycle columns are added';
  end if;
end
$precondition$;

alter table public.proof_transactions
  rename column workflow_type to workflow_category;

alter table public.proof_transactions
  drop constraint if exists proof_transactions_workflow_type_check;

alter table public.proof_transactions
  add constraint proof_transactions_workflow_category_check
    check (workflow_category in ('aps_originated', 'proof_odn')),
  add column environment text not null,
  add column external_id text not null,
  add column creation_state text not null default 'claimed',
  add column provider_detailed_status text,
  add column is_active boolean not null default true,
  add column creation_attempt_count integer not null default 1,
  add column claim_acquired_at timestamptz not null default now(),
  add column request_dispatched_at timestamptz,
  add column ambiguous_at timestamptz,
  add column provider_created_at timestamptz,
  add column provider_updated_at timestamptz,
  add column deleted_at timestamptz,
  add column cancelled_at timestamptz,
  add column last_command text,
  add column last_command_at timestamptz,
  add column last_error_code text,
  add column last_error_message text,
  add column manual_review_reason text,
  add column created_by uuid,
  add column updated_by uuid,
  add constraint proof_transactions_environment_check
    check (environment in ('production', 'fairfax')),
  add constraint proof_transactions_creation_state_check
    check (creation_state in (
      'claimed', 'request_dispatched', 'created', 'rejected', 'failed',
      'ambiguous', 'manual_review', 'cancelled', 'deleted'
    )),
  add constraint proof_transactions_creation_attempt_count_check
    check (creation_attempt_count > 0),
  add constraint proof_transactions_external_id_check
    check (external_id ~ '^aps:service_request:[0-9a-f-]{36}$'),
  add constraint proof_transactions_provider_identity_check
    check (
      (creation_state = 'created' and proof_transaction_id is not null) or
      creation_state <> 'created'
    ),
  add constraint proof_transactions_deleted_state_check
    check (
      (creation_state = 'deleted' and deleted_at is not null and is_active = false) or
      creation_state <> 'deleted'
    ),
  add constraint proof_transactions_cancelled_state_check
    check (
      (creation_state = 'cancelled' and cancelled_at is not null and is_active = false) or
      creation_state <> 'cancelled'
    );

create unique index proof_transactions_active_aps_request_environment_unique
  on public.proof_transactions(service_request_id, environment)
  where is_active and workflow_category = 'aps_originated';

create unique index proof_transactions_environment_external_id_unique
  on public.proof_transactions(environment, external_id);

create index proof_transactions_creation_state_idx
  on public.proof_transactions(creation_state, updated_at);

create table public.proof_transaction_command_attempts (
  id uuid primary key default gen_random_uuid(),
  proof_transaction_record_id uuid references public.proof_transactions(id) on delete restrict,
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  environment text not null check (environment in ('production', 'fairfax')),
  command text not null check (command in (
    'organization_check', 'create_draft', 'retrieve', 'refresh',
    'delete_draft', 'cancel_local', 'mark_manual_review'
  )),
  outcome text not null check (outcome in (
    'started', 'succeeded', 'rejected', 'failed', 'ambiguous',
    'blocked', 'duplicate', 'manual_review'
  )),
  admin_user_id uuid not null,
  idempotency_key text,
  provider_status integer,
  normalized_error_code text,
  provider_trace_id text,
  created_at timestamptz not null default now()
);

create index proof_transaction_command_attempts_transaction_idx
  on public.proof_transaction_command_attempts(proof_transaction_record_id, created_at desc);

create index proof_transaction_command_attempts_request_idx
  on public.proof_transaction_command_attempts(service_request_id, created_at desc);

alter table public.proof_transaction_command_attempts enable row level security;

revoke all on table public.proof_transaction_command_attempts from anon, authenticated;
grant all on table public.proof_transaction_command_attempts to service_role;

comment on column public.proof_transactions.external_id is
  'Stable APS service-request integration identifier sent to Proof for correlation.';
comment on column public.proof_transactions.creation_state is
  'Local creation/idempotency state. Ambiguous claims remain active and must never be blindly retried.';
comment on table public.proof_transaction_command_attempts is
  'Sanitized administrator command audit records; never stores Proof payloads, signer links, or credentials.';
