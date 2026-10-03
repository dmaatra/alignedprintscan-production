begin;

-- No existing file, review, release, or financial record is rewritten here.
-- If historical canonical duplicates exist, this index fails closed; reconcile
-- them with an approved, auditable operation rather than deleting history.
create unique index request_files_proof_canonical_path_unique
  on public.request_files(service_request_id, file_path)
  where uploaded_by = 'proof' and document_category = 'proof-completed';

create or replace function public.refresh_request_pdf_page_count(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_needs_review boolean;
  v_previous integer;
  v_quote_sent boolean;
  v_ron boolean;
begin
  select detected_pdf_page_count, service_type = 'ron' into v_previous, v_ron
  from public.service_requests where id = p_request_id for update;

  select
    nullif(sum(coalesce(detected_page_count, 0)), 0)::integer,
    bool_or(page_count_status in ('pending','failed'))
  into v_total, v_needs_review
  from public.request_files
  where service_request_id = p_request_id
    and coalesce(is_active, true)
    -- RON source pages drive preparation; returns and internal copies do not.
    and (not v_ron or (coalesce(uploaded_by, '') <> 'proof'
      and coalesce(document_classification, '') not in (
        'completed_notarized_document', 'internal_document', 'audit_document',
        'proof_audit_trail', 'customer_deliverable', 'completed_scan')))
    and (lower(coalesce(file_type,'')) = 'application/pdf' or lower(coalesce(file_name,'')) like '%.pdf');

  select exists(
    select 1 from public.quotes
    where service_request_id = p_request_id
      and (sent_at is not null or approved_at is not null or coalesce(state, quote_status, '') in ('sent','approved'))
  ) into v_quote_sent;

  update public.service_requests
  set detected_pdf_page_count = v_total,
      pdf_page_count_review_required = coalesce(v_needs_review, false),
      pdf_page_count_changed_after_quote = pdf_page_count_changed_after_quote
        or (v_quote_sent and v_previous is distinct from v_total)
  where id = p_request_id;

  if coalesce(v_needs_review, false) then
    insert into public.review_queue_items(service_request_id, blocker_key, title, detail, target_tab, state, source_object_type)
    values (p_request_id, 'pdf_page_count_review', 'PDF page count needs review',
      'Automatic page counting could not confirm every active PDF. Review the source documents and enter a verified page count.',
      'documents', 'open', 'service_request')
    on conflict do nothing;
  else
    update public.review_queue_items
    set state = 'resolved', resolved_at = now(), updated_at = now()
    where service_request_id = p_request_id and blocker_key = 'pdf_page_count_review' and state = 'open';
  end if;

  if v_quote_sent and v_previous is distinct from v_total then
    insert into public.review_queue_items(service_request_id, blocker_key, title, detail, target_tab, state, source_object_type)
    values (p_request_id, 'pdf_page_count_changed_after_quote', 'Page count changed after quote',
      'The authoritative PDF page total changed after a quote was sent. Review pricing before further fulfillment.',
      'quote', 'open', 'service_request')
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.refresh_request_pdf_page_count(uuid) from public, anon, authenticated;
grant execute on function public.refresh_request_pdf_page_count(uuid) to service_role;

create or replace function public.request_files_refresh_pdf_page_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_request uuid := coalesce(new.service_request_id, old.service_request_id);
  v_ron boolean;
  v_old_source boolean := false;
  v_new_source boolean := false;
begin
  select service_type = 'ron' into v_ron from public.service_requests where id = v_request;
  if v_ron then
    if tg_op <> 'INSERT' then
      v_old_source := coalesce(old.uploaded_by, '') <> 'proof'
        and coalesce(old.document_classification, '') not in (
          'completed_notarized_document','internal_document','audit_document',
          'proof_audit_trail','customer_deliverable','completed_scan');
    end if;
    if tg_op <> 'DELETE' then
      v_new_source := coalesce(new.uploaded_by, '') <> 'proof'
        and coalesce(new.document_classification, '') not in (
          'completed_notarized_document','internal_document','audit_document',
          'proof_audit_trail','customer_deliverable','completed_scan');
    end if;
    -- Output-only inserts/verification must not mutate source totals or reviews.
    if not v_old_source and not v_new_source then return coalesce(new, old); end if;
  end if;
  perform public.refresh_request_pdf_page_count(v_request);
  return coalesce(new, old);
end;
$$;

drop trigger if exists request_files_refresh_pdf_page_count on public.request_files;
create trigger request_files_refresh_pdf_page_count
  after insert or update of detected_page_count, page_count_status, is_active,
    uploaded_by, document_classification or delete
  on public.request_files for each row execute function public.request_files_refresh_pdf_page_count();

-- Match the existing APS-review provenance boundary at release as well.
create or replace function public.admin_set_document_release(
  p_request uuid,
  p_file uuid,
  p_release boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file public.request_files%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access is required.';
  end if;

  select * into v_file
  from public.request_files
  where id = p_file
    and service_request_id = p_request
    and is_active = true
  for update;

  if not found then
    raise exception 'Document not found for this request.';
  end if;
  if v_file.uploaded_by = 'customer'
    and v_file.document_classification = 'customer_document' then
    raise exception 'Customer uploads already have request-scoped customer access; release is not applicable.';
  end if;
  if p_release
    and v_file.document_classification in ('internal_document', 'proof_audit_trail') then
    raise exception 'Internal and audit documents cannot be released.';
  end if;
  if p_release and v_file.document_classification = 'completed_notarized_document'
    and v_file.uploaded_by is distinct from 'proof' then
    raise exception 'Only a retrieved Proof completed document can be released.';
  end if;
  if p_release
    and v_file.document_classification = 'completed_notarized_document'
    and coalesce(v_file.review_state, 'pending') not in ('approved', 'reviewed', 'ready') then
    raise exception 'Approve the completed notarized document in APS review before releasing it.';
  end if;

  update public.request_files
  set customer_visible = p_release,
      eligible_for_delivery = p_release,
      review_state = case when p_release then 'approved' else review_state end,
      document_classification = case
        when p_release then case
          when v_file.document_classification = 'completed_notarized_document'
            then v_file.document_classification
          else 'customer_deliverable'
        end
        else v_file.document_classification
      end
  where id = p_file;

  insert into public.request_timeline_events(
    service_request_id,
    event_type,
    title,
    detail,
    actor_type,
    visibility,
    metadata
  ) values (
    p_request,
    case when p_release then 'document_released' else 'document_release_withdrawn' end,
    case when p_release then 'Document released' else 'Document release withdrawn' end,
    case when p_release
      then v_file.file_name || ' was released to the customer portal.'
      else v_file.file_name || ' was removed from the customer portal.'
    end,
    'admin',
    'customer',
    jsonb_build_object('request_file_id', p_file)
  );
end
$$;

revoke all on function public.admin_set_document_release(uuid, uuid, boolean)
  from public, anon;
grant execute on function public.admin_set_document_release(uuid, uuid, boolean)
  to authenticated;

-- Removal uses persisted uploader/category/path and protected relationships,
-- never a filename or a user-selected completed-document label.
create or replace function public.admin_removable_uploads(p_request uuid)
returns table(file_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  return query select f.id from public.request_files f
  where f.service_request_id=p_request and f.is_active=true
    and f.uploaded_by='admin'
    and f.document_category in ('admin-additional','admin-intake')
    and left(f.file_path,length(p_request::text||'/admin/'))=p_request::text||'/admin/'
    and f.customer_visible=false and f.eligible_for_delivery=false
    and coalesce(f.document_classification,'') not in ('audit_document','proof_audit_trail')
    and left(coalesce(f.document_classification,''),4)<>'lsa_'
    and not exists (select 1 from public.proof_transaction_assets a
      where a.source_request_file_id=f.id or
        (a.storage_bucket='service-request-files' and a.storage_path=f.file_path))
    and not exists (select 1 from public.proof_document_command_attempts a where a.request_file_id=f.id)
    and not exists (select 1 from public.request_document_participants p where p.request_file_id=f.id)
    and not exists (select 1 from public.loan_signing_package_versions p where p.source_file_id=f.id)
    and not exists (select 1 from public.loan_signing_returns p where p.proof_file_id=f.id)
    and not exists (select 1 from public.loan_signing_stipulations p where p.proof_file_id=f.id)
    and not exists (select 1 from public.message_attachments a where a.request_file_id=f.id)
    and not exists (select 1 from public.request_files other where other.id<>f.id
      and other.file_path=f.file_path and (other.uploaded_by is distinct from 'admin'
        or other.customer_visible=true or other.eligible_for_delivery=true));
end;
$$;
revoke all on function public.admin_removable_uploads(uuid) from public,anon;
grant execute on function public.admin_removable_uploads(uuid) to authenticated;

create or replace function public.admin_remove_uploaded_document(p_request uuid,p_file uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_file public.request_files;
  v_removed_at timestamptz := now();
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  -- The release RPC locks this same row; recheck eligibility under that lock.
  perform 1 from public.service_requests where id=p_request for update;
  select * into v_file from public.request_files
    where id=p_file and service_request_id=p_request for update;
  if v_file.id is null or v_file.is_active is distinct from true then
    raise exception 'Active document not found';
  end if;
  if not exists (select 1 from public.admin_removable_uploads(p_request) where file_id=p_file) then
    raise exception 'Only an unreleased manual administrator upload without protected workflow references can be removed';
  end if;
  update public.request_files set is_active=false,review_state='removed',
    customer_visible=false,eligible_for_delivery=false where id=p_file;
  -- Explicit removal resolves only file-scoped obligations; request-level
  -- pricing, participant, financial, and other safety reviews remain intact.
  update public.review_queue_items set state='resolved',resolved_at=v_removed_at,
    resolved_by=auth.uid(),updated_at=v_removed_at
    where service_request_id=p_request and state='open'
      and source_object_type in ('request_file','request_files') and source_object_id=p_file;
  insert into public.request_timeline_events(
    service_request_id,event_type,title,detail,actor_type,visibility,metadata)
  values(p_request,'admin_document_removed','Administrator upload removed',
    v_file.file_name||' was removed from the active APS request; its private file and history were retained.',
    'admin','internal',jsonb_build_object('request_file_id',p_file,'admin_id',auth.uid(),
      'action','deactivated','removed_at',v_removed_at,'storage_action','retained',
      'file_before',to_jsonb(v_file)));
  return jsonb_build_object('file_id',p_file,'removed_at',v_removed_at,'storage_action','retained');
end;
$$;
revoke all on function public.admin_remove_uploaded_document(uuid,uuid) from public,anon;
grant execute on function public.admin_remove_uploaded_document(uuid,uuid) to authenticated;

commit;
