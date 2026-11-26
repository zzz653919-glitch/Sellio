import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot, Briefcase, Download, FileSpreadsheet, FileText, Lightbulb, Plus, Trash2, Upload as UploadIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SourceNote, useChartTheme } from "../components/charts";
import { ErrorAlert, StatCard } from "../components/shared";
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, PageHeader, Select, Spinner, Tabs, cx, useToast } from "../components/ui";
import { del, errorMessage, get, post, api } from "../lib/api";
import { fmtAmount, fmtCompact, fmtDate, fmtDateTime, fmtMonth, fmtMonthName, fmtNumber, fmtPct } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useMsg, type Msg } from "../lib/msg";
import { buildRows, guessMapping, readFile, TEMPLATE_CSV, type Cell, type CleanRow, type Field as Col, type Mapping } from "../lib/sheet";

// ------------------------------------------------------------------ API types
type DatasetSummary = { id: string; name: string; source: "csv" | "xlsx" | "manual"; currency: string; rowCount: number; periodStart: string | null; periodEnd: string | null; updatedAt: string };
type MonthAgg = { month: string; revenue: number; cost: number | null; expenses: number | null; grossProfit: number | null; netProfit: number | null; netMarginPct: number | null; units: number | null; partial?: boolean };
type Analysis = {
  rows: number; period: { start: string; end: string }; hasCost: boolean; hasExpenses: boolean; hasUnits: boolean; hasProducts: boolean;
  totals: { revenue: number; cost: number | null; expenses: number | null; grossProfit: number | null; netProfit: number | null; grossMarginPct: number | null; netMarginPct: number | null; units: number | null };
  monthly: MonthAgg[];
  growth: { momPct: number | null; last3VsPrev3Pct: number | null; yoyPct: number | null; lastFullMonth: string | null };
  products: { name: string; revenue: number; sharePct: number; units: number | null; grossMarginPct: number | null; last3VsPrev3Pct: number | null }[];
  bestMonth: { month: number; avgRevenue: number } | null;
  forecast: { status: "ok"; months: { month: string; revenue: number; lower: number; upper: number }[]; totalNext3: number; changePct: number | null; model: string; smapePct: number; confidence: "high" | "medium" | "low" } | { status: "insufficient"; reason: Msg };
  risks: Msg[];
  opportunities: Msg[];
};
type PeriodTotals = { from: string; to: string; revenue: number; netProfit: number | null; units: number | null };
type Report = {
  id: string; period: "week" | "month"; title: string; createdAt: string;
  content: {
    period: "week" | "month"; generatedAt: string;
    business: null | { datasetName: string; currency: string; dataUntil: string; note: Msg | null; current: PeriodTotals; previous: PeriodTotals | null; revenueChangePct: number | null; profitChangePct: number | null; topProducts: { name: string; revenue: number; sharePct: number }[]; risks: Msg[]; opportunities: Msg[] };
    market: null | { computedAt: string; rising: { label: string; pct: number }[]; declining: { label: string; pct: number }[]; updates: Msg[] };
    activity: { analyses: number; ads: number; days: number };
    recommendations: Msg[]; summary: string | null; summaryError: string | null;
  } | null;
};

type Tab = "overview" | "data" | "reports";
const CURRENCIES = ["UZS", "USD", "EUR", "RUB", "KZT"];
const COLS: { key: Col; label: string; required?: boolean }[] = [
  { key: "date", label: "Date", required: true },
  { key: "revenue", label: "Revenue", required: true },
  { key: "product", label: "Product" },
  { key: "cost", label: "Cost of goods" },
  { key: "expenses", label: "Expenses" },
  { key: "units", label: "Units sold" },
];

function Pct({ v }: { v: number | null }) {
  if (v === null) return <span className="muted">—</span>;
  return <b className={v > 0 ? "text-emerald-600 dark:text-emerald-400" : v < 0 ? "text-rose-600 dark:text-rose-400" : ""}>{fmtPct(v)}</b>;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); // revoking at once can cancel the download
}

// ------------------------------------------------------------------ import from a file
function Importer({ onDone }: { onDone: (id: string) => void }) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; kind: "csv" | "xlsx"; data: Cell[][] } | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("UZS");
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const built = useMemo(() => (file ? buildRows(file.data, mapping) : null), [file, mapping]);
  const save = useMutation({
    mutationFn: (rows: CleanRow[]) => post<{ dataset: { id: string } }>("/business/datasets", { name, source: file!.kind, currency, rows }),
    onSuccess: (d) => { setFile(null); onDone(d.dataset.id); },
  });

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setReadError(null);
    if (!/\.(csv|xlsx)$/i.test(f.name)) { setReadError(t("Choose a .csv or .xlsx file.")); return; }
    if (f.size > 10 * 1024 * 1024) { setReadError(t("The file is larger than 10 MB.")); return; }
    setReading(true);
    try {
      const data = await readFile(f);
      if (data.length < 2) throw new Error(t("The file has no data rows."));
      setFile({ name: f.name, kind: /\.xlsx$/i.test(f.name) ? "xlsx" : "csv", data });
      setMapping(guessMapping(data[0]));
      setName(f.name.replace(/\.(csv|xlsx)$/i, "").slice(0, 120));
    } catch (e) {
      setReadError(e instanceof Error ? e.message : t("The file could not be read."));
    } finally {
      setReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const header = file?.data[0] ?? [];
  const colOptions = [{ value: "", label: t("— not in the file —") }, ...header.map((h, i) => ({ value: String(i), label: String(h ?? `#${i + 1}`) }))];
  const tooMany = (built?.rows.length ?? 0) > 20000;

  return (
    <Card className="space-y-4 p-5">
      <h3 className="flex items-center gap-2 font-semibold"><FileSpreadsheet className="h-4 w-4" />{t("Upload sales data (CSV or Excel)")}</h3>
      <p className="text-sm muted">{t("One row per sale, day or month. Needed: a date and an amount (revenue). Optional: product, cost of goods, expenses, units. The file is read in your browser; only the chosen columns are saved, privately for your account.")}</p>
      <div className="flex flex-wrap gap-2">
        <input ref={inputRef} type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
        <Button icon={<UploadIcon className="h-4 w-4" />} loading={reading} onClick={() => inputRef.current?.click()}>{t("Choose file")}</Button>
        <Button variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => download("pricepro-sales-template.csv", TEMPLATE_CSV)}>{t("Download a template")}</Button>
      </div>
      {readError && <Alert tone="error">{readError}</Alert>}
      {file && built && (
        <div className="space-y-4">
          <p className="text-sm"><b>{file.name}</b> · {t("{n} rows", { n: file.data.length - 1 })}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COLS.map((c) => (
              <Field key={c.key} label={`${t(c.label)}${c.required ? " *" : ""}`}>
                <Select value={mapping[c.key] === undefined ? "" : String(mapping[c.key])} options={colOptions}
                  onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value === "") delete n[c.key]; else n[c.key] = Number(e.target.value); return n; })} />
              </Field>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900"><tr>{COLS.map((c) => <th key={c.key} className="px-2 py-1.5 text-left">{t(c.label)}</th>)}</tr></thead>
              <tbody>
                {built.rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-1">{r.date}</td><td className="px-2 py-1">{fmtNumber(r.revenue, 2)}</td><td className="px-2 py-1">{r.product ?? "—"}</td>
                    <td className="px-2 py-1">{r.cost ?? "—"}</td><td className="px-2 py-1">{r.expenses ?? "—"}</td><td className="px-2 py-1">{r.units ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs muted">{t("Ready: {ok} rows. Skipped (no date or amount): {skipped}.", { ok: built.rows.length, skipped: built.skipped })}</p>
          {Object.entries(built.unreadable).map(([col, n]) => (
            <Alert key={col} tone="warning">{t("Column \"{col}\": {n} value(s) are not numbers and were left empty. Check the column choice.", { col: t(COLS.find((c) => c.key === col)?.label ?? col), n: n ?? 0 })}</Alert>
          ))}
          {tooMany && <Alert tone="warning">{t("At most 20 000 rows can be saved. Group the data by day or month and upload again.")}</Alert>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("Name")}><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
            <Field label={t("Currency")}><Select value={currency} onChange={(e) => setCurrency(e.target.value)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} /></Field>
          </div>
          {save.error && <ErrorAlert error={save.error} />}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFile(null)}>{t("Cancel")}</Button>
            <Button loading={save.isPending} disabled={!built.rows.length || tooMany || !name.trim()} onClick={() => save.mutate(built.rows)}>{t("Save and analyse")}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ manual entry
type ManualRow = { month: string; revenue: string; cost: string; expenses: string };
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const blankRow = (): ManualRow => ({ month: thisMonth(), revenue: "", cost: "", expenses: "" });
const isMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

function ManualEntry({ onDone }: { onDone: (id: string) => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<ManualRow[]>([blankRow()]);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("UZS");
  const save = useMutation({
    mutationFn: () => post<{ dataset: { id: string } }>("/business/datasets", {
      name: name.trim() || t("My business"), source: "manual", currency,
      rows: rows.filter((r) => isMonth(r.month) && r.revenue !== "" && Number.isFinite(Number(r.revenue))).map((r) => ({
        date: r.month, revenue: Number(r.revenue), cost: r.cost === "" ? null : Number(r.cost), expenses: r.expenses === "" ? null : Number(r.expenses),
      })),
    }),
    onSuccess: (d) => { setRows([blankRow()]); onDone(d.dataset.id); },
  });
  const set = (i: number, k: keyof ManualRow, v: string) => setRows((s) => s.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const valid = rows.some((r) => isMonth(r.month) && r.revenue !== "" && Number.isFinite(Number(r.revenue)));
  return (
    <Card className="space-y-4 p-5">
      <h3 className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" />{t("Enter monthly figures by hand")}</h3>
      <div className="space-y-2">
        <div className="hidden grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 text-xs font-medium muted sm:grid">
          <span>{t("Month")}</span><span>{t("Revenue")}</span><span>{t("Cost of goods")}</span><span>{t("Expenses")}</span><span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <Input type="month" value={r.month} onChange={(e) => set(i, "month", e.target.value)} aria-label={t("Month")} />
            <Input type="number" inputMode="decimal" value={r.revenue} onChange={(e) => set(i, "revenue", e.target.value)} placeholder={t("Revenue")} aria-label={t("Revenue")} />
            <Input type="number" inputMode="decimal" value={r.cost} onChange={(e) => set(i, "cost", e.target.value)} placeholder={t("Cost of goods")} aria-label={t("Cost of goods")} />
            <Input type="number" inputMode="decimal" value={r.expenses} onChange={(e) => set(i, "expenses", e.target.value)} placeholder={t("Expenses")} aria-label={t("Expenses")} />
            <Button variant="ghost" aria-label={t("Delete")} onClick={() => setRows((s) => (s.length > 1 ? s.filter((_, j) => j !== i) : s))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setRows((s) => {
          // Browsers without a month picker give free text: only a valid YYYY-MM is continued.
          const last = s.at(-1)?.month ?? "";
          const next = isMonth(last) ? new Date(Date.UTC(+last.slice(0, 4), +last.slice(5, 7), 1)).toISOString().slice(0, 7) : blankRow().month;
          return [...s, { ...blankRow(), month: next }];
        })}>{t("Add month")}</Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("Name")}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("My business")} maxLength={120} /></Field>
        <Field label={t("Currency")}><Select value={currency} onChange={(e) => setCurrency(e.target.value)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} /></Field>
      </div>
      {save.error && <ErrorAlert error={save.error} />}
      <div className="flex justify-end"><Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>{t("Save and analyse")}</Button></div>
    </Card>
  );
}

// ------------------------------------------------------------------ overview
function Overview({ id }: { id: string }) {
  const { t } = useI18n();
  const msg = useMsg();
  const ch = useChartTheme();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["business", id], queryFn: () => get<{ dataset: DatasetSummary; analysis: Analysis }>(`/business/datasets/${id}`) });
  if (q.isLoading) return <div className="flex items-center gap-3 p-6 text-sm muted"><Spinner />{t("Analysing your data…")}</div>;
  if (q.error) return <ErrorAlert error={q.error} />;
  const { dataset: ds, analysis: a } = q.data!;
  const money = (v: number) => fmtAmount(v, ds.currency);
  // One row per month: a forecast for an unfinished month is merged into that month's row.
  const byMonth = new Map<string, { month: string; revenue?: number; netProfit?: number | null; forecast?: number; range?: [number, number] }>();
  for (const m of a.monthly) byMonth.set(m.month, { month: m.month, revenue: m.revenue, netProfit: m.netProfit });
  if (a.forecast.status === "ok") for (const f of a.forecast.months) byMonth.set(f.month, { ...byMonth.get(f.month), month: f.month, forecast: f.revenue, range: [f.lower, f.upper] });
  const chart = [...byMonth.values()].sort((x, y) => x.month.localeCompare(y.month));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm muted">{ds.name} · {fmtDate(a.period.start)} — {fmtDate(a.period.end)} · {t("{n} rows", { n: a.rows })}</p>
        <Button size="sm" variant="secondary" icon={<Bot className="h-4 w-4" />} onClick={() => navigate(`/advisor?q=${encodeURIComponent(t("Look at my sales data: what are my main risks and what should I do in the next month?"))}`)}>{t("Ask the advisor")}</Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Briefcase className="h-4 w-4" />} label={t("Revenue")} value={fmtCompact(a.totals.revenue)} hint={ds.currency} />
        <StatCard icon={<Briefcase className="h-4 w-4" />} label={t("Gross profit")} value={a.totals.grossProfit !== null ? fmtCompact(a.totals.grossProfit) : "—"} hint={a.totals.grossMarginPct !== null ? t("Margin {pct}%", { pct: a.totals.grossMarginPct }) : t("Add cost of goods to see it")} tone="cyan" />
        <StatCard icon={<Briefcase className="h-4 w-4" />} label={t("Net profit")} value={a.totals.netProfit !== null ? fmtCompact(a.totals.netProfit) : "—"} hint={a.totals.netMarginPct !== null ? t("Margin {pct}%", { pct: a.totals.netMarginPct }) : t("Add costs or expenses to see it")} tone="emerald" />
        <StatCard icon={<Briefcase className="h-4 w-4" />} label={t("Last 3 months vs 3 before")} value={<Pct v={a.growth.last3VsPrev3Pct} />} hint={<>{t("Year over year")}: <Pct v={a.growth.yoyPct} /></>} tone="violet" />
      </div>
      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">{t("Revenue and profit by month")}</h3>
        <div className="h-72">
          <ResponsiveContainer>
            <ComposedChart data={chart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={ch.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: ch.axis, fontSize: 11 }} tickFormatter={(m: string) => `${fmtMonthName(+m.slice(5, 7), true)} ${m.slice(2, 4)}`} minTickGap={12} />
              <YAxis tick={{ fill: ch.axis, fontSize: 11 }} tickFormatter={(v: number) => fmtCompact(v)} width={60} />
              <Tooltip {...ch.tooltip} labelFormatter={(m) => fmtMonth(`${m}-01`)} formatter={(v, n) => [Array.isArray(v) ? `${money(Number(v[0]))} – ${money(Number(v[1]))}` : money(Number(v)), n]} />
              <Legend />
              <Bar dataKey="revenue" name={t("Revenue")} fill="#6366f1" radius={[6, 6, 0, 0]} />
              {(a.hasCost || a.hasExpenses) && <Line dataKey="netProfit" name={t("Net profit")} stroke="#10b981" strokeWidth={2} dot={false} />}
              {a.forecast.status === "ok" && <Area dataKey="range" name={t("Likely range")} fill="#f59e0b" fillOpacity={0.15} stroke="none" />}
              {a.forecast.status === "ok" && <Line dataKey="forecast" name={t("Forecast")} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 4" dot />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {a.monthly.at(-1)?.partial && <p className="text-xs muted">{t("The last month is not complete yet, so it is left out of growth figures and the forecast.")}</p>}
        {a.forecast.status === "ok" ? (
          <p className="text-sm">
            {t("Forecast for the next 3 months")}: <b>{money(a.forecast.totalNext3)}</b> (<Pct v={a.forecast.changePct} /> {t("vs the last 3 months")}) ·{" "}
            <span className="muted">{t("Back-test error {pct}%", { pct: fmtNumber(a.forecast.smapePct, 1) })} · {t(a.forecast.confidence === "high" ? "High confidence" : a.forecast.confidence === "medium" ? "Medium confidence" : "Low confidence")}</span>
          </p>
        ) : <p className="text-sm muted">{msg(a.forecast.reason)}</p>}
      </Card>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h3 className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-500" />{t("Risks")}</h3>
          {a.risks.length ? <ul className="space-y-2 text-sm">{a.risks.map((r, i) => <li key={i} className="flex gap-2"><span className="text-rose-500">•</span>{msg(r)}</li>)}</ul> : <p className="text-sm muted">{t("No risks found in your data.")}</p>}
        </Card>
        <Card className="space-y-3 p-5">
          <h3 className="flex items-center gap-2 font-semibold"><Lightbulb className="h-4 w-4 text-emerald-500" />{t("Opportunities")}</h3>
          {a.opportunities.length ? <ul className="space-y-2 text-sm">{a.opportunities.map((r, i) => <li key={i} className="flex gap-2"><span className="text-emerald-500">•</span>{msg(r)}</li>)}</ul> : <p className="text-sm muted">{t("Add more months of data to find opportunities.")}</p>}
        </Card>
      </div>
      {a.products.length > 0 && (
        <Card className="space-y-3 p-5">
          <h3 className="font-semibold">{t("Products")}</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr>
                <th className="py-2">{t("Product")}</th><th>{t("Revenue")}</th><th>{t("Share")}</th>{a.hasUnits && <th>{t("Units sold")}</th>}{a.hasCost && <th>{t("Gross margin")}</th>}<th>{t("Last 3 months")}</th>
              </tr></thead>
              <tbody>
                {a.products.map((p) => (
                  <tr key={p.name} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2 font-medium">{p.name}</td><td>{money(p.revenue)}</td><td>{fmtNumber(p.sharePct, 1)}%</td>
                    {a.hasUnits && <td>{p.units !== null ? fmtNumber(p.units) : "—"}</td>}
                    {a.hasCost && <td>{p.grossMarginPct !== null ? `${fmtNumber(p.grossMarginPct, 1)}%` : "—"}</td>}
                    <td><Pct v={p.last3VsPrev3Pct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <SourceNote>{t("All figures are calculated only from your own data. The forecast is a statistical model tested on your past months; it cannot know about future events.")}</SourceNote>
    </div>
  );
}

// ------------------------------------------------------------------ reports
function ReportView({ r }: { r: Report }) {
  const { t } = useI18n();
  const msg = useMsg();
  const c = r.content;
  if (!c) return <Alert tone="error">{t("Corrupted result")}</Alert>;
  const b = c.business;
  return (
    <div className="space-y-4">
      <p className="text-xs muted">{fmtDateTime(r.createdAt)}</p>
      {c.summary && (
        <Card className="space-y-1 border-brand-200 bg-brand-50/50 p-4 dark:border-brand-500/30 dark:bg-brand-500/5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300"><Bot className="h-3.5 w-3.5" />{t("AI summary (based only on the figures below)")}</p>
          <div className="whitespace-pre-line text-sm">{c.summary}</div>
        </Card>
      )}
      {c.summaryError && <p className="text-xs muted">{t("AI summary is unavailable")}: {c.summaryError}</p>}
      {b && (
        <Card className="space-y-2 p-4">
          <h4 className="font-semibold">{t("Your business")} · {b.datasetName}</h4>
          {b.note && <p className="text-xs muted">{msg(b.note)}</p>}
          <p className="text-sm">{fmtDate(b.current.from)} — {fmtDate(b.current.to)}: <b>{fmtAmount(b.current.revenue, b.currency)}</b> {b.previous && <>(<Pct v={b.revenueChangePct} /> {t("vs the previous period")})</>}</p>
          {b.current.netProfit !== null && <p className="text-sm">{t("Net profit")}: <b>{fmtAmount(b.current.netProfit, b.currency)}</b> {b.previous && <>(<Pct v={b.profitChangePct} />)</>}</p>}
          {b.topProducts.length > 0 && <p className="text-sm muted">{t("Top products")}: {b.topProducts.map((p) => `${p.name} (${fmtNumber(p.sharePct, 1)}%)`).join(", ")}</p>}
          {[...b.risks.map((m) => ["risk", m] as const), ...b.opportunities.map((m) => ["opp", m] as const)].map(([k, m], i) => (
            <p key={i} className="flex gap-2 text-sm"><span className={k === "risk" ? "text-rose-500" : "text-emerald-500"}>•</span>{msg(m)}</p>
          ))}
          <p className="text-xs muted">{t("Data up to {date}.", { date: fmtDate(b.dataUntil) })}</p>
        </Card>
      )}
      {c.market && (
        <Card className="space-y-2 p-4">
          <h4 className="font-semibold">{t("Market (Uzbekistan, Google Trends)")}</h4>
          {c.market.rising.length > 0 && <p className="text-sm">{t("Demand is rising")}: {c.market.rising.map((x) => `${t(x.label)} (${fmtPct(x.pct)})`).join(", ")}</p>}
          {c.market.declining.length > 0 && <p className="text-sm">{t("Demand is falling")}: {c.market.declining.map((x) => `${t(x.label)} (${fmtPct(x.pct)})`).join(", ")}</p>}
          {c.market.updates.map((u, i) => <p key={i} className="text-sm muted">• {msg(u)}</p>)}
        </Card>
      )}
      <Card className="space-y-2 p-4">
        <h4 className="font-semibold">{t("Recommendations")}</h4>
        {c.recommendations.map((m, i) => <p key={i} className="flex gap-2 text-sm"><span className="text-brand-500">•</span>{msg(m)}</p>)}
        <p className="text-xs muted">{t("Your activity in the last {n} days: {a} demand analyses, {b} advertisements.", { n: c.activity.days, a: c.activity.analyses, b: c.activity.ads })}</p>
      </Card>
    </div>
  );
}

function Reports() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["reports"], queryFn: () => get<{ items: Omit<Report, "content">[] }>("/business/reports").then((r) => r.items) });
  const current = useQuery({ queryKey: ["reports", open], queryFn: () => get<{ report: Report }>(`/business/reports/${open}`).then((r) => r.report), enabled: Boolean(open) });
  const gen = useMutation({
    mutationFn: (period: "week" | "month") => post<{ report: Report }>("/business/reports", { period }),
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["reports"] }); qc.setQueryData(["reports", d.report.id], d.report); setOpen(d.report.id); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/business/reports/${id}`),
    onSuccess: (_, id) => { qc.invalidateQueries({ queryKey: ["reports"] }); if (open === id) setOpen(null); },
    onError: (e) => toast("error", errorMessage(e)),
  });
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-4">
        <Card className="space-y-3 p-5">
          <h3 className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" />{t("Create a report")}</h3>
          <p className="text-sm muted">{t("A summary of your sales, market changes and recommendations.")}</p>
          <div className="flex gap-2">
            <Button loading={gen.isPending && gen.variables === "week"} disabled={gen.isPending} onClick={() => gen.mutate("week")}>{t("Weekly")}</Button>
            <Button variant="secondary" loading={gen.isPending && gen.variables === "month"} disabled={gen.isPending} onClick={() => gen.mutate("month")}>{t("Monthly")}</Button>
          </div>
          {gen.error && <ErrorAlert error={gen.error} />}
        </Card>
        <Card className="divide-y divide-slate-100 dark:divide-slate-800">
          {(list.data ?? []).length === 0 ? <p className="p-4 text-sm muted">{t("No reports yet.")}</p> : list.data!.map((r) => (
            <div key={r.id} className={cx("flex items-center gap-2 p-3", open === r.id && "bg-slate-50 dark:bg-slate-800/50")}>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(r.id)}>
                <p className="text-sm font-medium">{t(r.title)}</p>
                <p className="text-xs muted">{fmtDateTime(r.createdAt)}</p>
              </button>
              <Button size="sm" variant="ghost" aria-label={t("Delete")} onClick={() => remove.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </Card>
      </div>
      <div className="lg:col-span-2">
        {open ? (current.isLoading ? <Spinner /> : current.data ? <ReportView r={current.data} /> : current.error ? <ErrorAlert error={current.error} /> : null)
          : <EmptyState icon={<FileText className="h-6 w-6" />} title={t("Choose or create a report")} text={t("Weekly and monthly reports are saved here.")} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function Business() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const list = useQuery({ queryKey: ["business"], queryFn: () => get<{ items: DatasetSummary[] }>("/business/datasets").then((r) => r.items) });
  const items = list.data ?? [];
  const selected = params.get("dataset") ?? items[0]?.id ?? null;
  const tab = (params.get("tab") as Tab) || (items.length || list.isLoading ? "overview" : "data");
  const [remove, setRemove] = useState<string | null>(null);
  const go = (p: Record<string, string>) => setParams({ ...(selected ? { dataset: selected } : {}), tab, ...p });
  const delMut = useMutation({
    mutationFn: (id: string) => api(`/business/datasets/${id}`, { method: "DELETE" }),
    onSuccess: () => { setRemove(null); qc.invalidateQueries({ queryKey: ["business"] }); setParams({ tab: "data" }); },
    onError: (e) => toast("error", errorMessage(e)),
  });
  const done = (id: string) => { qc.invalidateQueries({ queryKey: ["business"] }); toast("success", t("Saved")); setParams({ dataset: id, tab: "overview" }); };
  return (
    <div className="space-y-6">
      <PageHeader title={t("My Business")} subtitle={t("Your own sales, costs and profit: analysis, forecast, risks and reports.")} icon={<Briefcase className="h-5 w-5" />} />
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={tab} onChange={(v) => go({ tab: v })} tabs={[{ value: "overview", label: t("Analysis") }, { value: "data", label: t("Data"), count: items.length }, { value: "reports", label: t("Reports") }]} />
        {tab === "overview" && items.length > 1 && (
          <Select value={selected ?? ""} onChange={(e) => go({ dataset: e.target.value })} options={items.map((d) => ({ value: d.id, label: d.name }))} className="w-auto" />
        )}
      </div>
      {list.error && <ErrorAlert error={list.error} />}
      {tab === "overview" && (selected ? <Overview id={selected} /> : !list.isLoading && (
        <EmptyState icon={<FileSpreadsheet className="h-6 w-6" />} title={t("No sales data yet")} text={t("Upload a CSV or Excel file, or enter monthly figures by hand.")} action={<Button onClick={() => go({ tab: "data" })}>{t("Add data")}</Button>} />
      ))}
      {tab === "data" && (
        <div className="space-y-5">
          {items.length > 0 && (
            <Card className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-3 p-4">
                  <FileSpreadsheet className="h-5 w-5 text-brand-500" />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setParams({ dataset: d.id, tab: "overview" })}>
                    <p className="font-medium">{d.name} <Badge className="ml-1">{d.source.toUpperCase()}</Badge></p>
                    <p className="text-xs muted">{t("{n} rows", { n: d.rowCount })} · {d.periodStart && d.periodEnd ? `${fmtDate(d.periodStart)} — ${fmtDate(d.periodEnd)}` : ""} · {d.currency}</p>
                  </button>
                  <Button size="sm" variant="ghost" aria-label={t("Delete")} onClick={() => setRemove(d.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </Card>
          )}
          <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
            <Importer onDone={done} />
            <ManualEntry onDone={done} />
          </div>
        </div>
      )}
      {tab === "reports" && <Reports />}
      <ConfirmDialog open={Boolean(remove)} title={t("Delete this data?")} text={t("The data and its analysis will be removed. This cannot be undone.")} confirmLabel={t("Delete")} loading={delMut.isPending} onConfirm={() => remove && delMut.mutate(remove)} onClose={() => setRemove(null)} />
    </div>
  );
}
