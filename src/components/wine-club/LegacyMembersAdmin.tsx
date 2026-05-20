import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Download, Search, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type LegacyStatus = "current" | "inactive" | "on_hold" | "archived";

const STATUS_TABS: { value: LegacyStatus; label: string }[] = [
  { value: "current", label: "Current" },
  { value: "inactive", label: "Inactive" },
  { value: "on_hold", label: "On Hold" },
  { value: "archived", label: "Archived" },
];

// Match Vinoshipper Excel tab names to our statuses.
const SHEET_NAME_TO_STATUS: { match: RegExp; status: LegacyStatus }[] = [
  { match: /current/i, status: "current" },
  { match: /inactive/i, status: "inactive" },
  { match: /on.?hold|hold/i, status: "on_hold" },
  { match: /archive/i, status: "archived" },
];

const HEADER_HINTS = ["email", "first name", "firstname", "last name", "lastname", "membership"];

// Vinoshipper exports often have a title row + merged headers. Scan the first 10
// rows for the one that looks like real column headers, then build row objects.
function sheetToRows(ws: XLSX.WorkSheet): Record<string, string>[] {
  const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
  if (!aoa.length) return [];
  let headerIdx = 0;
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const row = (aoa[i] || []).map((c) => String(c ?? "").toLowerCase());
    if (HEADER_HINTS.some((h) => row.some((c) => c.includes(h)))) {
      headerIdx = i;
      break;
    }
  }
  const headers = (aoa[headerIdx] || []).map((c, i) =>
    String(c ?? "").trim() || `col_${i}`
  );
  const out: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i] || [];
    if (!row.some((c) => String(c ?? "").trim() !== "")) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => {
      const v = row[j];
      obj[h] = v == null ? "" : String(v).trim();
    });
    out.push(obj);
  }
  return out;
}

interface LegacyMember {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  club_name: string | null;
  status: string;
  shipping_city: string | null;
  shipping_state: string | null;
  vinoshipper_customer_id: string | null;
  vinoshipper_membership_id: string | null;
  joined_at: string | null;
  imported_at: string;
  claimed_at: string | null;
}

// Minimal CSV parser supporting quoted values + commas inside quotes.
function parseCSV(text: string): Record<string, string>[] {
  const lines: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (cur !== "" || row.length) { row.push(cur); lines.push(row); row = []; cur = ""; }
        if (c === "\r" && text[i + 1] === "\n") i++;
      } else cur += c;
    }
  }
  if (cur !== "" || row.length) { row.push(cur); lines.push(row); }
  if (lines.length < 2) return [];
  const headers = lines[0].map((h) => h.trim());
  return lines.slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function toCSV(rows: LegacyMember[]): string {
  const headers = ["email", "first_name", "last_name", "phone", "club_name", "status", "shipping_city", "shipping_state", "vinoshipper_customer_id", "vinoshipper_membership_id", "joined_at", "imported_at", "claimed_at"];
  const esc = (v: any) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc((r as any)[h])).join(","))].join("\n");
}

export function LegacyMembersAdmin() {
  const qc = useQueryClient();
  const [activeStatus, setActiveStatus] = useState<LegacyStatus>("current");
  const [uploadingFor, setUploadingFor] = useState<LegacyStatus | null>(null);
  const [uploadingWorkbook, setUploadingWorkbook] = useState(false);
  const [search, setSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const workbookRef = useRef<HTMLInputElement>(null);

  const { data: members, isLoading } = useQuery({
    queryKey: ["wine-club-legacy-members", activeStatus],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wine_club_legacy_members")
        .select("id, email, first_name, last_name, phone, club_name, status, shipping_city, shipping_state, vinoshipper_customer_id, vinoshipper_membership_id, joined_at, imported_at, claimed_at")
        .eq("status", activeStatus)
        .order("last_name", { nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return data as LegacyMember[];
    },
  });

  const { data: counts } = useQuery({
    queryKey: ["wine-club-legacy-counts"],
    queryFn: async () => {
      const out: Record<string, number> = {};
      for (const s of STATUS_TABS) {
        const { count } = await supabase
          .from("wine_club_legacy_members")
          .select("*", { count: "exact", head: true })
          .eq("status", s.value);
        out[s.value] = count ?? 0;
      }
      return out;
    },
  });

  const handleFile = async (file: File, status: LegacyStatus) => {
    setUploadingFor(status);
    try {
      let rows: Record<string, string>[] = [];
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      if (isExcel) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        // Prefer a sheet whose name matches this status; else first sheet.
        const target = SHEET_NAME_TO_STATUS.find((m) => m.status === status);
        const sheetName =
          wb.SheetNames.find((n) => target && target.match.test(n)) || wb.SheetNames[0];
        rows = sheetToRows(wb.Sheets[sheetName]);
      } else {
        const text = await file.text();
        rows = parseCSV(text);
      }
      if (!rows.length) {
        toast.error("File is empty or unreadable");
        return;
      }
      const { data, error } = await supabase.functions.invoke("vinoshipper-import-csv", {
        body: { rows, status, source_file: file.name },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Imported ${data.inserted} new, updated ${data.updated}, skipped ${data.skipped}`);
      qc.invalidateQueries({ queryKey: ["wine-club-legacy-members"] });
      qc.invalidateQueries({ queryKey: ["wine-club-legacy-counts"] });
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setUploadingFor(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // One-shot: upload the full Vinoshipper workbook and import every matching tab.
  const handleWorkbook = async (file: File) => {
    setUploadingWorkbook(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const summary: string[] = [];
      for (const sheetName of wb.SheetNames) {
        const matched = SHEET_NAME_TO_STATUS.find((m) => m.match.test(sheetName));
        if (!matched) continue;
        const rows = sheetToRows(wb.Sheets[sheetName]);
        if (!rows.length) {
          summary.push(`${sheetName}: empty`);
          continue;
        }
        const { data, error } = await supabase.functions.invoke("vinoshipper-import-csv", {
          body: { rows, status: matched.status, source_file: `${file.name} :: ${sheetName}` },
        });
        if (error) throw error;
        if (data?.error) throw new Error(`${sheetName}: ${data.error}`);
        summary.push(`${sheetName}: +${data.inserted} new, ~${data.updated} updated`);
      }
      toast.success(summary.length ? summary.join(" • ") : "No matching tabs found");
      qc.invalidateQueries({ queryKey: ["wine-club-legacy-members"] });
      qc.invalidateQueries({ queryKey: ["wine-club-legacy-counts"] });
    } catch (e: any) {
      toast.error(e.message || "Workbook import failed");
    } finally {
      setUploadingWorkbook(false);
      if (workbookRef.current) workbookRef.current.value = "";
    }
  };

  const exportCSV = () => {
    if (!members?.length) return;
    const csv = toCSV(members);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `legacy-members-${activeStatus}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = (members || []).filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [m.email, m.first_name, m.last_name, m.club_name, m.shipping_state]
      .some((v) => (v || "").toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-bold text-foreground">Vinoshipper Legacy Members</h3>
          <p className="text-sm text-muted-foreground">
            Upload the full Vinoshipper Members workbook (.xlsx with 4 tabs) and we'll import every tab in one shot.
            You can also upload one CSV or sheet per status below. Re-uploads are safe — rows with a matching
            Membership ID are updated, not duplicated.
          </p>
        </div>
        <div>
          <input
            ref={workbookRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            id="vs-workbook-upload"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleWorkbook(f);
            }}
          />
          <label htmlFor="vs-workbook-upload">
            <Button
              asChild
              disabled={uploadingWorkbook}
              className="uppercase tracking-brand text-sm font-bold cursor-pointer"
            >
              <span>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                {uploadingWorkbook ? "Importing workbook…" : "Upload full VS workbook (.xlsx)"}
              </span>
            </Button>
          </label>
        </div>
      </div>

      <Tabs value={activeStatus} onValueChange={(v) => setActiveStatus(v as LegacyStatus)}>
        <TabsList>
          {STATUS_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              {counts?.[t.value] != null && (
                <Badge variant="secondary" className="ml-2 text-xs">{counts[t.value]}</Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {STATUS_TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-4 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <input
                ref={t.value === activeStatus ? fileRef : undefined}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                className="hidden"
                id={`csv-upload-${t.value}`}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f, t.value);
                }}
              />
              <label htmlFor={`csv-upload-${t.value}`}>
                <Button
                  asChild
                  disabled={uploadingFor === t.value}
                  className="uppercase tracking-brand text-sm font-bold cursor-pointer"
                >
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingFor === t.value ? "Uploading…" : `Upload ${t.label} (CSV or Excel)`}
                  </span>
                </Button>
              </label>
              <Button variant="outline" onClick={exportCSV} disabled={!members?.length} className="text-sm">
                <Download className="h-4 w-4 mr-2" /> Export visible
              </Button>
              <div className="relative ml-auto">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search email, name, club…"
                  className="pl-8 h-9 w-64"
                />
              </div>
            </div>

            <div className="border border-border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>VS IDs</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Linked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7}>Loading…</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No {t.label.toLowerCase()} members yet. Upload a CSV to get started.
                      </TableCell>
                    </TableRow>
                  ) : filtered.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        {[m.first_name, m.last_name].filter(Boolean).join(" ") || "—"}
                      </TableCell>
                      <TableCell className="text-xs">{m.email || "—"}</TableCell>
                      <TableCell className="text-xs">{m.club_name || "—"}</TableCell>
                      <TableCell className="text-xs">
                        {[m.shipping_city, m.shipping_state].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {m.vinoshipper_customer_id ? `c:${m.vinoshipper_customer_id}` : ""}
                        {m.vinoshipper_membership_id ? ` m:${m.vinoshipper_membership_id}` : ""}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        {m.claimed_at ? (
                          <Badge className="bg-green-100 text-green-800 text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Claimed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">unclaimed</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
