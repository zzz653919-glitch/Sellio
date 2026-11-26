import { Router } from "express";
import { z } from "zod";
import { config, features } from "../../config.js";
import { all, get, run } from "../../db/index.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { safeJson } from "../../lib/util.js";
import { param, parseBody, parseQuery } from "../../lib/validate.js";
import { logAudit } from "../../services/audit.js";
import { llmProvider } from "../../services/llm.js";
import { notify } from "../../services/notifications.js";
import { getPlans } from "../../services/plans.js";
import { settings } from "../../services/settings.js";
import { sendUpload, deleteUpload, type UploadRow } from "../../services/storage.js";
import { COUNTRIES, deleteMarketAnalysis } from "../forecast/market.js";
import { MIN_MONTHS } from "../forecast/seasonal.js";
import { topDemand, WATCHLIST_UZ } from "../forecast/topDemand.js";
import { countryStats } from "../intel/worldbank.js";
import { deleteGeneration } from "../studio/service.js";
import { requirePermission } from "./permissions.js";
import { like, pageOf, rangeOf } from "./util.js";

/** Projects and content moderation, AI Product Studio and Demand Forecast administration. */
export const contentAdminRouter = Router();

const listSchema = z.object({
  type: z.enum(["ads", "images", "forecasts", "saved"]).default("ads"),
  q: z.string().trim().max(200).optional(),
  status: z.string().trim().max(30).optional(),
});

contentAdminRouter.get("/content", requirePermission("content.view"), async (req, res) => {
  const q = parseQuery(req, listSchema.passthrough());
  const { page, limit, offset } = pageOf(req);
  const search = q.q ? like(q.q) : null;
  let items: unknown[] = [];
  let total = 0;
  if (q.type === "ads") {
    const where = ["1=1"]; const p: (string | number)[] = [];
    if (search) { where.push("(g.product_name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')"); p.push(search, search); }
    if (q.status === "templates") where.push("g.provider = 'vendora-templates'");
    else if (q.status) { where.push("g.status = ?"); p.push(q.status); }
    const rows = await all<{ id: string; product_name: string; style: string; status: string; provider: string; model: string; error: string | null; created_at: string; result_upload_id: string | null; upload_id: string; email: string; user_id: string }>(
      `SELECT g.id, g.product_name, g.style, g.status, g.provider, g.model, g.error, g.created_at, g.result_upload_id, g.upload_id, u.email, g.user_id FROM generations g JOIN users u ON u.id = g.user_id WHERE ${where.join(" AND ")} ORDER BY g.created_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
    total = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM generations g JOIN users u ON u.id = g.user_id WHERE ${where.join(" AND ")}`, ...p))?.n ?? 0;
    items = rows.map((r) => ({ id: r.id, title: r.product_name, kind: r.provider === "vendora-templates" ? "template_banner" : "ai_ad", status: r.status, model: r.model, error: r.error, owner: r.email, ownerId: r.user_id, createdAt: r.created_at, imageUrl: r.result_upload_id ? `/api/admin/files/${r.result_upload_id}` : null, sourceUrl: `/api/admin/files/${r.upload_id}` }));
  } else if (q.type === "images") {
    const where = ["up.kind != 'avatar'"]; const p: (string | number)[] = [];
    if (search) { where.push("(up.original_name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')"); p.push(search, search); }
    if (q.status === "product" || q.status === "generated") { where.push("up.kind = ?"); p.push(q.status); }
    const rows = await all<UploadRow & { email: string }>(`SELECT up.*, u.email FROM uploads up JOIN users u ON u.id = up.user_id WHERE ${where.join(" AND ")} ORDER BY up.created_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
    total = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM uploads up JOIN users u ON u.id = up.user_id WHERE ${where.join(" AND ")}`, ...p))?.n ?? 0;
    items = rows.map((r) => ({ id: r.id, title: r.original_name ?? r.kind, kind: r.kind, size: r.size, width: r.width, height: r.height, owner: r.email, ownerId: r.user_id, createdAt: r.created_at, imageUrl: `/api/admin/files/${r.id}` }));
  } else if (q.type === "forecasts") {
    const where = ["1=1"]; const p: (string | number)[] = [];
    if (search) { where.push("(m.query LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')"); p.push(search, search); }
    if (q.status) { where.push("m.status = ?"); p.push(q.status); }
    const rows = await all<{ id: string; query: string; range: string; status: string; geos_json: string; created_at: string; email: string; user_id: string }>(
      `SELECT m.id, m.query, m.range, m.status, m.geos_json, m.created_at, u.email, m.user_id FROM market_analyses m JOIN users u ON u.id = m.user_id WHERE ${where.join(" AND ")} ORDER BY m.created_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
    total = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM market_analyses m JOIN users u ON u.id = m.user_id WHERE ${where.join(" AND ")}`, ...p))?.n ?? 0;
    items = rows.map((r) => ({ id: r.id, title: r.query, kind: r.range === "compare" ? "comparison" : "analysis", status: r.status, areas: safeJson<string[]>(r.geos_json, []), owner: r.email, ownerId: r.user_id, createdAt: r.created_at }));
  } else {
    const where = ["1=1"]; const p: (string | number)[] = [];
    if (search) { where.push("(pr.title LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')"); p.push(search, search); }
    if (q.status) { where.push("pr.type = ?"); p.push(q.status); }
    const rows = await all<{ id: string; type: string; title: string; created_at: string; email: string; user_id: string }>(
      `SELECT pr.id, pr.type, pr.title, pr.created_at, u.email, pr.user_id FROM projects pr JOIN users u ON u.id = pr.user_id WHERE ${where.join(" AND ")} ORDER BY pr.created_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
    total = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM projects pr JOIN users u ON u.id = pr.user_id WHERE ${where.join(" AND ")}`, ...p))?.n ?? 0;
    items = rows.map((r) => ({ id: r.id, title: r.title, kind: r.type, status: "saved", owner: r.email, ownerId: r.user_id, createdAt: r.created_at }));
  }
  res.json({ type: q.type, items, total, page, limit });
});

/** Moderators can open user images for review. */
contentAdminRouter.get("/files/:id", requirePermission("content.view"), async (req, res) => {
  const row = await get<UploadRow>("SELECT * FROM uploads WHERE id = ?", param(req, "id"));
  if (!row) throw notFound("File not found");
  res.setHeader("Cache-Control", "private, max-age=300");
  await sendUpload(res, row);
});

const removeSchema = z.object({ reason: z.string().trim().min(3, "Write the reason (the owner is told)").max(300) });

/** Remove inappropriate or invalid content. The owner gets a notification with the reason. */
contentAdminRouter.delete("/content/:type/:id", requirePermission("content.moderate"), async (req, res) => {
  const type = param(req, "type");
  const id = param(req, "id");
  const { reason } = parseBody(req, removeSchema);
  let owner: { user_id: string; title: string } | undefined;
  if (type === "ads") {
    owner = await get("SELECT user_id, product_name AS title FROM generations WHERE id = ?", id);
    if (!owner) throw notFound("Not found");
    await deleteGeneration(owner.user_id, id);
  } else if (type === "images") {
    owner = await get("SELECT user_id, COALESCE(original_name, kind) AS title FROM uploads WHERE id = ?", id);
    if (!owner) throw notFound("Not found");
    await deleteUpload(owner.user_id, id);
  } else if (type === "forecasts") {
    owner = await get("SELECT user_id, query AS title FROM market_analyses WHERE id = ?", id);
    if (!owner) throw notFound("Not found");
    await deleteMarketAnalysis(owner.user_id, id);
  } else if (type === "saved") {
    owner = await get("SELECT user_id, title FROM projects WHERE id = ?", id);
    if (!owner) throw notFound("Not found");
    await run("DELETE FROM projects WHERE id = ?", id);
  } else throw badRequest("Unknown content type");
  await notify(owner.user_id, "account", "Content removed by an administrator", `"${owner.title}" was removed. Reason: ${reason}`);
  await logAudit(req, "content.removed", { type, id }, `Removed ${type} "${owner.title}"`, { reason, owner: owner.user_id });
  res.json({ ok: true });
});

/** Failed processing: AI generations that failed and analyses without data. */
contentAdminRouter.get("/content/failed", requirePermission("content.view"), async (_req, res) => {
  const gens = await all<{ id: string; product_name: string; error: string | null; model: string; created_at: string; email: string }>(
    "SELECT g.id, g.product_name, g.error, g.model, g.created_at, u.email FROM generations g JOIN users u ON u.id = g.user_id WHERE g.status = 'failed' ORDER BY g.created_at DESC LIMIT 50");
  const analyses = await all<{ id: string; query: string; created_at: string; email: string }>(
    "SELECT m.id, m.query, m.created_at, u.email FROM market_analyses m JOIN users u ON u.id = m.user_id WHERE m.status = 'no_data' ORDER BY m.created_at DESC LIMIT 50");
  res.json({
    generations: gens.map((g) => ({ id: g.id, title: g.product_name, error: g.error, model: g.model, owner: g.email, createdAt: g.created_at })),
    analyses: analyses.map((a) => ({ id: a.id, title: a.query, owner: a.email, createdAt: a.created_at })),
  });
});

// ---------- AI Product Studio ----------

const apiStats = async (providers: string[], fromIso: string, toIso: string) => {
  const ph = providers.map(() => "?").join(",");
  const r = await get<{ total: number; failed: number; avg_ms: number | null }>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed, AVG(duration_ms) AS avg_ms FROM api_calls WHERE provider IN (${ph}) AND created_at BETWEEN ? AND ?`, ...providers, fromIso, toIso);
  return { total: r?.total ?? 0, failed: r?.failed ?? 0, avgMs: r?.avg_ms ? Math.round(r.avg_ms) : null };
};

contentAdminRouter.get("/studio", requirePermission("studio.view"), async (req, res) => {
  const r = rangeOf(req);
  const counts = await all<{ kind: string; status: string; n: number }>(
    "SELECT CASE WHEN provider = 'vendora-templates' THEN 'template' ELSE 'ai' END AS kind, status, COUNT(*) AS n FROM generations WHERE created_at BETWEEN ? AND ? GROUP BY kind, status", r.fromIso, r.toIso);
  const queue = await all<{ id: string; product_name: string; status: string; created_at: string; email: string }>(
    "SELECT g.id, g.product_name, g.status, g.created_at, u.email FROM generations g JOIN users u ON u.id = g.user_id WHERE g.status IN ('queued','processing') ORDER BY g.created_at");
  const history = await all<{ id: string; product_name: string; status: string; model: string; provider: string; created_at: string; completed_at: string | null; email: string }>(
    "SELECT g.id, g.product_name, g.status, g.model, g.provider, g.created_at, g.completed_at, u.email FROM generations g JOIN users u ON u.id = g.user_id ORDER BY g.created_at DESC LIMIT 30");
  const errors = await all<{ provider: string; operation: string; status: number | null; error: string | null; created_at: string }>(
    "SELECT provider, operation, status, error, created_at FROM api_calls WHERE ok = 0 AND provider IN ('openai_image','openai_text','gemini') ORDER BY created_at DESC LIMIT 30");
  const text = llmProvider();
  const plans = getPlans();
  res.json({
    range: { from: r.from, to: r.to },
    counts,
    queue: queue.map((q) => ({ id: q.id, title: q.product_name, status: q.status, owner: q.email, createdAt: q.created_at })),
    provider: {
      image: { configured: features.imageGeneration, model: settings().ai.imageModel || config.IMAGE_MODEL, keySet: Boolean(config.OPENAI_API_KEY) },
      text: { configured: features.llm, provider: text?.name ?? null, model: text?.model ?? null, geminiKeySet: Boolean(config.GEMINI_API_KEY), openaiKeySet: Boolean(config.OPENAI_API_KEY) },
    },
    apiUsage: {
      images: await apiStats(["openai_image"], r.fromIso, r.toIso),
      text: await apiStats(["gemini", "openai_text"], r.fromIso, r.toIso),
    },
    history: history.map((h) => ({ id: h.id, title: h.product_name, status: h.status, model: h.model, kind: h.provider === "vendora-templates" ? "template" : "ai", owner: h.email, createdAt: h.created_at, completedAt: h.completed_at })),
    errors: errors.map((e) => ({ provider: e.provider, operation: e.operation, status: e.status, error: e.error, createdAt: e.created_at })),
    limits: { free: plans.free.limits, pro: plans.pro.limits },
  });
});

// ---------- Demand Forecast ----------

contentAdminRouter.get("/forecast", requirePermission("forecast.view"), async (req, res) => {
  const r = rangeOf(req);
  const byStatus = await all<{ status: string; kind: string; n: number }>(
    "SELECT status, CASE WHEN range = 'compare' THEN 'compare' ELSE 'analysis' END AS kind, COUNT(*) AS n FROM market_analyses WHERE created_at BETWEEN ? AND ? GROUP BY status, kind", r.fromIso, r.toIso);
  const history = await all<{ id: string; query: string; status: string; range: string; created_at: string; email: string; result_json: string }>(
    "SELECT m.id, m.query, m.status, m.range, m.created_at, u.email, m.result_json FROM market_analyses m JOIN users u ON u.id = m.user_id ORDER BY m.created_at DESC LIMIT 60");
  // Which back-tested model won in recent analyses (from the stored results).
  const models = new Map<string, number>();
  let areaErrors = 0;
  for (const h of history) {
    const res = safeJson<{ areas?: { status: string; seasonality?: { model?: { name: string } } | null }[]; items?: { seasonality?: { model?: { name: string } } | null }[] } | null>(h.result_json, null);
    for (const a of res?.areas ?? []) {
      if (a.status === "error") areaErrors++;
      if (a.seasonality?.model?.name) models.set(a.seasonality.model.name, (models.get(a.seasonality.model.name) ?? 0) + 1);
    }
    for (const it of res?.items ?? []) if (it.seasonality?.model?.name) models.set(it.seasonality.model.name, (models.get(it.seasonality.model.name) ?? 0) + 1);
  }
  const sources = await all<{ provider: string; total: number; failed: number; last_ok: string | null; last_fail: string | null }>(
    `SELECT provider, COUNT(*) AS total, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed,
            MAX(CASE WHEN ok = 1 THEN created_at END) AS last_ok, MAX(CASE WHEN ok = 0 THEN created_at END) AS last_fail
       FROM api_calls WHERE provider IN ('serpapi','world_bank','comtrade') AND created_at BETWEEN ? AND ? GROUP BY provider`, r.fromIso, r.toIso);
  const cache = await all<{ key: string; created_at: string }>("SELECT key, created_at FROM trend_cache ORDER BY created_at DESC LIMIT 200");
  const group = (prefix: string) => { const rows = cache.filter((c) => c.key.startsWith(prefix)); return { entries: rows.length, newest: rows[0]?.created_at ?? null, oldest: rows.at(-1)?.created_at ?? null }; };
  res.json({
    range: { from: r.from, to: r.to },
    byStatus, areaErrors,
    history: history.map((h) => ({ id: h.id, query: h.query, status: h.status, kind: h.range === "compare" ? "compare" : "analysis", owner: h.email, createdAt: h.created_at })),
    models: [...models.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
    sources: [
      { key: "serpapi", name: "Google Trends (SerpApi)", configured: features.serpapi, kind: "measured" },
      { key: "world_bank", name: "World Bank Open Data", configured: features.worldBank, kind: "official" },
      { key: "comtrade", name: "UN Comtrade", configured: features.comtrade, kind: "official" },
    ].map((s) => { const x = sources.find((y) => y.provider === s.key); return { ...s, calls: x?.total ?? 0, failed: x?.failed ?? 0, lastSuccess: x?.last_ok ?? null, lastFailure: x?.last_fail ?? null }; }),
    dataUpdates: { radar: group("top2:"), worldBank: group("wb:"), comtrade: group("ct:"), regions: group("reg:") },
    markets: COUNTRIES,
    regions: { country: "UZ", source: "Google Trends interest by region" },
    watchlist: WATCHLIST_UZ,
    configuration: {
      history: "5 years of weekly Google Trends data",
      minMonthsForSeasons: MIN_MONTHS,
      candidateModels: ["Prophet-style (trend changepoints + yearly seasonality)", "STL seasonal + damped trend", "Seasonal naive (same month last year)", "Holt / Holt-Winters (short horizons)"],
      modelSelection: "Back-test on the last 12 months; the model with the lowest sMAPE error is used",
      horizonsDays: [7, 30, 90, 365],
      radarRefresh: "Weekly (shared cache), daily cron when CRON_SECRET is set",
    },
  });
});

/** Re-download the Market Radar now (16 Google Trends requests). */
/**
 * Refresh all shared market data at once: Market Radar / Top 3 / season calendar, regions,
 * World Bank and UN Comtrade caches. Users' own saved analyses are not re-run (each one costs
 * Google Trends requests); they update when the user presses "Update".
 */
contentAdminRouter.post("/forecast/refresh-all", requirePermission("forecast.manage"), async (req, res) => {
  if (!features.serpapi) throw badRequest("SerpApi is not connected.");
  const cleared = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM trend_cache"))?.n ?? 0;
  await run("DELETE FROM trend_cache");
  const data = await topDemand("UZ");
  let worldBank = "off";
  if (features.worldBank) { try { await countryStats(["UZ"]); worldBank = "ok"; } catch { worldBank = "failed"; } }
  await logAudit(req, "forecast.all_refreshed", { type: "cache", id: "all" }, `Refreshed all shared market data (${cleared} cached entries cleared, ${data?.items.length ?? 0} radar products with data)`);
  res.json({ ok: true, cleared, items: data?.items.length ?? 0, worldBank, computedAt: data?.computedAt ?? null });
});

contentAdminRouter.post("/forecast/refresh-radar", requirePermission("forecast.manage"), async (req, res) => {
  if (!features.serpapi) throw badRequest("SerpApi is not connected.");
  await run("DELETE FROM trend_cache WHERE key = 'top2:UZ'");
  const data = await topDemand("UZ");
  await logAudit(req, "forecast.radar_refreshed", { type: "cache", id: "top2:UZ" }, `Refreshed the Market Radar (${data?.items.length ?? 0} products with data)`);
  res.json({ ok: true, items: data?.items.length ?? 0, computedAt: data?.computedAt ?? null });
});
