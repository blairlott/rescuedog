// kennel-refresh-light: triggers a 7-day re-ingest across all ad platforms
// + Vinoshipper poll. Returns aggregate status. Called from the dashboard
// "Refresh" button.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function J(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return J(401, { error: "unauthorized" });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const user = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await user.auth.getUser();
  if (!u?.user) return J(401, { error: "unauthorized" });
  const { data: canView } = await admin.rpc("can_view_kennel", { _user_id: u.user.id });
  if (!canView) return J(403, { error: "forbidden" });

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const days = Math.min(Math.max(Number(body?.days ?? 7), 1), 30);

  const targets = [
    { name: "kennel-ingest-google",    body: { days } },
    { name: "kennel-ingest-meta",      body: { days } },
    { name: "kennel-ingest-instacart", body: { days } },
    { name: "vinoshipper-poll",        body: {} },
  ];

  const results = await Promise.allSettled(
    targets.map(async (t) => {
      const r = await admin.functions.invoke(t.name, { body: t.body });
      if (r.error) throw new Error(`${t.name}: ${r.error.message ?? r.error}`);
      return { name: t.name, ok: true, data: r.data };
    }),
  );

  const summary = results.map((r, i) =>
    r.status === "fulfilled"
      ? { name: targets[i].name, ok: true }
      : { name: targets[i].name, ok: false, error: String((r as PromiseRejectedResult).reason?.message ?? r.reason) },
  );
  const okCount = summary.filter((s) => s.ok).length;
  return J(200, { ok: true, refreshed_at: new Date().toISOString(), days, ok_count: okCount, summary });
});