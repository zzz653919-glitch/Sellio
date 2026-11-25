import { Router } from "express";
import { z } from "zod";
import { csvFilename, toCsv } from "../../lib/csv.js";
import { pagination, param, parseBody, parseQuery } from "../../lib/validate.js";
import { currentUser, requireAuth, requireVerified } from "../../middleware/auth.js";
import { serviceLimiter } from "../../middleware/rateLimit.js";
import { configuredProviders } from "./providers.js";
import * as prices from "./service.js";

export const pricesRouter = Router();
pricesRouter.use(requireAuth);

pricesRouter.get("/options", (_req, res) => {
  res.json({ providers: configuredProviders().map((p) => ({ name: p.name, label: p.label })) });
});

const searchSchema = z.object({ query: z.string().trim().min(2, "Enter at least 2 characters").max(150) });

pricesRouter.post("/search", requireVerified, serviceLimiter, async (req, res) => {
  const { query } = parseBody(req, searchSchema);
  res.status(201).json({ search: await prices.searchPrices(currentUser(req).id, query) });
});

pricesRouter.get("/suggestions", (req, res) => {
  const { q } = parseQuery(req, z.object({ q: z.string().max(150).default("") }));
  res.json({ suggestions: q.trim().length < 1 ? [] : prices.suggestions(currentUser(req).id, q) });
});

pricesRouter.get("/popular", (_req, res) => {
  res.json({ popular: prices.popularSearches() });
});

pricesRouter.get("/history", (req, res) => {
  const { limit, offset } = parseQuery(req, pagination);
  res.json(prices.listSearches(currentUser(req).id, limit, offset));
});

pricesRouter.get("/searches/:id", (req, res) => {
  res.json({ search: prices.getSearch(currentUser(req).id, param(req, "id")) });
});

pricesRouter.get("/searches/:id/export.csv", (req, res) => {
  const s = prices.getSearch(currentUser(req).id, param(req, "id"));
  const rows: (string | number | null)[][] = [
    ["# PricePro price comparison", s.query],
    ["# Fetched at", s.result?.fetchedAt ?? s.createdAt],
    ["group", "product", "store", "price", "currency", "previous_price", "condition", "url", "source"],
  ];
  for (const g of s.result?.groups ?? []) {
    for (const o of g.offers) {
      rows.push([g.id, o.title, o.storeName, o.price, o.currency, o.previousPrice, o.condition ?? "not stated", o.url, o.provider]);
    }
  }
  res.attachment(csvFilename(`prices-${s.query}`));
  res.type("text/csv").send(toCsv(rows));
});

pricesRouter.delete("/searches/:id", (req, res) => {
  prices.deleteSearch(currentUser(req).id, param(req, "id"));
  res.json({ ok: true });
});
