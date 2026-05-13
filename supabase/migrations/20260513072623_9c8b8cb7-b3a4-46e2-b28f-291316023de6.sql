
-- Enable required extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Audits table
create table if not exists public.compliance_audits (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running',
  source text not null default 'lovable_ai',
  triggered_by text not null default 'cron',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  topic_count int default 0,
  ok_count int default 0,
  warn_count int default 0,
  fail_count int default 0,
  error text,
  created_at timestamptz not null default now()
);

-- Findings table
create table if not exists public.compliance_findings (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.compliance_audits(id) on delete cascade,
  topic text not null,
  status text not null,
  summary text,
  findings jsonb default '[]'::jsonb,
  recommendations jsonb default '[]'::jsonb,
  citations jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_compliance_findings_audit on public.compliance_findings(audit_id);
create index if not exists idx_compliance_audits_started on public.compliance_audits(started_at desc);

alter table public.compliance_audits enable row level security;
alter table public.compliance_findings enable row level security;

-- Admin-only read (uses existing has_role function)
drop policy if exists "Admins read audits" on public.compliance_audits;
create policy "Admins read audits" on public.compliance_audits
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "Admins read findings" on public.compliance_findings;
create policy "Admins read findings" on public.compliance_findings
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

-- Allow admins to trigger (insert audit row) manually too
drop policy if exists "Admins insert audits" on public.compliance_audits;
create policy "Admins insert audits" on public.compliance_audits
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));
