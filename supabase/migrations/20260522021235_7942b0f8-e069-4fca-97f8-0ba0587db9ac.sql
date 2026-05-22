CREATE TABLE IF NOT EXISTS public.vinoshipper_api_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  source_url text,
  spec_hash text NOT NULL,
  spec_json jsonb,
  probe_results jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vs_api_snapshots_fetched ON public.vinoshipper_api_snapshots (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_vs_api_snapshots_source_hash ON public.vinoshipper_api_snapshots (source, spec_hash);

ALTER TABLE public.vinoshipper_api_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view api snapshots"
ON public.vinoshipper_api_snapshots FOR SELECT TO authenticated
USING (public.is_admin_or_owner(auth.uid()));

CREATE TABLE IF NOT EXISTS public.vinoshipper_api_changelog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid REFERENCES public.vinoshipper_api_snapshots(id) ON DELETE SET NULL,
  change_type text NOT NULL, -- 'endpoint_added' | 'endpoint_removed' | 'endpoint_changed' | 'probe_flip' | 'spec_first_seen'
  endpoint_path text,
  endpoint_method text,
  summary text NOT NULL,
  details jsonb,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vs_api_changelog_created ON public.vinoshipper_api_changelog (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vs_api_changelog_unack ON public.vinoshipper_api_changelog (acknowledged_at) WHERE acknowledged_at IS NULL;

ALTER TABLE public.vinoshipper_api_changelog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view api changelog"
ON public.vinoshipper_api_changelog FOR SELECT TO authenticated
USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins update api changelog"
ON public.vinoshipper_api_changelog FOR UPDATE TO authenticated
USING (public.is_admin_or_owner(auth.uid()))
WITH CHECK (public.is_admin_or_owner(auth.uid()));

-- Seed feature flag OFF.
INSERT INTO public.feature_flags (key, enabled, description)
VALUES ('vs_api_watcher_enabled', false,
  'Daily Vinoshipper API change watcher. When off, watcher can be invoked manually but cron + email alerts are paused.')
ON CONFLICT (key) DO NOTHING;