-- Phase 4.2 / Increment 1: additive Proof integration foundation only.
-- APS remains the system of record. This migration creates no Proof transactions.

create table if not exists public.proof_transactions (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  proof_transaction_id text,
  idempotency_key text not null,
  workflow_type text not null default 'aps_originated'
    check (workflow_type in ('aps_originated', 'odn')),
  proof_status text,
  aps_status text not null default 'not_started'
    check (aps_status in ('not_started', 'preparing', 'ready', 'in_progress', 'completed', 'cancelled', 'failed', 'requires_attention')),
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proof_transactions_provider_id_unique unique (proof_transaction_id),
  constraint proof_transactions_idempotency_key_unique unique (idempotency_key),
  constraint proof_transactions_timestamps_check check (updated_at >= created_at)
);

create index if not exists proof_transactions_service_request_id_idx
  on public.proof_transactions(service_request_id);
create index if not exists proof_transactions_aps_status_idx
  on public.proof_transactions(aps_status);

create table if not exists public.proof_signers (
  id uuid primary key default gen_random_uuid(),
  proof_transaction_record_id uuid not null references public.proof_transactions(id) on delete cascade,
  proof_signer_id text,
  idempotency_key text not null,
  signer_role text not null default 'signer'
    check (signer_role in ('signer', 'witness', 'notary', 'other')),
  email text,
  full_name text,
  proof_status text,
  aps_status text not null default 'not_started'
    check (aps_status in ('not_started', 'invited', 'identity_pending', 'ready', 'in_session', 'completed', 'cancelled', 'failed', 'requires_attention')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proof_signers_provider_id_unique unique (proof_signer_id),
  constraint proof_signers_idempotency_key_unique unique (idempotency_key),
  constraint proof_signers_timestamps_check check (updated_at >= created_at)
);

create index if not exists proof_signers_transaction_id_idx
  on public.proof_signers(proof_transaction_record_id);
create index if not exists proof_signers_aps_status_idx
  on public.proof_signers(aps_status);

create table if not exists public.proof_transaction_assets (
  id uuid primary key default gen_random_uuid(),
  proof_transaction_record_id uuid not null references public.proof_transactions(id) on delete cascade,
  proof_asset_id text,
  idempotency_key text not null,
  asset_type text not null
    check (asset_type in ('source_document', 'completed_document', 'audit_trail', 'recording', 'other')),
  file_name text,
  storage_bucket text,
  storage_path text,
  content_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-fA-F]{64}$'),
  proof_status text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proof_transaction_assets_provider_id_unique unique (proof_asset_id),
  constraint proof_transaction_assets_idempotency_key_unique unique (idempotency_key),
  constraint proof_transaction_assets_timestamps_check check (updated_at >= created_at),
  constraint proof_transaction_assets_storage_location_check
    check ((storage_bucket is null and storage_path is null) or (storage_bucket is not null and storage_path is not null))
);

create index if not exists proof_transaction_assets_transaction_id_idx
  on public.proof_transaction_assets(proof_transaction_record_id);
create index if not exists proof_transaction_assets_type_idx
  on public.proof_transaction_assets(asset_type);

create table if not exists public.proof_webhook_events (
  id uuid primary key default gen_random_uuid(),
  proof_event_id text not null,
  proof_transaction_record_id uuid references public.proof_transactions(id) on delete set null,
  proof_transaction_id text,
  event_type text not null,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processing', 'processed', 'failed', 'ignored')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text,
  last_error_message text,
  received_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proof_webhook_events_provider_event_unique unique (proof_event_id),
  constraint proof_webhook_events_timestamps_check check (updated_at >= created_at),
  constraint proof_webhook_events_processed_at_check
    check (processed_at is null or processed_at >= received_at)
);

create index if not exists proof_webhook_events_transaction_record_id_idx
  on public.proof_webhook_events(proof_transaction_record_id);
create index if not exists proof_webhook_events_proof_transaction_id_idx
  on public.proof_webhook_events(proof_transaction_id);
create index if not exists proof_webhook_events_processing_status_idx
  on public.proof_webhook_events(processing_status, received_at);

alter table public.proof_transactions enable row level security;
alter table public.proof_signers enable row level security;
alter table public.proof_transaction_assets enable row level security;
alter table public.proof_webhook_events enable row level security;

revoke all on table public.proof_transactions from anon, authenticated;
revoke all on table public.proof_signers from anon, authenticated;
revoke all on table public.proof_transaction_assets from anon, authenticated;
revoke all on table public.proof_webhook_events from anon, authenticated;

grant all on table public.proof_transactions to service_role;
grant all on table public.proof_signers to service_role;
grant all on table public.proof_transaction_assets to service_role;
grant all on table public.proof_webhook_events to service_role;

comment on table public.proof_transactions is 'APS-owned linkage and normalized state for future Proof transactions.';
comment on column public.proof_transactions.proof_status is 'Internal provider status; never expose directly to customers.';
comment on table public.proof_signers is 'Signer participants supplementing an APS-owned Proof transaction record.';
comment on table public.proof_transaction_assets is 'Metadata for source and returned Proof assets; binary content remains outside this table.';
comment on table public.proof_webhook_events is 'Immutable provider event intake and idempotent processing ledger.';
