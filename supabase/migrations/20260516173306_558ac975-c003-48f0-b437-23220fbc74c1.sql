ALTER TABLE public.media_assets DROP CONSTRAINT IF EXISTS media_assets_source_check;
ALTER TABLE public.media_assets ADD CONSTRAINT media_assets_source_check
  CHECK (source = ANY (ARRAY['legacy_site'::text, 'instagram'::text, 'upload'::text, 'shopify'::text, 'ai_enhanced'::text]));