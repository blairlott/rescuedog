
-- Public bucket for blog/event/page imagery imported from WordPress
INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-media', 'blog-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read blog-media"
ON storage.objects FOR SELECT
USING (bucket_id = 'blog-media');

CREATE POLICY "CMS editors upload blog-media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'blog-media' AND (public.is_cms_editor(auth.uid()) OR public.is_admin_or_owner(auth.uid())));

CREATE POLICY "CMS editors update blog-media"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'blog-media' AND (public.is_cms_editor(auth.uid()) OR public.is_admin_or_owner(auth.uid())));

CREATE POLICY "CMS editors delete blog-media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'blog-media' AND (public.is_cms_editor(auth.uid()) OR public.is_admin_or_owner(auth.uid())));

-- 301 redirect map (preserve SEO when WordPress URLs change)
CREATE TABLE public.content_redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_path text NOT NULL UNIQUE,
  to_path text NOT NULL,
  status_code integer NOT NULL DEFAULT 301,
  source text NOT NULL DEFAULT 'wordpress_import',
  hits integer NOT NULL DEFAULT 0,
  last_hit_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_redirects_from ON public.content_redirects(from_path);

ALTER TABLE public.content_redirects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read redirects"
ON public.content_redirects FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "CMS editors manage redirects"
ON public.content_redirects FOR ALL TO authenticated
USING (public.is_cms_editor(auth.uid()) OR public.is_admin_or_owner(auth.uid()))
WITH CHECK (public.is_cms_editor(auth.uid()) OR public.is_admin_or_owner(auth.uid()));

-- Track import runs so admins can see history
CREATE TABLE public.wp_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url text NOT NULL,
  post_type text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','complete','failed')),
  imported_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_log text,
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.wp_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CMS editors view import runs"
ON public.wp_import_runs FOR SELECT TO authenticated
USING (public.is_cms_editor(auth.uid()) OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "CMS editors create import runs"
ON public.wp_import_runs FOR INSERT TO authenticated
WITH CHECK (public.is_cms_editor(auth.uid()) OR public.is_admin_or_owner(auth.uid()));

CREATE POLICY "CMS editors update import runs"
ON public.wp_import_runs FOR UPDATE TO authenticated
USING (public.is_cms_editor(auth.uid()) OR public.is_admin_or_owner(auth.uid()))
WITH CHECK (public.is_cms_editor(auth.uid()) OR public.is_admin_or_owner(auth.uid()));
