-- Audit log for VS club curation actions (dry-run + live).
CREATE TABLE IF NOT EXISTS public.vinoshipper_club_curation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id text NOT NULL,
  items jsonb NOT NULL,
  note text,
  executed boolean NOT NULL DEFAULT false,
  actor_user_id uuid,
  vs_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vinoshipper_club_curation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Wine club managers view curation log"
ON public.vinoshipper_club_curation_log
FOR SELECT TO authenticated
USING (public.is_wine_club_manager(auth.uid()));

CREATE POLICY "Wine club managers insert curation log"
ON public.vinoshipper_club_curation_log
FOR INSERT TO authenticated
WITH CHECK (public.is_wine_club_manager(auth.uid()));

-- Seed feature flag in OFF state.
INSERT INTO public.feature_flags (key, enabled, description)
VALUES ('vs_club_curation_enabled', false,
  'Master switch for Vinoshipper wine club curation flows (next-shipment edits, skip, pause). When off, curation functions log payloads but do not call Vinoshipper.')
ON CONFLICT (key) DO NOTHING;