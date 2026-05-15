import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const AUTO_PUBLISH_THRESHOLD = 0.85;

type ParsedLine = {
  account_name: string;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  premise_type?: "on" | "off" | null;
  sku?: string | null;
  cases?: number | null;
  units?: number | null;
  confidence: number;
};

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { "User-Agent": "RescueDogWines/1.0 (locator)" } });
    if (!res.ok) return null;
    const j = await res.json();
    if (!Array.isArray(j) || j.length === 0) return null;
    return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) };
  } catch {
    return null;
  }
}

async function aiParse(rawText: string): Promise<{ lines: ParsedLine[]; summary: string }> {
  const system = `You are a beverage-distributor depletion-report parser. Extract every retailer/restaurant line from the input and return strict JSON: {"summary": string, "lines": [{account_name, street_address, city, state, zip, phone, premise_type ("on" for restaurants/bars, "off" for retail/grocery/liquor), sku, cases (number), units (number), confidence (0-1)}]}. Skip header rows, totals, and distributor-internal rows. Confidence reflects how certain you are this is a real, geocodable on/off-premise account with a usable address.`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        { role: "user", content: rawText.slice(0, 100_000) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const content = j.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(content);
  return { lines: Array.isArray(parsed.lines) ? parsed.lines : [], summary: parsed.summary ?? "" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "no auth" }), { status: 401, headers: corsHeaders });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });

  const { data: isSales } = await userClient.rpc("is_sales_team", { _user_id: user.id });
  if (!isSales) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });

  let body: { filename: string; raw_text: string; distributor?: string; period_label?: string };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "bad json" }), { status: 400, headers: corsHeaders }); }
  if (!body.filename || !body.raw_text || body.raw_text.length < 10) {
    return new Response(JSON.stringify({ error: "filename and raw_text required" }), { status: 400, headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: report, error: rErr } = await admin.from("depletion_reports").insert({
    filename: body.filename,
    distributor: body.distributor ?? null,
    period_label: body.period_label ?? null,
    status: "parsing",
    uploaded_by: user.id,
    raw_preview: body.raw_text.slice(0, 4000),
  }).select().single();
  if (rErr || !report) return new Response(JSON.stringify({ error: rErr?.message ?? "insert failed" }), { status: 500, headers: corsHeaders });

  try {
    const { lines, summary } = await aiParse(body.raw_text);

    let matched = 0, created = 0, unmatched = 0, autoPublished = 0;
    const { data: existing } = await admin.from("sales_accounts")
      .select("id, account_name, street_address, zip");
    const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const existingMap = new Map<string, string>();
    (existing ?? []).forEach((a: any) => {
      existingMap.set(norm(a.account_name) + "|" + norm(a.zip), a.id);
      existingMap.set(norm(a.account_name) + "|" + norm(a.street_address), a.id);
    });

    for (const line of lines) {
      const key1 = norm(line.account_name) + "|" + norm(line.zip);
      const key2 = norm(line.account_name) + "|" + norm(line.street_address);
      const matchId = existingMap.get(key1) ?? existingMap.get(key2) ?? null;

      let createdId: string | null = null;
      let lat: number | null = null, lng: number | null = null;
      let autoPub = false;
      let status: "matched" | "created" | "unmatched" = "unmatched";

      if (matchId) {
        status = "matched";
        matched++;
        await admin.from("sales_accounts").update({ last_order_date: new Date().toISOString().slice(0, 10) }).eq("id", matchId);
      } else if (line.confidence >= 0.5 && line.account_name && (line.zip || line.street_address)) {
        const addrParts = [line.street_address, line.city, line.state, line.zip].filter(Boolean).join(", ");
        if (addrParts) {
          const geo = await geocode(addrParts);
          if (geo) { lat = geo.lat; lng = geo.lng; }
        }
        autoPub = line.confidence >= AUTO_PUBLISH_THRESHOLD && lat != null && lng != null;
        const { data: newAcc } = await admin.from("sales_accounts").insert({
          account_name: line.account_name,
          street_address: line.street_address ?? null,
          city: line.city ?? null,
          state: line.state ?? "GA",
          zip: line.zip ?? null,
          phone: line.phone ?? null,
          premise_type: line.premise_type === "on" ? "on" : "off",
          status: "active",
          latitude: lat,
          longitude: lng,
          is_public: autoPub,
          last_verified_at: autoPub ? new Date().toISOString() : null,
          last_order_date: new Date().toISOString().slice(0, 10),
          notes: `Auto-imported from depletion report ${body.filename} (AI confidence ${line.confidence.toFixed(2)}).`,
          created_by: user.id,
        }).select("id").single();
        createdId = newAcc?.id ?? null;
        if (createdId) { created++; if (autoPub) autoPublished++; }
      } else {
        unmatched++;
      }

      await admin.from("depletion_report_lines").insert({
        report_id: report.id,
        raw_row: line as any,
        account_name: line.account_name,
        street_address: line.street_address ?? null,
        city: line.city ?? null,
        state: line.state ?? null,
        zip: line.zip ?? null,
        phone: line.phone ?? null,
        premise_type: line.premise_type ?? null,
        sku: line.sku ?? null,
        cases: line.cases ?? null,
        units: line.units ?? null,
        ai_confidence: line.confidence,
        match_status: status,
        matched_account_id: matchId,
        created_account_id: createdId,
        auto_published: autoPub,
        latitude: lat,
        longitude: lng,
      });
    }

    await admin.from("depletion_reports").update({
      status: "complete",
      total_lines: lines.length,
      matched_lines: matched,
      new_account_lines: created,
      unmatched_lines: unmatched,
      auto_published_count: autoPublished,
      ai_summary: summary,
    }).eq("id", report.id);

    return new Response(JSON.stringify({
      report_id: report.id, total: lines.length, matched, created, unmatched, auto_published: autoPublished, summary,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    await admin.from("depletion_reports").update({ status: "error", ai_summary: String(err?.message ?? err) }).eq("id", report.id);
    return new Response(JSON.stringify({ error: String(err?.message ?? err) }), { status: 500, headers: corsHeaders });
  }
});