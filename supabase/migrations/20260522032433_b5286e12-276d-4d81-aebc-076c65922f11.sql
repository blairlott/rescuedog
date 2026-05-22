ALTER TABLE public.ad_execution_log
  ADD COLUMN IF NOT EXISTS target_level text,
  ADD COLUMN IF NOT EXISTS target_id text;

CREATE INDEX IF NOT EXISTS ad_execution_log_target_idx
  ON public.ad_execution_log (target_level, target_id, created_at DESC);