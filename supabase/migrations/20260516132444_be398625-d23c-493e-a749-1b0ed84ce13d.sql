
-- Experiment status enum
do $$ begin
  create type public.experiment_status as enum ('draft','running','paused','ended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.experiment_metric as enum ('revenue_per_visitor','conversion_rate','club_signup','ambassador_apply','custom');
exception when duplicate_object then null; end $$;

-- experiments
create table if not exists public.experiments (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  slot_key text not null,
  status public.experiment_status not null default 'draft',
  primary_metric public.experiment_metric not null default 'revenue_per_visitor',
  traffic_pct integer not null default 100 check (traffic_pct between 0 and 100),
  segment jsonb not null default '{}'::jsonb,
  use_bandit boolean not null default true,
  winner_variant_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists experiments_slot_status_idx on public.experiments(slot_key, status);

-- experiment_variants
create table if not exists public.experiment_variants (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  key text not null,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  weight numeric not null default 1.0,
  is_control boolean not null default false,
  -- bandit / stats counters (updated by record fn)
  exposures bigint not null default 0,
  conversions bigint not null default 0,
  revenue_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (experiment_id, key)
);

create index if not exists experiment_variants_exp_idx on public.experiment_variants(experiment_id);

-- assignments (sticky per visitor)
create table if not exists public.experiment_assignments (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  variant_id uuid not null references public.experiment_variants(id) on delete cascade,
  visitor_id text not null,
  user_id uuid,
  assigned_at timestamptz not null default now(),
  unique (experiment_id, visitor_id)
);

create index if not exists experiment_assignments_visitor_idx on public.experiment_assignments(visitor_id);
create index if not exists experiment_assignments_user_idx on public.experiment_assignments(user_id);

-- events (exposures, conversions, revenue)
create table if not exists public.experiment_events (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  variant_id uuid not null references public.experiment_variants(id) on delete cascade,
  visitor_id text not null,
  user_id uuid,
  event_type text not null check (event_type in ('exposure','conversion','revenue')),
  revenue_cents integer,
  goal_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists experiment_events_exp_idx on public.experiment_events(experiment_id, created_at desc);
create index if not exists experiment_events_visitor_idx on public.experiment_events(visitor_id);

-- personalization rules (segment-based, deterministic)
create table if not exists public.personalization_rules (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null,
  name text not null,
  priority integer not null default 100,
  segment jsonb not null default '{}'::jsonb,
  variant_config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personalization_rules_slot_idx on public.personalization_rules(slot_key, enabled, priority);

-- updated_at triggers
drop trigger if exists trg_experiments_updated_at on public.experiments;
create trigger trg_experiments_updated_at before update on public.experiments
  for each row execute function public.update_updated_at_column();

drop trigger if exists trg_experiment_variants_updated_at on public.experiment_variants;
create trigger trg_experiment_variants_updated_at before update on public.experiment_variants
  for each row execute function public.update_updated_at_column();

drop trigger if exists trg_personalization_rules_updated_at on public.personalization_rules;
create trigger trg_personalization_rules_updated_at before update on public.personalization_rules
  for each row execute function public.update_updated_at_column();

-- RLS
alter table public.experiments enable row level security;
alter table public.experiment_variants enable row level security;
alter table public.experiment_assignments enable row level security;
alter table public.experiment_events enable row level security;
alter table public.personalization_rules enable row level security;

-- Public read for running experiments + their variants (needed for client assignment)
drop policy if exists "Public reads running experiments" on public.experiments;
create policy "Public reads running experiments"
  on public.experiments for select
  using (status = 'running');

drop policy if exists "Public reads variants of running experiments" on public.experiment_variants;
create policy "Public reads variants of running experiments"
  on public.experiment_variants for select
  using (exists (select 1 from public.experiments e where e.id = experiment_id and e.status = 'running'));

drop policy if exists "Public reads enabled rules" on public.personalization_rules;
create policy "Public reads enabled rules"
  on public.personalization_rules for select
  using (enabled = true);

-- CMS editors full access
drop policy if exists "CMS manages experiments" on public.experiments;
create policy "CMS manages experiments" on public.experiments for all
  using (public.is_cms_editor(auth.uid())) with check (public.is_cms_editor(auth.uid()));

drop policy if exists "CMS manages variants" on public.experiment_variants;
create policy "CMS manages variants" on public.experiment_variants for all
  using (public.is_cms_editor(auth.uid())) with check (public.is_cms_editor(auth.uid()));

drop policy if exists "CMS manages rules" on public.personalization_rules;
create policy "CMS manages rules" on public.personalization_rules for all
  using (public.is_cms_editor(auth.uid())) with check (public.is_cms_editor(auth.uid()));

drop policy if exists "CMS reads all assignments" on public.experiment_assignments;
create policy "CMS reads all assignments" on public.experiment_assignments for select
  using (public.is_cms_editor(auth.uid()));

drop policy if exists "CMS reads all events" on public.experiment_events;
create policy "CMS reads all events" on public.experiment_events for select
  using (public.is_cms_editor(auth.uid()));

-- Anyone (anon/auth) can insert assignments & events for themselves
drop policy if exists "Anyone inserts assignments" on public.experiment_assignments;
create policy "Anyone inserts assignments" on public.experiment_assignments for insert
  with check (true);

drop policy if exists "Anyone inserts events" on public.experiment_events;
create policy "Anyone inserts events" on public.experiment_events for insert
  with check (true);

-- Bandit assign RPC: pick a variant for a visitor with Thompson sampling fallback to weight.
create or replace function public.experiment_assign(
  _experiment_key text,
  _visitor_id text,
  _user_id uuid default null,
  _segment jsonb default '{}'::jsonb
)
returns table (variant_id uuid, variant_key text, variant_config jsonb, experiment_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  _exp public.experiments%rowtype;
  _existing_variant_id uuid;
  _picked record;
begin
  select * into _exp from public.experiments where key = _experiment_key and status = 'running' limit 1;
  if not found then
    return;
  end if;

  -- Sticky: return prior assignment if any
  select ea.variant_id into _existing_variant_id
    from public.experiment_assignments ea
   where ea.experiment_id = _exp.id and ea.visitor_id = _visitor_id
   limit 1;

  if _existing_variant_id is not null then
    return query
      select v.id, v.key, v.config, _exp.id
        from public.experiment_variants v
       where v.id = _existing_variant_id;
    return;
  end if;

  -- Pick: Thompson sampling on (alpha=conversions+1, beta=exposures-conversions+1) if use_bandit, else weighted random.
  if _exp.use_bandit then
    select v.id as id, v.key as key, v.config as config
      into _picked
      from public.experiment_variants v
     where v.experiment_id = _exp.id
     order by (
       -- Approximate beta sample via gamma ratio: gamma(alpha)/(gamma(alpha)+gamma(beta))
       -- Postgres lacks beta sampling natively; use a noisy proxy: random()^(1/(alpha))
       (random() ^ (1.0 / greatest(1, v.conversions + 1)))
     ) desc
     limit 1;
  else
    select v.id as id, v.key as key, v.config as config
      into _picked
      from public.experiment_variants v
     where v.experiment_id = _exp.id
     order by random() * v.weight desc
     limit 1;
  end if;

  if _picked.id is null then
    return;
  end if;

  insert into public.experiment_assignments (experiment_id, variant_id, visitor_id, user_id)
    values (_exp.id, _picked.id, _visitor_id, _user_id)
    on conflict (experiment_id, visitor_id) do nothing;

  return query select _picked.id, _picked.key, _picked.config, _exp.id;
end;
$$;

-- Record event RPC: insert event + bump variant counters atomically.
create or replace function public.experiment_record(
  _experiment_id uuid,
  _variant_id uuid,
  _visitor_id text,
  _user_id uuid,
  _event_type text,
  _revenue_cents integer default null,
  _goal_key text default null,
  _metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.experiment_events
    (experiment_id, variant_id, visitor_id, user_id, event_type, revenue_cents, goal_key, metadata)
  values
    (_experiment_id, _variant_id, _visitor_id, _user_id, _event_type, _revenue_cents, _goal_key, coalesce(_metadata,'{}'::jsonb));

  if _event_type = 'exposure' then
    update public.experiment_variants set exposures = exposures + 1 where id = _variant_id;
  elsif _event_type = 'conversion' then
    update public.experiment_variants set conversions = conversions + 1 where id = _variant_id;
  elsif _event_type = 'revenue' then
    update public.experiment_variants
       set conversions = conversions + 1,
           revenue_cents = revenue_cents + coalesce(_revenue_cents, 0)
     where id = _variant_id;
  end if;
end;
$$;

grant execute on function public.experiment_assign(text, text, uuid, jsonb) to anon, authenticated;
grant execute on function public.experiment_record(uuid, uuid, text, uuid, text, integer, text, jsonb) to anon, authenticated;
