
-- ============ 1. Segment bucket on events & assignments ============
alter table public.experiment_events
  add column if not exists segment_bucket text not null default 'all';
alter table public.experiment_assignments
  add column if not exists segment_bucket text not null default 'all';

create index if not exists experiment_events_var_seg_idx
  on public.experiment_events(variant_id, segment_bucket, created_at desc);

-- ============ 2. Per-slot tuning on experiments ============
alter table public.experiments
  add column if not exists exploration_floor integer not null default 200,
  add column if not exists decay_half_life_days integer not null default 14,
  add column if not exists reward_weight_order numeric not null default 8.0;

-- ============ 3. Per-segment posterior summary table ============
create table if not exists public.experiment_variant_segment_stats (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  variant_id uuid not null references public.experiment_variants(id) on delete cascade,
  segment_bucket text not null default 'all',
  exposures bigint not null default 0,
  conversions bigint not null default 0,
  revenue_cents bigint not null default 0,
  -- time-decayed accumulators (updated on each event)
  decayed_exposures double precision not null default 0,
  decayed_reward double precision not null default 0,
  last_event_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (variant_id, segment_bucket)
);

create index if not exists evss_exp_seg_idx
  on public.experiment_variant_segment_stats(experiment_id, segment_bucket);

grant select on public.experiment_variant_segment_stats to anon, authenticated;
grant all on public.experiment_variant_segment_stats to service_role;

alter table public.experiment_variant_segment_stats enable row level security;

drop policy if exists "Public reads segment stats of running experiments"
  on public.experiment_variant_segment_stats;
create policy "Public reads segment stats of running experiments"
  on public.experiment_variant_segment_stats for select
  using (exists (select 1 from public.experiments e
                  where e.id = experiment_id and e.status = 'running'));

drop policy if exists "CMS manages segment stats" on public.experiment_variant_segment_stats;
create policy "CMS manages segment stats"
  on public.experiment_variant_segment_stats for all
  using (public.is_cms_editor(auth.uid()))
  with check (public.is_cms_editor(auth.uid()));

-- ============ 4. Candidate pools for SKU-picking bandits ============
create table if not exists public.experiment_candidates (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  candidate_ref text not null,            -- product handle / sku / id
  candidate_type text not null default 'product',  -- product|merch|wine|strategy
  variant_id uuid references public.experiment_variants(id) on delete set null,
  weight numeric not null default 1.0,
  status text not null default 'active',  -- active|paused|retired
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (experiment_id, candidate_ref)
);

create index if not exists ec_exp_status_idx
  on public.experiment_candidates(experiment_id, status);

grant select on public.experiment_candidates to anon, authenticated;
grant all on public.experiment_candidates to service_role;

alter table public.experiment_candidates enable row level security;

drop policy if exists "Public reads active candidates of running experiments"
  on public.experiment_candidates;
create policy "Public reads active candidates of running experiments"
  on public.experiment_candidates for select
  using (status = 'active' and exists (
    select 1 from public.experiments e
     where e.id = experiment_id and e.status = 'running'));

drop policy if exists "CMS manages candidates" on public.experiment_candidates;
create policy "CMS manages candidates"
  on public.experiment_candidates for all
  using (public.is_cms_editor(auth.uid()))
  with check (public.is_cms_editor(auth.uid()));

drop trigger if exists trg_experiment_candidates_updated_at on public.experiment_candidates;
create trigger trg_experiment_candidates_updated_at
  before update on public.experiment_candidates
  for each row execute function public.update_updated_at_column();

-- ============ 5. Upgraded experiment_assign RPC ============
-- Adds: segment_bucket, exploration floor (round-robin lowest-exposure),
-- revenue-per-impression Thompson (Beta normal-approx) when primary_metric=revenue,
-- CTR Thompson otherwise. Reads decayed reward from per-segment stats.
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
  _bucket text;
  _existing_variant_id uuid;
  _picked_id uuid;
  _floor integer;
  _is_revenue boolean;
begin
  select * into _exp from public.experiments
    where key = _experiment_key and status = 'running' limit 1;
  if not found then return; end if;

  -- Deterministic segment bucket (device|auth|geo) - keeps cardinality bounded
  _bucket := coalesce(_segment->>'device','any')
          || '|' || coalesce(_segment->>'authState','any')
          || '|' || case when (_segment->>'geoIsUS')::boolean is true then 'us' else 'intl' end;

  -- Sticky: prior assignment wins
  select ea.variant_id into _existing_variant_id
    from public.experiment_assignments ea
   where ea.experiment_id = _exp.id and ea.visitor_id = _visitor_id
   limit 1;
  if _existing_variant_id is not null then
    return query select v.id, v.key, v.config, _exp.id
      from public.experiment_variants v where v.id = _existing_variant_id;
    return;
  end if;

  _floor := greatest(1, coalesce(_exp.exploration_floor, 200));
  _is_revenue := _exp.primary_metric = 'revenue_per_visitor';

  if not _exp.use_bandit then
    -- weighted random
    select v.id into _picked_id from public.experiment_variants v
     where v.experiment_id = _exp.id
     order by random() * v.weight desc limit 1;
  else
    -- Exploration phase: any variant under floor (in this segment) → round-robin lowest-exposure
    select v.id into _picked_id
      from public.experiment_variants v
      left join public.experiment_variant_segment_stats s
        on s.variant_id = v.id and s.segment_bucket = _bucket
     where v.experiment_id = _exp.id
       and coalesce(s.exposures, 0) < _floor
     order by coalesce(s.exposures, 0) asc, random()
     limit 1;

    if _picked_id is null then
      -- Exploitation: Thompson sample on decayed posterior per segment
      -- Beta via normal approximation: mean = α/(α+β), var = αβ/((α+β)²(α+β+1))
      with samples as (
        select
          v.id,
          case when _is_revenue then
            -- revenue mode: reward already accumulates revenue_cents (decayed); convert to per-impression
            coalesce(s.decayed_reward, 0) / nullif(coalesce(s.decayed_exposures, 0), 0)
          else
            -- CTR mode: clicks + reward_weight_order * orders, vs exposures
            null
          end as _unused,
          -- alpha/beta from decayed counters
          greatest(1.0, coalesce(s.decayed_reward, 0)) + 1.0 as alpha,
          greatest(0.0, coalesce(s.decayed_exposures, 0) - coalesce(s.decayed_reward, 0)) + 1.0 as beta
        from public.experiment_variants v
        left join public.experiment_variant_segment_stats s
          on s.variant_id = v.id and s.segment_bucket = _bucket
        where v.experiment_id = _exp.id
      ), draws as (
        select id,
          -- Box-Muller normal sample, then map to beta(alpha,beta) via mean+sd*z
          least(1.0, greatest(0.0,
            (alpha / (alpha+beta))
            + sqrt((alpha*beta) / (((alpha+beta) * (alpha+beta)) * (alpha+beta+1.0)))
              * sqrt(-2.0 * ln(greatest(random(), 1e-9))) * cos(2.0 * pi() * random())
          )) as theta
        from samples
      )
      select id into _picked_id from draws order by theta desc limit 1;
    end if;
  end if;

  if _picked_id is null then return; end if;

  insert into public.experiment_assignments
    (experiment_id, variant_id, visitor_id, user_id, segment_bucket)
  values (_exp.id, _picked_id, _visitor_id, _user_id, _bucket)
  on conflict (experiment_id, visitor_id) do nothing;

  return query select v.id, v.key, v.config, _exp.id
    from public.experiment_variants v where v.id = _picked_id;
end;
$$;

grant execute on function public.experiment_assign(text, text, uuid, jsonb) to anon, authenticated;

-- ============ 6. Upgraded experiment_record: bumps per-segment stats with time-decay ============
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
declare
  _bucket text;
  _exp public.experiments%rowtype;
  _half_life double precision;
  _now timestamptz := now();
  _existing public.experiment_variant_segment_stats%rowtype;
  _age_days double precision;
  _decay double precision;
  _is_revenue boolean;
  _reward_delta double precision := 0;
  _exposure_delta double precision := 0;
begin
  insert into public.experiment_events
    (experiment_id, variant_id, visitor_id, user_id, event_type, revenue_cents, goal_key, metadata, segment_bucket)
  values
    (_experiment_id, _variant_id, _visitor_id, _user_id, _event_type, _revenue_cents, _goal_key,
     coalesce(_metadata,'{}'::jsonb),
     coalesce(_metadata->>'segment_bucket', 'all'));

  _bucket := coalesce(_metadata->>'segment_bucket', 'all');

  select * into _exp from public.experiments where id = _experiment_id limit 1;
  if not found then return; end if;
  _half_life := greatest(1, coalesce(_exp.decay_half_life_days, 14))::double precision;
  _is_revenue := _exp.primary_metric = 'revenue_per_visitor';

  -- Bump raw variant counters (back-compat)
  if _event_type = 'exposure' then
    update public.experiment_variants set exposures = exposures + 1 where id = _variant_id;
    _exposure_delta := 1;
  elsif _event_type = 'conversion' then
    update public.experiment_variants set conversions = conversions + 1 where id = _variant_id;
    if not _is_revenue then
      _reward_delta := coalesce(_exp.reward_weight_order, 8.0);  -- treat conversion as order in CTR mode
    end if;
  elsif _event_type = 'revenue' then
    update public.experiment_variants
       set conversions = conversions + 1,
           revenue_cents = revenue_cents + coalesce(_revenue_cents, 0)
     where id = _variant_id;
    if _is_revenue then
      -- normalize: reward = revenue_dollars (cents/100); kept on same scale as exposures for beta sampling
      _reward_delta := coalesce(_revenue_cents, 0)::double precision / 100.0;
    else
      _reward_delta := coalesce(_exp.reward_weight_order, 8.0);
    end if;
  end if;

  -- Upsert per-segment stats with time-decay
  select * into _existing from public.experiment_variant_segment_stats
    where variant_id = _variant_id and segment_bucket = _bucket limit 1;

  if found then
    _age_days := extract(epoch from (_now - _existing.last_event_at)) / 86400.0;
    _decay := exp(- ln(2.0) * _age_days / _half_life);
    update public.experiment_variant_segment_stats
       set exposures = exposures + (case when _event_type='exposure' then 1 else 0 end),
           conversions = conversions + (case when _event_type in ('conversion','revenue') then 1 else 0 end),
           revenue_cents = revenue_cents + (case when _event_type='revenue' then coalesce(_revenue_cents,0) else 0 end),
           decayed_exposures = (decayed_exposures * _decay) + _exposure_delta,
           decayed_reward = (decayed_reward * _decay) + _reward_delta,
           last_event_at = _now,
           updated_at = _now
     where id = _existing.id;
  else
    insert into public.experiment_variant_segment_stats
      (experiment_id, variant_id, segment_bucket, exposures, conversions, revenue_cents,
       decayed_exposures, decayed_reward, last_event_at)
    values
      (_experiment_id, _variant_id, _bucket,
       (case when _event_type='exposure' then 1 else 0 end),
       (case when _event_type in ('conversion','revenue') then 1 else 0 end),
       (case when _event_type='revenue' then coalesce(_revenue_cents,0) else 0 end),
       _exposure_delta, _reward_delta, _now);
  end if;
end;
$$;

grant execute on function public.experiment_record(uuid, uuid, text, uuid, text, integer, text, jsonb) to anon, authenticated;
