drop function if exists public.experiment_scan_bandit_winners();

create function public.experiment_scan_bandit_winners()
returns table(exp_id uuid, opp_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  _exp record;
  _control record;
  _winner record;
  _opp_id uuid;
  _min_per_variant constant int := 200;
  _trials constant int := 4000;
  _wins int;
  _i int;
  _ca float8; _cb float8; _wa float8; _wb float8;
  _u1 float8; _u2 float8; _n float8;
  _sample_control float8; _sample_winner float8;
begin
  for _exp in
    select e.id, e.key, e.name, e.slot_key, e.winner_variant_id
      from public.experiments e
     where e.status = 'running' and e.use_bandit = true
  loop
    select v.* into _control from public.experiment_variants v
     where v.experiment_id = _exp.id and v.is_control = true limit 1;
    if not found then continue; end if;
    if _control.exposures < _min_per_variant then continue; end if;

    select v.* into _winner from public.experiment_variants v
     where v.experiment_id = _exp.id and v.id <> _control.id
       and v.exposures >= _min_per_variant
     order by ((v.conversions + 1.0) / (v.exposures + 2.0)) desc
     limit 1;
    if not found then continue; end if;
    if _winner.id = _exp.winner_variant_id then continue; end if;

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

    if exists (
      select 1 from public.optimization_opportunities o
       where o.category = 'bandit_winner'
         and o.proposed_change->>'experiment_id' = _exp.id::text
         and o.proposed_change->>'variant_id' = _winner.id::text
         and o.created_at > now() - interval '24 hours'
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

    exp_id := _exp.id;
    opp_id := _opp_id;
    return next;
  end loop;
end;
$$;

grant execute on function public.experiment_scan_bandit_winners() to service_role;