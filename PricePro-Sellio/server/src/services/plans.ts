import { get, run } from "../db/index.js";
import { tooMany } from "../lib/errors.js";
import { newId, nowIso } from "../lib/util.js";

import { periodBounds, requestStatus, userTimezone } from "./quota.js";
import { settings, type Metric, type RequestPeriod } from "./settings.js";

export type Plan = "free" | "pro" | "max";
export const PLAN_KEYS = ["free", "pro", "max"] as const;
export const PAID_PLANS = ["pro", "max"] as const;
export const isPaidPlan = (p: string): p is "pro" | "max" => p === "pro" || p === "max";
export type { Metric };

export type PlanInfo = { name: string; priceMonthlyUsd: number; priceYearlyUsd: number | null; limits: Record<Metric, number>; requestPeriod: RequestPeriod; dailyImageLimit: number | null; benefits: string[]; enabled: boolean };

/** Built-in plans; the admin panel can override names, prices shown, limits, benefits and availability. */
export const PLANS: Record<Plan, { name: string; priceMonthlyUsd: number; priceYearlyUsd: number | null; limits: Record<Metric, number>; requestPeriod: RequestPeriod; dailyImageLimit: number | null; benefits: string[] }> = {
  free: {
    name: "Free",
    priceMonthlyUsd: 0,
    priceYearlyUsd: null,
    limits: { requests: 2, ai: 50 },
    requestPeriod: "day",
    dailyImageLimit: 2,
    benefits: [
      "2 requests per day for AI ads and demand forecasts (shared)",
      "Up to 2 AI advertisement images per day",
      "Renews every day at 00:00; unused requests do not carry over",
      "50 AI text requests per month (ad copy, reviews, plans, explanations)",
    ],
  },
  pro: {
    name: "Pro",
    priceMonthlyUsd: 19,
    priceYearlyUsd: 190,
    limits: { requests: 10, ai: 1000 },
    requestPeriod: "day",
    dailyImageLimit: null,
    benefits: [
      "10 requests per day for AI ads and demand forecasts",
      "Renews every day at 00:00",
      "1000 AI text requests per month",
      "Yearly payment: $190 instead of $228",
    ],
  },
  max: {
    name: "Max",
    priceMonthlyUsd: 20,
    priceYearlyUsd: 200,
    limits: { requests: 20, ai: 3000 },
    requestPeriod: "day",
    dailyImageLimit: null,
    benefits: [
      "20 requests per day for AI ads and demand forecasts",
      "Renews every day at 00:00",
      "3000 AI text requests per month",
      "Yearly payment: $200 instead of $240",
    ],
  },
};

export function getPlans(): Record<Plan, PlanInfo> {
  const o = settings().plans;
  const merge = (p: Plan): PlanInfo => ({
    name: o[p]?.name || PLANS[p].name,
    priceMonthlyUsd: o[p]?.priceMonthlyUsd ?? PLANS[p].priceMonthlyUsd,
    priceYearlyUsd: o[p]?.priceYearlyUsd !== undefined ? o[p]!.priceYearlyUsd! : PLANS[p].priceYearlyUsd,
    limits: { requests: o[p]?.limits?.requests ?? PLANS[p].limits.requests, ai: o[p]?.limits?.ai ?? PLANS[p].limits.ai },
    requestPeriod: o[p]?.requestPeriod === "day" || o[p]?.requestPeriod === "month" ? o[p]!.requestPeriod! : PLANS[p].requestPeriod,
    dailyImageLimit: o[p]?.dailyImageLimit !== undefined ? (o[p]!.dailyImageLimit ?? null) : PLANS[p].dailyImageLimit,
    benefits: o[p]?.benefits?.length ? o[p]!.benefits! : PLANS[p].benefits,
    enabled: p === "free" ? true : o[p]?.enabled ?? true,
  });
  return { free: merge("free"), pro: merge("pro"), max: merge("max") };
}

export async function userPlan(userId: string): Promise<Plan> {
  return ((await get<{ plan: Plan }>("SELECT plan FROM users WHERE id = ?", userId))?.plan ?? "free") as Plan;
}

/** AI text requests this calendar month (in the user's time zone). */
async function aiStatus(userId: string, plan: Plan, timezone: string) {
  const { start, end } = periodBounds("month", timezone);
  const used = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM ai_requests WHERE user_id = ? AND created_at >= ?", userId, new Date(start).toISOString()))?.n ?? 0;
  const limit = getPlans()[plan].limits.ai;
  return { used, limit, remaining: Math.max(0, limit - used), period: "month" as RequestPeriod, periodStart: new Date(start).toISOString(), resetsAt: new Date(end).toISOString() };
}

/** Everything the user sees about limits: requests (AI ads + forecasts) and AI text requests. */
export async function usage(userId: string) {
  const [plan, timezone] = await Promise.all([userPlan(userId), userTimezone(userId)]);
  const [r, ai] = await Promise.all([requestStatus(userId, { plan, timezone }), aiStatus(userId, plan, timezone)]);
  const { plan: _p, timezone: _t, ...requests } = r;
  return { plan, timezone, periodStart: r.periodStart, resetsAt: r.resetsAt, metrics: { requests, ai } };
}

/** Text-AI limit (monthly). Core services use reserveRequest() in quota.ts instead. */
export async function assertWithinLimit(userId: string, metric: "ai") {
  const [plan, timezone] = await Promise.all([userPlan(userId), userTimezone(userId)]);
  const s = await aiStatus(userId, plan, timezone);
  const plans = getPlans();
  if (s.used >= s.limit) {
    throw tooMany(
      `You have reached your ${plans[plan].name} plan limit of AI text requests for this month (${s.used}/${s.limit}).` +
        (plan === "free" ? " Upgrade to Pro or Max for higher limits." : plan === "pro" ? " Upgrade to Max for higher limits." : ""),
      { metric, used: s.used, limit: s.limit, plan },
    );
  }
}

/** Record one successful text-AI request (ad copy, reviews, plans, explanations). */
export async function recordAiRequest(userId: string, kind: string) {
  await run("INSERT INTO ai_requests (id,user_id,kind,created_at) VALUES (?,?,?,?)", newId(), userId, kind, nowIso());
}
