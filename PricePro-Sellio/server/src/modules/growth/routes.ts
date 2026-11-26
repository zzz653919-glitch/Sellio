import { Router } from "express";
import { z } from "zod";
import { all, get, run, transaction } from "../../db/index.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { newId, nowIso, safeJson } from "../../lib/util.js";
import { param, parseBody } from "../../lib/validate.js";
import { currentUser, requireAuth, requireVerified } from "../../middleware/auth.js";
import { serviceLimiter } from "../../middleware/rateLimit.js";
import { completeJson, LANGUAGE_NAME } from "../../services/llm.js";
import { assertWithinLimit, recordAiRequest } from "../../services/plans.js";
import { getBrand } from "../ads/brand.js";
import { learnings } from "../campaigns/learnings.js";
import { metrics } from "../campaigns/metrics.js";
import { CHANNELS } from "../campaigns/routes.js";
import type { Msg } from "../forecast/engine.js";
import { getMarketAnalysis } from "../forecast/market.js";
import { findOpportunities, topDemand } from "../forecast/topDemand.js";

/**
 * Growth workflow: an opportunity → AI explanation and marketing directions → ads → campaign →
 * results → learnings that feed the next recommendations.
 */
export const growthRouter = Router();
growthRouter.use(requireAuth);

export type Direction = { title: string; audience: string; message: string; channels: string[]; offer: string; why: string };
type Row = { id: string; user_id: string; product: string; query: string | null; source: "opportunity" | "forecast" | "manual"; evidence_json: string | null; explanation: string | null; directions_json: string | null; direction_json: string | null; campaign_id: string | null; created_at: string; updated_at: string };

const fill = (m: Msg) => Object.entries(m.vars ?? {}).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), m.key);

async function load(userId: string, id: string) {
  const r = await get<Row>("SELECT * FROM initiatives WHERE id = ? AND user_id = ?", id, userId);
  if (!r) throw notFound("Plan not found");
  return r;
}

export async function ownedInitiative(userId: string, id: string | undefined) {
  if (!id) return null;
  return load(userId, id);
}

export async function attachAsset(userId: string, initiativeId: string | undefined, kind: "banner" | "copy", refId: string) {
  if (!initiativeId) return;
  await load(userId, initiativeId);
  const now = nowIso();
  await transaction([
    ["INSERT INTO initiative_assets (id,initiative_id,user_id,kind,ref_id,created_at) VALUES (?,?,?,?,?,?)", newId(), initiativeId, userId, kind, refId, now],
    ["UPDATE initiatives SET updated_at = ? WHERE id = ?", now, initiativeId],
  ]);
}

type CampaignLite = { id: string; name: string; status: string; start_date: string; end_date: string; currency: string; budget: number | null };
type StatLite = { campaign_id: string; impressions: number; clicks: number; conversions: number; spend: number; revenue: number | null };

/** Serializes plans with a fixed number of queries, whatever the number of plans (no N+1). */
async function serializeMany(userId: string, rows: Row[]) {
  if (!rows.length) return [];
  const assets = await all<{ initiative_id: string; kind: "banner" | "copy"; ref_id: string }>("SELECT initiative_id, kind, ref_id FROM initiative_assets WHERE user_id = ? ORDER BY created_at", userId);
  const gens = await all<{ id: string; result_upload_id: string | null; product_name: string }>(
    "SELECT id, result_upload_id, product_name FROM generations WHERE user_id = ? AND id IN (SELECT ref_id FROM initiative_assets WHERE user_id = ? AND kind = 'banner')", userId, userId);
  const copies = await all<{ id: string; product: string; result_json: string }>(
    "SELECT id, product, result_json FROM ad_copies WHERE user_id = ? AND id IN (SELECT ref_id FROM initiative_assets WHERE user_id = ? AND kind = 'copy')", userId, userId);
  const campaigns = await all<CampaignLite>(
    "SELECT id, name, status, start_date, end_date, currency, budget FROM campaigns WHERE user_id = ? AND id IN (SELECT campaign_id FROM initiatives WHERE user_id = ? AND campaign_id IS NOT NULL)", userId, userId);
  const stats = campaigns.length ? await all<StatLite>(
    "SELECT campaign_id, impressions, clicks, conversions, spend, revenue FROM campaign_stats WHERE user_id = ? AND campaign_id IN (SELECT campaign_id FROM initiatives WHERE user_id = ? AND campaign_id IS NOT NULL)", userId, userId) : [];
  const items = campaigns.length ? await all<{ campaign_id: string; n: number; done: number }>(
    "SELECT campaign_id, COUNT(*) AS n, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done FROM campaign_items WHERE user_id = ? GROUP BY campaign_id", userId) : [];
  const genById = new Map(gens.map((g) => [g.id, g]));
  const copyById = new Map(copies.map((c) => [c.id, c]));
  const order = ["opportunity", "explain", "direction", "assets"] as const;
  return rows.map((r) => {
    const mine = assets.filter((a) => a.initiative_id === r.id);
    // Keep only assets that still exist.
    const banners = mine.filter((a) => a.kind === "banner").map((a) => genById.get(a.ref_id)).filter(Boolean)
      .map((g) => ({ id: g!.id, resultUrl: g!.result_upload_id ? `/api/files/${g!.result_upload_id}` : null, productName: g!.product_name }));
    const copyList = mine.filter((a) => a.kind === "copy").map((a) => copyById.get(a.ref_id)).filter(Boolean)
      .map((c) => ({ id: c!.id, product: c!.product, headline: safeJson<{ headlines?: string[] }>(c!.result_json, {}).headlines?.[0] ?? null }));
    const campaign = r.campaign_id ? campaigns.find((c) => c.id === r.campaign_id) ?? null : null;
    const cStats = campaign ? stats.filter((x) => x.campaign_id === campaign.id) : [];
    const it = campaign ? items.find((x) => x.campaign_id === campaign.id) : undefined;
    const direction = safeJson<Direction | null>(r.direction_json, null);
    const steps = {
      opportunity: true,
      explain: Boolean(r.explanation),
      direction: Boolean(direction),
      assets: banners.length + copyList.length > 0,
      campaign: Boolean(campaign),
      results: cStats.length > 0,
    };
    return {
      id: r.id, product: r.product, query: r.query, source: r.source,
      evidence: safeJson<unknown>(r.evidence_json, null),
      explanation: r.explanation,
      directions: safeJson<Direction[]>(r.directions_json, []),
      direction,
      banners, copies: copyList,
      campaign: campaign ? { ...campaign, results: cStats.length ? metrics(cStats) : null, itemsTotal: it?.n ?? 0, itemsDone: it?.done ?? 0 } : null,
      steps, nextStep: order.find((st) => !steps[st]) ?? null,
      done: order.filter((st) => steps[st]).length, total: order.length,
      createdAt: r.created_at, updatedAt: r.updated_at,
    };
  });
}

async function serialize(r: Row) {
  return (await serializeMany(r.user_id, [r]))[0];
}

growthRouter.get("/", async (req, res) => {
  const user = currentUser(req);
  const rows = await all<Row>("SELECT * FROM initiatives WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50", user.id);
  res.json({ items: await serializeMany(user.id, rows), learnings: await learnings(user.id) });
});

growthRouter.get("/learnings", async (req, res) => {
  res.json({ learnings: await learnings(currentUser(req).id) });
});

const createSchema = z.object({
  source: z.enum(["opportunity", "forecast", "manual"]),
  product: z.string().trim().min(1, "Enter the product").max(120),
  query: z.string().trim().max(100).optional(),
  analysisId: z.string().max(64).optional(),
});

/** Evidence is collected on the server from stored data, never taken from the browser. */
async function evidenceFor(userId: string, b: z.infer<typeof createSchema>) {
  if (b.source === "opportunity") {
    const data = await topDemand("UZ");
    const item = data?.items.find((i) => i.query === b.query);
    if (!data || !item) throw badRequest("This product is not in the current Market Radar data.");
    const opp = findOpportunities(data).find((o) => o.query === b.query);
    return {
      kind: "opportunity", source: "Google Trends, Uzbekistan, 5 years", computedAt: data.computedAt,
      label: item.label, nowVsAvgPct: item.nowVsAvgPct, yoyPct: item.yoyPct, next3Pct: item.next3Pct, phase: item.phase,
      peakMonths: item.peakMonths, nextRise: item.nextRise ?? null, nextPeak: item.nextPeak ?? null, confidence: item.confidence ?? null,
      score: opp?.score ?? null, reasons: opp?.reasons ?? [],
    };
  }
  if (b.source === "forecast") {
    if (!b.analysisId) throw badRequest("Choose a demand analysis.");
    const a = await getMarketAnalysis(userId, b.analysisId);
    const r = a.result as { areas?: { name: string; geo: string; changePct: number | null; trend: string | null; seasonality?: { peakMonths: number[]; nextRise: unknown; nextPeak: unknown; yoyPct: number | null; phase: string; model: { confidence: string } } | null }[] } | null;
    return {
      kind: "forecast", source: "Google Trends demand analysis", computedAt: a.createdAt, analysisId: a.id,
      areas: (r?.areas ?? []).slice(0, 5).map((x) => ({ area: x.name, geo: x.geo, changePct: x.changePct, trend: x.trend, peakMonths: x.seasonality?.peakMonths ?? [], nextRise: x.seasonality?.nextRise ?? null, nextPeak: x.seasonality?.nextPeak ?? null, yoyPct: x.seasonality?.yoyPct ?? null, phase: x.seasonality?.phase ?? null, confidence: x.seasonality?.model.confidence ?? null })),
    };
  }
  return null;
}

growthRouter.post("/", async (req, res) => {
  const user = currentUser(req);
  const b = parseBody(req, createSchema);
  const count = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM initiatives WHERE user_id = ?", user.id))?.n ?? 0;
  if (count >= 50) throw badRequest("You can keep up to 50 plans. Delete an old one first.");
  const evidence = await evidenceFor(user.id, b);
  const id = newId(), now = nowIso();
  await run("INSERT INTO initiatives (id,user_id,product,query,source,evidence_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
    id, user.id, b.product, b.query ?? null, b.source, evidence ? JSON.stringify(evidence) : null, now, now);
  res.status(201).json({ initiative: await serialize(await load(user.id, id)) });
});

growthRouter.get("/:id", async (req, res) => {
  res.json({ initiative: await serialize(await load(currentUser(req).id, param(req, "id"))) });
});

growthRouter.delete("/:id", async (req, res) => {
  const user = currentUser(req);
  const r = await load(user.id, param(req, "id"));
  await transaction([["DELETE FROM initiative_assets WHERE initiative_id = ?", r.id], ["DELETE FROM initiatives WHERE id = ?", r.id]]);
  res.json({ ok: true });
});

// ---------- Step 2: AI explanation and marketing directions ----------

growthRouter.post("/:id/explain", requireVerified, serviceLimiter, async (req, res) => {
  const user = currentUser(req);
  const r = await load(user.id, param(req, "id"));
  await assertWithinLimit(user.id, "ai");
  const lang = (await get<{ language: string }>("SELECT language FROM user_settings WHERE user_id = ?", user.id))?.language ?? "en";
  const brand = await getBrand(user.id);
  const learned = await learnings(user.id);
  const evidence = safeJson<Record<string, unknown> | null>(r.evidence_json, null);
  const raw = await completeJson<Record<string, unknown>>({
    system: `You are a marketing and business advisor for a small business in Uzbekistan. Answer in ${LANGUAGE_NAME[lang] ?? "English"}.
Use numbers only from DATA and name the source. Google Trends is relative search interest, not sales. Never invent statistics, prices or results.
Return JSON: {"explanation": "4–6 sentences: what the opportunity is, why it matters now, how sure the data is", "fit": "how it fits this business (or what data is missing)",
"risks": [2–4 risks], "directions": [exactly 3 marketing directions: {"title": "...", "audience": "...", "message": "main ad message", "channels": [from: ${CHANNELS.join(", ")}], "offer": "an offer idea the owner can decide on", "why": "..."}]}
Prefer channels that worked in the user's past results if there are any.
DATA: ${JSON.stringify({ product: r.product, searchTerm: r.query, evidence: evidence && { ...evidence, reasons: Array.isArray(evidence.reasons) ? (evidence.reasons as Msg[]).map(fill) : undefined }, brand: brand && { name: brand.businessName, tone: brand.tone }, pastCampaignResults: learned.overall ? { currency: learned.currency, byChannel: learned.byChannel, insights: learned.insights.map(fill) } : "none yet" }).slice(0, 12000)}`,
    messages: [{ role: "user", content: `Explain this opportunity for my business and suggest 3 marketing directions: ${r.product}` }],
    maxTokens: 3000,
  });
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const directions: Direction[] = (Array.isArray(raw.directions) ? raw.directions : []).slice(0, 3).map((d) => {
    const x = (d ?? {}) as Record<string, unknown>;
    return {
      title: str(x.title, 120), audience: str(x.audience, 300), message: str(x.message, 300), offer: str(x.offer, 200), why: str(x.why, 400),
      channels: (Array.isArray(x.channels) ? x.channels : []).map(String).filter((c): c is string => (CHANNELS as readonly string[]).includes(c)).slice(0, 4),
    };
  }).filter((d) => d.title);
  const explanation = [str(raw.explanation, 1500), str(raw.fit, 800) && `\n\n${str(raw.fit, 800)}`, Array.isArray(raw.risks) && raw.risks.length ? `\n\n${(raw.risks as unknown[]).slice(0, 4).map((x) => `- ${str(x, 300)}`).join("\n")}` : ""].join("");
  if (!explanation.trim() || !directions.length) throw badRequest("The AI service returned an incomplete answer. Try again.");
  await run("UPDATE initiatives SET explanation = ?, directions_json = ?, updated_at = ? WHERE id = ?", explanation, JSON.stringify(directions), nowIso(), r.id);
  await recordAiRequest(user.id, "growth_explain");
  res.json({ initiative: await serialize(await load(user.id, r.id)) });
});

// ---------- Step 3: choose a direction (one of the AI ones, or the owner's own) ----------

const directionSchema = z.object({
  index: z.number().int().min(0).max(2).optional(),
  custom: z.object({
    title: z.string().trim().min(1).max(120), audience: z.string().trim().max(300).default(""), message: z.string().trim().max(300).default(""),
    channels: z.array(z.enum(CHANNELS)).min(1).max(4), offer: z.string().trim().max(200).default(""), why: z.string().trim().max(400).default(""),
  }).optional(),
}).refine((d) => d.index !== undefined || d.custom, { message: "Choose a direction" });

growthRouter.post("/:id/direction", async (req, res) => {
  const user = currentUser(req);
  const r = await load(user.id, param(req, "id"));
  const b = parseBody(req, directionSchema);
  const d = b.custom ?? safeJson<Direction[]>(r.directions_json, [])[b.index!];
  if (!d) throw badRequest("Choose a direction");
  await run("UPDATE initiatives SET direction_json = ?, updated_at = ? WHERE id = ?", JSON.stringify(d), nowIso(), r.id);
  res.json({ initiative: await serialize(await load(user.id, r.id)) });
});

// ---------- Step 5: campaign from the chosen direction ----------

const monthEnd = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);

growthRouter.post("/:id/campaign", async (req, res) => {
  const user = currentUser(req);
  const r = await load(user.id, param(req, "id"));
  const b = parseBody(req, z.object({ budget: z.number().finite().min(0).max(1e13).nullable().optional(), currency: z.string().regex(/^[A-Z]{3}$/).default("UZS") }));
  if (r.campaign_id && (await get("SELECT id FROM campaigns WHERE id = ? AND user_id = ?", r.campaign_id, user.id))) throw badRequest("This plan already has a campaign.");
  const d = safeJson<Direction | null>(r.direction_json, null);
  if (!d) throw badRequest("Choose a marketing direction first.");
  const evidence = safeJson<{ nextPeak?: { date: string; months: number } | null; nextRise?: { months: number } | null; areas?: { nextPeak?: { date: string; months: number } | null }[] } | null>(r.evidence_json, null);
  const peak = evidence?.nextPeak ?? evidence?.areas?.find((a) => a.nextPeak)?.nextPeak ?? null;
  const count = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM campaigns WHERE user_id = ?", user.id))?.n ?? 0;
  if (count >= 100) throw badRequest("You can keep up to 100 campaigns.");
  const start = nowIso().slice(0, 10);
  let end = new Date(Date.now() + 27 * 86_400_000).toISOString().slice(0, 10);
  // Run until the end of the season peak month — measured from today, not from when the plan was made.
  if (peak?.date) {
    const peakEnd = monthEnd(peak.date.slice(0, 7));
    const sixMonths = new Date(Date.now() + 186 * 86_400_000).toISOString().slice(0, 10);
    if (peakEnd >= start && peakEnd <= sixMonths) end = peakEnd;
  }
  const seasonal = Boolean(evidence?.nextRise && evidence.nextRise.months <= 3);
  const id = newId(), now = nowIso();
  await transaction([
    ["INSERT INTO campaigns (id,user_id,name,objective,product,audience,budget,currency,start_date,end_date,channels_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?, 'active', ?,?)",
      id, user.id, `${r.product}: ${d.title}`.slice(0, 120), seasonal ? "seasonal" : "sales", r.product, d.audience || null, b.budget ?? null, b.currency, start, end,
      JSON.stringify(d.channels.length ? d.channels : ["instagram"]), now, now],
    ["UPDATE initiatives SET campaign_id = ?, updated_at = ? WHERE id = ?", id, now, r.id],
  ]);
  res.status(201).json({ initiative: await serialize(await load(user.id, r.id)), campaignId: id });
});

