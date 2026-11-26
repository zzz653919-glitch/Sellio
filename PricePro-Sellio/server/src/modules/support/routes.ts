import { Router } from "express";
import { z } from "zod";
import { all, get, run, transaction } from "../../db/index.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { newId, nowIso } from "../../lib/util.js";
import { param, parseBody } from "../../lib/validate.js";
import { currentUser, requireAuth } from "../../middleware/auth.js";
import { serviceLimiter } from "../../middleware/rateLimit.js";

/** Customer support for users: open a request, follow the conversation, reply. */
export const supportRouter = Router();
supportRouter.use(requireAuth);

export const CATEGORIES = ["account", "billing", "ai_studio", "forecast", "ads", "bug", "other"] as const;

supportRouter.get("/", async (req, res) => {
  const rows = await all<{ id: string; subject: string; category: string; status: string; created_at: string; last_message_at: string; unread: number }>(
    `SELECT t.id, t.subject, t.category, t.status, t.created_at, t.last_message_at,
       (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id AND m.author_role = 'staff') AS unread
     FROM support_tickets t WHERE t.user_id = ? ORDER BY t.last_message_at DESC LIMIT 50`, currentUser(req).id);
  res.json({ items: rows.map((r) => ({ id: r.id, subject: r.subject, category: r.category, status: r.status, createdAt: r.created_at, lastMessageAt: r.last_message_at, staffReplies: r.unread })), categories: CATEGORIES });
});

const createSchema = z.object({ subject: z.string().trim().min(3, "Write a short subject").max(150), category: z.enum(CATEGORIES).default("other"), body: z.string().trim().min(5, "Describe the problem").max(4000) });

supportRouter.post("/", serviceLimiter, async (req, res) => {
  const user = currentUser(req);
  const b = parseBody(req, createSchema);
  const open = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM support_tickets WHERE user_id = ? AND status != 'resolved'", user.id))?.n ?? 0;
  if (open >= 10) throw badRequest("You have 10 open requests. Wait for an answer before opening more.");
  const id = newId(), now = nowIso();
  await transaction([
    ["INSERT INTO support_tickets (id,user_id,subject,category,status,created_at,updated_at,last_message_at) VALUES (?,?,?,?, 'open', ?,?,?)", id, user.id, b.subject, b.category, now, now, now],
    ["INSERT INTO support_messages (id,ticket_id,author_id,author_role,body,created_at) VALUES (?,?,?,?,?,?)", newId(), id, user.id, "user", b.body, now],
  ]);
  res.status(201).json({ id });
});

async function own(userId: string, id: string) {
  const t = await get<{ id: string; subject: string; category: string; status: string; created_at: string }>("SELECT id, subject, category, status, created_at FROM support_tickets WHERE id = ? AND user_id = ?", id, userId);
  if (!t) throw notFound("Request not found");
  return t;
}

supportRouter.get("/:id", async (req, res) => {
  const t = await own(currentUser(req).id, param(req, "id"));
  const messages = await all<{ id: string; author_role: string; body: string; created_at: string; first_name: string | null }>(
    "SELECT m.id, m.author_role, m.body, m.created_at, u.first_name FROM support_messages m LEFT JOIN users u ON u.id = m.author_id WHERE m.ticket_id = ? ORDER BY m.created_at", t.id);
  res.json({ ticket: { id: t.id, subject: t.subject, category: t.category, status: t.status, createdAt: t.created_at }, messages: messages.map((m) => ({ id: m.id, role: m.author_role, body: m.body, author: m.author_role === "staff" ? (m.first_name ?? "Support") : null, createdAt: m.created_at })) });
});

supportRouter.post("/:id/reply", serviceLimiter, async (req, res) => {
  const t = await own(currentUser(req).id, param(req, "id"));
  const { body } = parseBody(req, z.object({ body: z.string().trim().min(1).max(4000) }));
  const now = nowIso();
  await transaction([
    ["INSERT INTO support_messages (id,ticket_id,author_id,author_role,body,created_at) VALUES (?,?,?,?,?,?)", newId(), t.id, currentUser(req).id, "user", body, now],
    ["UPDATE support_tickets SET status = 'open', updated_at = ?, last_message_at = ? WHERE id = ?", now, now, t.id],
  ]);
  res.status(201).json({ ok: true });
});

supportRouter.post("/:id/close", async (req, res) => {
  const t = await own(currentUser(req).id, param(req, "id"));
  await run("UPDATE support_tickets SET status = 'resolved', updated_at = ? WHERE id = ?", nowIso(), t.id);
  res.json({ ok: true });
});
