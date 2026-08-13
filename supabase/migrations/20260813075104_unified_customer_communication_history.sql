-- Preserve the final customer communication submitted to the provider while
-- making origin, retry identity, and failure state explicit to APS operators.
alter table public.messages
  add column if not exists channel text not null default 'email',
  add column if not exists source_type text not null default 'admin',
  add column if not exists source_event text,
  add column if not exists template_key text,
  add column if not exists idempotency_key text,
  add column if not exists attempted_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists messages_idempotency_key_unique
  on public.messages(idempotency_key)
  where idempotency_key is not null and btrim(idempotency_key) <> '';

create index if not exists messages_request_created_at_idx
  on public.messages(service_request_id, created_at desc);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'messages_source_type_check') then
    alter table public.messages add constraint messages_source_type_check
      check (source_type in ('automatic','workflow','customer_action','admin'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'messages_channel_check') then
    alter table public.messages add constraint messages_channel_check
      check (channel in ('email','sms'));
  end if;
end $$;

update public.messages
set source_type = case when created_by is null then 'automatic' else 'admin' end,
    attempted_at = coalesce(attempted_at, created_at)
where attempted_at is null;

-- Keep the centralized body library complete even though delivery-time renderers
-- add request-specific panels, item tables, conditional sections, and CTAs.
update public.message_templates set html_template='<p>Hello {{customer_first_name}},</p><p>Thank you for choosing Aligned Print & Scan. Your request has been securely received and is now under review.</p><p>We will review the service details, documents, availability, and preparation requirements before sending your next step.</p>', text_template='Hello {{customer_first_name}}, Thank you for choosing Aligned Print & Scan. Your request {{request_reference}} has been securely received and is now under review.' where template_key='request_received';
update public.message_templates set html_template='<p>Hello {{customer_first_name}},</p><p>Your {{service_name}} request has been reviewed. Please review the request summary and itemized quote, then approve it or request changes from your secure request page.</p>', text_template='Your quote for {{request_reference}} is ready for review.' where template_key='quote_ready';
update public.message_templates set html_template='<p>Hello {{customer_first_name}},</p><p>Payment is required before the applicable appointment, session, or work begins. Review the current invoice and legitimate balance in your secure request.</p>', text_template='Payment is due for {{request_reference}}. Balance: {{balance_due}}.' where template_key='awaiting_payment_reminder';
update public.message_templates set html_template='<p>Hello {{customer_first_name}},</p><p>Thank you. Your payment for {{request_reference}} has been received and recorded. Any legitimate remaining balance appears in your secure request.</p>', text_template='Payment was received for {{request_reference}}.' where template_key='payment_received';
update public.message_templates set html_template='<p>Hello {{customer_first_name}},</p><p>Your {{service_name}} appointment has been confirmed. Please review the current details and preparation instructions before your appointment.</p>', text_template='Your appointment for {{request_reference}} is confirmed.' where template_key='appointment_confirmed';
update public.message_templates set html_template='<p>Hello {{customer_first_name}},</p><p>This is a reminder to review your current appointment and preparation details before your service.</p>', text_template='Appointment reminder for {{request_reference}}.' where template_key='appointment_reminder';
update public.message_templates set html_template='<p>Hello {{customer_first_name}},</p><p>Your appointment has been updated. Review the current confirmed date, time, and preparation information in your secure request.</p>', text_template='Your appointment for {{request_reference}} was updated.' where template_key='appointment_rescheduled';
update public.message_templates set html_template='<p>Hello {{customer_first_name}},</p><p>Your secure online notary session is ready. Review the current session and identity/document preparation information before joining.</p>', text_template='Your RON session for {{request_reference}} is ready.' where template_key='ron_session_ready';
update public.message_templates set html_template='<p>Hello {{customer_first_name}},</p><p>Your mobile appointment is confirmed. Review the current location and preparation instructions before your service.</p>', text_template='Your mobile appointment for {{request_reference}} is confirmed.' where template_key='mobile_appointment_confirmation';
update public.message_templates set html_template='<p>Hello {{customer_first_name}},</p><p>Your released customer-facing scan files are available in your secure request.</p>', text_template='Your completed scans for {{request_reference}} are ready.' where template_key='completed_scan_delivery';
update public.message_templates set html_template='<p>Hello {{customer_first_name}},</p><p>Your released customer-facing documents are available in your secure request.</p>', text_template='Your documents for {{request_reference}} are ready.' where template_key='document_delivery';
update public.message_templates set html_template='<p>Hello {{customer_first_name}},</p><p>An invoice or additional balance is ready for review. This does not imply that a prior payment was missing.</p>', text_template='An invoice is ready for {{request_reference}}.' where template_key='final_invoice';
update public.message_templates set html_template='<p>Hello {{customer_first_name}},</p><p>Your {{service_name}} request {{request_reference}} has been completed. Your secure request shows the final service and any released-document details.</p>', text_template='Your request {{request_reference}} is complete.' where template_key='order_completed';
update public.message_templates set html_template='<p>Hello {{customer_first_name}},</p><p>Your request has been cancelled. Review your secure request or contact support if you have questions.</p>', text_template='Your request {{request_reference}} was cancelled.' where template_key='cancellation';
update public.message_templates set html_template='<p>Hello {{customer_first_name}},</p><p>{{message_body}}</p>', text_template='{{message_body}}' where template_key='general_customer_message';
