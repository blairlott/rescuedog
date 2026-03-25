CREATE TABLE public.wholesale_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now() NOT NULL,
  name text NOT NULL,
  business text NOT NULL,
  email text NOT NULL,
  phone text,
  region text NOT NULL,
  message text NOT NULL
);

ALTER TABLE public.wholesale_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit wholesale inquiry"
  ON public.wholesale_inquiries
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);