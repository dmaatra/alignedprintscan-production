-- Manual, neutral request for missing signer or witness information.
insert into public.message_templates
  (template_key,name,description,subject_template,html_template,text_template,associated_status,required_attachment_type,active,system_template)
values
  ('participant_information_needed','Participant Information Needed','Manual request for missing signer or witness information. Sending does not change request status.','Participant information needed: {{request_reference}}','<p>Hello {{customer_first_name}},</p><p>We need additional signer or witness information to continue preparing your {{service_name}} request.</p><p>{{message_body}}</p><p>Please reply with the requested details or contact APS if you need assistance. Do not send identity documents or sensitive identity-verification information by email.</p>','We need additional signer or witness information for {{request_reference}}. {{message_body}}',null,null,true,true)
on conflict (template_key) do update set
  name=excluded.name,
  description=excluded.description,
  subject_template=excluded.subject_template,
  html_template=excluded.html_template,
  text_template=excluded.text_template,
  associated_status=null,
  required_attachment_type=null,
  active=true,
  system_template=true,
  updated_at=now();
