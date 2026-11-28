/**
 * Market Radar / "Top demand now": a fixed watchlist of popular products is checked on
 * Google Trends (5 years per product). Every number comes from that measured search interest.
 * Shared by all users and refreshed weekly to save provider requests.
 */
import { cached, DAY_MS } from "../intel/cache.js";
import { nowIso } from "../../lib/util.js";
import type { Msg, Point } from "./engine.js";
import { analyseSeasonality, type MonthEffect, type SeasonalAnalysis } from "./seasonal.js";
import { trendsProvider } from "./trends.js";

export type Category = "clothing" | "home" | "electronics" | "seasonal" | "kids" | "beauty" | "leisure";

/** Search terms as people in Uzbekistan type them; `label` is translated in the web app. */
export const WATCHLIST_UZ: { query: string; label: string; category: Category }[] = [
  { query: "куртка", label: "Jackets", category: "clothing" },
  { query: "кроссовки", label: "Sneakers", category: "clothing" },
  { query: "детская одежда", label: "Children's clothing", category: "kids" },
  { query: "школьная форма", label: "School uniforms", category: "kids" },
  { query: "рюкзак", label: "School backpacks", category: "kids" },
  { query: "обогреватель", label: "Heaters", category: "seasonal" },
  { query: "кондиционер", label: "Air conditioners", category: "seasonal" },
  { query: "вентилятор", label: "Fans", category: "seasonal" },
  { query: "ёлка", label: "New Year trees", category: "seasonal" },
  { query: "велосипед", label: "Bicycles", category: "leisure" },
  { query: "телефон", label: "Phones", category: "electronics" },
  { query: "ноутбук", label: "Laptops", category: "electronics" },
  { query: "телевизор", label: "TVs", category: "electronics" },
  { query: "холодильник", label: "Refrigerators", category: "home" },
  { query: "мебель", label: "Furniture", category: "home" },
  { query: "косметика", label: "Cosmetics", category: "beauty" },
];

export type TopItem = {
  query: string;
  label: string;
  category?: Category;
  nowVsAvgPct: number; // last 4 weeks vs the last 52 weeks average
  phase: SeasonalAnalysis["phase"] | null;
  next3Pct: number | null;
  yoyPct: number | null;
  direction?: SeasonalAnalysis["direction"] | null;
  peakMonths: number[];
  months?: MonthEffect[];
  nextRise?: SeasonalAnalysis["nextRise"];
  nextPeak?: SeasonalAnalysis["nextPeak"];
  confidence?: "high" | "medium" | "low" | null;
  events: SeasonalAnalysis["events"];
  recent: { month: string; value: number }[];
};
export type TopDemand = { geo: string; computedAt: string; checked: number; items: TopItem[]; top: TopItem[] };

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;

export function scoreItem(query: string, label: string, history: Point[], category?: Category): TopItem | null {
  if (history.length < 60 || history.every((p) => p.units === 0)) return null;
  const last4 = avg(history.slice(-4).map((p) => p.units));
  const lastYear = history.slice(-52).map((p) => p.units);
  const year = avg(lastYear);
  // Too little search volume (mostly empty weeks, or a tiny average) turns one spike into "+1200%".
  if (year < 2 || lastYear.filter((v) => v === 0).length > lastYear.length * 0.3) return null;
  const s = analyseSeasonality(history);
  return {
    query, label, category,
    nowVsAvgPct: r1(((last4 - year) / year) * 100),
    phase: s?.phase ?? null,
    next3Pct: s?.next3Pct ?? null,
    yoyPct: s?.yoyPct ?? null,
    direction: s?.direction ?? null,
    peakMonths: s?.peakMonths ?? [],
    months: s?.months ?? [],
    nextRise: s?.nextRise ?? null,
    nextPeak: s?.nextPeak ?? null,
    confidence: s?.model.confidence ?? null,
    events: s?.events ?? [],
    recent: (s?.monthly ?? []).slice(-12),
  };
}

export async function topDemand(geo = "UZ"): Promise<TopDemand | null> {
  const provider = trendsProvider();
  if (!provider) return null;
  return cached(`top2:${geo}`, 7 * DAY_MS, async () => {
    const items: TopItem[] = [];
    // A few requests at a time.
    for (let i = 0; i < WATCHLIST_UZ.length; i += 4) {
      const batch = await Promise.all(WATCHLIST_UZ.slice(i, i + 4).map(async (w) => {
        try {
          return scoreItem(w.query, w.label, await provider.interestOverTime(w.query, geo, "today 5-y"), w.category);
        } catch {
          return null;
        }
      }));
      for (const it of batch) if (it) items.push(it);
    }
    items.sort((a, b) => b.nowVsAvgPct - a.nowVsAvgPct);
    return { geo, computedAt: nowIso(), checked: WATCHLIST_UZ.length, items, top: items.filter((i) => i.nowVsAvgPct > 0).slice(0, 3) } satisfies TopDemand;
  }, (r) => r.items.length > 0);
}

// ---------- Market Radar ----------

export type RadarUpdate = { query: string; label: string; kind: "surge" | "drop" | "season_soon" | "growing_year" | "declining_year"; msg: Msg };
export type Radar = TopDemand & { rising: TopItem[]; declining: TopItem[]; upcoming: TopItem[]; updates: RadarUpdate[] };

/** Rising / declining products and notable changes, all from the measured watchlist data. */
export function buildRadar(data: TopDemand): Radar {
  const rising = data.items.filter((i) => i.nowVsAvgPct >= 10 || (i.next3Pct ?? 0) >= 10).sort((a, b) => (b.next3Pct ?? b.nowVsAvgPct) - (a.next3Pct ?? a.nowVsAvgPct));
  const declining = data.items.filter((i) => i.nowVsAvgPct <= -10 || (i.next3Pct ?? 0) <= -10).sort((a, b) => (a.next3Pct ?? a.nowVsAvgPct) - (b.next3Pct ?? b.nowVsAvgPct));
  const upcoming = data.items.filter((i) => i.nextRise && i.nextRise.months <= 2 && i.phase !== "peak" && i.phase !== "rising" && i.direction !== "declining").sort((a, b) => a.nextRise!.months - b.nextRise!.months);
  const updates: RadarUpdate[] = [];
  for (const i of data.items) {
    const base = { query: i.query, label: i.label };
    if (i.nowVsAvgPct >= 25) updates.push({ ...base, kind: "surge", msg: { key: "{label}: interest is {pct}% above its yearly average right now.", vars: { label: i.label, pct: i.nowVsAvgPct } } });
    if (i.nowVsAvgPct <= -25) updates.push({ ...base, kind: "drop", msg: { key: "{label}: interest is {pct}% below its yearly average right now.", vars: { label: i.label, pct: Math.abs(i.nowVsAvgPct) } } });
    if (i.nextRise && i.nextRise.months <= 2 && i.phase !== "rising" && i.phase !== "peak" && i.direction !== "declining") updates.push({ ...base, kind: "season_soon", msg: { key: "{label}: the season usually starts in {months} month(s) — prepare stock and advertising now.", vars: { label: i.label, months: Math.max(1, i.nextRise.months) } } });
    if ((i.yoyPct ?? 0) >= 15) updates.push({ ...base, kind: "growing_year", msg: { key: "{label}: {pct}% more interest over the last 12 months than the year before.", vars: { label: i.label, pct: i.yoyPct! } } });
    if ((i.yoyPct ?? 0) <= -15) updates.push({ ...base, kind: "declining_year", msg: { key: "{label}: {pct}% less interest over the last 12 months than the year before.", vars: { label: i.label, pct: Math.abs(i.yoyPct!) } } });
  }
  return { ...data, rising, declining, upcoming, updates };
}

// ---------- Business Opportunity Finder ----------

export type Opportunity = {
  query: string;
  label: string;
  category?: Category;
  score: number; // 0..100, relative ranking only
  reasons: Msg[];
  evidence: { yoyPct: number | null; next3Pct: number | null; nowVsAvgPct: number; confidence: string | null; peakMonths: number[] };
};

/**
 * Ranks watchlist products by measured momentum: yearly growth, the back-tested 3-month outlook,
 * the current level versus the yearly average and an upcoming season.
 */
export function findOpportunities(data: TopDemand): Opportunity[] {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const out: Opportunity[] = [];
  for (const i of data.items) {
    const yoy = i.yoyPct ?? 0, next3 = i.next3Pct ?? 0;
    // A season of a product in long-term decline is a smaller bump each year, not an opportunity.
    const seasonSoon = Boolean(i.nextRise && i.nextRise.months <= 3 && i.phase !== "falling" && i.direction !== "declining");
    const raw = 0.45 * clamp(yoy, -50, 100) + 0.35 * clamp(next3, -50, 100) + 0.2 * clamp(i.nowVsAvgPct, -50, 100) + (seasonSoon ? 10 : 0);
    if (raw <= 3) continue;
    const reasons: Msg[] = [];
    if (yoy > 5) reasons.push({ key: "Search interest grew {pct}% over the last 12 months compared with the year before.", vars: { pct: yoy } });
    if (next3 > 5) reasons.push({ key: "The model expects {pct}% more interest over the next 3 months than the last 3.", vars: { pct: next3 } });
    if (i.nowVsAvgPct > 5) reasons.push({ key: "Interest right now is {pct}% above its yearly average.", vars: { pct: i.nowVsAvgPct } });
    if (seasonSoon) reasons.push({ key: "Its season usually starts in {months} month(s), so there is time to prepare.", vars: { months: Math.max(1, i.nextRise!.months) } });
    if (i.confidence === "low") reasons.push({ key: "Note: the forecast for this product has low accuracy in back-tests; treat it as a weak signal." });
    out.push({
      query: i.query, label: i.label, category: i.category,
      score: Math.round(clamp(raw, 0, 100)),
      reasons,
      evidence: { yoyPct: i.yoyPct, next3Pct: i.next3Pct, nowVsAvgPct: i.nowVsAvgPct, confidence: i.confidence ?? null, peakMonths: i.peakMonths },
    });
  }
  return out.sort((a, b) => b.score - a.score);
}
