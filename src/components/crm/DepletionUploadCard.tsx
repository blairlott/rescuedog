import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type Report = {
  id: string;
  filename: string;
  distributor: string | null;
  period_label: string | null;
  status: string;
  total_lines: number;
  matched_lines: number;
  new_account_lines: number;
  unmatched_lines: number;
  auto_published_count: number;
  ai_summary: string | null;
  created_at: string;
};

export function DepletionUploadCard() {
  const [file, setFile] = useState<File | null>(null);
  const [distributor, setDistributor] = useState("");
  const [period, setPeriod] = useState("");
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("depletion_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);
    setReports((data as Report[]) ?? []);
  };
  useEffect(() => { load(); }, []);

  const handleUpload = async () => {
    if (!file) { toast.error("Choose a CSV, TSV, or text file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("File must be under 5MB"); return; }
    setBusy(true);
    try {
      const raw_text = await file.text();
      const { data, error } = await supabase.functions.invoke("parse-depletion-report", {
        body: { filename: file.name, raw_text, distributor: distributor || undefined, period_label: period || undefined },
      });
      if (error) throw error;
      toast.success(`Parsed ${data.total} rows — ${data.created} new accounts, ${data.auto_published} on the map.`);
      setFile(null); setDistributor(""); setPeriod("");
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border bg-background p-6 space-y-5">
      <div>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" /> Depletion Report Uploader
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a distributor depletion report (CSV, TSV, or pasted text). AI parses retailer/restaurant lines, matches existing CRM accounts, creates new ones, and auto-publishes high-confidence locations to the public store locator.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div>
          <Label htmlFor="dep-file">File</Label>
          <Input id="dep-file" type="file" accept=".csv,.tsv,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div>
          <Label htmlFor="dep-dist">Distributor (optional)</Label>
          <Input id="dep-dist" value={distributor} onChange={(e) => setDistributor(e.target.value)} placeholder="e.g. Empire" />
        </div>
        <div>
          <Label htmlFor="dep-period">Period (optional)</Label>
          <Input id="dep-period" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="e.g. Apr 2026" />
        </div>
      </div>

      <Button onClick={handleUpload} disabled={busy || !file} className="gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {busy ? "Parsing with AI..." : "Upload & Parse"}
      </Button>

      <div className="pt-4 border-t border-border">
        <h3 className="text-sm font-bold uppercase tracking-brand mb-3">Recent uploads</h3>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reports uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <div key={r.id} className="border border-border p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{r.filename}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.distributor ? `${r.distributor} · ` : ""}{r.period_label ? `${r.period_label} · ` : ""}
                      {new Date(r.created_at).toLocaleString()}
                    </div>
                  </div>
                  <Badge className={r.status === "complete" ? "bg-green-100 text-green-800" : r.status === "error" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}>
                    {r.status === "complete" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <AlertCircle className="h-3 w-3 mr-1" />}
                    {r.status}
                  </Badge>
                </div>
                {r.status === "complete" && (
                  <div className="flex flex-wrap gap-3 mt-2 text-xs">
                    <span><strong>{r.total_lines}</strong> rows</span>
                    <span className="text-muted-foreground">·</span>
                    <span><strong>{r.matched_lines}</strong> matched</span>
                    <span className="text-muted-foreground">·</span>
                    <span><strong>{r.new_account_lines}</strong> new accounts</span>
                    <span className="text-muted-foreground">·</span>
                    <span><strong>{r.auto_published_count}</strong> on map</span>
                    <span className="text-muted-foreground">·</span>
                    <span><strong>{r.unmatched_lines}</strong> unmatched</span>
                  </div>
                )}
                {r.ai_summary && <p className="text-xs text-muted-foreground mt-2 italic">{r.ai_summary}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}