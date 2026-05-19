// Lindy-push ingest endpoint for The Kennel.
// Accepts batched performance snapshots and/or recommendations.
// HMAC-SHA256 verified via header `x-kennel-signature: sha256=<hex>` over the raw request body.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const ingestHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-kennel-signature, x-kennel-request-id",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...ingestHeaders, "Content-Type": "application/json" },
  });
}

async function verifySignature(secret: string, body: string, header: string | null): Promise<boolean> {
  if (!header) return false;
  const provided = header.startsWith("sha256=") ? header.slice(7) : header;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expected.length !== provided.length) return false;
  // constant-time compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: ingestHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const secret = Deno.env.get("KENNEL_INGEST_SECRET");
  if (!secret) return json({ error: "ingest secret not configured" }, 500);

  const raw = await req.text();
  const ok = await verifySignature(secret, raw, req.headers.get("x-kennel-signature"));
  if (!ok) return json({ error: "invalid signature" }, 401);

  let body: any;
  try { body = JSON.parse(raw); } catch { return json({ error: "invalid json" }, 400); }

  const requestId = req.headers.get("x-kennel-request-id") ?? body?.request_id ?? crypto.randomUUID();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const result = { request_id: requestId, snapshots_upserted: 0, recommendations_inserted: 0, errors: [] as string[] };
  const diagnostics = {
    snapshots_received: 0,
    snapshots_skipped: 0,
    unknown_channels: [] as string[],
    missing_date: 0,
    known_channels: [] as string[],
  };

  // 1) Resolve channels by name -> id
  const { data: channels, error: chErr } = await supabase.from("ad_channels").select("id,name");
  if (chErr) return json({ error: "channel lookup failed", details: chErr.message }, 500);
  // Build an alias-tolerant lookup. Lindy may send "Meta" / "meta_ads" / "facebook"
  // while the canonical DB names are "Meta Ads" / "Google Ads" / etc.
  const channelByName = new Map<string, string>();
  const aliasGroups: Record<string, string[]> = {
    meta: ["meta", "meta ads", "meta_ads", "facebook", "fb", "facebook ads"],
    google: ["google", "google ads", "google_ads", "gads", "adwords"],
    instacart: ["instacart", "instacart ads", "instacart_ads", "ic"],
    yahoo: ["yahoo", "yahoo dsp", "yahoo_dsp", "ydsp"],
  };
  for (const c of channels ?? []) {
    const canon = String(c.name).toLowerCase();
    channelByName.set(canon, c.id);
    // Also register every alias whose canonical token appears in the channel name.
    for (const aliases of Object.values(aliasGroups)) {
      if (aliases.some((a) => canon.includes(a))) {
        for (const a of aliases) channelByName.set(a, c.id);
      }
    }
  }
  diagnostics.known_channels = Array.from(new Set(channelByName.keys()));
  const resolveChannel = (raw: unknown): string | null => {
    if (!raw) return null;
    const key = String(raw).trim().toLowerCase();
    return channelByName.get(key) ?? null;
  };

  // 2) Performance snapshots: [{ channel, date, spend, impressions, clicks, conversions, revenue }]
  const snapshots: any[] = Array.isArray(body?.performance) ? body.performance : [];
  diagnostics.snapshots_received = snapshots.length;
  if (snapshots.length) {
    const rows = snapshots
      .map((s) => {
        const cid = resolveChannel(s.channel);
        if (!cid) {
          diagnostics.snapshots_skipped++;
          diagnostics.unknown_channels.push(String(s.channel ?? "(missing)"));
          return null;
        }
        if (!s.date) {
          diagnostics.snapshots_skipped++;
          diagnostics.missing_date++;
          return null;
        }
        return {
          channel_id: cid,
          date: s.date,
          spend: Number(s.spend ?? 0),
          impressions: Number(s.impressions ?? 0),
          clicks: Number(s.clicks ?? 0),
          conversions: Number(s.conversions ?? 0),
          revenue: Number(s.revenue ?? 0),
          source: "lindy",
          ingest_request_id: `${requestId}:${cid}:${s.date}`,
        };
      })
      .filter(Boolean) as any[];

    if (rows.length) {
      const { error } = await supabase
        .from("ad_performance_daily")
        .upsert(rows, { onConflict: "channel_id,date" });
      if (error) result.errors.push(`performance: ${error.message}`);
      else result.snapshots_upserted = rows.length;
    }

    // Update channel_sync_status for each channel touched
    const touched = new Set(rows.map((r) => r.channel_id));
    for (const cid of touched) {
      await supabase.from("channel_sync_status").upsert(
        {
          channel_id: cid,
          last_primary_sync: new Date().toISOString(),
          last_sync_source: "lindy",
          sync_status: "fresh",
          error_message: null,
        },
        { onConflict: "channel_id" },
      );
    }
  }

  // 3) Recommendations: [{ channel?, kind, title, summary, rationale?, projected_impact_cents, confidence, expires_at?, payload? }]
  const recs: any[] = Array.isArray(body?.recommendations) ? body.recommendations : [];
  if (recs.length) {
    const rows = recs.map((r, i) => ({
      channel_id: resolveChannel(r.channel),
      kind: String(r.kind ?? "adjustment"),
      title: String(r.title ?? "Untitled recommendation"),
      summary: String(r.summary ?? ""),
      rationale: r.rationale ?? null,
      projected_impact_cents: Math.round(Number(r.projected_impact_cents ?? 0)),
      confidence: Math.max(0, Math.min(1, Number(r.confidence ?? 0))),
      expires_at: r.expires_at ?? null,
      payload: r.payload ?? {},
      source: "lindy",
      ingest_request_id: `${requestId}:rec:${i}`,
    }));
    const { error, count } = await supabase
      .from("ad_recommendations")
      .upsert(rows, { onConflict: "ingest_request_id", count: "exact" });
    if (error) result.errors.push(`recommendations: ${error.message}`);
    else result.recommendations_inserted = count ?? rows.length;
  }

  return json({ ...result, diagnostics }, result.errors.length ? 207 : 200);
});