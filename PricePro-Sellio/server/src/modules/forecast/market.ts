/**
 * World and country demand: Google Trends search interest per area, with a back-tested
 * forecast of where interest is heading. Every number comes from the provider; nothing is
 * invented. Results are stored per user and labelled as search interest (not units sold).
 */
import { all, get, run } from "../../db/index.js";
import { notConfigured, notFound, upstreamError } from "../../lib/errors.js";
import { newId, nowIso, safeJson } from "../../lib/util.js";
import { logActivity } from "../../services/activity.js";
import { notify } from "../../services/notifications.js";
import { assertWithinLimit } from "../../services/plans.js";
import { detectGranularity, runForecast, type Granularity, type Point } from "./engine.js";
import { analyseSeasonality, type SeasonalAnalysis } from "./seasonal.js";
import { savedRefs, type SavedRefs } from "../../services/savedRefs.js";
import { TrendsError, trendsProvider, type CountryInterest, type TrendsRange } from "./trends.js";

export const COUNTRIES: { code: string; name: string }[] = [
  { code: "UZ", name: "Uzbekistan" }, { code: "KZ", name: "Kazakhstan" }, { code: "KG", name: "Kyrgyzstan" },
  { code: "TJ", name: "Tajikistan" }, { code: "TM", name: "Turkmenistan" }, { code: "RU", name: "Russia" },
  { code: "TR", name: "Turkey" }, { code: "CN", name: "China" }, { code: "IN", name: "India" },
  { code: "AE", name: "United Arab Emirates" }, { code: "SA", name: "Saudi Arabia" }, { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" }, { code: "DE", name: "Germany" }, { code: "FR", name: "France" },
  { code: "PL", name: "Poland" }, { code: "KR", name: "South Korea" }, { code: "JP", name: "Japan" },
  { code: "BR", name: "Brazil" }, { code: "ID", name: "Indonesia" },
];
const COUNTRY_NAME = new Map(COUNTRIES.map((c) => [c.code, c.name]));
export const WORLDWIDE = "WORLD";

/**
 * Forecast horizon options (kept under their historical keys). The look-back is always five
 * years, so seasons (school, holidays) can be measured across several years.
 */
export const RANGES: Record<TrendsRange, number> = { "today 3-m": 30, "today 12-m": 90, "today 5-y": 180 };
const HISTORY: TrendsRange = "today 5-y";

export type AreaResult = {
  geo: string;
  name: string;
  status: "ok" | "no_data" | "error";
  error?: string;
  granularity?: Granularity;
  history: Point[];
  forecast: { date: string; value: number; lower: number; upper: number }[];
  recentAvg: number | null;
  forecastAvg: number | null;
  changePct: number | null;
  /** Recent interest versus the start of the look-back window. */
  periodChangePct: number | null;
  trend: "growing" | "declining" | "stable" | null;
  confidence: "high" | "medium" | "low" | null;
  /** Back-test accuracy of the chosen model: 100 − sMAPE, in percent (null without a model). */
  accuracyPct?: number | null;
  peak: Point | null;
  /** Seasons, rise/fall timing and a 12-month outlook (null with less than two years of data). */
  seasonality?: SeasonalAnalysis | null;
  /** Expected interest over the next 7 / 30 / 90 / 365 days compared with the same length just before. */
  horizons?: Horizon[];
  note?: string;
};

export type MarketResult = {
  source: "google_trends";
  metric: "search_interest_index";
  fetchedAt: string;
  horizonDays: number;
  areas: AreaResult[];
  byCountry: CountryInterest[];
  byCountryError?: string;
};

/** "Which product is growing?" — several products in one area. */
export type CompareItem = {
  query: string;
  status: "ok" | "no_data" | "error";
  error?: string;
  seasonality: SeasonalAnalysis | null;
  recent: { month: string; value: number }[];
};
export type CompareResult = { kind: "compare"; source: "google_trends"; fetchedAt: string; geo: string; geoName: string; items: CompareItem[] };

export type Horizon = {
  days: 7 | 30 | 90 | 365;
  status: "ok" | "insufficient";
  expected: number | null; // average search-interest index over the horizon
  lower: number | null;
  upper: number | null;
  previous: number | null; // average over the same length just before today
  changePct: number | null;
  model: string | null;
  smapePct: number | null; // back-test error
  confidence: "high" | "medium" | "low" | null;
};

/**
 * 7 days: weekly model on the weekly series (one step). 30/90/365 days: the back-tested seasonal
 * model (1, 3, 12 months) when there are two years of data, otherwise the weekly model.
 */
export function computeHorizons(history: Point[], seasonality: SeasonalAnalysis | null): Horizon[] {
  const out: Horizon[] = [];
  const pct = (a: number, b: number) => (b > 0 ? r1(((a - b) / b) * 100) : null);
  for (const days of [7, 30, 90, 365] as const) {
    const empty: Horizon = { days, status: "insufficient", expected: null, lower: null, upper: null, previous: null, changePct: null, model: null, smapePct: null, confidence: null };
    if (days >= 30 && seasonality && seasonality.outlook.length >= 12) {
      const months = days === 30 ? 1 : days === 90 ? 3 : 12;
      const fc = seasonality.outlook.slice(0, months);
      const prev = seasonality.monthly.slice(-months).map((m) => m.value);
      if (prev.length === months) {
        const expected = avg(fc.map((f) => f.value));
        const previous = avg(prev);
        out.push({
          days, status: "ok", expected: r1(expected), lower: r1(Math.max(0, avg(fc.map((f) => f.lower)))), upper: r1(Math.min(100, avg(fc.map((f) => f.upper)))),
          previous: r1(previous), changePct: pct(expected, previous),
          model: seasonality.model.name, smapePct: seasonality.model.smapePct, confidence: seasonality.model.confidence,
        });
        continue;
      }
    }
    const res = runForecast(history, days, "week");
    if (res.status !== "ok") { out.push(empty); continue; }
    const expected = avg(res.forecast.map((f) => f.units));
    const previous = avg(res.history.slice(-res.horizon).map((p) => p.units));
    out.push({
      days, status: "ok", expected: r1(expected), lower: r1(avg(res.forecast.map((f) => f.lower))), upper: r1(Math.min(100, avg(res.forecast.map((f) => f.upper)))),
      previous: r1(previous), changePct: pct(expected, previous),
      model: res.model.name, smapePct: res.model.backtest.smapePct, confidence: res.model.confidence,
    });
  }
  return out;
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;
/** Accuracy shown to users: how close the model came on held-back real data (100 − sMAPE, 0–100). */
const accuracy = (smapePct: number | null | undefined) => (smapePct == null || !Number.isFinite(smapePct) ? null : Math.max(0, Math.min(100, Math.round(100 - smapePct))));

function analyseArea(geo: string, history: Point[], horizonDays: number): AreaResult {
  const name = geo === WORLDWIDE ? "Worldwide" : (COUNTRY_NAME.get(geo) ?? geo);
  const base = { geo, name, history, forecast: [], recentAvg: null, forecastAvg: null, changePct: null, periodChangePct: null, trend: null, confidence: null, peak: null };
  if (history.length === 0 || history.every((p) => p.units === 0)) {
    return { ...base, status: "no_data", note: "Google Trends has too little search data for this product in this area." };
  }
  const peak = history.reduce((m, p) => (p.units > m.units ? p : m), history[0]);
  const span = Math.max(1, Math.min(13, Math.floor(history.length / 4)));
  const first = avg(history.slice(0, span).map((p) => p.units));
  const periodChangePct = first > 0 ? r1(((avg(history.slice(-span).map((p) => p.units)) - first) / first) * 100) : null;
  const granularity = detectGranularity(history);
  const seasonality = analyseSeasonality(history);
  const horizons = computeHorizons(history, seasonality);
  const out = runForecast(history, horizonDays, granularity);
  if (out.status !== "ok") {
    const recent = history.slice(-4).map((p) => p.units);
    return { ...base, status: "ok", granularity, peak, periodChangePct, seasonality, horizons, recentAvg: r1(avg(recent)), note: "Not enough history for a forecast in this area; only past interest is shown." };
  }
  if (seasonality) {
    // Seasonal model (5 years, back-tested) drives the headline numbers and the forecast line.
    const months = Math.max(1, Math.round(horizonDays / 30));
    const fc = seasonality.outlook.slice(0, months);
    const lastActual = seasonality.monthly.slice(-months).map((m) => m.value);
    const recentAvg = avg(lastActual), forecastAvg = avg(fc.map((f) => f.value));
    const changePct = recentAvg > 0 ? r1(((forecastAvg - recentAvg) / recentAvg) * 100) : null;
    const threshold = months <= 1 ? 3 : 5;
    return {
      ...base,
      status: "ok",
      granularity: out.granularity,
      history: out.history,
      forecast: fc.map((f) => ({ date: f.date, value: f.value, lower: f.lower, upper: f.upper })),
      recentAvg: r1(recentAvg),
      forecastAvg: r1(forecastAvg),
      changePct,
      periodChangePct: seasonality.yoyPct,
      trend: changePct === null ? "stable" : changePct > threshold ? "growing" : changePct < -threshold ? "declining" : "stable",
      confidence: seasonality.model.confidence,
      accuracyPct: accuracy(seasonality.model.smapePct),
      peak,
      seasonality,
      horizons,
    };
  }
  const h = out.horizon;
  const recent = out.history.slice(-h).map((p) => p.units);
  const recentAvg = avg(recent);
  const forecastAvg = avg(out.forecast.map((f) => f.units));
  return {
    ...base,
    status: "ok",
    granularity: out.granularity,
    history: out.history,
    forecast: out.forecast.map((f) => ({ date: f.date, value: f.units, lower: f.lower, upper: Math.min(100, f.upper) })),
    recentAvg: r1(recentAvg),
    forecastAvg: r1(forecastAvg),
    changePct: out.totals.growthPct,
    periodChangePct,
    trend: out.trend,
    confidence: out.model.confidence,
    accuracyPct: accuracy(out.model.backtest.smapePct),
    peak,
    seasonality,
    horizons,
  };
}

type Row = { id: string; user_id: string; query: string; range: TrendsRange; geos_json: string; status: "completed" | "no_data"; result_json: string; created_at: string };

async function serialize(r: Row, refs?: SavedRefs) {
  return {
    id: r.id,
    query: r.query,
    range: r.range,
    geos: safeJson<string[]>(r.geos_json, []),
    status: r.status,
    result: safeJson<MarketResult | CompareResult | null>(r.result_json, null),
    projectId: refs ? (refs.project.get(r.id) ?? null) : ((await get<{ id: string }>("SELECT id FROM projects WHERE user_id = ? AND type = 'forecast' AND ref_id = ?", r.user_id, r.id))?.id ?? null),
    favoriteId: refs ? (refs.favorite.get(r.id) ?? null) : ((await get<{ id: string }>("SELECT id FROM favorites WHERE user_id = ? AND item_type = 'forecast' AND ref_id = ?", r.user_id, r.id))?.id ?? null),
    createdAt: r.created_at,
  };
}

export async function runMarketAnalysis(userId: string, input: { query: string; range: TrendsRange; geos: string[] }) {
  const provider = trendsProvider();
  if (!provider) {
    throw notConfigured("trends", "World demand data is not connected on this server. An administrator must configure SerpApi (SERPAPI_API_KEY), which provides Google Trends data.");
  }
  await assertWithinLimit(userId, "forecasts");
  const horizonDays = RANGES[input.range];

  const [areas, byCountry] = await Promise.all([
    Promise.all(
      input.geos.map(async (geo): Promise<AreaResult> => {
        try {
          const history = await provider.interestOverTime(input.query, geo === WORLDWIDE ? "" : geo, HISTORY);
          return analyseArea(geo, history, horizonDays);
        } catch (err) {
          const name = geo === WORLDWIDE ? "Worldwide" : (COUNTRY_NAME.get(geo) ?? geo);
          return { geo, name, status: "error", error: err instanceof TrendsError ? err.message : "Request failed", history: [], forecast: [], recentAvg: null, forecastAvg: null, changePct: null, periodChangePct: null, trend: null, confidence: null, peak: null };
        }
      }),
    ),
    provider.interestByCountry(input.query, HISTORY).then(
      (list) => ({ list: list.slice(0, 20), error: undefined as string | undefined }),
      (err) => ({ list: [] as CountryInterest[], error: err instanceof TrendsError ? err.message : "Request failed" }),
    ),
  ]);

  if (areas.every((a) => a.status === "error")) {
    throw upstreamError("trends", `Google Trends request failed: ${areas[0]?.error ?? "unknown error"}`);
  }
  const result: MarketResult = {
    source: "google_trends",
    metric: "search_interest_index",
    fetchedAt: nowIso(),
    horizonDays,
    areas,
    byCountry: byCountry.list,
    byCountryError: byCountry.error,
  };
  const status = areas.some((a) => a.status === "ok") ? "completed" : "no_data";
  const id = newId();
  await run(
    "INSERT INTO market_analyses (id,user_id,query,range,geos_json,status,result_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
    id, userId, input.query, input.range, JSON.stringify(input.geos), status, JSON.stringify(result), nowIso(),
  );
  await logActivity(userId, "market_analysis", "forecast", `World demand: ${input.query}`, { refId: id, success: status === "completed" });
  if (status === "completed") {
    await notify(userId, "forecast", "World demand analysis completed", `Search-interest analysis for "${input.query}" is ready.`, `/forecast?market=${id}`);
  }
  return getMarketAnalysis(userId, id);
}

export async function getMarketAnalysis(userId: string, id: string) {
  const r = await get<Row>("SELECT * FROM market_analyses WHERE id = ? AND user_id = ?", id, userId);
  if (!r) throw notFound("Analysis not found");
  return serialize(r);
}

export async function listMarketAnalyses(userId: string, limit = 20) {
  const refs = await savedRefs(userId, "forecast");
  return (await Promise.all((await all<Row>("SELECT * FROM market_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", userId, limit)).map(async (r) => {
    const s = await serialize(r, refs);
    // The list only needs the headline numbers.
    if (!s.result) return s;
    if ("kind" in s.result) return { ...s, result: { ...s.result, items: s.result.items.map((i) => ({ ...i, recent: [], seasonality: i.seasonality ? { ...i.seasonality, monthly: [], trendLine: [], outlook: [] } : null })) } };
    return { ...s, result: { ...s.result, areas: s.result.areas.map((a) => ({ ...a, history: [], forecast: [], seasonality: null })), byCountry: [] } };
  })));
}

export async function deleteMarketAnalysis(userId: string, id: string) {
  if ((await run("DELETE FROM market_analyses WHERE id = ? AND user_id = ?", id, userId)).changes === 0) throw notFound("Analysis not found");
  await run("DELETE FROM projects WHERE user_id = ? AND type = 'forecast' AND ref_id = ?", userId, id);
  await run("DELETE FROM favorites WHERE user_id = ? AND item_type = 'forecast' AND ref_id = ?", userId, id);
}

/** Headline for lists: the first area with a forecast (worldwide comes first when chosen). */
export function headline(a: Awaited<ReturnType<typeof serialize>>) {
  if (a.result && "kind" in a.result) {
    const best = [...a.result.items].filter((i) => i.seasonality).sort((x, y) => (y.seasonality!.next3Pct ?? -1e9) - (x.seasonality!.next3Pct ?? -1e9))[0];
    return best ? { name: best.query, changePct: best.seasonality!.next3Pct, periodChangePct: best.seasonality!.yoyPct, trend: best.seasonality!.direction } : null;
  }
  const areas = a.result?.areas ?? [];
  const top = areas.find((x) => x.status === "ok" && x.changePct !== null) ?? areas.find((x) => x.status === "ok") ?? null;
  return top ? { name: top.name, changePct: top.changePct, periodChangePct: top.periodChangePct, trend: top.trend } : null;
}

/** Compare 2-5 products in one area: which demand is growing, which is falling, and when. */
export async function runComparison(userId: string, input: { queries: string[]; geo: string }) {
  const provider = trendsProvider();
  if (!provider) {
    throw notConfigured("trends", "World demand data is not connected on this server. An administrator must configure SerpApi (SERPAPI_API_KEY), which provides Google Trends data.");
  }
  await assertWithinLimit(userId, "forecasts");
  const geoName = input.geo === WORLDWIDE ? "Worldwide" : (COUNTRY_NAME.get(input.geo) ?? input.geo);
  const items = await Promise.all(input.queries.map(async (query): Promise<CompareItem> => {
    try {
      const history = await provider.interestOverTime(query, input.geo === WORLDWIDE ? "" : input.geo, HISTORY);
      if (history.length === 0 || history.every((p) => p.units === 0)) return { query, status: "no_data", seasonality: null, recent: [] };
      const seasonality = analyseSeasonality(history);
      const recent = (seasonality?.monthly ?? []).slice(-24);
      return { query, status: seasonality ? "ok" : "no_data", seasonality, recent };
    } catch (err) {
      return { query, status: "error", error: err instanceof TrendsError ? err.message : "Request failed", seasonality: null, recent: [] };
    }
  }));
  if (items.every((i) => i.status === "error")) {
    throw upstreamError("trends", `Google Trends request failed: ${items[0]?.error ?? "unknown error"}`);
  }
  // Rank: biggest expected change over the next 3 months first.
  items.sort((a, b) => (b.seasonality?.next3Pct ?? -1e9) - (a.seasonality?.next3Pct ?? -1e9));
  const result: CompareResult = { kind: "compare", source: "google_trends", fetchedAt: nowIso(), geo: input.geo, geoName, items };
  const status = items.some((i) => i.status === "ok") ? "completed" : "no_data";
  const id = newId();
  const title = input.queries.join(", ");
  await run(
    "INSERT INTO market_analyses (id,user_id,query,range,geos_json,status,result_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
    id, userId, title, "compare", JSON.stringify([input.geo]), status, JSON.stringify(result), nowIso(),
  );
  await logActivity(userId, "market_analysis", "forecast", `World demand: ${title}`, { refId: id, success: status === "completed" });
  if (status === "completed") {
    await notify(userId, "forecast", "World demand analysis completed", `Search-interest analysis for "${title}" is ready.`, `/forecast?market=${id}`);
  }
  return getMarketAnalysis(userId, id);
}
