import { Router } from "express";
import { z } from "zod";
import { features } from "../../config.js";
import { all, get } from "../../db/index.js";
import { csvFilename, toCsv } from "../../lib/csv.js";
import { badRequest } from "../../lib/errors.js";
import { param, parseBody, parseQuery } from "../../lib/validate.js";
import { currentUser } from "../../middleware/auth.js";
import { logAudit } from "../../services/audit.js";
import { getPlans, PLAN_KEYS, PLANS, usage, type Plan } from "../../services/plans.js";
import { defaultTimezone, periodBounds } from "../../services/quota.js";
import { saveSetting, settings } from "../../services/settings.js";
import { requirePermission } from "./permissions.js";
import { confirmPassword, daysBetween, like, pageOf, rangeOf } from "./util.js";

/** Plans, subscriptions and payments. Paid plans come from card payments approved by an administrator. */
export const billingAdminRouter = Router();

billingAdminRouter.get("/plans", requirePermission("subscriptions.view"), async (_req, res) => {
  const counts = await all<{ plan: string; n: number }>("SELECT plan, COUNT(*) AS n FROM users GROUP BY plan");
  const plans = getPlans();
  res.json({
    plans: PLAN_KEYS.map((key) => ({ key, ...plans[key], users: counts.find((c) => c.plan === key)?.n ?? 0, defaults: PLANS[key] })),
    paymentsConnected: settings().manualPayment.enabled,
  });
});

const planSchema = z.object({
  name: z.string().trim().min(1).max(40),
  priceMonthlyUsd: z.number().min(0).max(10_000),
  priceYearlyUsd: z.number().min(0).max(100_000).nullable().default(null),
  limits: z.object({ requests: z.number().int().min(0).max(1_000_000), ai: z.number().int().min(0).max(1_000_000) }),
  requestPeriod: z.enum(["day", "month"]),
  dailyImageLimit: z.number().int().min(0).max(100_000).nullable().default(null),
  benefits: z.array(z.string().trim().min(1).max(160)).max(12),
  enabled: z.boolean().default(true),
  password: z.string().min(1),
});

/** Edit plan details, prices and limits (Super Admin). */
billingAdminRouter.put("/plans/:plan", requirePermission("plans.manage"), async (req, res) => {
  const plan = param(req, "plan");
  if (!(PLAN_KEYS as readonly string[]).includes(plan)) throw badRequest("Unknown plan");
  const b = parseBody(req, planSchema);
  await confirmPassword(req, b.password);
  if (plan === "free" && !b.enabled) throw badRequest("The Free plan cannot be disabled.");
  const before = getPlans()[plan as Plan];
  const next = { ...settings().plans, [plan]: { name: b.name, priceMonthlyUsd: b.priceMonthlyUsd, priceYearlyUsd: plan === "free" ? null : b.priceYearlyUsd, limits: b.limits, requestPeriod: b.requestPeriod, dailyImageLimit: b.dailyImageLimit, benefits: b.benefits, enabled: plan === "free" ? true : b.enabled } };
  await saveSetting("plans", next, currentUser(req).id);
  await logAudit(req, "plan.updated", { type: "plan", id: plan }, `Updated the ${plan} plan`, { before, after: { ...b, password: undefined } });
  res.json({ plan: getPlans()[plan as Plan] });
});

const subsSchema = z.object({ status: z.enum(["active", "ended", "admin", "all"]).default("active"), q: z.string().trim().max(200).optional() });

billingAdminRouter.get("/subscriptions", requirePermission("subscriptions.view"), async (req, res) => {
  const q = parseQuery(req, subsSchema.passthrough());
  const { page, limit, offset } = pageOf(req);
  const where: string[] = [];
  const p: (string | number)[] = [];
  if (q.status === "active") where.push("s.plan IN ('pro','max') AND s.status IN ('active','trialing','past_due')");
  if (q.status === "ended") where.push("(s.status IN ('canceled','unpaid','incomplete_expired','expired') OR s.plan = 'free')");
  if (q.status === "admin") where.push("s.provider = 'admin'");
  if (q.q) { where.push("u.email LIKE ? ESCAPE '\\'"); p.push(like(q.q)); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await all<{ user_id: string; email: string; plan: string; status: string; provider: string | null; current_period_end: string | null; cancel_at_period_end: number; updated_at: string }>(
    `SELECT s.user_id, u.email, s.plan, s.status, s.provider, s.current_period_end, s.cancel_at_period_end, s.updated_at FROM subscriptions s JOIN users u ON u.id = s.user_id ${w} ORDER BY s.updated_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
  const total = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM subscriptions s JOIN users u ON u.id = s.user_id ${w}`, ...p))?.n ?? 0;
  const summary = await get<{ active: number; ended: number; admin: number }>(
    `SELECT SUM(CASE WHEN plan IN ('pro','max') AND status IN ('active','trialing','past_due') THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN status IN ('canceled','unpaid','incomplete_expired','expired') OR plan = 'free' THEN 1 ELSE 0 END) AS ended,
            SUM(CASE WHEN provider = 'admin' THEN 1 ELSE 0 END) AS admin FROM subscriptions`);
  res.json({
    items: rows.map((r) => ({ userId: r.user_id, email: r.email, plan: r.plan, status: r.status, provider: r.provider ?? "none", periodEnd: r.current_period_end, cancelAtPeriodEnd: Boolean(r.cancel_at_period_end), updatedAt: r.updated_at })),
    total, page, limit, summary: { active: summary?.active ?? 0, ended: summary?.ended ?? 0, admin: summary?.admin ?? 0 },
  });
});

billingAdminRouter.get("/subscriptions/events", requirePermission("subscriptions.view"), async (req, res) => {
  const q = parseQuery(req, z.object({ type: z.string().trim().max(40).optional() }).passthrough());
  const { page, limit, offset } = pageOf(req);
  const w = q.type ? "WHERE e.type = ?" : "";
  const p = q.type ? [q.type] : [];
  const rows = await all<{ id: string; type: string; plan: string | null; amount_cents: number | null; currency: string | null; provider_ref: string | null; created_at: string; email: string }>(
    `SELECT e.id, e.type, e.plan, e.amount_cents, e.currency, e.provider_ref, e.created_at, u.email FROM subscription_events e JOIN users u ON u.id = e.user_id ${w} ORDER BY e.created_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
  const total = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM subscription_events e ${w}`, ...p))?.n ?? 0;
  res.json({ items: rows.map((r) => ({ id: r.id, type: r.type, plan: r.plan, amountCents: r.amount_cents, currency: r.currency, reference: r.provider_ref, user: r.email, createdAt: r.created_at })), total, page, limit });
});

/** Current-period usage per user (each user's own plan period and time zone): who is close to the limit. */
billingAdminRouter.get("/subscriptions/usage", requirePermission("subscriptions.view"), async (_req, res) => {
  const since = new Date(Date.now() - 32 * 86_400_000).toISOString();
  const users = await all<{ id: string; email: string; plan: Plan }>(
    `SELECT u.id, u.email, u.plan FROM users u WHERE u.id IN (
       SELECT user_id FROM usage_events WHERE created_at >= ? UNION SELECT user_id FROM ai_requests WHERE created_at >= ?) LIMIT 300`, since, since);
  const items = await Promise.all(users.map(async (u) => {
    const s = await usage(u.id);
    const r = s.metrics.requests, ai = s.metrics.ai;
    const pct = Math.max(r.used / Math.max(1, r.limit), ai.used / Math.max(1, ai.limit)) * 100;
    return { userId: u.id, email: u.email, plan: u.plan, timezone: s.timezone, requests: r, ai, maxPct: Math.round(pct) };
  }));
  items.sort((x, y) => y.maxPct - x.maxPct);
  res.json({ items: items.slice(0, 100) });
});

/** Counted requests across the platform: today, this month and per day (in the platform's default time zone). */
billingAdminRouter.get("/usage/summary", requirePermission("subscriptions.view"), async (_req, res) => {
  const tz = defaultTimezone();
  const day = periodBounds("day", tz), month = periodBounds("month", tz);
  const iso = (t: number) => new Date(t).toISOString();
  const totals = async (from: number) => all<{ service: string; n: number }>(
    "SELECT service, COUNT(*) AS n FROM usage_events WHERE status = 'consumed' AND created_at >= ? GROUP BY service", iso(from));
  const byPlan = await all<{ plan: string; n: number }>(
    "SELECT plan, COUNT(*) AS n FROM usage_events WHERE status = 'consumed' AND created_at >= ? GROUP BY plan", iso(month.start));
  const since30 = Date.now() - 29 * 86_400_000;
  const daily = await all<{ d: string; service: string; n: number }>(
    "SELECT substr(created_at,1,10) AS d, service, COUNT(*) AS n FROM usage_events WHERE status = 'consumed' AND created_at >= ? GROUP BY d, service", iso(since30));
  const days = Array.from({ length: 30 }, (_, i) => new Date(since30 + i * 86_400_000).toISOString().slice(0, 10));
  const reserved = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM usage_events WHERE status = 'reserved'"))?.n ?? 0;
  res.json({
    timezone: tz,
    today: { from: iso(day.start), byService: await totals(day.start) },
    month: { from: iso(month.start), byService: await totals(month.start), byPlan },
    inProgress: reserved,
    daily: days.map((d) => ({ date: d, generation: daily.find((x) => x.d === d && x.service === "generation")?.n ?? 0, forecast: daily.find((x) => x.d === d && x.service === "forecast")?.n ?? 0 })),
  });
});

// ---------- Payments and revenue ----------

/** Revenue = approved card payments. */
billingAdminRouter.get("/payments", requirePermission("payments.view"), async (req, res) => {
  const r = rangeOf(req);
  const totals = await all<{ type: string; currency: string | null; n: number; cents: number | null }>(
    "SELECT type, currency, COUNT(*) AS n, SUM(amount_cents) AS cents FROM subscription_events WHERE type IN ('payment','payment_failed','refund') AND created_at BETWEEN ? AND ? GROUP BY type, currency", r.fromIso, r.toIso);
  const allTime = await all<{ currency: string | null; cents: number | null }>("SELECT currency, SUM(amount_cents) AS cents FROM subscription_events WHERE type = 'payment' GROUP BY currency");
  const daily = await all<{ d: string; currency: string | null; cents: number | null }>(
    "SELECT substr(created_at,1,10) AS d, currency, SUM(amount_cents) AS cents FROM subscription_events WHERE type = 'payment' AND created_at BETWEEN ? AND ? GROUP BY d, currency", r.fromIso, r.toIso);
  const monthly = await all<{ m: string; currency: string | null; cents: number | null; n: number }>(
    "SELECT substr(created_at,1,7) AS m, currency, SUM(amount_cents) AS cents, COUNT(*) AS n FROM subscription_events WHERE type = 'payment' GROUP BY m, currency ORDER BY m DESC LIMIT 24");
  const { page, limit, offset } = pageOf(req);
  const history = await all<{ id: string; type: string; amount_cents: number | null; currency: string | null; provider_ref: string | null; created_at: string; email: string }>(
    "SELECT e.id, e.type, e.amount_cents, e.currency, e.provider_ref, e.created_at, u.email FROM subscription_events e JOIN users u ON u.id = e.user_id WHERE e.type IN ('payment','payment_failed','refund','upgraded') AND e.created_at BETWEEN ? AND ? ORDER BY e.created_at DESC LIMIT ? OFFSET ?", r.fromIso, r.toIso, limit, offset);
  const total = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM subscription_events WHERE type IN ('payment','payment_failed','refund','upgraded') AND created_at BETWEEN ? AND ?", r.fromIso, r.toIso))?.n ?? 0;
  const days = daysBetween(r.from, r.to);
  const currencies = [...new Set(daily.map((d) => d.currency ?? "usd"))];
  res.json({
    connected: settings().manualPayment.enabled,
    range: { from: r.from, to: r.to },
    totals: totals.map((t) => ({ type: t.type, currency: t.currency, count: t.n, amountCents: t.cents ?? 0 })),
    allTimeRevenue: allTime.map((a) => ({ currency: a.currency, amountCents: a.cents ?? 0 })),
    chart: days.map((d) => ({ date: d, ...Object.fromEntries(currencies.map((c) => [c, (daily.find((x) => x.d === d && (x.currency ?? "usd") === c)?.cents ?? 0) / 100])) })),
    currencies,
    monthly: monthly.map((m) => ({ month: m.m, currency: m.currency, amountCents: m.cents ?? 0, payments: m.n })),
    history: history.map((h) => ({ id: h.id, type: h.type, amountCents: h.amount_cents, currency: h.currency, reference: h.provider_ref, user: h.email, createdAt: h.created_at })),
    total, page, limit,
  });
});

billingAdminRouter.get("/payments/export", requirePermission("payments.view"), async (req, res) => {
  const r = rangeOf(req);
  const rows = await all<{ type: string; amount_cents: number | null; currency: string | null; provider_ref: string | null; created_at: string; email: string }>(
    "SELECT e.type, e.amount_cents, e.currency, e.provider_ref, e.created_at, u.email FROM subscription_events e JOIN users u ON u.id = e.user_id WHERE e.type IN ('payment','payment_failed','refund','upgraded') AND e.created_at BETWEEN ? AND ? ORDER BY e.created_at", r.fromIso, r.toIso);
  await logAudit(req, "payments.exported", { type: "payments" }, `Exported ${rows.length} payment records`, r);
  res.type("text/csv").attachment(csvFilename(`vendora-payments-${r.from}-${r.to}`)).send(toCsv([
    ["date", "type", "user", "amount", "currency", "reference"],
    ...rows.map((x) => [x.created_at, x.type, x.email, x.amount_cents === null ? "" : (x.amount_cents / 100).toFixed(2), x.currency ?? "", x.provider_ref ?? ""]),
  ]));
});
