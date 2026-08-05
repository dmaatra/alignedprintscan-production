-- Phase 4.2 / Increment 4: signer configuration and activation lifecycle.
-- No transaction is activated by this migration.
do $precondition$ begin
  if exists (select 1 from public.proof_signers limit 1) then
    raise exception 'Increment 4 requires proof_signers to be empty';
  end if;
end $precondition$;

alter table public.proof_signers
  add column proof_transaction_id text not null,
  add column aps_signer_reference text not null,
  add column external_id text not null,
  add column signer_position integer not null,
  add column capacity text,
  add column first_name text,
  add column middle_name text,
  add column last_name text,
  add column entity text,
  add column configuration_state text not null default 'claimed',
  add column invitation_state text not null default 'not_invited',
  add column access_link_present boolean not null default false,
  add column last_synced_at timestamptz,
  add column ambiguous_at timestamptz,
  add column manual_review_reason text,
  add column last_error_code text,
  add column last_error_message text,
  add column created_by uuid,
  add column updated_by uuid,
  add column configured_at timestamptz,
  add column invited_at timestamptz,
  add column opened_at timestamptz,
  add column completed_at timestamptz,
  add constraint proof_signers_position_check check (signer_position between 1 and 10),
  add constraint proof_signers_configuration_state_check check (configuration_state in ('claimed','dispatched','configured','rejected','failed','ambiguous','manual_review')),
  add constraint proof_signers_invitation_state_check check (invitation_state in ('not_invited','invited','opened','completed','unknown')),
  add constraint proof_signers_entity_capacity_check check ((entity is null) = (capacity is null)),
  add constraint proof_signers_external_id_check check (external_id ~ '^aps:proof_signer:[0-9a-f-]{36}:[1-9][0-9]?$');

create unique index proof_signers_transaction_position_unique on public.proof_signers(proof_transaction_record_id, signer_position);
create unique index proof_signers_transaction_email_unique on public.proof_signers(proof_transaction_record_id, lower(email));
create unique index proof_signers_transaction_external_unique on public.proof_signers(proof_transaction_record_id, external_id);

alter table public.proof_transactions
  add column signer_configuration_state text not null default 'not_configured',
  add column signer_configuration_dispatched_at timestamptz,
  add column signer_configuration_ambiguous_at timestamptz,
  add column activation_state text not null default 'not_ready',
  add column activation_attempt_count integer not null default 0,
  add column activation_claimed_at timestamptz,
  add column activation_dispatched_at timestamptz,
  add column activation_ambiguous_at timestamptz,
  add column activated_at timestamptz,
  add column proof_email_ownership boolean not null default true,
  add column appointment_source_timezone text,
  add column activation_manual_review_reason text,
  add constraint proof_transactions_signer_configuration_state_check check (signer_configuration_state in ('not_configured','claimed','dispatched','configured','rejected','failed','ambiguous','manual_review')),
  add constraint proof_transactions_activation_state_check check (activation_state in ('not_ready','ready','claimed','dispatched','activated','rejected','failed','ambiguous','manual_review')),
  add constraint proof_transactions_activation_count_check check (activation_attempt_count >= 0),
  add constraint proof_transactions_activated_check check (activation_state <> 'activated' or activated_at is not null),
  add constraint proof_transactions_ambiguous_activation_check check (activation_state <> 'ambiguous' or activation_ambiguous_at is not null),
  add constraint proof_transactions_proof_email_check check (proof_email_ownership = true);

create unique index proof_transactions_successful_activation_unique on public.proof_transactions(proof_transaction_id) where activation_state = 'activated';

alter table public.proof_transaction_command_attempts drop constraint proof_transaction_command_attempts_command_check;
alter table public.proof_transaction_command_attempts add constraint proof_transaction_command_attempts_command_check check (command in (
 'organization_check','create_draft','retrieve','refresh','delete_draft','cancel_local','mark_manual_review',
 'list_signers','configure_signers','refresh_signers','evaluate_activation_readiness','activate','mark_signer_manual_review','mark_activation_manual_review'
));

comment on column public.proof_transactions.proof_email_ownership is 'Version 1 requires Proof to send signer invitations; suppress_email is never true.';
