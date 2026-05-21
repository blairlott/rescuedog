-- =====================================================
-- Z8 nightly optimizer tables
-- =====================================================

-- Kill switch (single row, id = 1)
CREATE TABLE IF NOT EXISTS public.z8_kill_switch (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  paused_at TIMESTAMPTZ,
  paused_by UUID REFERENCES auth.users(id),
  paused_reason TEXT,
  resumed_at TIMESTAMPTZ,
  resumed_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT z8_kill_switch_singleton CHECK (id = 1)
);
INSERT INTO public.z8_kill_switch (id, enabled) VALUES (1, TRUE) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.z8_kill_switch ENABLE ROW LEVEL SECURITY;

CREATE POLICY "z8_kill_switch read" ON public.z8_kill_switch FOR SELECT
  USING (public.can_view_kennel(auth.uid()));
CREATE POLICY "z8_kill_switch update" ON public.z8_kill_switch FOR UPDATE
  USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));

-- Ad reserves (optional manual override for rotation order)
CREATE TABLE IF NOT EXISTS public.ad_reserves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL DEFAULT 'meta',
  adset_id TEXT NOT NULL,
  ad_id TEXT NOT NULL,
  ad_name TEXT,
  rotation_order INTEGER NOT NULL DEFAULT 0,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, adset_id, ad_id)
);
CREATE INDEX IF NOT EXISTS ad_reserves_lookup ON public.ad_reserves (platform, adset_id, used_at, rotation_order);

ALTER TABLE public.ad_reserves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ad_reserves read" ON public.ad_reserves FOR SELECT
  USING (public.can_view_kennel(auth.uid()));
CREATE POLICY "ad_reserves write" ON public.ad_reserves FOR ALL
  USING (public.is_ad_ops(auth.uid())) WITH CHECK (public.is_ad_ops(auth.uid()));

-- Z8 runs (per-night summary)
CREATE TABLE IF NOT EXISTS public.z8_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  kill_switch_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  kills_executed INTEGER NOT NULL DEFAULT 0,
  scales_executed INTEGER NOT NULL DEFAULT 0,
  rotations_executed INTEGER NOT NULL DEFAULT 0,
  rollbacks_executed INTEGER NOT NULL DEFAULT 0,
  checkout_dropoffs_flagged INTEGER NOT NULL DEFAULT 0,
  retargeting_kills_executed INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  daily_budget_freed_cents INTEGER NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS z8_runs_started_idx ON public.z8_runs (started_at DESC);

ALTER TABLE public.z8_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "z8_runs read" ON public.z8_runs FOR SELECT
  USING (public.can_view_kennel(auth.uid()));

-- Vinoshipper handoff probe results (for EV26-D and future ad URL checks)
CREATE TABLE IF NOT EXISTS public.z8_handoff_probes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.z8_runs(id) ON DELETE SET NULL,
  ad_id TEXT,
  ad_name TEXT,
  landing_url TEXT,
  final_url TEXT,
  reached_vinoshipper BOOLEAN,
  mobile_status INTEGER,
  desktop_status INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.z8_handoff_probes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "z8_handoff_probes read" ON public.z8_handoff_probes FOR SELECT
  USING (public.can_view_kennel(auth.uid()));

-- Helpful indexes on ad_execution_log for Z8 lookups
CREATE INDEX IF NOT EXISTS ad_execution_log_z8_idx
  ON public.ad_execution_log (executor, action, created_at DESC)
  WHERE executor = 'z8_auto';
CREATE INDEX IF NOT EXISTS ad_execution_log_platform_action_created_idx
  ON public.ad_execution_log (platform, action, created_at DESC);