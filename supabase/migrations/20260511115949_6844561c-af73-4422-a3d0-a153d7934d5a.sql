create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  body_html text,
  cover_image text,
  recommended_product_handle text,
  pairing_notes text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger recipes_updated before update on public.recipes for each row execute function public.update_updated_at_column();
alter table public.recipes enable row level security;
create policy "Recipes public read published" on public.recipes for select using (published = true);
create policy "CMS editors read all recipes" on public.recipes for select to authenticated using (public.is_cms_editor(auth.uid()));
create policy "CMS editors insert recipes" on public.recipes for insert to authenticated with check (public.is_cms_editor(auth.uid()));
create policy "CMS editors update recipes" on public.recipes for update to authenticated using (public.is_cms_editor(auth.uid()));
create policy "CMS editors delete recipes" on public.recipes for delete to authenticated using (public.is_cms_editor(auth.uid()));