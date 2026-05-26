create table if not exists public.ads_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null default 'google_ads' check (platform in ('google_ads','meta')),
  customer_id text not null,
  login_customer_id text,
  label text,
  refresh_token text not null,
  status text not null default 'active' check (status in ('active','revoked','error')),
  last_sync_at timestamptz,
  last_sync_error text,
  connected_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, customer_id)
);
alter table public.ads_accounts enable row level security;
create policy "ads_accounts admins read"  on public.ads_accounts for select
  using (is_admin_or_owner(auth.uid()) or is_ad_ops(auth.uid()));
create policy "ads_accounts admins write" on public.ads_accounts for all
  using (is_admin_or_owner(auth.uid()) or is_ad_ops(auth.uid()))
  with check (is_admin_or_owner(auth.uid()) or is_ad_ops(auth.uid()));
create trigger trg_ads_accounts_updated before update on public.ads_accounts
  for each row execute function public.update_updated_at_column();

create table if not exists public.ads_oauth_state (
  state text primary key,
  platform text not null default 'google_ads',
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);
alter table public.ads_oauth_state enable row level security;
create policy "ads_oauth_state admins" on public.ads_oauth_state for all
  using (is_admin_or_owner(auth.uid()) or is_ad_ops(auth.uid()))
  with check (is_admin_or_owner(auth.uid()) or is_ad_ops(auth.uid()));

create table if not exists public.ads_performance (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.ads_accounts(id) on delete cascade,
  platform text not null default 'google_ads',
  date date not null,
  campaign_id text not null,
  campaign_name text,
  ad_group_id text,
  ad_group_name text,
  ad_id text,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  conversions numeric not null default 0,
  cost_micros bigint not null default 0,
  conversion_value_micros bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ads_performance enable row level security;
create policy "ads_performance admins read" on public.ads_performance for select
  using (is_admin_or_owner(auth.uid()) or is_ad_ops(auth.uid()));
create unique index if not exists ads_perf_uniq
  on public.ads_performance (account_id, date, campaign_id, (coalesce(ad_group_id,'')), (coalesce(ad_id,'')));
create index if not exists idx_ads_perf_account_date on public.ads_performance(account_id, date desc);
create index if not exists idx_ads_perf_campaign on public.ads_performance(campaign_id, date desc);
create trigger trg_ads_performance_updated before update on public.ads_performance
  for each row execute function public.update_updated_at_column();

create or replace function public.ads_bandit_scan_opportunities()
returns table(ad_group text, opp_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  _grp record;
  _winner record;
  _control record;
  _opp_id uuid;
  _trials constant int := 4000;
  _min_clicks constant int := 100;
  _wins int; _i int;
  _ca float8; _cb float8; _wa float8; _wb float8;
  _u1 float8; _u2 float8; _n float8;
  _sc float8; _sw float8;
begin
  for _grp in
    with agg as (
      select p.account_id, p.campaign_id, p.campaign_name, p.ad_group_id, p.ad_group_name, p.ad_id,
             sum(p.clicks)::bigint as clicks, sum(p.conversions)::numeric as conv,
             sum(p.cost_micros)::bigint as cost, sum(p.conversion_value_micros)::bigint as rev
        from public.ads_performance p
       where p.date >= current_date - interval '14 days' and p.ad_id is not null
       group by 1,2,3,4,5,6
    )
    select campaign_id, campaign_name, ad_group_id, ad_group_name,
           jsonb_agg(to_jsonb(agg.*)) as ads
      from agg
     group by campaign_id, campaign_name, ad_group_id, ad_group_name
  loop
    if (select count(*) from jsonb_array_elements(_grp.ads) a
        where (a->>'clicks')::bigint >= _min_clicks) < 2 then continue; end if;

    select (a->>'ad_id')::text as ad_id, (a->>'clicks')::bigint as clicks, (a->>'conv')::numeric as conv
      into _control
      from jsonb_array_elements(_grp.ads) a
     where (a->>'clicks')::bigint >= _min_clicks
     order by (a->>'clicks')::bigint desc limit 1;

    select (a->>'ad_id')::text as ad_id, (a->>'clicks')::bigint as clicks, (a->>'conv')::numeric as conv
      into _winner
      from jsonb_array_elements(_grp.ads) a
     where (a->>'clicks')::bigint >= _min_clicks and (a->>'ad_id') <> _control.ad_id
     order by ((a->>'conv')::numeric + 1.0)/((a->>'clicks')::numeric + 2.0) desc limit 1;

    if _winner.ad_id is null then continue; end if;

    _ca := _control.conv + 1.0; _cb := (_control.clicks - _control.conv) + 1.0;
    _wa := _winner.conv  + 1.0; _wb := (_winner.clicks  - _winner.conv)  + 1.0;
    _wins := 0;
    for _i in 1.._trials loop
      _u1 := greatest(random(), 1e-12); _u2 := random();
      _n  := sqrt(-2.0*ln(_u1))*cos(2.0*pi()*_u2);
      _sc := _ca/(_ca+_cb) + sqrt((_ca*_cb)/(((_ca+_cb)^2)*(_ca+_cb+1.0)))*_n;
      _u1 := greatest(random(), 1e-12); _u2 := random();
      _n  := sqrt(-2.0*ln(_u1))*cos(2.0*pi()*_u2);
      _sw := _wa/(_wa+_wb) + sqrt((_wa*_wb)/(((_wa+_wb)^2)*(_wa+_wb+1.0)))*_n;
      if _sw > _sc then _wins := _wins + 1; end if;
    end loop;
    if (_wins::float8 / _trials) < 0.95 then continue; end if;

    if exists (
      select 1 from public.optimization_opportunities o
       where o.category = 'bandit_winner' and o.source = 'ads-bandit-scanner'
         and o.proposed_change->>'ad_group_id' = _grp.ad_group_id
         and o.proposed_change->>'winner_ad_id' = _winner.ad_id
         and o.created_at > now() - interval '24 hours'
    ) then continue; end if;

    insert into public.optimization_opportunities (
      category, goal, surface, title, rationale,
      proposed_change, supporting_metrics, confidence, status, auto_applied, source
    ) values (
      'bandit_winner', 'conversion',
      'google_ads:' || coalesce(_grp.campaign_name, _grp.campaign_id),
      'Shift budget to winning ad in ' || coalesce(_grp.ad_group_name, _grp.ad_group_id),
      'Ad ' || _winner.ad_id || ' beats ad ' || _control.ad_id
        || ' with ' || round(((_wins::numeric/_trials)*100),1)
        || '% posterior probability over ' || _winner.clicks || ' clicks.',
      jsonb_build_object(
        'platform','google_ads',
        'campaign_id', _grp.campaign_id, 'campaign_name', _grp.campaign_name,
        'ad_group_id', _grp.ad_group_id, 'ad_group_name', _grp.ad_group_name,
        'winner_ad_id', _winner.ad_id, 'control_ad_id', _control.ad_id,
        'recommended_action', 'pause_control_or_reweight_budget'
      ),
      jsonb_build_object(
        'winner_clicks', _winner.clicks, 'winner_conv', _winner.conv,
        'control_clicks', _control.clicks, 'control_conv', _control.conv,
        'posterior_win_pct', round(((_wins::numeric/_trials)*100),1)
      ),
      round((_wins::numeric/_trials),3),
      'pending', false, 'ads-bandit-scanner'
    ) returning id into _opp_id;

    ad_group := _grp.ad_group_id;
    opp_id := _opp_id;
    return next;
  end loop;
end;
$$;
grant execute on function public.ads_bandit_scan_opportunities() to service_role;