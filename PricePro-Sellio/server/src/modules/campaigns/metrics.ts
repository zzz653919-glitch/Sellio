/** CTR, CPC, CPA, ROAS from the user's own numbers. Missing denominators give null, never a guess. */
type StatLike = { impressions: number; clicks: number; conversions: number; spend: number; revenue: number | null };
const r2 = (v: number) => Math.round(v * 100) / 100;
const ratio = (a: number, b: number, mult = 1) => (b > 0 ? r2((a / b) * mult) : null);

export function metrics(rows: StatLike[]) {
  type Acc = { impressions: number; clicks: number; conversions: number; spend: number; revenue: number; revenueSpend: number; hasRevenue: boolean };
  const s = rows.reduce<Acc>((a, r) => ({
    impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks, conversions: a.conversions + r.conversions,
    spend: a.spend + r.spend, revenue: a.revenue + (r.revenue ?? 0), hasRevenue: a.hasRevenue || r.revenue !== null,
    // ROAS only compares rows that have revenue: missing revenue is unknown, not zero.
    revenueSpend: a.revenueSpend + (r.revenue !== null ? r.spend : 0),
  }), { impressions: 0, clicks: 0, conversions: 0, spend: 0, revenue: 0, revenueSpend: 0, hasRevenue: false });
  return {
    impressions: s.impressions, clicks: s.clicks, conversions: s.conversions, spend: r2(s.spend), revenue: s.hasRevenue ? r2(s.revenue) : null,
    ctrPct: ratio(s.clicks, s.impressions, 100),
    conversionRatePct: ratio(s.conversions, s.clicks, 100),
    cpc: ratio(s.spend, s.clicks),
    cpa: ratio(s.spend, s.conversions),
    roas: s.hasRevenue ? ratio(s.revenue, s.revenueSpend) : null,
  };
}

