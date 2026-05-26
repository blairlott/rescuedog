
-- Idempotent: caller passes slot_key + candidate refs; we create/extend the experiment.
-- Each candidate becomes an experiment_variant (key = candidate_ref) and a row in
-- experiment_candidates. Removed candidates are retired (variant kept for history).
create or replace function public.ensure_candidate_experiment(
  _slot_key text,
  _name text,
  _candidates jsonb,            -- [{ref:"handle", type:"product", weight?:1, metadata?:{}}]
  _primary_metric public.experiment_metric default 'revenue_per_visitor',
  _exploration_floor integer default 150
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _exp_id uuid;
  _exp_key text := 'auto_' || _slot_key;
  _cand jsonb;
  _ref text;
  _type text;
  _weight numeric;
  _meta jsonb;
  _variant_id uuid;
  _active_refs text[] := array[]::text[];
begin
  -- 1. Upsert experiment
  select id into _exp_id from public.experiments where key = _exp_key limit 1;
  if _exp_id is null then
    insert into public.experiments (key, name, slot_key, status, primary_metric, use_bandit, exploration_floor)
    values (_exp_key, _name, _slot_key, 'running', _primary_metric, true, _exploration_floor)
    returning id into _exp_id;
  else
    update public.experiments
       set status = 'running',
           name = _name,
           primary_metric = _primary_metric,
           exploration_floor = _exploration_floor
     where id = _exp_id;
  end if;

  -- 2. Upsert variants + candidates
  for _cand in select * from jsonb_array_elements(coalesce(_candidates, '[]'::jsonb))
  loop
    _ref    := _cand->>'ref';
    _type   := coalesce(_cand->>'type', 'product');
    _weight := coalesce((_cand->>'weight')::numeric, 1.0);
    _meta   := coalesce(_cand->'metadata', '{}'::jsonb);
    if _ref is null or length(_ref) = 0 then continue; end if;
    _active_refs := array_append(_active_refs, _ref);

    -- variant per candidate (key = ref)
    insert into public.experiment_variants (experiment_id, key, name, config, weight)
    values (_exp_id, _ref, _ref, jsonb_build_object('candidate_ref', _ref, 'candidate_type', _type) || _meta, _weight)
    on conflict (experiment_id, key) do update
      set config = excluded.config, weight = excluded.weight
    returning id into _variant_id;

    if _variant_id is null then
      select id into _variant_id from public.experiment_variants
       where experiment_id = _exp_id and key = _ref limit 1;
    end if;

    insert into public.experiment_candidates
      (experiment_id, candidate_ref, candidate_type, variant_id, weight, status, metadata)
    values (_exp_id, _ref, _type, _variant_id, _weight, 'active', _meta)
    on conflict (experiment_id, candidate_ref) do update
      set variant_id = excluded.variant_id,
          candidate_type = excluded.candidate_type,
          weight = excluded.weight,
          metadata = excluded.metadata,
          status = 'active';
  end loop;

  -- 3. Retire candidates no longer in the active pool (variant rows kept for history)
  update public.experiment_candidates
     set status = 'retired'
   where experiment_id = _exp_id
     and status = 'active'
     and not (candidate_ref = any(_active_refs));

  return _exp_id;
end;
$$;

grant execute on function public.ensure_candidate_experiment(text, text, jsonb, public.experiment_metric, integer)
  to anon, authenticated;

-- Convenience reader: returns active candidates joined with their variant id
create or replace function public.get_active_candidates_for_slot(_slot_key text)
returns table (
  candidate_ref text,
  candidate_type text,
  variant_id uuid,
  experiment_id uuid,
  weight numeric,
  metadata jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select c.candidate_ref, c.candidate_type, c.variant_id, c.experiment_id, c.weight, c.metadata
    from public.experiment_candidates c
    join public.experiments e on e.id = c.experiment_id
   where e.slot_key = _slot_key
     and e.status = 'running'
     and c.status = 'active';
$$;

grant execute on function public.get_active_candidates_for_slot(text) to anon, authenticated;
