// Captures or clears an abandoned-cart snapshot for the logged-in user.
// Called from the client cartStore on debounce when items change.
// Body: { action: 'upsert' | 'clear', email, items, item_count, subtotal_cents,
//         shopify_cart_id?, shopify_checkout_url?, fbc?, fbp?, gclid? }

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({
  action: z.enum(["upsert", "clear"]),
  email: z.string().email(),
  items: z.array(z.record(z.unknown())).max(100).optional(),
  item_count: z.number().int().nonnegative().optional(),
  subtotal_cents: z.number().int().nonnegative().optional(),
  shopify_cart_id: z.string().nullable().optional(),
  shopify_checkout_url: z.string().url().nullable().optional(),
  fbc: z.string().nullable().optional(),
  fbp: z.string().nullable().optional(),
  gclid: z.string().nullable().optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return J(405, { error: "method not allowed" });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return J(401, { error: "unauthorized" });

  const authedClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: u } = await authedClient.auth.getUser();
  const userId = u?.user?.id ?? null;
  if (!userId) return J(401, { error: "unauthorized" });

  let raw: unknown;
  try { raw = await req.json(); } catch { return J(400, { error: "invalid json" }); }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) return J(400, { error: "invalid_body", details: parsed.error.flatten() });
  const b = parsed.data;

  // Bind email to logged-in user (don't trust client email blindly).
  const userEmail = u?.user?.email ?? null;
  const email = (userEmail || b.email).toLowerCase();

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Kill switch
  const { data: setting } = await admin
    .from("app_settings").select("value").eq("key", "abandoned_cart_enabled").maybeSingle();
  if (setting && (setting.value as any) === false) {
    return J(200, { ok: true, skipped: true });
  }

  if (b.action === "clear" || (b.item_count ?? 0) === 0) {
    await admin.from("abandoned_carts")
      .update({ recovered_at: new Date().toISOString() })
      .eq("email", email)
      .is("recovered_at", null);
    return J(200, { ok: true, cleared: true });
  }

  // Upsert: try update first; if no row, insert.
  const patch = {
    user_id: userId,
    email,
    items: b.items ?? [],
    item_count: b.item_count ?? 0,
    subtotal_cents: b.subtotal_cents ?? 0,
    shopify_cart_id: b.shopify_cart_id ?? null,
    shopify_checkout_url: b.shopify_checkout_url ?? null,
    fbc: b.fbc ?? null,
    fbp: b.fbp ?? null,
    gclid: b.gclid ?? null,
    last_activity_at: new Date().toISOString(),
  };
  const { data: existing } = await admin
    .from("abandoned_carts")
    .select("id")
    .eq("email", email)
    .is("recovered_at", null)
    .maybeSingle();

  if (existing?.id) {
    await admin.from("abandoned_carts").update(patch).eq("id", existing.id);
    return J(200, { ok: true, id: existing.id, updated: true });
  }
  const { data: inserted, error } = await admin
    .from("abandoned_carts").insert(patch).select("id").maybeSingle();
  if (error) return J(500, { ok: false, error: error.message });
  return J(200, { ok: true, id: inserted?.id, created: true });
});