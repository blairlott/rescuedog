// Phase 1c scaffold: pull-based native sync for each ad channel.
// Calls each platform only when its credentials are present; otherwise records a "skipped" status.
// Real platform integrations land in subsequent phases — this establishes the cron entry point.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type SyncResult = { channel: string; status: "ok" | "skipped" | "error"; reason?: string; rows?: number };

async function syncChannel(name: string, env: string[]): Promise<SyncResult> {
  for (const k of env) if (!Deno.env.get(k)) {
    return { channel: name, status: "skipped", reason: `missing ${k}` };
  }
  // TODO: implement real fetch per platform.
  return { channel: name, status: "ok", rows: 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const targets = [
    { name: "Meta", env: ["META_ADS_ACCESS_TOKEN"] },
    { name: "Google", env: ["GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_DEVELOPER_TOKEN"] },
    { name: "Instacart", env: ["INSTACART_ADS_TOKEN"] },
    { name: "Vinoshipper", env: ["VINOSHIPPER_API_KEY_ID", "VINOSHIPPER_API_SECRET"] },
  ];

  const results: SyncResult[] = [];
  for (const t of targets) results.push(await syncChannel(t.name, t.env));

  for (const r of results) {
    const { data: ch } = await admin.from("ad_channels").select("id").ilike("name", r.channel).maybeSingle();
    if (!ch) continue;
    await admin.from("channel_sync_status").upsert(
      {
        channel_id: ch.id,
        last_backup_sync: r.status === "ok" ? new Date().toISOString() : null,
        last_sync_source: "backup_cron",
        sync_status: r.status === "ok" ? "fresh" : r.status === "skipped" ? "pending" : "error",
        error_message: r.reason ?? null,
      },
      { onConflict: "channel_id" },
    );
  }

  return new Response(JSON.stringify({ ran_at: new Date().toISOString(), results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});