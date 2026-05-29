CREATE OR REPLACE FUNCTION public.reject_wine_drift(_pending_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  uid uuid := auth.uid();
BEGIN
  IF NOT public.has_role(uid, 'admin') AND NOT public.has_role(uid, 'owner') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO r FROM public.wine_products_pending
    WHERE id = _pending_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pending row not found or already resolved'; END IF;

  -- Reject = acknowledge VS state without curating it into wine_products.
  -- Update the lock's .value to the VS value the admin just reviewed so
  -- sync-catalog stops re-creating a pending row for the same drift.
  UPDATE public.wine_products
    SET cms_overrides = jsonb_set(
      coalesce(cms_overrides, '{}'::jsonb),
      ARRAY[r.field, 'value'],
      r.new_value
    )
    WHERE id = r.wine_product_id;

  UPDATE public.wine_products_pending
    SET status='rejected', resolved_at=now(), resolved_by=uid
    WHERE id = _pending_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_wine_drift(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reject_wine_drift(uuid) TO authenticated;