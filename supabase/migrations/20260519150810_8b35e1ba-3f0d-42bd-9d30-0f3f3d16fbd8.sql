create table if not exists public.ab_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in ('pageview','add_to_cart')),
  site_variant text not null check (site_variant in ('lovable','legacy')),
  ab_test text,
  session_id text,
  path text,
  value_cents integer,
  created_at timestamptz not null default now()
);

create index if not exists ab_events_variant_created_idx
  on public.ab_events (site_variant, created_at desc);
create index if not exists ab_events_type_created_idx
  on public.ab_events (event_type, created_at desc);

alter table public.ab_events enable row level security;

create policy "ab_events insert anon"
  on public.ab_events for insert
  to anon, authenticated
  with check (true);

create policy "ab_events select admins"
  on public.ab_events for select
  to authenticated
  using (public.is_admin_or_owner(auth.uid()));

create or replace function public.ab_results_summary(_since timestamptz default now() - interval '30 days')
returns table(
  site_variant text,
  sessions bigint,
  pageviews bigint,
  add_to_carts bigint,
  checkout_intents bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select unnest(array['lovable','legacy']) as site_variant
  ),
  ev as (
    select site_variant,
           count(distinct session_id) filter (where session_id is not null) as sessions,
           count(*) filter (where event_type = 'pageview') as pageviews,
           count(*) filter (where event_type = 'add_to_cart') as add_to_carts
    from public.ab_events
    where created_at >= _since
    group by site_variant
  ),
  ci as (
    select site_variant, count(*) as checkout_intents
    from public.ab_checkout_intents
    where created_at >= _since
    group by site_variant
  )
  select v.site_variant,
         coalesce(ev.sessions, 0),
         coalesce(ev.pageviews, 0),
         coalesce(ev.add_to_carts, 0),
         coalesce(ci.checkout_intents, 0)
  from v
  left join ev on ev.site_variant = v.site_variant
  left join ci on ci.site_variant = v.site_variant
  order by v.site_variant;
$$;

revoke all on function public.ab_results_summary(timestamptz) from public, anon;
grant execute on function public.ab_results_summary(timestamptz) to authenticated;