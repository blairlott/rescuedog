import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ColumnType = "number" | "date" | "string";
export interface ParsedDataset {
  columns: { name: string; type: ColumnType }[];
  rows: Record<string, any>[];
}

function inferType(values: any[]): ColumnType {
  let numCount = 0, dateCount = 0, total = 0;
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    total++;
    const s = String(v).trim();
    if (s !== "" && !isNaN(Number(s.replace(/[$,]/g, "")))) numCount++;
    else if (!isNaN(Date.parse(s))) dateCount++;
  }
  if (total === 0) return "string";
  if (numCount / total > 0.8) return "number";
  if (dateCount / total > 0.8) return "date";
  return "string";
}

function normalizeRows(rawRows: any[][], headers: string[]): ParsedDataset {
  const cleanHeaders = headers.map((h, i) => String(h ?? `col_${i + 1}`).trim() || `col_${i + 1}`);
  const rows = rawRows.map((r) => {
    const obj: Record<string, any> = {};
    cleanHeaders.forEach((h, i) => { obj[h] = r[i] ?? null; });
    return obj;
  });
  const columns = cleanHeaders.map((name) => {
    const vals = rows.map((r) => r[name]);
    const type = inferType(vals);
    return { name, type };
  });
  // Coerce values to typed forms for numbers
  for (const c of columns) {
    if (c.type === "number") {
      for (const r of rows) {
        const raw = r[c.name];
        if (raw === null || raw === undefined || raw === "") { r[c.name] = null; continue; }
        const n = Number(String(raw).replace(/[$,]/g, ""));
        r[c.name] = isNaN(n) ? null : n;
      }
    }
  }
  return { columns, rows };
}

export async function parseCSV(file: File): Promise<ParsedDataset> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: true,
      complete: (res) => {
        const rows = res.data as any[][];
        if (!rows.length) return reject(new Error("Empty CSV"));
        const headers = rows[0].map((v) => String(v));
        resolve(normalizeRows(rows.slice(1), headers));
      },
      error: (err) => reject(err),
    });
  });
}

export async function parseXLSX(file: File, sheetName?: string): Promise<ParsedDataset> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const name = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, blankrows: false, defval: null });
  if (!rows.length) throw new Error("Empty sheet");
  const headers = (rows[0] as any[]).map((v) => String(v ?? ""));
  return normalizeRows(rows.slice(1) as any[][], headers);
}

export async function parsePDF(file: File): Promise<ParsedDataset> {
  // Best-effort: extract text, split lines, treat first non-empty line as header,
  // split each line on 2+ spaces / tabs. Works for QB and Vinoshipper text exports.
  const pdfjs: any = await import(/* @vite-ignore */ "https://esm.sh/pdfjs-dist@4.7.76/build/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Reconstruct rough lines by y-coordinate
    const byY = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as any[]) {
      const y = Math.round(item.transform[5]);
      const arr = byY.get(y) || [];
      arr.push({ x: item.transform[4], str: item.str });
      byY.set(y, arr);
    }
    const sortedY = Array.from(byY.keys()).sort((a, b) => b - a);
    for (const y of sortedY) {
      const cells = byY.get(y)!.sort((a, b) => a.x - b.x);
      const line = cells.map((c) => c.str).join("\t").trim();
      if (line) lines.push(line);
    }
  }
  if (!lines.length) throw new Error("No text in PDF");
  const split = (s: string) => s.split(/\t+| {2,}/).map((x) => x.trim()).filter(Boolean);
  const headers = split(lines[0]);
  const rows = lines.slice(1).map(split).filter((r) => r.length > 1);
  return normalizeRows(rows, headers);
}

export async function parseFile(file: File): Promise<ParsedDataset> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv" || file.type === "text/csv") return parseCSV(file);
  if (ext === "xlsx" || ext === "xls") return parseXLSX(file);
  if (ext === "pdf" || file.type === "application/pdf") return parsePDF(file);
  throw new Error(`Unsupported format: .${ext}`);
}