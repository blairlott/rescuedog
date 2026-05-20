// Instacart Ads — CSV report ingest + Partner-API stub.
// Mode "csv": accepts a CSV (Ads Manager export) and upserts campaigns + keywords + search-terms.
// Mode "sync": placeholder for Partner API; returns 501 until INSTACART_PARTNER_API_TOKEN is set.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const split = (line: string) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { q = !q; continue; }
      if (c === "," && !q) { out.push(cur); cur = ""; continue; }
      cur += c;
    }
    out.push(cur); return out;
  };
  const headers = split(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? "").trim(); });
    return row;
  });
}

const cents = (v: string | undefined) => {
  if (!v) return 0;
  const n = Number(v.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const num = (v: string | undefined) => {
  if (!v) return 0;
  const n = Number(v.replace(/[,]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return J(401, { error: "Unauthorized" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: claims, error: cErr } = await supabase.auth.getClaims(auth.replace("Bearer ", ""));
    if (cErr || !claims?.claims?.sub) return J(401, { error: "Unauthorized" });

    // Authorization: ad_ops only
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", claims.claims.sub);
    const allowed = (roles ?? []).some((r: any) => ["owner", "admin", "ad_ops_manager"].includes(r.role));
    if (!allowed) return J(403, { error: "Forbidden" });

    const body = await req.json().catch(() => ({} as any));
    const mode = body.mode as string;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    if (mode === "sync") {
      const token = Deno.env.get("INSTACART_PARTNER_API_TOKEN");
      if (!token) {
        return J(200, {
          ok: false,
          partner_api_enabled: false,
          message: "Instacart Partner API token not configured. Apply via your Instacart rep, then add INSTACART_PARTNER_API_TOKEN.",
        });
      }
      // Future: call partner endpoints here.
      return J(501, { error: "Partner API integration not yet implemented" });
    }

    if (mode === "csv") {
      const csv = String(body.csv ?? "");
      const kind = String(body.kind ?? "campaigns"); // campaigns | keywords | search_terms
      const rows = parseCsv(csv);
      if (!rows.length) return J(400, { error: "No rows found in CSV" });

      let inserted = 0, updated = 0;
      const now = new Date().toISOString();

      if (kind === "campaigns") {
        for (const r of rows) {
          const ext = r.campaign_id || r.id || r.campaign_name;
          if (!ext) continue;
          const payload = {
            platform_slug: "instacart",
            external_id: ext,
            name: r.campaign_name || r.name || ext,
            status: (r.status || "unknown").toLowerCase(),
            objective: r.objective || r.goal || null,
            daily_budget_cents: cents(r.daily_budget),
            spend_mtd_cents: cents(r.spend),
            sales_mtd_cents: cents(r.attributed_sales || r.sales),
            impressions_mtd: num(r.impressions),
            clicks_mtd: num(r.clicks),
            conversions_mtd: num(r.conversions || r.orders),
            last_synced_at: now,
          };
          const { data, error } = await admin
            .from("ad_campaigns")
            .upsert(payload, { onConflict: "platform_slug,external_id" })
            .select("id, created_at");
          if (error) throw error;
          if (data?.[0]) (data[0].created_at === data[0].created_at ? inserted++ : updated++);
        }
      } else if (kind === "keywords") {
        for (const r of rows) {
          const ext = r.keyword_id || `${r.campaign_name}::${r.keyword}::${r.match_type || "broad"}`;
          if (!r.keyword) continue;
          const payload = {
            platform_slug: "instacart",
            external_id: ext,
            keyword: r.keyword,
            match_type: (r.match_type || "broad").toLowerCase(),
            status: (r.status || "enabled").toLowerCase(),
            bid_cents: cents(r.bid || r.max_bid),
            impressions_30d: num(r.impressions),
            clicks_30d: num(r.clicks),
            spend_30d_cents: cents(r.spend),
            conversions_30d: num(r.conversions || r.orders),
            sales_30d_cents: cents(r.attributed_sales || r.sales),
            last_synced_at: now,
          };
          const { error } = await admin
            .from("ad_keywords")
            .upsert(payload, { onConflict: "platform_slug,external_id" });
          if (error) throw error;
          inserted++;
        }
      } else if (kind === "search_terms") {
        for (const r of rows) {
          if (!r.search_term && !r.query) continue;
          const payload = {
            platform_slug: "instacart",
            query: r.search_term || r.query,
            impressions: num(r.impressions),
            clicks: num(r.clicks),
            spend_cents: cents(r.spend),
            conversions: num(r.conversions || r.orders),
            sales_cents: cents(r.attributed_sales || r.sales),
          };
          const { error } = await admin.from("ad_search_terms").insert(payload);
          if (error) throw error;
          inserted++;
        }
      } else {
        return J(400, { error: `Unknown kind: ${kind}` });
      }

      return J(200, { ok: true, inserted, updated, rows: rows.length });
    }

    return J(400, { error: "Unknown mode" });
  } catch (e: any) {
    console.error("instacart-ads-ingest error", e);
    return J(500, { error: e?.message ?? "Server error" });
  }
});