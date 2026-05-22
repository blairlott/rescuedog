// Generates actionable CFO insights for every Finance dashboard tile.
// For each tile: runs deterministic heuristics against the existing
// finance_* RPCs (current vs prior period), and when something material is
// detected, asks Lovable AI (gemini-3-flash) to write a one-line headline,
// short body, and recommended action. Persists to public.cfo_insights with
// a dedupe hash so the same insight is not written twice per (tile, day).
//
// Owner / admin / cfo / executive only. Safe to call repeatedly.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function shiftDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function pctChange(curr: number, prev: number): number | null {
  if (!isFinite(prev) || prev === 0) return null;
  return (curr - prev) / Math.abs(prev);
}
function fmtCents(c: number) {
  return (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

type Heuristic = {
  tile_key: string;
  severity: "critical" | "watch" | "fyi";
  metric: string;
  current: number;
  prior: number;
  delta_pct: number | null;
  detail: Record<string, unknown>;
};

/** Decide severity from absolute % move and magnitude. */
function severityFor(absPct: number, isRevenue: boolean): "critical" | "watch" | "fyi" | null {
  if (absPct >= 0.25) return "critical";
  if (absPct >= 0.10) return "watch";
  if (isRevenue && absPct >= 0.05) return "fyi";
  return null;
}

async function runHeuristics(admin: any, days: number): Promise<Heuristic[]> {
  const end = new Date();
  const startCurr = shiftDays(end, -days);
  const startPrev = shiftDays(end, -days * 2);
  const endPrev = startCurr;

  const out: Heuristic[] = [];

  // ---- VS summary heuristic ----
  const [vsCurr, vsPrev] = await Promise.all([
    admin.rpc("finance_vs_summary", { _start: isoDate(startCurr), _end: isoDate(end) }),
    admin.rpc("finance_vs_summary", { _start: isoDate(startPrev), _end: isoDate(endPrev) }),
  ]);
  const vc = (vsCurr.data ?? [])[0];
  const vp = (vsPrev.data ?? [])[0];
  if (vc && vp) {
    const tests: Array<{ k: string; metric: string; isRev: boolean }> = [
      { k: "revenue_cents", metric: "DTC + wholesale revenue", isRev: true },
      { k: "order_count", metric: "order count", isRev: false },
      { k: "aov_cents", metric: "average order value", isRev: false },
      { k: "wine_club_cents", metric: "wine-club revenue", isRev: true },
      { k: "wholesale_cents", metric: "wholesale revenue", isRev: true },
    ];
    for (const t of tests) {
      const curr = Number(vc[t.k] ?? 0);
      const prev = Number(vp[t.k] ?? 0);
      const delta = pctChange(curr, prev);
      if (delta == null) continue;
      const sev = severityFor(Math.abs(delta), t.isRev);
      if (!sev) continue;
      out.push({
        tile_key: t.k === "wine_club_cents" || t.k === "wholesale_cents" ? "vs_wc_vs_alc" : "vs_summary",
        severity: sev,
        metric: t.metric,
        current: curr,
        prior: prev,
        delta_pct: delta,
        detail: { window_days: days, kind: t.k },
      });
    }
  }

  // ---- P&L heuristic ----
  const [pnlCurr, pnlPrev] = await Promise.all([
    admin.rpc("finance_pnl_summary", { _start: isoDate(startCurr), _end: isoDate(end) }),
    admin.rpc("finance_pnl_summary", { _start: isoDate(startPrev), _end: isoDate(endPrev) }),
  ]);
  const sumPnl = (rows: any[] | null) => {
    const r = rows ?? [];
    const get = (k: string) => Number(r.find((x) => x.entry_type === k)?.total_cents ?? 0);
    const revenue = get("revenue");
    const cogs = get("cogs");
    const expense = get("expense");
    const refund = get("refund");
    return { revenue, cogs, expense, refund, net: revenue - cogs - expense - refund };
  };
  const pc = sumPnl(pnlCurr.data);
  const pp = sumPnl(pnlPrev.data);
  for (const k of ["revenue", "expense", "net", "cogs"] as const) {
    const delta = pctChange(pc[k], pp[k]);
    if (delta == null) continue;
    const sev = severityFor(Math.abs(delta), k === "revenue" || k === "net");
    if (!sev) continue;
    out.push({
      tile_key: "qb_pnl",
      severity: sev,
      metric: k === "net" ? "net margin" : `${k}`,
      current: pc[k],
      prior: pp[k],
      delta_pct: delta,
      detail: { window_days: days, kind: k },
    });
  }

  // ---- Ad spend by platform ----
  const [spCurr, spPrev] = await Promise.all([
    admin.rpc("finance_spend_by_platform", { _start: isoDate(startCurr), _end: isoDate(end) }),
    admin.rpc("finance_spend_by_platform", { _start: isoDate(startPrev), _end: isoDate(endPrev) }),
  ]);
  const spendCurrTotal = ((spCurr.data ?? []) as any[]).reduce((s, r) => s + Number(r.spend_cents), 0);
  const spendPrevTotal = ((spPrev.data ?? []) as any[]).reduce((s, r) => s + Number(r.spend_cents), 0);
  if (spendCurrTotal > 0 || spendPrevTotal > 0) {
    const delta = pctChange(spendCurrTotal, spendPrevTotal);
    const sev = delta != null ? severityFor(Math.abs(delta), false) : null;
    if (sev && delta != null) {
      out.push({
        tile_key: "qb_ad_spend",
        severity: sev,
        metric: "total ad spend",
        current: spendCurrTotal,
        prior: spendPrevTotal,
        delta_pct: delta,
        detail: { window_days: days, kind: "total" },
      });
    }
    // ROAS shift
    const roasCurr = spendCurrTotal > 0 ? pc.revenue / spendCurrTotal : null;
    const roasPrev = spendPrevTotal > 0 ? pp.revenue / spendPrevTotal : null;
    if (roasCurr != null && roasPrev != null) {
      const rDelta = pctChange(roasCurr, roasPrev);
      const sev2 = rDelta != null ? severityFor(Math.abs(rDelta), true) : null;
      if (sev2 && rDelta != null) {
        out.push({
          tile_key: "cc_roas",
          severity: sev2,
          metric: "blended ROAS",
          current: roasCurr,
          prior: roasPrev,
          delta_pct: rDelta,
          detail: { window_days: days, kind: "roas", roas_curr: roasCurr, roas_prev: roasPrev },
        });
      }
    }
  }

  return out;
}

function fallbackNarrative(h: Heuristic): { headline: string; body: string; recommended_action: string } {
  const dir = h.delta_pct! >= 0 ? "up" : "down";
  const pct = `${(Math.abs(h.delta_pct!) * 100).toFixed(1)}%`;
  const isCents = typeof h.detail.kind === "string" && /cents|revenue|expense|cogs|spend|net/.test(String(h.detail.kind));
  const f = (n: number) => isCents ? fmtCents(n) : Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return {
    headline: `${h.metric} ${dir} ${pct} vs prior ${h.detail.window_days}d`,
    body: `Now ${f(h.current)} vs prior ${f(h.prior)}. Material move outside normal range.`,
    recommended_action: dir === "down"
      ? `Investigate driver and confirm not a tracking gap.`
      : `Lock in the lift — verify it's sustainable, then scale.`,
  };
}

async function generateNarrative(
  apiKey: string,
  h: Heuristic,
  knowledge: { directives: string[]; facts: string[]; kb: string } = { directives: [], facts: [], kb: "" },
): Promise<{ headline: string; body: string; recommended_action: string }> {
  const sys = `You are Graz — Rescue Dog Wines' Consumer Insights + Competitive Intelligence + BI + wine-industry analyst AND operating COO. You are writing a TILE-LEVEL STRATEGIC INSIGHT, not a metric restatement. The operator already sees the number; your job is to tell them what it MEANS for running RDW this week.

Tie every move to a lever — strategic (pricing, ad mix, club cadence, retention, brand, wholesale mix) OR operational (glass/closure POs, dry-goods lead times, bonded inventory weeks-on-hand, co-pack run timing, freight zones, weather holds, breakage %, TTB/state compliance, club churn vs skip-window). Lead with the business implication, not the raw delta. Use concrete operator language ("pull Meta prospecting 30%", "tighten club skip window to 5 days", "renegotiate glass at next PO — lightweight saves 15-20%", "shift comp-state mix toward TX/FL", "release the allocation SKU as club-only to drive net adds"). Never use the word "synergy". Never recommend agencies or consultants. Never restate the metric without a business consequence.

Voice: SAP-style precision with a quirky, dry wink of humor when it earns its keep (one wink max, never in the recommended_action line). Treat standing directives as binding and taught facts as ground truth.`;

  const directiveBlock = knowledge.directives.length
    ? `\n\nSTANDING DIRECTIVES (binding):\n${knowledge.directives.map((d, i) => `${i + 1}. ${d}`).join("\n")}`
    : "";
  const factBlock = knowledge.facts.length
    ? `\n\nBUSINESS CONTEXT (ground truth):\n${knowledge.facts.map((d, i) => `${i + 1}. ${d}`).join("\n")}`
    : "";
  const kbBlock = knowledge.kb ? `\n\nRDW KNOWLEDGE BASE + ROLLING INDUSTRY INTEL:\n${knowledge.kb.slice(0, 6000)}` : "";
  const fullSys = sys + directiveBlock + factBlock + kbBlock;

  const ctx = JSON.stringify({
    tile: h.tile_key,
    metric: h.metric,
    current: h.current,
    prior: h.prior,
    delta_pct: h.delta_pct,
    window_days: h.detail.window_days,
    detail: h.detail,
  });
  try {
    const r = await fetch(LOVABLE_AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: fullSys },
          { role: "user", content: `Write a strategic tile insight for this metric move on the Rescue Dog Wines finance board.

Rules for the output:
- headline (<=110 chars): lead with the BUSINESS IMPLICATION, not the raw delta. Bad: "Revenue up 12% vs prior 90d". Good: "DTC pull from wine-club shipments is masking flat à-la-carte demand".
- body (<=240 chars): 1 sentence connecting the move to the operating model (cash, margin, club, ads, wholesale, fulfillment). Cite the numbers as proof, not as the point.
- recommended_action (<=140 chars): ONE concrete operator move starting with a verb. Specify the lever, the target, and the timeframe. Bad: "Investigate the driver". Good: "Cut Meta prospecting 30% this week and reallocate to club-retention email".

Context:\n${ctx}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "insight",
            description: "Return the insight",
            parameters: {
              type: "object",
              properties: {
                headline: { type: "string" },
                body: { type: "string" },
                recommended_action: { type: "string" },
              },
              required: ["headline", "body", "recommended_action"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "insight" } },
      }),
    });
    if (!r.ok) {
      console.warn("AI gateway non-ok", r.status, await r.text().catch(() => ""));
      return fallbackNarrative(h);
    }
    const j: any = await r.json();
    const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return fallbackNarrative(h);
    const parsed = JSON.parse(args);
    return {
      headline: String(parsed.headline ?? "").slice(0, 200) || fallbackNarrative(h).headline,
      body: String(parsed.body ?? "").slice(0, 400) || fallbackNarrative(h).body,
      recommended_action: String(parsed.recommended_action ?? "").slice(0, 240) || fallbackNarrative(h).recommended_action,
    };
  } catch (e) {
    console.warn("AI gateway error", String(e));
    return fallbackNarrative(h);
  }
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return J(401, { error: "unauthorized" });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: claims } = await sb.auth.getClaims(auth.replace("Bearer ", ""));
  const userId = claims?.claims?.sub;
  if (!userId) return J(401, { error: "unauthorized" });

  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", userId);
  const ok = (roles ?? []).some((r: any) => ["owner", "admin", "cfo", "executive"].includes(r.role));
  if (!ok) return J(403, { error: "forbidden — owner/admin/cfo/executive only" });

  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  const days = Math.max(7, Math.min(365, Number(body.days ?? 90)));

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const apiKey = Deno.env.get("LOVABLE_API_KEY")!;

  const heuristics = await runHeuristics(admin, days);
  if (heuristics.length === 0) {
    return J(200, { generated: 0, considered: 0, note: "No material moves detected for this window." });
  }

  // Pull this user's standing directives + taught business facts so Graz's
  // tile-level insights are framed in the operator's own strategy and ground
  // truth — not generic CFO platitudes.
  const { data: graz } = await admin
    .from("graz_directives")
    .select("directive,kind,active")
    .eq("user_id", userId)
    .eq("active", true);
  const directives = ((graz ?? []) as any[])
    .filter((d) => (d.kind ?? "directive") === "directive")
    .map((d) => String(d.directive));
  const facts = ((graz ?? []) as any[])
    .filter((d) => d.kind === "context")
    .map((d) => String(d.directive));
  // Pull global knowledge base (RDW brief/history/ops + daily web scans).
  const { data: kbRows } = await admin
    .from("graz_knowledge")
    .select("kind,title,content")
    .eq("active", true)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(30);
  const kb = ((kbRows ?? []) as any[])
    .map((r) => `[${r.kind}] ${r.title}\n${r.content}`)
    .join("\n\n");
  const knowledge = { directives, facts, kb };

  let written = 0;
  let skipped = 0;
  for (const h of heuristics) {
    // Dedupe by tile + metric + bucketed delta + day so we don't repeatedly write the same thing.
    const day = new Date().toISOString().slice(0, 10);
    const deltaBucket = h.delta_pct != null ? Math.sign(h.delta_pct) * Math.floor(Math.abs(h.delta_pct) * 10) / 10 : 0;
    const dedupe = await sha256Hex(`${h.tile_key}|${h.metric}|${deltaBucket}|${h.detail.window_days}|${day}`);

    const nar = apiKey ? await generateNarrative(apiKey, h, knowledge) : fallbackNarrative(h);

    const { error } = await admin.from("cfo_insights").insert({
      tile_key: h.tile_key,
      severity: h.severity,
      headline: nar.headline,
      body: nar.body,
      recommended_action: nar.recommended_action,
      dedupe_hash: dedupe,
      metric_snapshot: {
        metric: h.metric,
        current: h.current,
        prior: h.prior,
        delta_pct: h.delta_pct,
        detail: h.detail,
      },
      date_range_days: days,
    });
    if (error) {
      if (error.code === "23505") skipped++;
      else console.error("insert insight error", error);
    } else {
      written++;
    }
  }

  return J(200, { generated: written, deduped: skipped, considered: heuristics.length, days });
});