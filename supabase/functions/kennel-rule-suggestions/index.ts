// Weekly: scan the last 30 days of optimizer recommendations + ad executions
// + ingest-run failures, ask Lovable AI (google/gemini-2.5-pro) to propose
// new auto-rules the system *didn't* catch on its own, write them to
// kennel_rule_suggestions for human review. Never modifies the optimizer
// directly — humans accept/reject proposals.
//
// Auth: KENNEL_INGEST_SECRET in x-kennel-cron-secret OR ad-ops JWT.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SCHEMA = {
  name: "propose_rules",
  description: "Propose new auto-optimization rules for the Kennel ad system.",
  parameters: {
    type: "object",
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Short rule name, ≤80 chars." },
            rationale: { type: "string", description: "1–3 sentence justification grounded in the data provided." },
            rule_type: { type: "string", description: "Snake-case rule key, e.g. pause_expired_window, confirmed_dead." },
            trigger: { type: "object", description: "Conditions that fire the rule (metric thresholds, time windows, name patterns)." },
            action: { type: "object", description: "What the rule does (pause/lower bid/alert/etc) and whether auto-apply is recommended." },
            confidence: { type: "number", description: "0–1, how strong the evidence is in the data window." },
            evidence_refs: { type: "array", items: { type: "string" }, description: "Identifiers (rec ids, campaign ids) the proposal is based on." },
          },
          required: ["title", "rationale", "rule_type", "trigger", "action", "confidence"],
        },
      },
    },
    required: ["suggestions"],
  },
} as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ingestSecret = Deno.env.get("KENNEL_INGEST_SECRET")?.trim();
  const providedSecret = req.headers.get("x-kennel-cron-secret")?.trim();
  const cronAuthorized = !!ingestSecret && providedSecret === ingestSecret;

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

  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) return json({ error: "LOVABLE_API_KEY missing" }, 500);

  const sinceIso = new Date(Date.now() - 30 * 86400_000).toISOString();

  // Gather the evidence: optimizer recs, alert health failures, ingest run
  // failures. Cap each set to avoid blowing the context window.
  const [recs, ingestFails, healthFails] = await Promise.all([
    admin
      .from("kennel_optimizer_recommendations")
      .select("id, platform, rule_type, entity_id, status, reasoning, delta_pct, roas, spend_cents, revenue_cents, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(400),
    admin
      .from("kennel_ingest_runs")
      .select("target, status, attempts, error, run_at")
      .gte("run_at", sinceIso)
      .neq("status", "ok")
      .order("run_at", { ascending: false })
      .limit(200),
    admin
      .from("kennel_self_health")
      .select("function_name, status_code, error, consecutive_failures, checked_at")
      .gte("checked_at", sinceIso)
      .eq("ok", false)
      .order("checked_at", { ascending: false })
      .limit(200),
  ]);

  const evidence = {
    window_start: sinceIso,
    optimizer_recommendations: recs.data ?? [],
    ingest_failures: ingestFails.data ?? [],
    self_health_failures: healthFails.data ?? [],
  };

  const systemPrompt = [
    "You are the meta-optimizer for an ad operations system called Kennel.",
    "Existing auto-rules already cover: budget pacing, bid raise/lower, pause_zero_roas, pause_expired_window (date-tagged campaigns), confirmed_dead (zero spend + low revenue), archived-campaign filtering, OCI backlog alerts with auto-flush, and self-health pings.",
    "Do NOT propose any rule that is already covered above.",
    "Only propose rules where the evidence shows a repeated pattern (3+ occurrences) of humans manually acting on something the system did not auto-handle.",
    "If there is nothing strong, return an empty suggestions array.",
    "Every proposal must be grounded in specific rows from the evidence — cite ids in evidence_refs.",
  ].join(" ");

  const userPrompt =
    "Evidence from the last 30 days of Kennel operations (JSON):\n```json\n" +
    JSON.stringify(evidence).slice(0, 90_000) +
    "\n```\nPropose NEW auto-rules the system should learn.";

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [{ type: "function", function: SCHEMA }],
      tool_choice: { type: "function", function: { name: "propose_rules" } },
    }),
  });

  if (!aiRes.ok) {
    const txt = await aiRes.text().catch(() => "");
    return json({ error: "ai_call_failed", status: aiRes.status, body: txt.slice(0, 500) }, 502);
  }

  const aiJson = await aiRes.json();
  const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0];
  let parsedArgs: any = {};
  try {
    parsedArgs = JSON.parse(toolCall?.function?.arguments ?? "{}");
  } catch {
    return json({ error: "ai_returned_invalid_args", raw: toolCall }, 502);
  }

  const suggestions = Array.isArray(parsedArgs?.suggestions) ? parsedArgs.suggestions : [];
  const today = new Date().toISOString().slice(0, 10);

  const inserted: any[] = [];
  const skipped: any[] = [];
  for (const s of suggestions) {
    const idem = `${today}|${String(s.rule_type ?? "unknown")}|${String(s.title ?? "").slice(0, 60)}`;
    const { data: existing } = await admin
      .from("kennel_rule_suggestions")
      .select("id")
      .eq("idempotency_key", idem)
      .maybeSingle();
    if (existing) { skipped.push(idem); continue; }
    const { data, error } = await admin
      .from("kennel_rule_suggestions")
      .insert({
        title: String(s.title ?? "Untitled rule").slice(0, 200),
        rationale: String(s.rationale ?? ""),
        proposed_rule: { rule_type: s.rule_type, trigger: s.trigger, action: s.action },
        evidence: { refs: s.evidence_refs ?? [] },
        confidence: Number(s.confidence ?? 0.5),
        source_window_days: 30,
        idempotency_key: idem,
      })
      .select("id")
      .single();
    if (error) {
      skipped.push({ idem, error: error.message });
    } else {
      inserted.push(data.id);
    }
  }

  return json({
    ok: true,
    evidence_counts: {
      recs: evidence.optimizer_recommendations.length,
      ingest_failures: evidence.ingest_failures.length,
      self_health_failures: evidence.self_health_failures.length,
    },
    proposed: suggestions.length,
    inserted: inserted.length,
    skipped: skipped.length,
  });
});