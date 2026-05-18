// Read-only export endpoint for Lindy.
// Auth: Authorization: Bearer $LINDY_EXPORT_TOKEN
// GET /kennel-export?dataset=<name>&since=<iso>&limit=<n>&cursor=<id|ts>&format=json|csv
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

type DatasetConfig = {
  table: string;
  timeColumn: string; // used for `since` filter + cursor ordering
  cursorColumn?: string; // defaults to timeColumn
  defaultOrder?: "asc" | "desc";
  allowedFilters?: string[]; // additional querystring filters allowed
};

const DATASETS: Record<string, DatasetConfig> = {
  ad_performance_facts: {
    table: "ad_performance_facts",
    timeColumn: "date",
    allowedFilters: ["platform"],
  },
  ad_recommendations: {
    table: "ad_recommendations",
    timeColumn: "created_at",
    allowedFilters: ["status", "platform"],
  },
  ad_execution_log: {
    table: "ad_execution_log",
    timeColumn: "created_at",
    allowedFilters: ["action", "actor_kind"],
  },
  channel_sync_status: {
    table: "channel_sync_status",
    timeColumn: "last_sync_at",
    allowedFilters: ["channel"],
  },
  ad_forecasts: {
    table: "ad_forecasts",
    timeColumn: "generated_at",
    allowedFilters: ["platform", "scope"],
  },
  vs_transactions: {
    table: "vs_transactions",
    timeColumn: "order_date",
  },
  vs_abandoned_carts: {
    table: "vs_abandoned_carts",
    timeColumn: "abandoned_at",
  },
};

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 10_000;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function toCsv(rows: any[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const expected = Deno.env.get("LINDY_EXPORT_TOKEN");
  if (!expected) return json({ error: "server misconfigured: missing LINDY_EXPORT_TOKEN" }, 500);

  const auth = req.headers.get("authorization") ?? "";
  const presented = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!presented || !timingSafeEqual(presented, expected)) {
    return json({ error: "unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const datasetName = url.searchParams.get("dataset") ?? "";
  const cfg = DATASETS[datasetName];
  if (!cfg) {
    return json({ error: "unknown dataset", allowed: Object.keys(DATASETS) }, 400);
  }

  const format = (url.searchParams.get("format") ?? "json").toLowerCase();
  if (format !== "json" && format !== "csv") return json({ error: "format must be json or csv" }, 400);

  let limit = parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
  limit = Math.min(limit, MAX_LIMIT);

  const since = url.searchParams.get("since");
  const cursor = url.searchParams.get("cursor");
  const cursorCol = cfg.cursorColumn ?? cfg.timeColumn;
  const order = cfg.defaultOrder ?? "asc";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let query = supabase.from(cfg.table).select("*").order(cursorCol, { ascending: order === "asc" }).limit(limit);

  if (since) query = query.gte(cfg.timeColumn, since);
  if (cursor) query = order === "asc" ? query.gt(cursorCol, cursor) : query.lt(cursorCol, cursor);

  for (const key of cfg.allowedFilters ?? []) {
    const v = url.searchParams.get(key);
    if (v != null) query = query.eq(key, v);
  }

  const { data, error } = await query;
  if (error) {
    console.error("kennel-export query failed", { dataset: datasetName, error });
    return json({ error: "query failed", detail: error.message }, 500);
  }

  const rows = data ?? [];
  const last = rows.length ? rows[rows.length - 1] : null;
  const nextCursor = last && rows.length === limit ? last[cursorCol] ?? null : null;

  if (format === "csv") {
    return new Response(toCsv(rows), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "X-Dataset": datasetName,
        "X-Count": String(rows.length),
        "X-Next-Cursor": nextCursor == null ? "" : String(nextCursor),
      },
    });
  }

  return json({
    dataset: datasetName,
    count: rows.length,
    next_cursor: nextCursor,
    rows,
  });
});