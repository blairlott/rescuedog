// Temporary probe: calls another edge function using THIS runtime's
// SUPABASE_SERVICE_ROLE_KEY env var in Authorization: Bearer, then returns
// the upstream status + body. Used to verify the JWT-fallback path in
// _shared/cronAlert.ts:verifyCronSecret. Delete after testing.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const target = new URL(req.url).searchParams.get("target") ?? "kennel-alert-dispatch";
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/${target}`;
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${srk}` },
    body: "{}",
  });
  const text = await r.text();
  return new Response(JSON.stringify({ target, status: r.status, body: text.slice(0, 400), srk_len: srk.length }), {
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
});