/**
 * Import / export by product group (HS chapters) from UN Comtrade.
 * Needs a free subscription key (COMTRADE_API_KEY from comtradedeveloper.un.org).
 * Official customs data, published with a lag; the year is always returned.
 */
import { config, features } from "../../config.js";
import { notConfigured, upstreamError } from "../../lib/errors.js";
import { recordApiCall } from "../../services/apiLog.js";
import { cached, DAY_MS } from "./cache.js";

/** UN M49 codes as used by Comtrade (India 699 and France 251 are Comtrade-specific). */
export const M49: Record<string, number> = {
  UZ: 860, KZ: 398, KG: 417, TJ: 762, TM: 795, RU: 643, TR: 792, CN: 156, IN: 699, AE: 784,
  SA: 682, US: 842, GB: 826, DE: 276, FR: 251, PL: 616, KR: 410, JP: 392, BR: 76, ID: 360,
};

export type TradeGroup = { code: string; name: string; valueUsd: number; sharePct: number };
export type TradeFlow = { flow: "import" | "export"; year: number | null; totalUsd: number; groups: TradeGroup[] };
export type TradeProfile = { country: string; imports: TradeFlow; exports: TradeFlow };

type FetchFn = typeof fetch;
let fetchOverride: FetchFn | null = null;
export function setComtradeFetchForTests(f: FetchFn | null) {
  fetchOverride = f;
}

type Row = { cmdCode?: string; cmdDesc?: string; primaryValue?: number; period?: number | string };

export function parseComtrade(body: unknown): Row[] {
  const data = (body as { data?: unknown } | null)?.data;
  return Array.isArray(data) ? (data as Row[]).filter((r) => typeof r.primaryValue === "number" && /^\d{2}$/.test(r.cmdCode ?? "")) : [];
}

async function fetchFlow(reporter: number, flow: "M" | "X"): Promise<TradeFlow> {
  const now = new Date().getUTCFullYear();
  for (const year of [now - 1, now - 2, now - 3]) {
    const qs = new URLSearchParams({ reporterCode: String(reporter), period: String(year), partnerCode: "0", flowCode: flow, cmdCode: "AG2", includeDesc: "true" });
    const started = Date.now();
    let res: Response;
    try {
      res = await (fetchOverride ?? fetch)(`${config.COMTRADE_API_BASE}/get/C/A/HS?${qs}`, {
        headers: { "Ocp-Apim-Subscription-Key": config.COMTRADE_API_KEY! },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      await recordApiCall({ provider: "comtrade", operation: `${flow} ${year}`, ok: false, ms: Date.now() - started, error: "unreachable" });
      throw upstreamError("comtrade", "UN Comtrade could not be reached.");
    }
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    await recordApiCall({ provider: "comtrade", operation: `${flow} ${year}`, ok: res.ok, status: res.status, ms: Date.now() - started, error: res.ok ? null : (body?.message ?? body?.error ?? `HTTP ${res.status}`) });
    if (!res.ok) throw upstreamError("comtrade", `UN Comtrade: ${body?.message ?? body?.error ?? `HTTP ${res.status}`}`);
    const rows = parseComtrade(body);
    if (rows.length === 0) continue; // this year is not published yet
    const totalUsd = rows.reduce((s, r) => s + r.primaryValue!, 0);
    const groups = rows
      .sort((a, b) => b.primaryValue! - a.primaryValue!)
      .slice(0, 10)
      .map((r) => ({ code: r.cmdCode!, name: r.cmdDesc ?? `HS ${r.cmdCode}`, valueUsd: r.primaryValue!, sharePct: Math.round((r.primaryValue! / totalUsd) * 1000) / 10 }));
    return { flow: flow === "M" ? "import" : "export", year, totalUsd, groups };
  }
  return { flow: flow === "M" ? "import" : "export", year: null, totalUsd: 0, groups: [] };
}

/** Top imported and exported product groups of a country. Cached for 30 days. */
export async function tradeProfile(country: string): Promise<TradeProfile> {
  if (!features.comtrade) {
    throw notConfigured("comtrade", "Import and export by product group needs UN Comtrade. An administrator must add COMTRADE_API_KEY (free key from comtradedeveloper.un.org).");
  }
  const reporter = M49[country];
  if (!reporter) throw upstreamError("comtrade", `No Comtrade code for ${country}`);
  return cached(`ct:${country}`, 30 * DAY_MS, async () => {
    const [imports, exports] = await Promise.all([fetchFlow(reporter, "M"), fetchFlow(reporter, "X")]);
    return { country, imports, exports };
  }, (p) => p.imports.groups.length + p.exports.groups.length > 0);
}
