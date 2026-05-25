// One-shot importer: fetches a CSV from storage and bulk-upserts into vs_customers.
// Auth: admin/owner JWT required.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else {
        if (c === '"') q = true;
        else if (c === ",") { out.push(cur); cur = ""; }
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = parseLine(l);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ""; });
    return row;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  const { data: ok } = await admin.rpc("is_admin_or_owner", { _user_id: u.user.id });
  if (!ok) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

  const body = await req.json().catch(() => ({}));
  const url: string = body.url ?? "https://eskqaxmypgvwtsffcbsw.supabase.co/storage/v1/object/public/harvested-media/_tmp/cust_import.csv";

  const res = await fetch(url);
  if (!res.ok) {
    return new Response(JSON.stringify({ error: `fetch ${res.status}` }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
  const text = await res.text();
  const rows = parseCsv(text);

  const mapped = rows.map((r) => ({
    vs_customer_id: r.vs_customer_id,
    email: r.email || null,
    first_name: r.first_name || null,
    last_name: r.last_name || null,
    phone: r.phone || null,
    business_name: r.business_name || null,
    address: r.address || null,
    city: r.city || null,
    state: r.state || null,
    zip: r.zip || null,
    country: r.country || "US",
    is_club_member: r.is_club_member === "True" || r.is_club_member === "true",
    club_name: r.club_name || null,
    vs_created_at: r.vs_created_at || null,
    raw: r.raw ? JSON.parse(r.raw) : null,
    last_synced_at: new Date().toISOString(),
  })).filter((r) => r.vs_customer_id);

  let inserted = 0;
  const errors: string[] = [];
  const CHUNK = 500;
  for (let i = 0; i < mapped.length; i += CHUNK) {
    const slice = mapped.slice(i, i + CHUNK);
    const { error } = await admin.from("vs_customers").upsert(slice, { onConflict: "vs_customer_id" });
    if (error) errors.push(`batch ${i}: ${error.message}`);
    else inserted += slice.length;
  }

  return new Response(JSON.stringify({ ok: errors.length === 0, total: mapped.length, inserted, errors }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});