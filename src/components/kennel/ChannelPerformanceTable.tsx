import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FreshnessIndicator } from "./FreshnessIndicator";
import { ChevronRight } from "lucide-react";

export interface ChannelRow {
  channel_id: string;
  name: string;
  platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  roas: number;
  cpa: number;
  last_primary_sync: string | null;
}

const fmtCurrency = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmtInt = (n: number) => n.toLocaleString();

export function ChannelPerformanceTable({ rows, onRowClick }: { rows: ChannelRow[]; onRowClick?: (r: ChannelRow) => void }) {
  if (rows.length === 0) {
    return <div className="border border-border p-8 text-center text-sm text-muted-foreground bg-card" style={{ borderRadius: 0 }}>No channel data yet.</div>;
  }
  return (
    <div className="border border-border bg-card" style={{ borderRadius: 0 }}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Channel</TableHead>
            <TableHead className="text-right">Spend</TableHead>
            <TableHead className="text-right">Impressions</TableHead>
            <TableHead className="text-right">Clicks</TableHead>
            <TableHead className="text-right">Conv.</TableHead>
            <TableHead className="text-right">ROAS</TableHead>
            <TableHead className="text-right">CPA</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow
              key={r.channel_id}
              className={onRowClick ? "cursor-pointer hover:bg-muted/50" : undefined}
              onClick={() => onRowClick?.(r)}
            >
              <TableCell className="font-medium">
                <span className="inline-flex items-center gap-1">
                  {r.name}
                  {onRowClick && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{fmtCurrency(r.spend)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtInt(r.impressions)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtInt(r.clicks)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtInt(r.conversions)}</TableCell>
              <TableCell className="text-right tabular-nums font-semibold">{r.roas.toFixed(2)}x</TableCell>
              <TableCell className="text-right tabular-nums">{fmtCurrency(r.cpa)}</TableCell>
              <TableCell><FreshnessIndicator lastSync={r.last_primary_sync} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
