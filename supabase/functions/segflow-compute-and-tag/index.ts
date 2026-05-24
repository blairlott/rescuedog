// Segflow hybrid: recompute SQL signals (reorder_nudge / churn_risk / winback),
// then push tag updates to Mailchimp for any email whose signal changed.
// SQL is the brain. Mailchimp campaigns (WF-12/13) remain the delivery.
import { createClient } from "npm:@supabase/supabase-js@2";
import { syncMailchimpMember } from "../_shared/mailchimpMember.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SIGNAL_TAGS: Record<string, string> = {
  reorder_nudge: "signal:reorder_nudge",
  churn_risk:    "signal:churn_risk",
  winback:       "signal:winback",
};
const ALL_TAGS = Object.values(SIGNAL_TAGS);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Auth: service role (cron), x-kennel-ingest-secret, or ad_ops user.
  const auth = req.headers.get("Authorization") ?? "";
  const ingestSecret = Deno.env.get("KENNEL_INGEST_SECRET") ?? "";
  const headerSecret = req.headers.get("x-kennel-ingest-secret") ?? "";
  const isService = auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  const hasSecret = !!ingestSecret && headerSecret === ingestSecret;

  if (!isService && !hasSecret) {
    if (!auth.startsWith("Bearer ")) return J(401, { error: "unauthorized" });
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: u } = await userClient.auth.getUser();
    const uid = u?.user?.id;
    if (!uid) return J(401, { error: "unauthorized" });
    const { data: isOps } = await admin.rpc("is_ad_ops", { _user_id: uid });
    if (!isOps) return J(403, { error: "forbidden" });
  }

  // Parse options
  let body: any = {};
  try { body = await req.json(); } catch { /* ok */ }
  const dryRun: boolean = !!body.dry_run;
  const maxPushes: number = Math.min(Number(body.max_pushes ?? 2000), 10000);

  // 1) Recompute signals
  const startedAt = new Date().toISOString();
  const sinceMark = new Date(Date.now() - 60_000).toISOString(); // diffs since 1min ago
  const { data: stats, error: compErr } = await admin.rpc("compute_segflow_signals");
  if (compErr) return J(500, { error: "compute_failed", details: compErr.message });
  const summary = Array.isArray(stats) ? stats[0] : stats;

  // 2) Pull changed rows
  const { data: diffs, error: diffErr } = await admin.rpc("segflow_signal_diffs", {
    _since: sinceMark,
  });
  if (diffErr) return J(500, { error: "diff_failed", details: diffErr.message });

  const changed = (diffs ?? []).slice(0, maxPushes);

  // 3) Push tags to Mailchimp (skip if dryRun)
  let pushed = 0, skipped = 0, failed = 0;
  const errors: any[] = [];

  if (!dryRun) {
    for (const row of changed) {
      const newTag = SIGNAL_TAGS[row.signal] ?? null;
      // Remove every other signal tag; add the current one (if any).
      const tagsRemoved = ALL_TAGS.filter((t) => t !== newTag);
      const tagsAdded = newTag ? [newTag] : [];

      try {
        const res = await syncMailchimpMember({
          email: row.email,
          userId: null,
          eventType: `segflow:${row.signal}`,
          tagsAdded,
          tagsRemoved,
          mergeFields: {
            SEGFLOW: row.signal,
            LAST_ORDER: row.last_order_at,
            ORDER_COUNT: row.order_count,
          },
        });

        const patch: Record<string, unknown> = {
          mailchimp_tag: newTag,
          pushed_at: new Date().toISOString(),
          push_status: res.ok ? "ok" : (res.skipped ? "skipped" : "error"),
          push_error: res.error ?? null,
        };
        await admin.from("segflow_signals").update(patch).eq("email", row.email);

        if (res.ok) pushed++;
        else if (res.skipped) skipped++;
        else { failed++; errors.push({ email: row.email, error: res.error }); }
      } catch (e: any) {
        failed++;
        errors.push({ email: row.email, error: e?.message ?? String(e) });
      }
    }
  }

  return J(200, {
    ok: failed === 0,
    dry_run: dryRun,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    compute: summary,
    diff_count: changed.length,
    pushed, skipped, failed,
    errors: errors.slice(0, 25),
  });
});