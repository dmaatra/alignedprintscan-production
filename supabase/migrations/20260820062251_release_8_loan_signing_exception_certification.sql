-- Release 8 certification: close idempotency, audit, template, and financial-projection gaps.
-- Additive and forward-only. The original assignment price/payment history remains immutable.

alter table public.loan_signing_exceptions
  add column idempotency_key text,
  add column requested_by_user_id uuid references auth.users(id) on delete set null,
  add column communication_state text not null default 'not_required'
    check (communication_state in ('not_required','needed','sent')),
  add column closed_at timestamptz;

alter table public.loan_signing_assignments
  add column terms_policy_version text,
  add column terms_acknowledged_at timestamptz,
  add column terms_acknowledged_by_user_id uuid references auth.users(id) on delete set null,
  add column exception_attention_state text,
  add column exception_financial_state text,
  add column authorized_refund_due numeric(12,2) not null default 0 check (authorized_refund_due >= 0),
  add column authorized_additional_amount_due numeric(12,2) not null default 0 check (authorized_additional_amount_due >= 0);

alter table public.loan_signing_additional_charges
  add column idempotency_key text,
  add column policy_source text not null default 'default_aps_policy'
    check (policy_source in ('default_aps_policy','organization_contract','assignment_specific_agreement','manual_authorized_exception'));

alter table public.loan_signing_financial_resolutions
  add column idempotency_key text,
  add column policy_source text not null default 'default_aps_policy'
    check (policy_source in ('default_aps_policy','organization_contract','assignment_specific_agreement','manual_authorized_exception')),
  add column policy_snapshot jsonb not null default '{}'::jsonb,
  add column authorized_additional_charges numeric(12,2) not null default 0 check (authorized_additional_charges >= 0),
  add column final_service_value numeric(12,2) not null default 0 check (final_service_value >= 0),
  add column resolution_state text not null default 'authorized'
    check (resolution_state in ('authorized','invoice_pending','refund_pending','communication_pending','resolved'));

alter table public.refund_reviews
  add column loan_signing_resolution_id uuid references public.loan_signing_financial_resolutions(id) on delete restrict;

create unique index loan_signing_exceptions_idempotency_unique
  on public.loan_signing_exceptions(idempotency_key)
  where idempotency_key is not null and btrim(idempotency_key) <> '';
create unique index loan_signing_charges_idempotency_unique
  on public.loan_signing_additional_charges(idempotency_key)
  where idempotency_key is not null and btrim(idempotency_key) <> '';
create unique index loan_signing_resolutions_idempotency_unique
  on public.loan_signing_financial_resolutions(idempotency_key)
  where idempotency_key is not null and btrim(idempotency_key) <> '';
create unique index refund_reviews_loan_signing_resolution_unique
  on public.refund_reviews(loan_signing_resolution_id)
  where loan_signing_resolution_id is not null;

update public.aps_staff_profiles
set permissions=permissions||'{"approve_lsa_financials":true}'::jsonb,
    updated_at=now()
where role in ('owner','administrator');

create unique index loan_signing_open_exception_kind_unique
  on public.loan_signing_exceptions(loan_signing_assignment_id,outcome)
  where status in ('requested','review_required','financial_review','communication_needed');

insert into public.message_templates
  (template_key,name,description,subject_template,html_template,text_template,associated_status,active)
values
  ('lsa_package_documents_needed','Loan Signing Package or Documents Needed','Manual Loan Signing message requesting authoritative package, return, signer, or instruction information without interpreting package content.','Loan Signing documents needed: {{request_reference}}','<p>Additional documents or assignment instructions are needed before this Loan Signing can proceed.</p><p>{{message_body}}</p>','Additional documents or instructions are needed for {{request_reference}}. {{message_body}}',null,true),
  ('lsa_replacement_package_received','Loan Signing Replacement Package Received','Manual operational confirmation that replacement documents were received and are under review; no pricing change is implied.','Replacement package received: {{request_reference}}','<p>We received replacement documents for this Loan Signing. APS is reviewing the new package and any affected appointment, printing, scanback, return, or pricing requirements.</p>','Replacement documents were received for {{request_reference}} and are under review.',null,true),
  ('lsa_signing_follow_up','Loan Signing Requires Follow-Up','Manual neutral notice for a partial or incomplete signing.','Signing follow-up needed: {{request_reference}}','<p>The signing was not fully completed and is under review for the appropriate next steps.</p><p>{{message_body}}</p>','The signing for {{request_reference}} requires follow-up. {{message_body}}',null,true),
  ('lsa_cancellation_requested','Loan Signing Cancellation Requested','Manual or governed acknowledgment of a Loan Signing cancellation request; never promises a fee or refund.','Cancellation request received: {{request_reference}}','<p>We received your request to cancel this Loan Signing assignment. We’ll review the current assignment stage and any work already completed before confirming the final cancellation details.</p>','We received the cancellation request for {{request_reference}} and will review it before confirming final details.',null,true),
  ('lsa_cancellation_resolution','Loan Signing Cancellation Resolution','Manual customer-safe cancellation resolution after an authorized financial decision.','Cancellation review resolved: {{request_reference}}','<p>The cancellation review is complete.</p><p>{{message_body}}</p>','The cancellation review for {{request_reference}} is complete. {{message_body}}',null,true),
  ('lsa_additional_charge_review','Loan Signing Additional Charge Authorization Needed','Manual request for orderer authorization only when applicable terms require approval before an additional charge.','Additional Loan Signing work review: {{request_reference}}','<p>Additional work has been identified for this Loan Signing. Please review the customer-safe reason and proposed amount before authorizing the next step.</p><p>{{message_body}}</p>','Additional work for {{request_reference}} requires review. {{message_body}}',null,true),
  ('lsa_additional_charge_issued','Loan Signing Additional Charge Issued','Manual notice after an additional amount is authorized and linked to the existing supplemental invoice workflow.','Additional Loan Signing amount: {{request_reference}}','<p>An additional amount has been authorized for this Loan Signing.</p><p>{{message_body}}</p>','An authorized additional amount is available for {{request_reference}}. {{message_body}}',null,true),
  ('lsa_scanback_return_follow_up','Loan Signing Scanback or Return Follow-Up','Manual operational request based on authoritative scanback or return facts.','Loan Signing return follow-up: {{request_reference}}','<p>Follow-up is needed for the scanback or authorized return requirements on this Loan Signing.</p><p>{{message_body}}</p>','Scanback or return follow-up is needed for {{request_reference}}. {{message_body}}',null,true),
  ('lsa_completed','Loan Signing Completed','Manual completion notice used only after the authoritative Release 7 completion gate passes.','Loan Signing completed: {{request_reference}}','<p>Your Loan Signing assignment is complete. Customer-visible return, tracking, document, and financial information is available in your secure portal where applicable.</p>','Loan Signing {{request_reference}} is complete.',null,true)
on conflict(template_key) do update set
  name=excluded.name,description=excluded.description,subject_template=excluded.subject_template,
  html_template=excluded.html_template,text_template=excluded.text_template,
  associated_status=excluded.associated_status,active=true,updated_at=now();

comment on column public.loan_signing_financial_resolutions.final_service_value is
  'Original agreed fee adjusted only by an authorized exception decision plus separately authorized charges; never rewrites the pricing snapshot.';
comment on column public.loan_signing_exceptions.idempotency_key is
  'Caller-scoped retry identity; prevents duplicate open exception mutations and Review Queue items.';
