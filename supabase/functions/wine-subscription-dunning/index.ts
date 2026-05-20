/**
 * Wine subscription dunning + card-expiry notifier.
 *
 * Cron-triggered daily. For each active subscription:
 *
 *  FAILURES (failure_count > 0):
 *    Stage 0 -> 1  : send "payment failed" email                 (immediately on first failure)
 *    Stage 1 -> 2  : send "reminder" email   (~3 days later)
 *    Stage 2 -> 3  : send "paused" email + pause subscription    (~7 days later)
 *
 *  CARD EXPIRY (when card_exp_month/year populated and within 30 days):
 *    Send a single "card expiring" email per expiry window.
 *
 * Manual trigger: POST { dry_run: true } to preview without sending.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { isInternalEmail } from "../_shared/internalUsers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UPDATE_CARD_URL = "https://www.vinoshipper.com/account";
const STAGE_GAP_DAYS = [0, 3, 7]; // stage 1: now, stage 2: +3d, stage 3: +7d
const EXPIRY_WINDOW_DAYS = 30;

interface SubRow {
  id: string;
  user_id: string;
  product_title: string;
  failure_count: number;
  dunning_stage: number;
  last_dunning_sent_at: string | null;
  card_last4: string | null;
  card_exp_month: number | null;
  card_exp_year: number | null;
  card_expiry_notice_sent_at: string | null;
  status: string;
}

function daysBetween(a: Date, b: Date) {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: { dry_run?: boolean } = {};
  try { body = await req.json(); } catch { /* cron */ }
  const dryRun = !!body.dry_run;

  const now = new Date();

  // --- 1. Pull candidates ---
  const { data: failureSubs, error: e1 } = await svc
    .from("wine_subscriptions")
    .select("id,user_id,product_title,failure_count,dunning_stage,last_dunning_sent_at,card_last4,card_exp_month,card_exp_year,card_expiry_notice_sent_at,status")
    .gt("failure_count", 0);
  if (e1) return json({ error: e1.message }, 500);

  const { data: expirySubs, error: e2 } = await svc
    .from("wine_subscriptions")
    .select("id,user_id,product_title,failure_count,dunning_stage,last_dunning_sent_at,card_last4,card_exp_month,card_exp_year,card_expiry_notice_sent_at,status")
    .eq("status", "active")
    .not("card_exp_month", "is", null)
    .not("card_exp_year", "is", null)
    .is("card_expiry_notice_sent_at", null);
  if (e2) return json({ error: e2.message }, 500);

  const results = { failure_sent: 0, paused: 0, expiry_sent: 0, skipped: 0, dry_run: dryRun, errors: [] as string[] };

  // Helper: fetch email + name for a user, suppress internal test accounts.
  async function userEmail(userId: string): Promise<{ email: string; name?: string } | null> {
    const { data } = await svc.auth.admin.getUserById(userId);
    const email = data?.user?.email;
    if (!email) return null;
    if (isInternalEmail(email)) return null;
    const name = (data?.user?.user_metadata as any)?.full_name?.split(" ")?.[0];
    return { email, name };
  }

  async function send(template: string, to: string, idem: string, templateData: Record<string, any>) {
    if (dryRun) return;
    const { error } = await svc.functions.invoke("send-transactional-email", {
      body: { templateName: template, recipientEmail: to, idempotencyKey: idem, templateData },
    });
    if (error) results.errors.push(`${template} -> ${to}: ${error.message}`);
  }

  // --- 2. Failure dunning ---
  for (const s of (failureSubs ?? []) as SubRow[]) {
    const nextStage = Math.min(3, s.dunning_stage + 1);
    const requiredGap = STAGE_GAP_DAYS[nextStage - 1] ?? 0;
    const lastSent = s.last_dunning_sent_at ? new Date(s.last_dunning_sent_at) : null;
    const daysSince = lastSent ? daysBetween(now, lastSent) : Infinity;
    if (s.dunning_stage > 0 && daysSince < requiredGap) {
      results.skipped++;
      continue;
    }
    if (s.dunning_stage >= 3) { results.skipped++; continue; }

    const u = await userEmail(s.user_id);
    if (!u) { results.skipped++; continue; }

    await send("wine-subscription-payment-failed", u.email, `wine-sub-dunning-${s.id}-stage${nextStage}`, {
      memberName: u.name,
      productTitle: s.product_title,
      attemptCount: s.failure_count,
      updateCardUrl: UPDATE_CARD_URL,
      stage: nextStage,
    });

    if (!dryRun) {
      const patch: Record<string, any> = {
        dunning_stage: nextStage,
        last_dunning_sent_at: now.toISOString(),
      };
      if (nextStage === 3) {
        patch.status = "paused";
        patch.paused_at = now.toISOString();
        results.paused++;
      }
      await svc.from("wine_subscriptions").update(patch).eq("id", s.id);
    }
    results.failure_sent++;
  }

  // --- 3. Card expiry warnings ---
  for (const s of (expirySubs ?? []) as SubRow[]) {
    if (!s.card_exp_month || !s.card_exp_year) continue;
    // Expiry = last day of that month.
    const expiry = new Date(s.card_exp_year, s.card_exp_month, 0, 23, 59, 59);
    const daysToExpiry = daysBetween(expiry, now);
    if (daysToExpiry < 0 || daysToExpiry > EXPIRY_WINDOW_DAYS) continue;

    const u = await userEmail(s.user_id);
    if (!u) { results.skipped++; continue; }

    await send("wine-subscription-card-expiring", u.email, `wine-sub-cardexp-${s.id}-${s.card_exp_year}${s.card_exp_month}`, {
      memberName: u.name,
      productTitle: s.product_title,
      cardLast4: s.card_last4,
      expMonth: s.card_exp_month,
      expYear: s.card_exp_year,
      updateCardUrl: UPDATE_CARD_URL,
    });

    if (!dryRun) {
      await svc.from("wine_subscriptions")
        .update({ card_expiry_notice_sent_at: now.toISOString() })
        .eq("id", s.id);
    }
    results.expiry_sent++;
  }

  return json({ ok: true, ...results });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}