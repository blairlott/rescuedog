// Cron-driven welcome-series dispatcher.
// Reads due rows from welcome_email_schedule and invokes send-transactional-email.
// Idempotent: each row is marked sent/failed so re-runs only process pending rows.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { isNotificationEnabled } from "../_shared/devToggles.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 25;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Dev-toggle gate (CMS Settings → Dev Controls → Customer Notifications)
  if (!(await isNotificationEnabled("welcome_series"))) {
    return new Response(JSON.stringify({ ok: true, processed: 0, skipped: "dev_toggle_off" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: due, error } = await supabase
    .from("welcome_email_schedule")
    .select("id, user_id, email, template_name, attempts")
    .eq("status", "pending")
    .lte("send_at", new Date().toISOString())
    .order("send_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("[welcome-dispatch] query failed", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!due || due.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sent = 0;
  let failed = 0;

  for (const row of due) {
    try {
      const { error: invokeErr } = await supabase.functions.invoke(
        "send-transactional-email",
        {
          body: {
            templateName: row.template_name,
            recipientEmail: row.email,
            idempotencyKey: `welcome-${row.id}`,
          },
        },
      );
      if (invokeErr) throw invokeErr;
      await supabase
        .from("welcome_email_schedule")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          attempts: (row.attempts ?? 0) + 1,
        })
        .eq("id", row.id);
      sent++;
    } catch (e) {
      const attempts = (row.attempts ?? 0) + 1;
      const status = attempts >= 5 ? "failed" : "pending";
      await supabase
        .from("welcome_email_schedule")
        .update({
          status,
          attempts,
          last_error: String(e).slice(0, 500),
        })
        .eq("id", row.id);
      failed++;
      console.error(`[welcome-dispatch] failed row ${row.id}:`, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: due.length, sent, failed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});