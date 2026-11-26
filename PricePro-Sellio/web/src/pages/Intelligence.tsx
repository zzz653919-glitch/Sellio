import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownRight, ArrowUpRight, CalendarDays, Globe2, Lightbulb, LineChart as LineIcon, MapPin, Pencil, Plus, Radar as RadarIcon,
  Search, Ship, Swords, Trash2, TrendingDown, TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SERIES_COLORS, SourceNote, useChartTheme } from "../components/charts";
import { ErrorAlert, IntegrationNotice } from "../components/shared";
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner, Tabs, cx, useToast } from "../components/ui";
import { ApiError, del, errorMessage, get, patch, post } from "../lib/api";
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
type Opportunity = {
  query: string; label: string; category?: string; score: number; reasons: Msg[]; evidence: { yoyPct: number | null; next3Pct: number | null; nowVsAvgPct: number; confidence: string | null; peakMonths: number[] };
};
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
type Competitor = { id: string; name: string; website: string | null; category: string | null; priceNote: string | null; positioning: string | null; notes: string | null; updatedAt: string };

type Tab = "radar" | "opportunities" | "uzbekistan" | "global" | "competitors" | "seasons";

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

// ------------------------------------------------------------------ Opportunities
function OpportunitiesTab() {
  const { t } = useI18n();
  const msg = useMsg();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["intel-opportunities"], queryFn: () => get<{ configured: boolean; computedAt?: string; checked?: number; items?: Opportunity[] }>("/intel/opportunities"), staleTime: 3600_000, retry: false });
  if (q.isLoading) return <Loading text={t("Looking for growing products…")} />;
  if (q.error) return <ErrorAlert error={q.error} />;
  if (!q.data?.configured) return <IntegrationNotice service="trends" />;
  const items = q.data.items ?? [];
  return (
    <div className="space-y-4">
      <Alert tone="info">{t("Opportunities are ranked only by measured demand: yearly growth, the back-tested 3-month forecast, current interest and an upcoming season. Check prices, competition and your costs before deciding.")}</Alert>
      {items.length === 0 ? (
        <EmptyState icon={<Lightbulb className="h-6 w-6" />} title={t("No clear opportunity this week")} text={t("None of the watched products shows growth right now. Check again next week or analyse your own product ideas.")} />
      ) : items.map((o, k) => (
        <Card key={o.query} className="space-y-3 p-5">
          <div className="flex flex-wrap items-start gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[var(--v-sky-soft)] font-extrabold text-[var(--v-sky)]">{k + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t(o.label)} <span className="text-xs font-normal muted">«{o.query}»</span></p>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full bg-gradient-to-r from-brand-500 to-emerald-500" style={{ width: `${o.score}%` }} /></div>
                <span className="text-xs muted">{t("Score")}: {t("{n} points out of 100", { n: o.score })}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={<LineIcon className="h-4 w-4" />} onClick={() => navigate(`/forecast?q=${encodeURIComponent(o.query)}`)}>{t("Detailed analysis")}</Button>
            </div>
          </div>
          <ul className="ml-1 space-y-1 text-sm">
            {o.reasons.map((r, i) => <li key={i} className="flex gap-2"><span className="text-brand-500">•</span>{msg(r)}</li>)}
          </ul>
          <p className="text-xs muted">
            {t("Last 12 months")}: <Pct v={o.evidence.yoyPct} /> · {t("Next 3 months")}: <Pct v={o.evidence.next3Pct} /> · {t("Now vs yearly average")}: <Pct v={o.evidence.nowVsAvgPct} />
            {o.evidence.peakMonths.length > 0 && <> · {t("Season")}: {o.evidence.peakMonths.map((m) => fmtMonthName(m)).join(", ")}</>}
          </p>
        </Card>
      ))}
      {q.data.computedAt && <SourceNote>{t("Source: Google Trends search interest in Uzbekistan, 5 years. Updated: {date}.", { date: fmtDate(q.data.computedAt) })}</SourceNote>}
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

function GlobalTab({ options }: { options: Options }) {
  const { t } = useI18n();
  const ch = useChartTheme();
  const [countries, setCountries] = useState<string[]>(["UZ", "KZ", "KG", "TR"]);
  const [indicator, setIndicator] = useState("gdpGrowth");
  const [trade, setTrade] = useState("KZ");
  const stats = useStats([...countries].sort(), options.sources.worldBank);
  const toggle = (c: string) => setCountries((s) => (s.includes(c) ? (s.length > 1 ? s.filter((x) => x !== c) : s) : s.length >= 6 ? s : [...s, c]));
  const def = options.indicators.find((i) => i.key === indicator);
  const chart = useMemo(() => {
    const byYear = new Map<number, Record<string, number>>();
    for (const c of stats.data?.countries ?? []) {
      for (const p of c.indicators.find((i) => i.key === indicator)?.series ?? []) byYear.set(p.year, { ...(byYear.get(p.year) ?? { year: p.year }), [c.country]: p.value });
    }
    return [...byYear.values()].sort((a, b) => a.year - b.year);
  }, [stats.data, indicator]);
  const cols = ["gdpPerCapita", "gdpGrowth", "inflation", "population", "internet"];
  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-5">
        <h3 className="flex items-center gap-2 font-semibold"><Globe2 className="h-4 w-4" />{t("Compare countries")}</h3>
        <div className="flex flex-wrap gap-2">
          {options.countries.map((c) => (
            <button key={c.code} type="button" onClick={() => toggle(c.code)}
              className={cx("rounded-full border px-3 py-1 text-xs font-medium transition", countries.includes(c.code) ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800")}>
              {t(c.name)}
            </button>
          ))}
        </div>
        <p className="text-xs muted">{t("Choose up to 6 countries.")}</p>
        {!options.sources.worldBank ? <IntegrationNotice service="worldBank" /> : stats.isLoading ? <Loading text={t("Loading official statistics…")} /> : stats.error ? <ErrorAlert error={stats.error} /> : stats.data && (
          <>
            <Field label={t("Indicator")}>
              <Select value={indicator} onChange={(e) => setIndicator(e.target.value)} options={options.indicators.map((i) => ({ value: i.key, label: t(i.label) }))} />
            </Field>
            <div className="h-72">
              <ResponsiveContainer>
                <LineChart data={chart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={ch.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="year" tick={{ fill: ch.axis, fontSize: 11 }} />
                  <YAxis tick={{ fill: ch.axis, fontSize: 11 }} tickFormatter={(v: number) => (def ? fmtIndicator(def.unit, v) : String(v))} width={70} />
                  <Tooltip {...ch.tooltip} formatter={(v) => (def ? fmtIndicator(def.unit, Number(v)) : String(v))} />
                  {stats.data.countries.map((c, k) => <Line key={c.country} dataKey={c.country} name={t(c.name)} stroke={SERIES_COLORS[k % SERIES_COLORS.length]} strokeWidth={2} dot={false} connectNulls />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                  <tr><th className="px-3 py-2">{t("Country")}</th>{cols.map((k) => <th key={k} className="px-3 py-2">{t(options.indicators.find((i) => i.key === k)?.label ?? k)}</th>)}</tr>
                </thead>
                <tbody>
                  {stats.data.countries.map((c) => (
                    <tr key={c.country} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-3 py-2 font-medium">{t(c.name)}</td>
                      {cols.map((k) => {
                        const i = c.indicators.find((x) => x.key === k);
                        return <td key={k} className="px-3 py-2">{i?.latest ? <>{fmtIndicator(i.unit, i.latest.value)} <span className="text-xs muted">{i.latest.year}</span></> : <span className="muted">—</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <SourceNote>{t("Source: World Bank Open Data (official yearly figures). The year of each value is shown; the latest year is usually 1–2 years ago.")}</SourceNote>
      </Card>
      <Card className="space-y-3 p-5">
        <Field label={t("Country for import and export statistics")}>
          <Select value={trade} onChange={(e) => setTrade(e.target.value)} options={options.countries.filter((c) => options.tradeCountries.includes(c.code)).map((c) => ({ value: c.code, label: t(c.name) }))} />
        </Field>
      </Card>
      <TradeCard country={trade} options={options} />
    </div>
  );
}

// ------------------------------------------------------------------ Competitors
const EMPTY_COMPETITOR = { name: "", website: "", category: "", priceNote: "", positioning: "", notes: "" };

function CompetitorsTab() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const list = useQuery({ queryKey: ["competitors"], queryFn: () => get<{ items: Competitor[] }>("/intel/competitors").then((r) => r.items) });
  const [editing, setEditing] = useState<{ id: string | null; form: typeof EMPTY_COMPETITOR } | null>(null);
  const [remove, setRemove] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [myBrand, setMyBrand] = useState("");
  const save = useMutation({
    mutationFn: (e: { id: string | null; form: typeof EMPTY_COMPETITOR }) => (e.id ? patch(`/intel/competitors/${e.id}`, e.form) : post("/intel/competitors", e.form)),
    onSuccess: () => { setEditing(null); qc.invalidateQueries({ queryKey: ["competitors"] }); toast("success", t("Saved")); },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del(`/intel/competitors/${id}`),
    onSuccess: () => { setRemove(null); qc.invalidateQueries({ queryKey: ["competitors"] }); },
    onError: (e) => toast("error", errorMessage(e)),
  });
  const compare = useMutation({
    mutationFn: (queries: string[]) => post<{ analysis: { id: string } }>("/market/compare", { queries, geo: "UZ" }),
    onSuccess: (d) => navigate(`/forecast?market=${d.analysis.id}`),
  });
  const items = list.data ?? [];
  const names = [...(myBrand.trim() ? [myBrand.trim()] : []), ...items.filter((c) => selected.includes(c.id)).map((c) => c.name)];
  const f = editing?.form;
  const set = (k: keyof typeof EMPTY_COMPETITOR) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEditing((s) => s && { ...s, form: { ...s.form, [k]: e.target.value } });
  return (
    <div className="space-y-5">
      <Alert tone="info">{t("Write down what you know about competitors from their public pages, prices and ads. Vendora does not collect data from other websites; it compares their search interest on Google and helps you find how to stand out.")}</Alert>
      <div className="flex flex-wrap gap-2">
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ id: null, form: EMPTY_COMPETITOR })}>{t("Add competitor")}</Button>
      </div>
      {list.isLoading ? <Loading text={t("Loading…")} /> : items.length === 0 ? (
        <EmptyState icon={<Swords className="h-6 w-6" />} title={t("No competitors yet")} text={t("Add the shops or brands you compete with: their prices, positioning and notes.")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((c) => (
            <Card key={c.id} className="space-y-2 p-4">
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1.5 h-4 w-4 accent-brand-600" checked={selected.includes(c.id)} aria-label={t("Compare search interest")}
                  onChange={() => setSelected((s) => (s.includes(c.id) ? s.filter((x) => x !== c.id) : s.length >= 4 ? s : [...s, c.id]))} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{c.name} {c.category && <Badge className="ml-1">{c.category}</Badge>}</p>
                  {c.website && /^https?:\/\//i.test(c.website) && <a href={c.website} target="_blank" rel="noopener noreferrer nofollow" className="block break-all text-xs text-brand-600 hover:underline dark:text-brand-400">{c.website}</a>}
                </div>
                <Button size="sm" variant="ghost" aria-label={t("Edit")} onClick={() => setEditing({ id: c.id, form: { name: c.name, website: c.website ?? "", category: c.category ?? "", priceNote: c.priceNote ?? "", positioning: c.positioning ?? "", notes: c.notes ?? "" } })}><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" aria-label={t("Delete")} onClick={() => setRemove(c.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
              {c.priceNote && <p className="text-sm"><span className="muted">{t("Prices")}:</span> {c.priceNote}</p>}
              {c.positioning && <p className="text-sm"><span className="muted">{t("Positioning")}:</span> {c.positioning}</p>}
              {c.notes && <p className="whitespace-pre-line text-sm muted">{c.notes}</p>}
            </Card>
          ))}
        </div>
      )}
      {items.length > 0 && (
        <Card className="space-y-3 p-5">
          <h3 className="font-semibold">{t("Compare search interest on Google (Uzbekistan)")}</h3>
          <p className="text-sm muted">{t("Tick up to 4 competitors above and add your own brand to see whose name people search more and how it changes.")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={myBrand} onChange={(e) => setMyBrand(e.target.value)} placeholder={t("Your brand (optional)")} maxLength={100} className="flex-1" />
            <Button loading={compare.isPending} disabled={names.length < 2} onClick={() => compare.mutate(names)}>{t("Compare search interest")}</Button>
          </div>
          {compare.error && <ErrorAlert error={compare.error} />}
        </Card>
      )}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? t("Edit competitor") : t("Add competitor")}>
        {f && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(editing!); }}>
            <Field label={t("Name")}><Input value={f.name} onChange={set("name")} required maxLength={100} /></Field>
            <Field label={t("Website or page")} hint="https://…"><Input value={f.website} onChange={set("website")} type="url" maxLength={300} /></Field>
            <Field label={t("Category")}><Input value={f.category} onChange={set("category")} maxLength={100} /></Field>
            <Field label={t("Prices (public)")} hint={t("e.g. \"phones from 2.5 mln, free delivery\"")}><Input value={f.priceNote} onChange={set("priceNote")} maxLength={300} /></Field>
            <Field label={t("Positioning")} hint={t("e.g. \"cheapest\", \"premium\", \"fast delivery\"")}><Input value={f.positioning} onChange={set("positioning")} maxLength={500} /></Field>
            <Field label={t("Notes")}><textarea className="input min-h-24" value={f.notes} onChange={set("notes")} maxLength={2000} /></Field>
            {save.error && <ErrorAlert error={save.error} />}
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(null)}>{t("Cancel")}</Button><Button type="submit" loading={save.isPending}>{t("Save")}</Button></div>
          </form>
        )}
      </Modal>
      <ConfirmDialog open={Boolean(remove)} title={t("Delete competitor?")} text={t("This cannot be undone.")} confirmLabel={t("Delete")} loading={delMut.isPending} onConfirm={() => remove && delMut.mutate(remove)} onClose={() => setRemove(null)} />
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
  const tab = (params.get("tab") as Tab) || "radar";
  const options = useOptions();
  const setTab = (v: Tab) => setParams({ tab: v });
  return (
    <div className="space-y-6">
      <PageHeader title={t("Market Intelligence")} subtitle={t("Demand changes, opportunities, economic statistics and competitors — from real data sources.")} icon={<RadarIcon className="h-5 w-5" />} />
      <div className="overflow-x-auto">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: "radar", label: t("Market Radar") },
          { value: "opportunities", label: t("Opportunities") },
          { value: "uzbekistan", label: t("Uzbekistan") },
          { value: "global", label: t("Global") },
          { value: "competitors", label: t("Competitors") },
          { value: "seasons", label: t("Seasons") },
        ]} />
      </div>
      {options.error && !(options.error instanceof ApiError && options.error.status === 401) && <ErrorAlert error={options.error} />}
      {tab === "radar" && <RadarTab />}
      {tab === "opportunities" && <OpportunitiesTab />}
      {tab === "uzbekistan" && (options.data ? <UzbekistanTab options={options.data} /> : <Loading text={t("Loading…")} />)}
      {tab === "global" && (options.data ? <GlobalTab options={options.data} /> : <Loading text={t("Loading…")} />)}
      {tab === "competitors" && <CompetitorsTab />}
      {tab === "seasons" && <SeasonsTab />}
    </div>
  );
}
