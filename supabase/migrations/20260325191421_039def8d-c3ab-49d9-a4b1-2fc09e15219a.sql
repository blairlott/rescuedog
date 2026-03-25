-- Create storage bucket for donation documents
INSERT INTO storage.buckets (id, name, public) VALUES ('donation-documents', 'donation-documents', false);

-- Allow anyone to upload donation documents (no auth required for public form)
CREATE POLICY "Anyone can upload donation documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'donation-documents');

-- Public read for donation documents
CREATE POLICY "Public read for donation documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'donation-documents');

-- Create donation_requests table to store submissions
CREATE TABLE public.donation_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_name TEXT NOT NULL,
  is_nonprofit TEXT,
  services TEXT[],
  mailing_street TEXT,
  mailing_city TEXT,
  mailing_state TEXT,
  mailing_zip TEXT,
  ein TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  telephone TEXT NOT NULL,
  email TEXT NOT NULL,
  is_virtual TEXT,
  venue_name TEXT,
  venue_street TEXT,
  venue_city TEXT,
  venue_state TEXT,
  venue_zip TEXT,
  event_name TEXT NOT NULL,
  event_description TEXT NOT NULL,
  event_date TEXT,
  event_url TEXT,
  how_heard TEXT,
  who_know TEXT,
  partnered_before TEXT,
  participated_before TEXT,
  num_attendees TEXT,
  other_beverages TEXT,
  sponsor_benefits TEXT NOT NULL,
  how_intend_to_use TEXT,
  affiliate_interest TEXT,
  irs_letter_path TEXT,
  sponsorship_file_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.donation_requests ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (public form)
CREATE POLICY "Anyone can submit donation requests"
ON public.donation_requests FOR INSERT
WITH CHECK (true);