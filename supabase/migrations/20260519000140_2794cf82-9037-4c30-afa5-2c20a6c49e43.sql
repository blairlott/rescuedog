CREATE TABLE public.integration_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  credential_key text NOT NULL,
  credential_value text NOT NULL,
  scope text NOT NULL DEFAULT 'live',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, credential_key, scope)
);

CREATE INDEX idx_integration_credentials_provider ON public.integration_credentials(provider, scope);

ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view integration credentials"
  ON public.integration_credentials FOR SELECT
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can insert integration credentials"
  ON public.integration_credentials FOR INSERT
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can update integration credentials"
  ON public.integration_credentials FOR UPDATE
  USING (public.is_admin_or_owner(auth.uid()));

CREATE POLICY "Admins can delete integration credentials"
  ON public.integration_credentials FOR DELETE
  USING (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_integration_credentials_updated_at
  BEFORE UPDATE ON public.integration_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();