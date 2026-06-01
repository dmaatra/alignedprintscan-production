-- Admin status/email flow + appointment detail fields.
alter table if exists service_requests add column if not exists appointment_date date;
alter table if exists service_requests add column if not exists appointment_time text;
alter table if exists service_requests add column if not exists appointment_timezone text default 'America/Chicago';
alter table if exists service_requests add column if not exists appointment_location text;
alter table if exists service_requests add column if not exists appointment_link text;
alter table if exists service_requests add column if not exists appointment_platform text;
alter table if exists service_requests add column if not exists appointment_instructions text;
alter table if exists service_requests add column if not exists balance_due_at_appointment numeric default 0;
alter table if exists service_requests add column if not exists appointment_line_items_note text;

-- Keep status history readable by the public status page, but writes should be through dashboard/service role.
drop policy if exists "public read status updates" on request_status_updates;
create policy "public read status updates" on request_status_updates for select using (true);
