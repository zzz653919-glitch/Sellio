import { Router } from "express";
import { z } from "zod";
import { all, get } from "../../db/index.js";
import { csvFilename, toCsv } from "../../lib/csv.js";
import { parseQuery } from "../../lib/validate.js";
import { logAudit } from "../../services/audit.js";
import { requirePermission } from "./permissions.js";
import { daysBetween, like, pageOf, rangeOf } from "./util.js";

/** Platform analytics (all from database records), CSV reports, audit log and login history. */
export const insightsAdminRouter = Router();

type Range = ReturnType<typeof rangeOf>;
const iso = (field: string, shift: string) => `strftime('%Y-%m-%dT%H:%M:%fZ', ${field}, '${shift}')`;

async function analytics(r: Range) {
  const days = daysBetween(r.from, r.to);
  const map = async (sql: string, ...p: (string | number)[]) => new Map((await all<{ d: string; n: number }>(sql, ...p)).map((x) => [x.d, x.n]));
  const before = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE created_at < ?", r.fromIso))?.n ?? 0;
  const [signups, dau, aiByDay, adsAi, adsTpl, fcByDay, apiFailByDay] = await Promise.all([
    map("SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM users WHERE created_at BETWEEN ? AND ? GROUP BY d", r.fromIso, r.toIso),
    map("SELECT substr(created_at,1,10) AS d, COUNT(DISTINCT user_id) AS n FROM activity WHERE created_at BETWEEN ? AND ? GROUP BY d", r.fromIso, r.toIso),
    map("SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM ai_requests WHERE created_at BETWEEN ? AND ? GROUP BY d", r.fromIso, r.toIso),
    map("SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM generations WHERE provider != 'vendora-templates' AND created_at BETWEEN ? AND ? GROUP BY d", r.fromIso, r.toIso),
    map("SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM generations WHERE provider = 'vendora-templates' AND created_at BETWEEN ? AND ? GROUP BY d", r.fromIso, r.toIso),
    map("SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM market_analyses WHERE created_at BETWEEN ? AND ? GROUP BY d", r.fromIso, r.toIso),
    map("SELECT substr(created_at,1,10) AS d, COUNT(*) AS n FROM api_calls WHERE ok = 0 AND created_at BETWEEN ? AND ? GROUP BY d", r.fromIso, r.toIso),
  ]);
  let cumulative = before;
  const daily = days.map((d) => {
    cumulative += signups.get(d) ?? 0;
    return { date: d, signups: signups.get(d) ?? 0, totalUsers: cumulative, activeUsers: dau.get(d) ?? 0, aiRequests: aiByDay.get(d) ?? 0, aiAds: adsAi.get(d) ?? 0, templateBanners: adsTpl.get(d) ?? 0, forecasts: fcByDay.get(d) ?? 0, failedApiCalls: apiFailByDay.get(d) ?? 0 };
  });
  const mauFrom = new Date(Date.parse(r.toIso) - 30 * 86_400_000).toISOString();
  const mau = (await get<{ n: number }>("SELECT COUNT(DISTINCT user_id) AS n FROM activity WHERE created_at BETWEEN ? AND ?", mauFrom, r.toIso))?.n ?? 0;
  const avgDau = daily.length ? Math.round((daily.reduce((s, d) => s + d.activeUsers, 0) / daily.length) * 10) / 10 : 0;

  // Retention: of the users who signed up in the range, how many came back on days 1–7 and 8–30.
  const retention = await get<{ cohort: number; d7: number; d30: number; d30eligible: number }>(
    `SELECT COUNT(*) AS cohort,
       SUM(CASE WHEN EXISTS (SELECT 1 FROM activity a WHERE a.user_id = u.id AND a.created_at > ${iso("u.created_at", "+1 day")} AND a.created_at <= ${iso("u.created_at", "+7 days")}) THEN 1 ELSE 0 END) AS d7,
       SUM(CASE WHEN EXISTS (SELECT 1 FROM activity a WHERE a.user_id = u.id AND a.created_at > ${iso("u.created_at", "+7 days")} AND a.created_at <= ${iso("u.created_at", "+30 days")}) THEN 1 ELSE 0 END) AS d30,
       SUM(CASE WHEN u.created_at <= ? THEN 1 ELSE 0 END) AS d30eligible
     FROM users u WHERE u.created_at BETWEEN ? AND ?`, new Date(Date.now() - 30 * 86_400_000).toISOString(), r.fromIso, r.toIso);
  const aiByKind = await all<{ kind: string; n: number }>("SELECT kind, COUNT(*) AS n FROM ai_requests WHERE created_at BETWEEN ? AND ? GROUP BY kind ORDER BY n DESC", r.fromIso, r.toIso);
  const topSearches = await all<{ q: string; n: number; users: number }>(
    "SELECT lower(query) AS q, COUNT(*) AS n, COUNT(DISTINCT user_id) AS users FROM market_analyses WHERE created_at BETWEEN ? AND ? GROUP BY q ORDER BY n DESC LIMIT 20", r.fromIso, r.toIso);
  const forecastStatus = await all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM market_analyses WHERE created_at BETWEEN ? AND ? GROUP BY status", r.fromIso, r.toIso);
  const totalUsers = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM users"))?.n ?? 0;
  const proUsers = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE plan = 'pro'"))?.n ?? 0;
  const upgrades = await all<{ type: string; n: number }>("SELECT type, COUNT(*) AS n FROM subscription_events WHERE plan = 'pro' AND type IN ('upgraded','admin_assigned') AND created_at BETWEEN ? AND ? GROUP BY type", r.fromIso, r.toIso);
  const revenue = await all<{ currency: string | null; cents: number | null; n: number }>("SELECT currency, SUM(amount_cents) AS cents, COUNT(*) AS n FROM subscription_events WHERE type = 'payment' AND created_at BETWEEN ? AND ? GROUP BY currency", r.fromIso, r.toIso);
  const apiByProvider = await all<{ provider: string; total: number; failed: number; avg_ms: number | null }>(
    "SELECT provider, COUNT(*) AS total, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS failed, AVG(duration_ms) AS avg_ms FROM api_calls WHERE created_at BETWEEN ? AND ? GROUP BY provider ORDER BY total DESC", r.fromIso, r.toIso);
  const apiErrors = await all<{ provider: string; error: string | null; n: number; last: string }>(
    "SELECT provider, error, COUNT(*) AS n, MAX(created_at) AS last FROM api_calls WHERE ok = 0 AND created_at BETWEEN ? AND ? GROUP BY provider, error ORDER BY n DESC LIMIT 20", r.fromIso, r.toIso);
  return {
    range: { from: r.from, to: r.to },
    daily,
    activity: { mau, avgDau },
    retention: { cohort: retention?.cohort ?? 0, day7: retention?.d7 ?? 0, day30: retention?.d30 ?? 0, day30Eligible: retention?.d30eligible ?? 0 },
    aiByKind, topSearches, forecastStatus,
    conversion: { totalUsers, proUsers, ratePct: totalUsers ? Math.round((proUsers / totalUsers) * 1000) / 10 : 0, upgrades },
    revenue: revenue.map((x) => ({ currency: x.currency, amountCents: x.cents ?? 0, payments: x.n })),
    api: apiByProvider.map((a) => ({ provider: a.provider, total: a.total, failed: a.failed, avgMs: a.avg_ms ? Math.round(a.avg_ms) : null })),
    apiErrors: apiErrors.map((e) => ({ provider: e.provider, error: e.error, count: e.n, last: e.last })),
  };
}

insightsAdminRouter.get("/analytics", requirePermission("analytics.view"), async (req, res) => {
  res.json(await analytics(rangeOf(req)));
});

const exportSchema = z.object({ report: z.enum(["daily", "searches", "ai", "api", "api_errors"]) });

insightsAdminRouter.get("/analytics/export", requirePermission("analytics.view"), async (req, res) => {
  const { report } = parseQuery(req, exportSchema.passthrough());
  const r = rangeOf(req);
  const a = await analytics(r);
  const rows: (string | number | null)[][] =
    report === "daily" ? [["date", "signups", "total_users", "active_users", "ai_requests", "ai_ads", "template_banners", "forecasts", "failed_api_calls"], ...a.daily.map((d) => [d.date, d.signups, d.totalUsers, d.activeUsers, d.aiRequests, d.aiAds, d.templateBanners, d.forecasts, d.failedApiCalls])]
    : report === "searches" ? [["product", "analyses", "users"], ...a.topSearches.map((s) => [s.q, s.n, s.users])]
    : report === "ai" ? [["kind", "requests"], ...a.aiByKind.map((k) => [k.kind, k.n])]
    : report === "api" ? [["provider", "calls", "failed", "avg_ms"], ...a.api.map((x) => [x.provider, x.total, x.failed, x.avgMs])]
    : [["provider", "error", "count", "last_seen"], ...a.apiErrors.map((e) => [e.provider, e.error, e.count, e.last])];
  await logAudit(req, "analytics.exported", { type: "report", id: report }, `Exported the ${report} report (${r.from} – ${r.to})`);
  res.type("text/csv").attachment(csvFilename(`vendora-${report}-${r.from}-${r.to}`)).send(toCsv(rows));
});

// ---------- Audit log and login history ----------

insightsAdminRouter.get("/audit", requirePermission("audit.view"), async (req, res) => {
  const q = parseQuery(req, z.object({ q: z.string().trim().max(200).optional(), action: z.string().trim().max(60).optional() }).passthrough());
  const { page, limit, offset } = pageOf(req);
  const where: string[] = []; const p: (string | number)[] = [];
  if (q.q) { where.push("(admin_email LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR target_id = ?)"); p.push(like(q.q), like(q.q), q.q); }
  if (q.action) { where.push("action LIKE ? ESCAPE '\\'"); p.push(`${q.action.replace(/[\\%_]/g, (m) => `\\${m}`)}%`); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await all<{ id: string; admin_email: string; action: string; target_type: string | null; target_id: string | null; summary: string; details_json: string | null; ip: string | null; created_at: string }>(
    `SELECT * FROM audit_logs ${w} ORDER BY created_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
  const total = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_logs ${w}`, ...p))?.n ?? 0;
  res.json({ items: rows.map((r) => ({ id: r.id, admin: r.admin_email, action: r.action, targetType: r.target_type, targetId: r.target_id, summary: r.summary, details: r.details_json, ip: r.ip, createdAt: r.created_at })), total, page, limit });
});

insightsAdminRouter.get("/logins", requirePermission("audit.view"), async (req, res) => {
  const q = parseQuery(req, z.object({ result: z.enum(["all", "failed", "success"]).default("all"), q: z.string().trim().max(200).optional() }).passthrough());
  const { page, limit, offset } = pageOf(req);
  const where: string[] = []; const p: (string | number)[] = [];
  if (q.result === "failed") where.push("success = 0");
  if (q.result === "success") where.push("success = 1");
  if (q.q) { where.push("(email LIKE ? ESCAPE '\\' OR ip = ?)"); p.push(like(q.q), q.q); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await all<{ id: string; email: string; user_id: string | null; success: number; reason: string | null; ip: string | null; user_agent: string | null; created_at: string }>(
    `SELECT * FROM login_attempts ${w} ORDER BY created_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
  const total = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM login_attempts ${w}`, ...p))?.n ?? 0;
  // Failed-login monitoring: emails and IPs with many failures in the last 24 hours.
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const byIp = await all<{ ip: string | null; n: number }>("SELECT ip, COUNT(*) AS n FROM login_attempts WHERE success = 0 AND created_at >= ? GROUP BY ip HAVING n >= 5 ORDER BY n DESC LIMIT 10", since);
  const byEmail = await all<{ email: string; n: number }>("SELECT email, COUNT(*) AS n FROM login_attempts WHERE success = 0 AND created_at >= ? AND email != '(code)' GROUP BY email HAVING n >= 5 ORDER BY n DESC LIMIT 10", since);
  res.json({
    items: rows.map((r) => ({ id: r.id, email: r.email, userId: r.user_id, success: Boolean(r.success), reason: r.reason, ip: r.ip, device: r.user_agent, createdAt: r.created_at })),
    total, page, limit,
    suspicious: { byIp: byIp.map((x) => ({ ip: x.ip, failures: x.n })), byEmail: byEmail.map((x) => ({ email: x.email, failures: x.n })) },
  });
});
