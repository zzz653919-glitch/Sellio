import { Router } from "express";
import { z } from "zod";
import { all, get } from "../../db/index.js";
import { badRequest } from "../../lib/errors.js";
import { parseQuery } from "../../lib/validate.js";
import { currentUser, requireAuth } from "../../middleware/auth.js";

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rangeSchema = z.object({ from: dateStr.optional(), to: dateStr.optional() });

function range(q: { from?: string; to?: string }) {
  const to = q.to ? new Date(`${q.to}T23:59:59.999Z`) : new Date();
  const from = q.from ? new Date(`${q.from}T00:00:00Z`) : new Date(to.getTime() - 29 * 86_400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw badRequest("Invalid date range");
  if (to.getTime() - from.getTime() > 3 * 366 * 86_400_000) throw badRequest("The date range can be at most 3 years.");
  return { from: from.toISOString(), to: to.toISOString() };
}

const count = async (sql: string, ...p: string[]) => (await get<{ n: number }>(sql, ...p))?.n ?? 0;

/** All numbers are computed from the user's own recorded activity — nothing is estimated. */
analyticsRouter.get("/summary", async (req, res) => {
  const user = currentUser(req);
  const { from, to } = range(parseQuery(req, rangeSchema));
  const u = user.id;

  const totals = {
    adsGenerated: await count("SELECT COUNT(*) AS n FROM generations WHERE user_id = ? AND status = 'succeeded' AND completed_at BETWEEN ? AND ?", u, from, to),
    adsFailed: await count("SELECT COUNT(*) AS n FROM generations WHERE user_id = ? AND status = 'failed' AND completed_at BETWEEN ? AND ?", u, from, to),
    forecastsCompleted: await count("SELECT COUNT(*) AS n FROM market_analyses WHERE user_id = ? AND status = 'completed' AND created_at BETWEEN ? AND ?", u, from, to),
    productsAnalyzed: await count("SELECT COUNT(DISTINCT lower(query)) AS n FROM market_analyses WHERE user_id = ? AND status = 'completed' AND created_at BETWEEN ? AND ?", u, from, to),
    projectsSaved: await count("SELECT COUNT(*) AS n FROM projects WHERE user_id = ? AND created_at BETWEEN ? AND ?", u, from, to),
    favoritesAdded: await count("SELECT COUNT(*) AS n FROM favorites WHERE user_id = ? AND created_at BETWEEN ? AND ?", u, from, to),
  };

  const daily = await all<{ day: string; service: string; n: number }>(
    `SELECT substr(created_at,1,10) AS day, service, COUNT(*) AS n FROM activity
     WHERE user_id = ? AND created_at BETWEEN ? AND ? AND type IN ('ad_created','ad_failed','market_analysis','project_saved')
     GROUP BY day, service ORDER BY day`,
    u, from, to,
  );
  const days: Record<string, { date: string; studio: number; forecast: number; projects: number }> = {};
  for (let t = Date.parse(from.slice(0, 10)); t <= Date.parse(to.slice(0, 10)); t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    days[d] = { date: d, studio: 0, forecast: 0, projects: 0 };
  }
  for (const r of daily) {
    const bucket = days[r.day];
    if (bucket && r.service in bucket) (bucket as unknown as Record<string, number>)[r.service] += r.n;
  }

  const performance = (await all<{ service: string; total: number; ok: number; avg_ms: number | null }>(
    `SELECT service, COUNT(*) AS total, SUM(success) AS ok, AVG(duration_ms) AS avg_ms FROM activity
     WHERE user_id = ? AND created_at BETWEEN ? AND ? AND type IN ('ad_created','ad_failed','market_analysis')
     GROUP BY service`,
    u, from, to,
  )).map((p) => ({
    service: p.service,
    total: p.total,
    successRate: p.total ? Math.round((p.ok / p.total) * 1000) / 10 : null,
    avgDurationMs: p.avg_ms === null ? null : Math.round(p.avg_ms),
  }));

  const usageByService = await all<{ service: string; n: number }>(
    "SELECT service, COUNT(*) AS n FROM activity WHERE user_id = ? AND created_at BETWEEN ? AND ? GROUP BY service ORDER BY n DESC",
    u, from, to,
  );

  res.json({ range: { from, to }, totals, timeline: Object.values(days), performance, usageByService });
});

const activitySchema = z.object({
  service: z.enum(["studio", "forecast", "account", "projects"]).optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

analyticsRouter.get("/activity", async (req, res) => {
  const user = currentUser(req);
  const q = parseQuery(req, activitySchema);
  const { from, to } = range({ from: q.from ?? "2000-01-01", to: q.to });
  const where = ["user_id = ?", "created_at BETWEEN ? AND ?"];
  const params: (string | number)[] = [user.id, from, to];
  if (q.service) { where.push("service = ?"); params.push(q.service); }
  const rows = await all<{ id: string; type: string; service: string; ref_id: string | null; title: string; success: number; created_at: string }>(
    `SELECT id, type, service, ref_id, title, success, created_at FROM activity WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...params, q.limit, q.offset,
  );
  const total = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM activity WHERE ${where.join(" AND ")}`, ...params))?.n ?? 0;
  res.json({
    items: rows.map((r) => ({ id: r.id, type: r.type, service: r.service, refId: r.ref_id, title: r.title, success: r.success === 1, createdAt: r.created_at })),
    total,
  });
});
