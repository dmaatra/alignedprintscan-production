-- Restore the reviewed APS document-release boundary without referencing a
-- timestamp column that request_files does not have.
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
