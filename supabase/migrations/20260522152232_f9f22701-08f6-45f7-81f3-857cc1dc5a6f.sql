
create table public.graz_directives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  directive text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.graz_directives enable row level security;
create policy "owner manages own directives" on public.graz_directives
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "admins read all directives" on public.graz_directives
  for select using (public.has_role(auth.uid(), 'admin'));

create table public.graz_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  thread_id uuid not null,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.graz_messages enable row level security;
create policy "owner manages own graz messages" on public.graz_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index graz_messages_thread_idx on public.graz_messages(thread_id, created_at);
create index graz_directives_user_active_idx on public.graz_directives(user_id, active);
