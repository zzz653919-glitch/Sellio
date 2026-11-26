import { Router } from "express";
import { z } from "zod";
import { features } from "../../config.js";
import { all, get, run } from "../../db/index.js";
import { newId, nowIso, safeJson } from "../../lib/util.js";
import { parseBody } from "../../lib/validate.js";
import { currentUser, requireAuth, requireVerified } from "../../middleware/auth.js";
import { serviceLimiter } from "../../middleware/rateLimit.js";
import { logActivity } from "../../services/activity.js";
import { complete, LANGUAGE_NAME, llmProvider, type ChatMessage } from "../../services/llm.js";
import { assertWithinLimit, recordAiRequest } from "../../services/plans.js";
import { analyseBusiness } from "../business/analysis.js";
import { latestDataset } from "../business/service.js";
import type { Msg } from "../forecast/engine.js";
import { buildRadar, findOpportunities, topDemand } from "../forecast/topDemand.js";
import { listCompetitors } from "../intel/routes.js";
import { learnings } from "../campaigns/learnings.js";

/** AI Business Advisor: answers from the user's own data and measured market data. */
export const advisorRouter = Router();
advisorRouter.use(requireAuth);

const fill = (m: Msg) => Object.entries(m.vars ?? {}).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), m.key);

/** Everything the advisor may cite. Each block names its source. */
export async function buildContext(userId: string) {
  const ctx: Record<string, unknown> = { today: nowIso().slice(0, 10) };
  const ds = await latestDataset(userId);
  if (ds && ds.rows.length) {
    const a = analyseBusiness(ds.rows);
    ctx.myBusiness = {
      source: `The user's own sales data "${ds.name}" (${ds.currency}), ${a.period.start} to ${a.period.end}`,
      totals: a.totals,
      growth: a.growth,
      lastMonths: a.monthly.slice(-6),
      topProducts: a.products.slice(0, 10),
      forecastNext3Months: a.forecast.status === "ok" ? { months: a.forecast.months, changePct: a.forecast.changePct, confidence: a.forecast.confidence } : fill(a.forecast.reason),
      risks: a.risks.map(fill),
      opportunities: a.opportunities.map(fill),
    };
  } else ctx.myBusiness = "Not uploaded yet (the user can add sales data on the My Business page).";
  try {
    const data = await topDemand("UZ");
    if (data) {
      const radar = buildRadar(data);
      ctx.marketUzbekistan = {
        source: `Google Trends search interest in Uzbekistan, 5 years, computed ${data.computedAt.slice(0, 10)}. Relative index, NOT sales.`,
        rising: radar.rising.slice(0, 6).map((i) => ({ product: i.label, nowVsYearAvgPct: i.nowVsAvgPct, next3MonthsPct: i.next3Pct, yoyPct: i.yoyPct, peakMonths: i.peakMonths })),
        declining: radar.declining.slice(0, 6).map((i) => ({ product: i.label, nowVsYearAvgPct: i.nowVsAvgPct, next3MonthsPct: i.next3Pct, yoyPct: i.yoyPct })),
        opportunities: findOpportunities(data).slice(0, 5).map((o) => ({ product: o.label, score: o.score, reasons: o.reasons.map(fill) })),
      };
    } else ctx.marketUzbekistan = "Not connected on this server (SERPAPI_API_KEY missing).";
  } catch {
    ctx.marketUzbekistan = "Temporarily unavailable.";
  }
  const analyses = await all<{ query: string; status: string; result_json: string; created_at: string }>(
    "SELECT query, status, result_json, created_at FROM market_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 5", userId,
  );
  ctx.myDemandAnalyses = analyses.map((r) => {
    const res = safeJson<{ areas?: { name: string; changePct: number | null; trend: string | null; seasonality?: { peakMonths: number[]; phase: string; yoyPct: number | null } | null }[] } | null>(r.result_json, null);
    return {
      product: r.query, date: r.created_at.slice(0, 10),
      areas: (res?.areas ?? []).map((a) => ({ area: a.name, forecastChangePct: a.changePct, trend: a.trend, peakMonths: a.seasonality?.peakMonths, phase: a.seasonality?.phase, yoyPct: a.seasonality?.yoyPct })),
    };
  });
  const learned = await learnings(userId);
  ctx.myCampaignResults = learned.overall
    ? { source: "Results the user entered from their ad accounts (measured)", currency: learned.currency, reliable: learned.sample.reliable, overall: learned.overall, byChannel: learned.byChannel, bestCreatives: learned.topCreatives, insights: learned.insights.map(fill) }
    : "No campaign results entered yet.";
  const plans = await all<{ product: string; direction_json: string | null; campaign_id: string | null; updated_at: string }>("SELECT product, direction_json, campaign_id, updated_at FROM initiatives WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5", userId);
  if (plans.length) ctx.myGrowthPlans = plans.map((p) => ({ product: p.product, direction: safeJson<{ title?: string } | null>(p.direction_json, null)?.title ?? null, hasCampaign: Boolean(p.campaign_id) }));
  const competitors = await listCompetitors(userId);
  ctx.myCompetitors = competitors.length
    ? competitors.slice(0, 15).map((c) => ({ name: c.name, category: c.category, prices: c.priceNote, positioning: c.positioning, notes: c.notes?.slice(0, 300) }))
    : "None saved yet.";
  return ctx;
}

const SYSTEM = (lang: string, ctx: unknown) => `You are the Vendora AI Business Advisor for small and medium businesses, mostly in Uzbekistan.
Answer in ${LANGUAGE_NAME[lang] ?? "English"}.
Rules:
- Use numbers ONLY from DATA below and name their source (the user's sales data, Google Trends, etc.). Never invent statistics, prices, market sizes or forecasts.
- Google Trends values are relative search interest, not sales or units.
- If the data needed for an answer is missing, say so and tell the user exactly what to add (upload sales data, run a demand analysis, save competitors).
- General business knowledge is allowed, but present it as general advice, not as data.
- Be practical: a short answer, then 2–5 concrete next steps. Use plain language for non-technical owners.
- Vendora does not search for products, stores or suppliers; do not offer that.
DATA:
${JSON.stringify(ctx).slice(0, 14000)}`;

const messageSchema = z.object({ message: z.string().trim().min(1, "Write a question").max(2000, "The question is too long") });

advisorRouter.get("/messages", async (req, res) => {
  const user = currentUser(req);
  const rows = await all<{ id: string; role: string; content: string; created_at: string }>(
    "SELECT id, role, content, created_at FROM (SELECT * FROM advisor_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 60) ORDER BY created_at ASC", user.id,
  );
  res.json({ configured: features.llm, provider: llmProvider()?.name ?? null, items: rows.map((r) => ({ id: r.id, role: r.role, content: r.content, createdAt: r.created_at })) });
});

advisorRouter.post("/messages", requireVerified, serviceLimiter, async (req, res) => {
  const user = currentUser(req);
  const { message } = parseBody(req, messageSchema);
  await assertWithinLimit(user.id, "ai");
  const lang = (await get<{ language: string }>("SELECT language FROM user_settings WHERE user_id = ?", user.id))?.language ?? "en";
  const history = (await all<{ role: "user" | "assistant"; content: string }>(
    "SELECT role, content FROM (SELECT * FROM advisor_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 10) ORDER BY created_at ASC", user.id,
  )).map((m): ChatMessage => ({ role: m.role, content: m.content }));
  const started = Date.now();
  const answer = await complete({ system: SYSTEM(lang, await buildContext(user.id)), messages: [...history, { role: "user", content: message }], maxTokens: 2000 });
  const now = Date.now();
  const q = { id: newId(), role: "user", content: message, createdAt: new Date(now - 1).toISOString() };
  const a = { id: newId(), role: "assistant", content: answer, createdAt: new Date(now).toISOString() };
  for (const m of [q, a]) await run("INSERT INTO advisor_messages (id,user_id,role,content,created_at) VALUES (?,?,?,?,?)", m.id, user.id, m.role, m.content, m.createdAt);
  await recordAiRequest(user.id, "advisor");
  await logActivity(user.id, "market_analysis", "assistant", `Advisor: ${message.slice(0, 80)}`, { durationMs: Date.now() - started });
  res.status(201).json({ question: q, answer: a });
});

advisorRouter.delete("/messages", async (req, res) => {
  await run("DELETE FROM advisor_messages WHERE user_id = ?", currentUser(req).id);
  res.json({ ok: true });
});
