import { CalendarClock, CalendarRange, GraduationCap, Minus, Plus, Sparkles, Trash2, TrendingDown, TrendingUp, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Button, Field, Input, Select, cx } from "../components/ui";
import { fmtMonth, fmtMonthName, fmtNumber, fmtPct } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/theme";

// ------------------------------------------------------------------ types (mirror the API)
export type SeasonEvent = "school" | "new_year" | "navruz_march8" | "valentine" | "summer" | "winter" | "black_friday" | "autumn" | "spring";
export type SeasonPoint = { date: string; months: number };
export type Seasonality = {
  method: string; years: number; monthsOfData: number;
  monthly: { month: string; value: number }[]; trendLine: { month: string; value: number }[];
  strength: number; level: "strong" | "moderate" | "weak" | "none";
  months: { month: number; effectPct: number; consistency: number }[];
  peakMonths: number[]; lowMonths: number[]; events: SeasonEvent[];
  phase: "rising" | "peak" | "falling" | "low" | "normal";
  nextRise: SeasonPoint | null; nextPeak: SeasonPoint | null; nextFall: SeasonPoint | null; nextLow: SeasonPoint | null;
  yoyPct: number | null; direction: "growing" | "declining" | "stable";
  outlook: { date: string; value: number; lower: number; upper: number }[];
  next3Pct: number | null;
  model: { name: string; smapePct: number; confidence: "high" | "medium" | "low"; holdoutMonths: number };
};
export type CompareItem = { query: string; status: "ok" | "no_data" | "error"; error?: string; seasonality: Seasonality | null; recent: { month: string; value: number }[] };
export type CompareResult = { kind: "compare"; fetchedAt: string; geo: string; geoName: string; items: CompareItem[] };

const EVENT_LABEL: Record<SeasonEvent, string> = {
  school: "back to school (1 September)",
  new_year: "New Year",
  navruz_march8: "Navruz and 8 March",
  valentine: "14 February",
  black_friday: "Black Friday and 11.11 sales",
  summer: "summer",
  winter: "winter",
  spring: "spring",
  autumn: "autumn",
};
const LEVEL_LABEL = { strong: "strong", moderate: "moderate", weak: "weak", none: "none" } as const;
const PHASE_LABEL = {
  rising: "Now: demand is starting to rise.",
  peak: "Now: peak season.",
  falling: "Now: demand is going down after the season.",
  low: "Now: low season.",
  normal: "Now: an ordinary period.",
} as const;
const COLORS = ["#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ec4899"];

/** "avgust, sentabr" — consecutive months stay in calendar order. */
function useMonthList() {
  return (months: number[]) => months.map((m) => fmtMonthName(m)).join(", ");
}

function When({ p }: { p: SeasonPoint | null }) {
  const { t } = useI18n();
  if (!p) return <span className="muted">—</span>;
  return (
    <span>
      <b className="text-slate-900 dark:text-white">{fmtMonth(p.date)}</b>
      <span className="block text-xs muted">{p.months === 0 ? t("this month") : t("in {n} months", { n: p.months })}</span>
    </span>
  );
}

/** Plain-language conclusions computed from the numbers (no paid AI service involved). */
export function useSeasonSummary() {
  const { t } = useI18n();
  const list = useMonthList();
  return (s: Seasonality) => {
    const out: string[] = [];
    if (s.level === "none" || s.peakMonths.length === 0) {
      out.push(t("No clear seasonal pattern: interest is similar all year."));
    } else {
      const top = [...s.months].sort((a, b) => b.effectPct - a.effectPct)[0];
      out.push(t("Demand is seasonal ({level}): it rises every year in {months}.", { level: t(LEVEL_LABEL[s.level]), months: list(s.peakMonths) }));
      out.push(t("In {month} interest is {pct}% above the yearly average.", { month: fmtMonthName(top.month), pct: fmtNumber(top.effectPct) }));
      if (s.lowMonths.length) {
        const bottom = [...s.months].sort((a, b) => a.effectPct - b.effectPct)[0];
        out.push(t("The quietest months: {months} ({pct}% below average).", { months: list(s.lowMonths), pct: fmtNumber(Math.abs(bottom.effectPct)) }));
      }
      if (s.events.length) out.push(t("This matches: {events}.", { events: s.events.map((e) => t(EVENT_LABEL[e])).join(", ") }));
      const years = Math.max(1, Math.round(s.years));
      out.push(t("The pattern repeated in {n} of {total} years.", { n: Math.round(top.consistency * years), total: years }));
    }
    if (s.yoyPct !== null) {
      out.push(t(
        s.direction === "growing" ? "Over the last 12 months interest is {pct} versus the year before: demand is growing."
          : s.direction === "declining" ? "Over the last 12 months interest is {pct} versus the year before: demand is falling."
          : "Over the last 12 months demand is about the same as a year before ({pct}).",
        { pct: fmtPct(s.yoyPct) },
      ));
    }
    if (s.next3Pct !== null) out.push(t("Expected over the next 3 months: {pct} versus the last 3 months.", { pct: fmtPct(s.next3Pct) }));
    return out;
  };
}

// ------------------------------------------------------------------ single product
export function SeasonPanel({ s, title }: { s: Seasonality; title: string }) {
  const { t } = useI18n();
  const { resolved } = useTheme();
  const summary = useSeasonSummary()(s);
  const grid = resolved === "dark" ? "#1e293b" : "#e2e8f0";
  const axis = resolved === "dark" ? "#94a3b8" : "#64748b";
  const curMonth = new Date().getMonth() + 1;
  const monthsData = s.months.map((m) => ({ name: fmtMonthName(m.month, true), month: m.month, effect: m.effectPct, consistency: m.consistency }));
  const outlookData = useMemo(() => {
    const hist = s.monthly.slice(-24).map((m) => ({ date: `${m.month}-01`, actual: m.value }));
    const last = hist[hist.length - 1];
    const fc = s.outlook.map((o) => ({ date: o.date, forecast: o.value, band: [o.lower, o.upper] as [number, number] }));
    return last ? [...hist.slice(0, -1), { ...last, forecast: last.actual, band: [last.actual, last.actual] as [number, number] }, ...fc] : fc;
  }, [s]);
  const tip = { background: resolved === "dark" ? "#0f172a" : "#fff", border: `1px solid ${grid}`, borderRadius: 12 };

  return (
    <div className="space-y-5 rounded-2xl border border-brand-200 bg-brand-50/40 p-4 dark:border-brand-500/30 dark:bg-brand-500/5 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400" />{t("Season analysis")} — {title}</h3>
        <Badge tone={s.level === "strong" ? "violet" : s.level === "none" ? "slate" : "cyan"}>{t("Seasonality")}: {t(LEVEL_LABEL[s.level])}</Badge>
      </div>

      <ul className="space-y-1.5 text-sm">
        <li className="font-semibold">{t(PHASE_LABEL[s.phase])}</li>
        {summary.map((line, i) => <li key={i} className="flex gap-2"><span className="text-brand-500">•</span><span>{line}</span></li>)}
      </ul>

      {s.level !== "none" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {([
            ["Rise starts", s.nextRise, TrendingUp, "text-emerald-600 dark:text-emerald-400"],
            ["Peak", s.nextPeak, CalendarClock, "text-brand-600 dark:text-brand-400"],
            ["Decline starts", s.nextFall, TrendingDown, "text-rose-600 dark:text-rose-400"],
            ["Lowest", s.nextLow, Minus, "text-slate-500"],
          ] as const).map(([label, p, Icon, color]) => (
            <div key={label} className="rounded-xl bg-white p-3 text-sm dark:bg-slate-900">
              <p className={cx("mb-1 flex items-center gap-1.5 text-xs font-semibold", color)}><Icon className="h-3.5 w-3.5" />{t(label)}</p>
              <When p={p} />
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><CalendarRange className="h-4 w-4" />{t("Typical year: effect of each month")}</p>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={monthsData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: axis, fontSize: 10 }} interval={0} angle={-40} textAnchor="end" height={42} />
                <YAxis tick={{ fill: axis, fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                <ReferenceLine y={0} stroke={axis} />
                <Tooltip contentStyle={tip} formatter={(v: unknown, _n: unknown, item: { payload?: { consistency: number } }) => [`${fmtPct(Number(v))} · ${t("repeated {pct}% of years", { pct: Math.round((item.payload?.consistency ?? 0) * 100) })}`, t("Effect")]} />
                <Bar dataKey="effect" radius={[4, 4, 0, 0]}>
                  {monthsData.map((m) => (
                    <Cell key={m.month} fill={m.effect >= 0 ? "#10b981" : "#f43f5e"} fillOpacity={m.month === curMonth ? 1 : 0.65} stroke={m.month === curMonth ? (resolved === "dark" ? "#fff" : "#0f172a") : undefined} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs muted">{t("Green: above the yearly average, red: below. The highlighted bar is the current month.")}</p>
        </div>
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><TrendingUp className="h-4 w-4" />{t("Next 12 months forecast")}</p>
          <div className="h-56">
            <ResponsiveContainer>
              <ComposedChart data={outlookData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: axis, fontSize: 11 }} tickFormatter={(d: string) => fmtMonthName(Number(d.slice(5, 7)), true)} minTickGap={12} />
                <YAxis domain={[0, 100]} tick={{ fill: axis, fontSize: 11 }} />
                <Tooltip contentStyle={tip} labelFormatter={(d) => fmtMonth(String(d))} formatter={(v: unknown, n: unknown) => [Array.isArray(v) ? `${fmtNumber(v[0])} – ${fmtNumber(v[1])}` : fmtNumber(Number(v), 1), String(n)]} />
                <Legend />
                <Area dataKey="band" name={t("80% prediction interval")} fill="#6366f1" fillOpacity={0.15} stroke="none" />
                <Line dataKey="actual" name={t("Actual")} stroke="#0ea5e9" strokeWidth={2} dot={false} />
                <Line dataKey="forecast" name={t("forecast")} stroke="#6366f1" strokeWidth={2} strokeDasharray="6 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <p className="text-xs muted">
        {t("Method: STL decomposition of {years} years of Google Trends data; forecast model chosen by a {n}-month back-test: {model} (error {err}%, confidence {conf}). Computed by Vendora itself, free of charge.", {
          years: fmtNumber(s.years, 1), n: s.model.holdoutMonths, model: t(s.model.name), err: fmtNumber(s.model.smapePct, 1), conf: t(s.model.confidence),
        })}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ compare
export function CompareForm({ countries, disabled, loading, onRun }: {
  countries: { code: string; name: string }[]; disabled: boolean; loading: boolean; onRun: (queries: string[], geo: string) => void;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<string[]>(["", ""]);
  const [geo, setGeo] = useState("UZ");
  const filled = items.map((q) => q.trim()).filter((q) => q.length >= 2);
  return (
    <div className="space-y-3">
      <p className="text-sm muted">{t("Enter 2–5 products. Vendora checks 5 years of Google search data for each and shows which demand is growing, which is falling, and in which months.")}</p>
      {items.map((q, i) => (
        <div key={i} className="flex gap-2">
          <Input value={q} onChange={(e) => setItems((s) => s.map((x, k) => (k === i ? e.target.value : x)))} placeholder={[t("e.g. school backpack"), t("e.g. air fryer"), "iPhone 16", "protein", "kurtka"][i]} aria-label={`${t("Product")} ${i + 1}`} />
          {items.length > 2 && (
            <button type="button" onClick={() => setItems((s) => s.filter((_, k) => k !== i))} className="rounded-lg p-2 text-slate-400 hover:text-rose-600" aria-label={t("Remove")}><X className="h-4 w-4" /></button>
          )}
        </div>
      ))}
      {items.length < 5 && (
        <Button type="button" size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setItems((s) => [...s, ""])}>{t("Add product")}</Button>
      )}
      <Field label={t("Area")}>
        <Select value={geo} onChange={(e) => setGeo(e.target.value)} options={[{ value: "WORLD", label: t("Worldwide") }, ...countries.map((c) => ({ value: c.code, label: t(c.name) }))]} />
      </Field>
      <Button size="lg" className="w-full" loading={loading} disabled={disabled || filled.length < 2} onClick={() => onRun(filled, geo)} icon={<Sparkles className="h-4 w-4" />}>{t("Compare products")}</Button>
    </div>
  );
}

export function CompareView({ r, onDelete }: { r: CompareResult; onDelete: () => void }) {
  const { t } = useI18n();
  const { resolved } = useTheme();
  const list = useMonthList();
  const [open, setOpen] = useState<string | null>(r.items.find((i) => i.seasonality)?.query ?? null);
  const ok = r.items.filter((i) => i.seasonality);
  const rising = ok.filter((i) => (i.seasonality!.next3Pct ?? 0) > 5);
  const falling = ok.filter((i) => (i.seasonality!.next3Pct ?? 0) < -5 || i.seasonality!.direction === "declining");
  const grid = resolved === "dark" ? "#1e293b" : "#e2e8f0";
  const axis = resolved === "dark" ? "#94a3b8" : "#64748b";
  const chart = useMemo(() => {
    const rows = new Map<string, Record<string, number | string>>();
    ok.forEach((i) => i.recent.forEach((p) => { const row = rows.get(p.month) ?? { month: p.month }; row[i.query] = p.value; rows.set(p.month, row); }));
    return [...rows.values()].sort((a, b) => String(a.month).localeCompare(String(b.month)));
  }, [ok]);
  const selected = r.items.find((i) => i.query === open)?.seasonality;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4 text-sm dark:border-brand-500/30 dark:bg-brand-500/5">
        <p className="mb-1 flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400" />{t("Conclusion")} — {t(r.geoName)}</p>
        {ok.length === 0 ? <p>{t("Google has too little search data for these products here.")}</p> : (
          <ul className="space-y-1">
            {rising.length > 0 && <li>{t("Growing in the next 3 months: {items}.", { items: rising.map((i) => `${i.query} (${fmtPct(i.seasonality!.next3Pct)})`).join(", ") })}</li>}
            {falling.length > 0 && <li>{t("Falling: {items}.", { items: falling.map((i) => `${i.query} (${fmtPct(i.seasonality!.next3Pct)})`).join(", ") })}</li>}
            {rising.length === 0 && falling.length === 0 && <li>{t("No big changes expected in the next 3 months.")}</li>}
            {ok.filter((i) => i.seasonality!.nextRise).slice(0, 4).map((i) => {
              const s = i.seasonality!;
              return (s.phase === "peak" || s.phase === "rising") && s.nextFall ? (
                <li key={i.query}>{t("{product}: the season is on now; demand starts to fall in {month}.", { product: i.query, month: fmtMonth(s.nextFall.date) })}</li>
              ) : (
                <li key={i.query}>{t("{product}: next season starts in {month} (in {n} months).", { product: i.query, month: fmtMonth(s.nextRise!.date), n: s.nextRise!.months })}</li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-xs muted dark:bg-slate-900">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">{t("Product")}</th>
              <th className="px-3 py-2 font-medium">{t("Next 3 months")}</th>
              <th className="px-3 py-2 font-medium">{t("Last 12 months")}</th>
              <th className="px-3 py-2 font-medium">{t("Season")}</th>
              <th className="px-3 py-2 font-medium">{t("Next rise")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {r.items.map((i, k) => {
              const s = i.seasonality;
              const pct = s?.next3Pct ?? null;
              return (
                <tr key={i.query} onClick={() => s && setOpen(i.query)} className={cx(s && "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900", open === i.query && "bg-brand-50/60 dark:bg-brand-500/10")}>
                  <td className="px-3 py-2.5 muted">{k + 1}</td>
                  <td className="px-3 py-2.5 font-semibold"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[k % COLORS.length] }} />{i.query}</td>
                  {!s ? (
                    <td colSpan={4} className="px-3 py-2.5 muted">{i.status === "error" ? `${t("Data could not be loaded")}: ${i.error}` : t("Too little search data for this product here.")}</td>
                  ) : (
                    <>
                      <td className={cx("px-3 py-2.5 font-bold", pct !== null && pct > 5 ? "text-emerald-600 dark:text-emerald-400" : pct !== null && pct < -5 ? "text-rose-600 dark:text-rose-400" : "")}>
                        <span className="inline-flex items-center gap-1">{pct !== null && pct > 5 ? <TrendingUp className="h-4 w-4" /> : pct !== null && pct < -5 ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}{fmtPct(pct)}</span>
                      </td>
                      <td className="px-3 py-2.5">{fmtPct(s.yoyPct)} <span className="text-xs muted">· {t(s.direction === "growing" ? "growing" : s.direction === "declining" ? "falling" : "stable")}</span></td>
                      <td className="px-3 py-2.5">{s.peakMonths.length ? list(s.peakMonths) : <span className="muted">{t("no clear season")}</span>}
                        {s.events.includes("school") && <GraduationCap className="ml-1 inline h-3.5 w-3.5 text-brand-500" aria-label={t(EVENT_LABEL.school)} />}
                      </td>
                      <td className="px-3 py-2.5"><When p={s.nextRise} /></td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {chart.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold">{t("Last 24 months of search interest")}</p>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: axis, fontSize: 11 }} tickFormatter={(m: string) => `${fmtMonthName(Number(m.slice(5, 7)), true)} ${m.slice(2, 4)}`} minTickGap={16} />
                <YAxis domain={[0, 100]} tick={{ fill: axis, fontSize: 11 }} />
                <Tooltip contentStyle={{ background: resolved === "dark" ? "#0f172a" : "#fff", border: `1px solid ${grid}`, borderRadius: 12 }} labelFormatter={(m) => fmtMonth(`${m}-01`)} />
                <Legend />
                {r.items.map((i, k) => i.seasonality && <Line key={i.query} dataKey={i.query} stroke={COLORS[k % COLORS.length]} strokeWidth={2} dot={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs muted">{t("Each line is scaled to its own peak (100), so compare directions and seasons, not heights.")}</p>
        </div>
      )}

      {selected && open && <SeasonPanel s={selected} title={open} />}

      <div className="flex justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
        <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={onDelete}>{t("Delete")}</Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ top demand now
export type TopItem = {
  query: string; label: string; nowVsAvgPct: number; phase: Seasonality["phase"] | null; next3Pct: number | null;
  yoyPct: number | null; peakMonths: number[]; events: SeasonEvent[]; recent: { month: string; value: number }[];
};
export type TopDemandData = { configured: true; geo: string; computedAt: string; checked: number; items: TopItem[]; top: TopItem[] } | { configured: false };

const PHASE_SHORT = { rising: "rising now", peak: "peak season", falling: "after the season", low: "low season", normal: "ordinary period" } as const;

export function TopDemand({ data, loading, onAnalyse }: { data: TopDemandData | undefined; loading: boolean; onAnalyse: (query: string) => void }) {
  const { t } = useI18n();
  const list = useMonthList();
  if (loading) {
    return (
      <div className="space-y-3">
        <p className="text-sm muted">{t("Checking the most searched products on Google…")}</p>
        {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />)}
      </div>
    );
  }
  if (!data || !data.configured || data.top.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><TrendingUp className="h-4 w-4 text-emerald-500" />{t("Top 3 products in demand right now")} · {t("Uzbekistan")}</h3>
        <span className="text-xs muted">{t("Updated")}: {fmtMonth(data.computedAt.slice(0, 10))}</span>
      </div>
      {data.top.map((it, k) => (
        <div key={it.query} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800 sm:flex-row sm:items-center">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-lg font-bold text-white">{k + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t(it.label)} <span className="text-xs font-normal muted">«{it.query}»</span></p>
            <p className="text-sm">
              <b className="text-emerald-600 dark:text-emerald-400">{t("{pct} above its usual level", { pct: fmtPct(it.nowVsAvgPct) })}</b>
              {it.phase && <span className="muted"> · {t(PHASE_SHORT[it.phase])}</span>}
            </p>
            <p className="text-xs muted">
              {it.peakMonths.length > 0 && <>{t("Season")}: {list(it.peakMonths)}</>}
              {it.next3Pct !== null && <> · {t("Next 3 months")}: {fmtPct(it.next3Pct)}</>}
              {it.events.includes("school") && <GraduationCap className="ml-1 inline h-3.5 w-3.5 text-brand-500" />}
            </p>
          </div>
          {it.recent.length > 2 && (
            <div className="h-10 w-full sm:w-28" aria-hidden>
              <ResponsiveContainer>
                <LineChart data={it.recent}><Line dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <Button size="sm" variant="secondary" onClick={() => onAnalyse(it.query)}>{t("Detailed analysis")}</Button>
        </div>
      ))}
      <p className="text-xs muted">{t("Vendora watches {n} popular products on Google Trends and shows the ones searched most above their usual level now. Refreshed weekly.", { n: data.checked })}</p>
    </div>
  );
}
