
-- Recommendations
CREATE TABLE public.ad_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid REFERENCES public.ad_channels(id) ON DELETE SET NULL,
  kind text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  rationale text,
  projected_impact_cents integer NOT NULL DEFAULT 0,
  confidence numeric(4,3) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','executed','expired','rolled_back','failed')),
  source text NOT NULL DEFAULT 'lindy' CHECK (source IN ('lindy','native','manual')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  rollback_state jsonb,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  executed_at timestamptz,
  ingest_request_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ad_recommendations_status_idx
  ON public.ad_recommendations(status, created_at DESC);
CREATE INDEX ad_recommendations_priority_idx
  ON public.ad_recommendations((projected_impact_cents * confidence) DESC)
  WHERE status = 'pending';

ALTER TABLE public.ad_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kennel_recs_select"
  ON public.ad_recommendations FOR SELECT
  USING (public.is_ad_ops(auth.uid()));

CREATE POLICY "kennel_recs_service_write"
  ON public.ad_recommendations FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER ad_recommendations_updated_at
  BEFORE UPDATE ON public.ad_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Execution log
CREATE TABLE public.ad_execution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid REFERENCES public.ad_recommendations(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('approve','reject','execute','rollback','expire','modify')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_kind text NOT NULL DEFAULT 'user' CHECK (actor_kind IN ('user','system','lindy')),
  request_payload jsonb,
  response_payload jsonb,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ad_execution_log_rec_idx
  ON public.ad_execution_log(recommendation_id, created_at DESC);

ALTER TABLE public.ad_execution_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kennel_log_select"
  ON public.ad_execution_log FOR SELECT
  USING (public.is_ad_ops(auth.uid()));

CREATE POLICY "kennel_log_service_write"
  ON public.ad_execution_log FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Settings (key/value)
CREATE TABLE public.ad_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kennel_settings_select"
  ON public.ad_settings FOR SELECT
  USING (public.is_ad_ops(auth.uid()));

CREATE POLICY "kennel_settings_admin_write"
  ON public.ad_settings FOR ALL
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER ad_settings_updated_at
  BEFORE UPDATE ON public.ad_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ad_settings (key, value) VALUES
  ('kill_switch', 'false'::jsonb),
  ('ingestion_mode', '"lindy_primary"'::jsonb),
  ('confidence_floor', '0.6'::jsonb),
  ('daily_spend_cap_cents', '500000'::jsonb);

-- Review function (ad-ops/admin callable)
CREATE OR REPLACE FUNCTION public.kennel_review_recommendation(
  _rec_id uuid,
  _action text,
  _notes text DEFAULT NULL
) RETURNS public.ad_recommendations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _rec public.ad_recommendations;
BEGIN
  IF NOT public.is_ad_ops(_uid) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  IF _action NOT IN ('approve','reject') THEN
    RAISE EXCEPTION 'invalid action: %', _action;
  END IF;

  SELECT * INTO _rec FROM public.ad_recommendations WHERE id = _rec_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recommendation not found'; END IF;
  IF _rec.status <> 'pending' THEN
    RAISE EXCEPTION 'recommendation is not pending (status=%)', _rec.status;
  END IF;
  IF _rec.expires_at IS NOT NULL AND _rec.expires_at < now() THEN
    UPDATE public.ad_recommendations SET status = 'expired', updated_at = now() WHERE id = _rec_id;
    RAISE EXCEPTION 'recommendation expired';
  END IF;

  UPDATE public.ad_recommendations
     SET status = CASE WHEN _action = 'approve' THEN 'approved' ELSE 'rejected' END,
         reviewed_by = _uid,
         reviewed_at = now(),
         updated_at = now()
   WHERE id = _rec_id
  RETURNING * INTO _rec;

  INSERT INTO public.ad_execution_log
    (recommendation_id, action, actor_id, actor_kind, request_payload, success)
  VALUES
    (_rec_id, _action, _uid, 'user', jsonb_build_object('notes', _notes), true);

  RETURN _rec;
END;
$$;

-- Realtime
ALTER TABLE public.ad_recommendations REPLICA IDENTITY FULL;
ALTER TABLE public.ad_execution_log REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_recommendations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_execution_log;
