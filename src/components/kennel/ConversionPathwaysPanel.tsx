import { useQuery } from "@tanstack/react-query";
import { fetchConversionPathways } from "@/lib/wineClubMembers";
import { Sparkles } from "lucide-react";

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
                <p className="text-muted-foreground">
                  Next signal to add: tie pre-join behavior to <code className="font-mono">site_intel_events</code>{" "}
                  + welcome email step at time of join (requires linking <code className="font-mono">profiles.email</code>{" "}
                  → VS email). That unlocks "what triggered the join" attribution.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
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