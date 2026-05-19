create table if not exists public.oci_upload_log (
  id uuid primary key default gen_random_uuid(),
  uploaded_at timestamptz not null default now(),
  conversion_action_id text not null,
  order_id text,
  gclid text,
  conversion_value numeric,
  currency text,
  status text not null check (status in ('uploaded','partial_failure','error')),
  error_message text,
  raw_response jsonb
);

create index if not exists idx_oci_upload_log_uploaded_at on public.oci_upload_log (uploaded_at desc);
create index if not exists idx_oci_upload_log_order_id on public.oci_upload_log (order_id);
create index if not exists idx_oci_upload_log_status on public.oci_upload_log (status);

alter table public.oci_upload_log enable row level security;

create policy "admins read oci upload log"
  on public.oci_upload_log
  for select
  using (public.is_admin_or_owner(auth.uid()));