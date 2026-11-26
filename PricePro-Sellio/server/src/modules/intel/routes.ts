import { Router } from "express";
import { z } from "zod";
import { features } from "../../config.js";
import { all, get, run } from "../../db/index.js";
import { badRequest, notConfigured, notFound } from "../../lib/errors.js";
import { newId, nowIso } from "../../lib/util.js";
import { param, parseBody, parseQuery } from "../../lib/validate.js";
import { currentUser, requireAuth, requireVerified } from "../../middleware/auth.js";
import { serviceLimiter } from "../../middleware/rateLimit.js";
import { metrics } from "../campaigns/metrics.js";
import { COUNTRIES } from "../forecast/market.js";
import { buildRadar, findOpportunities, topDemand } from "../forecast/topDemand.js";
import { TrendsError, trendsProvider } from "../forecast/trends.js";
import { cached, DAY_MS } from "./cache.js";
import { M49, tradeProfile } from "./comtrade.js";
import { countryStats, INDICATORS, type IndicatorKey } from "./worldbank.js";

/** Market Intelligence: radar, opportunities, economic and trade statistics, regions, competitors. */
export const intelRouter = Router();
intelRouter.use(requireAuth);

const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));

intelRouter.get("/options", (_req, res) => {
  res.json({
    sources: {
      trends: features.serpapi,
      worldBank: features.worldBank,
      comtrade: features.comtrade,
      llm: features.llm,
    },
    countries: COUNTRIES,
    tradeCountries: Object.keys(M49),
    indicators: Object.entries(INDICATORS).map(([key, v]) => ({ key, label: v.label, unit: v.unit })),
  });
});

intelRouter.get("/radar", async (_req, res) => {
  const data = await topDemand("UZ");
  res.json(data ? { configured: true, ...buildRadar(data) } : { configured: false });
});

/** Opportunities: growing products, ranked only by measured search interest. */
intelRouter.get("/opportunities", async (_req, res) => {
  const data = await topDemand("UZ");
  if (!data) { res.json({ configured: false }); return; }
  const items = findOpportunities(data);
  res.json({ configured: true, computedAt: data.computedAt, checked: data.checked, items });
});

const statsQuery = z.object({
  countries: z.string().default("UZ"),
  indicators: z.string().optional(),
});

intelRouter.get("/stats", async (req, res) => {
  const q = parseQuery(req, statsQuery);
  const countries = [...new Set(q.countries.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean))];
  if (countries.length === 0 || countries.length > 6) throw badRequest("Choose 1 to 6 countries");
  for (const c of countries) if (!COUNTRY_CODES.has(c)) throw badRequest(`Unknown country: ${c}`);
  const keys = q.indicators ? [...new Set(q.indicators.split(",").filter((k): k is IndicatorKey => Object.hasOwn(INDICATORS, k)))].slice(0, 11) : undefined;
  if (keys && keys.length === 0) throw badRequest("Unknown indicator");
  res.json({ source: "world_bank", countries: await countryStats(countries, keys) });
});

intelRouter.get("/trade/:country", async (req, res) => {
  const country = param(req, "country").toUpperCase();
  if (!M49[country]) throw badRequest(`Unknown country: ${country}`);
  res.json({ source: "un_comtrade", profile: await tradeProfile(country) });
});

const regionSchema = z.object({ query: z.string().trim().min(2, "Enter a product name").max(100) });

/** Which regions of Uzbekistan search for a product most (Google Trends, 12 months). */
intelRouter.post("/regions", requireVerified, serviceLimiter, async (req, res) => {
  const { query } = parseBody(req, regionSchema);
  const provider = trendsProvider();
  if (!provider?.interestByRegion) {
    throw notConfigured("trends", "World demand data is not connected on this server. An administrator must configure SerpApi (SERPAPI_API_KEY), which provides Google Trends data.");
  }
  try {
    const regions = await cached(`reg:UZ:${query.toLowerCase()}`, 7 * DAY_MS, () => provider.interestByRegion!(query, "UZ", "today 12-m"));
    res.json({ source: "google_trends", query, geo: "UZ", range: "today 12-m", regions });
  } catch (err) {
    if (err instanceof TrendsError) throw badRequest(err.message);
    throw err;
  }
});

// ---------- Competitors (the user's own notes; nothing is scraped) ----------

const competitorSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(100),
  website: z.string().trim().max(300).url("Enter a full address, e.g. https://example.uz")
    .refine((u) => /^https?:\/\//i.test(u), "Enter a full address, e.g. https://example.uz").or(z.literal("")).optional(),
  category: z.string().trim().max(100).optional(),
  priceNote: z.string().trim().max(300).optional(),
  positioning: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});

type CompetitorRow = { id: string; name: string; website: string | null; category: string | null; price_note: string | null; positioning: string | null; notes: string | null; created_at: string; updated_at: string };
const serializeCompetitor = (r: CompetitorRow) => ({
  id: r.id, name: r.name, website: r.website, category: r.category, priceNote: r.price_note, positioning: r.positioning, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
});

export async function listCompetitors(userId: string) {
  return (await all<CompetitorRow>("SELECT * FROM competitors WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", userId)).map(serializeCompetitor);
}

intelRouter.get("/competitors", async (req, res) => {
  res.json({ items: await listCompetitors(currentUser(req).id) });
});

intelRouter.post("/competitors", async (req, res) => {
  const user = currentUser(req);
  const b = parseBody(req, competitorSchema);
  const count = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM competitors WHERE user_id = ?", user.id))?.n ?? 0;
  if (count >= 50) throw badRequest("You can save up to 50 competitors.");
  const id = newId(), now = nowIso();
  await run(
    "INSERT INTO competitors (id,user_id,name,website,category,price_note,positioning,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
    id, user.id, b.name, b.website || null, b.category || null, b.priceNote || null, b.positioning || null, b.notes || null, now, now,
  );
  res.status(201).json({ competitor: serializeCompetitor((await get<CompetitorRow>("SELECT * FROM competitors WHERE id = ?", id))!) });
});

intelRouter.patch("/competitors/:id", async (req, res) => {
  const user = currentUser(req);
  const id = param(req, "id");
  const b = parseBody(req, competitorSchema);
  const r = await run(
    "UPDATE competitors SET name=?, website=?, category=?, price_note=?, positioning=?, notes=?, updated_at=? WHERE id = ? AND user_id = ?",
    b.name, b.website || null, b.category || null, b.priceNote || null, b.positioning || null, b.notes || null, nowIso(), id, user.id,
  );
  if (!r.changes) throw notFound("Competitor not found");
  res.json({ competitor: serializeCompetitor((await get<CompetitorRow>("SELECT * FROM competitors WHERE id = ?", id))!) });
});

intelRouter.delete("/competitors/:id", async (req, res) => {
  const r = await run("DELETE FROM competitors WHERE id = ? AND user_id = ?", param(req, "id"), currentUser(req).id);
  if (!r.changes) throw notFound("Competitor not found");
  res.json({ ok: true });
});
