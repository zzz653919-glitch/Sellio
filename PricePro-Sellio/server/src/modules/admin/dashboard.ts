import { Router } from "express";
import { all, get } from "../../db/index.js";
import { currentUser } from "../../middleware/auth.js";
import { can, requirePermission } from "./permissions.js";
import { daysBetween, rangeOf } from "./util.js";

/** Central dashboard: every number is counted from database records. */
export const dashboardAdminRouter = Router();

const n = async (sql: string, ...p: (string | number)[]) => (await get<{ n: number }>(sql, ...p))?.n ?? 0;

dashboardAdminRouter.get("/dashboard", requirePermission("dashboard.view"), async (req, res) => {
  const r = rangeOf(req);
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [totalUsers, activeUsers30, activeUsers7, newUsers, suspended, totalProjects, adsAi, adsTemplates, forecasts, aiRequests, freeUsers, proUsers, paidSubs, openTickets, openFlags, failedGen, apiFailed, apiTotal] = await Promise.all([
    n("SELECT COUNT(*) AS n FROM users"),
    n("SELECT COUNT(DISTINCT user_id) AS n FROM sessions WHERE last_seen_at >= ?", since30),
    n("SELECT COUNT(DISTINCT user_id) AS n FROM sessions WHERE last_seen_at >= ?", since7),
    n("SELECT COUNT(*) AS n FROM users WHERE created_at BETWEEN ? AND ?", r.fromIso, r.toIso),
    n("SELECT COUNT(*) AS n FROM users WHERE status = 'suspended'"),
    n("SELECT COUNT(*) AS n FROM projects"),
    n("SELECT COUNT(*) AS n FROM generations WHERE status = 'succeeded' AND provider != 'vendora-templates' AND created_at BETWEEN ? AND ?", r.fromIso, r.toIso),
    n("SELECT COUNT(*) AS n FROM generations WHERE provider = 'vendora-templates' AND created_at BETWEEN ? AND ?", r.fromIso, r.toIso),
    n("SELECT COUNT(*) AS n FROM market_analyses WHERE created_at BETWEEN ? AND ?", r.fromIso, r.toIso),
    n("SELECT COUNT(*) AS n FROM ai_requests WHERE created_at BETWEEN ? AND ?", r.fromIso, r.toIso),
    n("SELECT COUNT(*) AS n FROM users WHERE plan = 'free'"),
    n("SELECT COUNT(*) AS n FROM users WHERE plan = 'pro'"),
    n("SELECT COUNT(*) AS n FROM subscriptions WHERE plan = 'pro' AND provider = 'stripe' AND status IN ('active','trialing','past_due')"),
    n("SELECT COUNT(*) AS n FROM support_tickets WHERE status != 'resolved'"),
    n("SELECT COUNT(*) AS n FROM user_flags WHERE resolved_at IS NULL"),
    n("SELECT COUNT(*) AS n FROM generations WHERE status = 'failed' AND created_at >= ?", since7),
    n("SELECT COUNT(*) AS n FROM api_calls WHERE ok = 0 AND created_at BETWEEN ? AND ?", r.fromIso, r.toIso),
    n("SELECT COUNT(*) AS n FROM api_calls WHERE created_at BETWEEN ? AND ?", r.fromIso, r.toIso),
  ]);

  // Daily activity chart: sign-ups, active users, AI ads, forecasts, AI text requests.
  const days = daysBetween(r.from, r.to);
  const series = async (sql: string) => new Map((await all<{ d: string; n: number }>(sql, r.fromIso, r.toIso)).map((x) => [x.d, x.n]));
  const [signups, active, ads, fc, ai] = await Promise.all([
    series("SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM users WHERE created_at BETWEEN ? AND ? GROUP BY d"),
    series("SELECT substr(created_at,1,10) AS d, COUNT(DISTINCT user_id) AS n FROM activity WHERE created_at BETWEEN ? AND ? GROUP BY d"),
    series("SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM generations WHERE created_at BETWEEN ? AND ? GROUP BY d"),
    series("SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM market_analyses WHERE created_at BETWEEN ? AND ? GROUP BY d"),
    series("SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM ai_requests WHERE created_at BETWEEN ? AND ? GROUP BY d"),
  ]);
  const chart = days.map((d) => ({ date: d, signups: signups.get(d) ?? 0, activeUsers: active.get(d) ?? 0, ads: ads.get(d) ?? 0, forecasts: fc.get(d) ?? 0, aiRequests: ai.get(d) ?? 0 }));

  const api = await all<{ provider: string; total: number; failed: number }>(
    "SELECT provider, COUNT(*) AS total, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed FROM api_calls WHERE created_at BETWEEN ? AND ? GROUP BY provider ORDER BY total DESC", r.fromIso, r.toIso,
  );
  const recentUsers = await all<{ id: string; email: string; first_name: string; last_name: string; plan: string; created_at: string }>(
    "SELECT id, email, first_name, last_name, plan, created_at FROM users ORDER BY created_at DESC LIMIT 8",
  );
  const recentProjects = await all<{ id: string; type: string; title: string; created_at: string; email: string }>(
    "SELECT p.id, p.type, p.title, p.created_at, u.email FROM projects p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 8",
  );
  const canPay = can(currentUser(req).admin_role, "payments.view");
  const recentTransactions = canPay ? await all<{ id: string; type: string; amount_cents: number | null; currency: string | null; created_at: string; email: string }>(
    "SELECT e.id, e.type, e.amount_cents, e.currency, e.created_at, u.email FROM subscription_events e JOIN users u ON u.id = e.user_id WHERE e.type IN ('payment','upgraded','payment_failed','refund','canceled','downgraded') ORDER BY e.created_at DESC LIMIT 8",
  ) : [];

  // System notifications: things that need an administrator.
  const alerts: { kind: string; count: number; link: string }[] = [];
  if (openTickets) alerts.push({ kind: "open_tickets", count: openTickets, link: "/admin/support" });
  if (openFlags) alerts.push({ kind: "flagged_users", count: openFlags, link: "/admin/users?flagged=1" });
  if (failedGen) alerts.push({ kind: "failed_generations_7d", count: failedGen, link: "/admin/content?tab=failed" });
  if (apiFailed) alerts.push({ kind: "failed_api_calls", count: apiFailed, link: "/admin/analytics" });
  if (suspended) alerts.push({ kind: "suspended_users", count: suspended, link: "/admin/users?status=suspended" });

  res.json({
    range: { from: r.from, to: r.to },
    stats: { totalUsers, activeUsers30, activeUsers7, newUsers, suspended, totalProjects, adsAi, adsTemplates, forecasts, aiRequests, freeUsers, proUsers, paidSubscriptions: paidSubs, openTickets, apiCalls: apiTotal, apiFailed },
    chart, api,
    recentUsers: recentUsers.map((u) => ({ id: u.id, email: u.email, name: `${u.first_name} ${u.last_name}`, plan: u.plan, createdAt: u.created_at })),
    recentProjects: recentProjects.map((p) => ({ id: p.id, type: p.type, title: p.title, owner: p.email, createdAt: p.created_at })),
    recentTransactions: recentTransactions.map((t) => ({ id: t.id, type: t.type, amountCents: t.amount_cents, currency: t.currency, user: t.email, createdAt: t.created_at })),
    alerts,
  });
});
