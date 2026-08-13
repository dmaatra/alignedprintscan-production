-- Expose the approved APS participant projection to the existing guarded
-- Proof activation lifecycle. No browser role receives Proof table access.

alter table public.proof_transaction_command_attempts
  drop constraint proof_transaction_command_attempts_command_check;

alter table public.proof_transaction_command_attempts
  add constraint proof_transaction_command_attempts_command_check check (command in (
    'organization_check','create_draft','retrieve','refresh','delete_draft',
    'cancel_local','mark_manual_review','list_signers','configure_signers',
    'configure_approved_signers','refresh_signers',
    'evaluate_activation_readiness','activate','mark_signer_manual_review',
    'mark_activation_manual_review'
  ));

comment on constraint proof_transaction_command_attempts_command_check
  on public.proof_transaction_command_attempts is
  'Allowlisted audited Proof commands, including server-side mapping from approved APS request participants.';

create unique index if not exists request_timeline_proof_event_unique
  on public.request_timeline_events(service_request_id, (metadata->>'proof_fingerprint'))
  where metadata->>'proof_fingerprint' is not null;
