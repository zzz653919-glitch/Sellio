import { Router } from "express";
import { z } from "zod";
import { all, get, run } from "../../db/index.js";
import { notFound } from "../../lib/errors.js";
import { nowIso } from "../../lib/util.js";
import { param, parseQuery } from "../../lib/validate.js";
import { currentUser, requireAuth } from "../../middleware/auth.js";
import { deliverDueAnnouncements } from "../../services/announcements.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

type Row = { id: string; type: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string };

const listSchema = z.object({
  filter: z.enum(["all", "unread"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

notificationsRouter.get("/", async (req, res) => {
  const user = currentUser(req);
  const q = parseQuery(req, listSchema);
  await deliverDueAnnouncements();
  const unreadOnly = q.filter === "unread" ? "AND read_at IS NULL" : "";
  const [rows, counts] = await Promise.all([
    all<Row>(`SELECT * FROM notifications WHERE user_id = ? ${unreadOnly} ORDER BY created_at DESC LIMIT ? OFFSET ?`, user.id, q.limit, q.offset),
    get<{ unread: number; total: number }>(
      `SELECT (SELECT COUNT(*) FROM notifications WHERE user_id = ?1 AND read_at IS NULL) AS unread,
              (SELECT COUNT(*) FROM notifications WHERE user_id = ?1 ${unreadOnly}) AS total`,
      user.id,
    ),
  ]);
  const unread = counts?.unread ?? 0;
  const total = counts?.total ?? 0;
  res.json({
    items: rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: Boolean(n.read_at), createdAt: n.created_at })),
    unread,
    total,
  });
});

notificationsRouter.get("/unread-count", async (req, res) => {
  const user = currentUser(req);
  res.json({ unread: (await get<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", user.id))?.n ?? 0 });
});

notificationsRouter.post("/read-all", async (req, res) => {
  await run("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", nowIso(), currentUser(req).id);
  res.json({ ok: true });
});

notificationsRouter.post("/:id/read", async (req, res) => {
  const r = await run("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?", nowIso(), param(req, "id"), currentUser(req).id);
  if (r.changes === 0) throw notFound("Notification not found");
  res.json({ ok: true });
});

notificationsRouter.post("/:id/unread", async (req, res) => {
  const r = await run("UPDATE notifications SET read_at = NULL WHERE id = ? AND user_id = ?", param(req, "id"), currentUser(req).id);
  if (r.changes === 0) throw notFound("Notification not found");
  res.json({ ok: true });
});

notificationsRouter.delete("/:id", async (req, res) => {
  const r = await run("DELETE FROM notifications WHERE id = ? AND user_id = ?", param(req, "id"), currentUser(req).id);
  if (r.changes === 0) throw notFound("Notification not found");
  res.json({ ok: true });
});

notificationsRouter.delete("/", async (req, res) => {
  await run("DELETE FROM notifications WHERE user_id = ? AND read_at IS NOT NULL", currentUser(req).id);
  res.json({ ok: true });
});
