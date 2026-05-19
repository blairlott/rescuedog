CREATE TABLE public.integration_credential_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('insert','update','delete')),
  provider text NOT NULL,
  credential_key text NOT NULL,
  scope text NOT NULL,
  credential_id uuid,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_integration_credential_events_provider
  ON public.integration_credential_events(provider, occurred_at DESC);
CREATE INDEX idx_integration_credential_events_actor
  ON public.integration_credential_events(actor_id, occurred_at DESC);

ALTER TABLE public.integration_credential_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read credential audit log"
  ON public.integration_credential_events FOR SELECT
  USING (public.is_admin_or_owner(auth.uid()));

-- No direct INSERT/UPDATE/DELETE policies. Writes happen only via the trigger
-- below, which runs as SECURITY DEFINER (table owner).

CREATE OR REPLACE FUNCTION public.log_integration_credential_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _email text;
  _evt text;
  _row public.integration_credentials;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _evt := 'delete';
    _row := OLD;
  ELSIF TG_OP = 'INSERT' THEN
    _evt := 'insert';
    _row := NEW;
  ELSE
    _evt := 'update';
    _row := NEW;
  END IF;

  IF _actor IS NOT NULL THEN
    SELECT email INTO _email FROM auth.users WHERE id = _actor;
  END IF;

  INSERT INTO public.integration_credential_events
    (event_type, provider, credential_key, scope, credential_id, actor_id, actor_email, notes)
  VALUES
    (_evt, _row.provider, _row.credential_key, _row.scope, _row.id, _actor, _email, _row.notes);

  RETURN _row;
END;
$$;

CREATE TRIGGER trg_integration_credentials_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.integration_credentials
  FOR EACH ROW EXECUTE FUNCTION public.log_integration_credential_change();