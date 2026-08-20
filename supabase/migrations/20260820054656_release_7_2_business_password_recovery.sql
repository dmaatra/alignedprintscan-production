-- Release 7.2: branded Business Portal recovery delivery and safe audit metadata.
create table public.business_password_recovery_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  organization_member_id uuid not null references public.organization_members(id) on delete restrict,
  recipient_email text not null,
  request_fingerprint text not null unique,
  delivery_state text not null check (delivery_state in ('processing','sent','failed')),
  provider_id text,
  requested_at timestamptz not null default now(),
  delivered_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now()
);
create index business_password_recovery_member_idx on public.business_password_recovery_events(organization_member_id,requested_at desc);
alter table public.business_password_recovery_events enable row level security;
revoke all on public.business_password_recovery_events from public,anon,authenticated;
grant select,insert,update,delete on public.business_password_recovery_events to service_role;

insert into public.message_templates(template_key,name,description,subject_template,html_template,text_template,associated_status,active)
values (
  'business_password_reset',
  'Business Account Password Reset',
  'Provides a secure password-reset link to an eligible Business Portal user.',
  'Reset your Aligned Print & Scan Business Portal password',
  '<p>You requested a password reset for your Aligned Print & Scan Business Portal account.</p><p>Use the secure link below to choose a new password. For your security, this link expires after a limited time and can only be used as permitted by the authentication system.</p><p>If you did not request a password reset, you can ignore this email. Your current password will remain unchanged.</p><p><strong>For your security, Aligned Print & Scan will never ask you to send your password by email.</strong></p>',
  'You requested a password reset for your Aligned Print & Scan Business Portal account. Use the secure link to choose a new password. If you did not request this, ignore this email.',
  null,
  true
)
on conflict(template_key) do update set name=excluded.name,description=excluded.description,subject_template=excluded.subject_template,html_template=excluded.html_template,text_template=excluded.text_template,active=true,updated_at=now();

comment on table public.business_password_recovery_events is 'Safe Business Portal recovery delivery audit. Never stores a token, password, or recovery URL.';
