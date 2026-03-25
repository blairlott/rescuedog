import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Upload, FileSpreadsheet, AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import { US_STATES } from "@/lib/usStates";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type RawRow = Record<string, string>;

const DB_FIELDS = [
  { value: "__skip__", label: "— Skip —" },
  { value: "account_name", label: "Account Name" },
  { value: "buyer_name", label: "Buyer Name" },
  { value: "buyer_title", label: "Buyer Title" },
  { value: "rep_name", label: "Rep Name" },
  { value: "premise_type", label: "Premise Type (on/off)" },
  { value: "status", label: "Status" },
  { value: "distributor", label: "Distributor" },
  { value: "distributor_rep", label: "Distributor Rep" },
  { value: "street_address", label: "Street Address" },
  { value: "city", label: "City" },
  { value: "state", label: "State" },
  { value: "zip", label: "ZIP" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "website", label: "Website" },
  { value: "sales_order", label: "Sales Order" },
  { value: "notes", label: "Notes" },
];

function guessMapping(header: string): string {
  const h = header.toLowerCase().trim();
  const map: Record<string, string> = {
    "account name": "account_name", "account": "account_name", "name": "account_name",
    "buyer name": "buyer_name", "buyer": "buyer_name", "contact": "buyer_name",
    "buyer title": "buyer_title", "title": "buyer_title",
    "rep": "rep_name", "rep name": "rep_name", "rdw rep": "rep_name", "sales rep": "rep_name",
    "premise": "premise_type", "premise type": "premise_type", "type": "premise_type",
    "status": "status",
    "distributor": "distributor", "dist": "distributor",
    "distributor rep": "distributor_rep", "dist rep": "distributor_rep",
    "street": "street_address", "address": "street_address", "street address": "street_address",
    "acct street address": "street_address",
    "city": "city", "acct city": "city",
    "state": "state",
    "zip": "zip", "zipcode": "zip", "zip code": "zip", "acct zipcode": "zip",
    "phone": "phone", "telephone": "phone", "acct telephone": "phone",
    "email": "email",
    "website": "website", "web": "website",
    "sales order": "sales_order", "order": "sales_order",
    "notes": "notes", "note": "notes",
  };
  return map[h] || "__skip__";
}

function parseCSV(text: string): { headers: string[]; rows: RawRow[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const vals = parseRow(line);
    const row: RawRow = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ""; });
    return row;
  });

  return { headers, rows };
}

export function BulkImportDialog({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<"upload" | "map" | "preview" | "done">("upload");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState({ success: 0, failed: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const reset = () => {
    setStep("upload");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setImportResult({ success: 0, failed: 0 });
  };

  const handleFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "csv" || ext === "txt") {
      const text = await file.text();
      const parsed = parseCSV(text);
      if (parsed.headers.length === 0) { toast.error("Empty file"); return; }
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      const autoMap: Record<string, string> = {};
      parsed.headers.forEach((h) => { autoMap[h] = guessMapping(h); });
      setMapping(autoMap);
      setStep("map");
    } else if (ext === "xlsx" || ext === "xls") {
      toast.error("Please save your Excel file as CSV first, then upload the CSV.");
    } else {
      toast.error("Unsupported file type. Please upload a CSV file.");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const mappedRows = rows.map((row) => {
    const mapped: Record<string, string> = {};
    headers.forEach((h) => {
      const field = mapping[h];
      if (field && field !== "__skip__") {
        mapped[field] = row[h] || "";
      }
    });
    return mapped;
  });

  const validRows = mappedRows.filter((r) => r.account_name?.trim());

  const handleImport = async () => {
    if (validRows.length === 0) { toast.error("No valid rows to import"); return; }
    setImporting(true);
    let success = 0;
    let failed = 0;

    const batchSize = 50;
    for (let i = 0; i < validRows.length; i += batchSize) {
      const batch = validRows.slice(i, i + batchSize).map((r) => ({
        account_name: r.account_name?.trim() || "",
        buyer_name: r.buyer_name?.trim() || null,
        buyer_title: r.buyer_title?.trim() || null,
        rep_name: r.rep_name?.trim() || null,
        premise_type: ["on", "off"].includes(r.premise_type?.toLowerCase()) ? r.premise_type.toLowerCase() : "off",
        status: ["prospect", "active", "won", "lost"].includes(r.status?.toLowerCase()) ? r.status.toLowerCase() : "prospect",
        distributor: r.distributor?.trim() || null,
        distributor_rep: r.distributor_rep?.trim() || null,
        street_address: r.street_address?.trim() || null,
        city: r.city?.trim() || null,
        state: r.state?.trim().toUpperCase() || null,
        zip: r.zip?.trim() || null,
        phone: r.phone?.trim() || null,
        email: r.email?.trim() || null,
        website: r.website?.trim() || null,
        sales_order: r.sales_order?.trim() || null,
        notes: r.notes?.trim() || null,
      }));

      const { error, data } = await supabase.from("sales_accounts").insert(batch).select();
      if (error) { failed += batch.length; } else { success += data.length; }
    }

    setImportResult({ success, failed });
    setStep("done");
    setImporting(false);
    qc.invalidateQueries({ queryKey: ["sales_accounts"] });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Import Accounts"}
            {step === "map" && "Map Columns"}
            {step === "preview" && "Preview Import"}
            {step === "done" && "Import Complete"}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div
            className="border-2 border-dashed border-border rounded p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
            />
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-foreground font-medium">Drop a CSV file here or click to browse</p>
            <p className="text-sm text-muted-foreground mt-1">Supports .csv files</p>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Map your file columns to account fields. We auto-detected {Object.values(mapping).filter((v) => v !== "__skip__").length} matches.
            </p>
            <div className="border border-border divide-y divide-border max-h-[400px] overflow-y-auto">
              {headers.map((h) => (
                <div key={h} className="flex items-center gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{h}</p>
                    <p className="text-xs text-muted-foreground truncate">e.g. "{rows[0]?.[h] || ""}"</p>
                  </div>
                  <Select value={mapping[h] || "__skip__"} onValueChange={(v) => setMapping((p) => ({ ...p, [h]: v }))}>
                    <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DB_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {!Object.values(mapping).includes("account_name") && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" /> You must map at least one column to "Account Name"
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={reset}>Back</Button>
              <Button onClick={() => setStep("preview")} disabled={!Object.values(mapping).includes("account_name")}>
                Preview ({validRows.length} rows)
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{validRows.length} accounts ready to import</p>
            <div className="border border-border overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Rep</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validRows.slice(0, 50).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{r.account_name}</TableCell>
                      <TableCell>{r.city || "—"}</TableCell>
                      <TableCell>{r.state || "—"}</TableCell>
                      <TableCell>{r.premise_type || "off"}</TableCell>
                      <TableCell>{r.rep_name || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {validRows.length > 50 && (
                <p className="text-xs text-muted-foreground text-center py-2">...and {validRows.length - 50} more</p>
              )}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("map")}>Back</Button>
              <Button onClick={handleImport} disabled={importing}>
                {importing ? "Importing..." : `Import ${validRows.length} Accounts`}
              </Button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="text-center py-6 space-y-4">
            <Check className="h-12 w-12 mx-auto text-green-600" />
            <div>
              <p className="text-lg font-semibold text-foreground">{importResult.success} accounts imported</p>
              {importResult.failed > 0 && (
                <p className="text-sm text-destructive">{importResult.failed} rows failed</p>
              )}
            </div>
            <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
