import { Router } from "express";
import { z } from "zod";
import { all, get, run } from "../../db/index.js";
import { conflict, notFound } from "../../lib/errors.js";
import { likePattern, newId, nowIso, safeJson } from "../../lib/util.js";
import { param, parseBody, parseQuery } from "../../lib/validate.js";
import { currentUser, requireAuth } from "../../middleware/auth.js";
import { logActivity } from "../../services/activity.js";
import { getSearch } from "../prices/service.js";
import { loadItem } from "../projects/routes.js";

export const favoritesRouter = Router();
favoritesRouter.use(requireAuth);

type FavoriteRow = {
  id: string; user_id: string; item_type: "product" | "price_comparison" | "advertisement" | "forecast";
  ref_id: string; title: string; category: string | null; data_json: string; created_at: string;
};

const serialize = (f: FavoriteRow) => ({
  id: f.id, itemType: f.item_type, refId: f.ref_id, title: f.title, category: f.category,
  data: safeJson<Record<string, unknown>>(f.data_json, {}), createdAt: f.created_at,
});

const createSchema = z.discriminatedUnion("itemType", [
  z.object({ itemType: z.literal("advertisement"), refId: z.uuid() }),
  z.object({ itemType: z.literal("forecast"), refId: z.uuid() }),
  z.object({ itemType: z.literal("price_comparison"), refId: z.uuid() }),
  // A product offer is identified by the price search it came from; its data is copied from that stored result.
  z.object({ itemType: z.literal("product"), searchId: z.uuid(), offerId: z.string().regex(/^[0-9a-f]{24}$/) }),
]);

favoritesRouter.post("/", async (req, res) => {
  const user = currentUser(req);
  const input = parseBody(req, createSchema);
  let refId: string;
  let title: string;
  let category: string | null = null;
  let data: Record<string, unknown> = {};

  if (input.itemType === "product") {
    const search = await getSearch(user.id, input.searchId);
    const offer = search.result?.groups.flatMap((g) => g.offers).find((o) => o.id === input.offerId);
    if (!offer) throw notFound("Offer not found in this price comparison");
    refId = offer.id;
    title = offer.title;
    category = "Product";
    data = {
      storeName: offer.storeName, price: offer.price, currency: offer.currency, priceText: offer.priceText,
      url: offer.url, imageUrl: offer.imageUrl, condition: offer.condition, provider: offer.provider,
      searchId: search.id, priceCapturedAt: search.result?.fetchedAt ?? search.createdAt,
    };
  } else {
    const item = (await loadItem(user.id, input.itemType, input.refId)) as Record<string, unknown> & {
      productName?: string; query?: string; category?: string; resultUrl?: string | null; bestOffer?: { priceText: string; storeName: string } | null;
    };
    refId = input.refId;
    title = input.itemType === "price_comparison" ? `Prices — ${item.query}` : input.itemType === "forecast" ? `Demand — ${item.query}` : `Ad — ${item.productName}`;
    category = (item.category as string | undefined) ?? (input.itemType === "price_comparison" ? "Price comparison" : null);
    data =
      input.itemType === "advertisement" ? { imageUrl: item.resultUrl ?? null }
      : input.itemType === "price_comparison" ? { best: item.bestOffer ? `${item.bestOffer.priceText} at ${item.bestOffer.storeName}` : null }
      : { range: item.range, geos: item.geos };
  }

  const exists = await get("SELECT id FROM favorites WHERE user_id = ? AND item_type = ? AND ref_id = ?", user.id, input.itemType, refId);
  if (exists) throw conflict("Already in Favorites.");
  const id = newId();
  await run(
    "INSERT INTO favorites (id,user_id,item_type,ref_id,title,category,data_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
    id, user.id, input.itemType, refId, title.slice(0, 200), category, JSON.stringify(data), nowIso(),
  );
  await logActivity(user.id, "favorite_added", "projects", `Added to Favorites: ${title}`, { refId: id });
  res.status(201).json({ favorite: serialize((await get<FavoriteRow>("SELECT * FROM favorites WHERE id = ?", id))!) });
});

const listSchema = z.object({
  type: z.enum(["product", "price_comparison", "advertisement", "forecast"]).optional(),
  category: z.string().trim().max(60).optional(),
  q: z.string().trim().max(100).optional(),
});

favoritesRouter.get("/", async (req, res) => {
  const user = currentUser(req);
  const q = parseQuery(req, listSchema);
  const where = ["user_id = ?"];
  const params: string[] = [user.id];
  if (q.type) { where.push("item_type = ?"); params.push(q.type); }
  if (q.category) { where.push("category = ?"); params.push(q.category); }
  if (q.q) { where.push("title LIKE ? ESCAPE '\\'"); params.push(likePattern(q.q)); }
  const rows = await all<FavoriteRow>(`SELECT * FROM favorites WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT 200`, ...params);
  const categories = (await all<{ category: string }>(
    "SELECT DISTINCT category FROM favorites WHERE user_id = ? AND category IS NOT NULL ORDER BY category", user.id,
  )).map((r) => r.category);
  res.json({ items: rows.map(serialize), categories });
});

favoritesRouter.get("/:id", async (req, res) => {
  const user = currentUser(req);
  const f = await get<FavoriteRow>("SELECT * FROM favorites WHERE id = ? AND user_id = ?", param(req, "id"), user.id);
  if (!f) throw notFound("Favorite not found");
  let item: unknown = null;
  if (f.item_type !== "product") {
    try { item = loadItem(user.id, f.item_type, f.ref_id); } catch { item = null; }
  }
  res.json({ favorite: serialize(f), item });
});

favoritesRouter.delete("/:id", async (req, res) => {
  const user = currentUser(req);
  const r = await run("DELETE FROM favorites WHERE id = ? AND user_id = ?", param(req, "id"), user.id);
  if (r.changes === 0) throw notFound("Favorite not found");
  res.json({ ok: true });
});
