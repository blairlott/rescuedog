
-- Helper function for brand ambassador role
CREATE OR REPLACE FUNCTION public.is_brand_ambassador(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'brand_ambassador'
  )
$$;

-- ambassador_profiles
CREATE TABLE public.ambassador_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  handle text NOT NULL UNIQUE,
  display_name text NOT NULL,
  bio text,
  photo_url text,
  rescue_partner_id uuid REFERENCES public.rescue_partners(id) ON DELETE SET NULL,
  instagram text,
  tiktok text,
  website text,
  impact_tracking_url text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ambassador_profiles_handle ON public.ambassador_profiles(handle);
CREATE INDEX idx_ambassador_profiles_status ON public.ambassador_profiles(status);

ALTER TABLE public.ambassador_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active ambassador profiles"
  ON public.ambassador_profiles FOR SELECT
  USING (status = 'active');

CREATE POLICY "Ambassadors can view own profile"
  ON public.ambassador_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Ambassadors can insert own profile"
  ON public.ambassador_profiles FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Ambassadors can update own profile"
  ON public.ambassador_profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND status IN ('pending','active','paused'));

CREATE POLICY "Admins manage ambassador profiles"
  ON public.ambassador_profiles FOR ALL
  TO authenticated
  USING (is_admin_or_owner(auth.uid()))
  WITH CHECK (is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_ambassador_profiles_updated_at
  BEFORE UPDATE ON public.ambassador_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ambassador_events
CREATE TABLE public.ambassador_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  venue_name text,
  street_address text,
  city text,
  state text,
  zip text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  cover_image_url text,
  max_attendees integer,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ambassador_events_host ON public.ambassador_events(host_user_id);
CREATE INDEX idx_ambassador_events_status_starts ON public.ambassador_events(status, starts_at);

ALTER TABLE public.ambassador_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view published events"
  ON public.ambassador_events FOR SELECT
  USING (status = 'published');

CREATE POLICY "Hosts manage own events"
  ON public.ambassador_events FOR ALL
  TO authenticated
  USING (host_user_id = auth.uid())
  WITH CHECK (host_user_id = auth.uid());

CREATE POLICY "Admins manage all events"
  ON public.ambassador_events FOR ALL
  TO authenticated
  USING (is_admin_or_owner(auth.uid()))
  WITH CHECK (is_admin_or_owner(auth.uid()));

CREATE TRIGGER update_ambassador_events_updated_at
  BEFORE UPDATE ON public.ambassador_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ambassador_event_rsvps
CREATE TABLE public.ambassador_event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.ambassador_events(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  party_size integer NOT NULL DEFAULT 1,
  attended boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ambassador_event_rsvps_event ON public.ambassador_event_rsvps(event_id);

ALTER TABLE public.ambassador_event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can RSVP"
  ON public.ambassador_event_rsvps FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Hosts view own event RSVPs"
  ON public.ambassador_event_rsvps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ambassador_events e
      WHERE e.id = ambassador_event_rsvps.event_id
        AND e.host_user_id = auth.uid()
    )
  );

CREATE POLICY "Hosts update own event RSVPs"
  ON public.ambassador_event_rsvps FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ambassador_events e
      WHERE e.id = ambassador_event_rsvps.event_id
        AND e.host_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins manage all RSVPs"
  ON public.ambassador_event_rsvps FOR ALL
  TO authenticated
  USING (is_admin_or_owner(auth.uid()))
  WITH CHECK (is_admin_or_owner(auth.uid()));
