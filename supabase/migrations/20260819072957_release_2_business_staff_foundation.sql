begin;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  normalized_name text generated always as (lower(regexp_replace(trim(organization_name), '\\s+', ' ', 'g'))) stored,
  business_type text not null default 'other' check (business_type in ('title_escrow','signing_service','lender','law_office','real_estate','property_management','corporate_business','other')),
  website text,
  primary_email text,
  primary_phone text,
  business_address_line1 text,
  business_address_line2 text,
  business_city text,
  business_state text,
  business_zip text,
  mailing_address_line1 text,
  mailing_address_line2 text,
  mailing_city text,
  mailing_state text,
  mailing_zip text,
  billing_contact_name text,
  billing_contact_email text,
  operational_contact_name text,
  operational_contact_email text,
  status text not null default 'pending' check (status in ('pending','active','suspended','declined','closed','archived')),
  payment_terms text not null default 'prepaid' check (payment_terms in ('prepaid','due_on_receipt','net_15','net_30')),
  credit_hold boolean not null default false,
  credit_hold_reason text,
  credit_hold_at timestamptz,
  credit_hold_by uuid references auth.users(id) on delete set null,
  service_ron_enabled boolean not null default true,
  service_mobile_enabled boolean not null default true,
  service_print_enabled boolean not null default true,
  service_loan_signing_enabled boolean not null default false,
  internal_admin_notes text,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index organizations_normalized_name_unique on public.organizations(normalized_name) where status <> 'archived';
create index organizations_status_idx on public.organizations(status, created_at desc);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text not null,
  phone text,
  role text not null default 'viewer' check (role in ('organization_admin','order_creator','billing','viewer')),
  status text not null default 'invited' check (status in ('invited','active','suspended','removed','revoked')),
  invited_at timestamptz,
  accepted_at timestamptz,
  suspended_at timestamptz,
  removed_at timestamptz,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, email)
);
create unique index organization_members_active_user_unique on public.organization_members(organization_id,user_id) where user_id is not null and status not in ('removed','revoked');
create index organization_members_user_idx on public.organization_members(user_id,status);

create table public.organization_locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_name text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  zip text not null,
  phone text,
  notes text,
  is_active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index organization_locations_one_default on public.organization_locations(organization_id) where is_default and is_active;

create table public.business_account_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  organization_name text not null,
  business_type text not null check (business_type in ('title_escrow','signing_service','lender','law_office','real_estate','property_management','corporate_business','other')),
  website text,
  primary_contact_name text not null,
  business_email text not null,
  phone text not null,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  zip text not null,
  billing_contact_name text,
  billing_contact_email text,
  services_interested text[] not null default '{}',
  estimated_monthly_volume text,
  requested_payment_terms text not null default 'prepaid' check (requested_payment_terms in ('prepaid','due_on_receipt','net_15','net_30')),
  applicant_notes text,
  internal_admin_notes text,
  status text not null default 'submitted' check (status in ('submitted','under_review','information_requested','approved','declined','withdrawn')),
  duplicate_signals jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index business_applications_status_idx on public.business_account_applications(status,submitted_at desc);
create index business_applications_email_idx on public.business_account_applications(lower(business_email));

create table public.organization_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  application_id uuid references public.business_account_applications(id) on delete set null,
  event_type text not null,
  title text not null,
  detail text,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'aps_staff' check (actor_type in ('aps_staff','organization_member','system')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index organization_activity_org_idx on public.organization_activity(organization_id,created_at desc);

create table public.aps_staff_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('owner','administrator','operations','billing','support_read_only')),
  status text not null default 'invited' check (status in ('invited','active','suspended','removed')),
  permissions jsonb not null default '{}'::jsonb,
  invited_at timestamptz,
  accepted_at timestamptz,
  suspended_at timestamptz,
  removed_at timestamptz,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.aps_staff_activity (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.aps_staff_profiles(id) on delete cascade,
  event_type text not null,
  title text not null,
  detail text,
  actor_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index aps_staff_activity_profile_idx on public.aps_staff_activity(staff_profile_id,created_at desc);

insert into public.aps_staff_profiles(user_id,full_name,email,role,status,permissions,accepted_at)
select u.id, coalesce(nullif(u.raw_user_meta_data->>'full_name',''),split_part(a.email,'@',1)), lower(a.email),
  case when row_number() over(order by coalesce(a.created_at,now()),a.email)=1 then 'owner' else 'administrator' end,
  'active',
  case when row_number() over(order by coalesce(a.created_at,now()),a.email)=1
    then '{"issue_refunds":true,"release_documents":true,"manage_proof":true,"approve_business_accounts":true,"change_organization_payment_terms":true,"manage_staff":true}'::jsonb
    else '{"release_documents":true,"manage_proof":true,"approve_business_accounts":true,"change_organization_payment_terms":true}'::jsonb end,
  now()
from public.admin_users a join auth.users u on lower(u.email)=lower(a.email)
on conflict(email) do nothing;

create or replace function public.is_active_aps_staff(required_permission text default null)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.aps_staff_profiles s
    where s.user_id=auth.uid() and s.status='active'
      and (required_permission is null or s.role='owner' or coalesce((s.permissions->>required_permission)::boolean,false))
  );
$$;
revoke all on function public.is_active_aps_staff(text) from public,anon;
grant execute on function public.is_active_aps_staff(text) to authenticated,service_role;

create or replace function public.has_active_organization_membership(target_organization uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.organization_members m
    join public.organizations o on o.id=m.organization_id
    where m.user_id=auth.uid() and m.organization_id=target_organization
      and m.status='active' and o.status='active'
  );
$$;
revoke all on function public.has_active_organization_membership(uuid) from public,anon;
grant execute on function public.has_active_organization_membership(uuid) to authenticated,service_role;

alter table public.service_requests add column organization_id uuid references public.organizations(id) on delete set null;
create index service_requests_organization_idx on public.service_requests(organization_id,created_at desc) where organization_id is not null;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_locations enable row level security;
alter table public.business_account_applications enable row level security;
alter table public.organization_activity enable row level security;
alter table public.aps_staff_profiles enable row level security;
alter table public.aps_staff_activity enable row level security;

create policy organizations_staff_read on public.organizations for select to authenticated using ((select public.is_active_aps_staff(null)));
create policy organizations_member_read on public.organizations for select to authenticated using ((select public.has_active_organization_membership(id)));
create policy organization_members_staff_read on public.organization_members for select to authenticated using ((select public.is_active_aps_staff(null)));
create policy organization_members_tenant_read on public.organization_members for select to authenticated using ((select public.has_active_organization_membership(organization_id)));
create policy organization_locations_staff_read on public.organization_locations for select to authenticated using ((select public.is_active_aps_staff(null)));
create policy organization_locations_tenant_read on public.organization_locations for select to authenticated using ((select public.has_active_organization_membership(organization_id)));
create policy business_applications_staff_read on public.business_account_applications for select to authenticated using ((select public.is_active_aps_staff(null)));
create policy organization_activity_staff_read on public.organization_activity for select to authenticated using ((select public.is_active_aps_staff(null)));
create policy organization_activity_tenant_read on public.organization_activity for select to authenticated using ((select public.has_active_organization_membership(organization_id)));
create policy staff_profiles_self_read on public.aps_staff_profiles for select to authenticated using (user_id=(select auth.uid()));
create policy staff_profiles_manager_read on public.aps_staff_profiles for select to authenticated using ((select public.is_active_aps_staff('manage_staff')));
create policy staff_activity_manager_read on public.aps_staff_activity for select to authenticated using ((select public.is_active_aps_staff('manage_staff')));

revoke all on public.organizations,public.organization_members,public.organization_locations,public.business_account_applications,public.organization_activity,public.aps_staff_profiles,public.aps_staff_activity from anon,authenticated;
grant select on public.organizations,public.organization_members,public.organization_locations,public.business_account_applications,public.organization_activity,public.aps_staff_profiles,public.aps_staff_activity to authenticated;
grant all on public.organizations,public.organization_members,public.organization_locations,public.business_account_applications,public.organization_activity,public.aps_staff_profiles,public.aps_staff_activity to service_role;

comment on table public.organizations is 'APS business accounts; distinct from customers, signers, participants, and APS staff.';
comment on table public.organization_members is 'Future business portal identities scoped to one organization; never APS staff authorization.';
comment on column public.organizations.payment_terms is 'APS-controlled policy placeholder; no Net collection workflow is implemented in Release 2.';
comment on column public.organizations.service_loan_signing_enabled is 'Eligibility placeholder only; Loan Signing is not launched by Release 2.';

commit;
