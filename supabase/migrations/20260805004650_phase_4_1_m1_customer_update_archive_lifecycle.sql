-- Phase 4.1 Milestone 1 — corrective customer-update archive lifecycle.
--
-- This forward-only migration replaces the historical any-invoice-paid trigger
-- with an all-required-invoices-complete check, adds source metadata for future
-- customer updates, and narrows history-table API access to authenticated reads.

alter table public.service_requests
  add column if not exists customer_update_id uuid,
  add column if not exists customer_update_author text,
  add column if not exists customer_update_created_at timestamptz;

alter table public.request_customer_note_history
  add column if not exists original_author text,
  add column if not exists original_created_at timestamptz,
  add column if not exists archived_by text,
  add column if not exists source_note_id uuid,
  add column if not exists source_note_field text;

-- Give each currently active update a stable source ID without pretending that
-- its original author or creation time is known.
update public.service_requests
set customer_update_id = gen_random_uuid()
where customer_update_id is null
  and nullif(trim(coalesce(customer_message, quote_notes, '')), '') is not null;

create unique index if not exists request_customer_note_history_source_idx
  on public.request_customer_note_history(source_note_id, source_note_field)
  where source_note_id is not null;

create or replace function public.track_customer_update_metadata()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  actor text;
begin
  if jsonb_build_array(new.customer_message, new.quote_notes)
     is distinct from
     jsonb_build_array(old.customer_message, old.quote_notes) then
    if nullif(trim(coalesce(new.customer_message, new.quote_notes, '')), '')
       is null then
      new.customer_update_id := null;
      new.customer_update_author := null;
      new.customer_update_created_at := null;
    else
      actor := coalesce(
        nullif(auth.jwt() ->> 'email', ''),
        auth.uid()::text,
        nullif(auth.jwt() ->> 'role', ''),
        current_user
      );
      new.customer_update_id := gen_random_uuid();
      new.customer_update_author := actor;
      new.customer_update_created_at := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists track_customer_update_metadata on public.service_requests;
create trigger track_customer_update_metadata
before update of customer_message, quote_notes on public.service_requests
for each row execute function public.track_customer_update_metadata();

create or replace function public.archive_paid_invoice_client_note()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  active_request public.service_requests%rowtype;
  current_message text;
  current_quote_note text;
  source_id uuid;
  archive_actor text;
  expected_archives integer := 0;
  preserved_archives integer := 0;
begin
  -- An invoice is paid when either deployed status column records a paid state.
  -- This intentionally does not use COALESCE because payment_status can remain
  -- "unpaid" while status already records "paid".
  if lower(coalesce(new.payment_status, '')) not in
       ('paid', 'payment_received', 'final_payment_received')
     and lower(coalesce(new.status, '')) not in
       ('paid', 'payment_received', 'final_payment_received') then
    return new;
  end if;

  -- Every non-void/non-cancelled invoice for the request is required because
  -- the deployed schema has no separate optional/required invoice flag.
  if exists (
    select 1
    from public.invoices invoice
    where invoice.service_request_id = new.service_request_id
      and lower(coalesce(invoice.status, '')) not in ('void', 'cancelled')
      and lower(coalesce(invoice.payment_status, '')) not in
            ('paid', 'payment_received', 'final_payment_received')
      and lower(coalesce(invoice.status, '')) not in
            ('paid', 'payment_received', 'final_payment_received')
  ) then
    return new;
  end if;

  -- Lock the active update so archival and clearing are concurrency-safe.
  select *
  into active_request
  from public.service_requests
  where id = new.service_request_id
  for update;

  current_message := nullif(trim(active_request.customer_message), '');
  current_quote_note := nullif(trim(active_request.quote_notes), '');

  if current_message is null and current_quote_note is null then
    return new;
  end if;

  source_id := coalesce(active_request.customer_update_id, gen_random_uuid());
  archive_actor := coalesce(
    nullif(auth.jwt() ->> 'email', ''),
    auth.uid()::text,
    nullif(auth.jwt() ->> 'role', ''),
    current_user
  );

  begin
    if current_message is not null
       and current_quote_note is not null
       and current_message = current_quote_note then
      expected_archives := 1;
      insert into public.request_customer_note_history (
        service_request_id,
        invoice_id,
        note_text,
        archive_reason,
        original_author,
        original_created_at,
        archived_by,
        source_note_id,
        source_note_field
      ) values (
        new.service_request_id,
        new.id,
        current_message,
        'financially_complete',
        active_request.customer_update_author,
        active_request.customer_update_created_at,
        archive_actor,
        source_id,
        'customer_message+quote_notes'
      )
      on conflict (source_note_id, source_note_field)
        where source_note_id is not null
      do nothing;
    else
      if current_message is not null then
        expected_archives := expected_archives + 1;
        insert into public.request_customer_note_history (
          service_request_id, invoice_id, note_text, archive_reason,
          original_author, original_created_at, archived_by,
          source_note_id, source_note_field
        ) values (
          new.service_request_id, new.id, current_message,
          'financially_complete', active_request.customer_update_author,
          active_request.customer_update_created_at, archive_actor,
          source_id, 'customer_message'
        )
        on conflict (source_note_id, source_note_field)
          where source_note_id is not null
        do nothing;
      end if;

      if current_quote_note is not null then
        expected_archives := expected_archives + 1;
        insert into public.request_customer_note_history (
          service_request_id, invoice_id, note_text, archive_reason,
          original_author, original_created_at, archived_by,
          source_note_id, source_note_field
        ) values (
          new.service_request_id, new.id, current_quote_note,
          'financially_complete', active_request.customer_update_author,
          active_request.customer_update_created_at, archive_actor,
          source_id, 'quote_notes'
        )
        on conflict (source_note_id, source_note_field)
          where source_note_id is not null
        do nothing;
      end if;
    end if;

    select count(*)
    into preserved_archives
    from public.request_customer_note_history history
    where history.source_note_id = source_id
      and history.service_request_id = new.service_request_id;

    if preserved_archives < expected_archives then
      raise exception 'Customer update archive verification failed for request %',
        new.service_request_id;
    end if;

    -- Clear only the exact update that was locked and successfully preserved.
    update public.service_requests
    set customer_message = null,
        quote_notes = null
    where id = new.service_request_id
      and customer_update_id is not distinct from active_request.customer_update_id
      and customer_message is not distinct from active_request.customer_message
      and quote_notes is not distinct from active_request.quote_notes;
  exception
    when others then
      -- The subtransaction rolls back any partial archive writes. The invoice
      -- update may continue, but the active customer update remains intact.
      raise warning 'Customer update archive failed for request %: %',
        new.service_request_id, sqlerrm;
      return new;
  end;

  return new;
end;
$$;

drop trigger if exists archive_paid_invoice_client_note on public.invoices;
create trigger archive_paid_invoice_client_note
after update of status, payment_status on public.invoices
for each row execute function public.archive_paid_invoice_client_note();

-- History is admin-read-only through the browser. Trigger writes run under the
-- function owner; anonymous users receive neither grants nor an RLS policy.
alter table public.request_customer_note_history enable row level security;

drop policy if exists "admins can manage request customer note history"
  on public.request_customer_note_history;
drop policy if exists "authenticated admins can read customer update history"
  on public.request_customer_note_history;
create policy "authenticated admins can read customer update history"
  on public.request_customer_note_history
  for select
  to authenticated
  using (true);

revoke all on table public.request_customer_note_history from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.request_customer_note_history from authenticated;
grant select on table public.request_customer_note_history to authenticated;

revoke all on function public.archive_paid_invoice_client_note() from public;
revoke all on function public.archive_paid_invoice_client_note() from anon;
revoke all on function public.archive_paid_invoice_client_note() from authenticated;
