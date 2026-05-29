-- Support form expansion and client quote action support.

alter table support_tickets
add column if not exists phone text,
add column if not exists preferred_contact_method text default 'email',
add column if not exists related_to_request boolean default false,
add column if not exists issue_type text,
add column if not exists urgency text default 'standard',
add column if not exists internal_notes text,
add column if not exists resolution_notes text,
add column if not exists linked_service_request_id uuid references service_requests(id) on delete set null;

-- Allow the public quote action function/dashboard to use these statuses without requiring a separate enum.
-- Existing status fields are text, so no enum migration is required.
