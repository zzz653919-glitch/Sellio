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
export type AheadPoint = { date: string; months: number; value: number; vsNowPct: number | null; vsLastYearPct: number | null };
export type Ahead = { high: AheadPoint; low: AheadPoint; yearPct: number | null; realRise: boolean };
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
  ahead?: Ahead; // missing in analyses saved before it existed
  model: { name: string; smapePct: number; confidence: "high" | "medium" | "low"; holdoutMonths: number };
};
export type CompareItem = { query: string; status: "ok" | "no_data" | "error"; error?: string; seasonality: Seasonality | null; recent: { month: string; value: number }[] };
export type CompareResult = { kind: "compare"; fetchedAt: string; geo: string; geoName: string; items: CompareItem[] };

export const EVENT_LABEL: Record<SeasonEvent, string> = {
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

/** The best and weakest forecast month of the next 12 (computed here for analyses saved before the server sent it). */
export function aheadOf(s: Seasonality): Ahead | null {
  if (s.ahead) return s.ahead;
  if (s.outlook.length === 0 || s.monthly.length < 12) return null;
  const last3 = s.monthly.slice(-3).reduce((a, m) => a + m.value, 0) / 3;
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);
  const point = (k: number): AheadPoint => ({
    date: s.outlook[k].date, months: k, value: s.outlook[k].value, vsNowPct: pct(s.outlook[k].value, last3),
    vsLastYearPct: pct(s.outlook[k].value, s.monthly[s.monthly.length - 12 + k]?.value ?? 0),
  });
  const vals = s.outlook.map((o) => o.value);
  const hi = vals.indexOf(Math.max(...vals)), lo = vals.indexOf(Math.min(...vals));
  const high = point(hi);
  return { high, low: point(lo), yearPct: null, realRise: (high.vsNowPct ?? 0) >= 15 && hi > 0 };
}

export type Verdict = { tone: "up" | "down" | "flat" | "season"; title: string; lines: string[]; advice: string };

/**
 * One clear conclusion from the long-term direction and the forecast together. A product that is
 * falling year after year is never told "it will grow in month X" just because of a seasonal bump:
 * the bump is compared with now and with the same month last year.
 */
export function useVerdict() {
  const { t } = useI18n();
  const list = useMonthList();
  return (s: Seasonality): Verdict => {
    const a = aheadOf(s);
    const abs = (v: number | null | undefined) => `${fmtNumber(Math.abs(v ?? 0))}%`;
    const seasonal = s.level !== "none" && s.peakMonths.length > 0;
    const highMonth = a ? fmtMonth(a.high.date) : "";
    const riseMonth = s.nextRise && s.nextRise.months > 0 ? fmtMonth(s.nextRise.date) : highMonth;
    if (s.direction === "declining") {
      const lines = [t("Over the last 12 months interest fell by {pct} compared with the year before.", { pct: abs(s.yoyPct) })];
      if (a?.realRise) {
        lines.push(a.high.vsLastYearPct !== null && a.high.vsLastYearPct < 0
          ? t("A short seasonal rise is expected in {month} (+{up} versus now), but it will still be {down} lower than in the same month last year.", { month: highMonth, up: abs(a.high.vsNowPct), down: abs(a.high.vsLastYearPct) })
          : t("A short seasonal rise is expected in {month} (+{up} versus now). After it the decline is likely to continue.", { month: highMonth, up: abs(a.high.vsNowPct) }));
      } else if (seasonal) {
        lines.push(t("Searches still go up a little every year in {months}, but each bump is smaller than the year before. No real rise is expected in the next 12 months.", { months: list(s.peakMonths) }));
      } else {
        lines.push(t("No rise is expected in the next 12 months."));
      }
      return { tone: "down", title: t("Demand is falling"), lines, advice: t("Do not buy a large stock. Sell what you have and look at newer alternatives.") };
    }
    if (s.direction === "growing") {
      const lines = [t("Over the last 12 months interest grew by {pct} compared with the year before.", { pct: abs(s.yoyPct) })];
      if (a?.realRise) lines.push(t("The highest interest in the next 12 months is expected in {month} (+{up} versus now).", { month: highMonth, up: abs(a.high.vsNowPct) }));
      return { tone: "up", title: t("Demand is growing"), lines, advice: a?.realRise ? t("Prepare stock and advertising before {month}.", { month: riseMonth }) : t("A good product to keep in stock.") };
    }
    if (seasonal && s.phase === "peak") {
      return {
        tone: "season", title: t("Peak season now"),
        lines: [t("Interest is near its yearly high now. It usually starts to fall in {month}.", { month: s.nextFall ? fmtMonth(s.nextFall.date) : "—" })],
        advice: t("Sell actively now; do not buy a big new stock for after {month}.", { month: s.nextFall ? fmtMonth(s.nextFall.date) : "—" }),
      };
    }
    if (seasonal && a?.realRise) {
      return {
        tone: "season", title: t("Seasonal product: a rise is ahead"),
        lines: [t("Year to year demand is about the same, but it rises every year in {months}. Next high: {month} (+{up} versus now).", { months: list(s.peakMonths), month: highMonth, up: abs(a.high.vsNowPct) })],
        advice: t("Prepare stock and advertising before {month}.", { month: riseMonth }),
      };
    }
    return {
      tone: "flat", title: t("Demand is stable"),
      lines: [t("No big changes are expected in the next 12 months.")],
      advice: t("Keep a steady stock."),
    };
  };
}

/** Background facts about the seasonal pattern (the conclusion itself is in useVerdict). */
export function useSeasonSummary() {
  const { t } = useI18n();
  const list = useMonthList();
  return (s: Seasonality) => {
    const out: string[] = [];
    if (s.level === "none" || s.peakMonths.length === 0) {
      out.push(t("No clear seasonal pattern: interest is similar all year."));
    } else {
      const top = [...s.months].sort((a, b) => b.effectPct - a.effectPct)[0];
      out.push(t("Seasonal pattern ({level}): every year searches are higher than usual in {months}.", { level: t(LEVEL_LABEL[s.level]), months: list(s.peakMonths) }));
      out.push(t("In {month} searches are usually {pct}% above the normal level.", { month: fmtMonthName(top.month), pct: fmtNumber(top.effectPct) }));
      if (s.lowMonths.length) {
        const bottom = [...s.months].sort((a, b) => a.effectPct - b.effectPct)[0];
        out.push(t("The quietest months: {months} ({pct}% below normal).", { months: list(s.lowMonths), pct: fmtNumber(Math.abs(bottom.effectPct)) }));
      }
      if (s.events.length) out.push(t("This matches: {events}.", { events: s.events.map((e) => t(EVENT_LABEL[e])).join(", ") }));
      const years = Math.max(1, Math.round(s.years));
      out.push(t("The pattern repeated in {n} of {total} years.", { n: Math.round(top.consistency * years), total: years }));
    }
    return out;
  };
}

const VERDICT_TONE = {
  up: { box: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-300", Icon: TrendingUp },
  down: { box: "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10", text: "text-rose-700 dark:text-rose-300", Icon: TrendingDown },
  season: { box: "border-brand-200 bg-white dark:border-brand-500/30 dark:bg-slate-900", text: "text-brand-700 dark:text-brand-300", Icon: CalendarClock },
  flat: { box: "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900", text: "text-slate-700 dark:text-slate-200", Icon: Minus },
} as const;

export function VerdictBox({ s }: { s: Seasonality }) {
  const { t } = useI18n();
  const v = useVerdict()(s);
  const tone = VERDICT_TONE[v.tone];
  return (
    <div className={cx("rounded-xl border p-4", tone.box)} data-testid="season-verdict" data-tone={v.tone}>
      <p className={cx("flex items-center gap-2 text-base font-bold", tone.text)}><tone.Icon className="h-5 w-5" />{v.title}</p>
      <div className="mt-1.5 space-y-1 text-sm">{v.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
      <p className="mt-2 text-sm"><b>{t("Advice")}:</b> {v.advice}</p>
    </div>
  );
}

function Pct({ v }: { v: number | null | undefined }) {
  if (v == null) return <b>—</b>;
  return <b className={v > 3 ? "text-emerald-600 dark:text-emerald-400" : v < -3 ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-white"}>{fmtPct(v)}</b>;
}

// ------------------------------------------------------------------ single product
export function SeasonPanel({ s, title }: { s: Seasonality; title: string }) {
  const { t } = useI18n();
  const { resolved } = useTheme();
  const summary = useSeasonSummary()(s);
  const ahead = aheadOf(s);
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
  const tip = { background: resolved === "dark" ? "#0f172a" : "#fff", border: `1px solid ${grid}`, borderRadius: 12, color: resolved === "dark" ? "#e2e8f0" : "#0f172a" };
  const tipItem = { color: resolved === "dark" ? "#e2e8f0" : "#0f172a" };

  return (
    <div className="space-y-5 rounded-2xl border border-brand-200 bg-brand-50/40 p-4 dark:border-brand-500/30 dark:bg-brand-500/5 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400" />{t("Season analysis")} — {title}</h3>
        <Badge tone={s.level === "strong" ? "violet" : s.level === "none" ? "slate" : "cyan"}>{t("Seasonality")}: {t(LEVEL_LABEL[s.level])}</Badge>
      </div>

      <VerdictBox s={s} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="season-tiles">
        <div className="rounded-xl bg-white p-3 text-sm dark:bg-slate-900">
          <p className="mb-1 text-xs font-semibold muted">{t("Last 12 months")}</p>
          <Pct v={s.yoyPct} /><span className="block text-xs muted">{t("versus the 12 months before")}</span>
        </div>
        <div className="rounded-xl bg-white p-3 text-sm dark:bg-slate-900">
          <p className="mb-1 text-xs font-semibold muted">{t("Next 3 months")}</p>
          <Pct v={s.next3Pct} /><span className="block text-xs muted">{t("versus the last 3 months")}</span>
        </div>
        {ahead && ([["Best month ahead", ahead.high, "text-emerald-600 dark:text-emerald-400"], ["Weakest month ahead", ahead.low, "text-rose-600 dark:text-rose-400"]] as const).map(([label, p, color]) => (
          <div key={label} className="rounded-xl bg-white p-3 text-sm dark:bg-slate-900">
            <p className={cx("mb-1 text-xs font-semibold", color)}>{t(label)}</p>
            <b className="text-slate-900 dark:text-white">{fmtMonth(p.date)}</b>
            <span className="block text-xs muted">{t("versus now")}: {fmtPct(p.vsNowPct)}</span>
            {p.vsLastYearPct !== null && <span className="block text-xs muted">{t("versus a year before")}: {fmtPct(p.vsLastYearPct)}</span>}
          </div>
        ))}
      </div>

      <ul className="space-y-1.5 text-sm">
        {summary.map((line, i) => <li key={i} className="flex gap-2"><span className="text-brand-500">•</span><span>{line}</span></li>)}
      </ul>

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
                <Tooltip cursor={{ fill: "rgba(148,163,184,0.14)" }} contentStyle={tip} itemStyle={tipItem} formatter={(v: unknown, _n: unknown, item: { payload?: { consistency: number } }) => [`${fmtPct(Number(v))} · ${t("repeated {pct}% of years", { pct: Math.round((item.payload?.consistency ?? 0) * 100) })}`, t("Effect")]} />
                <Bar dataKey="effect" radius={[4, 4, 0, 0]}>
                  {monthsData.map((m) => (
                    <Cell key={m.month} fill={m.effect >= 0 ? "#10b981" : "#f43f5e"} fillOpacity={m.month === curMonth ? 1 : 0.65} stroke={m.month === curMonth ? (resolved === "dark" ? "#fff" : "#0f172a") : undefined} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs muted">{t("How much each month is usually above (green) or below (red) the normal level, with the long-term rise or fall removed. The highlighted bar is the current month.")}</p>
        </div>
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><TrendingUp className="h-4 w-4" />{t("Next 12 months forecast")}</p>
          <div className="h-56">
            <ResponsiveContainer>
              <ComposedChart data={outlookData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: axis, fontSize: 11 }} tickFormatter={(d: string) => fmtMonthName(Number(d.slice(5, 7)), true)} minTickGap={12} />
                <YAxis domain={[0, 100]} tick={{ fill: axis, fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip contentStyle={tip} labelFormatter={(d) => fmtMonth(String(d))} formatter={(v: unknown, n: unknown) => [Array.isArray(v) ? `${fmtNumber(v[0])}% – ${fmtNumber(v[1])}%` : `${fmtNumber(Number(v), 1)}%`, String(n)]} />
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
            {ok.filter((i) => i.seasonality!.nextRise || i.seasonality!.direction === "declining").slice(0, 5).map((i) => {
              const s = i.seasonality!;
              return s.direction === "declining" ? (
                <li key={i.query}>{t("{product}: demand is falling ({pct} in a year); no real rise is expected.", { product: i.query, pct: fmtPct(s.yoyPct) })}</li>
              ) : (s.phase === "peak" || s.phase === "rising") && s.nextFall ? (
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
                      <td className="px-3 py-2.5">{s.direction === "declining" && !aheadOf(s)?.realRise ? <span className="text-xs muted">{t("no real rise")}</span> : <When p={s.nextRise} />}</td>
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
                <YAxis domain={[0, 100]} tick={{ fill: axis, fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip contentStyle={{ background: resolved === "dark" ? "#0f172a" : "#fff", border: `1px solid ${grid}`, borderRadius: 12 }} labelFormatter={(m) => fmtMonth(`${m}-01`)} formatter={(v: unknown, n: unknown) => [`${fmtNumber(Number(v), 1)}%`, String(n)]} />
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
