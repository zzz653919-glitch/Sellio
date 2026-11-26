/**
 * "Top products" for a chosen period (last week / month / 3 months / year): which watched products
 * people searched for most in Uzbekistan, and which grew the most against the period just before.
 *
 * Google Trends puts at most 5 queries on one shared scale. Products are fetched 4 at a time together
 * with one "anchor" product that is in every request; dividing by the anchor joins all requests onto one
 * scale, so every product can be compared with every other one. Search interest is a relative index,
 * not the number of items sold.
 */
import { cached, DAY_MS } from "../intel/cache.js";
import { nowIso } from "../../lib/util.js";
import type { Point } from "./engine.js";
import { WATCHLIST_UZ, type Category } from "./topDemand.js";
import { trendsProvider, type TrendsRange } from "./trends.js";

export type Period = "week" | "month" | "quarter" | "year";
export const PERIODS: Record<Period, { range: TrendsRange; days: number; ttl: number }> = {
  // daily data for the short periods, weekly data for the long ones
  week: { range: "today 3-m", days: 7, ttl: DAY_MS },
  month: { range: "today 3-m", days: 30, ttl: DAY_MS },
  quarter: { range: "today 12-m", days: 91, ttl: 3 * DAY_MS },
  year: { range: "today 5-y", days: 364, ttl: 7 * DAY_MS },
};

const ANCHOR = "телефон";

export type TopPeriodItem = {
  query: string; label: string; category?: Category;
  /** Demand in the period on a shared scale: 100 = the most searched product. */
  index: number;
  /** Change against the same length just before (null when there was no interest before). */
  changePct: number | null;
  /** The period's points (shared scale, 0–100) for a small chart. */
  series: number[];
};
export type TopPeriods = {
  period: Period; geo: string; computedAt: string; from: string | null; to: string | null;
  /** false when the provider can only compare a product with itself (then only the change is meaningful). */
  comparable: boolean;
  mostWanted: TopPeriodItem[];
  fastestGrowing: TopPeriodItem[];
  declining: TopPeriodItem[];
};

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** All watched products on one scale for one Trends range (shared by all users, cached). */
async function sharedSeries(geo: string, range: TrendsRange, ttl: number) {
  const provider = trendsProvider();
  if (!provider) return null;
  return cached(`toprange:${geo}:${range}`, ttl, async () => {
    const others = WATCHLIST_UZ.map((w) => w.query).filter((q) => q !== ANCHOR);
    const series: Record<string, Point[]> = {};
    let comparable = Boolean(provider.interestOverTimeMulti);
    if (provider.interestOverTimeMulti) {
      let refAnchor = 0;
      for (let i = 0; i < others.length; i += 4) {
        const group = others.slice(i, i + 4);
        const got = await provider.interestOverTimeMulti([ANCHOR, ...group], geo, range).catch(() => null);
        if (!got) { comparable = false; continue; }
        const anchorSum = (got[ANCHOR] ?? []).reduce((s, p) => s + p.units, 0);
        if (i === 0) { refAnchor = anchorSum; series[ANCHOR] = got[ANCHOR] ?? []; }
        const k = anchorSum > 0 && refAnchor > 0 ? refAnchor / anchorSum : 1;
        if (anchorSum <= 0) comparable = false;
        for (const q of group) series[q] = (got[q] ?? []).map((p) => ({ date: p.date, units: p.units * k }));
      }
    } else {
      // One product per request: each series is on its own scale.
      for (const q of [ANCHOR, ...others]) series[q] = await provider.interestOverTime(q, geo, range).catch(() => []);
    }
    return { computedAt: nowIso(), comparable, series };
  }, (r) => Object.values(r.series).some((s) => s.length > 0));
}

export async function topForPeriod(period: Period, geo = "UZ"): Promise<TopPeriods | null> {
  const cfg = PERIODS[period];
  const data = await sharedSeries(geo, cfg.range, cfg.ttl);
  if (!data) return null;
  // Windows by calendar days (works with daily and weekly data): the last N days and the N days before.
  const lastDate = Object.values(data.series).flatMap((s) => s.map((p) => p.date)).sort().pop();
  if (!lastDate) return null;
  const end = Date.parse(lastDate);
  const day = 86_400_000;
  const inWin = (p: Point, from: number, to: number) => { const t = Date.parse(p.date); return t > end - to * day && t <= end - from * day; };
  const firstDate = Object.values(data.series).flatMap((s) => s.map((p) => p.date)).sort()[0];
  const hasPrev = Date.parse(firstDate) <= end - (2 * cfg.days - 7) * day;
  const rows = WATCHLIST_UZ.map((w) => {
    const s = data.series[w.query] ?? [];
    const cur = s.filter((p) => inWin(p, 0, cfg.days)), prev = s.filter((p) => inWin(p, cfg.days, 2 * cfg.days));
    return { w, cur, now: avg(cur.map((p) => p.units)), before: hasPrev && prev.length ? avg(prev.map((p) => p.units)) : null };
  }).filter((r) => r.cur.length > 0);
  const top = Math.max(0, ...rows.map((r) => r.now));
  const items: TopPeriodItem[] = rows.map((r) => ({
    query: r.w.query, label: r.w.label, category: r.w.category,
    index: top > 0 ? Math.round((r.now / top) * 100) : 0,
    changePct: r.before && r.before > 0 ? r1(((r.now - r.before) / r.before) * 100) : null,
    series: r.cur.map((p) => (top > 0 ? r1((p.units / top) * 100) : 0)),
  }));
  const dates = rows.flatMap((r) => r.cur.map((p) => p.date)).sort();
  return {
    period, geo, computedAt: data.computedAt, comparable: data.comparable,
    from: dates[0] ?? null, to: dates[dates.length - 1] ?? null,
    mostWanted: [...items].sort((a, b) => b.index - a.index),
    fastestGrowing: items.filter((i) => (i.changePct ?? 0) > 0).sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0)),
    declining: items.filter((i) => (i.changePct ?? 0) < 0).sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0)),
  };
}
