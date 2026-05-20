import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendCapiEventSafe } from "../_shared/metaCapiEvent.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IncomingItem {
  product_handle: string;
  product_title: string;
  product_image_url?: string | null;
  variant_id?: string | null;
  price_cents: number;
  quantity: number;
}

interface Body {
  shipment_id: string;
  items: IncomingItem[];
  action?: "save" | "skip";
  delivery_destination_type?: "address" | "ups_access_point";
  delivery_ups_access_point?: Record<string, unknown> | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json()) as Body;
    if (!body?.shipment_id) return json({ error: "shipment_id required" }, 400);

    const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: shipment, error: shipErr } = await svc
      .from("wine_club_shipments")
      .select("id, status, membership:wine_club_memberships!membership_id(id, user_id, origin, tier:wine_club_tiers!tier_id(bottle_count, name))")
      .eq("id", body.shipment_id)
      .maybeSingle();
    if (shipErr || !shipment) return json({ error: "Shipment not found" }, 404);
    const m: any = (shipment as any).membership;
    if (!m || m.user_id !== user.id) return json({ error: "Forbidden" }, 403);
    if (m.origin === "vinoshipper_legacy") {
      return json({ error: "Legacy memberships are managed in Vinoshipper" }, 400);
    }
    if (["locked", "shipped", "cancelled"].includes(shipment.status)) {
      return json({ error: "Shipment is locked and can no longer be edited" }, 400);
    }

    if (body.action === "skip") {
      await svc.from("wine_club_shipments").update({ status: "skipped", updated_at: new Date().toISOString() }).eq("id", shipment.id);
      await svc.from("wine_club_events").insert({ user_id: user.id, event_type: "shipment_skipped", metadata: { shipment_id: shipment.id } });
      // Meta CAPI lifecycle: ShipmentSkipped (best-effort)
      try {
        const { data: prof } = await svc.from("profiles").select("email, full_name").eq("id", user.id).maybeSingle();
        const [first, ...rest] = (prof?.full_name ?? "").split(" ");
        void sendCapiEventSafe({
          eventName: "ShipmentSkipped",
          eventId: `skip_${shipment.id}`,
          valueCents: 0,
          email: prof?.email ?? user.email ?? null,
          firstName: first || null,
          lastName: rest.join(" ") || null,
          country: "us",
          customData: { shipment_id: shipment.id, membership_id: m.id ?? null },
        });
      } catch (e) { console.error("CAPI ShipmentSkipped (non-fatal)", e); }
      return json({ ok: true, status: "skipped" });
    }

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.some((i) => !i.product_handle || !i.product_title || i.quantity < 1)) {
      return json({ error: "Invalid item payload" }, 400);
    }
    const totalBottles = items.reduce((s, i) => s + (i.quantity || 0), 0);
    const minBottles = m.tier?.bottle_count ?? 0;
    if (totalBottles < minBottles) {
      return json({
        error: `Your ${m.tier?.name ?? "tier"} requires at least ${minBottles} bottles per shipment. You have ${totalBottles}.`,
      }, 400);
    }
    const totalCents = items.reduce((s, i) => s + (i.price_cents || 0) * (i.quantity || 0), 0);

    await svc.from("wine_club_shipment_items").delete().eq("shipment_id", shipment.id);
    if (items.length > 0) {
      await svc.from("wine_club_shipment_items").insert(items.map((i) => ({
        shipment_id: shipment.id,
        product_handle: i.product_handle,
        product_title: i.product_title,
        product_image_url: i.product_image_url ?? null,
        variant_id: i.variant_id ?? null,
        price_cents: i.price_cents || 0,
        quantity: i.quantity || 1,
        is_customer_swap: true,
        is_ai_suggested: false,
      })));
    }
    await svc.from("wine_club_shipments").update({
      status: "customer_customized",
      total_cents: totalCents,
      delivery_destination_type: body.delivery_destination_type === "ups_access_point" ? "ups_access_point" : "address",
      delivery_ups_access_point: body.delivery_destination_type === "ups_access_point" ? (body.delivery_ups_access_point ?? null) : null,
      updated_at: new Date().toISOString(),
    }).eq("id", shipment.id);

    await svc.from("wine_club_events").insert({
      user_id: user.id,
      event_type: "shipment_customized",
      metadata: { shipment_id: shipment.id, total_bottles: totalBottles, total_cents: totalCents },
    });

    return json({ ok: true, status: "customer_customized", total_bottles: totalBottles, total_cents: totalCents });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}