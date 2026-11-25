import { all, get, run } from "../../db/index.js";
import { notConfigured, notFound } from "../../lib/errors.js";
import { likePattern, newId, nowIso, safeJson } from "../../lib/util.js";
import { logActivity } from "../../services/activity.js";
import { notify } from "../../services/notifications.js";
import { assertWithinLimit } from "../../services/plans.js";
import { groupOffers, normalizeQuery, type OfferGroup } from "./matching.js";
import { configuredProviders, type Offer } from "./providers.js";

export type ProviderStatus = { name: string; label: string; status: "ok" | "error"; count: number; error?: string };

export type PriceResult = {
  query: string;
  fetchedAt: string;
  dataSource: "live";
  providers: ProviderStatus[];
  groups: OfferGroup[];
  bestGroupId: string | null;
  bestOffer: Offer | null;
  totalOffers: number;
};

type SearchRow = {
  id: string; user_id: string; query: string; normalized_query: string; status: string; providers_json: string;
  result_json: string; offers_count: number; best_price: number | null; best_currency: string | null; created_at: string;
};

async function serialize(row: SearchRow, includeResult = true) {
  const project = await get<{ id: string }>("SELECT id FROM projects WHERE user_id = ? AND type = 'price_comparison' AND ref_id = ?", row.user_id, row.id);
  const favorite = await get<{ id: string }>("SELECT id FROM favorites WHERE user_id = ? AND item_type = 'price_comparison' AND ref_id = ?", row.user_id, row.id);
  const result = safeJson<PriceResult | null>(row.result_json, null);
  return {
    id: row.id,
    query: row.query,
    status: row.status,
    providers: safeJson<ProviderStatus[]>(row.providers_json, []),
    offersCount: row.offers_count,
    bestPrice: row.best_price,
    bestCurrency: row.best_currency,
    bestOffer: result?.bestOffer ?? null,
    result: includeResult ? result : undefined,
    projectId: project?.id ?? null,
    favoriteId: favorite?.id ?? null,
    createdAt: row.created_at,
  };
}

export async function searchPrices(userId: string, query: string) {
  const providers = configuredProviders();
  if (providers.length === 0) {
    throw notConfigured(
      "price_providers",
      "No price data providers are connected on this server. An administrator must configure SERPAPI_API_KEY and/or eBay API credentials.",
    );
  }
  await assertWithinLimit(userId, "priceSearches");
  const started = Date.now();

  const settled = await Promise.allSettled(providers.map((p) => p.search(query)));
  const statuses: ProviderStatus[] = [];
  const offers: Offer[] = [];
  settled.forEach((s, i) => {
    const p = providers[i];
    if (s.status === "fulfilled") {
      statuses.push({ name: p.name, label: p.label, status: "ok", count: s.value.length });
      offers.push(...s.value);
    } else {
      const msg = s.reason instanceof Error ? s.reason.message : "Request failed";
      statuses.push({ name: p.name, label: p.label, status: "error", count: 0, error: msg.slice(0, 300) });
    }
  });

  const okCount = statuses.filter((s) => s.status === "ok").length;
  const status = okCount === 0 ? "failed" : okCount < statuses.length ? "partial" : "completed";
  const groups = groupOffers(query, offers);
  const best = groups[0] ?? null;
  const result: PriceResult = {
    query,
    fetchedAt: nowIso(),
    dataSource: "live",
    providers: statuses,
    groups,
    bestGroupId: best?.id ?? null,
    bestOffer: best?.cheapest ?? null,
    totalOffers: offers.length,
  };

  const id = newId();
  await run(
    `INSERT INTO price_searches (id,user_id,query,normalized_query,status,providers_json,result_json,offers_count,best_price,best_currency,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    id, userId, query, normalizeQuery(query), status, JSON.stringify(statuses), JSON.stringify(result), offers.length,
    best?.cheapest.price ?? null, best?.cheapest.currency ?? null, nowIso(),
  );
  await logActivity(userId, "price_search", "prices", `Price search: ${query}`, { refId: id, success: status !== "failed", durationMs: Date.now() - started });
  if (status !== "failed") {
    const summary = best
      ? `Best price for "${query}": ${best.cheapest.priceText} at ${best.cheapest.storeName} (${offers.length} offers checked).`
      : `No matching offers were found for "${query}".`;
    await notify(userId, "price", "Price search completed", summary, `/prices?search=${id}`);
  }
  return serialize((await get<SearchRow>("SELECT * FROM price_searches WHERE id = ?", id))!);
}

export async function getSearch(userId: string, id: string) {
  const row = await get<SearchRow>("SELECT * FROM price_searches WHERE id = ? AND user_id = ?", id, userId);
  if (!row) throw notFound("Price comparison not found");
  return serialize(row);
}

export async function listSearches(userId: string, limit = 50, offset = 0) {
  const rows = await all<SearchRow>("SELECT * FROM price_searches WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?", userId, limit, offset);
  const total = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM price_searches WHERE user_id = ?", userId))?.n ?? 0;
  return { items: (await Promise.all(rows.map((r) => serialize(r, false)))), total };
}

export async function deleteSearch(userId: string, id: string) {
  const r = await run("DELETE FROM price_searches WHERE id = ? AND user_id = ?", id, userId);
  if (r.changes === 0) throw notFound("Price comparison not found");
  await run("DELETE FROM projects WHERE user_id = ? AND type = 'price_comparison' AND ref_id = ?", userId, id);
  await run("DELETE FROM favorites WHERE user_id = ? AND item_type = 'price_comparison' AND ref_id = ?", userId, id);
}

/** The user's own past queries plus queries searched by at least 2 different users. */
export async function suggestions(userId: string, prefix: string) {
  const pattern = likePattern(normalizeQuery(prefix));
  const own = (await all<{ query: string }>(
    `SELECT query FROM price_searches WHERE user_id = ? AND normalized_query LIKE ? ESCAPE '\\'
     GROUP BY normalized_query ORDER BY MAX(created_at) DESC LIMIT 6`,
    userId, pattern,
  )).map((r) => r.query);
  const popular = (await all<{ query: string }>(
    `SELECT MIN(query) AS query FROM price_searches WHERE normalized_query LIKE ? ESCAPE '\\' AND normalized_query != ''
     GROUP BY normalized_query HAVING COUNT(DISTINCT user_id) >= 2 ORDER BY COUNT(*) DESC LIMIT 6`,
    pattern,
  )).map((r) => r.query);
  return [...new Set([...own, ...popular])].slice(0, 8);
}

export async function popularSearches() {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  return await all<{ query: string; users: number }>(
    `SELECT MIN(query) AS query, COUNT(DISTINCT user_id) AS users FROM price_searches
     WHERE created_at >= ? AND normalized_query != '' AND status IN ('completed','partial')
     GROUP BY normalized_query HAVING users >= 2 ORDER BY users DESC, COUNT(*) DESC LIMIT 8`,
    since,
  );
}
