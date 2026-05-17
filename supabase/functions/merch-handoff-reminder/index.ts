import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Scans pending_merch_handoffs for rows in status='pending' that were
 * created more than REMINDER_AFTER_MINUTES ago and emails the customer
 * a one-tap link to finish their merch checkout. Marks the row as
 * 'emailed' after a successful send. Rows older than EXPIRE_AFTER_HOURS
 * are marked 'expired' without sending. Designed to be invoked by
 * pg_cron every 5–10 minutes; safe to invoke manually as well.
 */
const REMINDER_AFTER_MINUTES = 30;
const EXPIRE_AFTER_HOURS = 24;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const reminderCutoff = new Date(Date.now() - REMINDER_AFTER_MINUTES * 60 * 1000).toISOString();
  const expireCutoff = new Date(Date.now() - EXPIRE_AFTER_HOURS * 60 * 60 * 1000).toISOString();

  // First: expire stale rows.
  await supabase
    .from("pending_merch_handoffs")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("created_at", expireCutoff);

  // Then: fetch ones ready for a reminder.
  const { data: pending, error } = await supabase
    .from("pending_merch_handoffs")
    .select("id, email, checkout_url, item_count, subtotal_cents, wine_order_id, user_id")
    .eq("status", "pending")
    .lt("created_at", reminderCutoff)
    .limit(50);

  if (error) {
    console.error("[merch-handoff-reminder] fetch error", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let failed = 0;

  for (const row of pending ?? []) {
    try {
      // Look up the customer name from profiles if we have a user_id.
      let name: string | undefined;
      if (row.user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", row.user_id)
          .maybeSingle();
        name = (profile?.full_name as string | undefined)?.split(" ")[0];
      }

      const subtotalDollars = (Number(row.subtotal_cents ?? 0) / 100).toFixed(2);
      const { error: sendErr } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "merch-checkout-reminder",
          recipientEmail: row.email,
          idempotencyKey: `merch-reminder-${row.id}`,
          templateData: {
            name,
            checkoutUrl: row.checkout_url,
            itemCount: row.item_count,
            subtotalDollars,
            wineOrderId: row.wine_order_id ?? undefined,
          },
        },
      });
      if (sendErr) throw sendErr;

      await supabase
        .from("pending_merch_handoffs")
        .update({ status: "emailed", reminder_sent_at: new Date().toISOString() })
        .eq("id", row.id);
      sent += 1;
    } catch (e) {
      console.error("[merch-handoff-reminder] send failed", row.id, e);
      failed += 1;
    }
  }

  return new Response(
    JSON.stringify({ scanned: pending?.length ?? 0, sent, failed }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});