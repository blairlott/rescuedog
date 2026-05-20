import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: 'auth required' }), { status: 401, headers: corsHeaders });

  const { data: isAdmin } = await supabase.rpc('is_admin_or_owner', { _user_id: user.id });
  if (!isAdmin) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });

  const body = await req.json();
  const { action, payload } = body;

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    if (action === 'list') {
      const { data, error } = await admin
        .from('discount_codes')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return new Response(JSON.stringify({ codes: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'create') {
      const code = String(payload.code || '').toUpperCase().trim();
      if (!code) throw new Error('code required');
      const { data, error } = await admin
        .from('discount_codes')
        .insert({
          code,
          description: payload.description ?? null,
          type: payload.type,
          value: payload.value,
          scope: payload.scope ?? 'sitewide',
          tier: payload.tier ?? 'public',
          min_subtotal_cents: payload.min_subtotal_cents ?? 0,
          max_discount_cents: payload.max_discount_cents ?? null,
          starts_at: payload.starts_at ?? null,
          ends_at: payload.ends_at ?? null,
          usage_limit_total: payload.usage_limit_total ?? null,
          usage_limit_per_customer: payload.usage_limit_per_customer ?? 1,
          customer_eligibility: payload.customer_eligibility ?? 'all',
          active: payload.active ?? true,
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;

      // Fire-and-forget mirror
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/discount-mirror`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        body: JSON.stringify({ discount_code_id: data.id }),
      }).catch(() => {});

      return new Response(JSON.stringify({ code: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'update') {
      const { id, ...updates } = payload;
      const { data, error } = await admin.from('discount_codes').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return new Response(JSON.stringify({ code: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'delete') {
      const { error } = await admin.from('discount_codes').delete().eq('id', payload.id);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'mirror') {
      const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/discount-mirror`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        body: JSON.stringify({ discount_code_id: payload.id }),
      });
      const json = await res.json();
      return new Response(JSON.stringify(json), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'unknown action' }), { status: 400, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});