CREATE OR REPLACE FUNCTION public.experiment_assign(_experiment_key text, _visitor_id text, _user_id uuid DEFAULT NULL::uuid, _segment jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(variant_id uuid, variant_key text, variant_config jsonb, experiment_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
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

  _bucket := coalesce(_segment->>'device','any')
          || '|' || coalesce(_segment->>'authState','any')
          || '|' || case when (_segment->>'geoIsUS')::boolean is true then 'us' else 'intl' end;

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
    select v.id into _picked_id from public.experiment_variants v
     where v.experiment_id = _exp.id
     order by random() * v.weight desc limit 1;
  else
    select v.id into _picked_id
      from public.experiment_variants v
      left join public.experiment_variant_segment_stats s
        on s.variant_id = v.id and s.segment_bucket = _bucket
     where v.experiment_id = _exp.id
       and coalesce(s.exposures, 0) < _floor
     order by coalesce(s.exposures, 0) asc, random()
     limit 1;

    if _picked_id is null then
      with samples as (
        select
          v.id,
          case when _is_revenue then
            coalesce(s.decayed_reward, 0) / nullif(coalesce(s.decayed_exposures, 0), 0)
          else
            null
          end as _unused,
          greatest(1.0, coalesce(s.decayed_reward, 0)) + 1.0 as alpha,
          greatest(0.0, coalesce(s.decayed_exposures, 0) - coalesce(s.decayed_reward, 0)) + 1.0 as beta
        from public.experiment_variants v
        left join public.experiment_variant_segment_stats s
          on s.variant_id = v.id and s.segment_bucket = _bucket
        where v.experiment_id = _exp.id
      ), draws as (
        select id,
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
$function$;