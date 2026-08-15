-- Activate the owner-configured neutral review invitation.
-- Delivery remains administrator-initiated and the send-message function
-- enforces eligibility and exactly-once persistence.

update public.message_templates
set
  active = true,
  description = 'Neutral post-completion review invitation',
  subject_template = 'Share your experience with Aligned Print & Scan',
  html_template = '<p>Hello {{customer_first_name}},</p><p>Thank you for choosing Aligned Print & Scan. If you would like to share your experience, your honest feedback helps others learn about our services.</p><p>Participation is optional, is not conditioned on satisfaction or sentiment, and does not affect your service.</p>',
  text_template = 'Thank you for choosing Aligned Print & Scan. If you would like to share your experience, your honest feedback helps others learn about our services. Participation is optional, is not conditioned on satisfaction or sentiment, and does not affect your service.'
where template_key = 'review_request';

do $$
begin
  if not exists (
    select 1 from public.message_templates
    where template_key = 'review_request' and active = true
  ) then
    raise exception 'review_request template was not found or could not be activated';
  end if;
end $$;
