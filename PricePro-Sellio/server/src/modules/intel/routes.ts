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
import { buildRadar, topDemand } from "../forecast/topDemand.js";
import { topForPeriod, type Period } from "../forecast/topPeriods.js";
import { MODEL_GROUPS, topModels } from "../forecast/models.js";
import { TrendsError, trendsProvider } from "../forecast/trends.js";
import { cached, DAY_MS } from "./cache.js";
import { M49, tradeProfile } from "./comtrade.js";
import { countryStats, INDICATORS, type IndicatorKey } from "./worldbank.js";

/** Market Intelligence: top products, radar, economic and trade statistics, regions, seasons. */
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

/** Brands and models inside a watched product for a period (e.g. which phone models are searched most). */
const modelsSchema = z.object({ query: z.string().min(1).max(60), period: z.enum(["week", "month", "quarter", "year"]).default("month") });
intelRouter.get("/top/models", async (req, res) => {
  const { query, period } = parseQuery(req, modelsSchema);
  if (!trendsProvider()) { res.json({ configured: false }); return; }
  if (!MODEL_GROUPS[query]) { res.json({ configured: true, available: false }); return; }
  try {
    const data = await topModels(query, period as Period, "UZ");
    if (data === "unavailable" || !data) { res.json({ configured: true, available: false }); return; }
    res.json({ configured: true, available: true, ...data });
  } catch (err) {
    if (err instanceof TrendsError) throw notConfigured("trends", err.message);
    throw err;
  }
});

/** Top products for a period: most searched and fastest growing (last week / month / 3 months / year). */
const topSchema = z.object({ period: z.enum(["week", "month", "quarter", "year"]).default("week") });
intelRouter.get("/top", async (req, res) => {
  const { period } = parseQuery(req, topSchema);
  if (!trendsProvider()) { res.json({ configured: false }); return; }
  try {
    const data = await topForPeriod(period as Period, "UZ");
    res.json(data ? { configured: true, ...data } : { configured: false });
  } catch (err) {
    if (err instanceof TrendsError) throw notConfigured("trends", err.message);
    throw err;
  }
});

intelRouter.get("/radar", async (_req, res) => {
  const data = await topDemand("UZ");
  res.json(data ? { configured: true, ...buildRadar(data) } : { configured: false });
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
