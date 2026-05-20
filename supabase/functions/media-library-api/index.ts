import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LINDY_TOKEN = Deno.env.get("LINDY_PROXY_TOKEN") ?? Deno.env.get("LINDY_EXPORT_TOKEN");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: either a Lindy bearer token, or any signed-in Supabase user.
  const authHeader = req.headers.get("authorization") ?? "";
  const apiKey = req.headers.get("x-api-key") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const isLindy = !!LINDY_TOKEN && (bearer === LINDY_TOKEN || apiKey === LINDY_TOKEN);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  if (!isLindy) {
    if (!bearer) return json({ error: "unauthorized" }, 401);
    const { data: userData, error: userErr } = await supabase.auth.getUser(bearer);
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const tag = url.searchParams.get("tag");
  const search = url.searchParams.get("search");
  const status = url.searchParams.get("status") ?? "published";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
  const id = url.searchParams.get("id");

  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  let query = supabase.from("media_library").select("*").order("created_at", { ascending: false }).limit(limit);
  if (id) query = query.eq("id", id);
  if (kind) query = query.eq("kind", kind);
  if (status && status !== "all") query = query.eq("status", status);
  if (tag) query = query.contains("tags", [tag]);
  if (search) query = query.ilike("title", `%${search}%`);

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, count: data?.length ?? 0, items: data ?? [] });
});