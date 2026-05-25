-- Restructure Decisions
CREATE TABLE IF NOT EXISTS public.restructure_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('ab_variant','layout_swap','commerce_flow','catalog_ia')),
  title text NOT NULL,
  summary text NOT NULL,
  rationale text,
  risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high')),
  source text NOT NULL DEFAULT 'system' CHECK (source IN ('ui','bandit','behavior_analyzer','lindy','manual')),
  target_kind text NOT NULL,            -- e.g. 'experiment_promote', 'app_setting', 'feature_flag', 'layout_swap'
  target_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','executed','failed','expired')),
  proposed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decision_notes text,
  decided_at timestamptz,
  executed_at timestamptz,
  execution_result jsonb,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_restructure_proposals_status ON public.restructure_proposals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_restructure_proposals_category ON public.restructure_proposals(category);

ALTER TABLE public.restructure_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins view restructure proposals"
  ON public.restructure_proposals FOR SELECT
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "admins update restructure proposals"
  ON public.restructure_proposals FOR UPDATE
  USING (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER trg_restructure_proposals_updated
  BEFORE UPDATE ON public.restructure_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Propose RPC (callable by admin or service role)
CREATE OR REPLACE FUNCTION public.propose_restructure(
  _category text, _title text, _summary text, _target_kind text,
  _target_payload jsonb DEFAULT '{}'::jsonb,
  _rationale text DEFAULT NULL,
  _risk_level text DEFAULT 'medium',
  _source text DEFAULT 'system'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  INSERT INTO public.restructure_proposals
    (category, title, summary, rationale, risk_level, source, target_kind, target_payload, proposed_by)
  VALUES
    (_category, _title, _summary, _rationale, _risk_level, _source, _target_kind, COALESCE(_target_payload,'{}'::jsonb), auth.uid())
  RETURNING id INTO _id;
  RETURN _id;
END $$;

-- Decide RPC (admin only)
CREATE OR REPLACE FUNCTION public.decide_restructure(
  _id uuid, _action text, _notes text DEFAULT NULL
) RETURNS public.restructure_proposals
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _rec public.restructure_proposals;
BEGIN
  IF NOT public.is_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied: owner/admin only';
  END IF;
  IF _action NOT IN ('approve','reject') THEN
    RAISE EXCEPTION 'invalid action';
  END IF;

  SELECT * INTO _rec FROM public.restructure_proposals WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'proposal not found'; END IF;
  IF _rec.status <> 'pending' THEN RAISE EXCEPTION 'not pending (status=%)', _rec.status; END IF;
  IF _rec.expires_at < now() THEN
    UPDATE public.restructure_proposals SET status='expired', updated_at=now() WHERE id=_id;
    RAISE EXCEPTION 'proposal expired';
  END IF;

  UPDATE public.restructure_proposals
     SET status = CASE _action WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
         decided_by = auth.uid(),
         decided_at = now(),
         decision_notes = _notes,
         updated_at = now()
   WHERE id = _id
  RETURNING * INTO _rec;
  RETURN _rec;
END $$;

CREATE OR REPLACE FUNCTION public.mark_restructure_executed(
  _id uuid, _success boolean, _result jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin_or_owner(auth.uid()) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;
  UPDATE public.restructure_proposals
     SET status = CASE WHEN _success THEN 'executed' ELSE 'failed' END,
         executed_at = now(),
         execution_result = COALESCE(_result,'{}'::jsonb),
         updated_at = now()
   WHERE id = _id;
END $$;

-- Real-time notify trigger -> calls restructure-notify edge function via pg_net
CREATE OR REPLACE FUNCTION public.notify_restructure_proposal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _url text; _key text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO _key FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _key := NULL; END;
  _url := 'https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/restructure-notify';
  PERFORM net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization', 'Bearer ' || COALESCE(_key,'')
    ),
    body := jsonb_build_object('mode','immediate','proposal_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_restructure_proposal ON public.restructure_proposals;
CREATE TRIGGER trg_notify_restructure_proposal
  AFTER INSERT ON public.restructure_proposals
  FOR EACH ROW WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.notify_restructure_proposal();