ALTER TABLE public.cfo_boards
  ADD COLUMN IF NOT EXISTS bob_tile_notes jsonb NOT NULL DEFAULT '{}'::jsonb;