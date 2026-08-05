-- Phase 4.2 / Increment 5: signed webhook ledger and protected completed assets.
-- Forward-only. Creates no webhook subscription and retrieves no provider asset.

alter table public.proof_webhook_events
  alter column proof_event_id drop not null,
  alter column payload drop not null,
  add column subscription_id text,
  add column environment text not null default 'production',
  add column occurred_at timestamptz,
  add column payload_fingerprint text not null,
  add column signature_verified boolean not null default false,
  add column delivery_count integer not null default 1,
  add column next_retry_at timestamptz,
  add column dead_lettered_at timestamptz,
  add column manual_review_reason text,
  add column sanitized_metadata jsonb not null default '{}'::jsonb,
  add constraint proof_webhook_events_environment_check check (environment in ('production','fairfax')),
  add constraint proof_webhook_events_fingerprint_check check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  add constraint proof_webhook_events_delivery_count_check check (delivery_count >= 1),
  add constraint proof_webhook_events_signature_check check (signature_verified = true),
  add constraint proof_webhook_events_sanitized_metadata_check check (jsonb_typeof(sanitized_metadata) = 'object');

alter table public.proof_webhook_events drop constraint proof_webhook_events_processing_status_check;
alter table public.proof_webhook_events add constraint proof_webhook_events_processing_status_check
  check (processing_status in ('received','in_progress','processed','retryable_failed','dead_letter','manual_review'));

create unique index proof_webhook_events_fingerprint_unique
  on public.proof_webhook_events(environment, payload_fingerprint);
create index proof_webhook_events_retry_idx
  on public.proof_webhook_events(processing_status, next_retry_at)
  where processing_status = 'retryable_failed';

alter table public.proof_transactions
  add column last_webhook_event text,
  add column last_webhook_occurred_at timestamptz,
  add column completed_at timestamptz,
  add column released_at timestamptz,
  add column meeting_state text not null default 'not_started',
  add column meeting_id text,
  add column completed_assets_available boolean not null default false,
  add column audit_trail_available boolean not null default false,
  add column recording_metadata_available boolean not null default false,
  add column recording_content_blocked boolean not null default true,
  add column webhook_refresh_required boolean not null default false,
  add column webhook_manual_review_reason text,
  add constraint proof_transactions_meeting_state_check check
    (meeting_state in ('not_started','created','in_progress','completed','failed','manual_review')),
  add constraint proof_transactions_recording_content_blocked_check check (recording_content_blocked = true);

alter table public.proof_transaction_assets
  add column source_asset_id uuid references public.proof_transaction_assets(id) on delete restrict,
  add column availability_state text not null default 'unavailable',
  add column retrieval_state text not null default 'not_retrieved',
  add column retrieval_attempt_count integer not null default 0,
  add column available_at timestamptz,
  add column retrieved_at timestamptz,
  add column retrieval_manual_review_reason text,
  add constraint proof_transaction_assets_availability_state_check check
    (availability_state in ('unavailable','available','retrieved','manual_review')),
  add constraint proof_transaction_assets_retrieval_state_check check
    (retrieval_state in ('not_retrieved','claimed','retrieved','failed','manual_review')),
  add constraint proof_transaction_assets_retrieval_count_check check (retrieval_attempt_count >= 0),
  add constraint proof_transaction_assets_completed_storage_check check (
    asset_type not in ('completed_document','audit_trail') or retrieval_state <> 'retrieved' or
    (storage_bucket = 'proof-assets' and storage_path is not null and content_type = 'application/pdf' and
     sha256 is not null and byte_size is not null and retrieved_at is not null)
  );

create unique index proof_transaction_assets_completed_source_unique
  on public.proof_transaction_assets(proof_transaction_record_id, asset_type, source_asset_id)
  where asset_type = 'completed_document';
create unique index proof_transaction_assets_audit_unique
  on public.proof_transaction_assets(proof_transaction_record_id, asset_type)
  where asset_type = 'audit_trail';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proof-assets', 'proof-assets', false, 31457280, array['application/pdf']::text[])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

revoke all on table public.proof_webhook_events from anon, authenticated;
revoke all on table public.proof_transaction_assets from anon, authenticated;
grant all on table public.proof_webhook_events to service_role;
grant all on table public.proof_transaction_assets to service_role;

comment on column public.proof_webhook_events.payload is
  'Restricted optional payload. Increment 5 stores sanitized metadata only and leaves this null.';
comment on column public.proof_transactions.recording_content_blocked is
  'Version 1 legal/retention gate; recording bytes and URLs are not retained.';
