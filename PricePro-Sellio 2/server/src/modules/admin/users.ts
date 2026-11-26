import { Router } from "express";
import { z } from "zod";
import { config } from "../../config.js";
import { all, get, run, transaction } from "../../db/index.js";
import { csvFilename, toCsv } from "../../lib/csv.js";
import { badRequest, forbidden, notFound } from "../../lib/errors.js";
import { newId, nowIso } from "../../lib/util.js";
import { param, parseBody, parseQuery } from "../../lib/validate.js";
import { currentUser, type AdminRole } from "../../middleware/auth.js";
import { deleteAccount } from "../../services/accounts.js";
import { logAudit } from "../../services/audit.js";
import { notify } from "../../services/notifications.js";
import { getPlans, usage } from "../../services/plans.js";
import { requirePermission } from "./permissions.js";
import { confirmPassword, like, pageOf } from "./util.js";

/** User management. Passwords, session tokens and 2FA secrets are never returned. */
export const usersAdminRouter = Router();

const listSchema = z.object({
  q: z.string().trim().max(200).optional(),
  plan: z.enum(["free", "pro"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  role: z.enum(["super_admin", "admin", "moderator", "none"]).optional(),
  flagged: z.enum(["1"]).optional(),
  verified: z.enum(["yes", "no"]).optional(),
  sort: z.enum(["newest", "oldest", "name", "last_active"]).default("newest"),
});

function filters(q: z.infer<typeof listSchema>) {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (q.q) {
    where.push("(u.email LIKE ? ESCAPE '\\' OR u.first_name || ' ' || u.last_name LIKE ? ESCAPE '\\' OR u.id = ?)");
    params.push(like(q.q), like(q.q), q.q);
  }
  if (q.plan) { where.push("u.plan = ?"); params.push(q.plan); }
  if (q.status) { where.push("u.status = ?"); params.push(q.status); }
  if (q.role === "none") where.push("a.role IS NULL");
  else if (q.role) { where.push("a.role = ?"); params.push(q.role); }
  if (q.flagged) where.push("EXISTS (SELECT 1 FROM user_flags f WHERE f.user_id = u.id AND f.resolved_at IS NULL)");
  if (q.verified === "yes") where.push("u.email_verified_at IS NOT NULL");
  if (q.verified === "no") where.push("u.email_verified_at IS NULL");
  const order = { newest: "u.created_at DESC", oldest: "u.created_at ASC", name: "u.first_name, u.last_name", last_active: "last_active DESC" }[q.sort];
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params, order };
}

type ListRow = { id: string; email: string; first_name: string; last_name: string; plan: string; status: string; email_verified_at: string | null; created_at: string; role: AdminRole | null; last_active: string | null; flags: number };
const SELECT = `SELECT u.id, u.email, u.first_name, u.last_name, u.plan, u.status, u.email_verified_at, u.created_at, a.role,
  (SELECT MAX(last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_active,
  (SELECT COUNT(*) FROM user_flags f WHERE f.user_id = u.id AND f.resolved_at IS NULL) AS flags
  FROM users u LEFT JOIN admin_roles a ON a.user_id = u.id`;
const roleOf = (r: ListRow) => (config.SUPER_ADMIN_EMAILS.includes(r.email.toLowerCase()) ? "super_admin" : r.role);
const shape = (r: ListRow) => ({ id: r.id, email: r.email, name: `${r.first_name} ${r.last_name}`, plan: r.plan, status: r.status, verified: Boolean(r.email_verified_at), createdAt: r.created_at, role: roleOf(r), lastActive: r.last_active, openFlags: r.flags });

usersAdminRouter.get("/users", requirePermission("users.view"), async (req, res) => {
  const q = parseQuery(req, listSchema.passthrough());
  const { page, limit, offset } = pageOf(req);
  const f = filters(q);
  const rows = await all<ListRow>(`${SELECT} ${f.sql} ORDER BY ${f.order} LIMIT ? OFFSET ?`, ...f.params, limit, offset);
  const total = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM users u LEFT JOIN admin_roles a ON a.user_id = u.id ${f.sql}`, ...f.params))?.n ?? 0;
  res.json({ items: rows.map(shape), total, page, limit });
});

usersAdminRouter.get("/users/export", requirePermission("users.manage"), async (req, res) => {
  const q = parseQuery(req, listSchema.passthrough());
  const f = filters(q);
  const rows = await all<ListRow>(`${SELECT} ${f.sql} ORDER BY ${f.order} LIMIT 20000`, ...f.params);
  await logAudit(req, "users.exported", { type: "users" }, `Exported ${rows.length} user records`, q);
  res.type("text/csv").attachment(csvFilename(`vendora-users-${nowIso().slice(0, 10)}`)).send(toCsv([
    ["id", "email", "name", "plan", "status", "email_verified", "role", "registered", "last_active"],
    ...rows.map((r) => [r.id, r.email, `${r.first_name} ${r.last_name}`, r.plan, r.status, r.email_verified_at ? "yes" : "no", roleOf(r) ?? "", r.created_at, r.last_active ?? ""]),
  ]));
});

async function target(id: string) {
  const u = await get<ListRow & { suspended_reason: string | null; plan_source: string | null; updated_at: string }>(`${SELECT.replace("u.created_at, a.role", "u.created_at, u.suspended_reason, u.plan_source, u.updated_at, a.role")} WHERE u.id = ?`, id);
  if (!u) throw notFound("User not found");
  return u;
}

/** Admins can act on normal users; only a Super Admin can act on another administrator. */
function assertCanActOn(req: Parameters<typeof currentUser>[0], t: ListRow) {
  const me = currentUser(req);
  if (t.id === me.id) throw badRequest("You cannot do this to your own account.");
  if (config.SUPER_ADMIN_EMAILS.includes(t.email.toLowerCase())) throw forbidden("This Super Admin is protected by the server configuration.");
  if (roleOf(t) && me.admin_role !== "super_admin") throw forbidden("Only a Super Admin can change another administrator's account.");
}

usersAdminRouter.get("/users/:id", requirePermission("users.view"), async (req, res) => {
  const id = param(req, "id");
  const u = await target(id);
  const count = async (sql: string) => (await get<{ n: number }>(sql, id))?.n ?? 0;
  const [projects, generations, analyses, datasets, campaigns, tickets] = await Promise.all([
    count("SELECT COUNT(*) AS n FROM projects WHERE user_id = ?"),
    count("SELECT COUNT(*) AS n FROM generations WHERE user_id = ?"),
    count("SELECT COUNT(*) AS n FROM market_analyses WHERE user_id = ?"),
    count("SELECT COUNT(*) AS n FROM business_datasets WHERE user_id = ?"),
    count("SELECT COUNT(*) AS n FROM campaigns WHERE user_id = ?"),
    count("SELECT COUNT(*) AS n FROM support_tickets WHERE user_id = ?"),
  ]);
  const subscription = await get<{ plan: string; status: string; provider: string | null; current_period_end: string | null; cancel_at_period_end: number; updated_at: string }>(
    "SELECT plan, status, provider, current_period_end, cancel_at_period_end, updated_at FROM subscriptions WHERE user_id = ?", id);
  const events = await all<{ id: string; type: string; plan: string | null; amount_cents: number | null; currency: string | null; created_at: string }>(
    "SELECT id, type, plan, amount_cents, currency, created_at FROM subscription_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 15", id);
  const activity = await all<{ id: string; type: string; service: string; title: string; success: number; created_at: string }>(
    "SELECT id, type, service, title, success, created_at FROM activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 25", id);
  const projectList = await all<{ id: string; type: string; title: string; created_at: string }>(
    "SELECT id, type, title, created_at FROM projects WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", id);
  const logins = await all<{ success: number; reason: string | null; ip: string | null; user_agent: string | null; created_at: string }>(
    "SELECT success, reason, ip, user_agent, created_at FROM login_attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT 15", id);
  const sessions = await get<{ n: number; last: string | null }>("SELECT COUNT(*) AS n, MAX(last_seen_at) AS last FROM sessions WHERE user_id = ? AND expires_at > ?", id, nowIso());
  const flags = await all<{ id: string; reason: string; created_at: string; resolved_at: string | null; flagged_by_email: string | null }>(
    "SELECT f.id, f.reason, f.created_at, f.resolved_at, b.email AS flagged_by_email FROM user_flags f LEFT JOIN users b ON b.id = f.flagged_by WHERE f.user_id = ? ORDER BY f.created_at DESC LIMIT 20", id);
  const language = (await get<{ language: string }>("SELECT language FROM user_settings WHERE user_id = ?", id))?.language ?? null;
  res.json({
    user: { ...shape(u), suspendedReason: u.suspended_reason, planSource: u.plan_source, language, updatedAt: u.updated_at },
    counts: { projects, generations, analyses, datasets, campaigns, tickets },
    usage: await usage(id),
    subscription: subscription ? { plan: subscription.plan, status: subscription.status, provider: subscription.provider, periodEnd: subscription.current_period_end, cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end), updatedAt: subscription.updated_at } : null,
    subscriptionEvents: events.map((e) => ({ id: e.id, type: e.type, plan: e.plan, amountCents: e.amount_cents, currency: e.currency, createdAt: e.created_at })),
    activity: activity.map((a) => ({ id: a.id, type: a.type, service: a.service, title: a.title, success: Boolean(a.success), createdAt: a.created_at })),
    projects: projectList.map((p) => ({ id: p.id, type: p.type, title: p.title, createdAt: p.created_at })),
    logins: logins.map((l) => ({ success: Boolean(l.success), reason: l.reason, ip: l.ip, device: l.user_agent, createdAt: l.created_at })),
    sessions: { active: sessions?.n ?? 0, lastSeen: sessions?.last ?? null },
    flags: flags.map((f) => ({ id: f.id, reason: f.reason, createdAt: f.created_at, resolvedAt: f.resolved_at, flaggedBy: f.flagged_by_email })),
  });
});

const planSchema = z.object({ plan: z.enum(["free", "pro"]), password: z.string().min(1), note: z.string().trim().max(300).optional() });

/** Manual plan assignment (no payment is created or implied; marked as admin-assigned). */
usersAdminRouter.post("/users/:id/plan", requirePermission("users.manage"), async (req, res) => {
  const id = param(req, "id");
  const b = parseBody(req, planSchema);
  await confirmPassword(req, b.password);
  const t = await target(id);
  if (t.plan === b.plan) throw badRequest(`The user is already on the ${b.plan} plan.`);
  const stripe = await get<{ status: string }>("SELECT status FROM subscriptions WHERE user_id = ? AND provider = 'stripe' AND status IN ('active','trialing','past_due')", id);
  const now = nowIso();
  await transaction([
    ["UPDATE users SET plan = ?, plan_source = 'admin', updated_at = ? WHERE id = ?", b.plan, now, id],
    [`INSERT INTO subscriptions (user_id, plan, status, provider, updated_at) VALUES (?, ?, 'active', 'admin', ?)
      ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, status = CASE WHEN subscriptions.provider = 'stripe' THEN subscriptions.status ELSE 'active' END,
      provider = CASE WHEN subscriptions.provider = 'stripe' THEN subscriptions.provider ELSE 'admin' END, updated_at = excluded.updated_at`, id, b.plan, now],
    ["INSERT INTO subscription_events (id,user_id,type,plan,provider_ref,created_at) VALUES (?,?,?,?,?,?)", newId(), id, "admin_assigned", b.plan, `admin:${currentUser(req).email}`, now],
  ]);
  await notify(id, "account", `You are now on the ${getPlans()[b.plan].name} plan`, b.plan === "pro" ? "An administrator gave your account the Pro plan." : "An administrator moved your account to the Free plan.");
  await logAudit(req, "user.plan_assigned", { type: "user", id }, `Plan of ${t.email}: ${t.plan} → ${b.plan}`, { note: b.note, stripeSubscriptionActive: Boolean(stripe) });
  res.json({ ok: true, warning: stripe && b.plan === "free" ? "The user still has an active Stripe subscription. Cancel it in Stripe, or it will set the plan back to Pro on the next payment." : null });
});

const suspendSchema = z.object({ reason: z.string().trim().min(3, "Write a reason").max(300) });

usersAdminRouter.post("/users/:id/suspend", requirePermission("users.manage"), async (req, res) => {
  const id = param(req, "id");
  const { reason } = parseBody(req, suspendSchema);
  const t = await target(id);
  assertCanActOn(req, t);
  if (t.status === "suspended") throw badRequest("The account is already suspended.");
  await transaction([
    ["UPDATE users SET status = 'suspended', suspended_reason = ?, updated_at = ? WHERE id = ?", reason, nowIso(), id],
    ["DELETE FROM sessions WHERE user_id = ?", id],
  ]);
  await logAudit(req, "user.suspended", { type: "user", id }, `Suspended ${t.email}`, { reason });
  res.json({ ok: true });
});

usersAdminRouter.post("/users/:id/reactivate", requirePermission("users.manage"), async (req, res) => {
  const id = param(req, "id");
  const t = await target(id);
  assertCanActOn(req, t);
  if (t.status === "active") throw badRequest("The account is already active.");
  await run("UPDATE users SET status = 'active', suspended_reason = NULL, updated_at = ? WHERE id = ?", nowIso(), id);
  await logAudit(req, "user.reactivated", { type: "user", id }, `Reactivated ${t.email}`);
  res.json({ ok: true });
});

const deleteSchema = z.object({ password: z.string().min(1), confirmEmail: z.string().trim() });

usersAdminRouter.delete("/users/:id", requirePermission("users.delete"), async (req, res) => {
  const id = param(req, "id");
  const b = parseBody(req, deleteSchema);
  const t = await target(id);
  assertCanActOn(req, t);
  if (b.confirmEmail.toLowerCase() !== t.email.toLowerCase()) throw badRequest("Type the user's email exactly to confirm.");
  await confirmPassword(req, b.password);
  await deleteAccount(id);
  await logAudit(req, "user.deleted", { type: "user", id }, `Deleted the account ${t.email}`, { plan: t.plan, createdAt: t.created_at });
  res.json({ ok: true });
});

const flagSchema = z.object({ reason: z.string().trim().min(3, "Write what is suspicious").max(500) });

/** Moderators report suspicious accounts; admins review the flags. */
usersAdminRouter.post("/users/:id/flag", requirePermission("users.flag"), async (req, res) => {
  const id = param(req, "id");
  const { reason } = parseBody(req, flagSchema);
  const t = await target(id);
  await run("INSERT INTO user_flags (id,user_id,reason,flagged_by,created_at) VALUES (?,?,?,?,?)", newId(), id, reason, currentUser(req).id, nowIso());
  await logAudit(req, "user.flagged", { type: "user", id }, `Reported ${t.email} as suspicious`, { reason });
  res.status(201).json({ ok: true });
});

usersAdminRouter.post("/flags/:id/resolve", requirePermission("users.manage"), async (req, res) => {
  const id = param(req, "id");
  const r = await run("UPDATE user_flags SET resolved_at = ?, resolved_by = ? WHERE id = ? AND resolved_at IS NULL", nowIso(), currentUser(req).id, id);
  if (!r.changes) throw notFound("Report not found or already resolved");
  await logAudit(req, "flag.resolved", { type: "flag", id }, "Resolved a suspicious-activity report");
  res.json({ ok: true });
});
