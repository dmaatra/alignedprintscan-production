-- Focused RON operator-return support. This does not alter Proof transaction,
-- retrieval, release, customer filtering, or completion authorization.
alter table public.admin_notifications
  add column target_document_id uuid references public.request_files(id) on delete set null;

create or replace function public.admin_review_proof_completed_document(
  p_request uuid,
  p_file uuid
) returns public.request_files
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.request_files;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select * into v_file
  from public.request_files
  where id = p_file
    and service_request_id = p_request
    and is_active = true
  for update;

  if v_file.id is null then raise exception 'Document not found'; end if;
  if v_file.document_classification <> 'completed_notarized_document'
     or v_file.uploaded_by <> 'proof' then
    raise exception 'Only a retrieved Proof completed document can complete APS review';
  end if;
  if v_file.customer_visible or v_file.eligible_for_delivery then
    raise exception 'Released documents cannot be re-reviewed through this action';
  end if;
  if coalesce(v_file.review_state, 'pending') in ('approved', 'reviewed', 'ready') then
    return v_file;
  end if;

  update public.request_files
  set review_state = 'approved'
  where id = v_file.id
  returning * into v_file;

  insert into public.request_timeline_events(
    service_request_id,event_type,title,detail,actor_type,metadata,visibility
  ) values (
    p_request,'proof_completed_document_reviewed','Proof completed document reviewed',
    'An administrator completed APS review. Customer release remains separate.',
    'admin',jsonb_build_object('request_file_id',p_file,'admin_user_id',auth.uid()),'internal'
  );
  return v_file;
end;
$$;

revoke all on function public.admin_review_proof_completed_document(uuid,uuid) from public,anon;
grant execute on function public.admin_review_proof_completed_document(uuid,uuid) to authenticated;

create or replace function public.notify_proof_completed_document_staged()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file uuid;
begin
  if new.event_type <> 'proof_completed_document_staged' then return new; end if;
  v_file := nullif(new.metadata->>'request_file_id','')::uuid;
  insert into public.admin_notifications(
    service_request_id,event_type,severity,title,body,target_tab,target_document_id,dedupe_key
  ) values (
    new.service_request_id,'proof_completed_document_ready_for_review','action_required',
    'Completed notarized document ready for review',
    'APS securely retrieved the completed Proof document. Review it before customer release.',
    'documents',v_file,'proof-review:'||coalesce(v_file::text,new.id::text)
  ) on conflict(dedupe_key) do nothing;
  return new;
end;
$$;

revoke all on function public.notify_proof_completed_document_staged() from public,anon,authenticated;
create trigger proof_completed_document_staged_notification
after insert on public.request_timeline_events
for each row when (new.event_type = 'proof_completed_document_staged')
execute function public.notify_proof_completed_document_staged();
