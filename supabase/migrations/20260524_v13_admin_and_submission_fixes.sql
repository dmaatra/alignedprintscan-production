-- Aligned Print & Scan V13 fixes
-- Run this in Supabase SQL Editor if you have not already added preferred contact/status insert policy.

alter table customers
add column if not exists preferred_contact text;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'request_status_updates'
      and policyname = 'Allow public status update insert'
  ) then
    create policy "Allow public status update insert"
    on request_status_updates
    for insert
    to anon
    with check (true);
  end if;
end $$;
