import { Router } from "express";
import { all, get } from "../../db/index.js";
import { currentUser, requireAuth } from "../../middleware/auth.js";
import { usage } from "../../services/plans.js";
import { headline, listMarketAnalyses } from "../forecast/market.js";
import { listGenerations } from "../studio/service.js";
import { publicUser } from "../user/serialize.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

const n = async (sql: string, userId: string) => (await get<{ n: number }>(sql, userId))?.n ?? 0;

/** Every number here comes from the user's own stored records. */
dashboardRouter.get("/", async (req, res) => {
  const user = currentUser(req);
  const u = user.id;
  const stats = {
    totalProjects: await n("SELECT COUNT(*) AS n FROM projects WHERE user_id = ?", u),
    adsCreated: await n("SELECT COUNT(*) AS n FROM generations WHERE user_id = ? AND status = 'succeeded'", u),
    productsAnalyzed: await n("SELECT COUNT(DISTINCT lower(query)) AS n FROM market_analyses WHERE user_id = ? AND status = 'completed'", u),
    forecastsCompleted: await n("SELECT COUNT(*) AS n FROM market_analyses WHERE user_id = ? AND status = 'completed'", u),
  };
  const generations = (await listGenerations(u, 4)).items;
  const analyses = (await listMarketAnalyses(u, 3)).map((a) => ({ id: a.id, query: a.query, areas: a.geos.length, createdAt: a.createdAt, headline: headline(a) }));
  const recentActivity = (await all<{ id: string; type: string; service: string; title: string; success: number; created_at: string; ref_id: string | null }>(
    `SELECT id, type, service, title, success, created_at, ref_id FROM activity
     WHERE user_id = ? AND type IN ('ad_created','ad_failed','market_analysis','project_saved','image_uploaded')
     ORDER BY created_at DESC LIMIT 8`,
    u,
  )).map((a) => ({ id: a.id, type: a.type, service: a.service, title: a.title, success: a.success === 1, createdAt: a.created_at, refId: a.ref_id }));
  res.json({ user: publicUser(user), stats, generations, analyses, recentActivity, usage: await usage(u) });
});
