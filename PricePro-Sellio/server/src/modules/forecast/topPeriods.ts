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
  /** Change against the period before (null when there was no interest before). */
  changePct: number | null;
  /** The period's points (shared scale, 0–100), aligned with `dates`. */
  series: number[];
  /** The period before, same scale and length (missing points are null). */
  prevSeries: (number | null)[];
};
export type TopPeriods = {
  period: Period; geo: string; computedAt: string;
  /** The last complete calendar period (week Mon–Sun, month, quarter, year) and the one before. */
  from: string | null; to: string | null; prevFrom: string | null; prevTo: string | null;
  dates: string[];
  /** false when the provider can only compare a product with itself (then only the change is meaningful). */
  comparable: boolean;
  mostWanted: TopPeriodItem[];
  leastWanted: TopPeriodItem[];
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

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => Date.UTC(y, m, d);

/**
 * The last complete calendar period that ends on or before `last` (the data's last covered day),
 * and the period before it: [start, end] inclusive, as UTC timestamps.
 */
export function calendarWindows(period: Period, last: number): { cur: [number, number]; prev: [number, number] } {
  const day = 86_400_000;
  const d = new Date(last);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (period === "week") {
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    const end = dow === 6 ? last : last - (dow + 1) * day; // the last Sunday on or before `last`
    return { cur: [end - 6 * day, end], prev: [end - 13 * day, end - 7 * day] };
  }
  if (period === "month") {
    const complete = utc(y, m + 1, 0) <= last;
    const start = utc(y, m - (complete ? 0 : 1), 1);
    const s = new Date(start);
    return { cur: [start, utc(s.getUTCFullYear(), s.getUTCMonth() + 1, 0)], prev: [utc(s.getUTCFullYear(), s.getUTCMonth() - 1, 1), start - day] };
  }
  if (period === "quarter") {
    const q0 = Math.floor(m / 3) * 3;
    const complete = utc(y, q0 + 3, 0) <= last;
    const start = utc(y, q0 - (complete ? 0 : 3), 1);
    const s = new Date(start);
    return { cur: [start, utc(s.getUTCFullYear(), s.getUTCMonth() + 3, 0)], prev: [utc(s.getUTCFullYear(), s.getUTCMonth() - 3, 1), start - day] };
  }
  const yy = utc(y, 11, 31) <= last ? y : y - 1;
  return { cur: [utc(yy, 0, 1), utc(yy, 11, 31)], prev: [utc(yy - 1, 0, 1), utc(yy - 1, 11, 31)] };
}

export async function topForPeriod(period: Period, geo = "UZ"): Promise<TopPeriods | null> {
  const cfg = PERIODS[period];
  const data = await sharedSeries(geo, cfg.range, cfg.ttl);
  if (!data) return null;
  const all = Object.values(data.series).flatMap((s) => s.map((p) => p.date)).sort();
  if (all.length === 0) return null;
  const day = 86_400_000;
  // Weekly points stand for 7 days (dated by their first day).
  const step = new Set(all).size > 1 ? Math.max(1, Math.round((Date.parse(all[all.length - 1]) - Date.parse(all[0])) / day / (new Set(all).size - 1))) : 1;
  const span = step >= 6 ? 7 : 1;
  const last = Date.parse(all[all.length - 1]) + (span - 1) * day;
  const { cur, prev } = calendarWindows(period, last);
  // A weekly point belongs to the period that holds most of its days (its 4th day).
  const at = (p: Point) => Date.parse(p.date) + (span === 7 ? 3 * day : 0);
  const inside = (p: Point, w: [number, number]) => at(p) >= w[0] && at(p) <= w[1];
  const need = (w: [number, number]) => Math.max(1, Math.floor(((w[1] - w[0]) / day + 1) / span * 0.8));
  const hasPrev = Date.parse(all[0]) <= prev[0] + 3 * day;
  const rows = WATCHLIST_UZ.map((w) => {
    const s = data.series[w.query] ?? [];
    const c = s.filter((p) => inside(p, cur)), b = s.filter((p) => inside(p, prev));
    return { w, cur: c, prev: b, now: avg(c.map((p) => p.units)), before: hasPrev && b.length >= need(prev) ? avg(b.map((p) => p.units)) : null };
  }).filter((r) => r.cur.length >= need(cur));
  if (rows.length === 0) return null;
  const dates = [...new Set(rows.flatMap((r) => r.cur.map((p) => p.date)))].sort();
  const top = Math.max(0, ...rows.map((r) => r.now));
  const scale = (v: number) => (top > 0 ? r1((v / top) * 100) : 0);
  const items: TopPeriodItem[] = rows.map((r) => {
    const byDate = new Map(r.cur.map((p) => [p.date, p.units]));
    const prevVals = r.prev.map((p) => scale(p.units));
    return {
      query: r.w.query, label: r.w.label, category: r.w.category,
      index: top > 0 ? Math.round((r.now / top) * 100) : 0,
      changePct: r.before && r.before > 0 ? r1(((r.now - r.before) / r.before) * 100) : null,
      series: dates.map((d) => scale(byDate.get(d) ?? 0)),
      prevSeries: dates.map((_, i) => prevVals[i] ?? null),
    };
  });
  const key = (i: TopPeriodItem) => (data.comparable ? i.index : (i.changePct ?? 0));
  const ranked = [...items].sort((a, b) => key(b) - key(a));
  return {
    period, geo, computedAt: data.computedAt, comparable: data.comparable,
    from: iso(cur[0]), to: iso(cur[1]), prevFrom: hasPrev ? iso(prev[0]) : null, prevTo: hasPrev ? iso(prev[1]) : null,
    dates,
    mostWanted: ranked,
    leastWanted: [...ranked].reverse(),
    fastestGrowing: items.filter((i) => (i.changePct ?? 0) > 0).sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0)),
    declining: items.filter((i) => (i.changePct ?? 0) < 0).sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0)),
  };
}

// ---------------------------------------------------------------- last calendar month

export type LastMonthItem = {
  query: string; label: string; category?: Category;
  /** Demand in the month on a shared scale: 100 = the most searched product of the month. */
  index: number;
  /** Change against the month before (null when it is not fully covered or had no interest). */
  changePct: number | null;
};
export type LastMonthTop = {
  geo: string; computedAt: string; month: string; // "YYYY-MM"
  comparable: boolean; checked: number;
  best: LastMonthItem[]; worst: LastMonthItem[]; items: LastMonthItem[];
};

/**
 * The last complete calendar month: which watched products were searched most and least in it
 * (all on one scale), and how each changed against the month before. Daily data, shared cache.
 */
export async function lastMonthTop(geo = "UZ"): Promise<LastMonthTop | null> {
  const t = await topForPeriod("month", geo);
  if (!t || !t.from) return null;
  const strip = (i: TopPeriodItem): LastMonthItem => ({ query: i.query, label: i.label, category: i.category, index: i.index, changePct: i.changePct });
  const best = t.mostWanted.slice(0, 3);
  return {
    geo, computedAt: t.computedAt, month: t.from.slice(0, 7), comparable: t.comparable, checked: WATCHLIST_UZ.length,
    best: best.map(strip), worst: t.leastWanted.filter((i) => !best.includes(i)).slice(0, 3).map(strip), items: t.mostWanted.map(strip),
  };
}
