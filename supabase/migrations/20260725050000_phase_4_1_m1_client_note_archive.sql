-- Phase 4.1 Milestone 1
-- Archive the active client-facing note and reset the live note fields when an
-- invoice reaches a paid state. This preserves history without carrying an old
-- invoice note into the next billing stage.

create table if not exists public.request_customer_note_history (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references public.service_requests(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  note_text text not null,
  archive_reason text not null default 'invoice_paid',
  archived_at timestamptz not null default now()
);

create index if not exists request_customer_note_history_request_idx
  on public.request_customer_note_history(service_request_id, archived_at desc);

alter table public.request_customer_note_history enable row level security;

create policy "admins can manage request customer note history"
  on public.request_customer_note_history
  for all
  to authenticated
  using (true)
  with check (true);

create or replace function public.archive_paid_invoice_client_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_note text;
begin
  if lower(coalesce(new.payment_status, new.status, '')) not in
     ('paid', 'payment_received', 'final_payment_received') then
    return new;
  end if;

  if lower(coalesce(old.payment_status, old.status, '')) in
     ('paid', 'payment_received', 'final_payment_received') then
    return new;
  end if;

  select nullif(trim(coalesce(sr.customer_message, sr.quote_notes, '')), '')
    into current_note
  from public.service_requests sr
  where sr.id = new.service_request_id;

  if current_note is not null then
    insert into public.request_customer_note_history (
      service_request_id, invoice_id, note_text, archive_reason
    ) values (
      new.service_request_id, new.id, current_note, 'invoice_paid'
    );

    update public.service_requests
      set customer_message = null,
          quote_notes = null
    where id = new.service_request_id;
  end if;

  return new;
end;
$$;

drop trigger if exists archive_paid_invoice_client_note on public.invoices;
create trigger archive_paid_invoice_client_note
after update of status, payment_status on public.invoices
for each row execute function public.archive_paid_invoice_client_note();
