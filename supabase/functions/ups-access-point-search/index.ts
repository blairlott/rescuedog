// Search UPS Access Points near a ZIP. If UPS API creds are not configured,
// returns a small simulated result set so the UI flow can be tested end-to-end.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AccessPoint {
  id: string; name: string; line1: string; city: string; state: string; zip: string;
  distance_miles: number; hours?: string;
}

function simulated(zip: string): AccessPoint[] {
  return [
    { id: `sim-${zip}-1`, name: "The UPS Store #1234", line1: "100 Main St", city: "Anywhere", state: "CA", zip, distance_miles: 0.4, hours: "M-F 8am-7pm, Sat 9am-5pm" },
    { id: `sim-${zip}-2`, name: "Walgreens UPS Access Point", line1: "455 Oak Ave", city: "Anywhere", state: "CA", zip, distance_miles: 0.9, hours: "Daily 7am-10pm" },
    { id: `sim-${zip}-3`, name: "CVS UPS Access Point", line1: "210 Pine St", city: "Anywhere", state: "CA", zip, distance_miles: 1.6, hours: "Daily 8am-9pm" },
  ];
}

async function getUpsToken(): Promise<string | null> {
  const id = Deno.env.get("UPS_CLIENT_ID");
  const secret = Deno.env.get("UPS_CLIENT_SECRET");
  if (!id || !secret) return null;
  const res = await fetch("https://onlinetools.ups.com/security/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return null;
  const j = await res.json();
  return j.access_token ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { zip } = await req.json();
    if (!zip || !/^\d{5}$/.test(String(zip))) return j({ error: "Valid 5-digit ZIP required" }, 400);

    const token = await getUpsToken();
    if (!token) return j({ ok: true, simulated: true, results: simulated(zip) });

    // UPS Locator API — Hold For Pickup access points
    const res = await fetch("https://onlinetools.ups.com/api/locations/v3/search/availabilities/64", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`, "Content-Type": "application/json",
        transId: crypto.randomUUID(), transactionSrc: "rdw-wine-club",
      },
      body: JSON.stringify({
        LocatorRequest: {
          Request: { RequestAction: "Locator", RequestOption: "64" },
          OriginAddress: { AddressKeyFormat: { PostcodePrimaryLow: zip, CountryCode: "US" } },
          Translate: { Locale: "en_US" },
          UnitOfMeasurement: { Code: "MI" },
          LocationSearchCriteria: { MaximumListSize: "10", SearchRadius: "25" },
        },
      }),
    });
    if (!res.ok) return j({ ok: true, simulated: true, results: simulated(zip) });
    const data = await res.json();
    const drops = data?.LocatorResponse?.SearchResults?.DropLocation ?? [];
    const results: AccessPoint[] = (Array.isArray(drops) ? drops : [drops]).map((d: any, i: number) => ({
      id: d?.LocationID ?? `ups-${zip}-${i}`,
      name: d?.AddressKeyFormat?.ConsigneeName ?? "UPS Access Point",
      line1: Array.isArray(d?.AddressKeyFormat?.AddressLine) ? d.AddressKeyFormat.AddressLine[0] : (d?.AddressKeyFormat?.AddressLine ?? ""),
      city: d?.AddressKeyFormat?.PoliticalDivision2 ?? "",
      state: d?.AddressKeyFormat?.PoliticalDivision1 ?? "",
      zip: d?.AddressKeyFormat?.PostcodePrimaryLow ?? zip,
      distance_miles: Number(d?.Distance?.Value ?? 0),
    }));
    return j({ ok: true, simulated: false, results });
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function j(b: unknown, s = 200) { return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }