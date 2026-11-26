import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDownRight, ArrowUpRight, CalendarDays, Globe2, Lightbulb, LineChart as LineIcon, MapPin, Radar as RadarIcon,
  Search, Ship, TrendingDown, TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SourceNote, useChartTheme } from "../components/charts";
import { ErrorAlert, IntegrationNotice } from "../components/shared";
import { Alert, Button, Card, Input, PageHeader, Spinner, Tabs, cx } from "../components/ui";
import { ApiError, get, post } from "../lib/api";
import { fmtCompact, fmtDate, fmtMonthName, fmtNumber, fmtPct } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useMsg, type Msg } from "../lib/msg";

// ------------------------------------------------------------------ API types
type MonthEffect = { month: number; effectPct: number; consistency: number };
type RadarItem = {
  query: string; label: string; category?: string; nowVsAvgPct: number; phase: string | null; next3Pct: number | null; yoyPct: number | null;
  peakMonths: number[]; months?: MonthEffect[]; nextRise?: { date: string; months: number } | null; confidence?: "high" | "medium" | "low" | null;
  recent: { month: string; value: number }[];
};
type RadarData =
  | { configured: false }
  | { configured: true; computedAt: string; checked: number; items: RadarItem[]; rising: RadarItem[]; declining: RadarItem[]; upcoming: RadarItem[]; updates: { query: string; label: string; kind: string; msg: Msg }[] };
type Options = {
  sources: { trends: boolean; worldBank: boolean; comtrade: boolean; llm: boolean };
  countries: { code: string; name: string }[];
  tradeCountries: string[];
  indicators: { key: string; label: string; unit: string }[];
};
type YearValue = { year: number; value: number };
type Indicator = { key: string; label: string; unit: string; latest: YearValue | null; change5y: number | null; series: YearValue[] };
type CountryStats = { country: string; name: string; indicators: Indicator[] };
type TradeFlow = { flow: "import" | "export"; year: number | null; totalUsd: number; groups: { code: string; name: string; valueUsd: number; sharePct: number }[] };

type Tab = "top" | "radar" | "uzbekistan" | "seasons";

const useOptions = () => useQuery({ queryKey: ["intel-options"], queryFn: () => get<Options>("/intel/options"), staleTime: 600_000 });
const useRadar = () => useQuery({ queryKey: ["intel-radar"], queryFn: () => get<RadarData>("/intel/radar"), staleTime: 3600_000, retry: false });

function fmtIndicator(unit: string, v: number) {
  if (unit === "usd") return `$${fmtCompact(v)}`;
  if (unit === "count") return fmtCompact(v);
  return `${fmtNumber(v, 1)}%`;
}
function fmtChange(unit: string, v: number | null, t: (k: string, vars?: Record<string, string | number>) => string) {
  if (v === null) return null;
  return unit === "usd" || unit === "count" ? t("{pct} in 5 years", { pct: fmtPct(v) }) : t("{pp} p.p. in 5 years", { pp: `${v > 0 ? "+" : ""}${fmtNumber(v, 1)}` });
}

function Pct({ v, className }: { v: number | null; className?: string }) {
  if (v === null) return <span className="muted">—</span>;
  return <b className={cx(v > 3 ? "text-emerald-600 dark:text-emerald-400" : v < -3 ? "text-rose-600 dark:text-rose-400" : "", className)}>{fmtPct(v)}</b>;
}

function Sparkline({ data, color = "#6366f1" }: { data: { value: number }[]; color?: string }) {
  if (data.length < 3) return null;
  return (
    <div className="h-10 w-24 flex-none" aria-hidden>
      <ResponsiveContainer><LineChart data={data}><Line dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} /></LineChart></ResponsiveContainer>
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return <div className="flex items-center gap-3 p-6 text-sm muted"><Spinner />{text}</div>;
}

// ------------------------------------------------------------------ Radar
function RadarList({ title, icon, items, value, empty }: { title: string; icon: React.ReactNode; items: RadarItem[]; value: (i: RadarItem) => number | null; empty: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <Card className="space-y-3 p-5">
      <h3 className="flex items-center gap-2 font-semibold">{icon}{title}</h3>
      {items.length === 0 ? <p className="text-sm muted">{empty}</p> : items.slice(0, 6).map((i) => (
        <div key={i.query} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{t(i.label)} <span className="font-normal muted">«{i.query}»</span></p>
            <p className="text-xs muted">
              {t("Now vs yearly average")}: <Pct v={i.nowVsAvgPct} /> · {t("Next 3 months")}: <Pct v={i.next3Pct} />
            </p>
          </div>
          <Sparkline data={i.recent} color={(value(i) ?? 0) >= 0 ? "#10b981" : "#f43f5e"} />
          <Button size="sm" variant="ghost" onClick={() => navigate(`/forecast?q=${encodeURIComponent(i.query)}`)} aria-label={t("Detailed analysis")}><LineIcon className="h-4 w-4" /></Button>
        </div>
      ))}
    </Card>
  );
}

// ------------------------------------------------------------------ Top products for a period
type TopPeriod = "week" | "month" | "quarter" | "year";
type TopItem = { query: string; label: string; category?: string; index: number; changePct: number | null; series: number[] };
type TopData =
  | { configured: false }
  | { configured: true; period: TopPeriod; computedAt: string; from: string | null; to: string | null; comparable: boolean; mostWanted: TopItem[]; fastestGrowing: TopItem[]; declining: TopItem[] };
const PERIOD_LABEL: Record<TopPeriod, string> = { week: "1 week", month: "1 month", quarter: "3 months", year: "1 year" };
const PREV_LABEL: Record<TopPeriod, string> = { week: "vs the week before", month: "vs the month before", quarter: "vs the 3 months before", year: "vs the year before" };

/** A tiny line of the period (no axes). */
function Spark({ values, tone }: { values: number[]; tone: "up" | "down" | "flat" }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values), w = 72, h = 22;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * (h - 2) - 1}`).join(" ");
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-none" aria-hidden><polyline points={pts} fill="none" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" stroke={tone === "up" ? "#10b981" : tone === "down" ? "#f43f5e" : "#94a3b8"} /></svg>;
}

function TopTab() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<TopPeriod>("week");
  const q = useQuery({ queryKey: ["intel-top", period], queryFn: () => get<TopData>(`/intel/top?period=${period}`), staleTime: 3600_000, retry: false });
  const d = q.data;
  const row = (i: TopItem, k: number, mode: "index" | "change") => (
    <li key={i.query}>
      <button type="button" onClick={() => navigate(`/forecast?q=${encodeURIComponent(i.query)}`)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-[var(--v-glass-2)]" title={t("Detailed analysis")}>
        <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-[var(--v-sky-soft)] text-xs font-extrabold text-[var(--v-sky)]">{k + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{t(i.label)}</span>
          {mode === "index"
            ? <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--v-track)]"><span className="block h-full rounded-full bg-[var(--v-sky)]" style={{ width: `${Math.max(3, i.index)}%` }} /></span>
            : <span className="text-[11px] muted">«{i.query}»</span>}
        </span>
        <Spark values={i.series} tone={(i.changePct ?? 0) > 3 ? "up" : (i.changePct ?? 0) < -3 ? "down" : "flat"} />
        <span className="w-16 flex-none text-right text-sm font-bold">{mode === "index" ? i.index : <Pct v={i.changePct} />}</span>
      </button>
    </li>
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={period} onChange={setPeriod} tabs={(["week", "month", "quarter", "year"] as const).map((p) => ({ value: p, label: t(PERIOD_LABEL[p]) }))} />
        {d?.configured && d.from && d.to && <span className="text-sm muted">{fmtDate(d.from)} — {fmtDate(d.to)}</span>}
      </div>
      {q.isLoading ? <Loading text={t("Comparing the products on Google…")} /> : q.error ? <ErrorAlert error={q.error} /> : !d || !d.configured ? <IntegrationNotice service="trends" /> : (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card className="space-y-2 p-5 lg:col-span-1">
              <h3 className="flex items-center gap-2 font-semibold"><Lightbulb className="h-4 w-4 text-amber-500" />{t("Most wanted")}</h3>
              <p className="text-xs muted">{d.comparable ? t("100 = the most searched product in this period; the others in comparison.") : t("Each product is measured on its own scale here, so only the change is comparable.")}</p>
              <ol className="space-y-0.5">{d.mostWanted.slice(0, 10).map((i, k) => row(i, k, "index"))}</ol>
            </Card>
            <Card className="space-y-2 p-5">
              <h3 className="flex items-center gap-2 font-semibold"><TrendingUp className="h-4 w-4 text-emerald-500" />{t("Growing fastest")}</h3>
              <p className="text-xs muted">{t(PREV_LABEL[period])}</p>
              {d.fastestGrowing.length === 0 ? <p className="text-sm muted">{t("No product grew in this period.")}</p> : <ol className="space-y-0.5">{d.fastestGrowing.slice(0, 10).map((i, k) => row(i, k, "change"))}</ol>}
            </Card>
            <Card className="space-y-2 p-5">
              <h3 className="flex items-center gap-2 font-semibold"><TrendingDown className="h-4 w-4 text-rose-500" />{t("Falling")}</h3>
              <p className="text-xs muted">{t(PREV_LABEL[period])}</p>
              {d.declining.length === 0 ? <p className="text-sm muted">{t("No product fell in this period.")}</p> : <ol className="space-y-0.5">{d.declining.slice(0, 10).map((i, k) => row(i, k, "change"))}</ol>}
            </Card>
          </div>
          <SourceNote>{t("Source: Google Trends search interest in Uzbekistan, all products compared on one scale. It shows what people looked for most, not the number of items sold. Updated: {date}.", { date: fmtDate(d.computedAt) })}</SourceNote>
        </>
      )}
    </div>
  );
}

function RadarTab() {
  const { t } = useI18n();
  const msg = useMsg();
  const radar = useRadar();
  if (radar.isLoading) return <Loading text={t("Checking the most searched products on Google…")} />;
  if (radar.error) return <ErrorAlert error={radar.error} />;
  const d = radar.data;
  if (!d || !d.configured) return <IntegrationNotice service="trends" />;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
        <RadarList title={t("Demand is rising")} icon={<TrendingUp className="h-4 w-4 text-emerald-500" />} items={d.rising} value={(i) => i.next3Pct ?? i.nowVsAvgPct} empty={t("No product on the watchlist is clearly rising right now.")} />
        <RadarList title={t("Demand is falling")} icon={<TrendingDown className="h-4 w-4 text-rose-500" />} items={d.declining} value={(i) => i.next3Pct ?? i.nowVsAvgPct} empty={t("No product on the watchlist is clearly falling right now.")} />
        <RadarList title={t("Season starts soon")} icon={<CalendarDays className="h-4 w-4 text-brand-500" />} items={d.upcoming} value={(i) => i.next3Pct} empty={t("No season starts in the next two months.")} />
      </div>
      <Card className="space-y-3 p-5">
        <h3 className="flex items-center gap-2 font-semibold"><RadarIcon className="h-4 w-4" />{t("Market updates")}</h3>
        {d.updates.length === 0 ? <p className="text-sm muted">{t("No notable changes this week.")}</p> : (
          <ul className="space-y-2">
            {d.updates.map((u, k) => (
              <li key={k} className="flex items-start gap-2 text-sm">
                {u.kind === "drop" || u.kind === "declining_year" ? <ArrowDownRight className="mt-0.5 h-4 w-4 flex-none text-rose-500" /> : u.kind === "season_soon" ? <CalendarDays className="mt-0.5 h-4 w-4 flex-none text-brand-500" /> : <ArrowUpRight className="mt-0.5 h-4 w-4 flex-none text-emerald-500" />}
                <span>{msg(u.msg)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <SourceNote>{t("Source: Google Trends search interest in Uzbekistan for {n} popular products, 5 years of weekly data. Updated: {date}. Search interest is not the number of sales.", { n: d.checked, date: fmtDate(d.computedAt) })}</SourceNote>
    </div>
  );
}

// ------------------------------------------------------------------ Economic statistics
const UZ_KEYS = ["gdp", "gdpGrowth", "gdpPerCapita", "inflation", "population", "consumption", "imports", "exports", "internet", "urban", "remittances"];

function IndicatorCard({ ind }: { ind: Indicator }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="min-w-0 flex-1">
        <p className="text-xs muted">{t(ind.label)}</p>
        {ind.latest ? (
          <>
            <p className="text-lg font-bold">{fmtIndicator(ind.unit, ind.latest.value)} <span className="text-xs font-normal muted">{ind.latest.year}</span></p>
            {ind.change5y !== null && <p className={cx("text-xs", ind.change5y >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>{fmtChange(ind.unit, ind.change5y, t)}</p>}
          </>
        ) : <p className="text-sm muted">{t("No data published")}</p>}
      </div>
      <Sparkline data={ind.series.slice(-10)} />
    </div>
  );
}

function useStats(countries: string[], enabled = true) {
  return useQuery({
    queryKey: ["intel-stats", countries.join(",")],
    queryFn: () => get<{ countries: CountryStats[] }>(`/intel/stats?countries=${countries.join(",")}`),
    enabled: enabled && countries.length > 0,
    staleTime: 3600_000,
    retry: false,
  });
}

function TradeCard({ country, options }: { country: string; options: Options }) {
  const { t } = useI18n();
  const ch = useChartTheme();
  const q = useQuery({
    queryKey: ["intel-trade", country],
    queryFn: () => get<{ profile: { imports: TradeFlow; exports: TradeFlow } }>(`/intel/trade/${country}`),
    enabled: options.sources.comtrade && options.tradeCountries.includes(country),
    staleTime: 3600_000,
    retry: false,
  });
  return (
    <Card className="space-y-4 p-5">
      <h3 className="flex items-center gap-2 font-semibold"><Ship className="h-4 w-4" />{t("What the country imports and exports")}</h3>
      {!options.sources.comtrade ? <IntegrationNotice service="comtrade" /> : q.isLoading ? <Loading text={t("Loading customs statistics…")} /> : q.error ? <ErrorAlert error={q.error} /> : q.data && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          {[q.data.profile.imports, q.data.profile.exports].map((f) => (
            <div key={f.flow} className="space-y-2">
              <p className="text-sm font-semibold">{t(f.flow === "import" ? "Top imports" : "Top exports")} {f.year && <span className="font-normal muted">· {f.year} · ${fmtCompact(f.totalUsd)}</span>}</p>
              {f.groups.length === 0 ? <p className="text-sm muted">{t("No data published")}</p> : (
                <div style={{ height: f.groups.length * 30 + 20 }}>
                  <ResponsiveContainer>
                    <BarChart data={f.groups} layout="vertical" margin={{ left: 0, right: 30 }}>
                      <CartesianGrid stroke={ch.grid} horizontal={false} />
                      <XAxis type="number" tick={{ fill: ch.axis, fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} dataKey="sharePct" />
                      <YAxis type="category" dataKey="name" width={150} tick={{ fill: ch.axis, fontSize: 10 }} tickFormatter={(s: string) => (s.length > 24 ? `${s.slice(0, 23)}…` : s)} />
                      <Tooltip {...ch.tooltip} formatter={(v, _n, p) => [`${v}% · $${fmtCompact((p.payload as { valueUsd: number }).valueUsd)}`, t("Share")]} />
                      <Bar dataKey="sharePct" fill={f.flow === "import" ? "#06b6d4" : "#10b981"} radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <SourceNote>{t("Source: UN Comtrade (official customs data, product groups by HS chapter). Published with a delay of 1–2 years.")}</SourceNote>
    </Card>
  );
}

function RegionsCard({ options }: { options: Options }) {
  const { t } = useI18n();
  const ch = useChartTheme();
  const [query, setQuery] = useState("");
  const run = useMutation({ mutationFn: (q: string) => post<{ query: string; regions: { code: string; name: string; value: number }[] }>("/intel/regions", { query: q }) });
  const data = run.data;
  return (
    <Card className="space-y-4 p-5">
      <h3 className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4" />{t("Demand by region of Uzbekistan")}</h3>
      {!options.sources.trends ? <IntegrationNotice service="trends" /> : (
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (query.trim().length >= 2) run.mutate(query.trim()); }}>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Product, e.g. куртка or кондиционер")} className="flex-1" maxLength={100} />
          <Button type="submit" loading={run.isPending} icon={<Search className="h-4 w-4" />} disabled={query.trim().length < 2}>{t("Compare regions")}</Button>
        </form>
      )}
      {run.error && <ErrorAlert error={run.error} />}
      {data && (data.regions.length === 0 ? <Alert tone="warning">{t("Google has too little search data for this product by region. Try a more general name.")}</Alert> : (
        <div style={{ height: data.regions.length * 28 + 20 }}>
          <ResponsiveContainer>
            <BarChart data={data.regions.map((r) => ({ ...r, name: t(r.name) }))} layout="vertical" margin={{ left: 0, right: 20 }}>
              <CartesianGrid stroke={ch.grid} horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: ch.axis, fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
              <YAxis type="category" dataKey="name" width={130} tick={{ fill: ch.axis, fontSize: 11 }} />
              <Tooltip {...ch.tooltip} formatter={(v) => `${v}%`} />
              <Bar dataKey="value" name={t("Search interest")} fill="#6366f1" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ))}
      <SourceNote>{t("Source: Google Trends, last 12 months. 100% = the region with the highest share of searches; this compares interest, not sales.")}</SourceNote>
    </Card>
  );
}

function UzbekistanTab({ options }: { options: Options }) {
  const { t } = useI18n();
  const stats = useStats(["UZ"], options.sources.worldBank);
  const uz = stats.data?.countries[0];
  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-5">
        <h3 className="flex items-center gap-2 font-semibold"><Globe2 className="h-4 w-4" />{t("Uzbekistan economy")}</h3>
        {!options.sources.worldBank ? <IntegrationNotice service="worldBank" /> : stats.isLoading ? <Loading text={t("Loading official statistics…")} /> : stats.error ? <ErrorAlert error={stats.error} /> : uz && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {UZ_KEYS.map((k) => uz.indicators.find((i) => i.key === k)).filter(Boolean).map((i) => <IndicatorCard key={i!.key} ind={i!} />)}
          </div>
        )}
        <SourceNote>{t("Source: World Bank Open Data (official yearly figures). The year of each value is shown; the latest year is usually 1–2 years ago.")}</SourceNote>
      </Card>
      <RegionsCard options={options} />
      <TradeCard country="UZ" options={options} />
    </div>
  );
}

// ------------------------------------------------------------------ Seasons
function SeasonsTab() {
  const { t } = useI18n();
  const radar = useRadar();
  const now = new Date().getMonth() + 1;
  if (radar.isLoading) return <Loading text={t("Checking the most searched products on Google…")} />;
  if (radar.error) return <ErrorAlert error={radar.error} />;
  const d = radar.data;
  if (!d || !d.configured) return <IntegrationNotice service="trends" />;
  const items = d.items.filter((i) => i.months?.length);
  const color = (v: number) => {
    const a = Math.min(1, Math.abs(v) / 40);
    return v >= 0 ? `rgba(16,185,129,${0.12 + a * 0.75})` : `rgba(244,63,94,${0.08 + a * 0.5})`;
  };
  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-5">
        <h3 className="flex items-center gap-2 font-semibold"><CalendarDays className="h-4 w-4" />{t("Season calendar of popular products")}</h3>
        <p className="text-sm muted">{t("Green months: demand is usually above the yearly average; red: below. Measured over 5 years in Uzbekistan.")}</p>
        {items.length === 0 ? <p className="text-sm muted">{t("Season analysis needs at least two years of search data; some areas have less.")}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-0.5 text-xs">
              <thead><tr><th />{Array.from({ length: 12 }, (_, k) => <th key={k} className={cx("px-1 py-1 font-medium", k + 1 === now && "text-brand-600 dark:text-brand-400")}>{fmtMonthName(k + 1, true)}</th>)}</tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.query}>
                    <td className="whitespace-nowrap pr-2 text-sm font-medium">{t(i.label)}</td>
                    {Array.from({ length: 12 }, (_, k) => {
                      const e = i.months!.find((m) => m.month === k + 1)?.effectPct ?? 0;
                      return <td key={k} title={`${fmtPct(e)}`} className={cx("h-8 rounded text-center tabular-nums", k + 1 === now && "ring-2 ring-brand-500")} style={{ background: color(e) }}>{Math.abs(e) >= 10 ? `${e > 0 ? "+" : ""}${Math.round(e)}%` : ""}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <SourceNote>{t("Source: Google Trends search interest in Uzbekistan, 5 years. Updated: {date}.", { date: fmtDate(d.computedAt) })}</SourceNote>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function Intelligence() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "top";
  const options = useOptions();
  const setTab = (v: Tab) => setParams({ tab: v });
  return (
    <div className="space-y-6">
      <PageHeader title={t("Market Intelligence")} subtitle={t("Top products, demand changes, economic statistics and seasons — from real data sources.")} icon={<RadarIcon className="h-5 w-5" />} />
      <div className="overflow-x-auto">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: "top", label: t("Top products by period") },
          { value: "radar", label: t("Market Radar") },
          { value: "uzbekistan", label: t("Uzbekistan") },
          { value: "seasons", label: t("Seasons") },
        ]} />
      </div>
      {options.error && !(options.error instanceof ApiError && options.error.status === 401) && <ErrorAlert error={options.error} />}
      {tab === "top" && <TopTab />}
      {tab === "radar" && <RadarTab />}
      {tab === "uzbekistan" && (options.data ? <UzbekistanTab options={options.data} /> : <Loading text={t("Loading…")} />)}
      {tab === "seasons" && <SeasonsTab />}
    </div>
  );
}
