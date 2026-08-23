begin;

alter table public.aps_staff_profiles
  add column if not exists account_classification text not null default 'legacy_staff',
  add column if not exists first_name text,
  add column if not exists middle_name text,
  add column if not exists last_name text,
  add column if not exists public_title text,
  add column if not exists professional_email text,
  add column if not exists credentials jsonb not null default '[]'::jsonb,
  add column if not exists assurance_indicators jsonb not null default '[]'::jsonb,
  add column if not exists portrait_path text,
  add column if not exists portrait_approved_at timestamptz,
  add column if not exists card_enabled boolean not null default false,
  add column if not exists card_slug text,
  add constraint aps_staff_account_classification_check check (account_classification in ('legacy_staff','operator')),
  add constraint aps_staff_public_title_check check (public_title is null or public_title in ('Owner','Co-Owner','Managing Member','Notary Public')),
  add constraint aps_staff_credentials_array_check check (jsonb_typeof(credentials)='array'),
  add constraint aps_staff_assurance_array_check check (jsonb_typeof(assurance_indicators)='array'),
  add constraint aps_staff_card_slug_check check (card_slug is null or card_slug ~ '^[a-z][a-z0-9-]{1,31}$');

create unique index if not exists aps_staff_profiles_card_slug_unique
  on public.aps_staff_profiles(card_slug) where card_slug is not null;
create unique index if not exists aps_staff_profiles_professional_email_unique
  on public.aps_staff_profiles(lower(professional_email)) where professional_email is not null;

update public.aps_staff_profiles
set account_classification='operator',
    first_name=coalesce(first_name,split_part(full_name,' ',1)),
    last_name=coalesce(last_name,nullif(substr(full_name,length(split_part(full_name,' ',1))+2),'')),
    public_title=coalesce(public_title,case when role='owner' then 'Owner' else 'Notary Public' end)
where role in ('owner','administrator','operations') and account_classification='legacy_staff';

create table if not exists public.message_conversations (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid references public.service_requests(id) on delete set null,
  subject text not null,
  contact_email text not null,
  contact_name text,
  reply_token_hash text not null unique,
  status text not null default 'open' check (status in ('open','closed')),
  unread_count integer not null default 0 check (unread_count>=0),
  created_by uuid references auth.users(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists message_conversations_request_idx on public.message_conversations(service_request_id,last_message_at desc);

create table if not exists public.message_reply_routes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.message_conversations(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists message_reply_routes_conversation_idx on public.message_reply_routes(conversation_id,created_at desc);

alter table public.messages
  add column if not exists conversation_id uuid references public.message_conversations(id) on delete set null,
  add column if not exists sender text,
  add column if not exists provider_event_id text,
  add column if not exists provider_email_id text,
  add column if not exists provider_message_identifier text,
  add column if not exists received_at timestamptz,
  add column if not exists read_at timestamptz;
create unique index if not exists messages_provider_event_unique on public.messages(provider_event_id) where provider_event_id is not null;
create index if not exists messages_conversation_idx on public.messages(conversation_id,created_at);

alter table public.messages drop constraint if exists messages_delivery_state_check;
alter table public.messages add constraint messages_delivery_state_check
  check (delivery_state in ('draft','sending','sent','failed','skipped','received'));
alter table public.messages drop constraint if exists messages_source_type_check;
alter table public.messages add constraint messages_source_type_check
  check (source_type in ('automatic','workflow','customer_action','admin','operator','inbound_reply'));

alter table public.message_conversations enable row level security;
revoke all on public.message_conversations from public,anon,authenticated;
grant select on public.message_conversations to authenticated;
grant all on public.message_conversations to service_role;
create policy message_conversations_authorized_read on public.message_conversations
  for select to authenticated using ((select public.is_active_aps_staff('communications')));

alter table public.message_reply_routes enable row level security;
revoke all on public.message_reply_routes from public,anon,authenticated;
grant all on public.message_reply_routes to service_role;

create or replace function public.public_operator_card(p_slug text)
returns table(first_name text,middle_name text,last_name text,full_name text,public_title text,credentials jsonb,assurance_indicators jsonb,professional_email text,portrait_path text,card_slug text)
language sql stable security definer set search_path='' as $$
  select s.first_name,s.middle_name,s.last_name,concat_ws(' ',s.first_name,nullif(s.middle_name,''),s.last_name),s.public_title,s.credentials,s.assurance_indicators,
    s.professional_email,coalesce(s.portrait_path,'assets/images/logo-symbol.webp'),s.card_slug
  from public.aps_staff_profiles s
  where s.account_classification='operator' and s.status='active' and s.card_enabled=true and s.card_slug=lower(trim(p_slug))
  limit 1;
$$;
revoke all on function public.public_operator_card(text) from public;
grant execute on function public.public_operator_card(text) to anon,authenticated,service_role;

create or replace function public.enforce_protected_owner()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.role='owner' and old.status='active' and (new.role<>'owner' or new.status<>'active') and
     not exists(select 1 from public.aps_staff_profiles s where s.id<>old.id and s.role='owner' and s.status='active') then
    raise exception 'APS must retain at least one active protected Owner.';
  end if;
  return new;
end;
$$;
drop trigger if exists aps_protected_owner_guard on public.aps_staff_profiles;
create trigger aps_protected_owner_guard before update on public.aps_staff_profiles for each row execute function public.enforce_protected_owner();

commit;
