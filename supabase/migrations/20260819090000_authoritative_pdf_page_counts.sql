begin;

alter table public.request_files
  add column if not exists page_count_status text not null default 'pending',
  add column if not exists page_count_source text,
  add column if not exists page_count_error text,
  add column if not exists page_count_updated_at timestamptz;

alter table public.request_files drop constraint if exists request_files_page_count_status_check;
alter table public.request_files add constraint request_files_page_count_status_check
  check (page_count_status in ('pending','detected','manual','failed','not_pdf'));
alter table public.request_files drop constraint if exists request_files_page_count_source_check;
alter table public.request_files add constraint request_files_page_count_source_check
  check (page_count_source is null or page_count_source in ('server','admin_manual'));
alter table public.request_files drop constraint if exists request_files_detected_page_count_check;
alter table public.request_files add constraint request_files_detected_page_count_check
  check (detected_page_count is null or detected_page_count > 0);

alter table public.service_requests
  add column if not exists pdf_page_count_review_required boolean not null default false,
  add column if not exists pdf_page_count_changed_after_quote boolean not null default false;

update public.request_files
set page_count_status = 'not_pdf', page_count_updated_at = now()
where lower(coalesce(file_type,'')) <> 'application/pdf'
  and lower(coalesce(file_name,'')) not like '%.pdf';

-- Historical browser-derived totals remain visible, but are not relabeled as
-- authoritative server results. Each active legacy PDF is routed to review.
update public.service_requests r
set pdf_page_count_review_required = true
where exists (
  select 1 from public.request_files f
  where f.service_request_id = r.id and coalesce(f.is_active, true)
    and (lower(coalesce(f.file_type,'')) = 'application/pdf' or lower(coalesce(f.file_name,'')) like '%.pdf')
);

insert into public.review_queue_items(service_request_id, blocker_key, title, detail, target_tab, state, source_object_type)
select distinct f.service_request_id, 'pdf_page_count_review', 'PDF page count needs review',
  'This legacy PDF predates authoritative server counting. Review the active source documents and enter a verified page count.',
  'documents', 'open', 'service_request'
from public.request_files f
where coalesce(f.is_active, true)
  and (lower(coalesce(f.file_type,'')) = 'application/pdf' or lower(coalesce(f.file_name,'')) like '%.pdf')
on conflict do nothing;

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
begin
  select detected_pdf_page_count into v_previous
  from public.service_requests where id = p_request_id for update;

  select
    nullif(sum(coalesce(detected_page_count, 0)), 0)::integer,
    bool_or(page_count_status in ('pending','failed'))
  into v_total, v_needs_review
  from public.request_files
  where service_request_id = p_request_id
    and coalesce(is_active, true)
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
begin
  perform public.refresh_request_pdf_page_count(coalesce(new.service_request_id, old.service_request_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists request_files_refresh_pdf_page_count on public.request_files;
create trigger request_files_refresh_pdf_page_count
after insert or update of detected_page_count, page_count_status, is_active or delete
on public.request_files for each row execute function public.request_files_refresh_pdf_page_count();

comment on column public.request_files.page_count_status is 'Server or administrator page-count result for this file; failed/pending requires review.';
comment on column public.service_requests.detected_pdf_page_count is 'Aggregate of authoritative active PDF file page counts; never trusted from browser input.';

commit;
