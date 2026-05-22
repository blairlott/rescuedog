import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";
import type { Agg } from "./PivotBuilder";

export type ChartType = "bar" | "line" | "area" | "pie" | "stacked";

export interface ChartConfig {
  type: ChartType;
  xField: string | null;
  yField: string | null;
  groupField: string | null;
  agg: Agg;
}

export interface ChartBuilderProps {
  rows: Record<string, any>[];
  columns: { name: string; type: "number" | "date" | "string" }[];
  config: ChartConfig;
  onChange: (c: ChartConfig) => void;
}

const COLORS = ["#c30017", "#1f2937", "#6b7280", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];
const NONE = "__none__";

function aggregate(vals: number[], agg: Agg): number {
  if (!vals.length) return 0;
  switch (agg) {
    case "sum": return vals.reduce((a, b) => a + b, 0);
    case "avg": return vals.reduce((a, b) => a + b, 0) / vals.length;
    case "count": return vals.length;
    case "min": return Math.min(...vals);
    case "max": return Math.max(...vals);
  }
}

function buildSeries(rows: Record<string, any>[], cfg: ChartConfig) {
  if (!cfg.xField) return { data: [], series: [] as string[] };
  const xs = new Set<string>();
  const groups = new Set<string>();
  const bucket: Record<string, Record<string, number[]>> = {};
  for (const r of rows) {
    const x = String(r[cfg.xField] ?? "(blank)");
    const g = cfg.groupField ? String(r[cfg.groupField] ?? "(blank)") : "value";
    xs.add(x); groups.add(g);
    bucket[x] = bucket[x] || {};
    bucket[x][g] = bucket[x][g] || [];
    if (cfg.agg === "count") bucket[x][g].push(1);
    else {
      const v = cfg.yField ? Number(r[cfg.yField]) : 1;
      if (!isNaN(v)) bucket[x][g].push(v);
    }
  }
  const series = Array.from(groups);
  const data = Array.from(xs).sort().map((x) => {
    const obj: any = { x };
    series.forEach((s) => { obj[s] = aggregate(bucket[x]?.[s] ?? [], cfg.agg); });
    return obj;
  });
  return { data, series };
}

export function ChartBuilder({ rows, columns, config, onChange }: ChartBuilderProps) {
  const allFields = columns.map((c) => c.name);
  const numericFields = columns.filter((c) => c.type === "number").map((c) => c.name);
  const { data, series } = useMemo(() => buildSeries(rows, config), [rows, config]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-3 bg-muted/30 border border-border">
        <div>
          <Label className="text-xs uppercase tracking-brand">Chart type</Label>
          <Select value={config.type} onValueChange={(v) => onChange({ ...config, type: v as ChartType })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bar">Bar</SelectItem>
              <SelectItem value="stacked">Stacked bar</SelectItem>
              <SelectItem value="line">Line</SelectItem>
              <SelectItem value="area">Area</SelectItem>
              <SelectItem value="pie">Pie</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-brand">X axis</Label>
          <Select value={config.xField ?? NONE} onValueChange={(v) => onChange({ ...config, xField: v === NONE ? null : v })}>
            <SelectTrigger><SelectValue placeholder="Pick field" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {allFields.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-brand">Y value</Label>
          <Select value={config.yField ?? NONE} onValueChange={(v) => onChange({ ...config, yField: v === NONE ? null : v })}>
            <SelectTrigger><SelectValue placeholder="Count" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Count rows</SelectItem>
              {numericFields.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-brand">Group by</Label>
          <Select value={config.groupField ?? NONE} onValueChange={(v) => onChange({ ...config, groupField: v === NONE ? null : v })}>
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {allFields.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-brand">Aggregation</Label>
          <Select value={config.agg} onValueChange={(v) => onChange({ ...config, agg: v as Agg })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sum">Sum</SelectItem>
              <SelectItem value="avg">Average</SelectItem>
              <SelectItem value="count">Count</SelectItem>
              <SelectItem value="min">Min</SelectItem>
              <SelectItem value="max">Max</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="h-[360px] border border-border p-3">
        {!config.xField ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">Pick an X axis field</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {config.type === "pie" ? (
              <PieChart>
                <Pie data={data} dataKey={series[0] ?? "value"} nameKey="x" outerRadius={120} label>
                  {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            ) : config.type === "line" ? (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="x" /><YAxis /><Tooltip /><Legend />
                {series.map((s, i) => <Line key={s} type="monotone" dataKey={s} stroke={COLORS[i % COLORS.length]} />)}
              </LineChart>
            ) : config.type === "area" ? (
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="x" /><YAxis /><Tooltip /><Legend />
                {series.map((s, i) => <Area key={s} type="monotone" dataKey={s} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.3} />)}
              </AreaChart>
            ) : (
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="x" /><YAxis /><Tooltip /><Legend />
                {series.map((s, i) => (
                  <Bar key={s} dataKey={s} fill={COLORS[i % COLORS.length]}
                       stackId={config.type === "stacked" ? "a" : undefined} />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}