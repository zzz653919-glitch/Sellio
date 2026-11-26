/**
 * Reading sales files in the browser (CSV and Excel). Only the mapped columns are sent to the
 * server as clean rows; the server validates every row again.
 */
export type Cell = string | number | boolean | Date | null;
export type Field = "date" | "product" | "revenue" | "cost" | "expenses" | "units";
export type Mapping = Partial<Record<Field, number>>;
export type CleanRow = { date: string; product?: string | null; revenue: number; cost?: number | null; expenses?: number | null; units?: number | null };

/** Parse CSV text with quotes; the delimiter (, ; or tab) is detected from the first line. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "").replace(/^sep=.\r?\n/i, ""); // Excel's "sep=;" hint line
  const first = clean.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export async function readFile(file: File): Promise<Cell[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    return (await readSheet(file)) as Cell[][];
  }
  return parseCsv(await file.text());
}

/** Strong patterns are tried on every column before weak ones (so "Product" wins over "Brand name"). */
const STRONG: Record<Field, RegExp> = {
  date: /date|sana|дата|день|месяц|period|davr|^kun$|^oy$|^month$/i,
  product: /product|mahsulot|товар|tovar|наимен|^item/i,
  revenue: /revenue|sales|tushum|savdo|выручк|продаж|daromad/i,
  cost: /cost|cogs|tannarx|себестоим|закуп|xarid/i,
  expenses: /expense|xarajat|расход|chiqim/i,
  units: /qty|quantity|units|soni|dona|количеств|кол-во|^шт|miqdor/i,
};
const WEAK: Partial<Record<Field, RegExp>> = {
  product: /name|nomi|артикул|название/i,
  revenue: /сумма|amount|total|summa/i,
};

export function guessMapping(header: Cell[]): Mapping {
  const m: Mapping = {};
  const used = new Set<number>();
  const names = header.map((h) => String(h ?? "").trim());
  for (const table of [STRONG, WEAK]) {
    for (const f of ["date", "product", "revenue", "cost", "expenses", "units"] as Field[]) {
      if (m[f] !== undefined || !table[f]) continue;
      const i = names.findIndex((h, k) => !used.has(k) && table[f]!.test(h));
      if (i >= 0) { m[f] = i; used.add(i); }
    }
  }
  return m;
}

/**
 * "1 234 567,50" / "1,234,567.50" / "12.500" / "(1 234)" / "12500 so'm" → number.
 * A single separator followed by exactly three digits is a thousands separator ("12.500" = 12500);
 * otherwise it is the decimal mark ("12,5" = 12.5, "0,123" = 0.123).
 */
export function toNumber(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v === null || typeof v === "boolean" || v instanceof Date) return null;
  let s = v.trim();
  if (!s) return null;
  if (/^-?\d+(\.\d+)?e[+-]?\d+$/i.test(s)) return Number(s);
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[\s\u00a0']/g, "").replace(/[^\d,.-]/g, "").replace(/^[.,]+|[.,]+$/g, "");
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (!/^\d[\d,.]*$/.test(s)) return null;
  const dots = (s.match(/\./g) ?? []).length, commas = (s.match(/,/g) ?? []).length;
  if (dots && commas) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (dots + commas > 1) {
    const sep = dots ? "." : ",";
    if (!new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(s)) return null; // "1.2.3" is not a number
    s = s.split(sep).join("");
  } else if (dots + commas === 1) {
    const [int, frac] = s.split(/[.,]/);
    s = frac.length === 3 && int !== "0" ? int + frac : `${int}.${frac}`;
  }
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
export type DayOrder = "dmy" | "mdy";

/** Date cell → "YYYY-MM-DD" / "YYYY-MM" (the server validates the final value). */
export function toDate(v: Cell, order: DayOrder = "dmy"): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86_400_000); // Excel serial date
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = /^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/.exec(s);
  if (m) return m[3] ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : `${m[1]}-${pad(+m[2])}`;
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(s);
  if (m) {
    const [d, mo] = order === "mdy" && s.includes("/") ? [m[2], m[1]] : [m[1], m[2]];
    return `${m[3]}-${pad(+mo)}-${pad(+d)}`;
  }
  return null;
}

/** "12/31/2025" anywhere in the column means the file writes month first (US style). */
export function detectDayOrder(values: Cell[]): DayOrder {
  for (const v of values) {
    const m = typeof v === "string" ? /^(\d{1,2})\/(\d{1,2})\/\d{4}/.exec(v.trim()) : null;
    if (m && +m[2] > 12 && +m[1] <= 12) return "mdy";
    if (m && +m[1] > 12) return "dmy";
  }
  return "dmy";
}

export function buildRows(data: Cell[][], mapping: Mapping, hasHeader = true): { rows: CleanRow[]; skipped: number; unreadable: Partial<Record<Field, number>> } {
  const body = (hasHeader ? data.slice(1) : data).filter((r) => r.some((c) => c !== null && String(c).trim() !== ""));
  const order = mapping.date !== undefined ? detectDayOrder(body.map((r) => r[mapping.date!] ?? null)) : "dmy";
  const rows: CleanRow[] = [];
  const unreadable: Partial<Record<Field, number>> = {};
  let skipped = 0;
  const filled = (c: Cell | undefined) => c !== null && c !== undefined && String(c).trim() !== "";
  for (const r of body) {
    const date = mapping.date !== undefined ? toDate(r[mapping.date] ?? null, order) : null;
    const revenue = mapping.revenue !== undefined ? toNumber(r[mapping.revenue] ?? null) : null;
    if (!date || revenue === null) { skipped++; continue; }
    const num = (f: Field) => {
      if (mapping[f] === undefined) return null;
      const cell = r[mapping[f]!];
      const n = toNumber(cell ?? null);
      if (n === null && filled(cell)) unreadable[f] = (unreadable[f] ?? 0) + 1;
      return n;
    };
    const product = mapping.product !== undefined ? String(r[mapping.product] ?? "").trim().slice(0, 120) || null : null;
    rows.push({ date, product, revenue, cost: num("cost"), expenses: num("expenses"), units: num("units") });
  }
  return { rows, skipped, unreadable };
}

export const TEMPLATE_CSV = "date,product,revenue,cost,expenses,units\n2025-01-15,Tea,1200000,700000,150000,40\n2025-01-15,Coffee,800000,350000,90000,25\n";
