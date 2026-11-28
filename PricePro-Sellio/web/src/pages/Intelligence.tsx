import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, CalendarDays, LineChart as LineIcon, Radar as RadarIcon, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SourceNote, useChartTheme } from "../components/charts";
import { ErrorAlert, IntegrationNotice } from "../components/shared";
import { Button, Card, Modal, PageHeader, Spinner, Tabs, cx } from "../components/ui";
import { ApiError, get } from "../lib/api";
import { fmtDate, fmtMonthName, fmtNumber, fmtPct } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type { Msg } from "../lib/msg";
import { HAS_MODELS, ModelsPanel } from "./Models";

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
type Tab = "top" | "radar";

const useOptions = () => useQuery({ queryKey: ["intel-options"], queryFn: () => get<Options>("/intel/options"), staleTime: 600_000 });
const useRadar = () => useQuery({ queryKey: ["intel-radar"], queryFn: () => get<RadarData>("/intel/radar"), staleTime: 3600_000, retry: false });

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
type TopItem = { query: string; label: string; category?: string; index: number; changePct: number | null; series: number[]; prevSeries?: (number | null)[] };
type TopData =
  | { configured: false }
  | {
    configured: true; period: TopPeriod; computedAt: string; from: string | null; to: string | null; prevFrom?: string | null; prevTo?: string | null;
    dates?: string[]; comparable: boolean; mostWanted: TopItem[]; leastWanted?: TopItem[]; fastestGrowing: TopItem[]; declining: TopItem[];
  };
const PERIOD_LABEL: Record<TopPeriod, string> = { week: "Last week", month: "Last month", quarter: "Last quarter", year: "Last year" };
const PREV_LABEL: Record<TopPeriod, string> = { week: "vs the week before", month: "vs the month before", quarter: "vs the 3 months before", year: "vs the year before" };

/** A tiny line of the period (no axes). */
function Spark({ values, tone }: { values: number[]; tone: "up" | "down" | "flat" }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values), w = 72, h = 22;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * (h - 2) - 1}`).join(" ");
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-none" aria-hidden><polyline points={pts} fill="none" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" stroke={tone === "up" ? "#10b981" : tone === "down" ? "#f43f5e" : "#94a3b8"} /></svg>;
}

/** Big chart of one product over the period: this period, the period before, and the leader for scale. */
function TopItemChart({ item, d, period, onClose }: { item: TopItem; d: Extract<TopData, { configured: true }>; period: TopPeriod; onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const ch = useChartTheme();
  const dates = d.dates ?? [];
  const leader = d.comparable && d.mostWanted[0] && d.mostWanted[0].query !== item.query ? d.mostWanted[0] : null;
  const rank = d.mostWanted.findIndex((x) => x.query === item.query) + 1;
  const data = (dates.length ? dates : item.series.map((_, i) => String(i))).map((date, i) => ({
    date, cur: item.series[i] ?? null, prev: item.prevSeries?.[i] ?? null, lead: leader ? leader.series[i] ?? null : null,
  }));
  const fmtX = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? (period === "year" || period === "quarter" ? `${fmtMonthName(Number(v.slice(5, 7)), true)} ${Number(v.slice(8, 10))}` : fmtDate(v)) : v);
  const peakIdx = item.series.indexOf(Math.max(...item.series));
  const lowIdx = item.series.indexOf(Math.min(...item.series));
  return (
    <Modal open onClose={onClose} title={`${t(item.label)} «${item.query}»`} wide>
      <div className="space-y-4" data-testid="top-item-chart">
        <p className="text-sm muted">{t(PERIOD_LABEL[period])}: {d.from && d.to ? `${fmtDate(d.from)} — ${fmtDate(d.to)}` : "—"}</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card className="p-3"><p className="text-xs muted">{t("Place among {n} products", { n: d.mostWanted.length })}</p><b className="text-xl">{rank > 0 ? `#${rank}` : "—"}</b></Card>
          {d.comparable && <Card className="p-3"><p className="text-xs muted">{t("Demand index (100 = the leader)")}</p><b className="text-xl">{item.index}</b></Card>}
          <Card className="p-3"><p className="text-xs muted">{t(PREV_LABEL[period])}</p><b className="text-xl"><Pct v={item.changePct} /></b></Card>
          {dates[peakIdx] && <Card className="p-3"><p className="text-xs muted">{t("Highest point")}</p><b className="text-base">{fmtDate(dates[peakIdx])}</b>{dates[lowIdx] && <p className="text-xs muted">{t("Lowest")}: {fmtDate(dates[lowIdx])}</p>}</Card>}
        </div>
        <div className="h-80 w-full">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={ch.grid} strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: ch.axis, fontSize: 11 }} tickFormatter={fmtX} minTickGap={24} />
              <YAxis tick={{ fill: ch.axis, fontSize: 11 }} width={40} />
              <Tooltip {...ch.tooltip} labelFormatter={(v) => fmtX(String(v))} formatter={(v: unknown, n: unknown) => [v == null ? "—" : fmtNumber(Number(v), 1), String(n)]} />
              <Legend />
              <Line dataKey="cur" name={t("This period")} stroke="#0ea5e9" strokeWidth={2.5} dot={false} connectNulls />
              {item.prevSeries?.some((v) => v != null) && <Line dataKey="prev" name={t("The period before")} stroke="#94a3b8" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />}
              {leader && <Line dataKey="lead" name={`#1 ${t(leader.label)}`} stroke="#10b981" strokeWidth={1.5} strokeOpacity={0.7} dot={false} connectNulls />}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs muted">{d.comparable
          ? t("All lines are on one scale with the other products: 100 = the average of the most searched product in this period. Dashed: the same days of the period before.")
          : t("This product is measured on its own scale. Dashed: the same days of the period before.")}</p>
        {HAS_MODELS.has(item.query) && <div className="border-t border-slate-100 pt-4 dark:border-slate-800"><ModelsPanel query={item.query} period={period} /></div>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => navigate(`/forecast?q=${encodeURIComponent(item.query)}`)}>{t("When does it sell best?")}</Button>
        </div>
      </div>
    </Modal>
  );
}

function TopTab() {
  const { t } = useI18n();
  const [period, setPeriod] = useState<TopPeriod>("month");
  const [open, setOpen] = useState<TopItem | null>(null);
  const q = useQuery({ queryKey: ["intel-top", period], queryFn: () => get<TopData>(`/intel/top?period=${period}`), staleTime: 3600_000, retry: false });
  const d = q.data;
  const row = (i: TopItem, k: number, mode: "index" | "change", tone: "good" | "bad") => (
    <li key={i.query}>
      <button type="button" onClick={() => setOpen(i)} data-query={i.query} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-[var(--v-glass-2)]" title={t("Open the chart")}>
        <span className={cx("grid h-7 w-7 flex-none place-items-center rounded-lg text-xs font-extrabold", tone === "good" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400")}>{k + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{t(i.label)}{HAS_MODELS.has(i.query) && <span className="ml-1.5 rounded-full bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 dark:text-brand-300">{t("models")}</span>}</span>
          {mode === "index"
            ? <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[var(--v-track)]"><span className={cx("block h-full rounded-full", tone === "good" ? "bg-emerald-500" : "bg-rose-400")} style={{ width: `${Math.max(3, i.index)}%` }} /></span>
            : <span className="text-[11px] muted">«{i.query}»</span>}
        </span>
        <Spark values={i.series} tone={(i.changePct ?? 0) > 3 ? "up" : (i.changePct ?? 0) < -3 ? "down" : "flat"} />
        <span className="w-14 flex-none text-right text-sm font-bold">{mode === "index" ? i.index : <Pct v={i.changePct} />}</span>
      </button>
    </li>
  );
  const least = d?.configured ? (d.leastWanted ?? [...d.mostWanted].reverse()) : [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={period} onChange={setPeriod} tabs={(["week", "month", "quarter", "year"] as const).map((p) => ({ value: p, label: t(PERIOD_LABEL[p]) }))} />
        {d?.configured && d.from && d.to && <span className="text-sm muted">{fmtDate(d.from)} — {fmtDate(d.to)}</span>}
      </div>
      {q.isLoading ? <Loading text={t("Comparing the products on Google…")} /> : q.error ? <ErrorAlert error={q.error} /> : !d || !d.configured ? <IntegrationNotice service="trends" /> : (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3" data-testid="top-period">
            <div data-testid="top-worst"><Card className="h-full space-y-2 p-5">
              <h3 className="flex items-center gap-2 font-semibold"><ArrowDownRight className="h-4 w-4 text-rose-500" />{t(d.comparable ? "Sold least" : "Fell the most")}</h3>
              <p className="text-xs muted">{d.comparable ? t("The least searched of the watched products in this period.") : t("Each product is measured on its own scale here, so only the change is comparable.")}</p>
              <ol className="space-y-0.5">{least.slice(0, 5).map((i, k) => row(i, k, d.comparable ? "index" : "change", "bad"))}</ol>
            </Card></div>
            <Card className="space-y-2 p-5">
              <h3 className="flex items-center gap-2 font-semibold"><TrendingUp className="h-4 w-4 text-emerald-500" />{t("Growing fastest")}</h3>
              <p className="text-xs muted">{t(PREV_LABEL[period])}</p>
              {d.fastestGrowing.length === 0 ? <p className="text-sm muted">{t("No product grew in this period.")}</p> : <ol className="space-y-0.5">{d.fastestGrowing.slice(0, 5).map((i, k) => row(i, k, "change", "good"))}</ol>}
            </Card>
            <Card className="space-y-2 p-5">
              <h3 className="flex items-center gap-2 font-semibold"><TrendingDown className="h-4 w-4 text-rose-500" />{t("Falling")}</h3>
              <p className="text-xs muted">{t(PREV_LABEL[period])}</p>
              {d.declining.length === 0 ? <p className="text-sm muted">{t("No product fell in this period.")}</p> : <ol className="space-y-0.5">{d.declining.slice(0, 5).map((i, k) => row(i, k, "change", "bad"))}</ol>}
            </Card>
          </div>
          <p className="text-xs muted">{t("Click a product to see its chart for the period.")}</p>
          <SourceNote>{t("Source: Google Trends search interest in Uzbekistan, all products compared on one scale. It shows what people looked for most, not the number of items sold. Updated: {date}.", { date: fmtDate(d.computedAt) })}</SourceNote>
          {open && <TopItemChart item={open} d={d} period={period} onClose={() => setOpen(null)} />}
        </>
      )}
    </div>
  );
}

/**
 * "Market news" as cards instead of a long list of sentences: one card per product with one big
 * number (now versus its usual level), a short plain caption, the year's change and a small chart.
 * The strongest changes come first; the rest are behind "Show all".
 */
function MarketNews({ items, upcoming }: { items: RadarItem[]; upcoming: RadarItem[] }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [all, setAll] = useState(false);
  const soon = new Set(upcoming.map((u) => u.query));
  const news = items
    .filter((i) => Math.abs(i.nowVsAvgPct) >= 10 || Math.abs(i.yoyPct ?? 0) >= 15 || soon.has(i.query))
    .sort((a, b) => Math.abs(b.nowVsAvgPct) - Math.abs(a.nowVsAvgPct));
  const hot = news.filter((i) => i.nowVsAvgPct >= 10).length, cold = news.filter((i) => i.nowVsAvgPct <= -10).length;
  const shown = all ? news : news.slice(0, 6);
  const round = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)}%`;
  return (
    <div data-testid="market-news"><Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><RadarIcon className="h-4 w-4" />{t("Market updates")}</h3>
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-600 dark:text-emerald-400">🔥 {t("{n} heating up", { n: hot })}</span>
          <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-sky-600 dark:text-sky-400">❄️ {t("{n} cooling down", { n: cold })}</span>
          {soon.size > 0 && <span className="rounded-full bg-brand-500/10 px-2.5 py-1 text-brand-600 dark:text-brand-300">📅 {t("{n} season soon", { n: soon.size })}</span>}
        </div>
      </div>
      {news.length === 0 ? <p className="text-sm muted">{t("No notable changes this week.")}</p> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((i) => {
            const up = i.nowVsAvgPct >= 0;
            const big = Math.abs(i.nowVsAvgPct) >= 10;
            return (
              <button key={i.query} type="button" onClick={() => navigate(`/forecast?q=${encodeURIComponent(i.query)}`)} data-news={i.query}
                className={cx("flex flex-col gap-2 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md",
                  !big ? "border-[var(--v-line)]" : up ? "border-emerald-500/30 bg-emerald-500/5" : "border-sky-500/30 bg-sky-500/5")}>
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate font-semibold">{big ? (up ? "🔥 " : "❄️ ") : "📅 "}{t(i.label)}</p>
                  {soon.has(i.query) && <span className="shrink-0 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold text-brand-600 dark:text-brand-300">{t("Season soon")}</span>}
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className={cx("text-3xl font-extrabold leading-none", up ? "text-emerald-600 dark:text-emerald-400" : "text-sky-600 dark:text-sky-400")}>{round(i.nowVsAvgPct)}</p>
                    <p className="mt-1 text-xs muted">{up ? t("searched more than usual now") : t("searched less than usual now")}</p>
                  </div>
                  <Sparkline data={i.recent} color={up ? "#10b981" : "#0ea5e9"} />
                </div>
                {i.yoyPct != null && (
                  <p className="text-xs">
                    <span className="muted">{t("Over a year")}: </span>
                    <b className={i.yoyPct > 3 ? "text-emerald-600 dark:text-emerald-400" : i.yoyPct < -3 ? "text-rose-600 dark:text-rose-400" : ""}>{round(i.yoyPct)}</b>
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
      {news.length > 6 && (
        <div className="flex justify-center">
          <Button size="sm" variant="secondary" onClick={() => setAll((v) => !v)} data-testid="news-all">{all ? t("Show less") : t("Show all ({n})", { n: news.length })}</Button>
        </div>
      )}
      <p className="text-xs muted">{t("The big number: search interest of the last 4 weeks versus its average over the last year. Click a card for the full analysis.")}</p>
    </Card></div>
  );
}

function RadarTab() {
  const { t } = useI18n();
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
      <MarketNews items={d.items} upcoming={d.upcoming} />
      <SourceNote>{t("Source: Google Trends search interest in Uzbekistan for {n} popular products, 5 years of weekly data. Updated: {date}. Search interest is not the number of sales.", { n: d.checked, date: fmtDate(d.computedAt) })}</SourceNote>
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function Intelligence() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "radar" ? "radar" : "top";
  const options = useOptions();
  const setTab = (v: Tab) => setParams({ tab: v });
  return (
    <div className="space-y-6">
      <PageHeader title={t("Market Intelligence")} subtitle={t("Top products, demand changes, economic statistics and seasons — from real data sources.")} icon={<RadarIcon className="h-5 w-5" />} />
      <div className="overflow-x-auto">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: "top", label: t("Top products by period") },
          { value: "radar", label: t("Market Radar") },
        ]} />
      </div>
      {options.error && !(options.error instanceof ApiError && options.error.status === 401) && <ErrorAlert error={options.error} />}
      {tab === "top" && <TopTab />}
      {tab === "radar" && <RadarTab />}
    </div>
  );
}
