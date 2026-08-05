-- Phase 4.2 / Increment 3: APS-owned source-document upload lifecycle.
-- Forward-only. This migration does not upload documents or activate Proof transactions.

do $precondition$
begin
  if exists (select 1 from public.proof_transaction_assets limit 1) then
    raise exception 'Increment 3 requires proof_transaction_assets to be empty before lifecycle columns are added';
  end if;
end
$precondition$;

alter table public.proof_transaction_assets
  add column source_request_file_id uuid references public.request_files(id) on delete restrict,
  add column proof_transaction_id text,
  add column tracking_id text,
  add column upload_state text not null default 'prepared',
  add column dispatch_state text not null default 'not_dispatched',
  add column processing_state text not null default 'not_uploaded',
  add column requirement text,
  add column notarization_required boolean,
  add column esign_required boolean,
  add column identity_confirmation_required boolean,
  add column witness_required boolean not null default false,
  add column signing_requires_meeting boolean,
  add column customer_can_annotate boolean,
  add column bundle_position integer,
  add column dispatch_attempt_count integer not null default 0,
  add column dispatch_started_at timestamptz,
  add column provider_created_at timestamptz,
  add column provider_updated_at timestamptz,
  add column last_synced_at timestamptz,
  add column ambiguous_at timestamptz,
  add column retry_eligible boolean not null default false,
  add column manual_review_reason text,
  add column last_error_code text,
  add column last_error_message text,
  add column created_by uuid,
  add column updated_by uuid,
  add column uploaded_at timestamptz,
  add column processed_at timestamptz,
  add constraint proof_transaction_assets_source_fields_check check (
    asset_type <> 'source_document' or (
      source_request_file_id is not null and
      proof_transaction_id is not null and
      tracking_id is not null and
      sha256 is not null and
      byte_size is not null and
      storage_bucket = 'service-request-files' and
      storage_path is not null and
      content_type = 'application/pdf' and
      requirement is not null
    )
  ),
  add constraint proof_transaction_assets_upload_state_check check (upload_state in (
    'prepared', 'claimed', 'uploading', 'uploaded', 'rejected', 'failed',
    'ambiguous', 'processing', 'processed', 'processing_failed', 'manual_review'
  )),
  add constraint proof_transaction_assets_dispatch_state_check check (dispatch_state in (
    'not_dispatched', 'dispatched', 'confirmed', 'rejected', 'ambiguous'
  )),
  add constraint proof_transaction_assets_processing_state_check check (processing_state in (
    'not_uploaded', 'pending', 'processing', 'complete', 'failed', 'unknown'
  )),
  add constraint proof_transaction_assets_requirement_check check (
    requirement is null or requirement in (
      'notarization', 'esign', 'identity_confirmation', 'readonly', 'non_essential'
    )
  ),
  add constraint proof_transaction_assets_tracking_id_check check (
    tracking_id is null or tracking_id ~ '^aps:proof_document:[0-9a-f-]{36}:[0-9a-f-]{36}$'
  ),
  add constraint proof_transaction_assets_dispatch_attempt_count_check check (dispatch_attempt_count >= 0),
  add constraint proof_transaction_assets_bundle_position_check check (bundle_position is null or bundle_position >= 0),
  add constraint proof_transaction_assets_uploaded_state_check check (
    upload_state not in ('uploaded', 'processing', 'processed', 'processing_failed') or
    (proof_asset_id is not null and uploaded_at is not null and dispatch_state = 'confirmed')
  ),
  add constraint proof_transaction_assets_ambiguous_state_check check (
    upload_state <> 'ambiguous' or
    (ambiguous_at is not null and dispatch_state = 'ambiguous' and retry_eligible = false)
  );

create unique index proof_transaction_assets_source_transaction_unique
  on public.proof_transaction_assets(proof_transaction_record_id, source_request_file_id)
  where asset_type = 'source_document';

create unique index proof_transaction_assets_transaction_tracking_unique
  on public.proof_transaction_assets(proof_transaction_record_id, tracking_id)
  where tracking_id is not null;

create index proof_transaction_assets_upload_state_idx
  on public.proof_transaction_assets(upload_state, updated_at);

create index proof_transaction_assets_source_request_file_idx
  on public.proof_transaction_assets(source_request_file_id);

create table public.proof_document_command_attempts (
  id uuid primary key default gen_random_uuid(),
  proof_transaction_record_id uuid not null references public.proof_transactions(id) on delete restrict,
  proof_transaction_asset_id uuid references public.proof_transaction_assets(id) on delete restrict,
  service_request_id uuid not null references public.service_requests(id) on delete restrict,
  request_file_id uuid references public.request_files(id) on delete restrict,
  command text not null check (command in (
    'list_eligible_source_documents', 'prepare_upload', 'upload_source_document',
    'refresh_document', 'refresh_all_documents', 'mark_document_manual_review'
  )),
  outcome text not null check (outcome in (
    'started', 'succeeded', 'rejected', 'failed', 'ambiguous', 'blocked',
    'duplicate', 'manual_review'
  )),
  admin_user_id uuid not null,
  provider_status integer,
  normalized_error_code text,
  provider_trace_id text,
  created_at timestamptz not null default now()
);

create index proof_document_command_attempts_asset_idx
  on public.proof_document_command_attempts(proof_transaction_asset_id, created_at desc);
create index proof_document_command_attempts_request_idx
  on public.proof_document_command_attempts(service_request_id, created_at desc);

alter table public.proof_document_command_attempts enable row level security;
revoke all on table public.proof_document_command_attempts from anon, authenticated;
grant all on table public.proof_document_command_attempts to service_role;

comment on table public.proof_document_command_attempts is
  'Sanitized Proof document command audit; never stores document bytes, signed URLs, credentials, or raw provider payloads.';
comment on column public.proof_transaction_assets.sha256 is
  'SHA-256 of the exact APS source bytes used to claim the Proof upload.';
comment on column public.proof_transaction_assets.tracking_id is
  'Stable APS-generated Proof document correlation ID; not customer-facing.';
