-- Release 10: keep public intake behind its validated Edge Function boundary.
-- Both maintained callers use the service role after applying their own
-- customer/business validation, rate, authorization, and tenant checks.
revoke all on function public.aps_create_request_with_customer(jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.aps_create_request_with_customer(jsonb, jsonb)
to service_role;

-- This function exists only as an internal trigger procedure. It is never a
-- browser RPC and must not be directly executable by API roles.
revoke all on function public.request_files_refresh_pdf_page_count()
from public, anon, authenticated;
grant execute on function public.request_files_refresh_pdf_page_count()
to service_role;

-- Immutable normalization helpers do not resolve application objects. An
-- empty search path prevents caller-controlled object shadowing.
alter function public.aps_normalize_email(text) set search_path = '';
alter function public.aps_normalize_phone(text) set search_path = '';
alter function public.aps_normalize_name(text) set search_path = '';

-- Retire browser access to the superseded order/quote intake tables. Current
-- public intake uses public-request-submit and canonical service_requests;
-- historical rows remain intact and available to the service role.
drop policy if exists "allow insert order_files" on public.order_files;
drop policy if exists "allow select order_files" on public.order_files;
drop policy if exists "allow insert orders" on public.orders;
drop policy if exists "allow public insert orders" on public.orders;
drop policy if exists "allow select orders" on public.orders;
drop policy if exists "Allow public insert files" on public.quote_request_files;
drop policy if exists "authenticated read quote request files" on public.quote_request_files;
drop policy if exists "public insert quote request files" on public.quote_request_files;
drop policy if exists "Allow public insert" on public.quote_requests;
drop policy if exists "Allow public select quote requests" on public.quote_requests;

revoke all on table public.orders, public.order_files,
  public.quote_requests, public.quote_request_files
from public, anon, authenticated;
grant all on table public.orders, public.order_files,
  public.quote_requests, public.quote_request_files
to service_role;

-- The historical policy name claimed admin-only access but allowed every
-- authenticated account. Preserve public ticket submission while requiring
-- the maintained APS admin authorization helper for staff operations.
drop policy if exists "Allow admin support ticket access" on public.support_tickets;
create policy "APS admins manage support tickets"
on public.support_tickets
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
