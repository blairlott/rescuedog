CREATE TABLE public.feature_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  area TEXT,
  request TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can submit feature requests"
ON public.feature_requests FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own feature requests"
ON public.feature_requests FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all feature requests"
ON public.feature_requests FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Admins can update feature requests"
ON public.feature_requests FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Admins can delete feature requests"
ON public.feature_requests FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER update_feature_requests_updated_at
BEFORE UPDATE ON public.feature_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_feature_requests_status_created ON public.feature_requests(status, created_at DESC);