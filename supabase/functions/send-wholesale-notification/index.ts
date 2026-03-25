import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const REGION_CONTACTS: Record<string, { name: string; email: string }> = {
  'ca-west': { name: 'Jake Lenz', email: 'jake@rescuedogwines.com' },
  'us-national': { name: 'Jana Ritter', email: 'j.ritter@rescuedogwines.com' },
  'international': { name: 'Jana Ritter', email: 'j.ritter@rescuedogwines.com' },
};

const REGION_LABELS: Record<string, string> = {
  'ca-west': 'California & Western Region',
  'us-national': 'US National & Other States',
  'international': 'International',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { inquiryId } = await req.json();

    if (!inquiryId) {
      return new Response(
        JSON.stringify({ success: false, error: 'inquiryId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: inquiry, error: fetchError } = await supabase
      .from('wholesale_inquiries')
      .select('*')
      .eq('id', inquiryId)
      .single();

    if (fetchError || !inquiry) {
      console.error('Error fetching wholesale inquiry:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Wholesale inquiry not found' }),
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

    const regionContact = REGION_CONTACTS[inquiry.region] || REGION_CONTACTS['us-national'];
    const regionLabel = REGION_LABELS[inquiry.region] || inquiry.region;

    // Notification email to regional contact + team
    const emailHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#c41e3a;color:white;padding:20px;text-align:center;">
          <h1 style="margin:0;font-size:24px;">New Wholesale Inquiry</h1>
          <p style="margin:8px 0 0;font-size:14px;opacity:0.9;">Region: ${regionLabel}</p>
        </div>
        
        <div style="padding:20px;background:#f9f9f9;border:1px solid #ddd;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;font-weight:bold;width:35%;">Name:</td><td>${inquiry.name}</td></tr>
            <tr><td style="padding:8px 0;font-weight:bold;">Business:</td><td>${inquiry.business}</td></tr>
            <tr><td style="padding:8px 0;font-weight:bold;">Email:</td><td><a href="mailto:${inquiry.email}">${inquiry.email}</a></td></tr>
            <tr><td style="padding:8px 0;font-weight:bold;">Phone:</td><td>${inquiry.phone || 'N/A'}</td></tr>
            <tr><td style="padding:8px 0;font-weight:bold;">Region:</td><td>${regionLabel}</td></tr>
          </table>

          <h3 style="color:#333;margin-top:15px;">Message</h3>
          <p style="background:white;padding:12px;border:1px solid #ddd;line-height:1.6;">${inquiry.message}</p>
        </div>

        <p style="color:#999;font-size:12px;text-align:center;margin-top:20px;">
          Submitted on ${new Date(inquiry.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    `;

    // Send to regional contact, CC the team
    const notificationResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Rescue Dog Wines <wholesale@rescuedogwines.com>',
        to: [regionContact.email],
        cc: ['info@rescuedogwines.com', 'blair.lott@rescuedogwines.com'],
        reply_to: inquiry.email,
        subject: `Wholesale Inquiry: ${inquiry.business} (${regionLabel})`,
        html: emailHtml,
      }),
    });

    const notificationResult = await notificationResponse.json();
    console.log('Notification email result:', notificationResult);

    // Send confirmation to the submitter
    const confirmationHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#c41e3a;color:white;padding:20px;text-align:center;">
          <h1 style="margin:0;font-size:24px;">Thank You for Your Interest!</h1>
        </div>
        
        <div style="padding:30px 20px;background:#f9f9f9;border:1px solid #ddd;">
          <p style="font-size:16px;color:#333;line-height:1.6;">
            Dear ${inquiry.name},
          </p>
          
          <p style="font-size:16px;color:#333;line-height:1.6;">
            Thank you for your wholesale inquiry on behalf of <strong>${inquiry.business}</strong>. 
            We appreciate your interest in carrying Rescue Dog Wines!
          </p>
          
          <p style="font-size:16px;color:#333;line-height:1.6;">
            Your inquiry has been forwarded to <strong>${regionContact.name}</strong>, who handles 
            the ${regionLabel.toLowerCase()} territory. They will be in touch with you shortly.
          </p>

          <div style="background:#fff;border-left:4px solid #c41e3a;padding:15px;margin:25px 0;">
            <p style="margin:0;font-size:14px;color:#555;">
              <strong>Your Contact:</strong><br/>
              ${regionContact.name}<br/>
              <a href="mailto:${regionContact.email}" style="color:#c41e3a;">${regionContact.email}</a>
            </p>
          </div>
          
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
        from: 'Rescue Dog Wines <wholesale@rescuedogwines.com>',
        to: [inquiry.email],
        subject: `Wholesale Inquiry Received - Rescue Dog Wines`,
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
        routedTo: regionContact.name,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing wholesale notification:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
