-- Allow the authenticated APS Admin workspace to read the canonical Loan
-- Signing detail row while retaining service-role-only writes.
grant select on public.loan_signing_assignments to authenticated;

drop policy if exists aps_admin_read_loan_signing_assignments
  on public.loan_signing_assignments;

create policy aps_admin_read_loan_signing_assignments
  on public.loan_signing_assignments
  for select
  to authenticated
  using ((select public.is_admin()));
