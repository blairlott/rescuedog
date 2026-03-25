import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Helper to encode ArrayBuffer to base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured.');
      return new Response(
        JSON.stringify({ success: false, error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch file attachments from storage
    const attachments: Array<{ filename: string; content: string }> = [];

    if (donation.irs_letter_path) {
      try {
        const { data: fileData, error: fileError } = await supabase.storage
          .from('donation-documents')
          .download(donation.irs_letter_path);
        if (fileData && !fileError) {
          const buffer = await fileData.arrayBuffer();
          const base64 = arrayBufferToBase64(buffer);
          const filename = donation.irs_letter_path.split('/').pop() || 'irs-determination-letter';
          attachments.push({ filename, content: base64 });
        } else {
          console.error('Error downloading IRS letter:', fileError);
        }
      } catch (e) {
        console.error('Failed to download IRS letter:', e);
      }
    }

    if (donation.sponsorship_file_path) {
      try {
        const { data: fileData, error: fileError } = await supabase.storage
          .from('donation-documents')
          .download(donation.sponsorship_file_path);
        if (fileData && !fileError) {
          const buffer = await fileData.arrayBuffer();
          const base64 = arrayBufferToBase64(buffer);
          const filename = donation.sponsorship_file_path.split('/').pop() || 'sponsorship-file';
          attachments.push({ filename, content: base64 });
        } else {
          console.error('Error downloading sponsorship file:', fileError);
        }
      } catch (e) {
        console.error('Failed to download sponsorship file:', e);
      }
    }

    const servicesText = donation.services?.length
      ? donation.services.join(', ')
      : 'None specified';

    // Build submission summary as plain text for attachment
    const summaryText = `DONATION REQUEST SUMMARY
========================
Submitted: ${new Date(donation.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}

ORGANIZATION INFORMATION
Organization: ${donation.org_name}
Nonprofit: ${donation.is_nonprofit || 'N/A'}
Services: ${servicesText}
Address: ${[donation.mailing_street, donation.mailing_city, donation.mailing_state, donation.mailing_zip].filter(Boolean).join(', ') || 'N/A'}
EIN: ${donation.ein || 'N/A'}

PRIMARY CONTACT
Name: ${donation.first_name} ${donation.last_name}
Phone: ${donation.telephone}
Email: ${donation.email}

EVENT INFORMATION
Event Name: ${donation.event_name}
Virtual Event: ${donation.is_virtual || 'N/A'}
Event Date: ${donation.event_date || 'N/A'}
Venue: ${donation.venue_name || 'N/A'}
Venue Address: ${[donation.venue_street, donation.venue_city, donation.venue_state, donation.venue_zip].filter(Boolean).join(', ') || 'N/A'}
Event URL: ${donation.event_url || 'N/A'}
Attendees (21+): ${donation.num_attendees || 'N/A'}
Other Beverages: ${donation.other_beverages || 'N/A'}

Event Description:
${donation.event_description}

Sponsor Benefits:
${donation.sponsor_benefits}

${donation.how_intend_to_use ? `How They Intend to Use Donation:\n${donation.how_intend_to_use}\n` : ''}
ADDITIONAL
How Heard About Us: ${donation.how_heard || 'N/A'}
Who They Know: ${donation.who_know || 'N/A'}
Partnered Before: ${donation.partnered_before || 'N/A'}
Participated Before: ${donation.participated_before || 'N/A'}
Affiliate Interest: ${donation.affiliate_interest || 'N/A'}
`;

    // Add summary as a text file attachment
    const summaryBase64 = btoa(unescape(encodeURIComponent(summaryText)));
    attachments.push({
      filename: `donation-request-${donation.org_name.replace(/[^a-zA-Z0-9]/g, '-')}.txt`,
      content: summaryBase64,
    });

    // Build notification email HTML
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

          ${attachments.length > 1 ? '<p style="margin-top:15px;color:#666;font-style:italic;">📎 Uploaded documents and submission summary are attached to this email.</p>' : '<p style="margin-top:15px;color:#666;font-style:italic;">📎 Submission summary is attached to this email.</p>'}
        </div>

        <p style="color:#999;font-size:12px;text-align:center;margin-top:20px;">
          Submitted on ${new Date(donation.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    `;

    // Send notification email to team with CC to submitter
    const notificationResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Rescue Dog Wines <donations@rescuedogwines.com>',
        to: ['lara.hill@rescuedogwines.com'],
        cc: ['info@rescuedogwine.com', donation.email],
        subject: `New Donation Request: ${donation.org_name}`,
        html: emailHtml,
        attachments: attachments.map(a => ({
          filename: a.filename,
          content: a.content,
        })),
      }),
    });

    const notificationResult = await notificationResponse.json();
    console.log('Notification email result:', notificationResult);

    if (!notificationResponse.ok) {
      console.error('Notification email failed:', notificationResult);
    }

    // Send confirmation email to submitter
    const confirmationHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#c41e3a;color:white;padding:20px;text-align:center;">
          <h1 style="margin:0;font-size:24px;">Thank You for Your Request!</h1>
        </div>
        
        <div style="padding:30px 20px;background:#f9f9f9;border:1px solid #ddd;">
          <p style="font-size:16px;color:#333;line-height:1.6;">
            Dear ${donation.first_name},
          </p>
          
          <p style="font-size:16px;color:#333;line-height:1.6;">
            Thank you for submitting a donation request on behalf of <strong>${donation.org_name}</strong>. 
            We truly appreciate your interest in partnering with Rescue Dog Wines!
          </p>
          
          <p style="font-size:16px;color:#333;line-height:1.6;">
            Our donation coordinator will review your request and contact you as soon as possible. 
            Please note that we receive a large number of donation requests, so it may take some time 
            for us to respond. We appreciate your patience and understanding.
          </p>

          <p style="font-size:16px;color:#333;line-height:1.6;">
            You have been copied on the submission email for your records, which includes all the 
            details you provided along with any uploaded documents.
          </p>
          
          <div style="background:#fff;border-left:4px solid #c41e3a;padding:15px;margin:25px 0;">
            <p style="margin:0;font-size:14px;color:#555;">
              <strong>Your Request Details:</strong><br/>
              Organization: ${donation.org_name}<br/>
              Event: ${donation.event_name}<br/>
              ${donation.event_date ? `Event Date: ${donation.event_date}<br/>` : ''}
              Submitted: ${new Date(donation.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          <p style="font-size:16px;color:#333;line-height:1.6;">
            If you have any questions in the meantime, please don't hesitate to reach out to us.
          </p>
          
          <p style="font-size:16px;color:#333;line-height:1.6;">
            Warm regards,<br/>
            <strong>The Rescue Dog Wines Team</strong>
          </p>
        </div>

        <div style="text-align:center;padding:20px;">
          <a href="https://www.rescuedogwines.com" style="color:#c41e3a;text-decoration:none;font-size:14px;">
            www.rescuedogwines.com
          </a>
        </div>
      </div>
    `;

    const confirmationResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Rescue Dog Wines <donations@rescuedogwines.com>',
        to: [donation.email],
        subject: `Donation Request Received - ${donation.org_name}`,
        html: confirmationHtml,
      }),
    });

    const confirmationResult = await confirmationResponse.json();
    console.log('Confirmation email result:', confirmationResult);

    return new Response(
      JSON.stringify({
        success: true,
        notificationSent: notificationResponse.ok,
        confirmationSent: confirmationResponse.ok,
      }),
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
