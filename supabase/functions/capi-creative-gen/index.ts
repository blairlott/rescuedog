import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const ASPECT_BY_TYPE: Record<string, string> = {
  hero: "16:9",
  pdp: "4:5",
  banner: "16:9",
  ad_creative: "1:1",
};

const BRAND_GUARDRAILS = `Brand guardrails (apply to every image):
- Color palette: deep red #c30017, black, and grey only. No other dominant colors.
- Sharp, flat edges — no rounded corners, no soft vignettes.
- Warm, mission-led aesthetic: rescue dogs, real people, candid rescue story moments.
- Photographic, editorial, documentary feel — never stock-photo glossy.
- NO text, words, letters, logos, or typography overlaid on the image. Copy is handled separately.
- No quantified impact claims, no counters, no percentages.`;

function brandLockupNote(lockup: string) {
  return lockup === "merch"
    ? "Visual context: this is for the merch site (/merch). Lifestyle, apparel, lifestyle photography."
    : "Visual context: this is for the wine site. Wine, hospitality, rescue dogs, mission storytelling. Do not show people under 21 drinking.";
}

async function callGateway(prompt: string) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image-preview",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`gateway ${r.status}: ${text.slice(0, 400)}`);
  }
  const json = await r.json();
  const imageUrl: string | undefined =
    json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!imageUrl) throw new Error("no image returned from gateway");
  return imageUrl; // data:image/png;base64,...
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const m = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!m) throw new Error("invalid data url");
  const mime = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is CMS team
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const queueId: string | undefined = body.queue_id;
    if (!queueId) {
      return new Response(JSON.stringify({ error: "queue_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Permission check via has_role
    const { data: isEditor } = await admin.rpc("is_cms_editor", { _user_id: userId });
    const { data: isAdmin } = await admin.rpc("is_admin_or_owner", { _user_id: userId });
    if (!isEditor && !isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: row, error: loadErr } = await admin
      .from("creative_asset_queue")
      .select("id, prompt, asset_type, aspect_ratio, brand_lockup, status")
      .eq("id", queueId)
      .single();
    if (loadErr || !row) {
      return new Response(JSON.stringify({ error: "queue row not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("creative_asset_queue")
      .update({ status: "generating", error: null }).eq("id", queueId);

    const aspect = row.aspect_ratio || ASPECT_BY_TYPE[row.asset_type] || "1:1";
    const fullPrompt = [
      `Generate a ${aspect} aspect-ratio image for a ${row.asset_type} slot.`,
      brandLockupNote(row.brand_lockup),
      BRAND_GUARDRAILS,
      `Creative brief: ${row.prompt}`,
    ].join("\n\n");

    try {
      const dataUrl = await callGateway(fullPrompt);
      const { bytes, mime } = dataUrlToBytes(dataUrl);
      const ext = mime.split("/")[1]?.split("+")[0] || "png";
      const path = `creative-assets/${queueId}.${ext}`;

      const { error: upErr } = await admin.storage
        .from("creative-studio")
        .upload(path, bytes, { contentType: mime, upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = admin.storage.from("creative-studio").getPublicUrl(path);

      await admin.from("creative_asset_queue").update({
        status: "ready",
        generated_url: pub.publicUrl,
        storage_path: path,
      }).eq("id", queueId);

      // Notify Lindy via kennel-external-signal (best effort)
      try {
        const signalSecret = Deno.env.get("KENNEL_EXTERNAL_SIGNAL_SECRET");
        if (signalSecret) {
          await fetch(`${SUPABASE_URL}/functions/v1/kennel-external-signal`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-signal-secret": signalSecret,
            },
            body: JSON.stringify({
              event_type: "creative_ready",
              payload: {
                queue_id: queueId,
                asset_type: row.asset_type,
                brand_lockup: row.brand_lockup,
                url: pub.publicUrl,
              },
            }),
          });
        }
      } catch (e) {
        console.error("signal failed", e);
      }

      return new Response(JSON.stringify({ ok: true, url: pub.publicUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (genErr) {
      const msg = genErr instanceof Error ? genErr.message : String(genErr);
      await admin.from("creative_asset_queue").update({
        status: "error", error: msg,
      }).eq("id", queueId);
      return new Response(JSON.stringify({ error: msg }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});