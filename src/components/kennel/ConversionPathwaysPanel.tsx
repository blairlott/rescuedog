import { useQuery } from "@tanstack/react-query";
import { fetchConversionPathways } from "@/lib/wineClubMembers";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

function fmtPct(n: number) {
  if (!isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
function fmtUsd(cents: number | null) {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-16 shrink-0 text-muted-foreground uppercase tracking-brand">{label}</div>
      <div className="flex-1 h-4 bg-muted relative" style={{ borderRadius: 0 }}>
        <div
          className="absolute inset-y-0 left-0 bg-primary"
          style={{ width: `${pct}%`, borderRadius: 0 }}
        />
      </div>
      <div className="w-10 shrink-0 text-right tabular-nums font-bold">{count}</div>
    </div>
  );
}

export function ConversionPathwaysPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["kennel-conversion-pathways-v1"],
    queryFn: fetchConversionPathways,
    staleTime: 5 * 60_000,
  });

  const { data: triggers } = useQuery({
    queryKey: ["kennel-conversion-triggers-v1"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "wine_club_conversion_triggers" as never,
      );
      if (error) throw error;
      const arr = (data ?? []) as unknown as any[];
      const row = Array.isArray(arr) ? arr[0] : arr;
      return row as null | {
        total_guests: number;
        converters: number;
        baseline_rate: number;
        tasting_touched: number;
        tasting_converters: number;
        tasting_rate: number;
        welcome_3plus_touched: number;
        welcome_3plus_converters: number;
        welcome_3plus_rate: number;
        wine_club_page_touched: number;
        wine_club_page_converters: number;
        wine_club_page_rate: number;
        multi_bottle_touched: number;
        multi_bottle_converters: number;
        multi_bottle_rate: number;
      };
    },
    staleTime: 5 * 60_000,
  });

  return (
    <section className="space-y-2">
      <h2 className="text-xs uppercase tracking-brand font-bold text-muted-foreground">
        Conversion pathways · guest → club
      </h2>

      {isLoading || !data ? (
        <div className="text-muted-foreground text-sm">Analyzing conversion signal from Vinoshipper…</div>
      ) : (
        <div className="space-y-3">
          {/* Headline tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile
              label="Guest → Club rate"
              value={fmtPct(data.conversionRate)}
              hint={`${data.converters.toLocaleString()} of ${(data.converters + data.guestOnly).toLocaleString()} guests`}
            />
            <Tile
              label="Median time to join"
              value={data.medianDaysToConvert != null ? `${data.medianDaysToConvert}d` : "—"}
              hint="from first guest order"
            />
            <Tile
              label="Median orders before joining"
              value={data.medianGuestOrders != null ? `${data.medianGuestOrders}` : "—"}
              hint={`spend ${fmtUsd(data.medianGuestSpendCents)}`}
            />
            <Tile
              label="Direct joiners"
              value={data.directJoiners.toLocaleString()}
              hint="club on first interaction"
            />
          </div>

          {/* Time-to-convert + orders-before */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card title="Time to convert (days)">
              <div className="space-y-1.5">
                {data.daysBuckets.map((b) => (
                  <Bar
                    key={b.label}
                    label={b.label}
                    count={b.count}
                    max={Math.max(...data.daysBuckets.map((x) => x.count), 1)}
                  />
                ))}
              </div>
            </Card>
            <Card title="Guest orders before joining">
              <div className="space-y-1.5">
                {data.ordersBuckets.map((b) => (
                  <Bar
                    key={b.label}
                    label={b.label}
                    count={b.count}
                    max={Math.max(...data.ordersBuckets.map((x) => x.count), 1)}
                  />
                ))}
              </div>
            </Card>
          </div>

          {/* Channel + states + month */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card title="Gateway channel">
              <div className="space-y-1.5">
                {data.channelMix.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No channel signal yet.</div>
                ) : (
                  data.channelMix.map((c) => (
                    <Bar
                      key={c.channel}
                      label={c.channel}
                      count={c.count}
                      max={Math.max(...data.channelMix.map((x) => x.count), 1)}
                    />
                  ))
                )}
              </div>
            </Card>
            <Card title="Top ship-to states">
              <div className="space-y-1.5">
                {data.topStates.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No state signal yet.</div>
                ) : (
                  data.topStates.map((s) => (
                    <Bar
                      key={s.state}
                      label={s.state}
                      count={s.count}
                      max={Math.max(...data.topStates.map((x) => x.count), 1)}
                    />
                  ))
                )}
              </div>
            </Card>
            <Card title="Month of signup">
              <div className="space-y-1.5">
                {data.monthOfYear.map((m) => (
                  <Bar
                    key={m.month}
                    label={m.month}
                    count={m.count}
                    max={Math.max(...data.monthOfYear.map((x) => x.count), 1)}
                  />
                ))}
              </div>
            </Card>
          </div>

          {/* Growth interpretation */}
          <div className="border-2 border-primary bg-primary/5 p-4" style={{ borderRadius: 0 }}>
            <div className="flex items-start gap-3">
              <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 text-xs text-foreground leading-relaxed space-y-1">
                <div className="uppercase tracking-brand font-bold">Growth read</div>
                <p>{buildReadout(data)}</p>
              </div>
            </div>
          </div>

          {/* Trigger attribution */}
          {triggers && (
            <TriggerAttribution t={triggers} />
          )}

          {/* À la carte sales */}
          <AlaCartePanel ac={data.alaCarte} />
        </div>
      )}
    </section>
  );
}

const COHORT_LABEL: Record<string, string> = {
  guestOnly: "Guest-only",
  preConversion: "Pre-conversion",
  postConversion: "Member add-on (converters)",
  directMember: "Member add-on (direct joiners)",
};

function AlaCartePanel({ ac }: { ac: import("@/lib/wineClubMembers").AlaCarteSummary }) {
  const maxCohort = Math.max(...ac.byCohort.map((c) => c.orders), 1);
  const maxChannel = Math.max(...ac.channelMix.map((c) => c.orders), 1);
  return (
    <div className="border-2 border-foreground p-4 space-y-3" style={{ borderRadius: 0 }}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs uppercase tracking-brand font-bold text-foreground">
          À la carte sales · non-club one-off orders
        </h3>
        <div className="text-[11px] text-muted-foreground">
          {ac.uniqueBuyers.toLocaleString()} unique buyers
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Orders" value={ac.totalOrders.toLocaleString()} />
        <Tile label="Revenue" value={fmtUsd(ac.totalRevenueCents)} />
        <Tile label="AOV" value={fmtUsd(ac.aovCents)} />
        <Tile
          label="Member add-on rate"
          value={fmtPct(ac.memberAddonRate)}
          hint="members who also buy à la carte"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card title="Orders by cohort">
          <div className="space-y-1.5">
            {ac.byCohort.map((c) => (
              <div key={c.cohort} className="space-y-0.5">
                <Bar
                  label={COHORT_LABEL[c.cohort] ?? c.cohort}
                  count={c.orders}
                  max={maxCohort}
                />
                <div className="pl-[4.5rem] text-[10px] text-muted-foreground tabular-nums">
                  {c.buyers.toLocaleString()} buyers · {fmtUsd(c.revenueCents)}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Channel mix">
          <div className="space-y-1.5">
            {ac.channelMix.length === 0 ? (
              <div className="text-xs text-muted-foreground">No à la carte signal yet.</div>
            ) : (
              ac.channelMix.map((c) => (
                <div key={c.channel} className="space-y-0.5">
                  <Bar label={c.channel} count={c.orders} max={maxChannel} />
                  <div className="pl-[4.5rem] text-[10px] text-muted-foreground tabular-nums">
                    {fmtUsd(c.revenueCents)}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        À la carte = any non-WINE_CLUB transaction. "Pre-conversion" is what fed the funnel;
        "Member add-on" is incremental revenue layered on top of club shipments — the higher that
        rate, the deeper your members are engaging.
      </p>
    </div>
  );
}

function lift(rate: number, baseline: number): { pct: string; cls: string } {
  if (!baseline || baseline === 0) return { pct: "—", cls: "text-muted-foreground" };
  const x = rate / baseline;
  const arrow = x >= 1 ? "+" : "";
  return {
    pct: `${arrow}${((x - 1) * 100).toFixed(0)}%`,
    cls: x >= 1.25 ? "text-primary" : x <= 0.75 ? "text-destructive" : "text-foreground",
  };
}

function TriggerAttribution({
  t,
}: {
  t: {
    total_guests: number;
    converters: number;
    baseline_rate: number;
    tasting_touched: number;
    tasting_rate: number;
    welcome_3plus_touched: number;
    welcome_3plus_rate: number;
    wine_club_page_touched: number;
    wine_club_page_rate: number;
    multi_bottle_touched: number;
    multi_bottle_rate: number;
  };
}) {
  const baseline = Number(t.baseline_rate ?? 0);
  const rows = [
    {
      label: "Attended tasting / event",
      touched: t.tasting_touched,
      rate: Number(t.tasting_rate ?? 0),
      detail: "guest had a POS or EVENT order before joining",
    },
    {
      label: "Welcome email reached step 3+",
      touched: t.welcome_3plus_touched,
      rate: Number(t.welcome_3plus_rate ?? 0),
      detail: "welcome series 'mission' email landed before join",
    },
    {
      label: "Viewed /wine-club page",
      touched: t.wine_club_page_touched,
      rate: Number(t.wine_club_page_rate ?? 0),
      detail: "site intel pageview, requires linked account",
    },
    {
      label: "Bought 2+ bottles in one order",
      touched: t.multi_bottle_touched,
      rate: Number(t.multi_bottle_rate ?? 0),
      detail: "multi-bottle purchase is the strongest commit signal",
    },
  ];

  return (
    <div className="border-2 border-foreground p-4" style={{ borderRadius: 0 }}>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-xs uppercase tracking-brand font-bold text-foreground">
          Trigger attribution · lift vs baseline
        </h3>
        <div className="text-[11px] text-muted-foreground">
          baseline {(baseline * 100).toFixed(1)}% · {Number(t.total_guests).toLocaleString()} guests
        </div>
      </div>
      <div className="space-y-2">
        {rows.map((r) => {
          const L = lift(r.rate, baseline);
          return (
            <div
              key={r.label}
              className="grid grid-cols-12 gap-2 items-baseline text-xs border-t border-muted pt-2"
            >
              <div className="col-span-6">
                <div className="font-bold text-foreground">{r.label}</div>
                <div className="text-[11px] text-muted-foreground">{r.detail}</div>
              </div>
              <div className="col-span-2 text-right">
                <div className="text-muted-foreground uppercase tracking-brand text-[10px]">touched</div>
                <div className="tabular-nums font-bold">{Number(r.touched).toLocaleString()}</div>
              </div>
              <div className="col-span-2 text-right">
                <div className="text-muted-foreground uppercase tracking-brand text-[10px]">convert</div>
                <div className="tabular-nums font-bold">{(r.rate * 100).toFixed(1)}%</div>
              </div>
              <div className="col-span-2 text-right">
                <div className="text-muted-foreground uppercase tracking-brand text-[10px]">lift</div>
                <div className={`tabular-nums font-bold ${L.cls}`}>{L.pct}</div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        Lift = conversion rate within the touched cohort ÷ overall baseline. Anything &gt; +25% is a real
        growth lever — invest there. Anything &lt; −25% likely signals selection bias (e.g. guests who never
        engage are unreachable). Site-page views require the guest to have a linked account, so the
        denominator there is smaller than tasting/welcome cohorts.
      </p>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-2 border-foreground p-3" style={{ borderRadius: 0 }}>
      <div className="text-[10px] uppercase tracking-brand text-muted-foreground font-bold">{label}</div>
      <div className="text-xl font-bold tabular-nums text-foreground mt-1">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-2 border-foreground p-3" style={{ borderRadius: 0 }}>
      <div className="text-[11px] uppercase tracking-brand font-bold text-foreground mb-2">{title}</div>
      {children}
    </div>
  );
}

function buildReadout(d: ReturnType<typeof identity>): string {
  const parts: string[] = [];
  parts.push(
    `${fmtPct(d.conversionRate)} of guests eventually join — ${d.converters.toLocaleString()} converters vs ${d.guestOnly.toLocaleString()} guest-only.`,
  );
  if (d.medianGuestOrders != null) {
    parts.push(
      `Typical converter places ${d.medianGuestOrders} guest order${d.medianGuestOrders === 1 ? "" : "s"} (${fmtUsd(d.medianGuestSpendCents)}) before joining, median ${d.medianDaysToConvert ?? "—"}d to convert.`,
    );
  }
  const topChannel = d.channelMix[0];
  if (topChannel) {
    const share = topChannel.count / d.converters;
    parts.push(
      `Strongest gateway channel: ${topChannel.channel} (${fmtPct(share)} of converters). ${topChannel.channel === "EVENT" || topChannel.channel === "POS" ? "Tasting room + events are the highest-intent funnel — double down on event capture." : "Online discovery is doing the heavy lifting — invest in welcome series + retargeting to the 1–2 order cohort."}`,
    );
  }
  const earlyBucket = d.daysBuckets[0];
  if (earlyBucket && d.converters > 0) {
    const earlyShare = earlyBucket.count / d.converters;
    if (earlyShare > 0.4) {
      parts.push(
        `${fmtPct(earlyShare)} convert within a week — your first-order experience is the biggest growth lever; protect it.`,
      );
    } else if (earlyShare < 0.1) {
      parts.push(
        `Only ${fmtPct(earlyShare)} convert within a week — there's a nurture-flow opportunity in the 8–90d window.`,
      );
    }
  }
  return parts.join(" ");
}

// type helper so buildReadout has a real type
function identity(): import("@/lib/wineClubMembers").ConversionPathways {
  return null as unknown as import("@/lib/wineClubMembers").ConversionPathways;
}