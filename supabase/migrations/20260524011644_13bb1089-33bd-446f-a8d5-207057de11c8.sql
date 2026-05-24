
CREATE TABLE public.slack_digest_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  item_count integer NOT NULL DEFAULT 0,
  posted boolean NOT NULL DEFAULT false,
  skipped boolean NOT NULL DEFAULT false,
  escalated boolean NOT NULL DEFAULT false,
  forced boolean NOT NULL DEFAULT false,
  reason text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_slack_digest_log_ran_at ON public.slack_digest_log (ran_at DESC);

ALTER TABLE public.slack_digest_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and ad-ops can view slack digest log"
ON public.slack_digest_log
FOR SELECT
TO authenticated
USING (public.is_admin_or_owner(auth.uid()) OR public.is_ad_ops(auth.uid()));
