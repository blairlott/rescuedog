import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";

type Row = {
  site_variant: string;
  sessions: number;
  pageviews: number;
  add_to_carts: number;
  checkout_intents: number;
};

const WINDOWS: { label: string; days: number }[] = [
  { label: "24h", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
];

function pct(num: number, den: number): string {
  if (!den) return "—";
  return ((num / den) * 100).toFixed(2) + "%";
}

function lift(a: number, b: number): string {
  if (!b) return "—";
  const l = ((a - b) / b) * 100;
  const s = l > 0 ? "+" : "";
  return s + l.toFixed(1) + "%";
}

/**
 * Per-session rate that gracefully handles the (common, early-rollout)
 * case where historical conversions outnumber tracked sessions because
 * one logger went live before the other. Returns null when meaningless.
 */
function safeRate(numerator: number, sessions: number): number | null {
  if (!sessions) return null;
  if (numerator > sessions) return null; // data not yet attributable 1:1
  return numerator / sessions;
}

function fmtRate(r: number | null): string {
  if (r === null) return "n/a";
  return (r * 100).toFixed(2) + "%";
}

function liftRate(a: number | null, b: number | null): string {
  if (a === null || b === null) return "—";
  return lift(a, b);
}

export default function AdminAbResultsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/admin");
        return;
      }
      setAuthed(true);
    })();
  }, [navigate]);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
    const { data, error } = await supabase.rpc("ab_results_summary", { _since: since });
    if (error) {
      console.error(error);
      setRows([]);
    } else {
      setRows((data as Row[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (authed) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, days]);

  if (!authed) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-sm text-muted-foreground">
        Checking access…
      </div>
    );
  }

  const lovable = rows?.find((r) => r.site_variant === "lovable");
  const legacy = rows?.find((r) => r.site_variant === "legacy");

  const lvSess = lovable?.sessions ?? 0;
  const lgSess = legacy?.sessions ?? 0;
  const totalSess = lvSess + lgSess;
  const lvSplit = totalSess ? (lvSess / totalSess) * 100 : 0;
  const lgSplit = totalSess ? (lgSess / totalSess) * 100 : 0;

  const Metric = ({
    label,
    lv,
    lg,
    fmt = (n: number) => n.toLocaleString(),
    deltaFmt,
  }: {
    label: string;
    lv: number;
    lg: number;
    fmt?: (n: number) => string;
    deltaFmt?: string;
  }) => (
    <tr className="border-b border-border">
      <td className="py-3 text-sm text-muted-foreground">{label}</td>
      <td className="py-3 text-right font-mono text-sm">{fmt(lv)}</td>
      <td className="py-3 text-right font-mono text-sm">{fmt(lg)}</td>
      <td className="py-3 text-right font-mono text-sm">
        <span className={deltaFmt?.startsWith("+") ? "text-primary font-bold" : deltaFmt?.startsWith("-") ? "text-destructive font-bold" : ""}>
          {deltaFmt ?? lift(lv, lg)}
        </span>
      </td>
    </tr>
  );

  return (
    <div className="min-h-dvh bg-secondary">
      <div className="border-b border-border bg-background">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="font-bold text-foreground uppercase tracking-brand text-sm">
              A/B Results — WP Legacy vs Lovable
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {WINDOWS.map((w) => (
              <Button
                key={w.days}
                size="sm"
                variant={days === w.days ? "default" : "outline"}
                onClick={() => setDays(w.days)}
                className="h-8 text-xs uppercase tracking-brand"
              >
                {w.label}
              </Button>
            ))}
            <Button size="sm" variant="outline" onClick={load} disabled={loading} className="h-8">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            </Button>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {loading || !rows ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="bg-background border border-border p-6">
            <div className="mb-6 pb-6 border-b border-border">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-brand font-bold text-muted-foreground">
                  Observed traffic split ({WINDOWS.find((w) => w.days === days)?.label})
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Total sessions: <span className="font-mono font-bold text-foreground">{totalSess.toLocaleString()}</span>
                </p>
              </div>
              {totalSess === 0 ? (
                <p className="text-xs text-muted-foreground">No sessions in this window yet.</p>
              ) : (
                <>
                  <div className="h-8 w-full flex border border-border overflow-hidden">
                    <div
                      className="bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground"
                      style={{ width: `${lvSplit}%` }}
                    >
                      {lvSplit >= 8 ? `${lvSplit.toFixed(1)}%` : ""}
                    </div>
                    <div
                      className="bg-foreground flex items-center justify-center text-[10px] font-bold text-background"
                      style={{ width: `${lgSplit}%` }}
                    >
                      {lgSplit >= 8 ? `${lgSplit.toFixed(1)}%` : ""}
                    </div>
                  </div>
                  <div className="flex justify-between text-[10px] mt-2 uppercase tracking-brand">
                    <span className="text-primary font-bold">Lovable {lvSplit.toFixed(1)}%</span>
                    <span className="text-muted-foreground font-bold">Legacy {lgSplit.toFixed(1)}%</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2 leading-tight">
                    Sanity check: this should roughly match the <code>WEIGHT_LOVABLE</code> value in the
                    WordPress snippet (e.g. 0.20 → ~20% Lovable). Sticky cookies and direct hits to
                    rescuedog.lovable.app will skew Lovable slightly higher than the configured weight.
                  </p>
                </>
              )}
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-foreground">
                  <th className="py-3 text-left text-[10px] uppercase tracking-brand text-muted-foreground font-bold">Metric</th>
                  <th className="py-3 text-right text-[10px] uppercase tracking-brand text-primary font-bold">Lovable</th>
                  <th className="py-3 text-right text-[10px] uppercase tracking-brand text-muted-foreground font-bold">Legacy (WP)</th>
                  <th className="py-3 text-right text-[10px] uppercase tracking-brand text-muted-foreground font-bold">Lift</th>
                </tr>
              </thead>
              <tbody>
                <Metric label="Sessions" lv={lovable?.sessions ?? 0} lg={legacy?.sessions ?? 0} />
                <Metric label="Pageviews" lv={lovable?.pageviews ?? 0} lg={legacy?.pageviews ?? 0} />
                <Metric label="Add to cart" lv={lovable?.add_to_carts ?? 0} lg={legacy?.add_to_carts ?? 0} />
                <Metric label="Checkout intents" lv={lovable?.checkout_intents ?? 0} lg={legacy?.checkout_intents ?? 0} />
                {(() => {
                  const lvAtc = safeRate(lovable?.add_to_carts ?? 0, lovable?.sessions ?? 0);
                  const lgAtc = safeRate(legacy?.add_to_carts ?? 0, legacy?.sessions ?? 0);
                  const lvCo = safeRate(lovable?.checkout_intents ?? 0, lovable?.sessions ?? 0);
                  const lgCo = safeRate(legacy?.checkout_intents ?? 0, legacy?.sessions ?? 0);
                  return (
                    <>
                      <Metric
                        label="ATC rate (per session)"
                        lv={lvAtc ?? 0}
                        lg={lgAtc ?? 0}
                        fmt={() => fmtRate(lvAtc)}
                        deltaFmt={liftRate(lvAtc, lgAtc)}
                      />
                      <Metric
                        label="Checkout rate (per session)"
                        lv={lvCo ?? 0}
                        lg={lgCo ?? 0}
                        fmt={() => fmtRate(lvCo)}
                        deltaFmt={liftRate(lvCo, lgCo)}
                      />
                    </>
                  );
                })()}
              </tbody>
            </table>

            <div className="mt-6 text-xs text-muted-foreground space-y-2 border-t border-border pt-4">
              <p>
                <strong className="text-foreground">Legacy data:</strong> the WordPress site must
                also log to <code>ab_events</code> / <code>ab_checkout_intents</code> for the legacy
                column to populate. Until then, only the Lovable arm will have numbers — that's
                expected pre-launch.
              </p>
              <p>
                <strong className="text-foreground">Checkout intent</strong> = visitor clicked
                "Checkout" and we recorded the handoff to Vinoshipper. Completed{" "}
                <em>purchases</em> are logged separately by the Vinoshipper webhook with full
                revenue — we'll add a revenue row once data starts flowing.
              </p>
              <p>
                <strong className="text-foreground">Significance:</strong> with fewer than ~200
                conversions per arm, lift numbers are noisy. Wait for 2+ weeks before acting.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}