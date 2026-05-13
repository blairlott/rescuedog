// Returns the visitor's ISO country code from edge headers (Cloudflare,
// Vercel, Supabase). Falls back to "" when unknown.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const h = req.headers;
  const country =
    h.get("cf-ipcountry") ||
    h.get("x-vercel-ip-country") ||
    h.get("x-country") ||
    h.get("x-supabase-country") ||
    "";

  return new Response(
    JSON.stringify({
      country: country.toUpperCase(),
      isUS: country.toUpperCase() === "US",
      detected: !!country,
      ts: Date.now(),
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    },
  );
});