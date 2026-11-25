import { Router } from "express";
import { all, get } from "../../db/index.js";
import { currentUser, requireAuth } from "../../middleware/auth.js";
import { usage } from "../../services/plans.js";
import { headline, listMarketAnalyses } from "../forecast/market.js";
import { listSearches } from "../prices/service.js";
import { listGenerations } from "../studio/service.js";
import { publicUser } from "../user/serialize.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

const n = (sql: string, userId: string) => get<{ n: number }>(sql, userId)?.n ?? 0;

/** Every number here comes from the user's own stored records. */
dashboardRouter.get("/", (req, res) => {
  const user = currentUser(req);
  const u = user.id;
  const stats = {
    totalProjects: n("SELECT COUNT(*) AS n FROM projects WHERE user_id = ?", u),
    adsCreated: n("SELECT COUNT(*) AS n FROM generations WHERE user_id = ? AND status = 'succeeded'", u),
    productsAnalyzed: n("SELECT COUNT(DISTINCT lower(query)) AS n FROM market_analyses WHERE user_id = ? AND status = 'completed'", u),
    forecastsCompleted: n("SELECT COUNT(*) AS n FROM market_analyses WHERE user_id = ? AND status = 'completed'", u),
    priceComparisons: n("SELECT COUNT(*) AS n FROM price_searches WHERE user_id = ? AND status IN ('completed','partial')", u),
  };
  const generations = listGenerations(u, 4).items;
  const analyses = listMarketAnalyses(u, 3).map((a) => ({ id: a.id, query: a.query, areas: a.geos.length, createdAt: a.createdAt, headline: headline(a) }));
  const searches = listSearches(u, 3).items;
  const recentActivity = all<{ id: string; type: string; service: string; title: string; success: number; created_at: string; ref_id: string | null }>(
    `SELECT id, type, service, title, success, created_at, ref_id FROM activity
     WHERE user_id = ? AND type IN ('ad_created','ad_failed','market_analysis','price_search','project_saved','image_uploaded')
     ORDER BY created_at DESC LIMIT 8`,
    u,
  ).map((a) => ({ id: a.id, type: a.type, service: a.service, title: a.title, success: a.success === 1, createdAt: a.created_at, refId: a.ref_id }));
  res.json({ user: publicUser(user), stats, generations, analyses, searches, recentActivity, usage: usage(u) });
});
