-- 1. Raw event stream from the client tracker
CREATE TABLE IF NOT EXISTS public.site_intel_events (
  id           BIGSERIAL PRIMARY KEY,
  visitor_id   TEXT NOT NULL,
  session_id   TEXT,
  user_id      UUID,
  event_type   TEXT NOT NULL CHECK (event_type IN (
    'click','mousemove','scroll','rage_click','section_view','page_attention','exposure','conversion'
  )),
  path         TEXT NOT NULL,
  selector     TEXT,
  section_key  TEXT,
  x_pct        REAL,
  y_pct        REAL,
  vw           INTEGER,
  vh           INTEGER,
  scroll_pct   REAL,
  dwell_ms     INTEGER,
  device       TEXT,
  referrer     TEXT,
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_intel_events_path_type_idx
  ON public.site_intel_events (path, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS site_intel_events_visitor_idx
  ON public.site_intel_events (visitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS site_intel_events_section_idx
  ON public.site_intel_events (section_key, event_type) WHERE section_key IS NOT NULL;

ALTER TABLE public.site_intel_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_intel insert anon" ON public.site_intel_events;
CREATE POLICY "site_intel insert anon" ON public.site_intel_events
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "site_intel select admin" ON public.site_intel_events;
CREATE POLICY "site_intel select admin" ON public.site_intel_events
  FOR SELECT TO authenticated
  USING (public.is_admin_or_owner(auth.uid()) OR public.is_backend_viewer(auth.uid()) OR public.is_cms_editor(auth.uid()));

-- 2. Autopilot decisions log
CREATE TABLE IF NOT EXISTS public.site_intel_decisions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  decision_type TEXT NOT NULL,
  surface       TEXT NOT NULL,
  rationale     TEXT NOT NULL,
  evidence      JSONB NOT NULL DEFAULT '{}'::jsonb,
  before_state  JSONB,
  after_state   JSONB,
  status        TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied','pending','reverted','rejected')),
  applied_by    TEXT NOT NULL DEFAULT 'autopilot',
  reverted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_intel_decisions_run_idx
  ON public.site_intel_decisions (run_at DESC);

ALTER TABLE public.site_intel_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "decisions select admin" ON public.site_intel_decisions;
CREATE POLICY "decisions select admin" ON public.site_intel_decisions
  FOR SELECT TO authenticated
  USING (public.is_admin_or_owner(auth.uid()) OR public.is_backend_viewer(auth.uid()) OR public.is_cms_editor(auth.uid()));

DROP POLICY IF EXISTS "decisions manage cms" ON public.site_intel_decisions;
CREATE POLICY "decisions manage cms" ON public.site_intel_decisions
  FOR ALL TO authenticated
  USING (public.is_cms_editor(auth.uid()))
  WITH CHECK (public.is_cms_editor(auth.uid()));

-- 3. Extend existing personalization_rules with source tag
ALTER TABLE public.personalization_rules
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

-- 4. Personalization segment cache per visitor
CREATE TABLE IF NOT EXISTS public.personalization_segments (
  visitor_id   TEXT PRIMARY KEY,
  user_id      UUID,
  segment      JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  visit_count  INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE public.personalization_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "segments anyone upsert" ON public.personalization_segments;
CREATE POLICY "segments anyone upsert" ON public.personalization_segments
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "segments anyone update" ON public.personalization_segments;
CREATE POLICY "segments anyone update" ON public.personalization_segments
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "segments admin read" ON public.personalization_segments;
CREATE POLICY "segments admin read" ON public.personalization_segments
  FOR SELECT TO authenticated
  USING (public.is_admin_or_owner(auth.uid()) OR public.is_backend_viewer(auth.uid()) OR public.is_cms_editor(auth.uid()));

-- 5. Aggregator: bucketed click heatmap per page
CREATE OR REPLACE FUNCTION public.site_intel_heatmap(
  _path TEXT,
  _event_type TEXT DEFAULT 'click',
  _since TIMESTAMPTZ DEFAULT (now() - interval '30 days'),
  _grid INTEGER DEFAULT 40
)
RETURNS TABLE(x_bucket INTEGER, y_bucket INTEGER, hits BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    LEAST(_grid - 1, GREATEST(0, FLOOR(x_pct * _grid)::int)) AS x_bucket,
    LEAST(_grid - 1, GREATEST(0, FLOOR(y_pct * _grid)::int)) AS y_bucket,
    COUNT(*)::BIGINT AS hits
  FROM public.site_intel_events
  WHERE path = _path
    AND event_type = _event_type
    AND created_at >= _since
    AND x_pct IS NOT NULL AND y_pct IS NOT NULL
    AND (public.is_admin_or_owner(auth.uid()) OR public.is_backend_viewer(auth.uid()) OR public.is_cms_editor(auth.uid()))
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

-- 6. Section engagement summary
CREATE OR REPLACE FUNCTION public.site_intel_section_summary(
  _path TEXT DEFAULT NULL,
  _since TIMESTAMPTZ DEFAULT (now() - interval '14 days')
)
RETURNS TABLE(
  section_key TEXT,
  path TEXT,
  views BIGINT,
  avg_dwell_ms NUMERIC,
  rage_clicks BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    COALESCE(s.section_key, '(no section)') AS section_key,
    s.path,
    COUNT(*) FILTER (WHERE s.event_type = 'section_view')::BIGINT AS views,
    AVG(s.dwell_ms) FILTER (WHERE s.event_type = 'page_attention')::NUMERIC AS avg_dwell_ms,
    COUNT(*) FILTER (WHERE s.event_type = 'rage_click')::BIGINT AS rage_clicks
  FROM public.site_intel_events s
  WHERE s.created_at >= _since
    AND (_path IS NULL OR s.path = _path)
    AND (public.is_admin_or_owner(auth.uid()) OR public.is_backend_viewer(auth.uid()) OR public.is_cms_editor(auth.uid()))
  GROUP BY s.section_key, s.path
  ORDER BY views DESC NULLS LAST;
$$;