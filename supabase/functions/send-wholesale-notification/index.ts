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
const TEAM_CC = ['info@rescuedogwines.com', 'blair.lott@rescuedogwines.com'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: 'unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (token !== serviceKey) {
      const verifier = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY') ?? serviceKey);
      const { data: userData, error: userErr } = await verifier.auth.getUser(token);
      if (userErr || !userData?.user) {
        return new Response(JSON.stringify({ success: false, error: 'unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const { inquiryId } = await req.json();
    if (!inquiryId) {
      return new Response(JSON.stringify({ success: false, error: 'inquiryId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: inquiry, error } = await supabase.from('wholesale_inquiries').select('*').eq('id', inquiryId).single();
    if (error || !inquiry) {
      return new Response(JSON.stringify({ success: false, error: 'Wholesale inquiry not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const regionContact = REGION_CONTACTS[inquiry.region] || REGION_CONTACTS['us-national'];
    const regionLabel = REGION_LABELS[inquiry.region] || inquiry.region;

    const adminData = {
      businessName: inquiry.business,
      contactName: inquiry.name,
      contactEmail: inquiry.email,
      contactPhone: inquiry.phone,
      state: inquiry.state,
      city: inquiry.city,
      licenseType: inquiry.license_type,
      message: inquiry.message,
      region: regionLabel,
    };

    // One transactional send per recipient (regional contact + team CCs)
    const recipients = [regionContact.email, ...TEAM_CC];
    const adminResults = await Promise.allSettled(recipients.map((to, i) =>
      supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'wholesale-admin-notification',
          recipientEmail: to,
          idempotencyKey: `wholesale-admin-${inquiry.id}-${i}`,
          templateData: adminData,
        },
      })
    ));

    const customerResult = await supabase.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'wholesale-customer-confirmation',
        recipientEmail: inquiry.email,
        idempotencyKey: `wholesale-confirm-${inquiry.id}`,
        templateData: { contactName: inquiry.name, businessName: inquiry.business, state: inquiry.state },
      },
    });

    return new Response(JSON.stringify({
      success: true,
      adminSent: adminResults.filter(r => r.status === 'fulfilled').length,
      confirmationSent: !customerResult.error,
      routedTo: regionContact.name,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
