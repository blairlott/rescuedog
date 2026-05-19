
CREATE TABLE IF NOT EXISTS public.winback_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  tier text NOT NULL,
  channel text NOT NULL,
  member_count integer NOT NULL DEFAULT 0,
  reactivations_since_last integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS winback_snapshots_date_idx ON public.winback_snapshots (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS winback_snapshots_tier_channel_idx ON public.winback_snapshots (tier, channel, snapshot_date DESC);

ALTER TABLE public.winback_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "winback_snapshots_select" ON public.winback_snapshots
  FOR SELECT TO authenticated
  USING (public.can_view_kennel(auth.uid()));
CREATE POLICY "winback_snapshots_service_write" ON public.winback_snapshots
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.winback_campaign_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier text NOT NULL,
  channel text NOT NULL,
  last_recommended_at timestamptz,
  last_launched_at timestamptz,
  last_member_count integer,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tier, channel)
);
ALTER TABLE public.winback_campaign_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "winback_state_select" ON public.winback_campaign_state
  FOR SELECT TO authenticated
  USING (public.can_view_kennel(auth.uid()));
CREATE POLICY "winback_state_service_write" ON public.winback_campaign_state
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
