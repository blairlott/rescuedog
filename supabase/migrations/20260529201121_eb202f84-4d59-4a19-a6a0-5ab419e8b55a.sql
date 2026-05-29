
-- ============================================================
-- PART 1 — wine_products.cms_overrides + wine_products_pending
-- ============================================================

ALTER TABLE public.wine_products
  ADD COLUMN IF NOT EXISTS cms_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE public.wine_products_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wine_product_id uuid NOT NULL REFERENCES public.wine_products(id) ON DELETE CASCADE,
  vinoshipper_product_id text,
  field text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  status text NOT NULL DEFAULT 'pending',
  source text NOT NULL DEFAULT 'vinoshipper-sync-catalog',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wine_products_pending_status_chk
    CHECK (status IN ('pending','approved','rejected','superseded'))
);

CREATE INDEX idx_wine_products_pending_product
  ON public.wine_products_pending (wine_product_id);
CREATE INDEX idx_wine_products_pending_status
  ON public.wine_products_pending (status, created_at DESC);
CREATE UNIQUE INDEX idx_wine_products_pending_unique_open
  ON public.wine_products_pending (wine_product_id, field)
  WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wine_products_pending TO authenticated;
GRANT ALL ON public.wine_products_pending TO service_role;

ALTER TABLE public.wine_products_pending ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage pending wine changes"
  ON public.wine_products_pending
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_owner(auth.uid()))
  WITH CHECK (public.is_admin_or_owner(auth.uid()));

CREATE TRIGGER trg_wine_products_pending_updated_at
  BEFORE UPDATE ON public.wine_products_pending
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- PART 2 — notify_edge_function helper + insert triggers
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_edge_function(_fn text, _payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  _secret text;
  _base   text := 'https://eskqaxmypgvwtsffcbsw.supabase.co/functions/v1/';
  _req_id bigint;
BEGIN
  SELECT decrypted_secret INTO _secret
    FROM vault.decrypted_secrets
   WHERE name = 'CRON_SECRET'
   LIMIT 1;

  IF _secret IS NULL OR length(_secret) = 0 THEN
    RAISE WARNING 'notify_edge_function: CRON_SECRET not found in vault; skipping call to %', _fn;
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := _base || _fn,
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-cron-secret',  _secret
    ),
    body    := COALESCE(_payload, '{}'::jsonb)
  ) INTO _req_id;

  RETURN _req_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_edge_function(%): %', _fn, SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_edge_function(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_edge_function(text, jsonb) TO service_role;

-- Wholesale insert trigger ------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_notify_wholesale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_edge_function(
    'send-wholesale-notification',
    jsonb_build_object('inquiryId', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_wholesale_ai ON public.wholesale_inquiries;
CREATE TRIGGER trg_notify_wholesale_ai
  AFTER INSERT ON public.wholesale_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_wholesale();

-- Donation insert trigger -------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_notify_donation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_edge_function(
    'send-donation-notification',
    jsonb_build_object('donationRequestId', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_donation_ai ON public.donation_requests;
CREATE TRIGGER trg_notify_donation_ai
  AFTER INSERT ON public.donation_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_donation();
