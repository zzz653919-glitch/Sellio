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

/** Look-back window → how far ahead the interest forecast goes. */
export const RANGES: Record<TrendsRange, number> = { "today 3-m": 30, "today 12-m": 90, "today 5-y": 180 };

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
  peak: Point | null;
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

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;

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
  const out = runForecast(history, horizonDays, granularity);
  if (out.status !== "ok") {
    const recent = history.slice(-4).map((p) => p.units);
    return { ...base, status: "ok", granularity, peak, periodChangePct, recentAvg: r1(avg(recent)), note: "Not enough history for a forecast in this area; only past interest is shown." };
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
    peak,
  };
}

type Row = { id: string; user_id: string; query: string; range: TrendsRange; geos_json: string; status: "completed" | "no_data"; result_json: string; created_at: string };

function serialize(r: Row) {
  return {
    id: r.id,
    query: r.query,
    range: r.range,
    geos: safeJson<string[]>(r.geos_json, []),
    status: r.status,
    result: safeJson<MarketResult | null>(r.result_json, null),
    projectId: get<{ id: string }>("SELECT id FROM projects WHERE user_id = ? AND type = 'forecast' AND ref_id = ?", r.user_id, r.id)?.id ?? null,
    favoriteId: get<{ id: string }>("SELECT id FROM favorites WHERE user_id = ? AND item_type = 'forecast' AND ref_id = ?", r.user_id, r.id)?.id ?? null,
    createdAt: r.created_at,
  };
}

export async function runMarketAnalysis(userId: string, input: { query: string; range: TrendsRange; geos: string[] }) {
  const provider = trendsProvider();
  if (!provider) {
    throw notConfigured("trends", "World demand data is not connected on this server. An administrator must configure SerpApi (SERPAPI_API_KEY), which provides Google Trends data.");
  }
  assertWithinLimit(userId, "forecasts");
  const horizonDays = RANGES[input.range];

  const [areas, byCountry] = await Promise.all([
    Promise.all(
      input.geos.map(async (geo): Promise<AreaResult> => {
        try {
          const history = await provider.interestOverTime(input.query, geo === WORLDWIDE ? "" : geo, input.range);
          return analyseArea(geo, history, horizonDays);
        } catch (err) {
          const name = geo === WORLDWIDE ? "Worldwide" : (COUNTRY_NAME.get(geo) ?? geo);
          return { geo, name, status: "error", error: err instanceof TrendsError ? err.message : "Request failed", history: [], forecast: [], recentAvg: null, forecastAvg: null, changePct: null, periodChangePct: null, trend: null, confidence: null, peak: null };
        }
      }),
    ),
    provider.interestByCountry(input.query, input.range).then(
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
  run(
    "INSERT INTO market_analyses (id,user_id,query,range,geos_json,status,result_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
    id, userId, input.query, input.range, JSON.stringify(input.geos), status, JSON.stringify(result), nowIso(),
  );
  logActivity(userId, "market_analysis", "forecast", `World demand: ${input.query}`, { refId: id, success: status === "completed" });
  if (status === "completed") {
    notify(userId, "forecast", "World demand analysis completed", `Search-interest analysis for "${input.query}" is ready.`, `/forecast?market=${id}`);
  }
  return getMarketAnalysis(userId, id);
}

export function getMarketAnalysis(userId: string, id: string) {
  const r = get<Row>("SELECT * FROM market_analyses WHERE id = ? AND user_id = ?", id, userId);
  if (!r) throw notFound("Analysis not found");
  return serialize(r);
}

export function listMarketAnalyses(userId: string, limit = 20) {
  return all<Row>("SELECT * FROM market_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", userId, limit).map((r) => {
    const s = serialize(r);
    // The list only needs the headline numbers.
    return { ...s, result: s.result ? { ...s.result, areas: s.result.areas.map((a) => ({ ...a, history: [], forecast: [] })), byCountry: [] } : null };
  });
}

export function deleteMarketAnalysis(userId: string, id: string) {
  if (run("DELETE FROM market_analyses WHERE id = ? AND user_id = ?", id, userId).changes === 0) throw notFound("Analysis not found");
  run("DELETE FROM projects WHERE user_id = ? AND type = 'forecast' AND ref_id = ?", userId, id);
  run("DELETE FROM favorites WHERE user_id = ? AND item_type = 'forecast' AND ref_id = ?", userId, id);
}

/** Headline for lists: the first area with a forecast (worldwide comes first when chosen). */
export function headline(a: ReturnType<typeof serialize>) {
  const areas = a.result?.areas ?? [];
  const top = areas.find((x) => x.status === "ok" && x.changePct !== null) ?? areas.find((x) => x.status === "ok") ?? null;
  return top ? { name: top.name, changePct: top.changePct, periodChangePct: top.periodChangePct, trend: top.trend } : null;
}
