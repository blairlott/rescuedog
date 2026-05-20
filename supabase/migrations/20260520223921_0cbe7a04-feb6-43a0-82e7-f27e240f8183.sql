
ALTER TABLE public.wine_club_memberships
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_source TEXT;
