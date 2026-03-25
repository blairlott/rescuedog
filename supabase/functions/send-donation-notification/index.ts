import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { donationRequestId } = await req.json();

    if (!donationRequestId) {
      return new Response(
        JSON.stringify({ success: false, error: 'donationRequestId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the donation request
    const { data: donation, error: fetchError } = await supabase
      .from('donation_requests')
      .select('*')
      .eq('id', donationRequestId)
      .single();

    if (fetchError || !donation) {
      console.error('Error fetching donation request:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Donation request not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate signed URLs for uploaded documents
    const attachmentLinks: string[] = [];

    if (donation.irs_letter_path) {
      const { data: irsUrl } = await supabase.storage
        .from('donation-documents')
        .createSignedUrl(donation.irs_letter_path, 60 * 60 * 24 * 30); // 30 days
      if (irsUrl?.signedUrl) {
        attachmentLinks.push(`<li><a href="${irsUrl.signedUrl}">IRS Determination Letter (501c)</a></li>`);
      }
    }

    if (donation.sponsorship_file_path) {
      const { data: sponsorUrl } = await supabase.storage
        .from('donation-documents')
        .createSignedUrl(donation.sponsorship_file_path, 60 * 60 * 24 * 30);
      if (sponsorUrl?.signedUrl) {
        attachmentLinks.push(`<li><a href="${sponsorUrl.signedUrl}">Additional Sponsorship File</a></li>`);
      }
    }

    const documentsSection = attachmentLinks.length > 0
      ? `<h3 style="color:#333;margin-top:20px;">Uploaded Documents</h3><ul>${attachmentLinks.join('')}</ul>`
      : '';

    const servicesText = donation.services?.length
      ? donation.services.join(', ')
      : 'None specified';

    // Build email HTML
    const emailHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#c41e3a;color:white;padding:20px;text-align:center;">
          <h1 style="margin:0;font-size:24px;">New Donation Request</h1>
        </div>
        
        <div style="padding:20px;background:#f9f9f9;border:1px solid #ddd;">
          <h2 style="color:#c41e3a;border-bottom:2px solid #c41e3a;padding-bottom:8px;">Organization Information</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:6px 0;font-weight:bold;width:40%;">Organization:</td><td>${donation.org_name}</td></tr>
            <tr><td style="padding:6px 0;font-weight:bold;">Nonprofit:</td><td>${donation.is_nonprofit || 'N/A'}</td></tr>
            <tr><td style="padding:6px 0;font-weight:bold;">Services:</td><td>${servicesText}</td></tr>
            <tr><td style="padding:6px 0;font-weight:bold;">Address:</td><td>${donation.mailing_street || ''}, ${donation.mailing_city || ''}, ${donation.mailing_state || ''} ${donation.mailing_zip || ''}</td></tr>
            <tr><td style="padding:6px 0;font-weight:bold;">EIN:</td><td>${donation.ein || 'N/A'}</td></tr>
          </table>

          <h2 style="color:#c41e3a;border-bottom:2px solid #c41e3a;padding-bottom:8px;margin-top:20px;">Primary Contact</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:6px 0;font-weight:bold;width:40%;">Name:</td><td>${donation.first_name} ${donation.last_name}</td></tr>
            <tr><td style="padding:6px 0;font-weight:bold;">Phone:</td><td>${donation.telephone}</td></tr>
            <tr><td style="padding:6px 0;font-weight:bold;">Email:</td><td><a href="mailto:${donation.email}">${donation.email}</a></td></tr>
          </table>

          <h2 style="color:#c41e3a;border-bottom:2px solid #c41e3a;padding-bottom:8px;margin-top:20px;">Event Information</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:6px 0;font-weight:bold;width:40%;">Event Name:</td><td>${donation.event_name}</td></tr>
            <tr><td style="padding:6px 0;font-weight:bold;">Virtual Event:</td><td>${donation.is_virtual || 'N/A'}</td></tr>
            <tr><td style="padding:6px 0;font-weight:bold;">Event Date:</td><td>${donation.event_date || 'N/A'}</td></tr>
            <tr><td style="padding:6px 0;font-weight:bold;">Venue:</td><td>${donation.venue_name || 'N/A'}</td></tr>
            <tr><td style="padding:6px 0;font-weight:bold;">Venue Address:</td><td>${[donation.venue_street, donation.venue_city, donation.venue_state, donation.venue_zip].filter(Boolean).join(', ') || 'N/A'}</td></tr>
            <tr><td style="padding:6px 0;font-weight:bold;">Event URL:</td><td>${donation.event_url ? `<a href="${donation.event_url}">${donation.event_url}</a>` : 'N/A'}</td></tr>
            <tr><td style="padding:6px 0;font-weight:bold;">Attendees (21+):</td><td>${donation.num_attendees || 'N/A'}</td></tr>
            <tr><td style="padding:6px 0;font-weight:bold;">Other Beverages:</td><td>${donation.other_beverages || 'N/A'}</td></tr>
          </table>

          <h3 style="color:#333;margin-top:15px;">Event Description</h3>
          <p style="background:white;padding:10px;border:1px solid #ddd;">${donation.event_description}</p>

          <h3 style="color:#333;">Sponsor Benefits</h3>
          <p style="background:white;padding:10px;border:1px solid #ddd;">${donation.sponsor_benefits}</p>

          ${donation.how_intend_to_use ? `<h3 style="color:#333;">How They Intend to Use Donation</h3><p style="background:white;padding:10px;border:1px solid #ddd;">${donation.how_intend_to_use}</p>` : ''}

          <h2 style="color:#c41e3a;border-bottom:2px solid #c41e3a;padding-bottom:8px;margin-top:20px;">Additional</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:6px 0;font-weight:bold;width:40%;">How Heard About Us:</td><td>${donation.how_heard || 'N/A'}</td></tr>
            <tr><td style="padding:6px 0;font-weight:bold;">Who They Know:</td><td>${donation.who_know || 'N/A'}</td></tr>
            <tr><td style="padding:6px 0;font-weight:bold;">Partnered Before:</td><td>${donation.partnered_before || 'N/A'}</td></tr>
            <tr><td style="padding:6px 0;font-weight:bold;">Participated Before:</td><td>${donation.participated_before || 'N/A'}</td></tr>
            <tr><td style="padding:6px 0;font-weight:bold;">Affiliate Interest:</td><td>${donation.affiliate_interest || 'N/A'}</td></tr>
          </table>

          ${documentsSection}
        </div>

        <p style="color:#999;font-size:12px;text-align:center;margin-top:20px;">
          Submitted on ${new Date(donation.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    `;

    // Send notification email using Resend or fallback
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    
    if (RESEND_API_KEY) {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Rescue Dog Wines <donations@rescuedogwines.com>',
          to: ['lara.hill@rescuedogwines.com'],
          cc: ['info@rescuedogwine.com'],
          subject: `New Donation Request: ${donation.org_name}`,
          html: emailHtml,
        }),
      });

      const emailResult = await emailResponse.json();
      console.log('Email sent:', emailResult);

      if (!emailResponse.ok) {
        console.error('Email send failed:', emailResult);
        return new Response(
          JSON.stringify({ success: true, emailSent: false, emailError: emailResult }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      console.log('RESEND_API_KEY not configured. Email notification skipped.');
      console.log('Donation request stored with ID:', donationRequestId);
      return new Response(
        JSON.stringify({ success: true, emailSent: false, note: 'Email not configured yet' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, emailSent: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing donation notification:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
