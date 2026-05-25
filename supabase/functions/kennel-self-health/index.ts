// Kennel self-health pinger. Hits every critical kennel-* edge function with
// the cron secret + dry_run=true (where supported) and a tiny payload, logs
// status/latency to kennel_self_health, and fires kennel-alert-dispatch when
// a function has failed N consecutive runs.
//
// Auth: KENNEL_INGEST_SECRET in x-kennel-cron-secret OR ad-ops JWT.
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkSharedSecret } from "../_shared/cronAlert.ts";
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const CONSECUTIVE_FAILURE_ALERT_THRESHOLD = 2;

// Each target gets an HTTP method, optional body, and an "ok predicate" — most
// of these accept a no-op invocation via dry_run/diagnostic flags. Functions
// that require richer context (auth, signed bodies, OAuth catchers, page
// renderers, etc.) are deliberately omitted.
type Probe = {
  name: string;
  method?: "GET" | "POST";
  body?: unknown;
  expectStatusLte?: number;
};
const PROBES: Probe[] = [
  { name: "kennel-alert-health" },
  { name: "kennel-nightly-ingest",      method: "POST", body: { dry_run: true, probe: true } },
  { name: "kennel-ingest-meta",         method: "POST", body: { dry_run: true } },
  { name: "kennel-ingest-google",       method: "POST", body: { dry_run: true } },
  { name: "kennel-ingest-instacart",    method: "POST", body: { dry_run: true } },
  { name: "kennel-optimizer",           method: "POST", body: { dry_run: true, platform: "instacart" } },
  { name: "kennel-oci-backlog-alert",   method: "POST", body: { probe: true } },
  { name: "kennel-mailchimp-sync",      method: "POST", body: { dry_run: true } },
  { name: "kennel-recompute-bid-modifiers",  method: "POST", body: { dry_run: true } },
  { name: "kennel-recompute-geo-modifiers",  method: "POST", body: { dry_run: true } },
  { name: "kennel-recompute-seasonality",    method: "POST", body: { dry_run: true } },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ingestSecret = Deno.env.get("KENNEL_INGEST_SECRET")?.trim();
  const cronAuthorized = await checkSharedSecret(req, {
    functionName: "kennel-self-health",
    envVar: "KENNEL_INGEST_SECRET",
    headers: ["x-kennel-cron-secret", "x-cron-secret"],
    alertOnFail: false,
  });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!cronAuthorized) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: ok } = await userClient.rpc("is_ad_ops", { _user_id: user.id });
    if (!ok) return json({ error: "forbidden" }, 403);
  }

  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const results: any[] = [];

  for (const probe of PROBES) {
    const start = Date.now();
    let statusCode: number | null = null;
    let ok = false;
    let errorText: string | null = null;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-kennel-cron-secret": ingestSecret ?? "",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      };
      const init: RequestInit = {
        method: probe.method ?? "GET",
        headers,
        signal: AbortSignal.timeout(20_000),
      };
      if (probe.body !== undefined) init.body = JSON.stringify(probe.body);
      const r = await fetch(`${baseUrl}/functions/v1/${probe.name}`, init);
      statusCode = r.status;
      const limit = probe.expectStatusLte ?? 299;
      ok = r.status <= limit;
      if (!ok) {
        errorText = (await r.text().catch(() => "")).slice(0, 500);
      }
    } catch (e: any) {
      errorText = String(e?.message ?? e).slice(0, 500);
    }
    const latencyMs = Date.now() - start;

    // Look up consecutive failure count (most recent row for this function).
    const { data: prev } = await admin
      .from("kennel_self_health")
      .select("consecutive_failures, ok")
      .eq("function_name", probe.name)
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const consecutive = ok ? 0 : (Number(prev?.consecutive_failures ?? 0) + 1);
    const shouldAlert = !ok && consecutive >= CONSECUTIVE_FAILURE_ALERT_THRESHOLD;

    await admin.from("kennel_self_health").insert({
      function_name: probe.name,
      status_code: statusCode,
      ok,
      latency_ms: latencyMs,
      error: errorText,
      consecutive_failures: consecutive,
      alert_fired: shouldAlert,
    });

    if (shouldAlert) {
      try {
        await fetch(`${baseUrl}/functions/v1/kennel-alert-dispatch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            event_type: "anomaly",
            channel: "self_health",
            action: "edge_function_failing",
            confidence: 0.99,
            deep_link: "https://rescuedog.lovable.app/kennel/log",
            message: `${probe.name} failed ${consecutive} consecutive checks (HTTP ${statusCode ?? "n/a"}): ${errorText?.slice(0, 200) ?? "no body"}`,
          }),
        });
      } catch (_) { /* non-fatal */ }
    }

    results.push({ probe: probe.name, ok, status_code: statusCode, latency_ms: latencyMs, consecutive_failures: consecutive });
  }

  const failing = results.filter(r => !r.ok).length;
  return json({ ok: true, probed: results.length, failing, results });
});