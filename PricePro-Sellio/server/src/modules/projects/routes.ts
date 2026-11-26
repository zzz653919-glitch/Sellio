import { Router } from "express";
import { z } from "zod";
import { all, get, run } from "../../db/index.js";
import { badRequest, conflict, notFound } from "../../lib/errors.js";
import { likePattern, newId, nowIso } from "../../lib/util.js";
import { param, parseBody, parseQuery } from "../../lib/validate.js";
import { currentUser, requireAuth } from "../../middleware/auth.js";
import { logActivity } from "../../services/activity.js";
import { getMarketAnalysis, headline } from "../forecast/market.js";
import { getGeneration } from "../studio/service.js";

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

export type ProjectType = "advertisement" | "forecast";
const TYPES = ["advertisement", "forecast"] as const;

type ProjectRow = { id: string; user_id: string; type: ProjectType; ref_id: string; title: string; created_at: string; updated_at: string };

/** Load the underlying record, enforcing ownership. Throws 404 when missing or foreign. */
export async function loadItem(userId: string, type: ProjectType, refId: string) {
  if (type === "advertisement") return getGeneration(userId, refId);
  return getMarketAnalysis(userId, refId);
}

async function summary(userId: string, p: ProjectRow) {
  try {
    if (p.type === "advertisement") {
      const g = await getGeneration(userId, p.ref_id);
      return { thumbnailUrl: g.resultUrl ?? g.originalUrl, subtitle: `${g.styleLabel} · ${g.category}`, status: g.status, downloadUrl: g.resultUrl ? `${g.resultUrl}?download=1` : null };
    }
    const a = await getMarketAnalysis(userId, p.ref_id);
    const h = headline(a);
    const pct = (v: number | null) => (v === null ? "" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
    const sub = h ? `${h.name}: ${pct(h.periodChangePct ?? h.changePct)} · ${a.geos.length} area(s)` : "No search data";
    return { thumbnailUrl: null, subtitle: sub, status: a.status, downloadUrl: null };
  } catch {
    return { thumbnailUrl: null, subtitle: "The original item was deleted", status: "missing", downloadUrl: null };
  }
}

async function serialize(userId: string, p: ProjectRow) {
  const fav = await get<{ id: string }>("SELECT id FROM favorites WHERE user_id = ? AND item_type = ? AND ref_id = ?", userId, p.type, p.ref_id);
  return { id: p.id, type: p.type, refId: p.ref_id, title: p.title, createdAt: p.created_at, updatedAt: p.updated_at, favoriteId: fav?.id ?? null, ...await summary(userId, p) };
}

const createSchema = z.object({
  type: z.enum(TYPES),
  refId: z.uuid(),
  title: z.string().trim().min(1).max(120).optional(),
});

projectsRouter.post("/", async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(req, createSchema);
  const item = (await loadItem(user.id, input.type, input.refId)) as { productName?: string; query?: string; status?: string };
  if (input.type === "advertisement" && item.status !== "succeeded") throw badRequest("Only completed advertisements can be saved.");
  const exists = await get("SELECT id FROM projects WHERE user_id = ? AND type = ? AND ref_id = ?", user.id, input.type, input.refId);
  if (exists) throw conflict("This item is already saved in My Projects.");
  const defaultTitle =
    input.type === "advertisement" ? `Ad — ${item.productName}` : `Demand — ${item.query}`;
  const id = newId();
  const now = nowIso();
  await run("INSERT INTO projects (id,user_id,type,ref_id,title,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
    id, user.id, input.type, input.refId, input.title ?? defaultTitle, now, now);
  await logActivity(user.id, "project_saved", "projects", `Saved to My Projects: ${input.title ?? defaultTitle}`, { refId: id });
  res.status(201).json({ project: await serialize(user.id, (await get<ProjectRow>("SELECT * FROM projects WHERE id = ?", id))!) });
});

const listSchema = z.object({
  type: z.enum(TYPES).optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(["newest", "oldest", "title"]).default("newest"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

projectsRouter.get("/", async (req, res) => {
  const user = currentUser(req);
  const q = parseQuery(req, listSchema);
  // Only current item types (older price comparisons are no longer shown).
  const where = ["user_id = ?", "type IN ('advertisement','forecast')"];
  const params: (string | number)[] = [user.id];
  if (q.type) { where.push("type = ?"); params.push(q.type); }
  if (q.q) { where.push("title LIKE ? ESCAPE '\\'"); params.push(likePattern(q.q)); }
  const order = q.sort === "oldest" ? "created_at ASC" : q.sort === "title" ? "title COLLATE NOCASE ASC" : "created_at DESC";
  const [rows, totalRow, counts] = await Promise.all([
    all<ProjectRow>(`SELECT * FROM projects WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, q.limit, q.offset),
    get<{ n: number }>(`SELECT COUNT(*) AS n FROM projects WHERE ${where.join(" AND ")}`, ...params),
    all<{ type: string; n: number }>("SELECT type, COUNT(*) AS n FROM projects WHERE user_id = ? AND type IN ('advertisement','forecast') GROUP BY type", user.id),
  ]);
  const total = totalRow?.n ?? 0;
  res.json({ items: (await Promise.all(rows.map((p) => serialize(user.id, p)))), total, counts: Object.fromEntries(counts.map((c) => [c.type, c.n])) });
});

async function owned(userId: string, id: string) {
  const p = await get<ProjectRow>("SELECT * FROM projects WHERE id = ? AND user_id = ? AND type IN ('advertisement','forecast')", id, userId);
  if (!p) throw notFound("Project not found");
  return p;
}

projectsRouter.get("/:id", async (req, res) => {
  const user = currentUser(req);
  const p = await owned(user.id, param(req, "id"));
  let item: unknown = null;
  try {
    item = await loadItem(user.id, p.type, p.ref_id);
  } catch {
    item = null;
  }
  res.json({ project: await serialize(user.id, p), item });
});

projectsRouter.patch("/:id", async (req, res) => {
  const user = currentUser(req);
  const p = await owned(user.id, param(req, "id"));
  const { title } = parseBody(req, z.object({ title: z.string().trim().min(1, "Title is required").max(120) }));
  await run("UPDATE projects SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?", title, nowIso(), p.id, user.id);
  res.json({ project: await serialize(user.id, await owned(user.id, p.id)) });
});

projectsRouter.delete("/:id", async (req, res) => {
  const user = currentUser(req);
  const p = await owned(user.id, param(req, "id"));
  await run("DELETE FROM projects WHERE id = ? AND user_id = ?", p.id, user.id);
  await logActivity(user.id, "project_deleted", "projects", `Removed from My Projects: ${p.title}`, { refId: p.id });
  res.json({ ok: true });
});
