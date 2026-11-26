/**
 * Analysis of the user's own sales data: revenue, costs, expenses, margins, growth, products,
 * risks, opportunities and a back-tested revenue forecast. Everything is computed from the
 * uploaded or entered rows; nothing is estimated from outside data.
 */
import { runForecast, type Msg } from "../forecast/engine.js";

export type BusinessRow = { date: string; product?: string | null; revenue: number; cost?: number | null; expenses?: number | null; units?: number | null };

export type MonthAgg = {
  month: string; // YYYY-MM
  revenue: number;
  cost: number | null;
  expenses: number | null;
  grossProfit: number | null;
  netProfit: number | null;
  netMarginPct: number | null;
  units: number | null;
  partial?: boolean;
};

export type ProductAgg = { name: string; revenue: number; sharePct: number; units: number | null; grossMarginPct: number | null; last3VsPrev3Pct: number | null };

export type BusinessAnalysis = {
  rows: number;
  period: { start: string; end: string };
  hasCost: boolean;
  hasExpenses: boolean;
  hasUnits: boolean;
  hasProducts: boolean;
  totals: { revenue: number; cost: number | null; expenses: number | null; grossProfit: number | null; netProfit: number | null; grossMarginPct: number | null; netMarginPct: number | null; units: number | null };
  monthly: MonthAgg[];
  growth: { momPct: number | null; last3VsPrev3Pct: number | null; yoyPct: number | null; lastFullMonth: string | null };
  products: ProductAgg[];
  bestMonth: { month: number; avgRevenue: number } | null;
  forecast:
    | { status: "ok"; months: { month: string; revenue: number; lower: number; upper: number }[]; totalNext3: number; changePct: number | null; model: string; smapePct: number; confidence: "high" | "medium" | "low" }
    | { status: "insufficient"; reason: Msg };
  risks: Msg[];
  opportunities: Msg[];
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const pct = (a: number, b: number) => (b !== 0 ? r1(((a - b) / Math.abs(b)) * 100) : null);
/** "2025-12" + 1 → "2026-01" (plain arithmetic: Date.UTC treats years below 100 as 19xx). */
const nextMonth = (ym: string, k = 1) => {
  const idx = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + k;
  return `${String(Math.floor(idx / 12)).padStart(4, "0")}-${String((idx % 12) + 1).padStart(2, "0")}`;
};

/** Business data is accepted from 1990 up to next year; anything else is a typo (e.g. 9999). */
export const MIN_YEAR = 1990;
export const maxYear = () => new Date().getUTCFullYear() + 1;

/** "2025-03" → "2025-03-01"; keeps valid YYYY-MM-DD. Returns null for anything else. */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3] ?? "01"}`;
    const year = Number(m[1]);
    if (year < MIN_YEAR || year > maxYear()) return null;
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
  }
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s); // DD.MM.YYYY (as written in Uzbekistan and Russia)
  if (m) return normalizeDate(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  return null;
}

export function analyseBusiness(input: BusinessRow[]): BusinessAnalysis {
  // Rows saved before the year check existed are skipped instead of breaking the analysis.
  const rows = input.filter((r) => normalizeDate(r.date) !== null).sort((a, b) => a.date.localeCompare(b.date));
  const hasCost = rows.some((r) => r.cost != null);
  const hasExpenses = rows.some((r) => r.expenses != null);
  const hasUnits = rows.some((r) => r.units != null);
  const hasProducts = new Set(rows.map((r) => r.product?.trim()).filter(Boolean)).size > 1;
  const start = rows[0]?.date ?? "", end = rows.at(-1)?.date ?? "";

  // Monthly totals (months without rows inside the range are filled with zeros).
  const byMonth = new Map<string, MonthAgg>();
  if (rows.length) {
    for (let m = start.slice(0, 7); m <= end.slice(0, 7); m = nextMonth(m)) {
      byMonth.set(m, { month: m, revenue: 0, cost: hasCost ? 0 : null, expenses: hasExpenses ? 0 : null, grossProfit: null, netProfit: null, netMarginPct: null, units: hasUnits ? 0 : null });
    }
  }
  for (const r of rows) {
    const a = byMonth.get(r.date.slice(0, 7))!;
    a.revenue += r.revenue;
    if (hasCost) a.cost! += r.cost ?? 0;
    if (hasExpenses) a.expenses! += r.expenses ?? 0;
    if (hasUnits) a.units! += r.units ?? 0;
  }
  const monthly = [...byMonth.values()];
  for (const a of monthly) {
    a.revenue = r2(a.revenue);
    if (a.cost !== null) a.cost = r2(a.cost);
    if (a.expenses !== null) a.expenses = r2(a.expenses);
    a.grossProfit = hasCost ? r2(a.revenue - a.cost!) : null;
    a.netProfit = hasCost || hasExpenses ? r2(a.revenue - (a.cost ?? 0) - (a.expenses ?? 0)) : null;
    a.netMarginPct = a.netProfit !== null && a.revenue > 0 ? r1((a.netProfit / a.revenue) * 100) : null;
  }
  // Daily data that stops before the end of its month: the last month is incomplete.
  const daily = rows.some((r) => r.date.slice(8) !== "01");
  if (daily && monthly.length) {
    const last = new Date(`${end}T00:00:00Z`);
    const monthEnd = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0)).getUTCDate();
    if (last.getUTCDate() < monthEnd - 2) monthly.at(-1)!.partial = true;
  }
  const full = monthly.filter((m) => !m.partial);

  const revenue = r2(sum(rows.map((r) => r.revenue)));
  const cost = hasCost ? r2(sum(rows.map((r) => r.cost ?? 0))) : null;
  const expenses = hasExpenses ? r2(sum(rows.map((r) => r.expenses ?? 0))) : null;
  const grossProfit = cost !== null ? r2(revenue - cost) : null;
  const netProfit = hasCost || hasExpenses ? r2(revenue - (cost ?? 0) - (expenses ?? 0)) : null;
  const totals = {
    revenue, cost, expenses, grossProfit, netProfit,
    grossMarginPct: grossProfit !== null && revenue > 0 ? r1((grossProfit / revenue) * 100) : null,
    netMarginPct: netProfit !== null && revenue > 0 ? r1((netProfit / revenue) * 100) : null,
    units: hasUnits ? r2(sum(rows.map((r) => r.units ?? 0))) : null,
  };

  const rev = full.map((m) => m.revenue);
  const last3 = sum(rev.slice(-3)), prev3 = sum(rev.slice(-6, -3));
  const growth = {
    momPct: rev.length >= 2 ? pct(rev.at(-1)!, rev.at(-2)!) : null,
    last3VsPrev3Pct: rev.length >= 6 ? pct(last3, prev3) : null,
    yoyPct: rev.length >= 24 ? pct(sum(rev.slice(-12)), sum(rev.slice(-24, -12))) : null,
    lastFullMonth: full.at(-1)?.month ?? null,
  };

  // Products: share, margin and momentum (last 3 full months vs the 3 before).
  const fullMonths = full.map((m) => m.month);
  const recentSet = new Set(fullMonths.slice(-3)), prevSet = new Set(fullMonths.slice(-6, -3));
  const prodMap = new Map<string, { revenue: number; cost: number; hasCost: boolean; units: number; recent: number; prev: number }>();
  for (const r of rows) {
    const name = r.product?.trim();
    if (!name) continue;
    const p = prodMap.get(name) ?? { revenue: 0, cost: 0, hasCost: false, units: 0, recent: 0, prev: 0 };
    p.revenue += r.revenue;
    if (r.cost != null) { p.cost += r.cost; p.hasCost = true; }
    p.units += r.units ?? 0;
    const m = r.date.slice(0, 7);
    if (recentSet.has(m)) p.recent += r.revenue;
    if (prevSet.has(m)) p.prev += r.revenue;
    prodMap.set(name, p);
  }
  const products: ProductAgg[] = hasProducts
    ? [...prodMap.entries()].map(([name, p]) => ({
        name,
        revenue: r2(p.revenue),
        sharePct: revenue > 0 ? r1((p.revenue / revenue) * 100) : 0,
        units: hasUnits ? r2(p.units) : null,
        grossMarginPct: p.hasCost && p.revenue > 0 ? r1(((p.revenue - p.cost) / p.revenue) * 100) : null,
        last3VsPrev3Pct: prevSet.size === 3 && p.prev > 0 ? pct(p.recent, p.prev) : null,
      })).sort((a, b) => b.revenue - a.revenue).slice(0, 30)
    : [];

  // Best calendar month (needs at least 12 full months).
  let bestMonth: BusinessAnalysis["bestMonth"] = null;
  if (full.length >= 12) {
    const byCal = new Map<number, number[]>();
    for (const m of full) byCal.set(Number(m.month.slice(5)), [...(byCal.get(Number(m.month.slice(5))) ?? []), m.revenue]);
    const avgs = [...byCal.entries()].map(([month, v]) => ({ month, avgRevenue: r2(sum(v) / v.length) }));
    bestMonth = avgs.sort((a, b) => b.avgRevenue - a.avgRevenue)[0];
  }

  // Revenue forecast for the next 3 months (needs 6 full months).
  let forecast: BusinessAnalysis["forecast"];
  const fc = runForecast(full.map((m) => ({ date: `${m.month}-01`, units: m.revenue })), 90, "month");
  if (fc.status === "ok") {
    const months = fc.forecast.map((f) => ({ month: f.date.slice(0, 7), revenue: r2(Math.max(0, f.units)), lower: r2(Math.max(0, f.lower)), upper: r2(f.upper) }));
    const totalNext3 = r2(sum(months.map((m) => m.revenue)));
    forecast = { status: "ok", months, totalNext3, changePct: rev.length >= 3 ? pct(totalNext3, last3) : null, model: fc.model.name, smapePct: fc.model.backtest.smapePct, confidence: fc.model.confidence };
  } else {
    forecast = { status: "insufficient", reason: { key: "A revenue forecast needs at least 6 full months of data (you have {n}).", vars: { n: full.length } } };
  }

  // Risks and opportunities, each backed by the numbers above.
  const risks: Msg[] = [], opportunities: Msg[] = [];
  if (growth.last3VsPrev3Pct !== null && growth.last3VsPrev3Pct <= -10) risks.push({ key: "Revenue fell {pct}% in the last 3 months compared with the 3 months before.", vars: { pct: Math.abs(growth.last3VsPrev3Pct) } });
  if (growth.last3VsPrev3Pct !== null && growth.last3VsPrev3Pct >= 10) opportunities.push({ key: "Revenue grew {pct}% in the last 3 months compared with the 3 months before.", vars: { pct: growth.last3VsPrev3Pct } });
  if (full.length >= 6 && (hasCost || hasExpenses)) {
    const margin = (ms: MonthAgg[]) => { const rv = sum(ms.map((m) => m.revenue)); return rv > 0 ? (sum(ms.map((m) => m.netProfit ?? 0)) / rv) * 100 : null; };
    const now = margin(full.slice(-3)), before = margin(full.slice(-6, -3));
    if (now !== null && before !== null && before - now >= 3) risks.push({ key: "Your net margin dropped from {from}% to {to}% (last 3 months vs the 3 before).", vars: { from: r1(before), to: r1(now) } });
    const losses = full.slice(-6).filter((m) => (m.netProfit ?? 0) < 0).length;
    if (losses > 0) risks.push({ key: "{n} of the last 6 months were loss-making.", vars: { n: losses } });
  }
  if (hasExpenses && full.length >= 6) {
    const e3 = sum(full.slice(-3).map((m) => m.expenses ?? 0)), e3p = sum(full.slice(-6, -3).map((m) => m.expenses ?? 0));
    const eg = pct(e3, e3p), rg = growth.last3VsPrev3Pct;
    if (eg !== null && rg !== null && eg - rg >= 10) risks.push({ key: "Expenses grew {e}% while revenue changed {r}% — costs are rising faster than sales.", vars: { e: eg, r: rg } });
  }
  if (products[0] && products.length > 1 && products[0].sharePct >= 50) risks.push({ key: "One product ({name}) brings {pct}% of revenue — a drop in it would hit the whole business.", vars: { name: products[0].name, pct: products[0].sharePct } });
  for (const p of products.slice(0, 15)) {
    if (p.last3VsPrev3Pct !== null && p.last3VsPrev3Pct <= -25 && p.sharePct >= 5) risks.push({ key: "Sales of {name} fell {pct}% in the last 3 months.", vars: { name: p.name, pct: Math.abs(p.last3VsPrev3Pct) } });
    if (p.last3VsPrev3Pct !== null && p.last3VsPrev3Pct >= 25 && p.sharePct >= 3) opportunities.push({ key: "Sales of {name} grew {pct}% in the last 3 months — give it more stock and advertising.", vars: { name: p.name, pct: p.last3VsPrev3Pct } });
  }
  const withMargin = products.filter((p) => p.grossMarginPct !== null && p.sharePct >= 3);
  if (withMargin.length >= 2 && totals.grossMarginPct !== null) {
    const best = [...withMargin].sort((a, b) => b.grossMarginPct! - a.grossMarginPct!)[0];
    if (best.grossMarginPct! - totals.grossMarginPct >= 10) opportunities.push({ key: "{name} has the highest gross margin ({pct}%, your average is {avg}%) — promoting it raises profit.", vars: { name: best.name, pct: best.grossMarginPct!, avg: totals.grossMarginPct } });
  }
  if (forecast.status === "ok" && forecast.changePct !== null) {
    if (forecast.changePct >= 10) opportunities.push({ key: "The forecast expects {pct}% more revenue in the next 3 months than in the last 3.", vars: { pct: forecast.changePct } });
    if (forecast.changePct <= -10) risks.push({ key: "The forecast expects {pct}% less revenue in the next 3 months than in the last 3.", vars: { pct: Math.abs(forecast.changePct) } });
  }
  if (bestMonth) opportunities.push({ key: "Your strongest month is usually {month} — prepare stock and advertising a month before it.", vars: { month: bestMonth.month } });

  return { rows: rows.length, period: { start, end }, hasCost, hasExpenses, hasUnits, hasProducts, totals, monthly, growth, products, bestMonth, forecast, risks, opportunities };
}
