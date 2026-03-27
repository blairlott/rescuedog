
-- Junction table for multiple favorite rescues (up to 5)
CREATE TABLE public.customer_favorite_rescues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  rescue_partner_id uuid NOT NULL REFERENCES public.rescue_partners(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, rescue_partner_id)
);

ALTER TABLE public.customer_favorite_rescues ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own favorite rescues"
  ON public.customer_favorite_rescues FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own favorite rescues"
  ON public.customer_favorite_rescues FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own favorite rescues"
  ON public.customer_favorite_rescues FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Trigger to enforce max 5 favorites per user
CREATE OR REPLACE FUNCTION public.check_max_favorite_rescues()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF (SELECT count(*) FROM public.customer_favorite_rescues WHERE user_id = NEW.user_id) >= 5 THEN
    RAISE EXCEPTION 'Maximum of 5 favorite rescues allowed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_max_favorite_rescues
  BEFORE INSERT ON public.customer_favorite_rescues
  FOR EACH ROW
  EXECUTE FUNCTION public.check_max_favorite_rescues();
