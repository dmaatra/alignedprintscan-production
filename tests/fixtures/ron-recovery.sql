-- PROPOSAL ONLY: requires explicit owner approval and the incident migration.
-- Run in one transaction after setting aps.incident_approval to the approval
-- reference. Never run as part of a migration or an automatic deployment.
-- No request_files, invoices, payments, messages, or request status are changed.
begin;
do $$
declare
  v_request uuid := '10000000-0000-4000-8000-000000000001';
  v_review uuid := '10000000-0000-4000-8000-000000000006';
  v_before jsonb;
  v_review_before jsonb;
  v_source_pages integer;
begin
  if nullif(current_setting('aps.incident_approval',true),'') is null then
    raise exception 'Explicit owner approval reference is required';
  end if;
  if not exists (select 1 from pg_indexes where schemaname='public'
      and indexname='request_files_proof_canonical_path_unique') then
    raise exception 'Deploy the incident migration before reconciliation';
  end if;
  -- Serializes against page-count refreshes and competing file writes.
  perform 1 from public.service_requests where id=v_request for update;
  perform 1 from public.request_files where service_request_id=v_request for update;
  select jsonb_build_object('detected_pdf_page_count',detected_pdf_page_count,
    'pdf_page_count_changed_after_quote',pdf_page_count_changed_after_quote)
    into v_before from public.service_requests
    where id=v_request and service_type='ron' and detected_pdf_page_count=8
      and pdf_page_count_changed_after_quote=true;
  if v_before is null then raise exception 'Request state changed; reinspect before recovery'; end if;
  select to_jsonb(q) into v_review_before from public.review_queue_items q
    where id=v_review and service_request_id=v_request
      and blocker_key='pdf_page_count_changed_after_quote' and state='open' for update;
  if v_review_before is null then raise exception 'Review state changed; reinspect before recovery'; end if;
  if not exists (select 1 from public.request_files
    where id='10000000-0000-4000-8000-000000000003' and service_request_id=v_request
      and uploaded_by='proof' and document_classification='completed_notarized_document'
      and review_state='approved' and is_active and customer_visible and eligible_for_delivery) then
    raise exception 'Valid reviewed/released Proof artifact changed';
  end if;
  if not exists (select 1 from public.request_files
    where id='10000000-0000-4000-8000-000000000004' and service_request_id=v_request
      and document_classification='internal_document' and not customer_visible and not eligible_for_delivery) then
    raise exception 'Audit trail visibility changed';
  end if;
  if (select count(*) from public.request_files where service_request_id=v_request and is_active) <> 4 then
    raise exception 'Document inventory changed; reinspect before recovery';
  end if;
  select sum(detected_page_count)::integer into v_source_pages
    from public.request_files where service_request_id=v_request and is_active
      and coalesce(uploaded_by,'') <> 'proof'
      and coalesce(document_classification,'') not in (
        'completed_notarized_document','internal_document','audit_document',
        'proof_audit_trail','customer_deliverable','completed_scan')
      and (lower(coalesce(file_type,''))='application/pdf' or lower(coalesce(file_name,'')) like '%.pdf');
  if v_source_pages is distinct from 2 or not exists (
    select 1 from public.request_files where id='10000000-0000-4000-8000-000000000005'
      and service_request_id=v_request and uploaded_by='customer'
      and document_classification='customer_document' and is_active
      and detected_page_count=2 and page_count_status='detected') then
    raise exception 'Source pages changed; review pricing normally';
  end if;
  update public.service_requests set detected_pdf_page_count=2,
    pdf_page_count_changed_after_quote=false where id=v_request;
  update public.review_queue_items set state='resolved',resolved_at=now(),updated_at=now()
    where id=v_review;
  insert into public.request_timeline_events(
    service_request_id,event_type,title,detail,actor_type,visibility,metadata)
  values(v_request,'ron_source_page_count_reconciled','RON source page count reconciled',
    'Owner-approved correction: completed copies and the internal Proof audit trail were counted as additional source pages. The original source remains two pages; document releases and financial records were preserved.',
    'system','internal',jsonb_build_object('approval_reference',current_setting('aps.incident_approval'),
      'request_before',v_before,'review_before',v_review_before,
      'request_after',jsonb_build_object('detected_pdf_page_count',2,'pdf_page_count_changed_after_quote',false),
      'review_id',v_review,'review_after',jsonb_build_object('state','resolved')));
end;
$$;
commit;
