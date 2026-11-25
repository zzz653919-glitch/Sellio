/**
 * "Top demand now": a fixed watchlist of popular products is checked on Google Trends
 * (5 years per product) and ranked by how far current interest is above each product's
 * own yearly average. Shared by all users and refreshed weekly to save provider requests.
 */
import { get, run } from "../../db/index.js";
import { nowIso } from "../../lib/util.js";
import type { Point } from "./engine.js";
import { analyseSeasonality, type SeasonalAnalysis } from "./seasonal.js";
import { trendsProvider } from "./trends.js";

/** Search terms as people in Uzbekistan type them; `label` is translated in the web app. */
export const WATCHLIST_UZ: { query: string; label: string }[] = [
  { query: "куртка", label: "Jackets" },
  { query: "обогреватель", label: "Heaters" },
  { query: "кондиционер", label: "Air conditioners" },
  { query: "вентилятор", label: "Fans" },
  { query: "рюкзак", label: "School backpacks" },
  { query: "ёлка", label: "New Year trees" },
  { query: "кроссовки", label: "Sneakers" },
  { query: "велосипед", label: "Bicycles" },
  { query: "телефон", label: "Phones" },
  { query: "ноутбук", label: "Laptops" },
  { query: "телевизор", label: "TVs" },
  { query: "холодильник", label: "Refrigerators" },
];

export type TopItem = {
  query: string;
  label: string;
  nowVsAvgPct: number; // last 4 weeks vs the last 52 weeks average
  phase: SeasonalAnalysis["phase"] | null;
  next3Pct: number | null;
  yoyPct: number | null;
  peakMonths: number[];
  events: SeasonalAnalysis["events"];
  recent: { month: string; value: number }[];
};
export type TopDemand = { geo: string; computedAt: string; checked: number; items: TopItem[]; top: TopItem[] };

const TTL_MS = 7 * 24 * 3600 * 1000;
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;

export function scoreItem(query: string, label: string, history: Point[]): TopItem | null {
  if (history.length < 60 || history.every((p) => p.units === 0)) return null;
  const last4 = avg(history.slice(-4).map((p) => p.units));
  const year = avg(history.slice(-52).map((p) => p.units));
  if (year <= 0) return null;
  const s = analyseSeasonality(history);
  return {
    query, label,
    nowVsAvgPct: r1(((last4 - year) / year) * 100),
    phase: s?.phase ?? null,
    next3Pct: s?.next3Pct ?? null,
    yoyPct: s?.yoyPct ?? null,
    peakMonths: s?.peakMonths ?? [],
    events: s?.events ?? [],
    recent: (s?.monthly ?? []).slice(-12),
  };
}

let inFlight: Promise<TopDemand> | null = null;

export async function topDemand(geo = "UZ"): Promise<TopDemand | null> {
  const provider = trendsProvider();
  if (!provider) return null;
  const key = `top:${geo}`;
  const cached = await get<{ data_json: string; created_at: string }>("SELECT data_json, created_at FROM trend_cache WHERE key = ?", key);
  if (cached && Date.now() - Date.parse(cached.created_at) < TTL_MS) return JSON.parse(cached.data_json) as TopDemand;
  inFlight ??= (async () => {
    const items: TopItem[] = [];
    // A few requests at a time.
    for (let i = 0; i < WATCHLIST_UZ.length; i += 4) {
      const batch = await Promise.all(WATCHLIST_UZ.slice(i, i + 4).map(async (w) => {
        try {
          return scoreItem(w.query, w.label, await provider.interestOverTime(w.query, geo, "today 5-y"));
        } catch {
          return null;
        }
      }));
      for (const it of batch) if (it) items.push(it);
    }
    items.sort((a, b) => b.nowVsAvgPct - a.nowVsAvgPct);
    const result: TopDemand = { geo, computedAt: nowIso(), checked: WATCHLIST_UZ.length, items, top: items.filter((i) => i.nowVsAvgPct > 0).slice(0, 3) };
    if (items.length > 0) {
      await run(
        "INSERT INTO trend_cache (key, data_json, created_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data_json = excluded.data_json, created_at = excluded.created_at",
        key, JSON.stringify(result), result.computedAt,
      );
    }
    return result;
  })().finally(() => { inFlight = null; });
  return inFlight;
}
