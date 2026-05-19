create table if not exists public.kennel_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  target text not null,
  status text not null,
  attempts int not null default 1,
  duration_ms int,
  error text,
  payload jsonb default '{}'::jsonb
);
create index if not exists kennel_ingest_runs_target_run_at_idx
  on public.kennel_ingest_runs (target, run_at desc);

alter table public.kennel_ingest_runs enable row level security;

drop policy if exists "kennel viewers read ingest runs" on public.kennel_ingest_runs;
create policy "kennel viewers read ingest runs"
  on public.kennel_ingest_runs for select
  to authenticated
  using (public.can_view_kennel(auth.uid()));

create or replace function public.kennel_ingest_runs_recent(_limit int default 50)
returns setof public.kennel_ingest_runs
language sql stable security definer set search_path = public as $$
  select * from public.kennel_ingest_runs
  where public.can_view_kennel(auth.uid())
  order by run_at desc
  limit greatest(1, least(_limit, 200));
$$;