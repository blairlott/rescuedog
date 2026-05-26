-- 1. Extend optimization_category enum (idempotent guard)
do $$
begin
  if not exists (select 1 from pg_enum e
                 join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'optimization_category' and e.enumlabel = 'bandit_winner') then
    alter type public.optimization_category add value 'bandit_winner';
  end if;
end$$;

-- 2. Replace experiment_assign with proper Thompson sampling (Beta via normal approximation)
create or replace function public.experiment_assign(
  _experiment_key text,
  _visitor_id text,
  _user_id uuid default null,
  _segment jsonb default '{}'
)
returns table(variant_id uuid, variant_key text, variant_config jsonb, experiment_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  _exp public.experiments%rowtype;
  _existing_variant_id uuid;
  _picked record;
begin
  select * into _exp from public.experiments
   where key = _experiment_key and status = 'running' limit 1;
  if not found then return; end if;

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

  if _exp.use_bandit then
    -- Proper Thompson Sampling: draw from Beta(alpha, beta) per variant via
    -- normal approximation (mean=a/(a+b), var=ab/((a+b)^2*(a+b+1))) using
    -- Box-Muller. Pick the variant with the highest sample.
    with samples as (
      select v.id, v.key, v.config,
             (
               (v.conversions + 1)::float8 / ((v.exposures + 2)::float8)
               +
               sqrt(
                 ((v.conversions + 1)::float8 * ((v.exposures - v.conversions) + 1)::float8)
                 /
                 ( ((v.exposures + 2)::float8 ^ 2) * ((v.exposures + 3)::float8) )
               )
               * sqrt(-2.0 * ln(greatest(random(), 1e-12)))
               * cos(2.0 * pi() * random())
             ) as beta_sample
        from public.experiment_variants v
       where v.experiment_id = _exp.id
    )
    select id, key, config into _picked
      from samples order by beta_sample desc limit 1;
  else
    select v.id, v.key, v.config into _picked
      from public.experiment_variants v
     where v.experiment_id = _exp.id
     order by random() * coalesce(v.weight, 1.0) desc
     limit 1;
  end if;

  if _picked.id is null then return; end if;

  insert into public.experiment_assignments (experiment_id, variant_id, visitor_id, user_id)
    values (_exp.id, _picked.id, _visitor_id, _user_id)
    on conflict (experiment_id, visitor_id) do nothing;

  return query select _picked.id, _picked.key, _picked.config, _exp.id;
end;
$$;

-- 3. Bandit winner scanner — files opportunities into the approval queue
create or replace function public.experiment_scan_bandit_winners()
returns table(experiment_id uuid, opportunity_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  _exp record;
  _control record;
  _winner record;
  _autonomous_global boolean;
  _opp_id uuid;
  _min_per_variant constant int := 200;
  _trials constant int := 4000;
  _wins int;
  _i int;
  _ca float8; _cb float8; _wa float8; _wb float8;
  _cs float8; _ws float8;
  _u1 float8; _u2 float8; _n float8;
  _sample_control float8; _sample_winner float8;
begin
  -- Read global autonomous toggle if present (best-effort; default off).
  begin
    select coalesce((value::text)::boolean, false) into _autonomous_global
      from public.app_settings where key = 'optimization_autonomous';
  exception when others then
    _autonomous_global := false;
  end;

  for _exp in
    select e.id, e.key, e.name, e.slot_key, e.winner_variant_id
      from public.experiments e
     where e.status = 'running' and e.use_bandit = true
  loop
    -- Need a control to compare against.
    select * into _control from public.experiment_variants
     where experiment_id = _exp.id and is_control = true limit 1;
    if not found then continue; end if;
    if _control.exposures < _min_per_variant then continue; end if;

    -- Best non-control variant by mean conversion rate.
    select * into _winner from public.experiment_variants
     where experiment_id = _exp.id and id <> _control.id
       and exposures >= _min_per_variant
     order by ((conversions + 1.0) / (exposures + 2.0)) desc
     limit 1;
    if not found then continue; end if;
    if _winner.id = _exp.winner_variant_id then continue; end if;

    -- Monte Carlo posterior P(winner > control) using normal approx to Beta.
    _ca := _control.conversions + 1.0; _cb := (_control.exposures - _control.conversions) + 1.0;
    _wa := _winner.conversions  + 1.0; _wb := (_winner.exposures  - _winner.conversions)  + 1.0;
    _wins := 0;
    for _i in 1.._trials loop
      _u1 := greatest(random(), 1e-12); _u2 := random();
      _n  := sqrt(-2.0 * ln(_u1)) * cos(2.0 * pi() * _u2);
      _sample_control := _ca/(_ca+_cb) + sqrt((_ca*_cb)/(((_ca+_cb)^2)*(_ca+_cb+1.0))) * _n;
      _u1 := greatest(random(), 1e-12); _u2 := random();
      _n  := sqrt(-2.0 * ln(_u1)) * cos(2.0 * pi() * _u2);
      _sample_winner  := _wa/(_wa+_wb) + sqrt((_wa*_wb)/(((_wa+_wb)^2)*(_wa+_wb+1.0))) * _n;
      if _sample_winner > _sample_control then _wins := _wins + 1; end if;
    end loop;

    if (_wins::float8 / _trials::float8) < 0.95 then continue; end if;

    -- Suppress if we already filed an opportunity for this exp+variant today.
    if exists (
      select 1 from public.optimization_opportunities
       where category = 'bandit_winner'
         and proposed_change->>'experiment_id' = _exp.id::text
         and proposed_change->>'variant_id' = _winner.id::text
         and created_at > now() - interval '24 hours'
    ) then continue; end if;

    insert into public.optimization_opportunities (
      category, goal, surface, title, rationale,
      proposed_change, supporting_metrics, confidence, est_lift_pct,
      status, auto_applied, source
    ) values (
      'bandit_winner',
      'conversion',
      coalesce(_exp.slot_key, _exp.key),
      'Promote winning variant in ' || _exp.name,
      'Variant "' || _winner.name || '" beats control "' || _control.name
        || '" with ' || round(((_wins::numeric / _trials) * 100), 1)
        || '% posterior probability over ' || _winner.exposures || ' exposures.',
      jsonb_build_object(
        'experiment_id', _exp.id,
        'experiment_key', _exp.key,
        'variant_id', _winner.id,
        'variant_key', _winner.key,
        'control_id', _control.id,
        'slot_key', _exp.slot_key,
        'config', _winner.config
      ),
      jsonb_build_object(
        'winner_exposures', _winner.exposures,
        'winner_conversions', _winner.conversions,
        'winner_cr', round(((_winner.conversions::numeric) / nullif(_winner.exposures, 0)) * 100, 2),
        'control_exposures', _control.exposures,
        'control_conversions', _control.conversions,
        'control_cr', round(((_control.conversions::numeric) / nullif(_control.exposures, 0)) * 100, 2),
        'posterior_win_pct', round(((_wins::numeric / _trials) * 100), 1)
      ),
      round((_wins::numeric / _trials), 3),
      case when _control.exposures > 0 and _control.conversions > 0
           then round(((( (_winner.conversions::numeric / nullif(_winner.exposures,0))
                        - (_control.conversions::numeric / nullif(_control.exposures,0)))
                       / nullif((_control.conversions::numeric / nullif(_control.exposures,0)), 0)) * 100), 2)
           else null end,
      'pending', false,
      'bandit-scanner'
    ) returning id into _opp_id;

    return query select _exp.id, _opp_id;
  end loop;
end;
$$;

grant execute on function public.experiment_scan_bandit_winners() to service_role;