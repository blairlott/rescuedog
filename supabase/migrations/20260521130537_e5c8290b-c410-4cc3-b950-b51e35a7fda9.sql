CREATE TABLE public.gtm_deploy_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  tag_id text,
  action text NOT NULL,
  status text NOT NULL,
  version_id text,
  error text,
  response jsonb
);

ALTER TABLE public.gtm_deploy_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Ad ops can view gtm deploy log"
ON public.gtm_deploy_log FOR SELECT
TO authenticated
USING (public.is_ad_ops(auth.uid()));
