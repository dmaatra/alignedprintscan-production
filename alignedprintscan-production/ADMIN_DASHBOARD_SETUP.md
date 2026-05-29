# Aligned Print & Scan Admin Dashboard Setup

This project now includes a private owner dashboard:

- `admin-login.html`
- `admin-dashboard.html`
- `assets/js/admin.js`

The dashboard is intentionally not linked in the public navigation. Open it directly at:

`/admin-login.html`

## What it does

The dashboard lets you:

- sign in privately with Supabase Auth
- view incoming service requests
- filter by service/status
- open uploaded document links
- update request status
- hear/see an alert when a new request comes in
- use an internal travel/profitability calculator

## Step 1 — Create your admin login user

In Supabase:

1. Go to **Authentication**.
2. Go to **Users**.
3. Click **Add user**.
4. Add your admin email, such as `hello@alignedprintscan.com`.
5. Create a secure password.
6. Save.

Later, you can add your husband as a separate user.

## Step 2 — Run admin security SQL

Go to **SQL Editor** in Supabase and run this SQL.

Replace the email values with the exact emails you want to allow into the dashboard.

```sql
create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  email text unique not null,
  role text default 'owner'
);

alter table admin_users enable row level security;

insert into admin_users (email, role)
values ('hello@alignedprintscan.com', 'owner')
on conflict (email) do update set role = excluded.role;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.admin_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create policy "Admins can view admin users"
on admin_users
for select
to authenticated
using (public.is_admin());

-- Admin dashboard read/update policies
create policy "Admins can view customers"
on customers
for select
to authenticated
using (public.is_admin());

create policy "Admins can view service requests"
on service_requests
for select
to authenticated
using (public.is_admin());

create policy "Admins can update service requests"
on service_requests
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can view RON request details"
on ron_requests
for select
to authenticated
using (public.is_admin());

create policy "Admins can view mobile request details"
on mobile_notary_requests
for select
to authenticated
using (public.is_admin());

create policy "Admins can view print scan details"
on print_scan_requests
for select
to authenticated
using (public.is_admin());

create policy "Admins can view request files"
on request_files
for select
to authenticated
using (public.is_admin());

create policy "Admins can view request status updates"
on request_status_updates
for select
to authenticated
using (public.is_admin());

create policy "Admins can insert request status updates"
on request_status_updates
for insert
to authenticated
with check (public.is_admin());

create policy "Admins can view quotes"
on quotes
for select
to authenticated
using (public.is_admin());

create policy "Admins can view payments"
on payments
for select
to authenticated
using (public.is_admin());

-- Allow admin users to create temporary private signed URLs for uploaded documents
create policy "Admins can read uploaded request files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'service-request-files'
  and public.is_admin()
);

-- Enable realtime for service request alerts. If this errors because the table is already added, that is okay.
alter publication supabase_realtime add table service_requests;
```

## Step 3 — Sign in

Open:

`admin-login.html`

Sign in with the Supabase Auth user you created.

If you see a permission error, it usually means:

- the Auth user email does not exactly match the `admin_users.email` value, or
- the admin SQL policies were not run yet.

## Step 4 — Realtime alerts

The dashboard uses Supabase Realtime to listen for new `service_requests`. When a new request comes in, it refreshes the list and plays a soft alert sound.

Browsers sometimes block sound until you interact with the page once. Click anywhere on the dashboard after signing in to allow the alert tone.

## Security note

Do not put your Supabase service role key into any website JavaScript file. The admin dashboard uses your public anon key plus Supabase Auth/RLS policies. That is the correct browser-safe approach.
