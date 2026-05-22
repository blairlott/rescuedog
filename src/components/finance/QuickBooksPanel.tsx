import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, ExternalLink, RefreshCcw, Unplug, Download } from "lucide-react";
import { toast } from "sonner";

export function QuickBooksPanel({ days }: { days: number }) {
  const [connecting, setConnecting] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [historicalBusy, setHistoricalBusy] = useState(false);
  const [historicalProgress, setHistoricalProgress] = useState<string>("");
  const today = new Date().toISOString().slice(0, 10);
  const [customStart, setCustomStart] = useState<string>("2017-01-01");
  const [customEnd, setCustomEnd] = useState<string>(today);
  const [report, setReport] = useState<any>(null);
  const qc = useQueryClient();

  const { data: conn, refetch } = useQuery({
    queryKey: ["qbo-connection"],
    queryFn: async () => {
      const { data } = await supabase.from("qbo_connections").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  const connect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("qbo-auth-start", { method: "POST" });
      if (error) throw error;
      if (data?.authorize_url) window.location.href = data.authorize_url;
    } catch (e: any) {
      toast.error("Connect failed", { description: String(e?.message ?? e) });
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!conn) return;
    if (!confirm("Disconnect QuickBooks? You'll need to re-authorize to pull reports again.")) return;
    const { error } = await supabase.from("qbo_connections").delete().eq("id", conn.id);
    if (error) {
      toast.error("Disconnect failed", { description: error.message });
      return;
    }
    toast.success("QuickBooks disconnected");
    refetch();
  };

  const pullPnL = async () => {
    setLoadingReport(true);
    setReport(null);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - days * 86400000);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const { data, error } = await supabase.functions.invoke("qbo-reports", {
        body: { report: "ProfitAndLoss", start_date: fmt(start), end_date: fmt(end) },
      });
      if (error) throw error;
      setReport(data);
      toast.success("P&L pulled from QuickBooks");
    } catch (e: any) {
      toast.error("Report failed", { description: String(e?.message ?? e) });
    } finally {
      setLoadingReport(false);
    }
  };

  const importToFinance = async () => {
    setImporting(true);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - days * 86400000);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const { data, error } = await supabase.functions.invoke("qbo-import-pnl", {
        body: { start_date: fmt(start), end_date: fmt(end) },
      });
      if (error) throw error;
      toast.success(`Imported ${data?.imported ?? 0} entries`, {
        description: `Range ${fmt(start)} → ${fmt(end)}. Tiles will refresh.`,
      });
      refreshTiles();
    } catch (e: any) {
      toast.error("Import failed", { description: String(e?.message ?? e) });
    } finally {
      setImporting(false);
    }
  };

  const pullAndImport = async () => {
    await pullPnL();
    await importToFinance();
  };
  const syncing = loadingReport || importing;

  const refreshTiles = () => {
    qc.invalidateQueries({ queryKey: ["finance_pnl_summary"] });
    qc.invalidateQueries({ queryKey: ["finance_revenue_by_channel"] });
    qc.invalidateQueries({ queryKey: ["finance_spend_by_platform"] });
    qc.invalidateQueries({ queryKey: ["finance_cash_trend"] });
    qc.invalidateQueries({ queryKey: ["finance_top_vendors"] });
    qc.invalidateQueries({ queryKey: ["finance_cc_roas"] });
  };

  // Imports a range in 1-year chunks to avoid QBO timeouts on long spans.
  const importRange = async (startDate: string, endDate: string) => {
    setHistoricalBusy(true);
    setHistoricalProgress("");
    let totalImported = 0;
    try {
      const startY = Number(startDate.slice(0, 4));
      const endY = Number(endDate.slice(0, 4));
      if (!isFinite(startY) || !isFinite(endY) || startY > endY) {
        throw new Error("Invalid date range");
      }
      for (let y = startY; y <= endY; y++) {
        const chunkStart = y === startY ? startDate : `${y}-01-01`;
        const chunkEnd = y === endY ? endDate : `${y}-12-31`;
        setHistoricalProgress(`Pulling ${chunkStart} → ${chunkEnd}...`);
        const { data, error } = await supabase.functions.invoke("qbo-import-pnl", {
          body: { start_date: chunkStart, end_date: chunkEnd },
        });
        if (error) throw new Error(error.message);
        if ((data as any)?.error) throw new Error((data as any).error);
        totalImported += (data as any)?.imported ?? 0;
      }
      toast.success(`Imported ${totalImported} entries`, {
        description: `Range ${startDate} → ${endDate}.`,
      });
      refreshTiles();
    } catch (e: any) {
      toast.error("Historical import failed", { description: String(e?.message ?? e) });
    } finally {
      setHistoricalBusy(false);
      setHistoricalProgress("");
    }
  };

  return (
    <section className="border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold">QuickBooks Online</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live read-only connection to your QuickBooks company for P&amp;L, Balance Sheet, and Cash Flow reports.
          </p>
        </div>
        {conn ? (
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="font-semibold">{conn.company_name ?? conn.realm_id}</span>
            <Button size="sm" variant="outline" onClick={() => refetch()} className="h-7"><RefreshCcw className="h-3 w-3" /></Button>
            <Button size="sm" variant="outline" onClick={connect} disabled={connecting} className="h-7 gap-1">
              {connecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
              Reconnect
            </Button>
            <Button size="sm" variant="outline" onClick={disconnect} className="h-7 gap-1">
              <Unplug className="h-3 w-3" />
              Disconnect
            </Button>
          </div>
        ) : (
          <Button onClick={connect} disabled={connecting} size="sm" className="gap-2">
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            Connect QuickBooks
          </Button>
        )}
      </div>

      {conn && (
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <Button size="sm" onClick={pullAndImport} disabled={syncing} className="gap-2">
            {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            {loadingReport ? `Pulling P&L…` : importing ? `Importing…` : `Pull & Import P&L (last ${days} days)`}
          </Button>
          <Button size="sm" variant="outline" onClick={pullPnL} disabled={syncing} className="gap-2">
            {loadingReport ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Pull only
          </Button>
          {report && (
            <span className="text-xs text-muted-foreground">
              {report.start_date} → {report.end_date}
            </span>
          )}
        </div>
      )}

      {conn && (
        <div className="pt-3 border-t border-border space-y-2">
          <div className="text-[10px] uppercase tracking-brand font-semibold text-muted-foreground">Historical import</div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-[10px] uppercase tracking-brand">Start date</Label>
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-8 w-40 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-brand">End date</Label>
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-8 w-40 text-xs" />
            </div>
            <Button
              size="sm"
              onClick={() => importRange(customStart, customEnd)}
              disabled={historicalBusy || !customStart || !customEnd}
              className="gap-2"
            >
              {historicalBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Import custom range
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => importRange("2017-01-01", today)}
              disabled={historicalBusy}
              className="gap-2"
            >
              {historicalBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Full history (2017 → today)
            </Button>
            {historicalProgress && (
              <span className="text-xs text-muted-foreground">{historicalProgress}</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Long ranges are pulled in 1-year chunks. Re-runs are idempotent (upserts by QBO account + month).
          </p>
        </div>
      )}

      {report?.data?.Header && (
        <div className="mt-3 border border-border bg-background p-3 text-xs font-mono overflow-auto max-h-96">
          <div className="font-bold mb-2">{report.data.Header?.ReportName} — {report.data.Header?.StartPeriod} to {report.data.Header?.EndPeriod}</div>
          <pre className="whitespace-pre-wrap">{JSON.stringify(report.data.Rows, null, 2)}</pre>
        </div>
      )}
    </section>
  );
}