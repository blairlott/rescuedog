// Orchestrates nightly ingestion across Meta, Google, Instacart and Mailchimp sync.
// Each target gets 3 attempts with exponential backoff (2s, 6s, 18s).
// Every attempt outcome is logged to public.kennel_ingest_runs for the dashboard.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, max = 3): Promise<{ value?: T; attempts: number; error?: string }> {
  let lastErr = "";
  for (let i = 1; i <= max; i++) {
    try { return { value: await fn(), attempts: i }; }
    catch (e: any) {
      lastErr = String(e?.message ?? e);
      if (i < max) await sleep(2000 * Math.pow(3, i - 1)); // 2s, 6s
    }
  }
  return { attempts: max, error: lastErr };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Auth: (a) ingest secret header, (b) service-role JWT, or (c) authenticated ad_ops user
  const secret = Deno.env.get("KENNEL_INGEST_SECRET") ?? "";
  const headerSecret = req.headers.get("x-kennel-ingest-secret") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const isService = auth === `Bearer ${SERVICE_KEY}`;
  const hasSecret = secret && headerSecret === secret;
  let isAdOps = false;
  if (!isService && !hasSecret && auth.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const { data: userRes } = await admin.auth.getUser(token);
    const uid = userRes?.user?.id;
    if (uid) {
      const { data: ok } = await admin.rpc("is_ad_ops", { _user_id: uid });
      isAdOps = !!ok;
    }
  }
  if (!isService && !hasSecret && !isAdOps) return J(401, { error: "unauthorized" });
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const days = Math.min(Math.max(Number(body?.days ?? 7), 1), 30);

  const targets: Array<{ name: string; fn: string; body: unknown }> = [
    { name: "meta",            fn: "kennel-ingest-meta",      body: { days } },
    { name: "google",          fn: "kennel-ingest-google",    body: { days } },
    { name: "instacart",       fn: "kennel-ingest-instacart", body: { days } },
    { name: "mailchimp_sync",  fn: "kennel-mailchimp-sync",   body: {} },
    { name: "winback_meta",    fn: "kennel-winback-meta-sync",   body: {} },
    { name: "winback_google",  fn: "kennel-winback-google-sync", body: {} },
    { name: "winback_recs",    fn: "kennel-winback-auto-recs",   body: {} },
  ];

  const summary: any[] = [];
  for (const t of targets) {
    const start = Date.now();
    const res = await withRetry(async () => {
      const r = await admin.functions.invoke(t.fn, { body: t.body });
      if (r.error) throw new Error(r.error.message ?? String(r.error));
      const data: any = r.data;
      if (data?.error) throw new Error(data.error);
      return data;
    });
    const duration_ms = Date.now() - start;
    const ok = !res.error;
    await admin.from("kennel_ingest_runs").insert({
      target: t.name,
      status: ok ? "ok" : "failed",
      attempts: res.attempts,
      duration_ms,
      error: res.error ?? null,
      payload: ok ? (res.value ?? {}) : {},
    });
    summary.push({ target: t.name, ok, attempts: res.attempts, duration_ms, error: res.error ?? null });
  }

  const ok_count = summary.filter((s) => s.ok).length;
  return J(200, { ok: ok_count === targets.length, ok_count, total: targets.length, summary });
});