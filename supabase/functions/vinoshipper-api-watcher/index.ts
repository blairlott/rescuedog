// Polls Vinoshipper for API changes: fetches their Swagger/OpenAPI spec,
// re-runs endpoint probes, diffs against the last snapshot, writes diffs
// to vinoshipper_api_changelog, and (when the feature flag is on) emails
// admins about new changes.
//
// Safe to invoke manually at any time — diffing/logging always happens.
// Email + cron behavior is gated by feature flag `vs_api_watcher_enabled`.
//
// Triggers:
//   - Manual: POST from admin UI (requires admin role)
//   - Cron:   pg_net daily, authenticated with service role bearer

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VS_BASE = "https://vinoshipper.com";
const SPEC_CANDIDATES = [
  `${VS_BASE}/api/docs/swagger.json`,
  `${VS_BASE}/api/v3/swagger.json`,
  `${VS_BASE}/api/swagger.json`,
  `${VS_BASE}/api/v3/openapi.json`,
  `${VS_BASE}/api/openapi.json`,
];

const PROBE_ENDPOINTS: Array<{ label: string; method: string; path: string }> = [
  { label: "list_clubs",            method: "GET", path: "/api/v3/p/clubs" },
  { label: "list_products",         method: "GET", path: "/api/v3/p/products" },
  { label: "create_customer",       method: "OPTIONS", path: "/api/v3/p/customers" },
  { label: "create_order",          method: "OPTIONS", path: "/api/v3/orders" },
  { label: "membership_next_ship", method: "OPTIONS", path: "/api/v3/p/memberships/0/next-shipment" },
  { label: "membership_skip",       method: "OPTIONS", path: "/api/v3/p/memberships/0/skip" },
  { label: "customer_payment_methods", method: "OPTIONS", path: "/api/v3/p/customers/0/payment-methods" },
];

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function extractEndpoints(spec: any): Record<string, string[]> {
  // Returns { "/path": ["GET","POST",...] }
  const out: Record<string, string[]> = {};
  const paths = spec?.paths ?? {};
  for (const [p, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== "object") continue;
    out[p] = Object.keys(methods as Record<string, unknown>)
      .filter(m => ["get", "post", "put", "patch", "delete"].includes(m.toLowerCase()))
      .map(m => m.toUpperCase())
      .sort();
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE);

  // Auth: allow either an admin user OR a service-role bearer (cron).
  const authHeader = req.headers.get("Authorization") || "";
  let isAuthorized = false;
  if (authHeader.includes(SERVICE)) {
    isAuthorized = true;
  } else if (authHeader) {
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (user) {
      const { data: ok } = await userClient.rpc("is_admin_or_owner", { _user_id: user.id });
      if (ok) isAuthorized = true;
    }
  }
  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const keyId = Deno.env.get("VINOSHIPPER_API_KEY_ID");
  const secret = Deno.env.get("VINOSHIPPER_API_SECRET");
  const vsAuth = keyId && secret ? `Basic ${btoa(`${keyId}:${secret}`)}` : null;

  // 1) Try to fetch a Swagger/OpenAPI spec.
  let spec: any = null;
  let specUrl: string | null = null;
  let specRaw = "";
  for (const url of SPEC_CANDIDATES) {
    try {
      const r = await fetch(url, { headers: vsAuth ? { Authorization: vsAuth } : {} });
      if (!r.ok) continue;
      const ct = r.headers.get("content-type") || "";
      const text = await r.text();
      if (!ct.includes("json") && !text.trim().startsWith("{")) continue;
      spec = JSON.parse(text);
      specUrl = url;
      specRaw = text;
      break;
    } catch { /* keep trying */ }
  }

  // 2) Probe candidate endpoints (status codes).
  const probeResults: Array<{ label: string; method: string; path: string; status: number }> = [];
  if (vsAuth) {
    for (const p of PROBE_ENDPOINTS) {
      try {
        const r = await fetch(`${VS_BASE}${p.path}`, {
          method: p.method,
          headers: { Authorization: vsAuth, "Content-Type": "application/json" },
        });
        probeResults.push({ ...p, status: r.status });
      } catch {
        probeResults.push({ ...p, status: 0 });
      }
    }
  }

  const specHash = spec
    ? await sha256Hex(JSON.stringify(spec))
    : await sha256Hex("noSpec:" + JSON.stringify(probeResults));

  // 3) Compare against previous snapshot.
  const { data: prevRows } = await admin
    .from("vinoshipper_api_snapshots")
    .select("id, spec_hash, spec_json, probe_results")
    .order("fetched_at", { ascending: false })
    .limit(1);
  const prev = prevRows?.[0];

  const newChanges: Array<{
    change_type: string; endpoint_path?: string; endpoint_method?: string;
    summary: string; details: any;
  }> = [];

  if (!prev) {
    newChanges.push({
      change_type: "spec_first_seen",
      summary: spec
        ? `Baseline Vinoshipper API spec captured from ${specUrl} — ${Object.keys(spec.paths || {}).length} endpoints.`
        : `Baseline captured. No OpenAPI spec discoverable; probing ${probeResults.length} endpoints directly.`,
      details: { specUrl, probeCount: probeResults.length },
    });
  } else if (prev.spec_hash !== specHash) {
    // Spec diff
    if (spec && prev.spec_json) {
      const before = extractEndpoints(prev.spec_json);
      const after = extractEndpoints(spec);
      const allPaths = new Set([...Object.keys(before), ...Object.keys(after)]);
      for (const p of allPaths) {
        if (!(p in before)) {
          for (const m of after[p]) {
            newChanges.push({
              change_type: "endpoint_added",
              endpoint_path: p, endpoint_method: m,
              summary: `New endpoint: ${m} ${p}`,
              details: {},
            });
          }
        } else if (!(p in after)) {
          for (const m of before[p]) {
            newChanges.push({
              change_type: "endpoint_removed",
              endpoint_path: p, endpoint_method: m,
              summary: `Removed endpoint: ${m} ${p}`,
              details: {},
            });
          }
        } else {
          const added = after[p].filter(m => !before[p].includes(m));
          const removed = before[p].filter(m => !after[p].includes(m));
          for (const m of added) newChanges.push({
            change_type: "endpoint_added", endpoint_path: p, endpoint_method: m,
            summary: `New method on existing endpoint: ${m} ${p}`, details: {},
          });
          for (const m of removed) newChanges.push({
            change_type: "endpoint_removed", endpoint_path: p, endpoint_method: m,
            summary: `Removed method: ${m} ${p}`, details: {},
          });
        }
      }
    }
    // Probe flips
    const prevProbes: any[] = (prev.probe_results as any) ?? [];
    const prevMap = new Map(prevProbes.map((p: any) => [`${p.method} ${p.path}`, p.status]));
    for (const p of probeResults) {
      const key = `${p.method} ${p.path}`;
      const before = prevMap.get(key);
      if (before === undefined) continue;
      const becameLive = before === 404 && p.status !== 404 && p.status !== 0;
      const wentAway = before !== 404 && before !== 0 && p.status === 404;
      if (becameLive || wentAway) {
        newChanges.push({
          change_type: "probe_flip",
          endpoint_path: p.path, endpoint_method: p.method,
          summary: becameLive
            ? `Endpoint ${p.method} ${p.path} is now LIVE (was 404, now ${p.status})`
            : `Endpoint ${p.method} ${p.path} no longer responding (was ${before}, now 404)`,
          details: { before, after: p.status, label: p.label },
        });
      }
    }
    if (newChanges.length === 0) {
      newChanges.push({
        change_type: "endpoint_changed",
        summary: "Spec content changed but no endpoint additions/removals detected (descriptions or schemas may have changed).",
        details: {},
      });
    }
  }

  // 4) Persist snapshot + changelog rows.
  const { data: snap, error: snapErr } = await admin
    .from("vinoshipper_api_snapshots")
    .insert({
      source: spec ? "openapi" : "probe_only",
      source_url: specUrl,
      spec_hash: specHash,
      spec_json: spec,
      probe_results: probeResults,
    })
    .select("id").single();
  if (snapErr) {
    return new Response(JSON.stringify({ error: "snapshot_failed", details: snapErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let insertedChanges: any[] = [];
  if (newChanges.length > 0) {
    const rows = newChanges.map(c => ({ ...c, snapshot_id: snap.id }));
    const { data: inserted } = await admin
      .from("vinoshipper_api_changelog").insert(rows).select("*");
    insertedChanges = inserted ?? [];
  }

  // 5) Optionally email admins (only if flag on, not first snapshot, and changes exist).
  const { data: flag } = await admin.from("feature_flags")
    .select("enabled").eq("key", "vs_api_watcher_enabled").maybeSingle();
  const emailEnabled = !!flag?.enabled && !!prev && insertedChanges.length > 0;

  let emailedTo: string[] = [];
  if (emailEnabled) {
    // Collect admin/owner emails.
    const { data: admins } = await admin
      .from("user_roles").select("user_id, role")
      .in("role", ["admin", "owner"]);
    const ids = Array.from(new Set((admins ?? []).map(a => a.user_id)));
    const { data: profiles } = await admin
      .from("profiles").select("id, email").in("id", ids);
    const emails = (profiles ?? []).map(p => p.email).filter(Boolean) as string[];

    for (const email of emails) {
      try {
        await admin.functions.invoke("send-transactional-email", {
          body: {
            templateName: "vs-api-update",
            recipientEmail: email,
            idempotencyKey: `vs-api-update-${snap.id}-${email}`,
            templateData: {
              changeCount: insertedChanges.length,
              changes: insertedChanges.slice(0, 25).map((c: any) => ({
                summary: c.summary,
                type: c.change_type,
                path: c.endpoint_path,
                method: c.endpoint_method,
              })),
              dashboardUrl: `${Deno.env.get("PUBLIC_SITE_URL") ?? "https://rescuedog.lovable.app"}/crm/vinoshipper-api`,
            },
          },
        });
        emailedTo.push(email);
      } catch (e) {
        console.error("vs-api-update email failed for", email, e);
      }
    }
    if (emailedTo.length > 0) {
      await admin.from("vinoshipper_api_changelog")
        .update({ email_sent_at: new Date().toISOString() })
        .in("id", insertedChanges.map(c => c.id));
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    snapshot_id: snap.id,
    spec_source: specUrl,
    spec_hash: specHash,
    probe_count: probeResults.length,
    changes_recorded: insertedChanges.length,
    email_enabled: emailEnabled,
    emailed_to: emailedTo,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});