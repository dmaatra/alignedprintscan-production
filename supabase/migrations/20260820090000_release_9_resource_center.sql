begin;

create table public.resource_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text not null default '',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.resource_assets (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  public_url text not null,
  alt_text text not null check (length(trim(alt_text)) between 5 and 240),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  mime_type text not null default 'image/webp',
  source_type text not null default 'original' check (source_type in ('original','generated','licensed')),
  source_note text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.resource_articles (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.resource_categories(id) on delete set null,
  featured_asset_id uuid references public.resource_assets(id) on delete set null,
  title text not null check (length(trim(title)) between 5 and 140),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  dek text not null check (length(trim(dek)) between 20 and 320),
  body_blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(body_blocks)='array'),
  faq_items jsonb not null default '[]'::jsonb check (jsonb_typeof(faq_items)='array'),
  source_links jsonb not null default '[]'::jsonb check (jsonb_typeof(source_links)='array'),
  seo_title text not null,
  seo_description text not null,
  status text not null default 'draft' check (status in ('draft','published','unpublished','archived')),
  is_featured boolean not null default false,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index resource_articles_public_idx on public.resource_articles(status,published_at desc) where status='published';
create index resource_articles_category_idx on public.resource_articles(category_id,status);

create table public.resource_article_relations (
  article_id uuid not null references public.resource_articles(id) on delete cascade,
  related_article_id uuid not null references public.resource_articles(id) on delete cascade,
  sort_order integer not null default 0,
  primary key(article_id,related_article_id),
  check(article_id<>related_article_id)
);

create table public.resource_slug_redirects (
  id uuid primary key default gen_random_uuid(),
  old_slug text not null unique check (old_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  article_id uuid not null references public.resource_articles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.resource_helpfulness (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.resource_articles(id) on delete cascade,
  helpful boolean not null,
  reason text check (reason is null or reason in ('missing_detail','unclear','not_relevant','outdated','other')),
  comment text check (comment is null or length(comment)<=1000),
  privacy_key text not null,
  submitted_at timestamptz not null default now(),
  unique(article_id,privacy_key)
);
create index resource_helpfulness_rate_idx on public.resource_helpfulness(privacy_key,submitted_at desc);

create table public.resource_feedback (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.resource_articles(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 100),
  email text not null check (length(trim(email)) between 5 and 254),
  message text not null check (length(trim(message)) between 10 and 3000),
  privacy_key text not null,
  status text not null default 'new' check (status in ('new','read','replied','resolved','archived','spam')),
  admin_note text,
  replied_at timestamptz,
  replied_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index resource_feedback_queue_idx on public.resource_feedback(status,created_at desc);
create index resource_feedback_rate_idx on public.resource_feedback(privacy_key,created_at desc);

create table public.resource_feedback_replies (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.resource_feedback(id) on delete cascade,
  recipient text not null,
  subject text not null,
  rendered_html text not null,
  rendered_text text not null,
  delivery_state text not null check (delivery_state in ('sent','failed')),
  provider_message_id text,
  error_message text,
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index resource_feedback_replies_feedback_idx on public.resource_feedback_replies(feedback_id,created_at desc);

create table public.resource_article_views (
  id bigint generated always as identity primary key,
  article_id uuid not null references public.resource_articles(id) on delete cascade,
  privacy_key text not null,
  viewed_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique(article_id,privacy_key,viewed_on)
);

alter table public.admin_notifications add column target_url text;
alter table public.admin_notifications drop constraint if exists admin_notifications_target_tab_check;
alter table public.admin_notifications add constraint admin_notifications_target_tab_check check (target_tab in ('overview','customer','documents','quote','payments','messages','fulfillment','timeline','resources'));

do $$ begin
  update public.aps_staff_profiles set permissions = permissions || '{"manage_resource_articles":true,"publish_resource_articles":true,"manage_resource_feedback":true}'::jsonb
  where role in ('owner','administrator');
  update public.aps_staff_profiles set permissions = permissions || '{"manage_resource_articles":true,"manage_resource_feedback":true}'::jsonb
  where role='operations';
end $$;

alter table public.resource_categories enable row level security;
alter table public.resource_assets enable row level security;
alter table public.resource_articles enable row level security;
alter table public.resource_article_relations enable row level security;
alter table public.resource_slug_redirects enable row level security;
alter table public.resource_helpfulness enable row level security;
alter table public.resource_feedback enable row level security;
alter table public.resource_feedback_replies enable row level security;
alter table public.resource_article_views enable row level security;

revoke all on public.resource_categories,public.resource_assets,public.resource_articles,public.resource_article_relations,public.resource_slug_redirects,public.resource_helpfulness,public.resource_feedback,public.resource_feedback_replies,public.resource_article_views from anon,authenticated;
grant all on public.resource_categories,public.resource_assets,public.resource_articles,public.resource_article_relations,public.resource_slug_redirects,public.resource_helpfulness,public.resource_feedback,public.resource_feedback_replies,public.resource_article_views to service_role;
grant usage,select on sequence public.resource_article_views_id_seq to service_role;

create policy resource_categories_staff_read on public.resource_categories for select to authenticated using ((select public.is_active_aps_staff(null)));
create policy resource_assets_staff_read on public.resource_assets for select to authenticated using ((select public.is_active_aps_staff(null)));
create policy resource_articles_staff_read on public.resource_articles for select to authenticated using ((select public.is_active_aps_staff(null)));
create policy resource_relations_staff_read on public.resource_article_relations for select to authenticated using ((select public.is_active_aps_staff(null)));
create policy resource_redirects_staff_read on public.resource_slug_redirects for select to authenticated using ((select public.is_active_aps_staff(null)));
create policy resource_feedback_staff_read on public.resource_feedback for select to authenticated using ((select public.is_active_aps_staff('manage_resource_feedback')));
create policy resource_feedback_replies_staff_read on public.resource_feedback_replies for select to authenticated using ((select public.is_active_aps_staff('manage_resource_feedback')));
create policy resource_helpfulness_staff_read on public.resource_helpfulness for select to authenticated using ((select public.is_active_aps_staff('manage_resource_feedback')));
create policy resource_views_staff_read on public.resource_article_views for select to authenticated using ((select public.is_active_aps_staff('manage_resource_feedback')));
grant select on public.resource_categories,public.resource_assets,public.resource_articles,public.resource_article_relations,public.resource_slug_redirects to authenticated;
grant select on public.resource_feedback,public.resource_feedback_replies,public.resource_helpfulness,public.resource_article_views to authenticated;

insert into public.resource_categories(name,slug,description,sort_order) values
('Online Notary','online-notary','Remote online notarization, identity checks, and appointment preparation.',10),
('Mobile Notary','mobile-notary','Preparing for an in-person mobile notary visit.',20),
('Notary Basics','notary-basics','Plain-language explanations of common notarial acts and preparation.',30),
('Loan Signing','loan-signing','Neutral appointment preparation for signing-agent assignments.',40),
('Business Accounts','business-accounts','APS account access, billing terms, and service coordination.',50);

insert into public.message_templates(template_key,name,description,subject_template,html_template,text_template,associated_status,active)
values('resource_center_response','Resource Center Response','Private reply to an article question using the canonical APS customer email shell.','APS Resource Center: {{article_title}}','<p>{{message_body}}</p><p><a href="{{article_url}}">View the article</a></p>','{{message_body}} View the article: {{article_url}}',null,true)
on conflict(template_key) do update set name=excluded.name,description=excluded.description,subject_template=excluded.subject_template,html_template=excluded.html_template,text_template=excluded.text_template,active=true,updated_at=now();

commit;
