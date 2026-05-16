
-- =========================================
-- Media assets (harvested image library)
-- =========================================
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('legacy_site','instagram','upload','shopify')),
  source_url text,
  source_post_url text,
  image_url text not null,
  storage_path text,
  width integer,
  height integer,
  alt_text text,
  caption text,
  ai_score numeric,
  ai_tags text[] not null default '{}',
  ai_subject text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','archived')),
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (image_url)
);

create index if not exists media_assets_status_idx on public.media_assets(status, created_at desc);
create index if not exists media_assets_source_idx on public.media_assets(source);

drop trigger if exists trg_media_assets_updated_at on public.media_assets;
create trigger trg_media_assets_updated_at before update on public.media_assets
  for each row execute function public.update_updated_at_column();

alter table public.media_assets enable row level security;

drop policy if exists "Public reads approved media" on public.media_assets;
create policy "Public reads approved media" on public.media_assets for select
  using (status = 'approved');

drop policy if exists "CMS manages media" on public.media_assets;
create policy "CMS manages media" on public.media_assets for all
  using (public.is_cms_editor(auth.uid())) with check (public.is_cms_editor(auth.uid()));

-- =========================================
-- Experiment templates (autopilot recipes)
-- =========================================
create table if not exists public.experiment_templates (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null,
  name text not null,
  description text,
  variant_configs jsonb not null default '[]'::jsonb,
  use_media_pool boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists experiment_templates_slot_idx on public.experiment_templates(slot_key, enabled);

drop trigger if exists trg_experiment_templates_updated_at on public.experiment_templates;
create trigger trg_experiment_templates_updated_at before update on public.experiment_templates
  for each row execute function public.update_updated_at_column();

alter table public.experiment_templates enable row level security;

drop policy if exists "Public reads enabled templates" on public.experiment_templates;
create policy "Public reads enabled templates" on public.experiment_templates for select
  using (enabled = true);

drop policy if exists "CMS manages templates" on public.experiment_templates;
create policy "CMS manages templates" on public.experiment_templates for all
  using (public.is_cms_editor(auth.uid())) with check (public.is_cms_editor(auth.uid()));

-- =========================================
-- Harvest jobs (audit log)
-- =========================================
create table if not exists public.harvest_jobs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  status text not null default 'running' check (status in ('running','completed','failed')),
  items_found integer not null default 0,
  items_new integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists harvest_jobs_started_idx on public.harvest_jobs(started_at desc);

alter table public.harvest_jobs enable row level security;

drop policy if exists "CMS reads harvest jobs" on public.harvest_jobs;
create policy "CMS reads harvest jobs" on public.harvest_jobs for select
  using (public.is_cms_editor(auth.uid()));

-- =========================================
-- Autopilot state (single-row config)
-- =========================================
create table if not exists public.autopilot_state (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  cadence_hours integer not null default 72,        -- new experiment per slot every 3 days
  min_exposures_per_arm integer not null default 100,
  confidence_threshold numeric not null default 0.90,
  alert_email text not null default 'blair.lott@rescuedogwines.com',
  last_autopilot_run_at timestamptz,
  last_harvest_legacy_at timestamptz,
  last_harvest_instagram_at timestamptz,
  notes text,
  updated_at timestamptz not null default now()
);

insert into public.autopilot_state (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_autopilot_state_updated_at on public.autopilot_state;
create trigger trg_autopilot_state_updated_at before update on public.autopilot_state
  for each row execute function public.update_updated_at_column();

alter table public.autopilot_state enable row level security;

drop policy if exists "Public reads autopilot state" on public.autopilot_state;
create policy "Public reads autopilot state" on public.autopilot_state for select
  using (true);

drop policy if exists "CMS manages autopilot state" on public.autopilot_state;
create policy "CMS manages autopilot state" on public.autopilot_state for all
  using (public.is_cms_editor(auth.uid())) with check (public.is_cms_editor(auth.uid()));

-- =========================================
-- Storage bucket for harvested media
-- =========================================
insert into storage.buckets (id, name, public)
values ('harvested-media', 'harvested-media', true)
on conflict (id) do nothing;

drop policy if exists "Public reads harvested media" on storage.objects;
create policy "Public reads harvested media" on storage.objects for select
  using (bucket_id = 'harvested-media');

drop policy if exists "CMS writes harvested media" on storage.objects;
create policy "CMS writes harvested media" on storage.objects for insert
  with check (bucket_id = 'harvested-media' and public.is_cms_editor(auth.uid()));

-- =========================================
-- Seed default experiment templates
-- =========================================
insert into public.experiment_templates (slot_key, name, description, variant_configs, use_media_pool, enabled) values
(
  'homepage_hero',
  'Hero — mission vs product framing',
  'Tests mission-led headline vs product-led headline. Uses approved media for image.',
  '[
    {"key":"mission","name":"Mission framing","config":{"headlineOverride":"Wine that helps dogs find their forever home.","subtitleOverride":"Every bottle funds rescue.","ctaLabel":"Shop the mission","ctaHref":"/wines"}},
    {"key":"product","name":"Product framing","config":{"headlineOverride":"Small-batch wine. Big-hearted mission.","subtitleOverride":"Award-winning California wines.","ctaLabel":"Shop wines","ctaHref":"/wines"}},
    {"key":"club","name":"Club framing","config":{"headlineOverride":"Join The Pack.","subtitleOverride":"Members-only wines, shipping included.","ctaLabel":"Join the club","ctaHref":"/wine-club"}}
  ]'::jsonb,
  true,
  true
),
(
  'cart_promo_banner',
  'Cart promo framing',
  'Tests shipping vs case-discount vs club framing in cart.',
  '[
    {"key":"shipping","name":"Shipping included","config":{"headline":"Shipping included on 12+ bottles","accent":"primary"}},
    {"key":"club","name":"Club upsell","config":{"headline":"Join The Pack and save on every order","accent":"primary"}},
    {"key":"mission","name":"Mission reminder","config":{"headline":"50% of profits go to rescue. Thank you.","accent":"primary"}}
  ]'::jsonb,
  false,
  true
),
(
  'club_featured_tier',
  'Featured club tier',
  'Tests which tier carries the Most Popular badge.',
  '[
    {"key":"tier_3","name":"3-bottle featured","config":{"tierKey":"3"}},
    {"key":"tier_6","name":"6-bottle featured","config":{"tierKey":"6"}},
    {"key":"tier_12","name":"12-bottle featured","config":{"tierKey":"12"}}
  ]'::jsonb,
  false,
  true
),
(
  'ambassador_placement',
  'Ambassador CTA placement',
  'Tests footer-only vs footer+sticky vs footer+post-purchase placement.',
  '[
    {"key":"footer_only","name":"Footer only","config":{"footer":true,"sticky":false,"postPurchase":false}},
    {"key":"footer_sticky","name":"Footer + sticky","config":{"footer":true,"sticky":true,"postPurchase":false}},
    {"key":"footer_postpurchase","name":"Footer + post-purchase","config":{"footer":true,"sticky":false,"postPurchase":true}}
  ]'::jsonb,
  false,
  true
),
(
  'pdp_layout',
  'PDP layout',
  'Tests image-first vs story-first vs reviews-first product layout.',
  '[
    {"key":"image_first","name":"Image first","config":{"variant":"image_first"}},
    {"key":"story_first","name":"Story first","config":{"variant":"story_first"}},
    {"key":"reviews_first","name":"Reviews first","config":{"variant":"reviews_first"}}
  ]'::jsonb,
  false,
  true
)
on conflict do nothing;
