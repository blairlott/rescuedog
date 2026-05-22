
CREATE TABLE IF NOT EXISTS public.qbo_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  realm_id text NOT NULL UNIQUE,
  company_name text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  access_token_expires_at timestamptz NOT NULL,
  refresh_token_expires_at timestamptz,
  environment text NOT NULL DEFAULT 'production',
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_refreshed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.qbo_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance leadership can view QBO connections"
ON public.qbo_connections FOR SELECT TO authenticated
USING (public.is_admin_or_owner(auth.uid()) OR public.is_cfo(auth.uid()));

CREATE POLICY "Admins can manage QBO connections"
ON public.qbo_connections FOR ALL TO authenticated
USING (public.is_admin_or_owner(auth.uid()))
WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER qbo_connections_updated_at
BEFORE UPDATE ON public.qbo_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.qbo_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);

ALTER TABLE public.qbo_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view oauth states"
ON public.qbo_oauth_states FOR SELECT TO authenticated
USING (public.is_admin_or_owner(auth.uid()));
