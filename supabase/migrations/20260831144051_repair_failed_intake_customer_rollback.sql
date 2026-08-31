-- Remove a customer created only for a failed intake after the request and all
-- request-scoped rows have been removed. Existing/reused customers are always
-- preserved, as are newly created customers that now own another request.
create or replace function public.aps_rollback_failed_intake(p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.service_requests%rowtype;
  v_reference text;
  v_customer_link_type text;
  v_request_delete_count integer := 0;
  v_customer_delete_count integer := 0;
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

  select link_type
  into v_customer_link_type
  from public.customer_link_audits
  where service_request_id = p_request
    and customer_id = v_request.customer_id
  order by created_at desc
  limit 1;

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
  get diagnostics v_request_delete_count = row_count;

  if v_request_delete_count <> 1 then
    raise exception 'Failed-intake rollback did not remove %.', v_reference;
  end if;

  if v_customer_link_type in ('new_customer', 'ambiguous_review')
    and not exists (
      select 1 from public.service_requests where customer_id = v_request.customer_id
    )
  then
    delete from public.customers
    where id = v_request.customer_id
      and created_at >= v_request.created_at - interval '1 minute';
    get diagnostics v_customer_delete_count = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'deleted', true,
    'request_id', p_request,
    'reference', v_reference,
    'customer_id', v_request.customer_id,
    'customer_deleted', v_customer_delete_count = 1
  );
end;
$$;

revoke all on function public.aps_rollback_failed_intake(uuid)
from public, anon, authenticated;
grant execute on function public.aps_rollback_failed_intake(uuid) to service_role;

comment on function public.aps_rollback_failed_intake(uuid) is
  'Atomically removes a recent failed intake and its newly created orphan customer; reused customers and protected lifecycle history remain preserved.';
