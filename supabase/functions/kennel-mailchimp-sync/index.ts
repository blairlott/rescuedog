// Pushes winback-window customers (60–90 days since last consumer order) into
// Mailchimp with tag `signal_winback_60_90`. Tied-house compliant: this is an
// audience-sync only — human triggers the campaign in Mailchimp using approved
// templates that call compliant_retailer_set() at send time.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { crypto as stdCrypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";

const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const API = Deno.env.get("MAILCHIMP_API_KEY") ?? "";
const SERVER = Deno.env.get("MAILCHIMP_SERVER_PREFIX") ?? "";
const LIST = Deno.env.get("MAILCHIMP_AUDIENCE_ID") ?? "";
const TAG = "signal_winback_60_90";

async function md5Hex(s: string): Promise<string> {
  const buf = await stdCrypto.subtle.digest("MD5", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function mc(path: string, method: string, body?: unknown) {
  const r = await fetch(`https://${SERVER}.api.mailchimp.com/3.0${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`anystring:${API}`)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`mailchimp ${method} ${path}: ${r.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("KENNEL_INGEST_SECRET") ?? "";
  const headerSecret = req.headers.get("x-kennel-ingest-secret") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const isService = auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (!isService && (!secret || headerSecret !== secret)) return J(401, { error: "unauthorized" });

  if (!API || !SERVER || !LIST) {
    return J(400, { error: "MAILCHIMP_API_KEY / MAILCHIMP_SERVER_PREFIX / MAILCHIMP_AUDIENCE_ID missing" });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Pull winback emails — same logic as kennel_retention_risk_summary, but with email.
  const { data, error } = await admin
    .from("vs_transactions")
    .select("customer_email, ship_to_state, transaction_date")
    .eq("transaction_type", "ORDER")
    .eq("order_type", "CONSUMER")
    .gt("order_total", 0)
    .not("customer_email", "is", null)
    .gte("transaction_date", new Date(Date.now() - 90 * 86400_000).toISOString())
    .lte("transaction_date", new Date(Date.now() - 60 * 86400_000).toISOString())
    .limit(5000);
  if (error) return J(500, { error: error.message });

  // Dedup by email — keep most recent state.
  const map = new Map<string, { email: string; state: string | null }>();
  for (const r of (data ?? []) as any[]) {
    const e = String(r.customer_email ?? "").trim().toLowerCase();
    if (!e || !e.includes("@")) continue;
    if (!map.has(e)) map.set(e, { email: e, state: r.ship_to_state ?? null });
  }
  const audience = [...map.values()];

  if (audience.length === 0) {
    return J(200, { ok: true, synced: 0, tag: TAG, note: "no customers in winback window" });
  }

  // Batch upsert in chunks of 500 via /lists/{id} (operations payload).
  let synced = 0;
  let updated = 0;
  let errors = 0;
  const errSamples: string[] = [];
  const CHUNK = 500;
  for (let i = 0; i < audience.length; i += CHUNK) {
    const slice = audience.slice(i, i + CHUNK);
    const members = slice.map((m) => ({
      email_address: m.email,
      status_if_new: "subscribed",
      tags: [TAG],
      merge_fields: m.state ? { STATE: m.state } : {},
    }));
    try {
      const res: any = await mc(`/lists/${LIST}`, "POST", {
        members,
        update_existing: true,
        skip_merge_validation: true,
      });
      synced += res?.new_members?.length ?? 0;
      updated += res?.updated_members?.length ?? 0;
      errors += res?.errors?.length ?? 0;
      if (res?.errors?.length) errSamples.push(...res.errors.slice(0, 3).map((e: any) => `${e.email_address}: ${e.error}`));
    } catch (e: any) {
      errors += slice.length;
      errSamples.push(String(e?.message ?? e));
    }
  }

  return J(200, { ok: errors === 0, tag: TAG, total: audience.length, new: synced, updated, errors, errSamples: errSamples.slice(0, 5) });
});