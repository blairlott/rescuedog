import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Next Monday on/after a given date (ISO yyyy-mm-dd)
function nextMonday(fromIso: string): string {
  const d = new Date(fromIso + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const add = (1 - dow + 7) % 7; // days to Monday (0 if already Monday)
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}
function sundayCutoff(shipIso: string): string {
  const d = new Date(shipIso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  // Sunday 23:59 ET ≈ Monday 03:59 UTC (EST). Approximate as previous-day 23:59 local.
  return new Date(`${d.toISOString().slice(0,10)}T23:59:00-05:00`).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return j({ error: "Unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return j({ error: "Unauthorized" }, 401);
    const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isMgr } = await svc.rpc("is_wine_club_manager", { _user_id: user.id });
    if (!isMgr) return j({ error: "Forbidden" }, 403);

    const { run_id } = await req.json();
    if (!run_id) return j({ error: "run_id required" }, 400);

    const { data: run } = await svc.from("wine_club_curation_runs").select("*").eq("id", run_id).single();
    if (!run) return j({ error: "Not found" }, 404);
    if (run.status !== "proposed" && run.status !== "approved") return j({ error: "Run not approvable" }, 400);

    const shipDate = nextMonday(run.ship_window_start);
    if (shipDate > run.ship_window_end) return j({ error: "No Monday in ship window" }, 400);
    const cutoff = sundayCutoff(shipDate);

    const { data: picks } = await svc.from("wine_club_curation_picks").select("*").eq("run_id", run_id);
    const picksByTier = new Map<string, any[]>();
    (picks ?? []).forEach((p) => {
      const arr = picksByTier.get(p.tier_id) ?? [];
      arr.push(p); picksByTier.set(p.tier_id, arr);
    });

    const { data: members } = await svc.from("wine_club_memberships")
      .select("id, tier_id, user_id")
      .eq("status", "active")
      .neq("origin", "vinoshipper_legacy");

    let created = 0;
    for (const m of members ?? []) {
      const tierPicks = picksByTier.get(m.tier_id);
      if (!tierPicks || tierPicks.length === 0) continue;
      // Skip if shipment already exists in window for this membership
      const { data: existing } = await svc.from("wine_club_shipments")
        .select("id").eq("membership_id", m.id)
        .gte("shipment_date", run.ship_window_start).lte("shipment_date", run.ship_window_end)
        .maybeSingle();
      if (existing) continue;

      const { data: ship, error: sErr } = await svc.from("wine_club_shipments").insert({
        membership_id: m.id, status: "scheduled", shipment_date: shipDate,
        cutoff_at: cutoff, curation_run_id: run_id,
        total_cents: tierPicks.reduce((s, p) => s + p.price_cents * p.quantity, 0),
      }).select("id").single();
      if (sErr || !ship) continue;

      await svc.from("wine_club_shipment_items").insert(tierPicks.map((p) => ({
        shipment_id: ship.id, product_handle: p.product_handle, product_title: p.product_title,
        product_image_url: p.product_image_url, price_cents: p.price_cents, quantity: p.quantity,
        is_ai_suggested: true, is_customer_swap: false,
      })));
      created++;
    }

    await svc.from("wine_club_curation_runs").update({
      status: "published", approved_by: user.id, updated_at: new Date().toISOString(),
    }).eq("id", run_id);

    return j({ ok: true, shipments_created: created, ship_date: shipDate, cutoff_at: cutoff });
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function j(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }