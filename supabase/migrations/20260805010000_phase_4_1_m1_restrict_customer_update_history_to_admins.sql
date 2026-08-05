drop policy if exists "authenticated admins can read customer update history"
  on public.request_customer_note_history;

create policy "authenticated admins can read customer update history"
  on public.request_customer_note_history
  for select
  to authenticated
  using (public.is_admin());
