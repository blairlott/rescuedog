import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PIXEL_PROBE_URL = `${(Deno.env.get("PUBLIC_SITE_URL") ?? "https://shopify-buddy-b2b.lovable.app")}/`;
const PIXEL_MARKERS = ["d.impactradius-event.com", "ire(", "impact.com", "ad.invoc.us"];

type CheckRow = {
  check_type: string;
  target?: string | null;
  ambassador_profile_id?: string | null;
  status: "ok" | "warning" | "error";
  http_status?: number | null;
  latency_ms?: number | null;
  message?: string | null;
  details?: Record<string, unknown>;
};

async function timedFetch(url: string, init?: RequestInit) {
  const start = performance.now();
  try {
    const res = await fetch(url, { redirect: "follow", ...init });
    const latency = Math.round(performance.now() - start);
    return { res, latency, error: null as Error | null };
  } catch (err) {
    const latency = Math.round(performance.now() - start);
    return { res: null, latency, error: err as Error };
  }
}

async function checkSitePixel(): Promise<CheckRow> {
  const { res, latency, error } = await timedFetch(PIXEL_PROBE_URL);
  if (error || !res) {
    return { check_type: "site_pixel", target: PIXEL_PROBE_URL, status: "error", latency_ms: latency, message: `Site unreachable: ${error?.message ?? "unknown"}` };
  }
  if (!res.ok) {
    return { check_type: "site_pixel", target: PIXEL_PROBE_URL, status: "error", latency_ms: latency, http_status: res.status, message: `Homepage returned ${res.status}` };
  }
  const html = await res.text();
  const matched = PIXEL_MARKERS.filter((m) => html.includes(m));
  if (matched.length === 0) {
    return { check_type: "site_pixel", target: PIXEL_PROBE_URL, status: "error", latency_ms: latency, http_status: res.status, message: "impact.com pixel markers not found in homepage HTML", details: { markers_checked: PIXEL_MARKERS } };
  }
  return { check_type: "site_pixel", target: PIXEL_PROBE_URL, status: "ok", latency_ms: latency, http_status: res.status, message: `Pixel detected (${matched.length} marker${matched.length > 1 ? "s" : ""})`, details: { matched } };
}

async function checkAmbassadorLink(profile: { id: string; handle: string; impact_tracking_url: string }): Promise<CheckRow> {
  const url = profile.impact_tracking_url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { check_type: "ambassador_link", target: url, ambassador_profile_id: profile.id, status: "error", message: "Invalid URL format" };
  }
  const isImpact = /\.pxf\.io$|impact-cdn\.com$|impact\.com$|impactradius/i.test(parsed.hostname);
  const { res, latency, error } = await timedFetch(url, { method: "HEAD" });
  if (error || !res) {
    return { check_type: "ambassador_link", target: url, ambassador_profile_id: profile.id, status: "error", latency_ms: latency, message: `Link unreachable: ${error?.message ?? "unknown"}` };
  }
  if (res.status >= 400) {
    return { check_type: "ambassador_link", target: url, ambassador_profile_id: profile.id, status: "error", latency_ms: latency, http_status: res.status, message: `HEAD returned ${res.status}` };
  }
  if (!isImpact) {
    return { check_type: "ambassador_link", target: url, ambassador_profile_id: profile.id, status: "warning", latency_ms: latency, http_status: res.status, message: "URL hostname does not match a known impact.com pattern", details: { hostname: parsed.hostname } };
  }
  return { check_type: "ambassador_link", target: url, ambassador_profile_id: profile.id, status: "ok", latency_ms: latency, http_status: res.status, message: `OK (${parsed.hostname})` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const checks: CheckRow[] = [];
    checks.push(await checkSitePixel());

    const { data: ambassadors } = await supabase
      .from("ambassador_profiles")
      .select("id,handle,impact_tracking_url")
      .eq("status", "active")
      .not("impact_tracking_url", "is", null);

    for (const a of ambassadors ?? []) {
      if (!a.impact_tracking_url) continue;
      checks.push(await checkAmbassadorLink(a as any));
    }

    if (checks.length > 0) {
      await supabase.from("impact_health_checks").insert(checks);
    }

    const summary = {
      total: checks.length,
      ok: checks.filter((c) => c.status === "ok").length,
      warning: checks.filter((c) => c.status === "warning").length,
      error: checks.filter((c) => c.status === "error").length,
    };
    const overall: "ok" | "warning" | "error" = summary.error > 0 ? "error" : summary.warning > 0 ? "warning" : "ok";

    return new Response(JSON.stringify({ overall, summary, checks }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("impact-health-check error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});