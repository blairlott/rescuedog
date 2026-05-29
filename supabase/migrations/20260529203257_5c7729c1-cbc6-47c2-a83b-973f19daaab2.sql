-- RPC: approve a single drift row atomically.
-- Casts new_value (jsonb) to the appropriate wine_products column type,
-- updates the product, locks the field in cms_overrides, then marks the
-- pending row resolved. Admin-only.
CREATE OR REPLACE FUNCTION public.approve_wine_drift(_pending_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  uid uuid := auth.uid();
  sql text;
BEGIN
  IF NOT public.has_role(uid, 'admin') AND NOT public.has_role(uid, 'owner') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO r FROM public.wine_products_pending
    WHERE id = _pending_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pending row not found or already resolved'; END IF;

  -- Allow-list of syncable fields, mirrors SYNC_FIELDS in shared lib.
  IF r.field NOT IN ('title','description','image_url','price_cents','in_stock','vinoshipper_sku') THEN
    RAISE EXCEPTION 'field % not approvable', r.field;
  END IF;

  -- Cast jsonb new_value to the right type per column.
  IF r.field IN ('title','description','image_url','vinoshipper_sku') THEN
    sql := format('UPDATE public.wine_products SET %I = $1 WHERE id = $2', r.field);
    EXECUTE sql USING (r.new_value #>> '{}'), r.wine_product_id;
  ELSIF r.field = 'price_cents' THEN
    EXECUTE 'UPDATE public.wine_products SET price_cents = $1 WHERE id = $2'
      USING (r.new_value #>> '{}')::int, r.wine_product_id;
  ELSIF r.field = 'in_stock' THEN
    EXECUTE 'UPDATE public.wine_products SET in_stock = $1 WHERE id = $2'
      USING (r.new_value #>> '{}')::boolean, r.wine_product_id;
  END IF;

  UPDATE public.wine_products
    SET cms_overrides = coalesce(cms_overrides, '{}'::jsonb)
      || jsonb_build_object(r.field, jsonb_build_object(
            'value', r.new_value,
            'locked_at', now(),
            'source', 'admin-approve-' || uid::text))
    WHERE id = r.wine_product_id;

  UPDATE public.wine_products_pending
    SET status='approved', resolved_at=now(), resolved_by=uid
    WHERE id = _pending_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_wine_drift(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_wine_drift(uuid) TO authenticated;

-- RPC: reject (no product mutation)
CREATE OR REPLACE FUNCTION public.reject_wine_drift(_pending_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NOT public.has_role(uid, 'admin') AND NOT public.has_role(uid, 'owner') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  UPDATE public.wine_products_pending
    SET status='rejected', resolved_at=now(), resolved_by=uid
    WHERE id = _pending_id AND status='pending';
END;
$$;

REVOKE ALL ON FUNCTION public.reject_wine_drift(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reject_wine_drift(uuid) TO authenticated;