/**
 * Platform settings edited in the admin panel (stored in platform_settings).
 * Read once per request at most every 15 seconds and then available synchronously.
 * Secrets (API keys) are never stored here: they stay in environment variables.
 */
import { all, run } from "../db/index.js";
import { nowIso } from "../lib/util.js";

/** requests = AI advertisements + demand forecasts (shared); ai = AI text requests (monthly). */
export type Metric = "requests" | "ai";
export type RequestPeriod = "day" | "month";
export type PlanOverride = { name?: string; priceMonthlyUsd?: number; priceYearlyUsd?: number | null; limits?: Partial<Record<Metric | "generations" | "forecasts", number>>; requestPeriod?: RequestPeriod; dailyImageLimit?: number | null; benefits?: string[]; enabled?: boolean };
/** Manual card payments: what users pay to and the exchange rate used for so'm amounts. */
export type ManualPayment = { enabled: boolean; cardNumber: string; cardholder: string; bank: string; cardType: string; uzsPerUsd: number };
export type Settings = {
  registrationOpen: boolean;
  maintenance: { enabled: boolean; message: string };
  requireAdmin2fa: boolean;
  accountEmails: boolean;
  /** Time zone for daily / monthly resets when a user has not chosen one. */
  defaultTimezone: string;
  plans: { free?: PlanOverride; pro?: PlanOverride; max?: PlanOverride };
  manualPayment: ManualPayment;
  ai: { imageModel: string | null; textProvider: "gemini" | "openai" | null; openaiTextModel: string | null; geminiModel: string | null };
};

export const DEFAULT_SETTINGS: Settings = {
  registrationOpen: true,
  maintenance: { enabled: false, message: "" },
  requireAdmin2fa: false,
  accountEmails: true,
  defaultTimezone: "Asia/Tashkent",
  plans: {},
  manualPayment: { enabled: true, cardNumber: "4466136951534453", cardholder: "Ihtiyor Zoirov", bank: "TBC Bank", cardType: "Visa", uzsPerUsd: 12600 },
  ai: { imageModel: null, textProvider: null, openaiTextModel: null, geminiModel: null },
};

let cache: { at: number; value: Settings } | null = null;
const TTL = 15_000;

export async function refreshSettings(force = false): Promise<Settings> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.value;
  const rows = await all<{ key: string; value_json: string }>("SELECT key, value_json FROM platform_settings");
  const value: Settings = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) {
    if (!(r.key in value)) continue;
    try {
      const v = JSON.parse(r.value_json);
      (value as Record<string, unknown>)[r.key] = typeof v === "object" && v !== null && !Array.isArray(v)
        ? { ...(DEFAULT_SETTINGS as Record<string, unknown>)[r.key] as object, ...v }
        : v;
    } catch { /* keep the default */ }
  }
  cache = { at: Date.now(), value };
  return value;
}

/** Last loaded settings (the API middleware refreshes them for every request). */
export function settings(): Settings {
  return cache?.value ?? DEFAULT_SETTINGS;
}

export async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K], adminId: string | null) {
  await run(
    "INSERT INTO platform_settings (key, value_json, updated_by, updated_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at",
    key, JSON.stringify(value), adminId, nowIso(),
  );
  await refreshSettings(true);
}

/** Tests reset the cache between cases. */
export function resetSettingsCache() {
  cache = null;
}
