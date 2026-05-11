import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const ADMIN_RECIPIENTS = [
  'info@rescuedogwines.com',
  'blair.lott@rescuedogwines.com',
  'j.ritter@rescuedogwines.com',
  'jo@rescuedogwines.com',
  'lara.hill@rescuedogwines.com',
];

const SIGNED_URL_EXPIRES = 60 * 60 * 24 * 7; // 7 days

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { donationRequestId } = await req.json();
    if (!donationRequestId) {
      return new Response(JSON.stringify({ success: false, error: 'donationRequestId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: donation, error: fetchError } = await supabase
      .from('donation_requests').select('*').eq('id', donationRequestId).single();

    if (fetchError || !donation) {
      console.error('Error fetching donation request:', fetchError);
      return new Response(JSON.stringify({ success: false, error: 'Donation request not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Generate signed URLs for any uploaded documents (no attachments — Lovable email infra doesn't support them)
    const signedUrl = async (path: string | null) => {
      if (!path) return undefined;
      const { data } = await supabase.storage.from('donation-documents').createSignedUrl(path, SIGNED_URL_EXPIRES);
      return data?.signedUrl;
    };
    const irsLetterUrl = await signedUrl(donation.irs_letter_path);
    const sponsorshipFileUrl = await signedUrl(donation.sponsorship_file_path);

    const submittedAt = new Date(donation.created_at).toLocaleString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    // Compact summary for the admin email
    const summary: Record<string, string | undefined> = {
      'Mailing address': [donation.mailing_street, donation.mailing_city, donation.mailing_state, donation.mailing_zip].filter(Boolean).join(', ') || undefined,
      'Venue': [donation.venue_name, donation.venue_street, donation.venue_city, donation.venue_state, donation.venue_zip].filter(Boolean).join(', ') || undefined,
      'Virtual': donation.is_virtual,
      'Event description': donation.event_description,
      'Event URL': donation.event_url,
      'Other beverages': donation.other_beverages,
      'How to use': donation.how_intend_to_use,
      'Sponsor benefits': donation.sponsor_benefits,
      'Services': Array.isArray(donation.services) ? donation.services.join(', ') : donation.services,
      'How heard': donation.how_heard,
      'Who they know': donation.who_know,
      'Partnered before': donation.partnered_before,
      'Participated before': donation.participated_before,
      'Affiliate interest': donation.affiliate_interest,
    };

    const adminTemplateData = {
      orgName: donation.org_name,
      eventName: donation.event_name,
      eventDate: donation.event_date,
      numAttendees: donation.num_attendees,
      contactName: [donation.first_name, donation.last_name].filter(Boolean).join(' '),
      contactEmail: donation.email,
      contactPhone: donation.telephone,
      isNonprofit: donation.is_nonprofit,
      ein: donation.ein,
      irsLetterUrl,
      sponsorshipFileUrl,
      summary,
    };

    // Send admin notifications (one invocation per recipient — each is its own transactional send)
    const adminResults = await Promise.allSettled(ADMIN_RECIPIENTS.map((to, i) =>
      supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'donation-admin-notification',
          recipientEmail: to,
          idempotencyKey: `donation-admin-${donation.id}-${i}`,
          templateData: adminTemplateData,
        },
      })
    ));

    // Send confirmation to submitter
    const customerResult = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'donation-customer-confirmation',
        recipientEmail: donation.email,
        idempotencyKey: `donation-confirm-${donation.id}`,
        templateData: {
          firstName: donation.first_name,
          orgName: donation.org_name,
          eventName: donation.event_name,
          eventDate: donation.event_date,
          submittedAt,
        },
      },
    });

    return new Response(JSON.stringify({
      success: true,
      adminSent: adminResults.filter(r => r.status === 'fulfilled').length,
      adminFailed: adminResults.filter(r => r.status === 'rejected').length,
      confirmationSent: !customerResult.error,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error processing donation notification:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
