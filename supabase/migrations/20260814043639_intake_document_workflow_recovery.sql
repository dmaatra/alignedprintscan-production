-- Focused recovery: restore authenticated admin document writes without
-- reopening anonymous request_files or private storage access.
alter table public.request_files enable row level security;
grant select, insert, update, delete on public.request_files to authenticated;
drop policy if exists aps_admin_request_files on public.request_files;
create policy aps_admin_request_files on public.request_files
for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

drop policy if exists aps_admin_service_request_files_select on storage.objects;
drop policy if exists aps_admin_service_request_files_insert on storage.objects;
drop policy if exists aps_admin_service_request_files_update on storage.objects;
drop policy if exists aps_admin_service_request_files_delete on storage.objects;
create policy aps_admin_service_request_files_select on storage.objects for select to authenticated
using (bucket_id = 'service-request-files' and (select public.is_admin()));
create policy aps_admin_service_request_files_insert on storage.objects for insert to authenticated
with check (bucket_id = 'service-request-files' and (select public.is_admin()));
create policy aps_admin_service_request_files_update on storage.objects for update to authenticated
using (bucket_id = 'service-request-files' and (select public.is_admin()))
with check (bucket_id = 'service-request-files' and (select public.is_admin()));
create policy aps_admin_service_request_files_delete on storage.objects for delete to authenticated
using (bucket_id = 'service-request-files' and (select public.is_admin()));

create table if not exists public.admin_request_views (
  admin_user_id uuid not null,
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  primary key (admin_user_id, service_request_id)
);
alter table public.admin_request_views enable row level security;
revoke all on public.admin_request_views from anon, authenticated;

create or replace function public.admin_mark_request_viewed(p_request uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := auth.uid(); v_remaining integer;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  if not exists(select 1 from public.service_requests where id=p_request) then raise exception 'Request not found.'; end if;
  insert into public.admin_request_views(admin_user_id,service_request_id) values(v_admin,p_request) on conflict do nothing;
  select count(*)::integer into v_remaining from public.service_requests r
  where r.archived_at is null and not exists(select 1 from public.admin_request_views v where v.admin_user_id=v_admin and v.service_request_id=r.id);
  return v_remaining;
end $$;

create or replace function public.admin_unopened_request_count()
returns integer language plpgsql stable security definer set search_path = '' as $$
declare v_admin uuid := auth.uid(); v_count integer;
begin
  if v_admin is null or not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  select count(*)::integer into v_count from public.service_requests r
  where r.archived_at is null and not exists(select 1 from public.admin_request_views v where v.admin_user_id=v_admin and v.service_request_id=r.id);
  return v_count;
end $$;
revoke all on function public.admin_mark_request_viewed(uuid), public.admin_unopened_request_count() from public, anon;
grant execute on function public.admin_mark_request_viewed(uuid), public.admin_unopened_request_count() to authenticated;

create index if not exists admin_request_views_request_idx on public.admin_request_views(service_request_id);

comment on table public.admin_request_views is 'Per-admin durable first-open state for the Requests sidebar unopened-count badge.';

create or replace function public.admin_set_document_release(p_request uuid, p_file uuid, p_release boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_file public.request_files%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access is required.'; end if;
  select * into v_file from public.request_files where id=p_file and service_request_id=p_request and is_active=true for update;
  if not found then raise exception 'Document not found for this request.'; end if;
  if v_file.uploaded_by='customer' and v_file.document_classification='customer_document' then raise exception 'Customer uploads already have request-scoped customer access; release is not applicable.'; end if;
  if p_release and v_file.document_classification in ('internal_document','proof_audit_trail') then raise exception 'Internal and audit documents cannot be released.'; end if;
  if p_release and v_file.document_classification='completed_notarized_document' and coalesce(v_file.review_state,'pending') not in ('approved','reviewed','ready') then raise exception 'Approve the completed notarized document in APS review before releasing it.'; end if;
  update public.request_files set customer_visible=p_release, eligible_for_delivery=p_release, review_state=case when p_release then 'approved' else review_state end,
    document_classification=case when p_release then case when v_file.document_classification='completed_notarized_document' then v_file.document_classification else 'customer_deliverable' end else v_file.document_classification end,
    updated_at=now() where id=p_file;
  insert into public.request_timeline_events(service_request_id,event_type,title,detail,actor_type,visibility,metadata)
  values(p_request,case when p_release then 'document_released' else 'document_release_withdrawn' end,case when p_release then 'Document released' else 'Document release withdrawn' end,case when p_release then v_file.file_name||' was released to the customer portal.' else v_file.file_name||' was removed from the customer portal.' end,'admin','customer',jsonb_build_object('request_file_id',p_file));
end $$;
revoke all on function public.admin_set_document_release(uuid,uuid,boolean) from public, anon;
grant execute on function public.admin_set_document_release(uuid,uuid,boolean) to authenticated;
