-- Release 5 follow-up: allow a worker to claim reminders before provider delivery.
alter table public.business_invoice_reminders
  drop constraint if exists business_invoice_reminders_status_check;
alter table public.business_invoice_reminders
  add constraint business_invoice_reminders_status_check
  check (status in ('pending','processing','sent','failed','cancelled'));
