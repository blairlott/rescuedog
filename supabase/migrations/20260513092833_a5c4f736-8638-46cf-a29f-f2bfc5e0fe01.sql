
CREATE TABLE public.auto_translations (
  id BIGSERIAL PRIMARY KEY,
  source_hash TEXT NOT NULL,
  source_text TEXT NOT NULL,
  lang TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_hash, lang)
);

CREATE INDEX idx_auto_translations_lookup ON public.auto_translations(source_hash, lang);

ALTER TABLE public.auto_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read translations"
  ON public.auto_translations FOR SELECT
  USING (true);
