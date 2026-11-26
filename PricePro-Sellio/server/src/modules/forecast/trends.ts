/**
 * Google Trends search interest via SerpApi (engine=google_trends).
 *
 * Search interest is a relative index (0–100) of how often people search for a product,
 * not a number of units sold. Each time series is normalized on its own (100 = its own peak).
 */
import { config, features } from "../../config.js";
import { recordApiCall } from "../../services/apiLog.js";
import type { Point } from "./engine.js";

export type TrendsRange = "today 3-m" | "today 12-m" | "today 5-y";
export type CountryInterest = { code: string; name: string; value: number };

export interface TrendsProvider {
  name: string;
  /** Interest over time for one area; geo "" = worldwide. */
  interestOverTime(query: string, geo: string, range: TrendsRange): Promise<Point[]>;
  /** Up to 5 queries in one request: their values share one scale, so they can be compared with each other. */
  interestOverTimeMulti?(queries: string[], geo: string, range: TrendsRange): Promise<Record<string, Point[]>>;
  /** Interest by country, worldwide (comparable between countries). */
  interestByCountry(query: string, range: TrendsRange): Promise<CountryInterest[]>;
  /** Interest by region inside one country (e.g. the regions of Uzbekistan). */
  interestByRegion?(query: string, geo: string, range: TrendsRange): Promise<CountryInterest[]>;
}

export class TrendsError extends Error {}

type FetchFn = typeof fetch;
const NO_RESULTS = /hasn't returned any results|no results/i;

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    if (v.trim() === "<1") return 0;
    const n = Number(v.replace(/[^\d.]/g, ""));
    return v.trim() !== "" && Number.isFinite(n) ? n : null;
  }
  return null;
};

/** Parse `interest_over_time.timeline_data`. The incomplete current period (partial_data) is dropped. */
export function parseTimeline(body: unknown): Point[] {
  const items = (body as { interest_over_time?: { timeline_data?: unknown[] } } | null)?.interest_over_time?.timeline_data;
  if (!Array.isArray(items)) return [];
  const out = new Map<string, number>();
  for (const raw of items) {
    const it = raw as { timestamp?: string | number; partial_data?: boolean; values?: { value?: unknown; extracted_value?: unknown }[] };
    if (it.partial_data) continue;
    const ts = num(it.timestamp);
    const v = it.values?.[0];
    const value = v ? (num(v.extracted_value) ?? num(v.value)) : null;
    if (ts === null || value === null) continue;
    out.set(new Date(ts * 1000).toISOString().slice(0, 10), value);
  }
  return [...out.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, units]) => ({ date, units }));
}

/** Parse a multi-query timeline: one series per query, all on the same 0–100 scale. */
export function parseTimelineMulti(body: unknown, queries: string[]): Record<string, Point[]> {
  const items = (body as { interest_over_time?: { timeline_data?: unknown[] } } | null)?.interest_over_time?.timeline_data;
  const out: Record<string, Map<string, number>> = Object.fromEntries(queries.map((q) => [q, new Map<string, number>()]));
  if (Array.isArray(items)) {
    for (const raw of items) {
      const it = raw as { timestamp?: string | number; partial_data?: boolean; values?: { query?: string; value?: unknown; extracted_value?: unknown }[] };
      if (it.partial_data) continue;
      const ts = num(it.timestamp);
      if (ts === null) continue;
      const date = new Date(ts * 1000).toISOString().slice(0, 10);
      (it.values ?? []).forEach((v, i) => {
        const q = v.query && v.query in out ? v.query : queries[i];
        const value = num(v.extracted_value) ?? num(v.value);
        if (q && value !== null) out[q].set(date, value);
      });
    }
  }
  return Object.fromEntries(Object.entries(out).map(([q, m]) => [q, [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, units]) => ({ date, units }))]));
}

/** Parse `interest_by_region` (GEO_MAP_0). */
export function parseByRegion(body: unknown): CountryInterest[] {
  const items = (body as { interest_by_region?: unknown[] } | null)?.interest_by_region;
  if (!Array.isArray(items)) return [];
  const out: CountryInterest[] = [];
  for (const raw of items) {
    const it = raw as { geo?: string; location?: string; value?: unknown; extracted_value?: unknown };
    const value = num(it.extracted_value) ?? num(it.value);
    if (!it.location || value === null) continue;
    out.push({ code: it.geo ?? "", name: it.location, value });
  }
  return out.sort((a, b) => b.value - a.value);
}

export class SerpApiTrendsProvider implements TrendsProvider {
  readonly name = "google_trends_serpapi";
  constructor(private apiKey: string, private fetchFn: FetchFn = fetch, private baseUrl = "https://serpapi.com") {}

  private async call(params: Record<string, string>) {
    const qs = new URLSearchParams({ engine: "google_trends", api_key: this.apiKey, hl: "en", tz: "0", ...params });
    const started = Date.now();
    const op = `${params.data_type ?? "search"}${params.region ? `:${params.region}` : ""}`;
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}/search.json?${qs}`, { signal: AbortSignal.timeout(30_000) });
    } catch {
      await recordApiCall({ provider: "serpapi", operation: op, ok: false, ms: Date.now() - started, error: "unreachable" });
      throw new TrendsError("Google Trends (SerpApi) could not be reached.");
    }
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    const failed = !res.ok || !body || (body.error && !NO_RESULTS.test(body.error));
    await recordApiCall({ provider: "serpapi", operation: op, ok: !failed, status: res.status, ms: Date.now() - started, error: failed ? (body?.error ?? `HTTP ${res.status}`) : null });
    if (body?.error && NO_RESULTS.test(body.error)) return null;
    if (!res.ok || !body || body.error) throw new TrendsError(body?.error ?? `Google Trends returned HTTP ${res.status}`);
    return body;
  }

  async interestOverTime(query: string, geo: string, range: TrendsRange) {
    const body = await this.call({ q: query, date: range, data_type: "TIMESERIES", ...(geo ? { geo } : {}) });
    return body ? parseTimeline(body) : [];
  }

  async interestOverTimeMulti(queries: string[], geo: string, range: TrendsRange) {
    const body = await this.call({ q: queries.join(","), date: range, data_type: "TIMESERIES", ...(geo ? { geo } : {}) });
    return parseTimelineMulti(body, queries);
  }

  async interestByCountry(query: string, range: TrendsRange) {
    const body = await this.call({ q: query, date: range, data_type: "GEO_MAP_0", region: "COUNTRY" });
    return body ? parseByRegion(body) : [];
  }

  async interestByRegion(query: string, geo: string, range: TrendsRange) {
    const body = await this.call({ q: query, date: range, data_type: "GEO_MAP_0", geo, region: "REGION" });
    return body ? parseByRegion(body) : [];
  }
}

let override: TrendsProvider | null | undefined;
/** Tests can replace the provider (null = not configured). */
export function setTrendsProviderForTests(p: TrendsProvider | null | undefined) {
  override = p;
}

export function trendsProvider(): TrendsProvider | null {
  if (override !== undefined) return override;
  return features.serpapi ? new SerpApiTrendsProvider(config.SERPAPI_API_KEY!, fetch, config.SERPAPI_BASE_URL) : null;
}
