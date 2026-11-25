import { get } from "../db/index.js";
import { tooMany } from "../lib/errors.js";
import { startOfMonthIso } from "../lib/util.js";

export type Plan = "free" | "pro";
export type Metric = "generations" | "forecasts";

export const PLANS: Record<Plan, { name: string; priceMonthlyUsd: number; limits: Record<Metric, number>; benefits: string[] }> = {
  free: {
    name: "Free",
    priceMonthlyUsd: 0,
    limits: { generations: 5, forecasts: 10 },
    benefits: [
      "5 AI advertisement generations per month",
      "10 demand analyses per month",
    ],
  },
  pro: {
    name: "Pro",
    priceMonthlyUsd: 19,
    limits: { generations: 200, forecasts: 300 },
    benefits: [
      "200 AI advertisement generations per month",
      "300 demand analyses per month",
      "Priority generation queue",
    ],
  },
};

const COUNTERS: Record<Metric, string> = {
  generations: "SELECT COUNT(*) AS n FROM generations WHERE user_id = ? AND created_at >= ? AND status != 'failed'",
  forecasts: "SELECT COUNT(*) AS n FROM market_analyses WHERE user_id = ? AND created_at >= ? AND status = 'completed'",
};

export async function userPlan(userId: string): Promise<Plan> {
  return ((await get<{ plan: Plan }>("SELECT plan FROM users WHERE id = ?", userId))?.plan ?? "free") as Plan;
}

export async function usage(userId: string) {
  const since = startOfMonthIso();
  const plan = await userPlan(userId);
  const result = {} as Record<Metric, { used: number; limit: number }>;
  for (const metric of Object.keys(COUNTERS) as Metric[]) {
    const used = (await get<{ n: number }>(COUNTERS[metric], userId, since))?.n ?? 0;
    result[metric] = { used, limit: PLANS[plan].limits[metric] };
  }
  return { plan, periodStart: since, metrics: result };
}

export async function assertWithinLimit(userId: string, metric: Metric) {
  const since = startOfMonthIso();
  const plan = await userPlan(userId);
  const used = (await get<{ n: number }>(COUNTERS[metric], userId, since))?.n ?? 0;
  const limit = PLANS[plan].limits[metric];
  if (used >= limit) {
    throw tooMany(
      `You have reached your ${PLANS[plan].name} plan limit for this month (${used}/${limit}).` +
        (plan === "free" ? " Upgrade to Pro for higher limits." : ""),
      { metric, used, limit, plan },
    );
  }
}
