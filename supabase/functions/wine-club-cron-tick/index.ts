// One scheduled tick handles all wine-club lifecycle transitions.
// Idempotent — safe to run hourly. Driven by pg_cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendEmail(svc: any, template: string, to: string, payload: Record<string, unknown>) {
  try {
    await svc.functions.invoke("send-transactional-email", {
      body: { template, to, data: payload },
    });
  } catch (e) {
    console.error("email send fail", template, to, e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const summary: Record<string, number> = { previewed: 0, locked: 0, weather_held: 0, dispatched: 0, released: 0 };

  // 1. Send preview emails (status=scheduled, cutoff within 7 days, not yet notified)
  const previewWindow = new Date(now); previewWindow.setUTCDate(previewWindow.getUTCDate() + 7);
  const { data: toPreview } = await svc.from("wine_club_shipments")
    .select("id, shipment_date, cutoff_at, membership:wine_club_memberships!membership_id(user_id, profile:profiles!id(email,full_name))")
    .eq("status", "scheduled").is("customer_notified_at", null)
    .lte("cutoff_at", previewWindow.toISOString());
  for (const s of toPreview ?? []) {
    const email = (s as any).membership?.profile?.email;
    if (email) await sendEmail(svc, "wine-club-shipment-preview", email, { shipment_id: s.id, shipment_date: s.shipment_date, cutoff_at: s.cutoff_at });
    await svc.from("wine_club_shipments").update({ customer_notified_at: now.toISOString(), status: "customer_notified" }).eq("id", s.id);
    summary.previewed++;
  }

  // 2. Lock shipments past cutoff
  const { data: toLock } = await svc.from("wine_club_shipments")
    .select("id, shipment_date, membership:wine_club_memberships!membership_id(shipping_state, user_id, profile:profiles!id(email))")
    .in("status", ["scheduled","customer_notified","customer_customized"])
    .lt("cutoff_at", now.toISOString());
  const activeHoldsByState = new Map<string, { hold_until: string; reason: string }>();
  const { data: holds } = await svc.from("wine_club_weather_holds")
    .select("state, hold_until, reason").is("lifted_at", null).gte("hold_until", today);
  (holds ?? []).forEach((h) => activeHoldsByState.set(h.state, { hold_until: h.hold_until, reason: h.reason }));

  for (const s of toLock ?? []) {
    const state = (s as any).membership?.shipping_state;
    const hold = state ? activeHoldsByState.get(state) : null;
    const email = (s as any).membership?.profile?.email;
    if (hold) {
      await svc.from("wine_club_shipments").update({
        status: "weather_hold", weather_hold_state: state,
        weather_hold_until: hold.hold_until, weather_hold_notified_at: now.toISOString(),
      }).eq("id", s.id);
      if (email) await sendEmail(svc, "wine-club-weather-hold", email, { shipment_id: s.id, state, hold_until: hold.hold_until, reason: hold.reason });
      summary.weather_held++;
    } else {
      await svc.from("wine_club_shipments").update({ status: "locked" }).eq("id", s.id);
      if (email) await sendEmail(svc, "wine-club-shipment-locked", email, { shipment_id: s.id, ship_date: s.shipment_date });
      summary.locked++;
    }
  }

  // 3. Release shipments whose hold has lifted
  const { data: toRelease } = await svc.from("wine_club_shipments")
    .select("id, weather_hold_state, weather_hold_until, membership:wine_club_memberships!membership_id(profile:profiles!id(email))")
    .eq("status", "weather_hold");
  for (const s of toRelease ?? []) {
    const stillHeld = (s as any).weather_hold_state && activeHoldsByState.has((s as any).weather_hold_state);
    if (stillHeld) continue;
    await svc.from("wine_club_shipments").update({ status: "locked", weather_hold_state: null, weather_hold_until: null }).eq("id", s.id);
    const email = (s as any).membership?.profile?.email;
    if (email) await sendEmail(svc, "wine-club-shipment-released", email, { shipment_id: s.id });
    summary.released++;
  }

  // 4. Auto-dispatch on Monday (today is ship date and locked)
  const isMonday = now.getUTCDay() === 1; // approximate
  if (isMonday) {
    const { data: toShip } = await svc.from("wine_club_shipments")
      .select("id").eq("status", "locked").eq("shipment_date", today);
    for (const s of toShip ?? []) {
      try {
        await svc.functions.invoke("wine-club-dispatch-shipment", { body: { shipment_id: s.id } });
        summary.dispatched++;
      } catch (e) {
        console.error("dispatch fail", s.id, e);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, ...summary, ran_at: now.toISOString() }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});