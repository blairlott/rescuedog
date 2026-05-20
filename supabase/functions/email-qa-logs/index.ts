// Admin-gated email log reader for the CMS Email QA page.
// Returns deduplicated rows (latest status per message_id) plus summary stats
// and the list of registered template names.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { TEMPLATES } from "../_shared/transactional-email-templates/registry.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (s: number, b: unknown) =>
    new Response(JSON.stringify(b), {
      status: s,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: u } = await sb.auth.getUser(token);
    const userId = u?.user?.id;
    if (!userId) return json(401, { error: "unauthorized" });
    const { data: ok } = await sb.rpc("is_admin_or_owner", { _user_id: userId });
    if (!ok) return json(403, { error: "forbidden" });

    const url = new URL(req.url);
    const hours = Math.min(Number(url.searchParams.get("hours") ?? "168"), 24 * 30);
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

    const { data: rows, error } = await sb
      .from("email_send_log")
      .select("id, message_id, template_name, recipient_email, status, error_message, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;

    // Dedup: keep latest row per message_id (rows are already DESC).
    const seen = new Set<string>();
    const deduped: any[] = [];
    for (const r of rows ?? []) {
      const key = r.message_id ?? r.id;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
    }

    const stats = { total: deduped.length, sent: 0, pending: 0, failed: 0, dlq: 0, suppressed: 0 };
    for (const r of deduped) {
      if (r.status in stats) (stats as any)[r.status]++;
      else if (r.status === "bounced" || r.status === "complained") stats.failed++;
    }

    return json(200, {
      ok: true,
      stats,
      logs: deduped.slice(0, 200),
      templates: Object.keys(TEMPLATES).sort(),
    });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});