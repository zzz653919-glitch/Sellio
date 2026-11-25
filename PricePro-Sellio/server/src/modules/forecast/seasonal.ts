/**
 * Seasonal demand analysis on monthly search interest (5 years of Google Trends).
 *
 * - STL decomposition (Cleveland et al., 1990) with a periodic seasonal component and
 *   robustness iterations: splits the series into trend + seasonal + remainder.
 * - Forecast candidates, chosen by a hold-out back-test on the last 12 months:
 *     1. Prophet-style regression (piecewise-linear trend with regularised changepoints +
 *        yearly Fourier terms), the model behind Meta's Prophet, fitted by ridge least squares;
 *     2. STL seasonal + damped trend;
 *     3. Seasonal naive (same month last year).
 * - From the seasonal component: which months demand rises and falls, how consistent that is
 *   across years, the next rise / peak / fall dates, and calendar events that line up with it
 *   (back to school, New Year, Navruz, 8 March, summer, ...).
 *
 * Everything is computed from the provider's data; nothing is invented.
 */
import type { Point } from "./engine.js";

export type MonthlyPoint = { month: string; value: number }; // month = "YYYY-MM"

export type SeasonEvent = "school" | "new_year" | "navruz_march8" | "valentine" | "summer" | "winter" | "black_friday" | "autumn" | "spring";

export type MonthEffect = {
  month: number; // 1..12
  effectPct: number; // seasonal effect vs the average level, in %
  consistency: number; // share of years in which this month was on the same side of the trend (0..1)
};

export type SeasonPoint = { date: string; months: number };

export type SeasonalAnalysis = {
  method: string;
  years: number;
  monthsOfData: number;
  monthly: MonthlyPoint[];
  trendLine: MonthlyPoint[];
  strength: number; // 0..1 (Hyndman's seasonal strength)
  level: "strong" | "moderate" | "weak" | "none";
  months: MonthEffect[];
  peakMonths: number[];
  lowMonths: number[];
  events: SeasonEvent[];
  phase: "rising" | "peak" | "falling" | "low" | "normal";
  nextRise: SeasonPoint | null;
  nextPeak: SeasonPoint | null;
  nextFall: SeasonPoint | null;
  nextLow: SeasonPoint | null;
  yoyPct: number | null; // last 12 months vs the 12 before
  direction: "growing" | "declining" | "stable";
  outlook: { date: string; value: number; lower: number; upper: number }[];
  next3Pct: number | null; // next 3 months (forecast) vs last 3 months (actual)
  model: { name: string; smapePct: number; confidence: "high" | "medium" | "low"; holdoutMonths: number };
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const variance = (a: number[]) => {
  const m = mean(a);
  return a.length ? a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length : 0;
};
const monthIndex = (ym: string) => Number(ym.slice(5, 7)); // 1..12
const addMonths = (ym: string, k: number) => {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7)) - 1 + k;
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 7);
};

/** Weekly (or daily) points → monthly averages. Months with fewer than 3 observations are dropped. */
export function toMonthly(points: Point[]): MonthlyPoint[] {
  const groups = new Map<string, number[]>();
  for (const p of points) {
    const k = p.date.slice(0, 7);
    groups.set(k, [...(groups.get(k) ?? []), p.units]);
  }
  const keys = [...groups.keys()].sort();
  const minObs = points.length > keys.length * 2 ? 3 : 1; // weekly/daily data vs already monthly
  return keys.filter((k) => groups.get(k)!.length >= minObs).map((k) => ({ month: k, value: mean(groups.get(k)!) }));
}

// ------------------------------------------------------------------ STL
/** Local linear regression (LOESS) with tricube weights, evaluated at every index. */
function loess(y: number[], span: number, weights?: number[]): number[] {
  const n = y.length;
  const q = Math.min(n, Math.max(3, span));
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    // q nearest neighbours of i
    let lo = Math.max(0, i - Math.floor(q / 2));
    let hi = Math.min(n - 1, lo + q - 1);
    lo = Math.max(0, hi - q + 1);
    const maxDist = Math.max(i - lo, hi - i) + 1;
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let j = lo; j <= hi; j++) {
      const u = Math.abs(j - i) / maxDist;
      const w = (1 - u ** 3) ** 3 * (weights ? weights[j] : 1);
      sw += w; sx += w * j; sy += w * y[j]; sxx += w * j * j; sxy += w * j * y[j];
    }
    if (sw <= 0) { out[i] = y[i]; continue; }
    const mx = sx / sw, my = sy / sw;
    const vxx = sxx / sw - mx * mx;
    const slope = vxx > 1e-12 ? (sxy / sw - mx * my) / vxx : 0;
    out[i] = my + slope * (i - mx);
  }
  return out;
}

/** STL with a periodic seasonal component (s.window = "periodic") and robustness weights. */
export function stl(y: number[], period = 12) {
  const n = y.length;
  const trendSpan = 2 * Math.ceil((1.5 * period) / 2) + 1; // 19 for monthly data
  let rw = new Array<number>(n).fill(1);
  let trend = new Array<number>(n).fill(mean(y));
  let seasonal = new Array<number>(n).fill(0);
  for (let outer = 0; outer < 4; outer++) {
    for (let inner = 0; inner < 2; inner++) {
      const detr = y.map((v, i) => v - trend[i]);
      // Periodic seasonal: robust-weighted mean of each cycle sub-series, centred to sum 0.
      const sub = Array.from({ length: period }, (_, k) => {
        let s = 0, w = 0;
        for (let i = k; i < n; i += period) { s += detr[i] * rw[i]; w += rw[i]; }
        return w > 0 ? s / w : 0;
      });
      const c = mean(sub);
      seasonal = y.map((_, i) => sub[i % period] - c);
      trend = loess(y.map((v, i) => v - seasonal[i]), trendSpan, rw);
    }
    // Bisquare robustness weights from the remainder (down-weights one-off spikes).
    const rem = y.map((v, i) => Math.abs(v - trend[i] - seasonal[i]));
    const h = 6 * [...rem].sort((a, b) => a - b)[Math.floor(n / 2)];
    rw = rem.map((r) => (h > 0 ? Math.max(0, 1 - (r / h) ** 2) ** 2 : 1));
  }
  const remainder = y.map((v, i) => v - trend[i] - seasonal[i]);
  return { trend, seasonal, remainder };
}

// ------------------------------------------------------------------ forecast models
type Model = { name: string; fit: (train: number[], firstMonth: number) => (h: number) => number[] };

/** Solve (A^T A + λD) x = A^T y with Gaussian elimination. */
function ridge(rows: number[][], y: number[], penalty: number[]): number[] {
  const p = rows[0].length;
  const M = Array.from({ length: p }, (_, i) => Array.from({ length: p + 1 }, (_, j) => {
    if (j === p) return rows.reduce((s, r, k) => s + r[i] * y[k], 0);
    return rows.reduce((s, r) => s + r[i] * r[j], 0) + (i === j ? penalty[i] : 0);
  }));
  for (let c = 0; c < p; c++) {
    let piv = c;
    for (let r = c + 1; r < p; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = 0; r < p; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= p; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[p] / row[i]));
}

/** Prophet-style: y = k + m·t + Σ δ_j·(t − c_j)+ + yearly Fourier(K=3); changepoints regularised. */
const prophetStyle: Model = {
  name: "Prophet-style (trend changepoints + yearly seasonality)",
  fit(train, firstMonth) {
    const n = train.length;
    const scale = Math.max(1, mean(train));
    const ys = train.map((v) => v / scale);
    const cps: number[] = [];
    for (let c = 6; c < Math.floor(n * 0.8); c += 6) cps.push(c);
    const K = 3;
    const feat = (t: number) => {
      const m = (firstMonth - 1 + t) % 12;
      const f = [1, t / 12, ...cps.map((c) => Math.max(0, t - c) / 12)];
      for (let k = 1; k <= K; k++) f.push(Math.cos((2 * Math.PI * k * m) / 12), Math.sin((2 * Math.PI * k * m) / 12));
      return f;
    };
    const rows = ys.map((_, t) => feat(t));
    const penalty = rows[0].map((_, i) => (i < 2 ? 1e-6 : i < 2 + cps.length ? 2 : 0.05));
    const beta = ridge(rows, ys, penalty);
    return (h) => Array.from({ length: h }, (_, k) => {
      const f = feat(n + k);
      return Math.max(0, f.reduce((s, v, i) => s + v * beta[i], 0) * scale);
    });
  },
};

/** STL seasonal component + damped trend continuation. */
const stlDamped: Model = {
  name: "STL seasonal + damped trend",
  fit(train) {
    const n = train.length;
    const { trend, seasonal } = stl(train);
    const slope = n > 12 ? (trend[n - 1] - trend[n - 13]) / 12 : 0;
    return (h) => {
      const out: number[] = [];
      let damp = 0;
      for (let k = 1; k <= h; k++) {
        damp += 0.9 ** k;
        out.push(Math.max(0, trend[n - 1] + slope * damp + seasonal[(n - 12 + ((k - 1) % 12)) % n]));
      }
      return out;
    };
  },
};

/** Same month last year. */
const seasonalNaive: Model = {
  name: "Seasonal naive (same month last year)",
  fit(train) {
    const n = train.length;
    return (h) => Array.from({ length: h }, (_, k) => train[n - 12 + (k % 12)]);
  },
};

function smape(a: number[], f: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = (Math.abs(a[i]) + Math.abs(f[i])) / 2;
    s += d === 0 ? 0 : Math.abs(a[i] - f[i]) / d;
  }
  return (s / a.length) * 100;
}

// ------------------------------------------------------------------ calendar
const EVENT_MONTHS: { event: SeasonEvent; months: number[] }[] = [
  { event: "school", months: [8, 9] },
  { event: "new_year", months: [12, 1] },
  { event: "navruz_march8", months: [3] },
  { event: "valentine", months: [2] },
  { event: "black_friday", months: [11] },
  { event: "summer", months: [6, 7, 8] },
  { event: "winter", months: [12, 1, 2] },
  { event: "spring", months: [3, 4, 5] },
  { event: "autumn", months: [9, 10, 11] },
];

function eventsFor(peakMonths: number[]): SeasonEvent[] {
  const set = new Set(peakMonths);
  const out: SeasonEvent[] = [];
  for (const e of EVENT_MONTHS) {
    const hit = e.months.filter((m) => set.has(m)).length;
    // Specific events need their key month; seasons need most of their months.
    const specific = ["school", "new_year", "navruz_march8", "valentine", "black_friday"].includes(e.event);
    if (specific ? hit >= 1 && (e.event !== "school" || set.has(8) || set.has(9)) : hit >= Math.ceil(e.months.length * 0.67)) out.push(e.event);
  }
  // Keep at most three, specific events first (they explain more).
  return out.slice(0, 3);
}

/** Order months as a season: [1, 11, 12] → [11, 12, 1] (starts after the largest gap). */
export function seasonOrder(months: number[]): number[] {
  if (months.length < 2) return months;
  const s = [...months].sort((a, b) => a - b);
  let cut = 0, gap = -1;
  for (let i = 0; i < s.length; i++) {
    const g = (s[(i + 1) % s.length] - s[i] + 12) % 12 || 12;
    if (g > gap) { gap = g; cut = (i + 1) % s.length; }
  }
  return [...s.slice(cut), ...s.slice(0, cut)];
}

/** Months until the next occurrence of `month` (1..12), counting from `fromYm`; 0 = this month. */
function nextOccurrence(fromYm: string, month: number): SeasonPoint {
  const cur = monthIndex(fromYm);
  const ahead = (month - cur + 12) % 12;
  return { date: `${addMonths(fromYm, ahead)}-01`, months: ahead };
}

// ------------------------------------------------------------------ analysis
export const MIN_MONTHS = 24;

/** Full seasonal analysis. Returns null when there are fewer than two years of data. */
export function analyseSeasonality(points: Point[], today = new Date()): SeasonalAnalysis | null {
  const monthly = toMonthly(points).filter((m) => m.month < today.toISOString().slice(0, 7)); // complete months only
  if (monthly.length < MIN_MONTHS) return null;
  const y = monthly.map((m) => m.value);
  const n = y.length;
  const level = Math.max(1e-9, mean(y));
  if (y.every((v) => v === 0)) return null;
  const { trend, seasonal, remainder } = stl(y);

  // Seasonal effect per calendar month, in % of the average level.
  const firstMonth = monthIndex(monthly[0].month);
  const effect = new Array<number>(12).fill(0);
  for (let i = 0; i < 12 && i < n; i++) effect[(firstMonth - 1 + i) % 12] = (seasonal[i] / level) * 100;
  // Consistency: in how many years the month sat on the same side of the trend as its average effect.
  const months: MonthEffect[] = effect.map((e, m) => {
    let same = 0, total = 0;
    for (let i = 0; i < n; i++) {
      if ((firstMonth - 1 + i) % 12 !== m) continue;
      total++;
      const dev = y[i] - trend[i];
      if (Math.sign(dev) === Math.sign(e) || Math.abs(e) < 1) same++;
    }
    return { month: m + 1, effectPct: r1(e), consistency: total ? r1(same / total) : 0 };
  });

  const strength = Math.max(0, 1 - variance(remainder) / Math.max(1e-12, variance(seasonal.map((s, i) => s + remainder[i]))));
  const amplitude = Math.max(...effect) - Math.min(...effect);
  const lvl: SeasonalAnalysis["level"] = strength >= 0.6 && amplitude >= 30 ? "strong" : strength >= 0.4 && amplitude >= 15 ? "moderate" : strength >= 0.25 && amplitude >= 8 ? "weak" : "none";

  const maxE = Math.max(...effect), minE = Math.min(...effect);
  const peakMonths = lvl === "none" ? [] : months.filter((m) => m.effectPct >= Math.max(5, maxE * 0.5)).map((m) => m.month);
  // Low season only when some months are clearly below the rest (not a flat off-season).
  const sortedE = [...effect].sort((a, b) => a - b);
  const median = (sortedE[5] + sortedE[6]) / 2;
  const lowMonths = lvl === "none" || median - minE < 3 ? [] : months
    .filter((m) => m.effectPct <= Math.min(-5, minE * 0.6))
    .sort((a, b) => a.effectPct - b.effectPct)
    .slice(0, 4)
    .map((m) => m.month)
    .sort((a, b) => a - b);

  const lastYm = monthly[n - 1].month;
  const nowYm = addMonths(lastYm, 1); // the month we are in (not complete yet)
  const peak = effect.indexOf(maxE) + 1;
  const low = effect.indexOf(minE) + 1;
  // Rise starts at the earliest month of the climb towards the peak (each step up is significant).
  const step = Math.max(2, (maxE - minE) * 0.08);
  const prevOf = (m: number) => ((m + 10) % 12) + 1;
  let rise = peak;
  for (let cur = peak, k = 0; k < 11 && effect[cur - 1] - effect[prevOf(cur) - 1] > step; k++) {
    rise = cur;
    cur = prevOf(cur);
  }
  // Fall starts the month after the peak.
  const fall = (peak % 12) + 1;
  const curM = monthIndex(nowYm);
  const nextM = (curM % 12) + 1;
  const phase: SeasonalAnalysis["phase"] = lvl === "none" ? "normal"
    : peakMonths.includes(curM) ? "peak"
    : peakMonths.includes(nextM) || effect[nextM - 1] - effect[curM - 1] > step ? "rising"
    : lowMonths.includes(curM) || effect[curM - 1] <= -10 ? "low"
    : effect[curM - 1] - effect[nextM - 1] > step ? "falling" : "normal";

  // Long-term direction.
  const last12 = mean(y.slice(-12)), prev12 = mean(y.slice(-24, -12));
  const yoyPct = prev12 > 0 ? r1(((last12 - prev12) / prev12) * 100) : null;
  const direction = yoyPct === null ? "stable" : yoyPct > 8 ? "growing" : yoyPct < -8 ? "declining" : "stable";

  // Forecast: back-test the candidates on the last 12 months, refit the best on everything.
  const holdout = n >= 36 ? 12 : 6;
  const train = y.slice(0, n - holdout), test = y.slice(n - holdout);
  const scored = [prophetStyle, stlDamped, seasonalNaive]
    .filter((m) => m !== seasonalNaive || train.length >= 12)
    .map((m) => ({ m, err: smape(test, m.fit(train, firstMonth)(holdout)) }))
    .sort((a, b) => a.err - b.err);
  const best = scored[0];
  const fitted = best.m.fit(y, firstMonth);
  const fc = fitted(12);
  const backtest = best.m.fit(train, firstMonth)(holdout);
  const sigma = Math.sqrt(mean(test.map((v, i) => (v - backtest[i]) ** 2)));
  const outlook = fc.map((v, k) => ({
    date: `${addMonths(lastYm, k + 1)}-01`,
    value: r1(v),
    lower: r1(Math.max(0, v - 1.28 * sigma * Math.sqrt(1 + k / 6))),
    upper: r1(Math.min(100, v + 1.28 * sigma * Math.sqrt(1 + k / 6))),
  }));
  // Next 3 months vs the last 3 months of actual data. The current month is in progress,
  // so the forecast starts at it.
  const last3 = mean(y.slice(-3)), next3 = mean(fc.slice(0, 3));
  const next3Pct = last3 > 0 ? r1(((next3 - last3) / last3) * 100) : null;

  return {
    method: "STL (periodic, robust) + model chosen by 12-month back-test",
    years: r1(n / 12),
    monthsOfData: n,
    monthly: monthly.map((m) => ({ month: m.month, value: r1(m.value) })),
    trendLine: monthly.map((m, i) => ({ month: m.month, value: r1(trend[i]) })),
    strength: r1(strength * 100) / 100,
    level: lvl,
    months,
    peakMonths: seasonOrder(peakMonths),
    lowMonths: seasonOrder(lowMonths),
    events: eventsFor(peakMonths),
    phase,
    nextRise: lvl === "none" ? null : nextOccurrence(nowYm, rise),
    nextPeak: lvl === "none" ? null : nextOccurrence(nowYm, peak),
    nextFall: lvl === "none" ? null : nextOccurrence(nowYm, fall),
    nextLow: lowMonths.length === 0 ? null : nextOccurrence(nowYm, low),
    yoyPct,
    direction,
    outlook,
    next3Pct,
    model: {
      name: best.m.name,
      smapePct: r1(best.err),
      confidence: best.err < 12 ? "high" : best.err < 25 ? "medium" : "low",
      holdoutMonths: holdout,
    },
  };
}
