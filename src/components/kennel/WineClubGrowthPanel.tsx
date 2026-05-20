import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { MetricCard } from "@/components/kennel/MetricCard";
import { Sparkles, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { computeWineClubSignupValue, type WineClubSignupValue } from "@/lib/wineClubSignupValue";
import { fetchActiveVsMemberEmails } from "@/lib/wineClubMembers";

interface Props {
  start: Date;
  end: Date;
  rangeLabel: string;
}

interface Tier { id: string; name: string; slug: string; price_cents: number; }
interface Membership {
  id: string;
  tier_id: string;
  status: string;
  origin: string;
  is_gift: boolean | null;
  joined_at: string | null;
  cancelled_at: string | null;
  created_at: string | null;
}

function fmtPct(n: number) {
  if (!isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export function WineClubGrowthPanel({ start, end, rangeLabel }: Props) {
  const fromIso = start.toISOString();
  const toIso = end.toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ["kennel-wine-club-growth", fromIso, toIso],
    queryFn: async () => {
      const [tiersRes, mRes, pvRes, vsActiveEmails] = await Promise.all([
        supabase.from("wine_club_tiers" as any).select("id, name, slug, price_cents").eq("is_active", true),
        supabase
          .from("wine_club_memberships" as any)
          .select("id, tier_id, status, origin, is_gift, joined_at, cancelled_at, created_at"),
        supabase
          .from("ab_events" as any)
          .select("event_type, path, session_id, created_at")
          .gte("created_at", fromIso)
          .lte("created_at", toIso)
          .or("path.ilike.%wine-club%,path.ilike.%/club%"),
        fetchActiveVsMemberEmails(),
      ]);
      return {
        tiers: ((tiersRes.data as any) || []) as Tier[],
        memberships: ((mRes.data as any) || []) as Membership[],
        pv: ((pvRes.data as any) || []) as { event_type: string; path: string; session_id: string | null; created_at: string }[],
        vsActiveEmails,
      };
    },
  });

  // Mailchimp "Wine Club" tagged member count — fetched via edge function so
  // we don't expose the API key client-side. Falls back to 0 on any error.
  const { data: mailchimpClubCount } = useQuery({
    queryKey: ["kennel-mailchimp-club-count"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("kennel-mailchimp-club-count", { body: {} });
      if (error) return 0;
      return Number((data as any)?.count ?? 0);
    },
    staleTime: 5 * 60_000,
  });

  const { data: signupValue } = useQuery({
    queryKey: ["kennel-wine-club-signup-value"],
    queryFn: computeWineClubSignupValue,
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const startMs = start.getTime();
    const endMs = end.getTime();
    const inRange = (iso?: string | null) => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return t >= startMs && t <= endMs;
    };
    const m = data.memberships;
    const activeAppNow = m.filter(r => r.status === "active").length;
    const activeVsNow = data.vsActiveEmails.size;
    const activeMailchimpNow = Math.max(0, mailchimpClubCount ?? 0);
    // Vinoshipper is the system-of-record for paying members; native app
    // signups are additive. Mailchimp tag is shown as a separate signal in
    // the hint but NOT summed into the headline (Mailchimp lags VS and
    // double-counts manual tags). Headline = VS + app.
    const activeNow = activeVsNow + activeAppNow;
    const newInPeriod = m.filter(r => inRange(r.joined_at ?? r.created_at) && r.origin !== "vinoshipper_legacy").length;
    const cancelledInPeriod = m.filter(r => inRange(r.cancelled_at)).length;
    const giftsInPeriod = m.filter(r => r.is_gift && inRange(r.joined_at ?? r.created_at)).length;
    const net = newInPeriod - cancelledInPeriod;
    const churnRate = activeNow + cancelledInPeriod > 0 ? cancelledInPeriod / (activeNow + cancelledInPeriod) : 0;

    // Funnel from ab_events
    const pv = data.pv;
    const sessions = new Set<string>();
    let pageviews = 0;
    let starts = 0;
    for (const e of pv) {
      if (e.session_id) sessions.add(e.session_id);
      if (e.event_type === "pageview") pageviews++;
      if (e.event_type === "club_join_start" || e.event_type === "club_signup_start") starts++;
    }
    const visitors = sessions.size;
    const viewToStart = pageviews > 0 ? starts / pageviews : 0;
    const startToFinish = starts > 0 ? newInPeriod / starts : 0;
    const visitorToMember = visitors > 0 ? newInPeriod / visitors : 0;

    // Tier breakdown
    const tierMap = new Map(data.tiers.map(t => [t.id, t]));
    const byTier = new Map<string, number>();
    for (const r of m) {
      if (!inRange(r.joined_at ?? r.created_at)) continue;
      byTier.set(r.tier_id, (byTier.get(r.tier_id) ?? 0) + 1);
    }
    const tierRows = Array.from(byTier.entries())
      .map(([tid, count]) => ({ tier: tierMap.get(tid), count }))
      .filter(r => r.tier)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Optimization plays
    const plays: { headline: string; detail: string; intent: "high" | "med" | "low" }[] = [];

    // Recurring revenue math (assumes monthly cadence; tweak if cadence differs)
    const tierMapAll = new Map(data.tiers.map(t => [t.id, t]));
    const activeRows = m.filter(r => r.status === "active");
    const activeMrrCents = activeRows.reduce((sum, r) => sum + (tierMapAll.get(r.tier_id)?.price_cents ?? 0), 0);
    const newMrrCents = m
      .filter(r => inRange(r.joined_at ?? r.created_at) && r.origin !== "vinoshipper_legacy")
      .reduce((sum, r) => sum + (tierMapAll.get(r.tier_id)?.price_cents ?? 0), 0);
    const churnedMrrCents = m
      .filter(r => inRange(r.cancelled_at))
      .reduce((sum, r) => sum + (tierMapAll.get(r.tier_id)?.price_cents ?? 0), 0);
    const netMrrCents = newMrrCents - churnedMrrCents;
    const avgTierCents = activeRows.length > 0 ? activeMrrCents / activeRows.length : (data.tiers[0]?.price_cents ?? 0);
    const leadValue = signupValue?.lead_value_usd ?? +(avgTierCents / 100 * 0.55).toFixed(2);
    const ltvTarget = signupValue?.predicted_ltv_usd ?? +(avgTierCents / 100 * 6 * 0.55).toFixed(2);
    const targetCpl = signupValue?.target_cpl_max_usd ?? Math.max(8, Math.round(ltvTarget * 0.15));

    // Meta OUTCOME_LEADS opportunity (Lindy is wiring this campaign)
    plays.push({
      intent: "high",
      headline: `Meta OUTCOME_LEADS → send $${leadValue.toFixed(2)} per signup (predicted LTV $${ltvTarget.toFixed(2)})`,
      detail: `Lindy: send 'club_signup_complete' to Meta CAPI as a Lead/CompleteRegistration event with value=${leadValue.toFixed(2)} USD and predicted_ltv=${ltvTarget.toFixed(2)} USD. Methodology: ${signupValue?.methodology ?? "avg active tier × 55% margin, projected over 6 months retention"}. Cap auto-bidding at CPL ≤ $${targetCpl.toFixed(0)} (~15% of LTV). Seed lookalike from active members${tierRows[0]?.tier ? ` weighted toward ${tierRows[0].tier.name}` : ""}, exclude existing members + cancellations, optimize for Lead with a 7-day click window.`,
    });
    if (netMrrCents !== 0 || activeMrrCents > 0) {
      plays.push({
        intent: netMrrCents < 0 ? "high" : "med",
        headline: `Recurring revenue: $${(activeMrrCents / 100).toLocaleString()} MRR · net ${netMrrCents >= 0 ? "+" : ""}$${(netMrrCents / 100).toLocaleString()}`,
        detail: `New $${(newMrrCents / 100).toLocaleString()} vs churned $${(churnedMrrCents / 100).toLocaleString()} this period. Reallocate budget weekly toward channels that produce signups under the $${targetCpl.toFixed(0)} CPL cap.`,
      });
    }

    if (newInPeriod === 0) {
      plays.push({
        intent: "high",
        headline: "No new club signups this period",
        detail: "Add a sticky 'Join the Pack' CTA on PDPs and surface mission framing in the cart drawer. Run a winback to 6mo-lapsed DTC buyers offering first-bottle access to a limited tier.",
      });
    } else if (visitors > 0 && visitorToMember < 0.005) {
      plays.push({
        intent: "high",
        headline: `Visitor→member ${(visitorToMember * 100).toFixed(2)}% — funnel leaking`,
        detail: "Tighten the /wine-club page: lead with member-only access + mission, move social proof above the fold, and add an exit-intent prompt with curated picks.",
      });
    }
    if (pageviews > 50 && viewToStart < 0.02) {
      plays.push({
        intent: "med",
        headline: "Page views aren't starting signup",
        detail: "Reduce friction on the join CTA — one-screen tier picker, no scroll required. Test 'mixed' tier as the default selection.",
      });
    }
    if (starts > 0 && startToFinish < 0.5) {
      plays.push({
        intent: "high",
        headline: `${fmtPct(startToFinish)} of starts complete`,
        detail: "Cut steps in the join flow: collapse shipping + tier into one screen, defer gift options to a follow-up.",
      });
    }
    if (cancelledInPeriod > newInPeriod && newInPeriod > 0) {
      plays.push({
        intent: "high",
        headline: "Net membership shrinking",
        detail: "Trigger 'before you go' retention flow on cancel intent — offer pause, tier swap, or skip-a-shipment before letting go.",
      });
    }
    if (tierRows.length > 0 && tierRows[0].count > 0) {
      const top = tierRows[0].tier!;
      plays.push({
        intent: "low",
        headline: `Top performer: ${top.name}`,
        detail: `Feature this tier prominently on /wine-club and in welcome series step 4. Build a paid social audience of lookalikes from current ${top.name} members.`,
      });
    }
    if (giftsInPeriod === 0 && newInPeriod > 0) {
      plays.push({
        intent: "med",
        headline: "Zero gift memberships",
        detail: "Surface 'give The Pack' in cart confirmation and seasonal pushes (Mother's Day, holidays). Gift buyers convert faster than self-purchase.",
      });
    }

    return {
      activeNow,
      activeAppNow,
      activeVsNow,
      activeMailchimpNow,
      newInPeriod,
      cancelledInPeriod,
      giftsInPeriod,
      net,
      churnRate,
      visitors,
      pageviews,
      starts,
      viewToStart,
      startToFinish,
      visitorToMember,
      tierRows,
      plays,
      activeMrrCents,
      newMrrCents,
      churnedMrrCents,
      netMrrCents,
      avgTierCents,
      ltvTarget,
    };
  }, [data, start, end, signupValue, mailchimpClubCount]);

  return (
    <section className="space-y-2">
      <h2 className="text-xs uppercase tracking-brand font-bold text-muted-foreground">
        Wine club growth · The Pack
      </h2>

      {isLoading || !stats ? (
        <div className="text-muted-foreground text-sm">Loading club signal…</div>
      ) : (
        <>
          {signupValue && (
            <div className="border-2 border-primary bg-primary/5 p-4" style={{ borderRadius: 0 }}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-[10px] uppercase tracking-brand font-bold text-primary">
                    Signup value · sent to ad platforms
                  </div>
                  <div className="flex items-baseline gap-4 mt-1 flex-wrap">
                    <div>
                      <div className="text-2xl font-bold tabular-nums text-foreground">${signupValue.lead_value_usd.toFixed(2)}</div>
                      <div className="text-[10px] uppercase tracking-brand text-muted-foreground">per Lead event</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold tabular-nums text-foreground">${signupValue.predicted_ltv_usd.toFixed(2)}</div>
                      <div className="text-[10px] uppercase tracking-brand text-muted-foreground">predicted_ltv ({signupValue.retention_months}mo)</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold tabular-nums text-foreground">${signupValue.target_cpl_max_usd.toFixed(0)}</div>
                      <div className="text-[10px] uppercase tracking-brand text-muted-foreground">max CPL · bid cap</div>
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground max-w-md leading-relaxed">
                  {signupValue.methodology}
                  {signupValue.source === "computed" && (
                    <span className="block mt-1 text-[10px] uppercase tracking-brand">
                      Override via <code className="font-mono">app_settings.wine_club_signup_lead_value_cents</code>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Active members"
              value={stats.activeNow.toLocaleString()}
              hint={`VS ${stats.activeVsNow.toLocaleString()} · MC ${stats.activeMailchimpNow.toLocaleString()} · app ${stats.activeAppNow.toLocaleString()}`}
            />
            <MetricCard
              label={`New signups (${rangeLabel})`}
              value={stats.newInPeriod.toLocaleString()}
              hint={stats.giftsInPeriod > 0 ? `${stats.giftsInPeriod} gift` : "self-purchase"}
            />
            <MetricCard
              label={`Cancellations (${rangeLabel})`}
              value={stats.cancelledInPeriod.toLocaleString()}
              hint={`Churn rate ${fmtPct(stats.churnRate)}`}
            />
            <MetricCard
              label={`Net growth (${rangeLabel})`}
              value={`${stats.net >= 0 ? "+" : ""}${stats.net.toLocaleString()}`}
              hint={stats.net > 0 ? "Growing" : stats.net < 0 ? "Shrinking" : "Flat"}
            />
          </div>

          <div className="border-2 border-foreground p-4 mt-3" style={{ borderRadius: 0 }}>
            <h3 className="text-xs uppercase tracking-brand font-bold text-foreground mb-3">
              Recurring revenue ({rangeLabel})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-muted-foreground uppercase tracking-brand">Active MRR</div>
                <div className="text-lg font-bold tabular-nums">${(stats.activeMrrCents / 100).toLocaleString()}</div>
                <div className="text-muted-foreground">avg tier ${(stats.avgTierCents / 100).toFixed(0)}</div>
              </div>
              <div>
                <div className="text-muted-foreground uppercase tracking-brand">New MRR</div>
                <div className="text-lg font-bold tabular-nums text-primary">+${(stats.newMrrCents / 100).toLocaleString()}</div>
                <div className="text-muted-foreground">from {stats.newInPeriod} signup{stats.newInPeriod === 1 ? "" : "s"}</div>
              </div>
              <div>
                <div className="text-muted-foreground uppercase tracking-brand">Churned MRR</div>
                <div className="text-lg font-bold tabular-nums">−${(stats.churnedMrrCents / 100).toLocaleString()}</div>
                <div className="text-muted-foreground">{stats.cancelledInPeriod} cancelled</div>
              </div>
              <div>
                <div className="text-muted-foreground uppercase tracking-brand">Net MRR Δ</div>
                <div className={`text-lg font-bold tabular-nums ${stats.netMrrCents < 0 ? "text-destructive" : "text-foreground"}`}>
                  {stats.netMrrCents >= 0 ? "+" : "−"}${Math.abs(stats.netMrrCents / 100).toLocaleString()}
                </div>
                <div className="text-muted-foreground">target LTV ${stats.ltvTarget.toFixed(0)}</div>
              </div>
            </div>
          </div>

          <div className="border-2 border-foreground p-4 mt-3" style={{ borderRadius: 0 }}>
            <h3 className="text-xs uppercase tracking-brand font-bold text-foreground mb-3">
              Signup funnel ({rangeLabel})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-muted-foreground uppercase tracking-brand">Visitors</div>
                <div className="text-lg font-bold tabular-nums">{stats.visitors.toLocaleString()}</div>
                <div className="text-muted-foreground">{stats.pageviews.toLocaleString()} views</div>
              </div>
              <div>
                <div className="text-muted-foreground uppercase tracking-brand">Started signup</div>
                <div className="text-lg font-bold tabular-nums">{stats.starts.toLocaleString()}</div>
                <div className="text-muted-foreground">{fmtPct(stats.viewToStart)} of views</div>
              </div>
              <div>
                <div className="text-muted-foreground uppercase tracking-brand">Completed</div>
                <div className="text-lg font-bold tabular-nums">{stats.newInPeriod.toLocaleString()}</div>
                <div className="text-muted-foreground">{fmtPct(stats.startToFinish)} of starts</div>
              </div>
              <div>
                <div className="text-muted-foreground uppercase tracking-brand">Visitor → Member</div>
                <div className="text-lg font-bold tabular-nums text-primary">{fmtPct(stats.visitorToMember)}</div>
                <div className="text-muted-foreground">end-to-end</div>
              </div>
            </div>
          </div>

          {stats.tierRows.length > 0 && (
            <div className="border-2 border-foreground p-4" style={{ borderRadius: 0 }}>
              <h3 className="text-xs uppercase tracking-brand font-bold text-foreground mb-3">
                Top tiers ({rangeLabel})
              </h3>
              <table className="w-full text-xs">
                <tbody>
                  {stats.tierRows.map(({ tier, count }) => (
                    <tr key={tier!.id} className="border-b border-border last:border-0">
                      <td className="py-1.5 text-foreground font-bold">{tier!.name}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums text-muted-foreground">
                        ${(tier!.price_cents / 100).toFixed(0)}
                      </td>
                      <td className="py-1.5 pl-2 text-right tabular-nums font-bold text-foreground">
                        {count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-2 border-primary bg-primary/5 p-4 mt-3" style={{ borderRadius: 0 }}>
            <h3 className="text-xs uppercase tracking-brand font-bold text-foreground mb-3 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Optimization plays
            </h3>
            {stats.plays.length === 0 ? (
              <p className="text-xs text-muted-foreground">No plays surfaced. Funnel reads healthy for this window.</p>
            ) : (
              <ul className="space-y-2.5">
                {stats.plays.map((p, i) => {
                  const Icon = p.intent === "high" ? TrendingUp : p.intent === "med" ? Minus : TrendingDown;
                  const tone =
                    p.intent === "high"
                      ? "text-primary"
                      : p.intent === "med"
                      ? "text-amber-600"
                      : "text-muted-foreground";
                  return (
                    <li key={i} className="flex gap-2 text-xs">
                      <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${tone}`} />
                      <div>
                        <div className="uppercase tracking-brand font-bold text-foreground">{p.headline}</div>
                        <div className="text-muted-foreground leading-relaxed">{p.detail}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <Link
              to="/wine-club"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 mt-3 uppercase tracking-brand font-bold text-primary text-xs hover:underline"
            >
              Open /wine-club <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

// Helper for KennelDashboard to enrich the AI snapshot with club signal.
export async function fetchWineClubAiSlice(start: Date, end: Date) {
  const fromIso = start.toISOString();
  const toIso = end.toISOString();
  const [tiersRes, mRes, pvRes, vsActiveEmails] = await Promise.all([
    supabase.from("wine_club_tiers" as any).select("id, name, slug, price_cents").eq("is_active", true),
    supabase.from("wine_club_memberships" as any).select("id, tier_id, status, origin, is_gift, joined_at, cancelled_at, created_at"),
    supabase.from("ab_events" as any).select("event_type, path, session_id").gte("created_at", fromIso).lte("created_at", toIso).or("path.ilike.%wine-club%,path.ilike.%/club%"),
    fetchActiveVsMemberEmails(),
  ]);
  const tiers = ((tiersRes.data as any) || []) as { id: string; name: string; price_cents: number }[];
  const m = ((mRes.data as any) || []) as Membership[];
  const pv = ((pvRes.data as any) || []) as { event_type: string; session_id: string | null }[];
  const startMs = start.getTime();
  const endMs = end.getTime();
  const inRange = (iso?: string | null) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= startMs && t <= endMs;
  };
  const activeNow = vsActiveEmails.size + m.filter(r => r.status === "active").length;
  const newInPeriod = m.filter(r => inRange(r.joined_at ?? r.created_at) && r.origin !== "vinoshipper_legacy").length;
  const cancelledInPeriod = m.filter(r => inRange(r.cancelled_at)).length;
  const giftsInPeriod = m.filter(r => r.is_gift && inRange(r.joined_at ?? r.created_at)).length;
  const tierMap = new Map(tiers.map(t => [t.id, t]));
  const byTier = new Map<string, number>();
  for (const r of m) {
    if (!inRange(r.joined_at ?? r.created_at)) continue;
    byTier.set(r.tier_id, (byTier.get(r.tier_id) ?? 0) + 1);
  }
  const top_tiers = Array.from(byTier.entries())
    .map(([tid, count]) => ({ name: tierMap.get(tid)?.name ?? "Unknown", price: (tierMap.get(tid)?.price_cents ?? 0) / 100, signups: count }))
    .sort((a, b) => b.signups - a.signups)
    .slice(0, 5);
  const activeRows = m.filter(r => r.status === "active");
  const active_mrr = activeRows.reduce((s, r) => s + (tierMap.get(r.tier_id)?.price_cents ?? 0), 0) / 100;
  const new_mrr = m.filter(r => inRange(r.joined_at ?? r.created_at) && r.origin !== "vinoshipper_legacy").reduce((s, r) => s + (tierMap.get(r.tier_id)?.price_cents ?? 0), 0) / 100;
  const churned_mrr = m.filter(r => inRange(r.cancelled_at)).reduce((s, r) => s + (tierMap.get(r.tier_id)?.price_cents ?? 0), 0) / 100;
  const avg_tier_price = activeRows.length > 0 ? active_mrr / activeRows.length : (tiers[0]?.price_cents ?? 0) / 100;
  const target_ltv = avg_tier_price * 18; // 18mo retention assumption
  const sessions = new Set<string>();
  let pageviews = 0, starts = 0;
  for (const e of pv) {
    if (e.session_id) sessions.add(e.session_id);
    if (e.event_type === "pageview") pageviews++;
    if (e.event_type === "club_join_start" || e.event_type === "club_signup_start") starts++;
  }
  return {
    active_members: activeNow,
    new_signups: newInPeriod,
    cancellations: cancelledInPeriod,
    gift_signups: giftsInPeriod,
    net_growth: newInPeriod - cancelledInPeriod,
    funnel: {
      visitors: sessions.size,
      pageviews,
      starts,
      completed: newInPeriod,
      visitor_to_member_rate: sessions.size > 0 ? newInPeriod / sessions.size : 0,
      start_to_complete_rate: starts > 0 ? newInPeriod / starts : 0,
    },
    top_tiers,
    recurring_revenue: {
      active_mrr,
      new_mrr,
      churned_mrr,
      net_mrr_delta: new_mrr - churned_mrr,
      avg_tier_price,
      target_ltv_18mo: target_ltv,
    },
    meta_outcome_leads_opportunity: {
      status: "Lindy is provisioning an OUTCOME_LEADS ad set in Meta",
      recommended_lead_value: avg_tier_price,
      recommended_predicted_ltv: target_ltv,
      target_cpl_max: Math.max(8, Math.round(target_ltv * 0.15)),
      lookalike_seed: "active Vinoshipper club-member emails + active app memberships, exclude existing members and recent cancellations",
      events_to_send: ["club_signup_start (Lead)", "club_signup_complete (CompleteRegistration, value=avg_tier_price)"],
      landing_page: "/wine-club",
    },
  };
}