do $$
begin
  assert (
    select count(*) = 1
    from public.resource_articles
    where slug = 'business-payment-terms-prepaid-due-net'
  ), 'Release 9.2.1 expected exactly one managed payment-terms article';
end
$$;

update public.resource_articles
set
  status = 'archived',
  updated_at = now()
where slug = 'business-payment-terms-prepaid-due-net'
  and status <> 'archived';

comment on table public.resource_articles is
  'Managed Resource Center articles. Release 9.2.1 archives the detailed public payment-terms article without deleting its history or internal Business Account financial capabilities.';
