-- Durable, administrator-only operational notifications with private Realtime Broadcast.
alter table public.proof_transactions
  add column document_preparation_confirmed_at timestamptz,
  add column document_preparation_confirmed_by uuid;

create or replace function public.confirm_proof_document_preparation(p_transaction_id uuid)
returns public.proof_transactions
language plpgsql security definer set search_path='' as $$
declare tx public.proof_transactions;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into tx from public.proof_transactions where id=p_transaction_id and is_active=true for update;
  if tx.id is null or tx.workflow_category<>'aps_originated' then raise exception 'Active APS Proof transaction not found'; end if;
  if tx.activation_state='activated' then raise exception 'Document preparation must be confirmed before activation'; end if;
  if tx.document_preparation_confirmed_at is not null then return tx; end if;
  update public.proof_transactions set document_preparation_confirmed_at=coalesce(document_preparation_confirmed_at,now()),document_preparation_confirmed_by=coalesce(document_preparation_confirmed_by,auth.uid()),updated_at=now() where id=tx.id returning * into tx;
  insert into public.request_timeline_events(service_request_id,event_type,title,detail,actor_type,metadata,visibility)
  values(tx.service_request_id,'proof_document_preparation_admin_confirmed','Proof document preparation confirmed','An administrator confirmed that Proof-native document preparation was completed.','admin',jsonb_build_object('admin_user_id',auth.uid()),'internal');
  return tx;
end $$;
revoke all on function public.confirm_proof_document_preparation(uuid) from public,anon;
grant execute on function public.confirm_proof_document_preparation(uuid) to authenticated;

create table public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid references public.service_requests(id) on delete cascade,
  event_type text not null,
  severity text not null default 'info' check (severity in ('info','action_required','urgent')),
  title text not null,
  body text not null,
  target_tab text not null default 'overview' check (target_tab in ('overview','customer','documents','quote','payments','messages','fulfillment','timeline')),
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);
create index admin_notifications_created_idx on public.admin_notifications(created_at desc);
create index admin_notifications_request_idx on public.admin_notifications(service_request_id,created_at desc);

create table public.admin_notification_reads (
  notification_id uuid not null references public.admin_notifications(id) on delete cascade,
  admin_user_id uuid not null,
  read_at timestamptz not null default now(),
  primary key(notification_id,admin_user_id)
);
create index admin_notification_reads_admin_idx on public.admin_notification_reads(admin_user_id,read_at desc);

alter table public.admin_notifications enable row level security;
alter table public.admin_notification_reads enable row level security;
revoke all on public.admin_notifications,public.admin_notification_reads from anon;
grant select on public.admin_notifications to authenticated;
grant select,insert,update on public.admin_notification_reads to authenticated;
create policy admin_notifications_read on public.admin_notifications for select to authenticated using ((select public.is_admin()));
create policy admin_notification_reads_read on public.admin_notification_reads for select to authenticated using ((select public.is_admin()) and admin_user_id=(select auth.uid()));
create policy admin_notification_reads_insert on public.admin_notification_reads for insert to authenticated with check ((select public.is_admin()) and admin_user_id=(select auth.uid()));
create policy admin_notification_reads_update on public.admin_notification_reads for update to authenticated using ((select public.is_admin()) and admin_user_id=(select auth.uid())) with check ((select public.is_admin()) and admin_user_id=(select auth.uid()));

create or replace function public.broadcast_admin_notification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform realtime.send(jsonb_build_object('id',new.id,'request_id',new.service_request_id,'event_type',new.event_type,'severity',new.severity,'target_tab',new.target_tab),'notification','admin-notifications',true);
  return new;
end $$;
revoke all on function public.broadcast_admin_notification() from public,anon,authenticated;
create trigger admin_notification_broadcast after insert on public.admin_notifications for each row execute function public.broadcast_admin_notification();

create or replace function public.notify_new_service_request()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.admin_notifications(service_request_id,event_type,severity,title,body,target_tab,dedupe_key)
  values(new.id,'new_request','action_required','New service request','A new '||case new.service_type when 'ron' then 'Remote Online Notary' when 'mobile' then 'Mobile Notary' when 'print' then 'Print & Scan' else 'service' end||' request is ready for review.','overview','request:'||new.id);
  return new;
end $$;
revoke all on function public.notify_new_service_request() from public,anon,authenticated;
create trigger service_request_admin_notification after insert on public.service_requests for each row execute function public.notify_new_service_request();

create or replace function public.notify_admin_timeline_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare n record;
begin
  select * into n from (values
    ('documents_uploaded','action_required','Customer document received','A customer document is ready for review.','documents'),
    ('document_uploaded','action_required','Customer document received','A customer document is ready for review.','documents'),
    ('quote_approved','action_required','Quote approved','The customer approved the quote.','quote'),
    ('changes_requested','action_required','Quote changes requested','The customer requested changes to the quote.','quote'),
    ('payment_received','info','Payment received','A request payment was received.','payments'),
    ('final_payment_received','info','Final payment received','A supplemental or final payment was received.','payments'),
    ('appointment_reschedule_requested','action_required','Appointment change requested','The customer requested an appointment change.','fulfillment'),
    ('rescheduling_requested','action_required','Appointment change requested','The customer requested an appointment change.','fulfillment'),
    ('proof_transaction_completed','action_required','Proof session completed','Review the completed Proof session and document return state.','fulfillment'),
    ('proof_completed_with_rejections','urgent','Proof completed with rejections','The Proof session requires administrator review.','fulfillment'),
    ('proof_completed_document_available','action_required','Completed notarized document available','Retrieve and review the completed notarized document.','documents'),
    ('proof_completed_asset_retrieval_failed','urgent','Completed document retrieval failed','The completed notarized document requires recovery.','documents')
  ) as mapped(event_type,severity,title,body,target_tab)
  where mapped.event_type=new.event_type
    and (mapped.event_type not in ('document_uploaded','documents_uploaded') or new.actor_type='customer');
  if found then
    insert into public.admin_notifications(service_request_id,event_type,severity,title,body,target_tab,dedupe_key)
    values(new.service_request_id,new.event_type,n.severity,n.title,n.body,n.target_tab,'timeline:'||new.id)
    on conflict(dedupe_key) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.notify_admin_timeline_event() from public,anon,authenticated;
create trigger timeline_admin_notification after insert on public.request_timeline_events for each row execute function public.notify_admin_timeline_event();

create or replace function public.notify_admin_review_item()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.state='open' then
    insert into public.admin_notifications(service_request_id,event_type,severity,title,body,target_tab,dedupe_key)
    values(new.service_request_id,'review_required','urgent','Review required',coalesce(nullif(new.title,''),'A request requires administrator review.'),case when new.target_tab in ('overview','customer','documents','quote','payments','messages','fulfillment','timeline') then new.target_tab else 'overview' end,'review:'||new.id)
    on conflict(dedupe_key) do nothing;
  end if;
  return new;
end $$;
revoke all on function public.notify_admin_review_item() from public,anon,authenticated;
create trigger review_item_admin_notification after insert on public.review_queue_items for each row execute function public.notify_admin_review_item();

drop policy if exists admin_notifications_private_receive on realtime.messages;
create policy admin_notifications_private_receive on realtime.messages for select to authenticated using (
  (select realtime.topic())='admin-notifications' and extension='broadcast' and (select public.is_admin())
);

comment on table public.admin_notifications is 'Durable administrator-only operational alerts; never customer Messages.';
