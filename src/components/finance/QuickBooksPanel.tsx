import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, ExternalLink, RefreshCcw, Unplug } from "lucide-react";
import { toast } from "sonner";

export function QuickBooksPanel({ days }: { days: number }) {
  const [connecting, setConnecting] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [report, setReport] = useState<any>(null);

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
          <Button size="sm" variant="outline" onClick={pullPnL} disabled={loadingReport} className="gap-2">
            {loadingReport ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Pull P&amp;L (last {days} days)
          </Button>
          {report && (
            <span className="text-xs text-muted-foreground">
              {report.start_date} → {report.end_date}
            </span>
          )}
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