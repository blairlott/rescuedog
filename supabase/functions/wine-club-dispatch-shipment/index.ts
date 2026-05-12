import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { shipment_id } = await req.json();
    if (!shipment_id) return j({ error: "shipment_id required" }, 400);

    const { data: ship } = await svc.from("wine_club_shipments")
      .select("*, items:wine_club_shipment_items(*), membership:wine_club_memberships!membership_id(*)")
      .eq("id", shipment_id).single();
    if (!ship) return j({ error: "Not found" }, 404);
    if (!["locked"].includes(ship.status)) return j({ error: `Status ${ship.status} not dispatchable` }, 400);

    const m: any = (ship as any).membership;
    const items: any[] = (ship as any).items ?? [];
    if (items.length === 0) return j({ error: "No items" }, 400);

    // Recheck weather hold defensively
    const { data: activeHold } = await svc.from("wine_club_weather_holds")
      .select("hold_until, reason").eq("state", m.shipping_state).is("lifted_at", null)
      .gte("hold_until", new Date().toISOString().slice(0, 10)).maybeSingle();
    if (activeHold) {
      await svc.from("wine_club_shipments").update({
        status: "weather_hold", weather_hold_state: m.shipping_state,
        weather_hold_until: activeHold.hold_until,
      }).eq("id", shipment_id);
      return j({ ok: false, reason: "weather_hold" });
    }

    // Build ship-to from address OR access point
    const shipTo = ship.delivery_destination_type === "ups_access_point" && ship.delivery_ups_access_point
      ? { ...ship.delivery_ups_access_point, hold_for_pickup: true }
      : {
          line1: m.shipping_address_line1, line2: m.shipping_address_line2,
          city: m.shipping_city, state: m.shipping_state, zip: m.shipping_zip,
        };

    try {
      const res = await svc.functions.invoke("vinoshipper-create-order", {
        body: {
          vinoshipper_customer_id: m.vinoshipper_customer_id,
          ship_to: shipTo,
          items: items.map((i) => ({ product_handle: i.product_handle, variant_id: i.variant_id, quantity: i.quantity, price_cents: i.price_cents })),
          source: "wine_club_auto_dispatch",
          shipment_id,
        },
      });
      const vsOrderId = (res.data as any)?.vinoshipper_order_id ?? null;
      await svc.from("wine_club_shipments").update({
        status: "shipped", dispatched_at: new Date().toISOString(),
        vinoshipper_order_id: vsOrderId, dispatch_error: null,
      }).eq("id", shipment_id);
      await svc.from("wine_club_events").insert({ user_id: m.user_id, event_type: "shipment_dispatched", metadata: { shipment_id, vsOrderId } });
      try {
        const { data: prof } = await svc.from("profiles").select("email").eq("id", m.user_id).maybeSingle();
        if (prof?.email) await svc.functions.invoke("send-transactional-email", { body: { template: "wine-club-shipment-dispatched", to: prof.email, data: { shipment_id, vsOrderId } } });
      } catch (_) {}
      return j({ ok: true, vinoshipper_order_id: vsOrderId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await svc.from("wine_club_shipments").update({ dispatch_error: msg }).eq("id", shipment_id);
      await svc.from("wine_club_events").insert({ user_id: m.user_id, event_type: "shipment_dispatch_failed", metadata: { shipment_id, error: msg } });
      return j({ ok: false, error: msg }, 500);
    }
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function j(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }