
ALTER TABLE public.lindy_inbox
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS thread_ts text,
  ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lindy_inbox_source_external
  ON public.lindy_inbox (source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lindy_inbox_source_thread
  ON public.lindy_inbox (source, thread_ts)
  WHERE thread_ts IS NOT NULL;
