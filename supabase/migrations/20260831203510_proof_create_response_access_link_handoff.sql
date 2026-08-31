-- Preserve Proof's one-time create-response signer access capability until
-- approved signer mapping can move it to the correct protected signer row.

alter table public.proof_transactions
  add column if not exists pending_primary_signer_access_link text,
  add column if not exists pending_primary_signer_email text;

alter table public.proof_transactions
  drop constraint if exists proof_transactions_pending_access_link_origin_check,
  add constraint proof_transactions_pending_access_link_origin_check
    check (
      pending_primary_signer_access_link is null
      or pending_primary_signer_access_link ~ '^https://app\.proof\.com(?:/|$)'
    );

comment on column public.proof_transactions.pending_primary_signer_access_link is
  'Sensitive signer-scoped Proof capability staged from create response only until approved signer mapping.';
comment on column public.proof_transactions.pending_primary_signer_email is
  'Lowercase signer email used only to transfer the staged Proof capability without cross-signer leakage.';

revoke all on table public.proof_transactions from anon, authenticated;
