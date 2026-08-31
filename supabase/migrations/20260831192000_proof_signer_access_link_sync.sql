-- Store Proof's signer-scoped transaction access URL for authenticated APS
-- operators. The table remains service-role only; this value is never exposed
-- through public/customer request-status responses.
alter table public.proof_signers
  add column if not exists access_link text;

alter table public.proof_signers
  drop constraint if exists proof_signers_access_link_check;

alter table public.proof_signers
  add constraint proof_signers_access_link_check check (
    access_link is null
    or access_link ~ '^https://app\.proof\.com/'
  );

revoke all on table public.proof_signers from anon, authenticated;
grant all on table public.proof_signers to service_role;

comment on column public.proof_signers.access_link is
  'Sensitive signer-scoped Proof transaction access URL. Service-role persistence; authenticated APS operator display only.';
