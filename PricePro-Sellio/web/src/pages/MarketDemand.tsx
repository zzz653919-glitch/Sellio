import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Globe2, Info, Minus, Play, RefreshCw, Search, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorAlert, FavoriteButton, IntegrationNotice, SaveProjectButton } from "../components/shared";
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Select, Tabs, cx, useToast } from "../components/ui";
import { CompareForm, CompareView, SeasonPanel, TopDemand, type CompareResult, type Seasonality, type TopDemandData } from "./SeasonInsights";
import { del, errorMessage, get, post } from "../lib/api";
import { fmtAxis, fmtDateTime, fmtNumber, fmtPct, timeAgo } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/theme";
import type { Granularity } from "../lib/types";

type Range = "today 3-m" | "today 12-m" | "today 5-y" | "compare";
type Point = { date: string; units: number };
type Area = {
  geo: string; name: string; status: "ok" | "no_data" | "error"; error?: string; note?: string; granularity?: Granularity;
  history: Point[]; forecast: { date: string; value: number; lower: number; upper: number }[];
  recentAvg: number | null; forecastAvg: number | null; changePct: number | null; periodChangePct?: number | null;
  trend: "growing" | "declining" | "stable" | null; confidence: "high" | "medium" | "low" | null; accuracyPct?: number | null; peak: Point | null;
  seasonality?: Seasonality | null;
  horizons?: Horizon[];
};
type Horizon = {
  days: 7 | 30 | 90 | 365; status: "ok" | "insufficient"; expected: number | null; lower: number | null; upper: number | null;
  previous: number | null; changePct: number | null; model: string | null; smapePct: number | null; confidence: "high" | "medium" | "low" | null;
};
type SingleResult = { fetchedAt: string; horizonDays: number; areas: Area[]; byCountry: { code: string; name: string; value: number }[]; byCountryError?: string };
type Analysis = {
  id: string; query: string; range: Range; geos: string[]; status: "completed" | "no_data"; createdAt: string; projectId: string | null; favoriteId: string | null;
  result: SingleResult | CompareResult | null;
};
type Options = { configured: boolean; countries: { code: string; name: string }[]; ranges: { value: Exclude<Range, "compare">; horizonDays: number }[]; maxAreas: number };
const isCompare = (r: Analysis["result"]): r is CompareResult => Boolean(r && "kind" in r && r.kind === "compare");

const WORLD = "WORLD";
const COLORS = ["#6366f1", "#06b6d4", "#10b981", "#f59e0b", "#ec4899"];
const RANGE_LABEL: Record<Range, string> = {
  "today 3-m": "1-month forecast · 5-year history",
  "today 12-m": "3-month forecast · 5-year history",
  "today 5-y": "6-month forecast · 5-year history",
  compare: "Product comparison · 5-year history",
};

function TrendValue({ a }: { a: Area }) {
  const { t } = useI18n();
  if (a.changePct === null) return <span className="text-sm muted">{t("No forecast")}</span>;
  const Icon = a.trend === "growing" ? TrendingUp : a.trend === "declining" ? TrendingDown : Minus;
  return (
    <span className={cx("flex items-center gap-1 text-xl font-bold", a.trend === "growing" ? "text-emerald-600 dark:text-emerald-400" : a.trend === "declining" ? "text-rose-600 dark:text-rose-400" : "")}>
      <Icon className="h-5 w-5" />{fmtPct(a.changePct)}
    </span>
  );
}

function AreaCard({ a, color }: { a: Area; color: string }) {
  const { t } = useI18n();
  const name = a.geo === WORLD ? t("Worldwide") : t(a.name);
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <p className="flex items-center gap-2 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{name}</p>
      {a.status === "error" ? (
        <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{t("Data could not be loaded")}: {a.error}</p>
      ) : a.status === "no_data" ? (
        <p className="mt-2 text-sm muted">{t("Too little search data for this product here.")}</p>
      ) : (
        <div className="mt-2 space-y-1">
          <TrendValue a={a} />
          <p className="text-xs muted">
            {a.changePct !== null && <>{t("Next period")}: </>}
            {a.trend === "growing" ? t("Demand is rising") : a.trend === "declining" ? t("Demand is falling") : a.trend === "stable" ? t("Demand is stable") : t(a.note ?? "")}
          </p>
          <p className="text-xs muted">
            <span title={t("Google Trends: 100% = the highest search interest in this period, 50% = half of it. It is not the number of sales.")}>{t("Search interest now")}</span>: <b className="text-slate-700 dark:text-slate-200">{fmtNumber(a.recentAvg ?? 0)}%</b>
            {a.forecastAvg !== null && <> · {t("expected")}: <b className="text-slate-700 dark:text-slate-200">{fmtNumber(a.forecastAvg)}%</b></>}
          </p>
          {a.periodChangePct != null && (
            <p className="text-xs muted">{t(a.seasonality ? "Last 12 months vs the year before" : "Since the start of the period")}: <b className={a.periodChangePct > 0 ? "text-emerald-600 dark:text-emerald-400" : a.periodChangePct < 0 ? "text-rose-600 dark:text-rose-400" : ""}>{fmtPct(a.periodChangePct)}</b></p>
          )}
          {a.accuracyPct != null
            ? <p className="text-xs muted" title={t("How close the model came when it was tested on the last months of real data.")}>{t("Forecast accuracy")}: <b className={a.accuracyPct >= 85 ? "text-emerald-600 dark:text-emerald-400" : a.accuracyPct >= 70 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}>{a.accuracyPct}%</b></p>
            : a.confidence && <p className="text-xs muted">{t("Model confidence")}: {t(a.confidence)}</p>}
        </div>
      )}
    </div>
  );
}

function InterestChart({ areas }: { areas: Area[] }) {
  const { t } = useI18n();
  const { resolved } = useTheme();
  const shown = areas.filter((a) => a.status === "ok" && a.history.length > 0);
  const granularity = shown[0]?.granularity ?? "week";
  const data = useMemo(() => {
    const rows = new Map<string, Record<string, number | string>>();
    const row = (date: string) => rows.get(date) ?? rows.set(date, { date }).get(date)!;
    for (const a of shown) {
      for (const p of a.history) row(p.date)[a.geo] = p.units;
      const last = a.history[a.history.length - 1];
      if (a.forecast.length && last) row(last.date)[`${a.geo}_f`] = last.units; // join the lines
      for (const f of a.forecast) row(f.date)[`${a.geo}_f`] = f.value;
    }
    return [...rows.values()].sort((x, y) => String(x.date).localeCompare(String(y.date)));
  }, [shown]);
  if (!shown.length) return null;
  const grid = resolved === "dark" ? "#1e293b" : "#e2e8f0";
  const axis = resolved === "dark" ? "#94a3b8" : "#64748b";
  const label = (a: Area) => (a.geo === WORLD ? t("Worldwide") : t(a.name));
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fill: axis, fontSize: 11 }} tickFormatter={(d: string) => fmtAxis(d, granularity === "month" ? "month" : "day")} minTickGap={28} />
          <YAxis domain={[0, 100]} tick={{ fill: axis, fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} width={42} />
          <Tooltip contentStyle={{ background: resolved === "dark" ? "#0f172a" : "#fff", border: `1px solid ${grid}`, borderRadius: 12 }}
            labelFormatter={(d) => fmtAxis(String(d), granularity === "month" ? "month" : "day")} formatter={(v: unknown, n: unknown) => [`${fmtNumber(Number(v), 1)}%`, String(n)]} />
          <Legend />
          {areas.map((a, i) => a.status === "ok" && a.history.length > 0 && [
            <Line key={a.geo} type="monotone" dataKey={a.geo} name={label(a)} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls />,
            <Line key={`${a.geo}_f`} type="monotone" dataKey={`${a.geo}_f`} name={`${label(a)} — ${t("forecast")}`} stroke={COLORS[i % COLORS.length]} strokeWidth={2} strokeDasharray="6 4" dot={false} legendType="none" connectNulls />,
          ])}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const HORIZON_LABEL = { 7: "7 days", 30: "30 days", 90: "90 days", 365: "365 days" } as const;
const CONF_TONE = { high: "green", medium: "amber", low: "red" } as const;
/** Back-test accuracy in percent (100 − sMAPE). */
const accuracyOf = (smapePct: number) => Math.max(0, Math.min(100, Math.round(100 - smapePct)));

/** Expected search interest over 7 / 30 / 90 / 365 days, per area, with the model's back-test error. */
function HorizonTable({ areas }: { areas: Area[] }) {
  const { t } = useI18n();
  const rows = areas.filter((a) => a.status === "ok" && a.horizons?.length);
  if (!rows.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">{t("Forecast for 7, 30, 90 and 365 days")}</h3>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
            <tr><th className="px-3 py-2">{t("Area")}</th>{([7, 30, 90, 365] as const).map((d) => <th key={d} className="px-3 py-2">{t(HORIZON_LABEL[d])}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.geo} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-3 py-2 font-medium">{a.geo === WORLD ? t("Worldwide") : t(a.name)}</td>
                {a.horizons!.map((h) => (
                  <td key={h.days} className="px-3 py-2 align-top">
                    {h.status === "ok" && h.changePct !== null ? (
                      <>
                        <b className={h.changePct > 3 ? "text-emerald-600 dark:text-emerald-400" : h.changePct < -3 ? "text-rose-600 dark:text-rose-400" : ""}>{fmtPct(h.changePct)}</b>
                        <span className="block text-xs muted">{fmtNumber(h.expected!, 0)}% ({fmtNumber(h.lower!, 0)}–{fmtNumber(h.upper!, 0)}%)</span>
                        {h.smapePct != null && h.confidence
                          ? <Badge tone={CONF_TONE[h.confidence]} className="mt-1">{t("Accuracy {n}%", { n: accuracyOf(h.smapePct) })}</Badge>
                          : h.confidence && <Badge tone={CONF_TONE[h.confidence]} className="mt-1">{t(h.confidence === "high" ? "High confidence" : h.confidence === "medium" ? "Medium confidence" : "Low confidence")}</Badge>}
                      </>
                    ) : <span className="text-xs muted">{t("Not enough data")}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs muted">{t("Change of the average search interest over the period versus the same length just before. Below: expected interest (in % of the peak) and its likely range. Accuracy: how close the model came when it was tested on the last months of real data (100% = no error). Seasonal patterns can break when something new happens (prices, laws, new products).")}</p>
    </div>
  );
}

function AnalysisResult({ a, onDelete, onRefresh, refreshing, refreshError }: { a: Analysis; onDelete: () => void; onRefresh: () => void; refreshing: boolean; refreshError: unknown }) {
  const { t } = useI18n();
  const r = a.result;
  const seasonAreas = r && !isCompare(r) ? r.areas.filter((x) => x.seasonality) : [];
  const [seasonGeo, setSeasonGeo] = useState<string | null>(null);
  if (!r) return <Alert tone="error">{t("Corrupted result")}</Alert>;
  const ageDays = Math.floor((Date.now() - Date.parse(r.fetchedAt)) / 86_400_000);
  const refreshButton = (
    <Button size="sm" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={refreshing} onClick={onRefresh} title={t("Gets fresh data from Google Trends. It counts as one analysis in your monthly limit.")}>{t("Update")}</Button>
  );
  const staleNote = (
    <>
      {ageDays >= 7 && <Alert tone="warning">{t("This data was received {n} days ago. Press \"Update\" to get fresh figures.", { n: ageDays })}</Alert>}
      {refreshError ? <ErrorAlert error={refreshError} /> : null}
    </>
  );
  if (isCompare(r)) {
    return (
      <Card className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{a.query}</h2>
            <p className="text-xs muted">{t(RANGE_LABEL.compare)} · {t("Data received")}: {fmtDateTime(r.fetchedAt)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{refreshButton}<Badge tone="cyan">{t("Google Trends · search interest")}</Badge></div>
        </div>
        {staleNote}
        <CompareView r={r} onDelete={onDelete} />
      </Card>
    );
  }
  const shown = seasonAreas.find((x) => x.geo === seasonGeo) ?? seasonAreas[0];
  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{a.query}</h2>
          <p className="text-xs muted">{t(RANGE_LABEL[a.range])} · {t("Data received")}: {fmtDateTime(r.fetchedAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{refreshButton}<Badge tone="cyan">{t("Google Trends · search interest")}</Badge></div>
      </div>
      {staleNote}

      <Alert tone="info">
        {t("The numbers show how much people search for this product on Google, in % of the highest interest in the chosen period (100% = the peak). This is real search data, not sales volume: it shows where interest is rising or falling.")}
      </Alert>

      {a.status === "no_data" && <Alert tone="warning">{t("Google has too little search data for this product in the chosen areas. Try a more general or English product name.")}</Alert>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {r.areas.map((area, i) => <AreaCard key={area.geo} a={area} color={COLORS[i % COLORS.length]} />)}
      </div>

      <HorizonTable areas={r.areas} />

      {shown?.seasonality && (
        <div className="space-y-2">
          {seasonAreas.length > 1 && (
            <Tabs value={shown.geo} onChange={setSeasonGeo} tabs={seasonAreas.map((x) => ({ value: x.geo, label: x.geo === WORLD ? t("Worldwide") : t(x.name) }))} />
          )}
          <SeasonPanel s={shown.seasonality} title={shown.geo === WORLD ? t("Worldwide") : t(x2name(shown))} />
        </div>
      )}
      {r.areas.some((x) => x.status === "ok" && !x.seasonality) && (
        <p className="text-xs muted">{t("Season analysis needs at least two years of search data; some areas have less.")}</p>
      )}

      <InterestChart areas={r.areas} />
      <p className="text-xs muted">{t("Solid line: actual search interest. Dashed line: forecast. Each area's line is scaled to its own peak, so compare directions between areas, not heights.")}</p>

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Globe2 className="h-4 w-4" />{t("Countries with the highest interest")}</h3>
        {r.byCountry.length === 0 ? (
          <p className="text-sm muted">{r.byCountryError ? `${t("Data could not be loaded")}: ${r.byCountryError}` : t("No country data for this product.")}</p>
        ) : (
          <ul className="space-y-1.5">
            {r.byCountry.slice(0, 15).map((c) => (
              <li key={c.code || c.name} className="flex items-center gap-3 text-sm">
                <span className="w-40 shrink-0 truncate">{t(c.name)}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <span className="block h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-500" style={{ width: `${Math.max(2, c.value)}%` }} />
                </span>
                <span className="w-10 text-right font-semibold">{c.value}%</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs muted">{t("Here countries are compared with each other: 100% = the country where the product is searched most relative to all searches there.")}</p>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
        <SaveProjectButton type="forecast" refId={a.id} projectId={a.projectId} invalidate={["market", a.id]} />
        <FavoriteButton itemType="forecast" refId={a.id} favoriteId={a.favoriteId} invalidate={["market", a.id]} />
        <Button size="sm" variant="ghost" className="ml-auto" icon={<Trash2 className="h-4 w-4" />} onClick={onDelete}>{t("Delete")}</Button>
      </div>
    </Card>
  );
}

const x2name = (a: Area) => a.name;

export default function MarketDemand() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const currentId = params.get("market");
  const options = useQuery({ queryKey: ["market-options"], queryFn: () => get<Options>("/market/options") });
  const list = useQuery({ queryKey: ["market"], queryFn: () => get<{ items: Analysis[] }>("/market").then((r) => r.items) });
  const current = useQuery({
    queryKey: ["market", currentId],
    queryFn: () => get<{ analysis: Analysis }>(`/market/${currentId}`).then((r) => r.analysis),
    enabled: Boolean(currentId),
  });
  const top = useQuery({ queryKey: ["market-top"], queryFn: () => get<TopDemandData>("/market/top"), staleTime: 3600_000, retry: false });
  const [mode, setMode] = useState<"single" | "compare">("single");
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [range, setRange] = useState<Exclude<Range, "compare">>("today 12-m");
  const [geos, setGeos] = useState<string[]>([WORLD, "UZ"]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const o = options.data;
  const max = o?.maxAreas ?? 5;

  const toggle = (g: string) => setGeos((s) => (s.includes(g) ? s.filter((x) => x !== g) : s.length >= max ? s : [...s, g]));
  const open = (id: string | null) => setParams(id ? { market: id } : {});

  const run = useMutation({
    mutationFn: (o?: { query: string; geos: string[]; range?: Range }) => post<{ analysis: Analysis }>("/market", { query: o?.query ?? query, range: o?.range ?? range, geos: o?.geos ?? geos }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["market"] });
      qc.setQueryData(["market", d.analysis.id], d.analysis);
      open(d.analysis.id);
    },
  });
  const compare = useMutation({
    mutationFn: ({ queries, geo }: { queries: string[]; geo: string }) => post<{ analysis: Analysis }>("/market/compare", { queries, geo }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["market"] });
      qc.setQueryData(["market", d.analysis.id], d.analysis);
      open(d.analysis.id);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/market/${id}`),
    onSuccess: (_, id) => {
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ["market"] });
      if (id === currentId) open(null);
    },
    onError: (e) => toast("error", errorMessage(e)),
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="space-y-5 lg:col-span-2">
        <Card className="space-y-4 p-5">
          <h2 className="flex items-center gap-2 font-semibold"><Globe2 className="h-4 w-4" />{t("World and country demand")}</h2>
          <Tabs value={mode} onChange={setMode} tabs={[{ value: "single", label: t("One product") }, { value: "compare", label: t("Compare products") }]} />
          {o && !o.configured && <IntegrationNotice service="trends" />}
          {mode === "compare" ? (
            <>
              <CompareForm countries={o?.countries ?? []} disabled={o?.configured === false} loading={compare.isPending} onRun={(queries, geo) => compare.mutate({ queries, geo })} />
              {compare.error && <ErrorAlert error={compare.error} />}
            </>
          ) : (<>
          <p className="text-sm muted">{t("See how interest in a product is changing worldwide and in specific countries, based on real Google search data.")}</p>
          <Field label={t("Product")} hint={t("Write it the way people search, e.g. \"air fryer\", \"iPhone 15\", \"protein powder\". English names give more worldwide data.")}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Search className="h-4 w-4" /></span>
              <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="air fryer" />
            </div>
          </Field>
          <Field label={t("Forecast")}>
            <Select value={range} onChange={(e) => setRange(e.target.value as Exclude<Range, "compare">)} options={(o?.ranges ?? []).map((r) => ({ value: r.value, label: t(RANGE_LABEL[r.value]) }))} />
          </Field>
          <div>
            <p className="label">{t("Areas")} <span className="font-normal muted">({geos.length}/{max})</span></p>
            <div className="flex flex-wrap gap-1.5">
              {[{ code: WORLD, name: "Worldwide" }, ...(o?.countries ?? [])].map((c) => {
                const on = geos.includes(c.code);
                return (
                  <button key={c.code} type="button" onClick={() => toggle(c.code)} aria-pressed={on}
                    disabled={!on && geos.length >= max}
                    className={cx("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition disabled:opacity-40",
                      on ? "border-brand-500 bg-brand-600 text-white" : "border-slate-200 hover:border-brand-300 dark:border-slate-700")}>
                    {on && <Check className="h-3 w-3" />}{c.code === WORLD ? `🌍 ${t("Worldwide")}` : t(c.name)}
                  </button>
                );
              })}
            </div>
          </div>
          {run.error && <ErrorAlert error={run.error} />}
          <Button size="lg" className="w-full" loading={run.isPending} disabled={query.trim().length < 2 || geos.length === 0 || o?.configured === false}
            onClick={() => run.mutate(undefined)} icon={<Play className="h-4 w-4" />}>{t("Analyze demand")}</Button>
          </>)}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 font-semibold">{t("Recent analyses")}</h2>
          {list.data?.length === 0 ? <p className="py-4 text-center text-sm muted">{t("No analyses yet.")}</p> : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {list.data?.map((a) => {
                const top = a.result && !isCompare(a.result)
                  ? a.result.areas.find((x) => x.status === "ok" && x.changePct !== null)
                  : null;
                const cmp = isCompare(a.result) ? a.result.items.filter((i) => i.seasonality)[0]?.seasonality : null;
                return (
                  <li key={a.id}>
                    <button onClick={() => open(a.id)} className={cx("flex w-full items-center gap-3 py-2.5 text-left", currentId === a.id && "text-brand-600 dark:text-brand-400")}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{a.query}</span>
                        <span className="text-xs muted">{a.range === "compare" ? t("Comparison") : `${a.geos.length} ${t("areas")}`} · {timeAgo(a.createdAt)}</span>
                      </span>
                      {top && <span className="text-sm font-semibold">{fmtPct(top.changePct)}</span>}
                      {cmp && <span className="text-sm font-semibold">{fmtPct(cmp.next3Pct)}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="lg:col-span-3">
        {currentId && current.data ? (
          <AnalysisResult a={current.data} onDelete={() => setConfirmDelete(current.data!.id)}
            refreshing={run.isPending || compare.isPending} refreshError={run.error ?? compare.error}
            onRefresh={() => {
              const x = current.data!;
              const res = x.result;
              if (res && isCompare(res)) compare.mutate({ queries: res.items.map((i) => i.query), geo: res.geo });
              else run.mutate({ query: x.query, geos: x.geos, range: x.range as Range });
            }} />
        ) : currentId && current.error ? (
          <ErrorAlert error={current.error} />
        ) : (
          <Card className="space-y-6 p-5 sm:p-6">
            <TopDemand data={top.data} loading={top.isLoading} onAnalyse={(q) => {
              setMode("single"); setQuery(q); setGeos(["UZ"]);
              run.mutate({ query: q, geos: ["UZ"] });
            }} />
            {run.isPending && <p className="text-sm muted">{t("Analysing…")}</p>}
            {run.error && <ErrorAlert error={run.error} />}
            <EmptyState icon={<Info className="h-6 w-6" />} title={t("World demand will appear here")}
              text={t("Enter a product, choose the world and the countries you sell in, and run the analysis. You will see where demand is growing and where it is falling.")} />
          </Card>
        )}
      </div>

      <ConfirmDialog open={Boolean(confirmDelete)} title={t("Delete analysis?")} text={t("This analysis will be permanently deleted.")}
        confirmLabel={t("Delete")} loading={remove.isPending} onClose={() => setConfirmDelete(null)} onConfirm={() => confirmDelete && remove.mutate(confirmDelete)} />
    </div>
  );
}
