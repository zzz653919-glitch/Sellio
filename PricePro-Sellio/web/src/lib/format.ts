export const fmtNumber = (n: number, digits = 0) =>
  n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });

export function fmtMoney(amount: number, currency: string | null) {
  if (!currency) return fmtNumber(amount, 2);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${fmtNumber(amount, 2)} ${currency}`;
  }
}

/** The UI language (set on <html lang> by the i18n provider). */
const isUz = () => document.documentElement.lang === "uz";
/** Locale for Intl formatting when not Uzbek (Russian and English are fully supported by browsers). */
const loc = () => (document.documentElement.lang === "ru" ? "ru" : "en");

// Browsers often lack Uzbek locale data (they print "M11" instead of month names), so Uzbek is formatted here.
const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const UZ_MONTHS_SHORT = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const UZ_WEEKDAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];
const pad = (n: number) => String(n).padStart(2, "0");

/** A date-only value like "2025-11-01" is a calendar day, not a moment: read it in UTC. */
function parts(value: string | Date) {
  const dateOnly = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = typeof value === "string" ? new Date(dateOnly ? `${value}T00:00:00Z` : value) : value;
  return dateOnly
    ? { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate(), wd: d.getUTCDay(), h: 0, min: 0, d, utc: true }
    : { y: d.getFullYear(), m: d.getMonth(), day: d.getDate(), wd: d.getDay(), h: d.getHours(), min: d.getMinutes(), d, utc: false };
}
const tz = (utc: boolean) => (utc ? { timeZone: "UTC" } : {});

export function fmtDate(value: string | Date) {
  const p = parts(value);
  if (isUz()) return `${p.day}-${UZ_MONTHS_SHORT[p.m]}, ${p.y}`;
  return p.d.toLocaleDateString(loc(), { year: "numeric", month: "short", day: "numeric", ...tz(p.utc) });
}

export function fmtDateTime(value: string | Date) {
  const p = parts(value);
  if (isUz()) return `${p.day}-${UZ_MONTHS_SHORT[p.m]}, ${p.y}, ${pad(p.h)}:${pad(p.min)}`;
  return p.d.toLocaleString(loc(), { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "noyabr 2025" / "November 2025" */
export function fmtMonth(value: string | Date) {
  const p = parts(value);
  if (isUz()) return `${UZ_MONTHS[p.m]} ${p.y}`;
  return p.d.toLocaleDateString(loc(), { month: "long", year: "numeric", ...tz(p.utc) });
}

/** Month name only: 8 → "avgust" / "август" / "August"; short → "avg" / "авг." / "Aug". */
export function fmtMonthName(month: number, short = false) {
  if (isUz()) return (short ? UZ_MONTHS_SHORT : UZ_MONTHS)[month - 1];
  return new Date(Date.UTC(2024, month - 1, 1)).toLocaleDateString(loc(), { month: short ? "short" : "long", timeZone: "UTC" });
}

/** Short axis label: "noy 25" / "Nov 25" for months, "14-noy" / "Nov 14" for days. */
export function fmtAxis(value: string, granularity: "day" | "week" | "month") {
  const p = parts(value);
  if (granularity === "month") return isUz() ? `${UZ_MONTHS_SHORT[p.m]} ${String(p.y).slice(2)}` : p.d.toLocaleDateString(loc(), { month: "short", year: "2-digit", timeZone: "UTC" });
  return isUz() ? `${p.day}-${UZ_MONTHS_SHORT[p.m]}` : p.d.toLocaleDateString(loc(), { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "seshanba, 25-noyabr" / "Tuesday, November 25" */
export function fmtToday(date = new Date()) {
  if (isUz()) return `${UZ_WEEKDAYS[date.getDay()]}, ${date.getDate()}-${UZ_MONTHS[date.getMonth()]}`;
  return date.toLocaleDateString(loc(), { weekday: "long", month: "long", day: "numeric" });
}

const UZ_REL: Record<string, string> = { minute: "daqiqa", hour: "soat", day: "kun" };
function rel(n: number, unit: "minute" | "hour" | "day") {
  if (isUz()) return n < 0 ? `${-n} ${UZ_REL[unit]} oldin` : `${n} ${UZ_REL[unit]}dan so‘ng`;
  return new Intl.RelativeTimeFormat(loc(), { numeric: "auto" }).format(n, unit);
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.parse(iso) - Date.now()) / 1000);
  if (Math.abs(s) < 60) return isUz() ? "hozirgina" : loc() === "ru" ? "только что" : "just now";
  const m = Math.round(s / 60);
  if (Math.abs(m) < 60) return rel(m, "minute");
  const h = Math.round(m / 60);
  if (Math.abs(h) < 24) return rel(h, "hour");
  const d = Math.round(h / 24);
  if (Math.abs(d) < 30) return rel(d, "day");
  return fmtDate(iso);
}

export const fmtBytes = (b: number) => (b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

export const fmtPct = (p: number | null) => (p === null ? "—" : `${p > 0 ? "+" : ""}${p.toFixed(1)}%`);

export function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
