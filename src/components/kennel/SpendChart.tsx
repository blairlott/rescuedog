import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";

export interface SpendDatum {
  date: string;
  [channelName: string]: string | number;
}

const COLORS = ["#c30017", "#1A1A1A", "#6B6B6B", "#a36b00"];

export function SpendChart({ data, channels }: { data: SpendDatum[]; channels: string[] }) {
  if (data.length === 0) {
    return <div className="border border-border p-8 text-center text-sm text-muted-foreground bg-card" style={{ borderRadius: 0 }}>No spend history yet.</div>;
  }
  return (
    <div className="border border-border bg-card p-4" style={{ borderRadius: 0 }}>
      <div className="text-xs uppercase tracking-brand font-semibold text-foreground mb-3">Daily spend by channel</div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={(v: number) => `$${Number(v).toFixed(0)}`} contentStyle={{ borderRadius: 0, border: "1px solid #ccc" }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {channels.map((c, i) => (
              <Line key={c} type="monotone" dataKey={c} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}