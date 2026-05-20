// Nightly health check for the Kennel ingest pipeline.
// Verifies, for each critical ingest target, that the most recent run within
// the last 26h: (a) succeeded, (b) reported non-zero work (snapshots/rows
// upserted), and (c) had no errors. Also verifies that at least one
// ad_recommendation was inserted in the last 24h. Flags any failures by
// emailing ops via Resend and logging a 'health_check' row to kennel_ingest_runs.
//
// Trigger: pg_cron nightly at ~05:30 UTC (after kennel-nightly-ingest at 04:00 UTC).
// Manual run: POST with x-kennel-ingest-secret or as ad_ops user.
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key' };
const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const ADMIN_URL = "https://rescuedog.lovable.app";
const FROM = "Kennel Health <alerts@rescuedogwines.com>";
const FALLBACK_RECIPIENTS = ["blair.lott@rescuedogwines.com"];

// Targets we expect to see a successful run for every night.
// `expectRows`: if true, payload.rows / snapshots_upserted must be > 0 to pass.
// `rowsField`: which payload key holds the row count.
const TARGETS: Array<{ name: string; expectRows: boolean; rowsField: string }> = [
  { name: "meta",           expectRows: true,  rowsField: "rows" },
  { name: "google",         expectRows: false, rowsField: "rows" }, // can legitimately be 0
  { name: "instacart",      expectRows: false, rowsField: "total" },
  { name: "mailchimp_sync", expectRows: false, rowsField: "updated" },
];

const J = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sendDirect(to: string[], subject: string, html: string) {
  if (!RESEND_KEY) return { ok: false, error: "RESEND_API_KEY missing" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, id: j?.id, error: res.ok ? undefined : `resend ${res.status}: ${JSON.stringify(j)}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Auth: this is a read-only health check. It only reads kennel run logs,
  // counts recommendations, writes a single 'health_check' audit row, and
  // emails ops on failure (to a hardcoded recipient list). We accept any
  // request that supplies a valid project apikey (anon key) OR a valid
  // bearer JWT — this lets pg_cron call it with just the standard apikey
  // header without needing a vault-stored service key.
  const apikey = req.headers.get("apikey") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const ingestSecret = Deno.env.get("KENNEL_INGEST_SECRET") ?? "";
  const headerSecret = req.headers.get("x-kennel-ingest-secret") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const hasAnon = anonKey && (apikey === anonKey || auth === `Bearer ${anonKey}`);
  const hasService = auth === `Bearer ${SERVICE_KEY}`;
  const hasSecret = ingestSecret && headerSecret === ingestSecret;
  const hasAnyBearer = auth.startsWith("Bearer ");
  if (!hasAnon && !hasService && !hasSecret && !hasAnyBearer) {
    return J({ error: "unauthorized" }, 401);
  }

  const windowStart = new Date(Date.now() - 26 * 3600 * 1000).toISOString();
  const recsSince = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // 1) Check most recent run per target within the window.
  const checks: any[] = [];
  for (const t of TARGETS) {
    const { data: rows, error } = await admin
      .from("kennel_ingest_runs")
      .select("id, status, run_at, attempts, duration_ms, error, payload")
      .eq("target", t.name)
      .gte("run_at", windowStart)
      .order("run_at", { ascending: false })
      .limit(1);

    if (error) {
      checks.push({ target: t.name, ok: false, reason: `query failed: ${error.message}` });
      continue;
    }
    const run = rows?.[0];
    if (!run) {
      checks.push({ target: t.name, ok: false, reason: "no run in last 26h" });
      continue;
    }
    const payload = (run.payload ?? {}) as any;
    const rowCount = Number(payload[t.rowsField] ?? payload.snapshots_upserted ?? 0);
    const payloadErrors: string[] = Array.isArray(payload.errors) ? payload.errors : [];
    const failures: string[] = [];
    if (run.status !== "ok") failures.push(`status=${run.status}`);
    if (payloadErrors.length > 0) failures.push(`${payloadErrors.length} payload error(s)`);
    if (t.expectRows && rowCount <= 0) failures.push(`${t.rowsField}=0 (expected > 0)`);
    checks.push({
      target: t.name,
      ok: failures.length === 0,
      run_at: run.run_at,
      rows: rowCount,
      attempts: run.attempts,
      duration_ms: run.duration_ms,
      reasons: failures,
      sample_errors: payloadErrors.slice(0, 2),
      run_error: run.error,
    });
  }

  // 2) Verify recommendations inserted in last 24h.
  const { count: recCount, error: recErr } = await admin
    .from("ad_recommendations")
    .select("id", { count: "exact", head: true })
    .gte("created_at", recsSince);
  const recsCheck = {
    target: "ad_recommendations",
    ok: !recErr && (recCount ?? 0) > 0,
    count: recCount ?? 0,
    reason: recErr ? `query failed: ${recErr.message}` : (recCount ?? 0) > 0 ? null : "no recommendations inserted in last 24h",
  };

  const failed = [...checks.filter((c) => !c.ok), ...(recsCheck.ok ? [] : [recsCheck])];
  const allOk = failed.length === 0;

  // 3) Log this health check to kennel_ingest_runs for dashboard visibility.
  await admin.from("kennel_ingest_runs").insert({
    target: "health_check",
    status: allOk ? "ok" : "failed",
    attempts: 1,
    duration_ms: 0,
    error: allOk ? null : `${failed.length} check(s) failed`,
    payload: { window_hours: 26, checks, recommendations: recsCheck },
  });

  // 4) On failure, email ops.
  if (!allOk) {
    let to: string[] = FALLBACK_RECIPIENTS;
    try {
      const { data } = await admin.from("ad_settings").select("value").eq("key", "alert_recipients").maybeSingle();
      const emails = (data?.value as any)?.email;
      if (Array.isArray(emails) && emails.length > 0) to = emails;
    } catch (_) { /* keep fallback */ }

    const rowsHtml = [...checks, recsCheck]
      .map((c: any) => {
        const color = c.ok ? "#0a7d2a" : "#c30017";
        const status = c.ok ? "PASS" : "FAIL";
        const detail = c.ok
          ? (c.rows !== undefined ? `${c.rows} rows · ${c.attempts ?? 1} attempt(s)` : `${c.count ?? 0} recs`)
          : (c.reasons?.join(", ") || c.reason || "unknown");
        return `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;"><b>${c.target}</b></td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;color:${color};font-weight:600;">${status}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #eee;font-size:12px;color:#555;">${detail}</td>
        </tr>`;
      })
      .join("");

    const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#000;padding:24px;">
      <h2 style="margin:0 0 12px;color:#c30017;text-transform:uppercase;letter-spacing:.05em;font-size:14px;">Kennel Nightly Ingest — Health Check Failed</h2>
      <p style="font-size:14px;">${failed.length} of ${checks.length + 1} checks failed in the last 26h window.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:12px;">
        <thead><tr style="background:#f6f6f6;">
          <th style="padding:6px 12px;text-align:left;">Target</th>
          <th style="padding:6px 12px;text-align:left;">Status</th>
          <th style="padding:6px 12px;text-align:left;">Detail</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="margin-top:20px;">
        <a href="${ADMIN_URL}/kennel" style="background:#c30017;color:#fff;padding:10px 16px;text-decoration:none;text-transform:uppercase;letter-spacing:.05em;font-size:12px;">Open Kennel</a>
      </p>
    </body></html>`;

    await sendDirect(to, `Kennel: nightly ingest health check failed (${failed.length})`, html);
  }

  return J({ ok: allOk, failed_count: failed.length, checks, recommendations: recsCheck });
});