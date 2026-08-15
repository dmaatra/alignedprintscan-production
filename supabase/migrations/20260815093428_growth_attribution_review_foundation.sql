-- Privacy-conscious acquisition attribution and neutral post-completion review foundation.
-- Additive only: no existing request, customer, financial, document, or Proof state is rewritten.

alter table public.service_requests
  add column acquisition_landing_page text,
  add column acquisition_referrer_host text,
  add column acquisition_utm_source text,
  add column acquisition_utm_medium text,
  add column acquisition_utm_campaign text,
  add column acquisition_utm_content text,
  add column first_touch_source text,
  add column customer_reported_source text,
  add column customer_reported_source_detail text,
  add column review_request_state text not null default 'not_eligible'
    check (review_request_state in ('not_eligible','eligible','sent')),
  add column review_request_eligible_at timestamptz,
  add column review_request_sent_at timestamptz,
  add column review_destination_key text,
  add column review_message_id uuid references public.messages(id) on delete set null;

alter table public.customers
  add column first_acquisition_source text,
  add column first_acquisition_at timestamptz;

create index service_requests_acquisition_source_idx
  on public.service_requests(acquisition_utm_source, service_type, created_at desc);
create index service_requests_review_state_idx
  on public.service_requests(review_request_state, completed_at desc);

create or replace function public.set_review_request_eligibility()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  has_balance boolean;
  has_unreleased_deliverable boolean;
begin
  if new.review_request_state = 'sent' then return new; end if;
  if coalesce(new.workflow_status,new.status) <> 'completed' then
    new.review_request_state := 'not_eligible';
    new.review_request_eligible_at := null;
    return new;
  end if;
  select exists(
    select 1 from public.invoices i
    where i.service_request_id = new.id
      and lower(coalesce(i.status,'')) not in ('void','cancelled','canceled')
      and greatest(coalesce(i.amount_due,0)-coalesce(i.amount_paid,0),0) > 0.009
  ) into has_balance;
  select exists(
    select 1 from public.request_files f
    where f.service_request_id = new.id and f.is_active = true
      and f.eligible_for_delivery = true and f.customer_visible = false
  ) into has_unreleased_deliverable;
  if not has_balance and not has_unreleased_deliverable then
    new.review_request_state := 'eligible';
    new.review_request_eligible_at := coalesce(new.review_request_eligible_at,now());
  else
    new.review_request_state := 'not_eligible';
    new.review_request_eligible_at := null;
  end if;
  return new;
end;
$$;

create trigger service_request_review_eligibility
before insert or update of status,workflow_status on public.service_requests
for each row execute function public.set_review_request_eligibility();

insert into public.message_templates(
  template_key,name,description,subject_template,html_template,text_template,
  associated_status,required_attachment_type,active
) values (
  'review_request','Customer Experience Review','Neutral post-completion review invitation',
  'How was your experience with Aligned Print & Scan?',
  '<p>Hello {{customer_first_name}},</p><p>Thank you for choosing Aligned Print & Scan. If you would like to share your experience, your feedback helps others learn about our services.</p><p>Participation is optional and does not affect your service.</p>',
  'Thank you for choosing Aligned Print & Scan. If you would like to share your experience, your feedback helps others learn about our services. Participation is optional.',
  'completed',null,false
) on conflict(template_key) do update set
  name=excluded.name,description=excluded.description,subject_template=excluded.subject_template,
  html_template=excluded.html_template,text_template=excluded.text_template,active=false;

comment on column public.service_requests.review_request_state is
  'APS-owned eligibility/sent state only; never represents whether a public review was posted.';
comment on column public.service_requests.acquisition_landing_page is
  'Sanitized canonical public path only; never a request URL, token, or query string.';
