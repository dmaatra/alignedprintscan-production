create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    else exists (
      select 1
      from public.admin_users as admin_user
      join auth.users as auth_user
        on auth_user.id = auth.uid()
      where pg_catalog.lower(admin_user.email) =
            pg_catalog.lower(auth_user.email)
    )
  end;
$$;

alter function public.is_admin() owner to postgres;

revoke all on function public.is_admin() from public;
revoke all on function public.is_admin() from anon;
revoke all on function public.is_admin() from service_role;
grant execute on function public.is_admin() to authenticated;
