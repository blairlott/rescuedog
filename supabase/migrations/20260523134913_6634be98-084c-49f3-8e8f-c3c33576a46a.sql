DROP INDEX IF EXISTS public.lindy_inbox_source_external_id_key;
CREATE UNIQUE INDEX lindy_inbox_source_external_id_key
ON public.lindy_inbox (source, external_id);