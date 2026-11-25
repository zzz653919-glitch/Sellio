import { Router } from "express";
import { z } from "zod";
import { badRequest } from "../../lib/errors.js";
import { param, parseBody } from "../../lib/validate.js";
import { currentUser, requireAuth, requireVerified } from "../../middleware/auth.js";
import { serviceLimiter } from "../../middleware/rateLimit.js";
import * as market from "./market.js";
import { trendsProvider } from "./trends.js";

/** World / country demand (Google Trends search interest). */
export const marketRouter = Router();
marketRouter.use(requireAuth);

marketRouter.get("/options", (_req, res) => {
  res.json({
    configured: trendsProvider() !== null,
    countries: market.COUNTRIES,
    ranges: Object.entries(market.RANGES).map(([value, horizonDays]) => ({ value, horizonDays })),
    maxAreas: 5,
  });
});

const runSchema = z.object({
  query: z.string().trim().min(2, "Enter a product name").max(100, "The product name is too long"),
  range: z.enum(["today 3-m", "today 12-m", "today 5-y"]),
  geos: z.array(z.string()).min(1, "Choose at least one area").max(5, "Choose at most 5 areas"),
});

marketRouter.post("/", requireVerified, serviceLimiter, async (req, res) => {
  const input = parseBody(req, runSchema);
  const allowed = new Set([market.WORLDWIDE, ...market.COUNTRIES.map((c) => c.code)]);
  const geos = [...new Set(input.geos)];
  for (const g of geos) if (!allowed.has(g)) throw badRequest(`Unknown area: ${g}`);
  res.status(201).json({ analysis: await market.runMarketAnalysis(currentUser(req).id, { ...input, geos }) });
});

marketRouter.get("/", async (req, res) => {
  res.json({ items: await market.listMarketAnalyses(currentUser(req).id) });
});

marketRouter.get("/:id", async (req, res) => {
  res.json({ analysis: await market.getMarketAnalysis(currentUser(req).id, param(req, "id")) });
});

marketRouter.delete("/:id", async (req, res) => {
  await market.deleteMarketAnalysis(currentUser(req).id, param(req, "id"));
  res.json({ ok: true });
});
