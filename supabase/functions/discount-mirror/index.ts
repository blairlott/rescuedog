import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SHOPIFY_DOMAIN = Deno.env.get('SHOPIFY_STORE_DOMAIN') ?? '';
const SHOPIFY_TOKEN = Deno.env.get('SHOPIFY_ACCESS_TOKEN') ?? '';
const SHOPIFY_API_VERSION = '2025-07';

async function shopifyMirror(code: any) {
  if (!SHOPIFY_DOMAIN || !SHOPIFY_TOKEN) throw new Error('Shopify not configured');
  const base = `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}`;

  // Create or update price rule
  const valueType = code.type === 'percent' ? 'percentage' : code.type === 'fixed' ? 'fixed_amount' : 'percentage';
  const value = code.type === 'shipping' ? '-100.0' : `-${Number(code.value).toFixed(2)}`;

  const priceRulePayload: any = {
    price_rule: {
      title: code.code,
      target_type: code.type === 'shipping' ? 'shipping_line' : 'line_item',
      target_selection: 'all',
      allocation_method: 'across',
      value_type: valueType,
      value,
      customer_selection: 'all',
      starts_at: code.starts_at ?? new Date().toISOString(),
      ends_at: code.ends_at,
      once_per_customer: (code.usage_limit_per_customer ?? 1) === 1,
      usage_limit: code.usage_limit_total,
      prerequisite_subtotal_range: code.min_subtotal_cents > 0
        ? { greater_than_or_equal_to: (code.min_subtotal_cents / 100).toFixed(2) }
        : undefined,
    },
  };

  let priceRuleId = code.shopify_price_rule_id;
  if (!priceRuleId) {
    const r = await fetch(`${base}/price_rules.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(priceRulePayload),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`Shopify price_rule: ${JSON.stringify(j)}`);
    priceRuleId = j.price_rule.id;
  } else {
    const r = await fetch(`${base}/price_rules/${priceRuleId}.json`, {
      method: 'PUT',
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(priceRulePayload),
    });
    if (!r.ok) throw new Error(`Shopify price_rule update: ${await r.text()}`);
  }

  let discountCodeId = code.shopify_discount_code_id;
  if (!discountCodeId) {
    const r = await fetch(`${base}/price_rules/${priceRuleId}/discount_codes.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ discount_code: { code: code.code } }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`Shopify discount_code: ${JSON.stringify(j)}`);
    discountCodeId = j.discount_code.id;
  }

  return { priceRuleId, discountCodeId };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { discount_code_id } = await req.json();
    const { data: code, error } = await admin.from('discount_codes').select('*').eq('id', discount_code_id).single();
    if (error || !code) throw new Error('code not found');

    const updates: any = {};

    // Shopify mirror (skip if scope=wine since wine doesn't go through Shopify)
    if (code.scope !== 'wine') {
      try {
        const { priceRuleId, discountCodeId } = await shopifyMirror(code);
        updates.shopify_price_rule_id = priceRuleId;
        updates.shopify_discount_code_id = discountCodeId;
        updates.shopify_mirror_status = 'synced';
        updates.shopify_mirror_error = null;
      } catch (e) {
        updates.shopify_mirror_status = 'failed';
        updates.shopify_mirror_error = String((e as Error).message);
      }
    } else {
      updates.shopify_mirror_status = 'disabled';
    }

    // VS mirror: stub for now — VS promo code API endpoints vary by account.
    // We mark as pending so the admin sees it needs manual creation in VS.
    if (code.scope !== 'merch') {
      updates.vs_mirror_status = 'pending';
      updates.vs_mirror_error = 'Vinoshipper promo codes require manual creation in VS dashboard with matching terms';
    } else {
      updates.vs_mirror_status = 'disabled';
    }

    await admin.from('discount_codes').update(updates).eq('id', code.id);

    return new Response(JSON.stringify({ ok: true, updates }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});