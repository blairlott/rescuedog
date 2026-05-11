
CREATE OR REPLACE FUNCTION public.enforce_ambassador_impact_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND (NEW.impact_tracking_url IS NULL OR length(trim(NEW.impact_tracking_url)) = 0) THEN
    RAISE EXCEPTION 'Cannot activate ambassador profile without an impact.com tracking URL or code';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ambassador_impact_link ON public.ambassador_profiles;
CREATE TRIGGER trg_enforce_ambassador_impact_link
BEFORE INSERT OR UPDATE ON public.ambassador_profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_ambassador_impact_link();
