
CREATE TABLE IF NOT EXISTS public.instacart_partnership_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  label text NOT NULL,
  description text,
  ask text,
  answer text,
  owner text,
  status text NOT NULL DEFAULT 'requested',
  follow_up_date date,
  value_estimate_cents bigint,
  external_url text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS instacart_partnership_items_category_idx
  ON public.instacart_partnership_items (category, sort_order);

ALTER TABLE public.instacart_partnership_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view partnership items"
  ON public.instacart_partnership_items FOR SELECT
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins insert partnership items"
  ON public.instacart_partnership_items FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update partnership items"
  ON public.instacart_partnership_items FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete partnership items"
  ON public.instacart_partnership_items FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_touch_instacart_partnership_items ON public.instacart_partnership_items;
CREATE TRIGGER trg_touch_instacart_partnership_items
  BEFORE UPDATE ON public.instacart_partnership_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
