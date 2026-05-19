// Shared helpers for writing into ad_performance_facts.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export type FactRow = {
  channel_id: string;
  platform: "google" | "meta" | "instacart" | "yahoo";
  date: string;
  hour?: number | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  ad_group_id?: string | null;
  ad_group_name?: string | null;
  ad_id?: string | null;
  ad_name?: string | null;
  creative_id?: string | null;
  creative_name?: string | null;
  audience_id?: string | null;
  audience_name?: string | null;
  placement?: string | null;
  network?: string | null;
  geo_country?: string | null;
  geo_region?: string | null;
  geo_dma?: string | null;
  geo_zip?: string | null;
  device?: string | null;
  attribution_window?: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  view_through_conversions?: number;
  revenue: number;
  source?: string;
  ingest_request_id?: string;
};

export function makeAdminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

export async function ensureChannel(
  sb: SupabaseClient,
  platform: "google" | "meta" | "instacart" | "yahoo",
): Promise<string | null> {
  const { data } = await sb.from("ad_channels").select("id").eq("platform", platform).limit(1).maybeSingle();
  if (data?.id) return data.id as string;
  const { data: ins } = await sb.from("ad_channels")
    .insert({ platform, name: `${platform} (auto)`, is_active: true })
    .select("id").maybeSingle();
  return ins?.id ?? null;
}

export async function writeFacts(sb: SupabaseClient, rows: FactRow[]): Promise<number> {
  if (!rows.length) return 0;
  const chunks: FactRow[][] = [];
  for (let i = 0; i < rows.length; i += 500) chunks.push(rows.slice(i, i + 500));
  let total = 0;
  for (const c of chunks) {
    const { data, error } = await sb.from("ad_performance_facts")
      .upsert(c, { onConflict: "channel_id,date,dim_hash" }).select("id");
    if (error) throw error;
    total += data?.length ?? 0;
  }
  return total;
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const J = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

export async function isAuthorized(req: Request, sb: SupabaseClient): Promise<boolean> {
  if (req.headers.get("apikey") === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  const secret = Deno.env.get("KENNEL_INGEST_SECRET");
  if (secret && req.headers.get("x-kennel-secret") === secret) return true;
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  // Service-role JWT via Authorization header (gateway sometimes strips apikey)
  const bearer = auth.replace(/^Bearer\s+/i, "");
  if (bearer === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  const { data: { user } } = await sb.auth.getUser(auth.replace("Bearer ", ""));
  if (!user) return false;
  const { data } = await sb.rpc("is_ad_ops", { _user_id: user.id });
  return !!data;
}