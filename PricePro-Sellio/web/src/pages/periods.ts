/**
 * Views of a 5-year search series by period: weeks, seasons and calendar years.
 * Pure functions over the data the server sent; nothing is estimated beyond simple averages.
 */
export type Pt = { date: string; units: number };
export type MonthPoint = { month: string; value: number }; // "YYYY-MM"
export type Rating = "best" | "good" | "normal" | "slow" | "worst";

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;
const pct = (a: number, b: number) => (b > 0 ? r1(((a - b) / b) * 100) : null);

// ------------------------------------------------------------------ seasons
export type SeasonKey = "winter" | "spring" | "summer" | "autumn";
export const SEASON_MONTHS: Record<SeasonKey, number[]> = { winter: [12, 1, 2], spring: [3, 4, 5], summer: [6, 7, 8], autumn: [9, 10, 11] };

/** Average seasonal effect of each season (from the monthly effects), rated against the others. */
export function seasonsOf(months: { month: number; effectPct: number }[], hasSeason: boolean) {
  const eff = new Map(months.map((m) => [m.month, m.effectPct]));
  const list = (Object.keys(SEASON_MONTHS) as SeasonKey[]).map((key) => ({
    key, months: SEASON_MONTHS[key], effectPct: r1(mean(SEASON_MONTHS[key].map((m) => eff.get(m) ?? 0))),
  }));
  const max = Math.max(...list.map((x) => x.effectPct)), min = Math.min(...list.map((x) => x.effectPct));
  return list.map((x) => ({
    ...x,
    rating: (!hasSeason ? "normal"
      : x.effectPct === max && x.effectPct >= 8 ? "best"
      : x.effectPct === min && x.effectPct <= -8 ? "worst"
      : x.effectPct >= 5 ? "good" : x.effectPct <= -5 ? "slow" : "normal") as Rating,
  }));
}

// ------------------------------------------------------------------ years
export type YearRow = { year: number; months: number[]; avg: number; changePct: number | null; peakMonth: number; partial: boolean };

/**
 * Calendar-year averages. The change is measured against the previous year over the same months,
 * so a part year (the current one, or the first one) is still compared fairly.
 */
export function yearsOf(monthly: MonthPoint[]): YearRow[] {
  const byYear = new Map<number, Map<number, number>>();
  for (const m of monthly) {
    const y = Number(m.month.slice(0, 4)), mo = Number(m.month.slice(5, 7));
    if (!byYear.has(y)) byYear.set(y, new Map());
    byYear.get(y)!.set(mo, m.value);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  return years.map((y, i) => {
    const cur = byYear.get(y)!;
    const months = [...cur.keys()].sort((a, b) => a - b);
    const prev = i > 0 ? byYear.get(years[i - 1])! : null;
    const common = prev ? months.filter((m) => prev.has(m)) : [];
    const changePct = prev && common.length >= 3 ? pct(mean(common.map((m) => cur.get(m)!)), mean(common.map((m) => prev.get(m)!))) : null;
    const peakMonth = months.reduce((best, m) => (cur.get(m)! > cur.get(best)! ? m : best), months[0]);
    return { year: y, months, avg: r1(mean(months.map((m) => cur.get(m)!))), changePct, peakMonth, partial: months.length < 12 };
  });
}

// ------------------------------------------------------------------ weeks
/** ISO week number (1..53) of a "YYYY-MM-DD" date. */
export function isoWeek(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday of the same ISO week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export type WeekOfYear = { week: number; start: string; end: string; effectPct: number; years: number };

/**
 * Weeks: the last 12 weeks, the last 4 weeks versus the 4 before and versus the same weeks a year
 * earlier, and the strongest / weakest weeks of the year (each week divided by the average of the
 * year around it, so long-term growth or decline does not distort it; averaged over the years).
 */
export function weeksOf(weekly: Pt[]) {
  const w = weekly.filter((p) => Number.isFinite(p.units));
  const n = w.length;
  const recent = w.slice(-12);
  const last4 = mean(w.slice(-4).map((p) => p.units));
  const prev4 = mean(w.slice(-8, -4).map((p) => p.units));
  const yearAgo4 = n >= 56 ? mean(w.slice(-56, -52).map((p) => p.units)) : 0;
  const groups = new Map<number, { ratios: number[]; last: string }>();
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - 26), hi = Math.min(n, i + 27);
    if (hi - lo < 40) continue; // too close to the edges for a fair yearly average
    const base = mean(w.slice(lo, hi).map((p) => p.units));
    if (base <= 0) continue;
    const k = isoWeek(w[i].date);
    const g = groups.get(k) ?? { ratios: [], last: w[i].date };
    g.ratios.push(w[i].units / base);
    g.last = w[i].date;
    groups.set(k, g);
  }
  const plusDays = (date: string, d: number) => new Date(Date.parse(`${date}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);
  const weeks: WeekOfYear[] = [...groups.entries()]
    .filter(([, g]) => g.ratios.length >= 3)
    .map(([week, g]) => ({ week, start: g.last, end: plusDays(g.last, 6), effectPct: r1((mean(g.ratios) - 1) * 100), years: g.ratios.length }));
  const sorted = [...weeks].sort((a, b) => b.effectPct - a.effectPct);
  return {
    recent,
    last4: r1(last4),
    last4VsPrevPct: pct(last4, prev4),
    last4VsYearAgoPct: yearAgo4 > 0 ? pct(last4, yearAgo4) : null,
    top: sorted.slice(0, 3).filter((x) => x.effectPct > 5),
    bottom: sorted.slice(-3).reverse().filter((x) => x.effectPct < -5),
  };
}
