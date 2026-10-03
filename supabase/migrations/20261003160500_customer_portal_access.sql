create table public.customer_portal_access_tokens (
 id uuid primary key default gen_random_uuid(),
 service_request_id uuid not null references public.service_requests(id),
 token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 purpose text not null default 'customer_delivery'
);
alter table public.customer_portal_access_tokens enable row level security;
revoke all on public.customer_portal_access_tokens from anon,authenticated;
grant all on public.customer_portal_access_tokens to service_role;
create index customer_portal_access_tokens_request on public.customer_portal_access_tokens(service_request_id);
