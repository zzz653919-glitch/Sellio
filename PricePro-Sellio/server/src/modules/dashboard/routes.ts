import { Router } from "express";
import { all, get } from "../../db/index.js";
import { currentUser, requireAuth } from "../../middleware/auth.js";
import { usage } from "../../services/plans.js";
import { headline, listMarketAnalyses } from "../forecast/market.js";
import { listGenerations } from "../studio/service.js";
import { publicUser } from "../user/serialize.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

/** Every number here comes from the user's own stored records. */
dashboardRouter.get("/", async (req, res) => {
  const user = currentUser(req);
  const u = user.id;
  // Independent reads run in parallel: on a remote database every round trip costs network time.
  const [counts, gens, analysesRaw, activityRows, usageNow] = await Promise.all([
    get<{ p: number; a: number; d: number; f: number }>(
      `SELECT (SELECT COUNT(*) FROM projects WHERE user_id = ?1) AS p,
              (SELECT COUNT(*) FROM generations WHERE user_id = ?1 AND status = 'succeeded') AS a,
              (SELECT COUNT(DISTINCT lower(query)) FROM market_analyses WHERE user_id = ?1 AND status = 'completed') AS d,
              (SELECT COUNT(*) FROM market_analyses WHERE user_id = ?1 AND status = 'completed') AS f`,
      u,
    ),
    listGenerations(u, 4),
    listMarketAnalyses(u, 3),
    all<{ id: string; type: string; service: string; title: string; success: number; created_at: string; ref_id: string | null }>(
      `SELECT id, type, service, title, success, created_at, ref_id FROM activity
       WHERE user_id = ? AND type IN ('ad_created','ad_failed','market_analysis','project_saved','image_uploaded')
       ORDER BY created_at DESC LIMIT 8`,
      u,
    ),
    usage(u),
  ]);
  const stats = { totalProjects: counts?.p ?? 0, adsCreated: counts?.a ?? 0, productsAnalyzed: counts?.d ?? 0, forecastsCompleted: counts?.f ?? 0 };
  const analyses = analysesRaw.map((a) => ({ id: a.id, query: a.query, areas: a.geos.length, createdAt: a.createdAt, headline: headline(a) }));
  const recentActivity = activityRows.map((a) => ({ id: a.id, type: a.type, service: a.service, title: a.title, success: a.success === 1, createdAt: a.created_at, refId: a.ref_id }));
  res.json({ user: publicUser(user), stats, generations: gens.items, analyses, recentActivity, usage: usageNow });
});
