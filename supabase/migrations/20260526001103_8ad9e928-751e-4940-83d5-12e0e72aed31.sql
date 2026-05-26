
CREATE TABLE IF NOT EXISTS public.hero_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('impression','click','order')),
  session_id text,
  shopify_order_id text,
  order_value numeric,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hero_events_variant ON public.hero_events(variant_id);
CREATE INDEX IF NOT EXISTS idx_hero_events_type ON public.hero_events(event_type);
CREATE INDEX IF NOT EXISTS idx_hero_events_created ON public.hero_events(created_at DESC);

ALTER TABLE public.hero_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can log hero events"
  ON public.hero_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (event_type IN ('impression','click'));

CREATE POLICY "Admins can read hero events"
  ON public.hero_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.attribute_hero_order(
  _variant_id text,
  _shopify_order_id text,
  _order_value numeric,
  _session_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.hero_events (variant_id, event_type, session_id, shopify_order_id, order_value)
  VALUES (_variant_id, 'order', _session_id, _shopify_order_id, _order_value)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;
