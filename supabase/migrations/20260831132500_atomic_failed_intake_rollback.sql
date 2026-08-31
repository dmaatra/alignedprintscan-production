create or replace function public.aps_rollback_failed_intake(p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.service_requests%rowtype;
  v_reference text;
begin
  select *
  into v_request
  from public.service_requests
  where id = p_request
  for update;

  if v_request.id is null then
    return jsonb_build_object('ok', true, 'deleted', false, 'request_id', p_request);
  end if;

  v_reference := 'APS-' || upper(substr(v_request.id::text, 1, 8));

  if v_request.created_at < now() - interval '30 minutes' then
    raise exception 'Failed-intake rollback window has expired for %.', v_reference;
  end if;
  if coalesce(v_request.request_source, '') not in ('website', 'admin') then
    raise exception 'Request % is not an intake request.', v_reference;
  end if;
  if v_request.completed_at is not null or coalesce(v_request.status, '') in ('completed', 'cancelled') then
    raise exception 'Request % has protected lifecycle history.', v_reference;
  end if;
  if exists (select 1 from public.invoices where service_request_id = p_request)
    or exists (select 1 from public.payments where service_request_id = p_request)
    or exists (select 1 from public.request_payments where service_request_id = p_request)
    or exists (select 1 from public.business_financial_events where service_request_id = p_request)
    or exists (select 1 from public.proof_transactions where service_request_id = p_request)
    or exists (select 1 from public.messages where service_request_id = p_request)
    or exists (select 1 from public.request_completion_exceptions where service_request_id = p_request)
    or exists (select 1 from public.request_completion_facts where service_request_id = p_request)
  then
    raise exception 'Request % has protected operational or financial history.', v_reference;
  end if;

  delete from public.request_document_participants
  where participant_id in (
    select id from public.request_participants where service_request_id = p_request
  ) or request_file_id in (
    select id from public.request_files where service_request_id = p_request
  );
  delete from public.request_participants where service_request_id = p_request;
  delete from public.request_notarial_acts where service_request_id = p_request;
  delete from public.customer_link_audits where service_request_id = p_request;
  delete from public.service_requests where id = p_request;

  if not found then
    raise exception 'Failed-intake rollback did not remove %.', v_reference;
  end if;

  return jsonb_build_object(
    'ok', true,
    'deleted', true,
    'request_id', p_request,
    'reference', v_reference,
    'customer_id', v_request.customer_id
  );
end;
$$;

revoke all on function public.aps_rollback_failed_intake(uuid)
from public, anon, authenticated;
grant execute on function public.aps_rollback_failed_intake(uuid) to service_role;

comment on function public.aps_rollback_failed_intake(uuid) is
  'Atomically removes only a recent, incomplete intake when public-request-submit fails; protected lifecycle, financial, messaging, completion, and Proof history block rollback.';
