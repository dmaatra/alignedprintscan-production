begin;

-- Release 2 temporarily exposed whole tenant rows. Release 3 moves all business
-- reads behind a server-side, field-allowlisted authorization boundary.
drop policy if exists organizations_member_read on public.organizations;
drop policy if exists organization_members_tenant_read on public.organization_members;
drop policy if exists organization_locations_tenant_read on public.organization_locations;
drop policy if exists organization_activity_tenant_read on public.organization_activity;

create or replace function public.active_organization_role(target_organization uuid)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select m.role
  from public.organization_members m
  join public.organizations o on o.id=m.organization_id
  where auth.uid() is not null
    and m.user_id=auth.uid()
    and m.organization_id=target_organization
    and m.status='active'
    and o.status='active'
  limit 1
$$;

revoke all on function public.active_organization_role(uuid) from public,anon;
grant execute on function public.active_organization_role(uuid) to authenticated,service_role;

-- Base operational records remain staff-only under RLS. The business portal
-- Edge Function uses service credentials only after authoritative tenant and
-- resource checks and emits safe projections.
comment on function public.active_organization_role(uuid) is
  'Live tenant authorization primitive. Never accepts a user id or JWT role claim.';

commit;
