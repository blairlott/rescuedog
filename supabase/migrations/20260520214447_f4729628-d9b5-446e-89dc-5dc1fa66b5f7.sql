ALTER TABLE public.wine_club_tiers
  ADD COLUMN IF NOT EXISTS vinoshipper_join_url text,
  ADD COLUMN IF NOT EXISTS vinoshipper_last_synced_at timestamptz;