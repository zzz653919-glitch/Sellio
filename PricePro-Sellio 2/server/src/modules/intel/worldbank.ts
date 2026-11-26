/**
 * Economic statistics from World Bank Open Data (api.worldbank.org, free, no key).
 * Values are official yearly figures with a publication lag of one to two years; the year of
 * every value is always shown next to it.
 */
import { config, features } from "../../config.js";
import { notConfigured, upstreamError } from "../../lib/errors.js";
import { cached, DAY_MS } from "./cache.js";

export const INDICATORS = {
  gdp: { id: "NY.GDP.MKTP.CD", label: "GDP", unit: "usd" },
  gdpGrowth: { id: "NY.GDP.MKTP.KD.ZG", label: "GDP growth", unit: "pct" },
  gdpPerCapita: { id: "NY.GDP.PCAP.CD", label: "GDP per person", unit: "usd" },
  inflation: { id: "FP.CPI.TOTL.ZG", label: "Inflation (consumer prices)", unit: "pct" },
  population: { id: "SP.POP.TOTL", label: "Population", unit: "count" },
  consumption: { id: "NE.CON.PRVT.CD", label: "Household spending", unit: "usd" },
  imports: { id: "NE.IMP.GNFS.CD", label: "Imports of goods and services", unit: "usd" },
  exports: { id: "NE.EXP.GNFS.CD", label: "Exports of goods and services", unit: "usd" },
  internet: { id: "IT.NET.USER.ZS", label: "Internet users", unit: "pct_people" },
  urban: { id: "SP.URB.TOTL.IN.ZS", label: "Urban population", unit: "pct_people" },
  remittances: { id: "BX.TRF.PWKR.DT.GD.ZS", label: "Remittances received", unit: "pct_gdp" },
} as const;
export type IndicatorKey = keyof typeof INDICATORS;

export type YearValue = { year: number; value: number };
export type IndicatorSeries = {
  key: IndicatorKey;
  label: string;
  unit: string;
  latest: YearValue | null;
  /** Change over the last five available years: % for amounts, percentage points for rates. */
  change5y: number | null;
  series: YearValue[];
};
export type CountryStats = { country: string; name: string; indicators: IndicatorSeries[] };

type FetchFn = typeof fetch;
let fetchOverride: FetchFn | null = null;
export function setWorldBankFetchForTests(f: FetchFn | null) {
  fetchOverride = f;
}

type WbRow = { country?: { id?: string; value?: string }; date?: string; value?: number | null };

/** Parse a World Bank v2 JSON response: [meta, rows] or [{ message: [...] }] on error. */
export function parseWorldBank(body: unknown): { rows: { country: string; name: string; year: number; value: number }[]; error?: string } {
  if (!Array.isArray(body)) return { rows: [], error: "Unexpected response" };
  const meta = body[0] as { message?: { value?: string }[] } | undefined;
  if (meta?.message) return { rows: [], error: meta.message[0]?.value ?? "World Bank error" };
  const rows = (Array.isArray(body[1]) ? body[1] : []) as WbRow[];
  return {
    rows: rows
      .filter((r) => typeof r.value === "number" && Number.isFinite(r.value) && r.country?.id && /^\d{4}$/.test(r.date ?? ""))
      .map((r) => ({ country: r.country!.id!, name: r.country!.value ?? r.country!.id!, year: Number(r.date), value: r.value! })),
  };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function toSeries(key: IndicatorKey, points: YearValue[]): IndicatorSeries {
  const def = INDICATORS[key];
  const series = [...points].sort((a, b) => a.year - b.year);
  const latest = series.at(-1) ?? null;
  const base = latest ? series.find((p) => p.year === latest.year - 5) : undefined;
  let change5y: number | null = null;
  if (latest && base) {
    change5y = def.unit === "usd" || def.unit === "count"
      ? (base.value !== 0 ? r2(((latest.value - base.value) / Math.abs(base.value)) * 100) : null)
      : r2(latest.value - base.value);
  }
  return { key, label: def.label, unit: def.unit, latest, change5y, series };
}

async function fetchIndicator(key: IndicatorKey, countries: string[]) {
  const to = new Date().getUTCFullYear();
  const url = `${config.WORLD_BANK_API_BASE}/country/${countries.join(";")}/indicator/${INDICATORS[key].id}?format=json&per_page=1000&date=${to - 15}:${to}`;
  let res: Response;
  try {
    res = await (fetchOverride ?? fetch)(url, { signal: AbortSignal.timeout(20_000) });
  } catch {
    throw upstreamError("worldBank", "World Bank Open Data could not be reached.");
  }
  const body = await res.json().catch(() => null);
  const parsed = parseWorldBank(body);
  if (!res.ok || parsed.error) throw upstreamError("worldBank", `World Bank Open Data: ${parsed.error ?? `HTTP ${res.status}`}`);
  return parsed.rows;
}

/** Yearly statistics for up to 6 countries (ISO-2 codes). Cached for 7 days. */
export async function countryStats(countries: string[], keys: IndicatorKey[] = Object.keys(INDICATORS) as IndicatorKey[]): Promise<CountryStats[]> {
  if (!features.worldBank) throw notConfigured("worldBank", "Economic statistics are turned off on this server (WORLD_BANK_ENABLED=false).");
  const codes = [...new Set(countries.map((c) => c.toUpperCase()))].sort();
  const results = await Promise.all(keys.map((key) =>
    cached(`wb:${key}:${codes.join(",")}`, 7 * DAY_MS, () => fetchIndicator(key, codes), (rows) => rows.length > 0)
      .then((rows) => ({ key, rows }))));
  return codes.map((code) => {
    const name = results.flatMap((r) => r.rows).find((r) => r.country === code)?.name ?? code;
    return {
      country: code,
      name,
      indicators: results.map(({ key, rows }) => toSeries(key, rows.filter((r) => r.country === code).map((r) => ({ year: r.year, value: r.value })))),
    };
  });
}
