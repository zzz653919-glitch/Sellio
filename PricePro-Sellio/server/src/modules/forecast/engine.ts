/**
 * Demand forecasting engine.
 *
 * Works only on real time-series data (user-provided sales history or an explicitly
 * labelled sample dataset). Candidate models (damped Holt, additive Holt-Winters,
 * seasonal naive, mean) are compared on a hold-out back-test and the best one is used.
 * When there is not enough history the engine returns `insufficient` instead of guessing.
 */

export type Point = { date: string; units: number };
/** A UI message: an English template with {placeholders}, so the web app can translate it. */
export type Msg = { key: string; vars?: Record<string, string | number> };
export const fillMsg = (m: Msg) => Object.entries(m.vars ?? {}).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), m.key);
export type Granularity = "day" | "week" | "month";

export type ForecastOutput =
  | { status: "insufficient"; reason: string; reasonMsg: Msg; granularity: Granularity; requiredPoints: number; availablePoints: number }
  | {
      status: "ok";
      granularity: Granularity;
      horizon: number;
      history: Point[];
      forecast: { date: string; units: number; lower: number; upper: number }[];
      totals: { predicted: number; previousPeriod: number; growthPct: number | null; samePeriodLastYear: number | null; yoyPct: number | null };
      trend: "growing" | "declining" | "stable";
      model: { name: string; params: Record<string, number>; backtest: { smapePct: number; mae: number; holdoutPoints: number }; confidence: "high" | "medium" | "low" };
      seasonality: { detected: boolean; period: number | null };
      explanation: string[];
      explanationMsgs: Msg[];
    };

const DAY = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const parseDay = (s: string) => Date.parse(`${s}T00:00:00Z`);

const RANK: Record<Granularity, number> = { day: 0, week: 1, month: 2 };

/**
 * How a forecast of `periodDays` is computed. Data recorded per week or per month cannot be
 * split into days, so the plan never uses a finer resolution than the data itself.
 */
export function planFor(
  periodDays: number,
  data: Granularity = "day",
): { granularity: Granularity; horizon: number; minPoints: number; season: number | null } {
  let base: { granularity: Granularity; horizon: number; minPoints: number; season: number | null };
  if (periodDays <= 30) base = { granularity: "day", horizon: periodDays, minPoints: Math.max(14, periodDays * 2), season: 7 };
  else if (periodDays <= 180) {
    const horizon = Math.round(periodDays / 7);
    base = { granularity: "week", horizon, minPoints: horizon * 2, season: null };
  } else base = { granularity: "month", horizon: 12, minPoints: 24, season: 12 };
  if (RANK[data] <= RANK[base.granularity]) return base;
  if (data === "week") {
    const horizon = Math.max(1, Math.round(periodDays / 7));
    return { granularity: "week", horizon, minPoints: Math.max(8, horizon * 2), season: null };
  }
  const horizon = Math.max(1, Math.round(periodDays / 30));
  return { granularity: "month", horizon, minPoints: Math.max(6, horizon * 2), season: 12 };
}

/**
 * Detect how often sales were recorded: monthly (all dates on the 1st, at least 28 days apart),
 * weekly (all dates 7·k days apart) or daily.
 */
export function detectGranularity(points: Point[]): Granularity {
  if (points.length < 2) return "day";
  const ts = points.map((p) => parseDay(p.date)).sort((a, b) => a - b);
  const gaps = ts.slice(1).map((t, i) => Math.round((t - ts[i]) / DAY));
  if (points.every((p) => p.date.endsWith("-01")) && Math.min(...gaps) >= 28) return "month";
  if (gaps.every((g) => g > 0 && g % 7 === 0)) return "week";
  return "day";
}

function bucketStart(t: number, g: Granularity) {
  const d = new Date(t);
  if (g === "day") return t;
  if (g === "week") {
    const dow = (d.getUTCDay() + 6) % 7; // Monday-based weeks
    return t - dow * DAY;
  }
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function nextBucket(t: number, g: Granularity, k = 1) {
  if (g === "day") return t + k * DAY;
  if (g === "week") return t + 7 * k * DAY;
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1);
}

/**
 * Aggregate records into complete buckets. Each record covers one `data` period (a day, week or
 * month). Periods without records count as zero sales.
 */
export function aggregate(points: Point[], g: Granularity, data: Granularity = "day"): Point[] {
  if (!points.length) return [];
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const first = bucketStart(parseDay(sorted[0].date), data);
  const lastStart = bucketStart(parseDay(sorted[sorted.length - 1].date), data);
  const last = nextBucket(lastStart, data) - DAY; // the last day the data covers
  const sums = new Map<number, number>();
  for (const p of sorted) {
    const b = bucketStart(parseDay(p.date), g);
    sums.set(b, (sums.get(b) ?? 0) + p.units);
  }
  const out: Point[] = [];
  let b = bucketStart(first, g);
  // Drop a partial first bucket.
  if (b < first) b = nextBucket(b, g);
  while (nextBucket(b, g) - DAY <= last) {
    out.push({ date: isoDay(b), units: sums.get(b) ?? 0 });
    b = nextBucket(b, g);
  }
  return out;
}

// ------------------------------------------------------------------ models
type Fit = { name: string; params: Record<string, number>; forecast: (h: number) => number[]; residuals: number[] };

function holt(y: number[], alpha: number, beta: number, phi: number): Fit {
  let level = y[0];
  let trend = y.length > 1 ? y[1] - y[0] : 0;
  const residuals: number[] = [];
  for (let i = 1; i < y.length; i++) {
    const pred = level + phi * trend;
    residuals.push(y[i] - pred);
    const prevLevel = level;
    level = alpha * y[i] + (1 - alpha) * (level + phi * trend);
    trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
  }
  return {
    name: "Damped Holt (trend)",
    params: { alpha, beta, phi },
    residuals,
    forecast: (h) => {
      const out: number[] = [];
      let damp = 0;
      for (let k = 1; k <= h; k++) {
        damp += phi ** k;
        out.push(level + damp * trend);
      }
      return out;
    },
  };
}

function holtWinters(y: number[], m: number, alpha: number, beta: number, gamma: number): Fit {
  const seasons = Math.floor(y.length / m);
  const avg = (s: number) => y.slice(s * m, s * m + m).reduce((a, b) => a + b, 0) / m;
  let level = avg(0);
  let trend = seasons > 1 ? (avg(1) - avg(0)) / m : 0;
  const season = Array.from({ length: m }, (_, i) => y[i] - level);
  const residuals: number[] = [];
  for (let i = m; i < y.length; i++) {
    const s = season[i % m];
    const pred = level + trend + s;
    residuals.push(y[i] - pred);
    const prevLevel = level;
    level = alpha * (y[i] - s) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    season[i % m] = gamma * (y[i] - level) + (1 - gamma) * s;
  }
  const n = y.length;
  return {
    name: `Holt-Winters (additive, season ${m})`,
    params: { alpha, beta, gamma, season: m },
    residuals,
    forecast: (h) => Array.from({ length: h }, (_, k) => level + (k + 1) * trend + season[(n + k) % m]),
  };
}

function seasonalNaive(y: number[], m: number): Fit {
  const residuals = y.slice(m).map((v, i) => v - y[i]);
  return {
    name: `Seasonal naive (season ${m})`,
    params: { season: m },
    residuals,
    forecast: (h) => Array.from({ length: h }, (_, k) => y[y.length - m + (k % m)]),
  };
}

function meanModel(y: number[]): Fit {
  const window = y.slice(-Math.min(y.length, 8));
  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  return { name: "Recent average", params: { window: window.length }, residuals: y.map((v) => v - mean), forecast: (h) => Array(h).fill(mean) };
}

function sse(r: number[]) {
  return r.reduce((a, b) => a + b * b, 0);
}

function candidates(y: number[], season: number | null): Fit[] {
  const fits: Fit[] = [];
  let bestHolt: Fit | null = null;
  for (const alpha of [0.1, 0.2, 0.3, 0.5, 0.7, 0.9])
    for (const beta of [0.05, 0.1, 0.2, 0.3])
      for (const phi of [0.9, 0.95, 0.98, 1]) {
        const f = holt(y, alpha, beta, phi);
        if (!bestHolt || sse(f.residuals) < sse(bestHolt.residuals)) bestHolt = f;
      }
  if (bestHolt) fits.push(bestHolt);
  if (season && y.length >= season * 2 + 2) {
    let bestHw: Fit | null = null;
    for (const alpha of [0.1, 0.3, 0.5, 0.7])
      for (const beta of [0.05, 0.1, 0.2])
        for (const gamma of [0.1, 0.3, 0.5]) {
          const f = holtWinters(y, season, alpha, beta, gamma);
          if (!bestHw || sse(f.residuals) < sse(bestHw.residuals)) bestHw = f;
        }
    if (bestHw) fits.push(bestHw);
    fits.push(seasonalNaive(y, season));
  }
  fits.push(meanModel(y));
  return fits;
}

function smape(actual: number[], pred: number[]) {
  let s = 0;
  for (let i = 0; i < actual.length; i++) {
    const denom = (Math.abs(actual[i]) + Math.abs(pred[i])) / 2;
    s += denom === 0 ? 0 : Math.abs(actual[i] - pred[i]) / denom;
  }
  return (s / actual.length) * 100;
}

function seasonalityStrength(y: number[], m: number) {
  if (y.length < m * 2) return 0;
  const mean = y.reduce((a, b) => a + b, 0) / y.length;
  let num = 0;
  let den = 0;
  for (let i = m; i < y.length; i++) {
    num += (y[i] - mean) * (y[i - m] - mean);
  }
  for (const v of y) den += (v - mean) ** 2;
  return den === 0 ? 0 : num / den; // autocorrelation at lag m
}

const round = (v: number) => Math.round(v * 100) / 100;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

const reasonOf = (m: Msg) => ({ reason: fillMsg(m), reasonMsg: m });

export function runForecast(points: Point[], periodDays: number, data: Granularity = "day"): ForecastOutput {
  if (data === "month" && periodDays < 30) {
    return {
      status: "insufficient",
      granularity: "month",
      requiredPoints: 0,
      availablePoints: 0,
      ...reasonOf({ key: "This sales data is recorded per month, so it cannot show demand for a single week. Choose a period of 30 days or longer." }),
    };
  }
  const plan = planFor(periodDays, data);
  const series = aggregate(points, plan.granularity, data);
  if (series.length < plan.minPoints) {
    return {
      status: "insufficient",
      granularity: plan.granularity,
      requiredPoints: plan.minPoints,
      availablePoints: series.length,
      ...reasonOf({
        key: "A {period}-day forecast needs at least {required} complete {unit} of sales history; the data covers {available}. Add more history and run it again.",
        vars: { period: periodDays, required: plan.minPoints, unit: `${plan.granularity}s`, available: series.length },
      }),
    };
  }
  const y = series.map((p) => p.units);
  const h = plan.horizon;

  // Back-test on the most recent data.
  const holdout = Math.max(1, Math.min(h, Math.floor(y.length * 0.2)));
  const train = y.slice(0, y.length - holdout);
  const test = y.slice(y.length - holdout);
  const scored = candidates(train, plan.season).map((f) => {
    const pred = f.forecast(holdout).map((v) => Math.max(0, v));
    const mae = sum(test.map((v, i) => Math.abs(v - pred[i]))) / holdout;
    return { name: f.name, smapePct: smape(test, pred), mae };
  });
  scored.sort((a, b) => a.smapePct - b.smapePct || a.mae - b.mae);
  const winner = scored[0];

  // Refit the winning model family on the full series.
  const final = candidates(y, plan.season).find((f) => f.name === winner.name) ?? meanModel(y);
  const raw = final.forecast(h);
  const resid = final.residuals.length ? final.residuals : [0];
  const sigma = Math.sqrt(sse(resid) / resid.length);
  const z = 1.2816; // 80% interval

  const lastDate = parseDay(series[series.length - 1].date);
  const forecast = raw.map((v, k) => {
    const units = Math.max(0, v);
    const spread = z * sigma * Math.sqrt(k + 1);
    return {
      date: isoDay(nextBucket(lastDate, plan.granularity, k + 1)),
      units: round(units),
      lower: round(Math.max(0, units - spread)),
      upper: round(units + spread),
    };
  });

  const predicted = sum(forecast.map((f) => f.units));
  const previousPeriod = sum(y.slice(-h));
  const growthPct = previousPeriod > 0 ? ((predicted - previousPeriod) / previousPeriod) * 100 : null;
  const perYear = plan.granularity === "day" ? 365 : plan.granularity === "week" ? 52 : 12;
  const lastYearSlice = y.length >= perYear + h ? y.slice(y.length - perYear, y.length - perYear + h) : null;
  const sameLastYear = lastYearSlice ? sum(lastYearSlice) : null;
  const yoyPct = sameLastYear && sameLastYear > 0 ? ((predicted - sameLastYear) / sameLastYear) * 100 : null;
  // A shorter horizon needs a smaller change to count as a real trend (4% in a week is strong growth).
  const threshold = periodDays <= 7 ? 2 : periodDays <= 30 ? 3 : 5;
  const trend = growthPct === null ? "stable" : growthPct > threshold ? "growing" : growthPct < -threshold ? "declining" : "stable";
  const confidence = winner.smapePct < 15 ? "high" : winner.smapePct < 30 ? "medium" : "low";
  const strength = plan.season ? seasonalityStrength(y, plan.season) : 0;

  const unit = `${plan.granularity}s`;
  const n0 = (v: number) => Math.round(v).toLocaleString("en-US");
  const explanationMsgs: Msg[] = [
    {
      key: "History: {n} complete {unit} from {from} to {to} ({gapUnit} without records are counted as zero sales).",
      vars: { n: series.length, unit, from: series[0].date, to: series[series.length - 1].date, gapUnit: `${data}s` },
    },
    {
      key: 'Model selection: {models} models were back-tested on the last {holdout} {unit}; "{model}" had the lowest error (sMAPE {smape}%).',
      vars: { models: scored.length, holdout, unit, model: winner.name, smape: winner.smapePct.toFixed(1) },
    },
    growthPct === null
      ? { key: "Expected demand over the next {h} {unit}: about {units} units.", vars: { h, unit, units: n0(predicted) } }
      : {
          key: growthPct >= 0
            ? "Expected demand over the next {h} {unit}: about {units} units — up {pct}% versus the previous {h} {unit}."
            : "Expected demand over the next {h} {unit}: about {units} units — down {pct}% versus the previous {h} {unit}.",
          vars: { h, unit, units: n0(predicted), pct: Math.abs(growthPct).toFixed(1) },
        },
    sameLastYear !== null && yoyPct !== null
      ? { key: "Compared with the same period last year ({units} units): {pct}%.", vars: { units: n0(sameLastYear), pct: `${yoyPct >= 0 ? "+" : ""}${yoyPct.toFixed(1)}` } }
      : { key: "Not enough history for a same-period-last-year comparison." },
    plan.season && strength > 0.3
      ? { key: "A repeating pattern of {season} {unit} was detected in the history (strength {strength}).", vars: { season: plan.season, unit, strength: strength.toFixed(2) } }
      : { key: "No strong repeating seasonal pattern was detected." },
    { key: "The shaded band is an 80% prediction interval; confidence is {confidence} based on back-test accuracy.", vars: { confidence } },
  ];
  const explanation = explanationMsgs.map(fillMsg);


  return {
    status: "ok",
    granularity: plan.granularity,
    horizon: h,
    history: series,
    forecast,
    totals: {
      predicted: round(predicted),
      previousPeriod: round(previousPeriod),
      growthPct: growthPct === null ? null : round(growthPct),
      samePeriodLastYear: sameLastYear === null ? null : round(sameLastYear),
      yoyPct: yoyPct === null ? null : round(yoyPct),
    },
    trend,
    model: {
      name: winner.name,
      params: final.params,
      backtest: { smapePct: round(winner.smapePct), mae: round(winner.mae), holdoutPoints: holdout },
      confidence,
    },
    seasonality: { detected: Boolean(plan.season && strength > 0.3), period: plan.season },
    explanation,
    explanationMsgs,
  };
}

/** Deterministic synthetic series used ONLY for the clearly labelled "Sample data" dataset. */
export function sampleSeries(days = 730, seed = 42): Point[] {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const end = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - DAY;
  const start = end - (days - 1) * DAY;
  const out: Point[] = [];
  for (let i = 0; i < days; i++) {
    const t = start + i * DAY;
    const dow = new Date(t).getUTCDay();
    const weekly = dow === 0 || dow === 6 ? 1.25 : 1;
    const yearly = 1 + 0.25 * Math.sin((2 * Math.PI * i) / 365);
    const base = 40 + i * 0.03;
    out.push({ date: isoDay(t), units: Math.max(0, Math.round(base * weekly * yearly + (rand() - 0.5) * 12)) });
  }
  return out;
}
