/**
 * What worked: measured from the campaign results the user entered (nothing estimated).
 * Used by the Growth Hub, the AI advisor, AI campaign plans and the opportunity list.
 */
import { all } from "../../db/index.js";
import type { Msg } from "../forecast/engine.js";
import { metrics } from "./metrics.js";

type Row = { campaign_id: string; channel: string | null; creative: string; impressions: number; clicks: number; conversions: number; spend: number; revenue: number | null; currency: string; product: string | null };
export type Learnings = {
  currency: string | null;
  sample: { rows: number; clicks: number; conversions: number; reliable: boolean };
  overall: ReturnType<typeof metrics> | null;
  byChannel: (ReturnType<typeof metrics> & { channel: string })[];
  topCreatives: (ReturnType<typeof metrics> & { creative: string })[];
  insights: Msg[];
};

export async function learnings(userId: string): Promise<Learnings> {
  const rows = await all<Row>(
    `SELECT s.campaign_id, s.channel, s.creative, s.impressions, s.clicks, s.conversions, s.spend, s.revenue, c.currency, c.product
     FROM campaign_stats s JOIN campaigns c ON c.id = s.campaign_id WHERE s.user_id = ?`, userId,
  );
  if (!rows.length) return { currency: null, sample: { rows: 0, clicks: 0, conversions: 0, reliable: false }, overall: null, byChannel: [], topCreatives: [], insights: [] };
  // Money can only be compared within one currency: use the most common one.
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1);
  const currency = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const rs = rows.filter((r) => r.currency === currency);
  const overall = metrics(rs);
  const group = <K extends string>(key: (r: Row) => string, name: K) =>
    [...new Set(rs.map(key))].map((k) => ({ [name]: k, ...metrics(rs.filter((r) => key(r) === k)) }) as ReturnType<typeof metrics> & Record<K, string>);
  const byChannel = group((r) => r.channel ?? "other", "channel").sort((a, b) => b.spend - a.spend);
  const topCreatives = group((r) => r.creative, "creative").filter((c) => c.cpa !== null).sort((a, b) => a.cpa! - b.cpa!).slice(0, 5);
  const reliable = overall.conversions >= 5 || overall.clicks >= 100;
  const insights: Msg[] = [];
  const withRoas = byChannel.filter((c) => c.roas !== null && c.spend > 0);
  const withCpa = byChannel.filter((c) => c.cpa !== null);
  if (withRoas.length >= 2) {
    const best = [...withRoas].sort((a, b) => b.roas! - a.roas!)[0];
    insights.push({ key: "Best channel by return on ad spend: {channel} (ROAS {roas}×).", vars: { channel: best.channel, roas: best.roas! } });
  } else if (withCpa.length >= 2) {
    const best = [...withCpa].sort((a, b) => a.cpa! - b.cpa!)[0];
    insights.push({ key: "Cheapest sales come from {channel} ({cpa} {currency} per sale).", vars: { channel: best.channel, cpa: Math.round(best.cpa!), currency } });
  }
  if (topCreatives.length >= 2) insights.push({ key: "Best creative so far: \"{creative}\" ({cpa} {currency} per sale).", vars: { creative: topCreatives[0].creative, cpa: Math.round(topCreatives[0].cpa!), currency } });
  const ctr = byChannel.filter((c) => c.ctrPct !== null && c.impressions >= 1000).sort((a, b) => b.ctrPct! - a.ctrPct!);
  if (ctr.length >= 2) insights.push({ key: "People click most on {channel} (CTR {ctr}%).", vars: { channel: ctr[0].channel, ctr: ctr[0].ctrPct! } });
  if (!reliable) insights.push({ key: "There are still few results (under 5 sales and 100 clicks), so treat these conclusions with caution." });
  return { currency, sample: { rows: rs.length, clicks: overall.clicks, conversions: overall.conversions, reliable }, overall, byChannel, topCreatives, insights };
}
