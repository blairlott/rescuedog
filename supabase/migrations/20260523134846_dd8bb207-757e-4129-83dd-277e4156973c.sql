CREATE UNIQUE INDEX IF NOT EXISTS lindy_inbox_source_external_id_key
ON public.lindy_inbox (source, external_id)
WHERE source IS NOT NULL AND external_id IS NOT NULL;