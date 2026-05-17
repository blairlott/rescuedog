import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Returns SHA-256 hash + length of selected secrets so values can be compared
// byte-for-byte across projects without exposing them. Also flags trimmed-vs-raw
// mismatches (a common cause of invalid_grant when pasting secrets).
const SECRETS = [
  "INSTACART_ADS_CLIENT_ID",
  "INSTACART_ADS_CLIENT_SECRET",
  "INSTACART_ADS_REFRESH_TOKEN",
];

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  // One-shot: exchange an authorization code and return the result (does NOT save).
  // GET /kennel-secret-hash?exchange_code=<code>&redirect_uri=<uri>
  if (url.searchParams.get("exchange_code")) {
    const code = url.searchParams.get("exchange_code")!;
    const redirect_uri = url.searchParams.get("redirect_uri") ?? "https://rescuedogwines.com/";
    const cid = Deno.env.get("INSTACART_ADS_CLIENT_ID");
    const cs = Deno.env.get("INSTACART_ADS_CLIENT_SECRET");
    const r = await fetch("https://api.ads.instacart.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: cid,
        client_secret: cs,
        code,
        redirect_uri,
      }),
    });
    const body = await r.text();
    return new Response(JSON.stringify({ status: r.status, body }, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const out: Record<string, unknown> = {};
  for (const name of SECRETS) {
    const raw = Deno.env.get(name);
    if (raw == null) { out[name] = { present: false }; continue; }
    const trimmed = raw.trim();
    out[name] = {
      present: true,
      length: raw.length,
      trimmed_length: trimmed.length,
      has_leading_or_trailing_whitespace: raw !== trimmed,
      sha256: await sha256Hex(raw),
      sha256_trimmed: await sha256Hex(trimmed),
      first2: raw.slice(0, 2),
      last2: raw.slice(-2),
    };
  }

  // Also live-test the token endpoint with current creds and report Instacart's response.
  const cid = Deno.env.get("INSTACART_ADS_CLIENT_ID");
  const cs = Deno.env.get("INSTACART_ADS_CLIENT_SECRET");
  const rt = Deno.env.get("INSTACART_ADS_REFRESH_TOKEN");
  let tokenTest: unknown = { skipped: true };
  if (cid && cs && rt) {
    try {
      const r = await fetch("https://api.ads.instacart.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: cid,
          client_secret: cs,
          refresh_token: rt,
        }),
      });
      const body = await r.text();
      tokenTest = { status: r.status, body: body.slice(0, 500) };
    } catch (e) {
      tokenTest = { error: String(e) };
    }
  }

  return new Response(JSON.stringify({ secrets: out, token_refresh_test: tokenTest }, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});