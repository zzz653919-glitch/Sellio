import express, { Router } from "express";
import { z } from "zod";
import { all, get, run } from "../../db/index.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { newId, nowIso, safeJson } from "../../lib/util.js";
import { param, parseBody } from "../../lib/validate.js";
import { currentUser, requireAuth, requireVerified } from "../../middleware/auth.js";
import { serviceLimiter } from "../../middleware/rateLimit.js";
import { logActivity } from "../../services/activity.js";
import { analyseBusiness, maxYear, MIN_YEAR, normalizeDate, type BusinessRow } from "./analysis.js";
import { latestDataset, loadDataset, summary, type DatasetRow } from "./service.js";
import { deleteReport, generateReport, getReport, listReports } from "./reports.js";

/** Personal Business Intelligence: the user's own sales data (private to the user). */
export const businessRouter = Router();
businessRouter.use(requireAuth);

export const MAX_ROWS = 20_000;
const MAX_DATASETS = 20;
const money = z.number().finite().min(-1e13).max(1e13);

const rowSchema = z.object({
  date: z.string().max(10),
  product: z.string().trim().max(120).nullish(),
  revenue: money,
  cost: money.nullish(),
  expenses: money.nullish(),
  units: z.number().finite().min(-1e9).max(1e9).nullish(),
});

const datasetSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120),
  source: z.enum(["csv", "xlsx", "manual"]),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code, e.g. UZS").default("UZS"),
  rows: z.array(rowSchema).min(1, "Add at least one row").max(MAX_ROWS, `At most ${MAX_ROWS} rows`),
});

function cleanRows(rows: z.infer<typeof rowSchema>[]): BusinessRow[] {
  const bad: number[] = [];
  const out: BusinessRow[] = [];
  rows.forEach((r, i) => {
    const date = normalizeDate(r.date);
    if (!date) { bad.push(i + 1); return; }
    out.push({ date, product: r.product || null, revenue: r.revenue, cost: r.cost ?? null, expenses: r.expenses ?? null, units: r.units ?? null });
  });
  if (bad.length) throw badRequest(`Rows with an invalid date: ${bad.slice(0, 10).join(", ")}${bad.length > 10 ? "…" : ""}. Use YYYY-MM-DD, YYYY-MM or DD.MM.YYYY, years ${MIN_YEAR}–${maxYear()}.`);
  return out;
}

// Sales files can be larger than the default 1 MB JSON limit.
const bigJson = express.json({ limit: "4mb" });

businessRouter.get("/datasets", async (req, res) => {
  const rows = await all<DatasetRow>("SELECT * FROM business_datasets WHERE user_id = ? ORDER BY updated_at DESC", currentUser(req).id);
  res.json({ items: rows.map(summary) });
});

businessRouter.post("/datasets", bigJson, serviceLimiter, async (req, res) => {
  const user = currentUser(req);
  const b = parseBody(req, datasetSchema);
  const count = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM business_datasets WHERE user_id = ?", user.id))?.n ?? 0;
  if (count >= MAX_DATASETS) throw badRequest(`You can keep up to ${MAX_DATASETS} datasets. Delete an old one first.`);
  const rows = cleanRows(b.rows).sort((x, y) => x.date.localeCompare(y.date));
  const id = newId(), now = nowIso();
  await run(
    "INSERT INTO business_datasets (id,user_id,name,source,currency,rows_json,row_count,period_start,period_end,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    id, user.id, b.name, b.source, b.currency, JSON.stringify(rows), rows.length, rows[0].date, rows.at(-1)!.date, now, now,
  );
  await logActivity(user.id, "market_analysis", "forecast", `Business data: ${b.name}`, { refId: id });
  const dataset = await loadDataset(user.id, id);
  res.status(201).json({ dataset: { ...dataset, rows: undefined }, analysis: analyseBusiness(dataset.rows) });
});

businessRouter.get("/datasets/:id", async (req, res) => {
  const dataset = await loadDataset(currentUser(req).id, param(req, "id"));
  res.json({ dataset, analysis: analyseBusiness(dataset.rows) });
});

businessRouter.put("/datasets/:id", bigJson, async (req, res) => {
  const user = currentUser(req);
  const id = param(req, "id");
  const b = parseBody(req, datasetSchema);
  const rows = cleanRows(b.rows).sort((x, y) => x.date.localeCompare(y.date));
  const r = await run(
    "UPDATE business_datasets SET name=?, currency=?, rows_json=?, row_count=?, period_start=?, period_end=?, updated_at=? WHERE id = ? AND user_id = ?",
    b.name, b.currency, JSON.stringify(rows), rows.length, rows[0].date, rows.at(-1)!.date, nowIso(), id, user.id,
  );
  if (!r.changes) throw notFound("Dataset not found");
  const dataset = await loadDataset(user.id, id);
  res.json({ dataset, analysis: analyseBusiness(dataset.rows) });
});

businessRouter.delete("/datasets/:id", async (req, res) => {
  const r = await run("DELETE FROM business_datasets WHERE id = ? AND user_id = ?", param(req, "id"), currentUser(req).id);
  if (!r.changes) throw notFound("Dataset not found");
  res.json({ ok: true });
});

// ---------- Reports ----------

const reportSchema = z.object({ period: z.enum(["week", "month"]), datasetId: z.string().max(64).optional() });

businessRouter.get("/reports", async (req, res) => {
  res.json({ items: await listReports(currentUser(req).id) });
});

businessRouter.post("/reports", requireVerified, serviceLimiter, async (req, res) => {
  const b = parseBody(req, reportSchema);
  res.status(201).json({ report: await generateReport(currentUser(req).id, b.period, b.datasetId) });
});

businessRouter.get("/reports/:id", async (req, res) => {
  res.json({ report: await getReport(currentUser(req).id, param(req, "id")) });
});

businessRouter.delete("/reports/:id", async (req, res) => {
  await deleteReport(currentUser(req).id, param(req, "id"));
  res.json({ ok: true });
});
