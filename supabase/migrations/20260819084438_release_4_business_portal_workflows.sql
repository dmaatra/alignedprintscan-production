begin;

alter table public.service_requests
  add column business_created_by_member_id uuid references public.organization_members(id) on delete set null;
create index service_requests_business_creator_idx on public.service_requests(business_created_by_member_id) where business_created_by_member_id is not null;

create table public.business_account_closure_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  requested_by_member_id uuid not null references public.organization_members(id) on delete restrict,
  reason text,
  status text not null default 'requested' check (status in ('requested','under_review','information_needed','approved','declined','cancelled','completed')),
  admin_notes text,
  resolution text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index business_closure_org_idx on public.business_account_closure_requests(organization_id,created_at desc);
create unique index business_closure_one_open_idx on public.business_account_closure_requests(organization_id) where status in ('requested','under_review','information_needed','approved');

create table public.business_privacy_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  requested_by_member_id uuid not null references public.organization_members(id) on delete restrict,
  request_type text not null check (request_type in ('access','correction','deletion_closure_review')),
  requester_comments text,
  status text not null default 'submitted' check (status in ('submitted','under_review','information_needed','resolved','declined','cancelled')),
  admin_notes text,
  resolution text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index business_privacy_org_idx on public.business_privacy_requests(organization_id,created_at desc);

alter table public.business_account_closure_requests enable row level security;
alter table public.business_privacy_requests enable row level security;
revoke all on public.business_account_closure_requests,public.business_privacy_requests from public,anon,authenticated;
grant all on public.business_account_closure_requests,public.business_privacy_requests to service_role;

comment on table public.business_account_closure_requests is 'Review-based organization closure workflow; never hard-deletes operational history.';
comment on table public.business_privacy_requests is 'Business privacy/data requests routed to APS review; internal notes remain server-only.';
comment on column public.service_requests.business_created_by_member_id is 'Organization member that submitted the canonical APS request through Business Portal.';

commit;
