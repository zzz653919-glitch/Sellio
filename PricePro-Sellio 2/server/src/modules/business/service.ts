import { get } from "../../db/index.js";
import { notFound } from "../../lib/errors.js";
import { safeJson } from "../../lib/util.js";
import type { BusinessRow } from "./analysis.js";

export type DatasetRow = { id: string; user_id: string; name: string; source: string; currency: string; rows_json: string; row_count: number; period_start: string | null; period_end: string | null; created_at: string; updated_at: string };
export const summary = (r: DatasetRow) => ({ id: r.id, name: r.name, source: r.source, currency: r.currency, rowCount: r.row_count, periodStart: r.period_start, periodEnd: r.period_end, createdAt: r.created_at, updatedAt: r.updated_at });

export async function loadDataset(userId: string, id: string) {
  const r = await get<DatasetRow>("SELECT * FROM business_datasets WHERE id = ? AND user_id = ?", id, userId);
  if (!r) throw notFound("Dataset not found");
  return { ...summary(r), rows: safeJson<BusinessRow[]>(r.rows_json, []) };
}

export async function latestDataset(userId: string) {
  const r = await get<{ id: string }>("SELECT id FROM business_datasets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1", userId);
  return r ? loadDataset(userId, r.id) : null;
}

