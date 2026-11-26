import { Router } from "express";
import { z } from "zod";
import { all, get, run, transaction, type Statement } from "../../db/index.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { newId, nowIso, safeJson } from "../../lib/util.js";
import { param, parseBody } from "../../lib/validate.js";
import { currentUser, requireAuth, requireVerified } from "../../middleware/auth.js";
import { serviceLimiter } from "../../middleware/rateLimit.js";
import { completeJson, LANGUAGE_NAME } from "../../services/llm.js";
import { assertWithinLimit, recordAiRequest } from "../../services/plans.js";
import { getBrand } from "../ads/brand.js";
import { buildRadar, topDemand } from "../forecast/topDemand.js";
import { learnings } from "./learnings.js";
import { metrics } from "./metrics.js";

export { metrics };

/** Campaign Planner (calendar, budget, progress) and Campaign Performance (results entered by the user). */
export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);

export const OBJECTIVES = ["awareness", "traffic", "sales", "leads", "launch", "seasonal"] as const;
export const CHANNELS = ["instagram", "telegram", "facebook", "google", "tiktok", "youtube", "offline", "other"] as const;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-01");

const campaignSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120),
  objective: z.enum(OBJECTIVES),
  product: z.string().trim().max(120).optional(),
  audience: z.string().trim().max(300).optional(),
  budget: z.number().finite().min(0).max(1e13).nullable().optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("UZS"),
  startDate: isoDate,
  endDate: isoDate,
  channels: z.array(z.enum(CHANNELS)).min(1, "Choose at least one channel").max(8),
  status: z.enum(["draft", "active", "finished"]).default("active"),
}).refine((c) => c.endDate >= c.startDate, { message: "The end date must be after the start date", path: ["endDate"] })
  .refine((c) => (Date.parse(c.endDate) - Date.parse(c.startDate)) / 86_400_000 <= 366, { message: "A campaign can last at most one year", path: ["endDate"] });

type CampaignRow = { id: string; user_id: string; name: string; objective: string; product: string | null; audience: string | null; budget: number | null; currency: string; start_date: string; end_date: string; channels_json: string; plan_json: string | null; status: string; created_at: string; updated_at: string };
type ItemRow = { id: string; date: string; channel: string; title: string; content: string | null; status: "planned" | "done"; source: "manual" | "ai" };
type StatRow = { id: string; date: string; creative: string; channel: string | null; impressions: number; clicks: number; conversions: number; spend: number; revenue: number | null };

const r2 = (v: number) => Math.round(v * 100) / 100;

async function load(userId: string, id: string) {
  const c = await get<CampaignRow>("SELECT * FROM campaigns WHERE id = ? AND user_id = ?", id, userId);
  if (!c) throw notFound("Campaign not found");
  return c;
}

type Loaded = { items: ItemRow[]; stats: StatRow[] };

function shape(c: CampaignRow, { items, stats }: Loaded, full: boolean) {
  const totals = metrics(stats);
  const byCreative = [...new Set(stats.map((s) => s.creative))].map((creative) => ({ creative, ...metrics(stats.filter((s) => s.creative === creative)) }));
  return {
    id: c.id, name: c.name, objective: c.objective, product: c.product, audience: c.audience, budget: c.budget, currency: c.currency,
    startDate: c.start_date, endDate: c.end_date, channels: safeJson<string[]>(c.channels_json, []), status: c.status,
    plan: safeJson<unknown>(c.plan_json, null),
    progress: { itemsDone: items.filter((i) => i.status === "done").length, itemsTotal: items.length, spent: totals.spend, budgetUsedPct: c.budget ? r2((totals.spend / c.budget) * 100) : null },
    totals,
    createdAt: c.created_at, updatedAt: c.updated_at,
    ...(full ? { items, stats, byCreative } : {}),
  };
}

async function serialize(c: CampaignRow, full = false) {
  const items = await all<ItemRow>("SELECT id, date, channel, title, content, status, source FROM campaign_items WHERE campaign_id = ? ORDER BY date, created_at", c.id);
  const stats = await all<StatRow>("SELECT id, date, creative, channel, impressions, clicks, conversions, spend, revenue FROM campaign_stats WHERE campaign_id = ? ORDER BY date, created_at", c.id);
  return shape(c, { items, stats }, full);
}

/** The list loads all items and results of the user in two queries (no query per campaign). */
async function serializeList(userId: string, rows: CampaignRow[]) {
  const items = await all<ItemRow & { campaign_id: string }>("SELECT campaign_id, id, date, channel, title, content, status, source FROM campaign_items WHERE user_id = ?", userId);
  const stats = await all<StatRow & { campaign_id: string }>("SELECT campaign_id, id, date, creative, channel, impressions, clicks, conversions, spend, revenue FROM campaign_stats WHERE user_id = ?", userId);
  return rows.map((c) => shape(c, { items: items.filter((i) => i.campaign_id === c.id), stats: stats.filter((x) => x.campaign_id === c.id) }, false));
}

campaignsRouter.get("/options", (_req, res) => {
  res.json({ objectives: OBJECTIVES, channels: CHANNELS });
});

campaignsRouter.get("/", async (req, res) => {
  const user = currentUser(req);
  const rows = await all<CampaignRow>("SELECT * FROM campaigns WHERE user_id = ? ORDER BY start_date DESC, created_at DESC LIMIT 100", user.id);
  res.json({ items: await serializeList(user.id, rows) });
});

campaignsRouter.post("/", async (req, res) => {
  const user = currentUser(req);
  const b = parseBody(req, campaignSchema);
  const count = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM campaigns WHERE user_id = ?", user.id))?.n ?? 0;
  if (count >= 100) throw badRequest("You can keep up to 100 campaigns.");
  const id = newId(), now = nowIso();
  await run(
    "INSERT INTO campaigns (id,user_id,name,objective,product,audience,budget,currency,start_date,end_date,channels_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    id, user.id, b.name, b.objective, b.product || null, b.audience || null, b.budget ?? null, b.currency, b.startDate, b.endDate, JSON.stringify(b.channels), b.status, now, now,
  );
  res.status(201).json({ campaign: await serialize(await load(user.id, id), true) });
});

campaignsRouter.get("/:id", async (req, res) => {
  res.json({ campaign: await serialize(await load(currentUser(req).id, param(req, "id")), true) });
});

campaignsRouter.put("/:id", async (req, res) => {
  const user = currentUser(req);
  const c = await load(user.id, param(req, "id"));
  const b = parseBody(req, campaignSchema);
  await run(
    "UPDATE campaigns SET name=?, objective=?, product=?, audience=?, budget=?, currency=?, start_date=?, end_date=?, channels_json=?, status=?, updated_at=? WHERE id = ?",
    b.name, b.objective, b.product || null, b.audience || null, b.budget ?? null, b.currency, b.startDate, b.endDate, JSON.stringify(b.channels), b.status, nowIso(), c.id,
  );
  res.json({ campaign: await serialize(await load(user.id, c.id), true) });
});

campaignsRouter.delete("/:id", async (req, res) => {
  const user = currentUser(req);
  const c = await load(user.id, param(req, "id"));
  await transaction([
    ["DELETE FROM campaign_items WHERE campaign_id = ?", c.id],
    ["DELETE FROM campaign_stats WHERE campaign_id = ?", c.id],
    ["DELETE FROM campaigns WHERE id = ?", c.id],
  ]);
  res.json({ ok: true });
});

// ---------- Calendar items ----------

const itemSchema = z.object({
  date: isoDate,
  channel: z.enum(CHANNELS),
  title: z.string().trim().min(1, "Enter a title").max(200),
  content: z.string().trim().max(2000).optional(),
  status: z.enum(["planned", "done"]).default("planned"),
});

// zod applies .default() even inside .partial(), so a separate schema without defaults is used for PATCH.
const itemPatchSchema = z.object({
  date: isoDate.optional(),
  channel: z.enum(CHANNELS).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().max(2000).optional(),
  status: z.enum(["planned", "done"]).optional(),
});

campaignsRouter.post("/:id/items", async (req, res) => {
  const user = currentUser(req);
  const c = await load(user.id, param(req, "id"));
  const b = parseBody(req, itemSchema);
  await run("INSERT INTO campaign_items (id,campaign_id,user_id,date,channel,title,content,status,source,created_at) VALUES (?,?,?,?,?,?,?,?,'manual',?)",
    newId(), c.id, user.id, b.date, b.channel, b.title, b.content || null, b.status, nowIso());
  res.status(201).json({ campaign: await serialize(c, true) });
});

campaignsRouter.patch("/:id/items/:itemId", async (req, res) => {
  const user = currentUser(req);
  const c = await load(user.id, param(req, "id"));
  const b = parseBody(req, itemPatchSchema);
  const item = await get<ItemRow>("SELECT * FROM campaign_items WHERE id = ? AND campaign_id = ?", param(req, "itemId"), c.id);
  if (!item) throw notFound("Item not found");
  const m = { ...item, ...b };
  await run("UPDATE campaign_items SET date=?, channel=?, title=?, content=?, status=? WHERE id = ?", m.date, m.channel, m.title, m.content ?? null, m.status, item.id);
  res.json({ campaign: await serialize(c, true) });
});

campaignsRouter.delete("/:id/items/:itemId", async (req, res) => {
  const user = currentUser(req);
  const c = await load(user.id, param(req, "id"));
  const r = await run("DELETE FROM campaign_items WHERE id = ? AND campaign_id = ?", param(req, "itemId"), c.id);
  if (!r.changes) throw notFound("Item not found");
  res.json({ campaign: await serialize(c, true) });
});

// ---------- AI plan ----------

campaignsRouter.post("/:id/plan", requireVerified, serviceLimiter, async (req, res) => {
  const user = currentUser(req);
  const c = await load(user.id, param(req, "id"));
  const { replace } = parseBody(req, z.object({ replace: z.boolean().default(true) }));
  await assertWithinLimit(user.id, "ai");
  const lang = (await get<{ language: string }>("SELECT language FROM user_settings WHERE user_id = ?", user.id))?.language ?? "en";
  const brand = await getBrand(user.id);
  let market: unknown = "not connected";
  try {
    const d = await topDemand("UZ");
    if (d) {
      const r = buildRadar(d);
      market = { source: "Google Trends, Uzbekistan (relative search interest, not sales)", rising: r.rising.slice(0, 5).map((i) => ({ product: i.label, peakMonths: i.peakMonths })), seasonSoon: r.upcoming.slice(0, 5).map((i) => i.label) };
    }
  } catch { market = "unavailable"; }
  const learned = await learnings(user.id);
  const past = learned.overall
    ? { note: "Results the user entered from earlier campaigns (measured, not estimated)", currency: learned.currency, reliable: learned.sample.reliable, byChannel: learned.byChannel.map((x) => ({ channel: x.channel, spend: x.spend, ctrPct: x.ctrPct, cpa: x.cpa, roas: x.roas, conversions: x.conversions })) }
    : "none yet";
  const channels = safeJson<string[]>(c.channels_json, []);
  const days = Math.round((Date.parse(c.end_date) - Date.parse(c.start_date)) / 86_400_000) + 1;
  const maxItems = Math.min(40, Math.max(4, Math.round(days / 2)));
  const raw = await completeJson<Record<string, unknown>>({
    system: `You are a marketing planner for a small business in Uzbekistan. Answer in ${LANGUAGE_NAME[lang] ?? "English"}.
Plan the campaign between ${c.start_date} and ${c.end_date} (inclusive) using only these channels: ${channels.join(", ")}.
Do not promise results or invent statistics. Budget split is a suggestion in percent. Return JSON:
{"summary": "...", "objectives": ["measurable goals the owner should track"], "audience": ["audience segments"], "budgetSplit": [{"channel": "...", "pct": number, "reason": "..."}],
"kpis": ["what to measure"], "items": [{"date": "YYYY-MM-DD", "channel": "...", "title": "short post/ad idea", "content": "what to publish, 1–3 sentences"}] (at most ${maxItems} items)}
Brand: ${JSON.stringify(brand ? { name: brand.businessName, tone: brand.tone, slogan: brand.slogan } : null)}
Market data: ${JSON.stringify(market)}
Past campaign results: ${JSON.stringify(past)}. If past results exist, give more budget to channels with lower cost per sale / higher ROAS and say so in "reason".`,
    messages: [{ role: "user", content: JSON.stringify({ name: c.name, objective: c.objective, product: c.product, audience: c.audience, budget: c.budget, currency: c.currency }) }],
    maxTokens: 4000,
  });
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const list = (v: unknown, n: number, k: number) => (Array.isArray(v) ? v.map((x) => str(x, n)).filter(Boolean).slice(0, k) : []);
  const split = (Array.isArray(raw.budgetSplit) ? raw.budgetSplit : [])
    .map((x) => x as Record<string, unknown>)
    .filter((x) => channels.includes(String(x.channel)) && Number.isFinite(Number(x.pct)) && Number(x.pct) > 0)
    .map((x) => ({ channel: String(x.channel), pct: Number(x.pct), reason: str(x.reason, 200) }));
  // Merge duplicate channels the model may return.
  for (let i = split.length - 1; i >= 0; i--) {
    const first = split.findIndex((x) => x.channel === split[i].channel);
    if (first !== i) { split[first].pct += split[i].pct; split.splice(i, 1); }
  }
  const total = split.reduce((s, x) => s + x.pct, 0);
  const budgetSplit = total > 0 ? split.map((x) => ({ ...x, pct: Math.round((x.pct / total) * 1000) / 10, amount: c.budget ? r2((c.budget * x.pct) / total) : null })) : [];
  const items = (Array.isArray(raw.items) ? raw.items : [])
    .map((x) => x as Record<string, unknown>)
    .filter((x) => typeof x.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && new Date(`${x.date}T00:00:00Z`).toISOString().slice(0, 10) === x.date && x.date >= c.start_date && x.date <= c.end_date && channels.includes(String(x.channel)) && str(x.title, 200))
    .slice(0, maxItems);
  const plan = { summary: str(raw.summary, 1000), objectives: list(raw.objectives, 300, 6), audience: list(raw.audience, 300, 6), kpis: list(raw.kpis, 200, 8), budgetSplit, generatedAt: nowIso() };
  const now = nowIso();
  const stmts: Statement[] = [];
  if (replace) stmts.push(["DELETE FROM campaign_items WHERE campaign_id = ? AND source = 'ai' AND status = 'planned'", c.id]);
  for (const it of items) stmts.push(["INSERT INTO campaign_items (id,campaign_id,user_id,date,channel,title,content,status,source,created_at) VALUES (?,?,?,?,?,?,?, 'planned', 'ai', ?)", newId(), c.id, user.id, String(it.date), String(it.channel), str(it.title, 200), str(it.content, 2000) || null, now]);
  stmts.push(["UPDATE campaigns SET plan_json = ?, updated_at = ? WHERE id = ?", JSON.stringify(plan), now, c.id]);
  await transaction(stmts);
  await recordAiRequest(user.id, "campaign_plan");
  res.json({ campaign: await serialize(await load(user.id, c.id), true), added: items.length });
});

// ---------- Results (entered by the user) ----------

const statSchema = z.object({
  date: isoDate,
  creative: z.string().trim().min(1, "Name the creative / ad variant").max(100),
  channel: z.enum(CHANNELS).optional(),
  impressions: z.number().int().min(0).max(1e10),
  clicks: z.number().int().min(0).max(1e10),
  conversions: z.number().int().min(0).max(1e9),
  spend: z.number().finite().min(0).max(1e13),
  revenue: z.number().finite().min(0).max(1e13).nullable().optional(),
}).refine((s) => s.clicks <= s.impressions || s.impressions === 0, { message: "Clicks cannot be more than impressions", path: ["clicks"] });

campaignsRouter.post("/:id/stats", async (req, res) => {
  const user = currentUser(req);
  const c = await load(user.id, param(req, "id"));
  const body = req.body as { rows?: unknown };
  const rows = Array.isArray(body?.rows) ? body.rows : [req.body];
  if (rows.length > 500) throw badRequest("At most 500 rows at a time.");
  const parsed = rows.map((r, i) => {
    const p = statSchema.safeParse(r);
    if (!p.success) throw badRequest(`Row ${i + 1}: ${p.error.issues[0]?.message ?? "invalid"}`);
    return p.data;
  });
  const now = nowIso();
  await transaction(parsed.map((s): Statement => [
    "INSERT INTO campaign_stats (id,campaign_id,user_id,date,creative,channel,impressions,clicks,conversions,spend,revenue,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    newId(), c.id, user.id, s.date, s.creative, s.channel ?? null, s.impressions, s.clicks, s.conversions, s.spend, s.revenue ?? null, now,
  ]));
  res.status(201).json({ campaign: await serialize(c, true) });
});

campaignsRouter.delete("/:id/stats/:statId", async (req, res) => {
  const user = currentUser(req);
  const c = await load(user.id, param(req, "id"));
  const r = await run("DELETE FROM campaign_stats WHERE id = ? AND campaign_id = ?", param(req, "statId"), c.id);
  if (!r.changes) throw notFound("Row not found");
  res.json({ campaign: await serialize(c, true) });
});
