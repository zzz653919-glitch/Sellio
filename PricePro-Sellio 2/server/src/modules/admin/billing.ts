import { Router } from "express";
import { z } from "zod";
import { features } from "../../config.js";
import { all, get } from "../../db/index.js";
import { csvFilename, toCsv } from "../../lib/csv.js";
import { badRequest } from "../../lib/errors.js";
import { startOfMonthIso } from "../../lib/util.js";
import { param, parseBody, parseQuery } from "../../lib/validate.js";
import { currentUser } from "../../middleware/auth.js";
import { logAudit } from "../../services/audit.js";
import { getPlans, PLANS } from "../../services/plans.js";
import { saveSetting, settings } from "../../services/settings.js";
import { requirePermission } from "./permissions.js";
import { confirmPassword, daysBetween, like, pageOf, rangeOf } from "./util.js";

/** Plans, subscriptions and payments. Payment data only comes from verified Stripe webhooks. */
export const billingAdminRouter = Router();

billingAdminRouter.get("/plans", requirePermission("subscriptions.view"), async (_req, res) => {
  const counts = await all<{ plan: string; n: number }>("SELECT plan, COUNT(*) AS n FROM users GROUP BY plan");
  const plans = getPlans();
  res.json({
    plans: (["free", "pro"] as const).map((key) => ({ key, ...plans[key], users: counts.find((c) => c.plan === key)?.n ?? 0, defaults: PLANS[key] })),
    paymentsConnected: features.payments,
  });
});

const planSchema = z.object({
  name: z.string().trim().min(1).max(40),
  priceMonthlyUsd: z.number().min(0).max(10_000),
  limits: z.object({ generations: z.number().int().min(0).max(1_000_000), forecasts: z.number().int().min(0).max(1_000_000), ai: z.number().int().min(0).max(1_000_000) }),
  benefits: z.array(z.string().trim().min(1).max(160)).max(12),
  enabled: z.boolean().default(true),
  password: z.string().min(1),
});

/** Edit plan details and limits (Super Admin). The price shown does not change the Stripe price. */
billingAdminRouter.put("/plans/:plan", requirePermission("plans.manage"), async (req, res) => {
  const plan = param(req, "plan");
  if (plan !== "free" && plan !== "pro") throw badRequest("Unknown plan");
  const b = parseBody(req, planSchema);
  await confirmPassword(req, b.password);
  if (plan === "free" && !b.enabled) throw badRequest("The Free plan cannot be disabled.");
  const before = getPlans()[plan];
  const next = { ...settings().plans, [plan]: { name: b.name, priceMonthlyUsd: b.priceMonthlyUsd, limits: b.limits, benefits: b.benefits, enabled: plan === "free" ? true : b.enabled } };
  await saveSetting("plans", next, currentUser(req).id);
  await logAudit(req, "plan.updated", { type: "plan", id: plan }, `Updated the ${plan} plan`, { before, after: { ...b, password: undefined } });
  res.json({ plan: getPlans()[plan] });
});

const subsSchema = z.object({ status: z.enum(["active", "ended", "admin", "all"]).default("active"), q: z.string().trim().max(200).optional() });

billingAdminRouter.get("/subscriptions", requirePermission("subscriptions.view"), async (req, res) => {
  const q = parseQuery(req, subsSchema.passthrough());
  const { page, limit, offset } = pageOf(req);
  const where: string[] = [];
  const p: (string | number)[] = [];
  if (q.status === "active") where.push("s.plan = 'pro' AND s.status IN ('active','trialing','past_due')");
  if (q.status === "ended") where.push("s.provider = 'stripe' AND (s.status IN ('canceled','unpaid','incomplete_expired') OR s.plan = 'free')");
  if (q.status === "admin") where.push("s.provider = 'admin'");
  if (q.q) { where.push("u.email LIKE ? ESCAPE '\\'"); p.push(like(q.q)); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await all<{ user_id: string; email: string; plan: string; status: string; provider: string | null; current_period_end: string | null; cancel_at_period_end: number; updated_at: string }>(
    `SELECT s.user_id, u.email, s.plan, s.status, s.provider, s.current_period_end, s.cancel_at_period_end, s.updated_at FROM subscriptions s JOIN users u ON u.id = s.user_id ${w} ORDER BY s.updated_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
  const total = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM subscriptions s JOIN users u ON u.id = s.user_id ${w}`, ...p))?.n ?? 0;
  const summary = await get<{ active: number; ended: number; admin: number }>(
    `SELECT SUM(CASE WHEN plan = 'pro' AND status IN ('active','trialing','past_due') THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN provider = 'stripe' AND (status IN ('canceled','unpaid','incomplete_expired') OR plan = 'free') THEN 1 ELSE 0 END) AS ended,
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

/** Monthly usage against plan limits: who is close to the limit. */
billingAdminRouter.get("/subscriptions/usage", requirePermission("subscriptions.view"), async (_req, res) => {
  const since = startOfMonthIso();
  const plans = getPlans();
  const rows = await all<{ id: string; email: string; plan: "free" | "pro"; generations: number; forecasts: number; ai: number }>(
    `SELECT u.id, u.email, u.plan,
       (SELECT COUNT(*) FROM generations g WHERE g.user_id = u.id AND g.created_at >= ? AND g.status != 'failed' AND g.provider != 'vendora-templates') AS generations,
       (SELECT COUNT(*) FROM market_analyses m WHERE m.user_id = u.id AND m.created_at >= ? AND m.status = 'completed') AS forecasts,
       (SELECT COUNT(*) FROM ai_requests a WHERE a.user_id = u.id AND a.created_at >= ?) AS ai
     FROM users u WHERE u.id IN (
       SELECT user_id FROM generations WHERE created_at >= ? UNION SELECT user_id FROM market_analyses WHERE created_at >= ? UNION SELECT user_id FROM ai_requests WHERE created_at >= ?)
     LIMIT 500`, since, since, since, since, since, since);
  const items = rows.map((r) => {
    const l = plans[r.plan].limits;
    const pct = Math.max(r.generations / Math.max(1, l.generations), r.forecasts / Math.max(1, l.forecasts), r.ai / Math.max(1, l.ai)) * 100;
    return { userId: r.id, email: r.email, plan: r.plan, used: { generations: r.generations, forecasts: r.forecasts, ai: r.ai }, limits: l, maxPct: Math.round(pct) };
  }).sort((a, b) => b.maxPct - a.maxPct).slice(0, 50);
  res.json({ periodStart: since, items });
});

// ---------- Payments and revenue ----------

/** Revenue = paid invoices (Stripe "invoice.paid"); checkout events are listed but not counted twice. */
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
    connected: features.payments,
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
    ["date", "type", "user", "amount", "currency", "stripe_reference"],
    ...rows.map((x) => [x.created_at, x.type, x.email, x.amount_cents === null ? "" : (x.amount_cents / 100).toFixed(2), x.currency ?? "", x.provider_ref ?? ""]),
  ]));
});
