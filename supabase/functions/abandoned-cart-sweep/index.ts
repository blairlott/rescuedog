// Runs on cron (every 15 min). Sends two recovery emails per cart:
//  - email 1 at >= 2h since last activity, recovery_emails_sent = 0
//  - email 2 at >= 24h since last activity, recovery_emails_sent = 1
// After 72h with no recovery, mark as expired (recovered_at = now, recovered_order_id = null).
// Also fires Meta CAPI `InitiateCheckout` once per cart on the first email.

import { createClient } from "npm:@supabase/supabase-js@2";
import { sendCapiEventSafe } from "../_shared/metaCapiEvent.ts";
import { isNotificationEnabled } from "../_shared/devToggles.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const J = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const RESEND = Deno.env.get("RESEND_API_KEY") ?? "";
const LOVABLE = Deno.env.get("LOVABLE_API_KEY") ?? "";
const SITE = Deno.env.get("PUBLIC_SITE_URL") ?? "https://rescuedogwines.com";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function emailHtml(opts: { firstName: string | null; items: any[]; subtotalCents: number; checkoutUrl: string; isFinal: boolean }) {
  const greeting = opts.firstName ? `Hey ${esc(opts.firstName)},` : "Hey there,";
  const lines = (opts.items ?? []).slice(0, 6).map((i: any) => {
    const title = esc(i?.product?.node?.title ?? "Wine");
    const qty = Number(i?.quantity ?? 1);
    return `<li style="margin:6px 0">${title} × ${qty}</li>`;
  }).join("");
  const headline = opts.isFinal
    ? "One last sip before the bottle's gone"
    : "You left something good in your cart";
  const sub = opts.isFinal
    ? "Inventory is limited. We held your selections for the past day — finish up before we let someone else grab them."
    : "We saved your cart. Pick up where you left off whenever you're ready.";
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111">
      <h1 style="color:#c30017;margin:0 0 12px 0">${esc(headline)}</h1>
      <p style="margin:0 0 16px 0">${greeting}</p>
      <p style="margin:0 0 16px 0">${esc(sub)}</p>
      <ul style="padding-left:20px;margin:0 0 16px 0">${lines}</ul>
      <p style="margin:0 0 16px 0"><strong>Subtotal:</strong> $${(opts.subtotalCents/100).toFixed(2)}</p>
      <p><a href="${esc(opts.checkoutUrl)}" style="background:#c30017;color:#fff;padding:12px 20px;text-decoration:none;display:inline-block">Finish checkout</a></p>
      <p style="margin-top:24px;color:#666;font-size:12px">Every bottle helps a rescue dog find a home. — Rescue Dog Wines</p>
    </div>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND || !LOVABLE) return { ok: false, error: "resend not configured" };
  const r = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE}`,
      "X-Connection-Api-Key": RESEND,
    },
    body: JSON.stringify({
      from: "Rescue Dog Wines <hello@rescuedogwines.com>",
      to: [to],
      subject,
      html,
    }),
  });
  if (!r.ok) return { ok: false, error: `resend ${r.status}` };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Kill switch
  const { data: setting } = await admin
    .from("app_settings").select("value").eq("key", "abandoned_cart_enabled").maybeSingle();
  if (setting && (setting.value as any) === false) {
    return J(200, { ok: true, skipped: true });
  }

  const now = Date.now();
  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const threeDaysAgo = new Date(now - 72 * 60 * 60 * 1000).toISOString();

  // Expire stale carts (>72h no recovery).
  await admin.from("abandoned_carts")
    .update({ recovered_at: new Date().toISOString() })
    .is("recovered_at", null)
    .lt("last_activity_at", threeDaysAgo);

  // Find candidates.
  const { data: candidates } = await admin
    .from("abandoned_carts")
    .select("*")
    .is("recovered_at", null)
    .gt("item_count", 0)
    .or(
      `and(recovery_emails_sent.eq.0,last_activity_at.lte.${twoHoursAgo}),and(recovery_emails_sent.eq.1,last_activity_at.lte.${dayAgo})`,
    )
    .limit(100);

  let sent = 0;
  let capi = 0;
  for (const cart of candidates ?? []) {
    if (!cart.shopify_checkout_url) continue;
    let firstName: string | null = null;
    let lastName: string | null = null;
    if (cart.user_id) {
      const { data: prof } = await admin.from("profiles").select("full_name").eq("id", cart.user_id).maybeSingle();
      if (prof?.full_name) {
        const [f, ...rest] = prof.full_name.split(" ");
        firstName = f || null;
        lastName = rest.join(" ") || null;
      }
    }
    const isFinal = cart.recovery_emails_sent >= 1;
    const subject = isFinal
      ? "Last call: your cart expires soon"
      : "You left something in your cart 🐾";
    const html = emailHtml({
      firstName,
      items: cart.items ?? [],
      subtotalCents: cart.subtotal_cents ?? 0,
      checkoutUrl: cart.shopify_checkout_url,
      isFinal,
    });
    const res = await sendEmail(cart.email, subject, html);
    if (res.ok) {
      sent++;
      await admin.from("abandoned_carts").update({
        recovery_emails_sent: (cart.recovery_emails_sent ?? 0) + 1,
        last_recovery_email_at: new Date().toISOString(),
      }).eq("id", cart.id);

      // CAPI InitiateCheckout once per cart.
      if (!cart.initiate_checkout_fired) {
        void sendCapiEventSafe({
          eventName: "InitiateCheckout",
          eventId: `ab_${cart.id}`,
          valueCents: cart.subtotal_cents ?? 0,
          email: cart.email,
          firstName,
          lastName,
          country: "us",
          fbc: cart.fbc ?? null,
          fbp: cart.fbp ?? null,
          customData: {
            num_items: cart.item_count,
            content_type: "product",
            abandoned_cart_id: cart.id,
          },
        });
        capi++;
        await admin.from("abandoned_carts")
          .update({ initiate_checkout_fired: true }).eq("id", cart.id);
      }
    }
  }

  return J(200, { ok: true, candidates: candidates?.length ?? 0, sent, capi });
});