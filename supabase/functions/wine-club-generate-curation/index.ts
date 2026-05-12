import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body { run_id?: string; season?: string; ship_window_start?: string; ship_window_end?: string; }

const SEASON_HINTS: Record<string, string> = {
  spring: "Bright, food-friendly whites and lighter reds (Sauvignon Blanc, Pinot Noir, rosé). Avoid heavy oak.",
  summer: "Crisp whites, sparkling, rosé, lighter chillable reds. Avoid heavy tannic reds.",
  fall: "Medium-bodied reds, earthy varietals, pinot noir, syrah, sangiovese. Some richer whites.",
  winter: "Bold reds: cabernet, malbec, zinfandel, GSM blends. Rich whites like oaked chardonnay.",
  holiday: "Sparkling, dessert wines, special-occasion bold reds, gift-worthy bottles.",
};

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

    const body = (await req.json().catch(() => ({}))) as Body;
    let runId = body.run_id;
    if (!runId) {
      if (!body.season || !body.ship_window_start || !body.ship_window_end) return j({ error: "season + window required" }, 400);
      const ins = await svc.from("wine_club_curation_runs").insert({
        season: body.season, ship_window_start: body.ship_window_start, ship_window_end: body.ship_window_end,
        status: "draft", created_by: user.id, ai_model: "google/gemini-2.5-pro",
      }).select("id").single();
      if (ins.error) return j({ error: ins.error.message }, 500);
      runId = ins.data.id;
    }

    const { data: run } = await svc.from("wine_club_curation_runs").select("*").eq("id", runId).single();
    if (!run) return j({ error: "Run not found" }, 404);

    const [{ data: tiers }, { data: wines }] = await Promise.all([
      svc.from("wine_club_tiers").select("id,name,bottle_count,wine_type,description").eq("is_active", true),
      svc.from("wine_products").select("id,handle,title,varietal,vintage,tasting_notes,tags,price_cents,club_price_cents,image_url")
        .eq("is_active", true).eq("in_stock", true).limit(200),
    ]);
    if (!tiers || !wines || wines.length === 0) return j({ error: "No tiers or wines available" }, 400);

    const seasonHint = SEASON_HINTS[run.season.toLowerCase()] ?? "Balanced selection appropriate for the season.";
    const wineCatalog = wines.map((w) => ({ id: w.id, handle: w.handle, title: w.title, varietal: w.varietal, vintage: w.vintage, notes: w.tasting_notes, tags: w.tags, price: (w.price_cents/100).toFixed(2) }));

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return j({ error: "AI gateway key missing" }, 500);

    const allPicks: any[] = [];
    for (const tier of tiers) {
      const prompt = `You are a sommelier curating a ${run.season} wine club shipment.\nSeason guidance: ${seasonHint}\nTier: "${tier.name}" — ${tier.bottle_count} bottles, wine type filter: ${tier.wine_type}.\nDescription: ${tier.description ?? ""}\n\nFrom this catalog, choose exactly ${tier.bottle_count} bottles (use quantities to repeat if useful, total quantities must equal ${tier.bottle_count}). Respect the wine_type filter (red/white/mixed/sparkling). Prefer in-season styles. Provide a one-sentence rationale per pick.\n\nReturn ONLY JSON: {"picks":[{"handle":"...","quantity":1,"role":"hero|pairing|stretch","rationale":"..."}]}\n\nCATALOG:\n${JSON.stringify(wineCatalog).slice(0, 12000)}`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        }),
      });
      if (!aiRes.ok) {
        console.error("AI fail", await aiRes.text());
        continue;
      }
      const aiJson = await aiRes.json();
      const content = aiJson.choices?.[0]?.message?.content ?? "{}";
      let parsed: any;
      try { parsed = JSON.parse(content); } catch { continue; }
      const picks = Array.isArray(parsed.picks) ? parsed.picks : [];
      let order = 0;
      for (const p of picks) {
        const w = wines.find((x) => x.handle === p.handle);
        if (!w) continue;
        allPicks.push({
          run_id: runId, tier_id: tier.id, wine_product_id: w.id,
          product_handle: w.handle, product_title: w.title, product_image_url: w.image_url,
          price_cents: w.club_price_cents ?? w.price_cents,
          quantity: Math.max(1, Math.min(tier.bottle_count, Number(p.quantity) || 1)),
          role: ["hero","pairing","stretch"].includes(p.role) ? p.role : "hero",
          ai_rationale: String(p.rationale ?? "").slice(0, 500),
          sort_order: order++,
        });
      }
    }

    await svc.from("wine_club_curation_picks").delete().eq("run_id", runId);
    if (allPicks.length > 0) {
      const ins = await svc.from("wine_club_curation_picks").insert(allPicks);
      if (ins.error) return j({ error: ins.error.message }, 500);
    }
    await svc.from("wine_club_curation_runs").update({ status: "proposed", updated_at: new Date().toISOString() }).eq("id", runId);
    return j({ ok: true, run_id: runId, picks_count: allPicks.length });
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function j(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }