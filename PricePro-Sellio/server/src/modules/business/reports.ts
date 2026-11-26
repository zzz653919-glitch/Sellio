/**
 * Weekly / monthly business reports: the user's own sales data, measured market changes and
 * their platform activity. An optional AI summary only rephrases these numbers.
 */
import { all, get, run } from "../../db/index.js";
import { notFound } from "../../lib/errors.js";
import { newId, nowIso, safeJson } from "../../lib/util.js";
import { notify } from "../../services/notifications.js";
import { complete, LANGUAGE_NAME } from "../../services/llm.js";
import { assertWithinLimit, recordAiRequest } from "../../services/plans.js";
import { features } from "../../config.js";
import type { Msg } from "../forecast/engine.js";
import { buildRadar, topDemand } from "../forecast/topDemand.js";
import { analyseBusiness, type BusinessRow } from "./analysis.js";
import { latestDataset, loadDataset } from "./service.js";

type PeriodTotals = { from: string; to: string; revenue: number; netProfit: number | null; units: number | null };

export type ReportContent = {
  period: "week" | "month";
  generatedAt: string;
  business: null | {
    datasetId: string;
    datasetName: string;
    currency: string;
    dataUntil: string;
    note: Msg | null;
    current: PeriodTotals;
    previous: PeriodTotals | null;
    revenueChangePct: number | null;
    profitChangePct: number | null;
    topProducts: { name: string; revenue: number; sharePct: number }[];
    risks: Msg[];
    opportunities: Msg[];
  };
  market: null | { computedAt: string; rising: { label: string; pct: number }[]; declining: { label: string; pct: number }[]; updates: Msg[] };
  activity: { analyses: number; ads: number; days: number };
  recommendations: Msg[];
  summary: string | null;
  summaryError: string | null;
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (a: number | null, b: number | null) => (a !== null && b !== null && b !== 0 ? r1(((a - b) / Math.abs(b)) * 100) : null);
const dayShift = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

function totals(rows: BusinessRow[], from: string, to: string): PeriodTotals {
  const inRange = rows.filter((r) => r.date >= from && r.date <= to);
  const hasProfit = rows.some((r) => r.cost != null || r.expenses != null);
  const hasUnits = rows.some((r) => r.units != null);
  return {
    from, to,
    revenue: r2(inRange.reduce((s, r) => s + r.revenue, 0)),
    netProfit: hasProfit ? r2(inRange.reduce((s, r) => s + r.revenue - (r.cost ?? 0) - (r.expenses ?? 0), 0)) : null,
    units: hasUnits ? r2(inRange.reduce((s, r) => s + (r.units ?? 0), 0)) : null,
  };
}

function businessSection(ds: { id: string; name: string; currency: string; rows: BusinessRow[] }, period: "week" | "month"): ReportContent["business"] {
  const rows = ds.rows;
  if (!rows.length) return null;
  const a = analyseBusiness(rows);
  const end = a.period.end;
  const daily = rows.some((r) => r.date.slice(8) !== "01");
  let current: PeriodTotals, previous: PeriodTotals | null, note: Msg | null = null;
  if (period === "week" && daily) {
    current = totals(rows, dayShift(end, -6), end);
    previous = totals(rows, dayShift(end, -13), dayShift(end, -7));
  } else {
    if (period === "week") note = { key: "Your data is recorded per month, so this weekly report shows the latest month." };
    const full = a.monthly.filter((m) => !m.partial);
    const last = full.at(-1), prev = full.at(-2);
    if (!last) return null;
    const monthEnd = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
    current = totals(rows, `${last.month}-01`, monthEnd(last.month));
    previous = prev ? totals(rows, `${prev.month}-01`, monthEnd(prev.month)) : null;
  }
  return {
    datasetId: ds.id, datasetName: ds.name, currency: ds.currency, dataUntil: end, note,
    current, previous,
    revenueChangePct: previous ? pct(current.revenue, previous.revenue) : null,
    profitChangePct: previous ? pct(current.netProfit, previous.netProfit) : null,
    topProducts: a.products.slice(0, 5).map((p) => ({ name: p.name, revenue: p.revenue, sharePct: p.sharePct })),
    risks: a.risks.slice(0, 5),
    opportunities: a.opportunities.slice(0, 5),
  };
}

const fill = (m: Msg) => Object.entries(m.vars ?? {}).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), m.key);

export async function generateReport(userId: string, period: "week" | "month", datasetId?: string) {
  const days = period === "week" ? 7 : 30;
  const ds = datasetId ? await loadDataset(userId, datasetId) : await latestDataset(userId);
  const business = ds ? businessSection(ds, period) : null;

  let market: ReportContent["market"] = null;
  try {
    const data = await topDemand("UZ");
    if (data) {
      const radar = buildRadar(data);
      market = {
        computedAt: radar.computedAt,
        rising: radar.rising.slice(0, 5).map((i) => ({ label: i.label, pct: i.next3Pct ?? i.nowVsAvgPct })),
        declining: radar.declining.slice(0, 5).map((i) => ({ label: i.label, pct: i.next3Pct ?? i.nowVsAvgPct })),
        updates: radar.updates.slice(0, 6).map((u) => u.msg),
      };
    }
  } catch {
    market = null; // market data is optional in a report
  }

  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const analyses = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM market_analyses WHERE user_id = ? AND created_at >= ?", userId, since))?.n ?? 0;
  const ads = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM generations WHERE user_id = ? AND created_at >= ? AND status = 'succeeded'", userId, since))?.n ?? 0;

  const recommendations: Msg[] = [];
  if (!ds) recommendations.push({ key: "Upload your sales data (CSV or Excel) to get revenue, profit and risk analysis in your reports." });
  if (business?.revenueChangePct != null && business.revenueChangePct <= -10) recommendations.push({ key: "Revenue is down — check which products fell and review prices, stock and advertising for them." });
  if (business?.revenueChangePct != null && business.revenueChangePct >= 10) recommendations.push({ key: "Revenue is up — keep stock of your best sellers and repeat the advertising that worked." });
  if (market?.rising.length) recommendations.push({ key: "Demand is rising for: {list}. Check whether any of these fit your business.", vars: { list: market.rising.slice(0, 3).map((r) => r.label).join(", ") } });
  if (analyses === 0) recommendations.push({ key: "Run a demand analysis for your main products to see their season and the next 3 months." });
  if (!market) recommendations.push({ key: "Market data is not connected yet (SERPAPI_API_KEY), so this report has no market section." });

  const content: ReportContent = { period, generatedAt: nowIso(), business, market, activity: { analyses, ads, days }, recommendations, summary: null, summaryError: null };

  const withinQuota = await assertWithinLimit(userId, "ai").then(() => true, () => false);
  if (features.llm && (business || market) && !withinQuota) content.summaryError = "Monthly AI limit reached — the report is made without the AI summary.";
  if (features.llm && (business || market) && withinQuota) {
    const lang = (await get<{ language: string }>("SELECT language FROM user_settings WHERE user_id = ?", userId))?.language ?? "en";
    const facts = {
      period,
      business: business && { ...business, risks: business.risks.map(fill), opportunities: business.opportunities.map(fill), note: business.note && fill(business.note) },
      market: market && { ...market, updates: market.updates.map(fill), note: "Values are Google Trends search interest, not sales." },
      activity: content.activity,
    };
    try {
      content.summary = await complete({
        system: `You write short business reports for a small-business owner. Write in ${LANGUAGE_NAME[lang] ?? "English"}. Use ONLY the facts in the JSON. Never invent numbers. Search interest is a relative index, not sales. Format: 4–7 short bullet points starting with "- ", then one line "Next step: …".`,
        messages: [{ role: "user", content: JSON.stringify(facts) }],
        maxTokens: 1200,
      });
      await recordAiRequest(userId, "report");
    } catch (err) {
      content.summaryError = err instanceof Error ? err.message : "AI summary failed";
    }
  }

  const id = newId();
  const title = period === "week" ? "Weekly report" : "Monthly report";
  await run("INSERT INTO business_reports (id,user_id,period,title,content_json,created_at) VALUES (?,?,?,?,?,?)", id, userId, period, title, JSON.stringify(content), content.generatedAt);
  await notify(userId, "forecast", `${title} is ready`, "Your business report with sales, market changes and recommendations is ready.", "/business?tab=reports");
  return getReport(userId, id);
}

type ReportRow = { id: string; period: "week" | "month"; title: string; content_json: string; created_at: string };

export async function getReport(userId: string, id: string) {
  const r = await get<ReportRow>("SELECT * FROM business_reports WHERE id = ? AND user_id = ?", id, userId);
  if (!r) throw notFound("Report not found");
  return { id: r.id, period: r.period, title: r.title, content: safeJson<ReportContent | null>(r.content_json, null), createdAt: r.created_at };
}

export async function listReports(userId: string) {
  const rows = await all<Omit<ReportRow, "content_json">>("SELECT id, period, title, created_at FROM business_reports WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", userId);
  return rows.map((r) => ({ id: r.id, period: r.period, title: r.title, createdAt: r.created_at }));
}

export async function deleteReport(userId: string, id: string) {
  const r = await run("DELETE FROM business_reports WHERE id = ? AND user_id = ?", id, userId);
  if (!r.changes) throw notFound("Report not found");
}
