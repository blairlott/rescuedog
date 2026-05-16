import { supabase } from "@/integrations/supabase/client";
import { getVisitorId } from "./visitorId";

/**
 * Records a revenue event against every running experiment this visitor was
 * exposed to. Call from ThankYou / order-complete surfaces so bandits can
 * optimize on revenue-per-visitor across every active surface.
 *
 * Safe to call multiple times — server has no idempotency, so callers must
 * gate with order id.
 */
export async function recordExperimentRevenueForVisitor(
  revenueCents: number,
  goalKey: string,
  metadata: Record<string, unknown> = {},
) {
  if (!revenueCents || revenueCents <= 0) return;
  const visitorId = getVisitorId();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: assignments } = await supabase
    .from("experiment_assignments")
    .select("experiment_id, variant_id, experiments!inner(status)")
    .eq("visitor_id", visitorId);

  const active = (assignments ?? []).filter((a: { experiments?: { status?: string } }) => a.experiments?.status === "running");
  await Promise.all(
    active.map((a: { experiment_id: string; variant_id: string }) =>
      supabase.rpc("experiment_record", {
        _experiment_id: a.experiment_id,
        _variant_id: a.variant_id,
        _visitor_id: visitorId,
        _user_id: user?.id ?? null,
        _event_type: "revenue",
        _revenue_cents: Math.round(revenueCents),
        _goal_key: goalKey,
        _metadata: metadata as never,
      }),
    ),
  );
}