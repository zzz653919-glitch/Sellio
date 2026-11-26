import { Router } from "express";
import { z } from "zod";
import { config } from "../../config.js";
import { all, get, run, transaction } from "../../db/index.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { newId, nowIso, safeJson } from "../../lib/util.js";
import { param, parseBody, parseQuery } from "../../lib/validate.js";
import { currentUser } from "../../middleware/auth.js";
import { deliverDueAnnouncements } from "../../services/announcements.js";
import { logAudit } from "../../services/audit.js";
import { notify } from "../../services/notifications.js";
import { requirePermission } from "./permissions.js";
import { like, pageOf } from "./util.js";

/** Announcements / notifications and customer support (staff side). */
export const commsAdminRouter = Router();

// ---------- Announcements ----------

commsAdminRouter.get("/announcements", requirePermission("notifications.manage"), async (req, res) => {
  const { page, limit, offset } = pageOf(req);
  const rows = await all<{ id: string; title: string; body: string; link: string | null; audience: string; user_ids_json: string; publish_at: string; delivered_at: string | null; recipients: number | null; created_at: string; email: string | null }>(
    "SELECT a.*, u.email FROM announcements a LEFT JOIN users u ON u.id = a.created_by ORDER BY a.publish_at DESC LIMIT ? OFFSET ?", limit, offset);
  const total = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM announcements"))?.n ?? 0;
  const reads = await all<{ announcement_id: string; read: number }>(
    "SELECT announcement_id, SUM(CASE WHEN read_at IS NOT NULL THEN 1 ELSE 0 END) AS read FROM notifications WHERE announcement_id IS NOT NULL GROUP BY announcement_id");
  res.json({
    items: rows.map((r) => ({
      id: r.id, title: r.title, body: r.body, link: r.link, audience: r.audience, selectedCount: safeJson<string[]>(r.user_ids_json, []).length,
      publishAt: r.publish_at, deliveredAt: r.delivered_at, recipients: r.recipients, read: reads.find((x) => x.announcement_id === r.id)?.read ?? 0,
      createdBy: r.email, createdAt: r.created_at, status: r.delivered_at ? "sent" : "scheduled",
    })),
    total, page, limit,
  });
});

const announceSchema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(1000),
  link: z.string().trim().max(200).regex(/^\/[\w\-/?=&.%]*$/, "Use a page of the site, e.g. /ads").optional().or(z.literal("")),
  audience: z.enum(["all", "selected"]),
  emails: z.array(z.string().trim().email()).max(500).default([]),
  publishAt: z.string().datetime({ offset: true }).optional(),
});

commsAdminRouter.post("/announcements", requirePermission("notifications.manage"), async (req, res) => {
  const b = parseBody(req, announceSchema);
  let ids: string[] = [];
  if (b.audience === "selected") {
    if (!b.emails.length) throw badRequest("Add at least one user email.");
    const found = await all<{ id: string; email: string }>(`SELECT id, email FROM users WHERE email IN (${b.emails.map(() => "?").join(",")})`, ...b.emails);
    const missing = b.emails.filter((e) => !found.some((f) => f.email.toLowerCase() === e.toLowerCase()));
    if (missing.length) throw badRequest(`No users with these emails: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`);
    ids = found.map((f) => f.id);
  }
  const now = nowIso();
  const publishAt = b.publishAt ? new Date(b.publishAt).toISOString() : now;
  if (publishAt < new Date(Date.now() - 60_000).toISOString()) throw badRequest("The publish time is in the past.");
  const id = newId();
  await run("INSERT INTO announcements (id,title,body,link,audience,user_ids_json,publish_at,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    id, b.title, b.body, b.link || null, b.audience, JSON.stringify(ids), publishAt, currentUser(req).id, now);
  if (publishAt <= now) await deliverDueAnnouncements(true);
  const row = await get<{ recipients: number | null; delivered_at: string | null }>("SELECT recipients, delivered_at FROM announcements WHERE id = ?", id);
  await logAudit(req, "announcement.created", { type: "announcement", id }, `Announcement "${b.title}" to ${b.audience === "all" ? "all users" : `${ids.length} users`}${publishAt > now ? ` scheduled for ${publishAt}` : ""}`);
  res.status(201).json({ id, recipients: row?.recipients ?? null, status: row?.delivered_at ? "sent" : "scheduled" });
});

/** Delete an announcement; already delivered copies are removed from users' notifications too. */
commsAdminRouter.delete("/announcements/:id", requirePermission("notifications.manage"), async (req, res) => {
  const id = param(req, "id");
  const a = await get<{ title: string }>("SELECT title FROM announcements WHERE id = ?", id);
  if (!a) throw notFound("Announcement not found");
  await transaction([["DELETE FROM notifications WHERE announcement_id = ?", id], ["DELETE FROM announcements WHERE id = ?", id]]);
  await logAudit(req, "announcement.deleted", { type: "announcement", id }, `Deleted announcement "${a.title}"`);
  res.json({ ok: true });
});

// ---------- Support (staff side) ----------

type TicketRow = { id: string; user_id: string; subject: string; category: string; status: string; assigned_to: string | null; created_at: string; updated_at: string; last_message_at: string; email: string; first_name: string; last_name: string; plan: string; assignee_email: string | null; messages: number };
const TICKETS = `SELECT t.*, u.email, u.first_name, u.last_name, u.plan, a.email AS assignee_email,
  (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id) AS messages
  FROM support_tickets t JOIN users u ON u.id = t.user_id LEFT JOIN users a ON a.id = t.assigned_to`;
const ticketShape = (t: TicketRow) => ({
  id: t.id, subject: t.subject, category: t.category, status: t.status, user: { id: t.user_id, email: t.email, name: `${t.first_name} ${t.last_name}`, plan: t.plan },
  assignedTo: t.assigned_to, assignee: t.assignee_email, messages: t.messages, createdAt: t.created_at, updatedAt: t.updated_at, lastMessageAt: t.last_message_at,
});

commsAdminRouter.get("/support", requirePermission("support.manage"), async (req, res) => {
  const q = parseQuery(req, z.object({ status: z.enum(["open", "pending", "resolved", "all"]).default("open"), q: z.string().trim().max(200).optional(), mine: z.enum(["1"]).optional() }).passthrough());
  const { page, limit, offset } = pageOf(req);
  const where: string[] = []; const p: (string | number)[] = [];
  if (q.status !== "all") { where.push("t.status = ?"); p.push(q.status); }
  if (q.q) { where.push("(t.subject LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR t.id = ?)"); p.push(like(q.q), like(q.q), q.q); }
  if (q.mine) { where.push("t.assigned_to = ?"); p.push(currentUser(req).id); }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const rows = await all<TicketRow>(`${TICKETS} ${w} ORDER BY t.last_message_at DESC LIMIT ? OFFSET ?`, ...p, limit, offset);
  const total = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM support_tickets t JOIN users u ON u.id = t.user_id ${w}`, ...p))?.n ?? 0;
  const counts = await all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM support_tickets GROUP BY status");
  res.json({ items: rows.map(ticketShape), total, page, limit, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
});

commsAdminRouter.get("/support/:id", requirePermission("support.manage"), async (req, res) => {
  const t = await get<TicketRow>(`${TICKETS} WHERE t.id = ?`, param(req, "id"));
  if (!t) throw notFound("Request not found");
  const messages = await all<{ id: string; author_role: string; body: string; created_at: string; email: string | null; first_name: string | null }>(
    "SELECT m.id, m.author_role, m.body, m.created_at, u.email, u.first_name FROM support_messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.ticket_id = ? ORDER BY m.created_at", t.id);
  const history = await all<{ id: string; subject: string; status: string; created_at: string }>(
    "SELECT id, subject, status, created_at FROM support_tickets WHERE user_id = ? AND id != ? ORDER BY created_at DESC LIMIT 10", t.user_id, t.id);
  res.json({
    ticket: ticketShape(t),
    messages: messages.map((m) => ({ id: m.id, role: m.author_role, body: m.body, author: m.author_role === "staff" ? (m.first_name ?? "Support") : (m.email ?? "User"), createdAt: m.created_at })),
    otherRequests: history.map((h) => ({ id: h.id, subject: h.subject, status: h.status, createdAt: h.created_at })),
  });
});

commsAdminRouter.post("/support/:id/reply", requirePermission("support.manage"), async (req, res) => {
  const id = param(req, "id");
  const { body, status } = parseBody(req, z.object({ body: z.string().trim().min(1).max(4000), status: z.enum(["open", "pending", "resolved"]).default("pending") }));
  const t = await get<{ user_id: string; subject: string }>("SELECT user_id, subject FROM support_tickets WHERE id = ?", id);
  if (!t) throw notFound("Request not found");
  const now = nowIso();
  await transaction([
    ["INSERT INTO support_messages (id,ticket_id,author_id,author_role,body,created_at) VALUES (?,?,?,?,?,?)", newId(), id, currentUser(req).id, "staff", body, now],
    ["UPDATE support_tickets SET status = ?, updated_at = ?, last_message_at = ?, assigned_to = COALESCE(assigned_to, ?) WHERE id = ?", status, now, now, currentUser(req).id, id],
  ]);
  await notify(t.user_id, "account", `Reply to your request: ${t.subject}`, body.slice(0, 300), `/support?ticket=${id}`);
  await logAudit(req, "support.replied", { type: "ticket", id }, `Replied to "${t.subject}" (status: ${status})`);
  res.status(201).json({ ok: true });
});

commsAdminRouter.patch("/support/:id", requirePermission("support.manage"), async (req, res) => {
  const id = param(req, "id");
  const b = parseBody(req, z.object({ status: z.enum(["open", "pending", "resolved"]).optional(), assignedTo: z.string().max(64).nullable().optional() }));
  const t = await get<{ subject: string }>("SELECT subject FROM support_tickets WHERE id = ?", id);
  if (!t) throw notFound("Request not found");
  if (b.assignedTo) {
    const staff = await get<{ email: string; role: string | null }>("SELECT u.email, a.role FROM users u LEFT JOIN admin_roles a ON a.user_id = u.id WHERE u.id = ?", b.assignedTo);
    if (!staff || (!staff.role && !config.SUPER_ADMIN_EMAILS.includes(staff.email.toLowerCase()))) throw badRequest("Requests can only be assigned to administrators.");
  }
  const now = nowIso();
  if (b.status) await run("UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?", b.status, now, id);
  if (b.assignedTo !== undefined) await run("UPDATE support_tickets SET assigned_to = ?, updated_at = ? WHERE id = ?", b.assignedTo, now, id);
  await logAudit(req, "support.updated", { type: "ticket", id }, `Request "${t.subject}": ${[b.status && `status ${b.status}`, b.assignedTo !== undefined && "assignment changed"].filter(Boolean).join(", ")}`);
  res.json({ ok: true });
});
