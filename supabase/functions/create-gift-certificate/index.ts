import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  tier: string;
  shipments_count: number;
  total_cents: number;
  recipient_name: string;
  recipient_email: string;
  personal_note?: string;
  deliver_on?: string; // YYYY-MM-DD
  send_email_now?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json()) as Body;
    if (!body.tier || !body.recipient_name || !body.recipient_email) {
      return json({ error: "tier, recipient_name, recipient_email required" }, 400);
    }

    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: gift, error } = await serviceClient
      .from("gift_certificates")
      .insert({
        purchaser_user_id: user.id,
        purchaser_email: user.email,
        tier: body.tier,
        shipments_count: body.shipments_count ?? 1,
        total_cents: body.total_cents ?? 0,
        recipient_name: body.recipient_name,
        recipient_email: body.recipient_email,
        personal_note: body.personal_note ?? null,
        deliver_on: body.deliver_on ?? null,
        status: "issued",
      })
      .select()
      .single();
    if (error) return json({ error: error.message }, 500);

    // Optional immediate email via Resend
    let emailSent = false;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const shouldSend = body.send_email_now || !body.deliver_on;
    if (shouldSend && resendKey && lovableKey) {
      try {
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111">
            <h1 style="color:#c30017">You've been gifted a Rescue Dog Wines club membership!</h1>
            <p>${escapeHtml(user.email || "A friend")} sent you a gift: <strong>${escapeHtml(body.tier)}</strong> tier — ${body.shipments_count} shipment(s).</p>
            ${body.personal_note ? `<blockquote style="border-left:3px solid #c30017;padding-left:12px;color:#555">${escapeHtml(body.personal_note)}</blockquote>` : ""}
            <p>Redeem with code: <strong style="font-size:20px;letter-spacing:2px">${gift.code}</strong></p>
            <p><a href="https://rescuedogwines.com/club?code=${gift.code}" style="background:#c30017;color:#fff;padding:12px 20px;text-decoration:none;display:inline-block">Redeem your gift</a></p>
          </div>`;
        const r = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableKey}`,
            "X-Connection-Api-Key": resendKey,
          },
          body: JSON.stringify({
            from: "Rescue Dog Wines <gifts@rescuedogwines.com>",
            to: [body.recipient_email],
            subject: "🍷 You've been gifted a Rescue Dog Wine Club membership!",
            html,
          }),
        });
        emailSent = r.ok;
        if (r.ok) {
          await serviceClient.from("gift_certificates").update({ sent_at: new Date().toISOString(), status: "delivered" }).eq("id", gift.id);
        }
      } catch { /* swallow — UI shows print fallback */ }
    }

    return json({ ok: true, gift, email_sent: emailSent });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}