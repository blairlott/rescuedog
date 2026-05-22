import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export type Agg = "sum" | "avg" | "count" | "min" | "max";
export interface PivotConfig {
  rowField: string | null;
  colField: string | null;
  valueField: string | null;
  agg: Agg;
}

export interface PivotBuilderProps {
  rows: Record<string, any>[];
  columns: { name: string; type: "number" | "date" | "string" }[];
  config: PivotConfig;
  onChange: (c: PivotConfig) => void;
}

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

export function pivotData(rows: Record<string, any>[], cfg: PivotConfig) {
  const rowKeys = new Set<string>();
  const colKeys = new Set<string>();
  const bucket: Record<string, Record<string, number[]>> = {};
  for (const r of rows) {
    const rk = cfg.rowField ? String(r[cfg.rowField] ?? "(blank)") : "Total";
    const ck = cfg.colField ? String(r[cfg.colField] ?? "(blank)") : "Value";
    rowKeys.add(rk); colKeys.add(ck);
    bucket[rk] = bucket[rk] || {};
    bucket[rk][ck] = bucket[rk][ck] || [];
    if (cfg.agg === "count") bucket[rk][ck].push(1);
    else {
      const v = cfg.valueField ? Number(r[cfg.valueField]) : 1;
      if (!isNaN(v)) bucket[rk][ck].push(v);
    }
  }
  const rowList = Array.from(rowKeys).sort();
  const colList = Array.from(colKeys).sort();
  const matrix = rowList.map((rk) => ({
    row: rk,
    cells: colList.map((ck) => aggregate(bucket[rk]?.[ck] ?? [], cfg.agg)),
    total: aggregate(Object.values(bucket[rk] ?? {}).flat(), cfg.agg),
  }));
  return { rowList, colList, matrix };
}

export function PivotBuilder({ rows, columns, config, onChange }: PivotBuilderProps) {
  const numericFields = columns.filter((c) => c.type === "number").map((c) => c.name);
  const allFields = columns.map((c) => c.name);
  const { rowList, colList, matrix } = useMemo(() => pivotData(rows, config), [rows, config]);

  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-muted/30 border border-border">
        <div>
          <Label className="text-xs uppercase tracking-brand">Rows</Label>
          <Select value={config.rowField ?? NONE} onValueChange={(v) => onChange({ ...config, rowField: v === NONE ? null : v })}>
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None (total)</SelectItem>
              {allFields.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-brand">Columns</Label>
          <Select value={config.colField ?? NONE} onValueChange={(v) => onChange({ ...config, colField: v === NONE ? null : v })}>
            <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>None</SelectItem>
              {allFields.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-brand">Value</Label>
          <Select value={config.valueField ?? NONE} onValueChange={(v) => onChange({ ...config, valueField: v === NONE ? null : v })}>
            <SelectTrigger><SelectValue placeholder="Count rows" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Count rows</SelectItem>
              {numericFields.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
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

      <div className="overflow-auto border border-border max-h-[420px]">
        <table className="w-full text-sm">
          <thead className="bg-muted sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">{config.rowField ?? ""}</th>
              {colList.map((c) => <th key={c} className="text-right px-3 py-2 font-semibold">{c}</th>)}
              {colList.length > 1 && <th className="text-right px-3 py-2 font-semibold">Total</th>}
            </tr>
          </thead>
          <tbody>
            {matrix.map((r) => (
              <tr key={r.row} className="border-t border-border">
                <td className="px-3 py-1.5">{r.row}</td>
                {r.cells.map((v, i) => <td key={i} className="text-right px-3 py-1.5 tabular-nums">{fmt(v)}</td>)}
                {colList.length > 1 && <td className="text-right px-3 py-1.5 tabular-nums font-semibold">{fmt(r.total)}</td>}
              </tr>
            ))}
            {!matrix.length && (
              <tr><td colSpan={colList.length + 2} className="px-3 py-6 text-center text-muted-foreground">No data</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}