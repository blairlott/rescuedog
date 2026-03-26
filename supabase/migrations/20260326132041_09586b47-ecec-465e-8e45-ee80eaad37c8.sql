
-- Create cms_content table for editable page content
CREATE TABLE IF NOT EXISTS public.cms_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page text NOT NULL,
  section_key text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(page, section_key)
);

ALTER TABLE public.cms_content ENABLE ROW LEVEL SECURITY;

-- Anyone can read CMS content (public pages)
CREATE POLICY "Anyone can view cms content"
ON public.cms_content FOR SELECT
TO anon, authenticated
USING (true);

-- Create a function to check if user is a CMS editor or admin
-- Use text cast to avoid enum commitment issue
CREATE OR REPLACE FUNCTION public.is_cms_editor(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text IN ('cms_editor', 'owner', 'admin')
  )
$$;

-- CMS editors, admins, owners can insert
CREATE POLICY "CMS editors can insert content"
ON public.cms_content FOR INSERT
TO authenticated
WITH CHECK (public.is_cms_editor(auth.uid()));

-- CMS editors, admins, owners can update
CREATE POLICY "CMS editors can update content"
ON public.cms_content FOR UPDATE
TO authenticated
USING (public.is_cms_editor(auth.uid()));

-- CMS editors, admins, owners can delete
CREATE POLICY "CMS editors can delete content"
ON public.cms_content FOR DELETE
TO authenticated
USING (public.is_cms_editor(auth.uid()));
