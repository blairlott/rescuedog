ALTER TABLE public.creative_seed_assets
  ADD COLUMN IF NOT EXISTS parent_seed_id UUID REFERENCES public.creative_seed_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refined BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refine_prompt TEXT;
