import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, History, Database, Copy, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx";
import { Seo } from "@/components/Seo";

const SHARP = { borderRadius: 0 } as const;
const PROJECT_REF = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const FINANCE_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/kennel-ingest-finance`;
const DTC_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/kennel-ingest-dtc-history`;

const CSV_FIELDS = [
  "external_id (unique per order, e.g. vinoshipper order #)",
  "order_date (YYYY-MM-DD)",
  "customer_email",
  "ship_state",
  "ship_zip",
  "subtotal_cents",
  "shipping_cents",
  "tax_cents",
  "total_cents",
  "units",
  "sku",
  "source (default: vinoshipper_csv)",
];

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <Seo noindex title="Kennel Backfills" />
    <Button
      size="sm" variant="outline" style={SHARP}
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="uppercase tracking-brand text-[10px] h-7"
    >
      {copied ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
      {copied ? "Copied" : "Copy"}
    </Button>
    </>
  );
}

function normalizeKey(k: string): string {
  return k.trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

function toCents(v: any): number {
  if (v == null || v === "") return 0;
  const s = String(v).replace(/[$,]/g, "").trim();
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  // If it looks like dollars (has a decimal or value < 1000), convert.
  return s.includes(".") || Math.abs(n) < 1000 ? Math.round(n * 100) : Math.round(n);
}

function normalizeDate(v: any): string | null {
  if (!v) return null;
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export default function KennelBackfillsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const preview = useMemo(() => parsed.slice(0, 5), [parsed]);

  const handleFile = async (f: File) => {
    setFile(f);
    setResult(null);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as any[];

      const rows = json
        .map((raw, idx) => {
          const row: any = {};
          for (const [k, v] of Object.entries(raw)) row[normalizeKey(k)] = v;
          const order_date = normalizeDate(row.order_date ?? row.date ?? row.created_at);
          const external_id =
            row.external_id ?? row.order_id ?? row.order_number ?? row.id ?? `csv-${idx + 1}-${order_date}`;
          return {
            external_id: String(external_id),
            order_date,
            source: row.source || "vinoshipper_csv",
            channel: row.channel || "dtc",
            customer_email: row.customer_email || row.email || null,
            ship_state: row.ship_state || row.state || null,
            ship_zip: row.ship_zip || row.zip || row.postal_code || null,
            subtotal_cents: toCents(row.subtotal_cents ?? row.subtotal),
            shipping_cents: toCents(row.shipping_cents ?? row.shipping),
            tax_cents: toCents(row.tax_cents ?? row.tax),
            total_cents: toCents(row.total_cents ?? row.total ?? row.amount),
            units: row.units ? Number(row.units) : row.qty ? Number(row.qty) : null,
            sku: row.sku || null,
            raw: raw,
          };
        })
        .filter((r) => r.order_date && r.external_id);

      setParsed(rows);
      toast.success(`Parsed ${rows.length} rows from ${f.name}`);
    } catch (e: any) {
      toast.error("Parse failed", { description: e?.message ?? String(e) });
    }
  };

  const upload = async () => {
    if (!parsed.length) return;
    setUploading(true);
    setResult(null);
    const CHUNK = 1000;
    let totalWritten = 0;
    let totalSkipped = 0;
    const errors: string[] = [];
    try {
      for (let i = 0; i < parsed.length; i += CHUNK) {
        const slice = parsed.slice(i, i + CHUNK);
        const { data, error } = await supabase.functions.invoke("kennel-ingest-dtc-history", {
          body: { rows: slice },
        });
        if (error) throw error;
        totalWritten += (data as any)?.written ?? 0;
        totalSkipped += (data as any)?.skipped ?? 0;
        if ((data as any)?.errors?.length) errors.push(...((data as any).errors as string[]));
      }
      setResult({ ok: errors.length === 0, written: totalWritten, skipped: totalSkipped, errors });
      toast.success(`Uploaded ${totalWritten} historical DTC orders`);
    } catch (e: any) {
      toast.error("Upload failed", { description: e?.message ?? String(e) });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Seo noindex title="Kennel Backfills" />
    <div className="space-y-6 p-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-bold uppercase tracking-brand text-foreground flex items-center gap-2">
          <History className="h-6 w-6 text-primary" /> Historical Backfills
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Loads historical QuickBooks and DTC data into the Kennel. Completely separate from the live Meta CAPI / OCI pipelines — these endpoints only write to history tables and never trigger ad-platform events.
        </p>
      </header>

      {/* QuickBooks via Lindy */}
      <Card className="p-5 border-2 border-foreground" style={SHARP}>
        <div className="flex items-center gap-2 mb-2">
          <Database className="h-4 w-4 text-primary" />
          <h2 className="text-sm uppercase tracking-brand font-bold">QuickBooks historical (Lindy)</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Point Lindy at this endpoint to backfill historical QuickBooks ledger entries. Idempotent on <code>external_id</code> — re-runs upsert, never duplicate.
        </p>

        <div className="space-y-3">
          <div>
            <Label className="text-[10px] uppercase tracking-brand">Endpoint</Label>
            <div className="flex gap-2 mt-1">
              <Input value={FINANCE_URL} readOnly className="font-mono text-xs" style={SHARP} />
              <CopyButton value={FINANCE_URL} />
            </div>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-brand">Headers</Label>
            <pre className="bg-muted/40 border border-border p-2 text-[11px] font-mono mt-1 overflow-x-auto" style={SHARP}>{`Content-Type: application/json
x-kennel-secret: <KENNEL_INGEST_SECRET>`}</pre>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-brand">Payload schema</Label>
            <pre className="bg-muted/40 border border-border p-2 text-[11px] font-mono mt-1 overflow-x-auto" style={SHARP}>{`{
  "rows": [
    {
      "external_id": "qb-txn-12345",          // REQUIRED, unique
      "date": "2023-08-14",                   // REQUIRED, YYYY-MM-DD
      "entry_type": "revenue",                // expense|revenue|cogs|refund|adjustment|transfer
      "category": "Wholesale Sales",          // REQUIRED
      "subcategory": "wholesale",
      "account_name": "Sales:Wholesale",
      "account_code": "4010",
      "vendor": "Distributor X",
      "memo": "Q3 invoice",
      "amount_cents": 425000,                 // REQUIRED, integer cents
      "currency": "USD",
      "sku": "RDW-CAB-2021",
      "units": 24,
      "state": "CA",
      "channel": "wholesale",                 // "dtc" | "wholesale" | "ecommerce"
      "source": "quickbooks"
    }
  ]
}`}</pre>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Lindy can chunk up to <strong>5,000 rows per POST</strong>. Same endpoint nightly ingest already uses — historical rows just have older dates.
          </p>
        </div>
      </Card>

      {/* DTC orders upload */}
      <Card className="p-5 border-2 border-foreground" style={SHARP}>
        <div className="flex items-center gap-2 mb-2">
          <Upload className="h-4 w-4 text-primary" />
          <h2 className="text-sm uppercase tracking-brand font-bold">DTC historical orders (CSV / XLSX)</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Upload a Vinoshipper or other DTC order export. Writes to a dedicated <code>dtc_historical_orders</code> table — does <strong>not</strong> touch the live <code>orders</code> table, Meta CAPI, or OCI. Idempotent on <code>external_id</code>.
        </p>

        <div className="space-y-3">
          <div>
            <Label className="text-[10px] uppercase tracking-brand">Expected columns (case-insensitive)</Label>
            <ul className="text-[11px] text-muted-foreground list-disc pl-5 mt-1">
              {CSV_FIELDS.map((f) => <li key={f}><code>{f}</code></li>)}
            </ul>
            <p className="text-[11px] text-muted-foreground mt-2">
              Dollar values (e.g. <code>49.99</code>) auto-convert to cents. Excel date serials are handled.
            </p>
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-brand">File</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                style={SHARP}
              />
              {file && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <FileSpreadsheet className="h-3 w-3" /> {file.name} · {parsed.length} rows
                </span>
              )}
            </div>
          </div>

          {preview.length > 0 && (
            <div className="border border-border overflow-x-auto" style={SHARP}>
              <table className="text-[11px] w-full">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left p-1">date</th>
                    <th className="text-left p-1">external_id</th>
                    <th className="text-left p-1">state</th>
                    <th className="text-right p-1">subtotal¢</th>
                    <th className="text-right p-1">total¢</th>
                    <th className="text-right p-1">units</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-1 font-mono">{r.order_date}</td>
                      <td className="p-1 font-mono">{r.external_id}</td>
                      <td className="p-1">{r.ship_state ?? "—"}</td>
                      <td className="p-1 text-right">{r.subtotal_cents}</td>
                      <td className="p-1 text-right">{r.total_cents}</td>
                      <td className="p-1 text-right">{r.units ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button onClick={upload} disabled={!parsed.length || uploading} style={SHARP}
              className="uppercase tracking-brand text-xs">
              <Upload className="h-3 w-3 mr-1" />
              {uploading ? "Uploading…" : `Upload ${parsed.length || 0} rows`}
            </Button>
            {result && (
              <span className={`text-xs ${result.ok ? "text-foreground" : "text-destructive"}`}>
                Written {result.written} · skipped {result.skipped}
                {result.errors?.length ? ` · ${result.errors.length} errors` : ""}
              </span>
            )}
          </div>

          {result?.errors?.length > 0 && (
            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer">First errors</summary>
              <ul className="list-disc pl-5 mt-1">
                {result.errors.slice(0, 10).map((e: string, i: number) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}

          <div>
            <Label className="text-[10px] uppercase tracking-brand">For Lindy / server jobs</Label>
            <div className="flex gap-2 mt-1">
              <Input value={DTC_URL} readOnly className="font-mono text-xs" style={SHARP} />
              <CopyButton value={DTC_URL} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Same payload shape as above wrapped in <code>{`{ "rows": [...] }`}</code>. Auth via <code>x-kennel-secret</code> header.
            </p>
          </div>
        </div>
      </Card>
    </div>
    </>
  );
}