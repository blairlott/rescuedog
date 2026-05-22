// Imports a QuickBooks ProfitAndLoss report into bm_finance_entries so the
// Finance dashboard tiles (P&L, revenue by channel, cash trend, top vendors)
// populate with live QBO data. Uses month-bucketed `Summarize Column By`,
// then walks the row tree, classifying Income → revenue, COGS → cogs,
// Expense → expense. Upserts on a deterministic external_id for idempotency.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const DISCOVERY_URL = "https://developer.api.intuit.com/.well-known/openid_configuration";
let _discoveryCache: { token_endpoint: string } | null = null;
async function getTokenEndpoint() {
  if (_discoveryCache) return _discoveryCache.token_endpoint;
  const r = await fetch(DISCOVERY_URL, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`intuit discovery failed: ${r.status}`);
  const j: any = await r.json();
  _discoveryCache = { token_endpoint: j.token_endpoint };
  return _discoveryCache.token_endpoint;
}

async function refreshTokens(admin: any, conn: any) {
  const clientId = Deno.env.get("QBO_CLIENT_ID")!;
  const clientSecret = Deno.env.get("QBO_CLIENT_SECRET")!;
  const tokenEndpoint = await getTokenEndpoint();
  const r = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refresh_token }),
  });
  if (!r.ok) {
    const t = await r.text();
    await admin.from("qbo_connections").update({ last_error: `refresh failed: ${t.slice(0, 200)}` }).eq("id", conn.id);
    throw new Error(`refresh failed: ${t}`);
  }
  const tok: any = await r.json();
  const accessExpires = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString();
  const refreshExpires = new Date(Date.now() + (tok.x_refresh_token_expires_in ?? 8640000) * 1000).toISOString();
  await admin.from("qbo_connections").update({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    access_token_expires_at: accessExpires,
    refresh_token_expires_at: refreshExpires,
    last_refreshed_at: new Date().toISOString(),
    last_error: null,
  }).eq("id", conn.id);
  return tok.access_token;
}

type Entry = {
  external_id: string;
  date: string;
  entry_type: "revenue" | "cogs" | "expense";
  category: string;
  account_name: string;
  amount_cents: number;
  source: string;
  channel: string | null;
};

function lastDayOfMonth(year: number, month1: number) {
  // month1 is 1-based
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function parseColDate(s: string): string | null {
  // QBO column titles for monthly buckets look like "Jan 2026", "Feb 2026" etc.
  // Or sometimes "2026-01-01" for daily.
  if (!s) return null;
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return s;
  const monthMatch = s.match(/^([A-Za-z]{3,9})\s+(\d{4})$/);
  if (monthMatch) {
    const months: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    };
    const m = months[monthMatch[1].slice(0, 3).toLowerCase()];
    const y = Number(monthMatch[2]);
    if (!m) return null;
    const d = lastDayOfMonth(y, m);
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return null;
}

function classify(group: string | undefined): { entry_type: Entry["entry_type"]; category: string } | null {
  const g = (group ?? "").toLowerCase();
  if (g.includes("income") || g === "revenue") return { entry_type: "revenue", category: "Income" };
  if (g.includes("cogs") || g.includes("cost of goods")) return { entry_type: "cogs", category: "COGS" };
  if (g.includes("expense")) return { entry_type: "expense", category: "Operating Expense" };
  return null;
}

function walkRows(rows: any[], colDates: (string | null)[], group: string | undefined, realm: string, out: Entry[]) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    const thisGroup = row.group ?? group;
    const cls = classify(thisGroup);

    // Detail rows have ColData; section rows have Rows.Row
    if (row.type === "Data" && Array.isArray(row.ColData) && cls) {
      const accountName = String(row.ColData[0]?.value ?? "").trim();
      const accountId = String(row.ColData[0]?.id ?? "").trim() || accountName;
      if (!accountName) continue;
      // ColData[0] is the account label; the rest are value columns aligned with colDates[1..]
      for (let i = 1; i < row.ColData.length; i++) {
        const dateKey = colDates[i];
        if (!dateKey) continue; // skip Total column (no parsable date)
        const raw = String(row.ColData[i]?.value ?? "").replace(/[$,]/g, "").trim();
        if (!raw) continue;
        const num = Number(raw);
        if (!isFinite(num) || num === 0) continue;
        out.push({
          external_id: `qbo:${realm}:pnl:${accountId}:${dateKey}`,
          date: dateKey,
          entry_type: cls.entry_type,
          category: cls.category,
          account_name: accountName,
          amount_cents: Math.round(num * 100),
          source: "quickbooks",
          channel: cls.entry_type === "revenue" ? accountName : null,
        });
      }
    }

    if (row.Rows?.Row) {
      walkRows(row.Rows.Row, colDates, thisGroup, realm, out);
    }
  }
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
  const startDate = String(body.start_date ?? "");
  const endDate = String(body.end_date ?? "");
  if (!startDate || !endDate) return J(400, { error: "start_date and end_date required (YYYY-MM-DD)" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: conn } = await admin.from("qbo_connections").select("*").limit(1).maybeSingle();
  if (!conn) return J(404, { error: "no QBO connection — connect first" });

  let accessToken = conn.access_token;
  if (new Date(conn.access_token_expires_at).getTime() - Date.now() < 5 * 60 * 1000) {
    accessToken = await refreshTokens(admin, conn);
  }

  const qs = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    summarize_column_by: "Month",
    minorversion: "75",
  });
  const url = `https://quickbooks.api.intuit.com/v3/company/${conn.realm_id}/reports/ProfitAndLoss?${qs}`;
  let r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
  if (r.status === 401) {
    accessToken = await refreshTokens(admin, conn);
    r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
  }
  if (!r.ok) {
    const t = await r.text();
    return J(r.status, { error: "qbo_api_error", detail: t.slice(0, 500) });
  }
  const data = await r.json();

  const cols: any[] = data?.Columns?.Column ?? [];
  const colDates: (string | null)[] = cols.map((c) => parseColDate(String(c?.ColTitle ?? c?.MetaData?.find?.((m: any) => m.Name === "ColKey")?.Value ?? "")));

  const entries: Entry[] = [];
  walkRows(data?.Rows?.Row ?? [], colDates, undefined, conn.realm_id, entries);

  if (!entries.length) {
    return J(200, { imported: 0, skipped: 0, range: { startDate, endDate }, note: "QBO returned no parseable rows" });
  }

  // Upsert in chunks on external_id.
  let imported = 0;
  const chunkSize = 500;
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize);
    const { error: upErr, count } = await admin
      .from("bm_finance_entries")
      .upsert(chunk, { onConflict: "external_id", count: "exact" });
    if (upErr) {
      console.error("upsert error", upErr);
      return J(500, { error: "upsert_failed", detail: upErr.message, imported });
    }
    imported += count ?? chunk.length;
  }

  return J(200, {
    imported,
    range: { startDate, endDate },
    company: conn.company_name,
    months: colDates.filter(Boolean),
  });
});