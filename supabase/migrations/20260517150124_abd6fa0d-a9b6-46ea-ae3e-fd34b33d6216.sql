ALTER TABLE public.ad_recommendations
  ADD COLUMN IF NOT EXISTS rejection_reason text;