import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle } from "lucide-react";

type Row = {
  state: string;
  at_risk_customers: number;
  at_risk_lifetime_value: number;
  avg_lifetime_value: number;
  repeat_buyers_at_risk: number;
};

export function RetentionRiskPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["kennel-retention-risk"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kennel_retention_risk_summary" as any)
        .select("*")
        .limit(15);
      if (error) throw error;
      return ((data as any) ?? []) as Row[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const totals = (data ?? []).reduce(
    (acc, r) => ({
      customers: acc.customers + Number(r.at_risk_customers),
      value: acc.value + Number(r.at_risk_lifetime_value),
      repeat: acc.repeat + Number(r.repeat_buyers_at_risk),
    }),
    { customers: 0, value: 0, repeat: 0 }
  );

  return (
    <div className="border-2 border-foreground p-4" style={{ borderRadius: 0 }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-xs uppercase tracking-brand font-bold flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-yellow-600" />
            Retention Risk (60–90 day winback)
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Customers whose last consumer order was 60–90 days ago — the sweet spot for winback retargeting.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="border border-border p-2" style={{ borderRadius: 0 }}>
          <div className="text-[10px] uppercase text-muted-foreground font-bold">At-risk customers</div>
          <div className="text-xl font-bold tabular-nums">{totals.customers.toLocaleString()}</div>
        </div>
        <div className="border border-border p-2" style={{ borderRadius: 0 }}>
          <div className="text-[10px] uppercase text-muted-foreground font-bold">Lifetime value at risk</div>
          <div className="text-xl font-bold tabular-nums">${Math.round(totals.value).toLocaleString()}</div>
        </div>
        <div className="border border-border p-2" style={{ borderRadius: 0 }}>
          <div className="text-[10px] uppercase text-muted-foreground font-bold">Repeat buyers at risk</div>
          <div className="text-xl font-bold tabular-nums text-red-600">{totals.repeat.toLocaleString()}</div>
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-xs text-muted-foreground">No customers currently in the 60–90 day window.</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-brand text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-1.5 text-left">State</th>
              <th className="py-1.5 text-right">At-risk</th>
              <th className="py-1.5 text-right">Repeat buyers</th>
              <th className="py-1.5 text-right">Avg LTV</th>
              <th className="py-1.5 text-right">Total LTV</th>
            </tr>
          </thead>
          <tbody>
            {data.map(r => (
              <tr key={r.state} className="border-b border-border last:border-0">
                <td className="py-1.5 font-bold">{r.state}</td>
                <td className="py-1.5 text-right tabular-nums">{Number(r.at_risk_customers).toLocaleString()}</td>
                <td className="py-1.5 text-right tabular-nums text-red-600 font-bold">{Number(r.repeat_buyers_at_risk).toLocaleString()}</td>
                <td className="py-1.5 text-right tabular-nums">${Math.round(Number(r.avg_lifetime_value)).toLocaleString()}</td>
                <td className="py-1.5 text-right tabular-nums font-bold">${Math.round(Number(r.at_risk_lifetime_value)).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
        Use these emails as a Meta Custom Audience seed and a Mailchimp winback segment. Median time-to-2nd-order is 77 days — this is the conversion sweet spot.
      </p>
    </div>
  );
}