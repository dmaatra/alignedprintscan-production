update public.message_templates
set
  name='Additional Participant Information Needed',
  description='Manual request for customer confirmation when document or request review indicates an additional or unclear participant may need to be identified.',
  subject_template='Additional participant information needed: {{request_reference}}',
  html_template='<p>Hello {{customer_first_name}},</p><p>During our review, the document or request appears to need clarification about an additional signer or participant who was not included with the original request.</p><p>{{message_body}}</p><p>Please confirm the additional person''s full legal name and requested contact information so APS can continue preparing your service. APS is not determining who is legally required to sign and cannot provide legal advice.</p>',
  text_template='Additional participant information is needed for {{request_reference}}. Please confirm the additional person''s full legal name and requested contact information. APS is not determining who is legally required to sign.',
  associated_status=null,
  required_attachment_type=null,
  active=true,
  system_template=true,
  updated_at=now()
where template_key='participant_information_needed';
