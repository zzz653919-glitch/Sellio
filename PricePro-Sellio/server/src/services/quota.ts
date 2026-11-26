/**
 * Request limits for the core services (AI advertisement generation and demand forecasts).
 *
 * Every request is tracked in usage_events:
 *  1. reserveRequest()  — one atomic INSERT … SELECT … WHERE count < limit, so concurrent requests can never
 *                         go over the limit (SQLite / libSQL serialise writes);
 *  2. consumeRequest()  — the operation succeeded: the reservation becomes a counted request;
 *  3. releaseRequest()  — the operation failed: the reservation is deleted, nothing is counted.
 * (service, ref_id) is unique, so the same generation or analysis is never counted twice.
 * Reservations that were never finished (a crashed job) stop counting after RESERVATION_TTL_MS.
 *
 * Periods (day / month) start at 00:00 in the user's time zone (user_settings.timezone, or the platform default).
 */
import { all, get, run } from "../db/index.js";
import { tooMany } from "../lib/errors.js";
import { newId } from "../lib/util.js";
import { getPlans, type Plan } from "./plans.js";
import { settings, type RequestPeriod } from "./settings.js";

export type QuotaService = "generation" | "forecast";
export const RESERVATION_TTL_MS = 20 * 60 * 1000;
export const FALLBACK_TIMEZONE = "Asia/Tashkent";

let clock: () => number = () => Date.now();
/** Tests move the clock to check resets. */
export function setClockForTests(fn: (() => number) | null) {
  clock = fn ?? (() => Date.now());
}
export const nowMs = () => clock();
const iso = (t: number) => new Date(t).toISOString();

// ---------------------------------------------------------------- time zones
export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function defaultTimezone(): string {
  const tz = settings().defaultTimezone;
  return isValidTimezone(tz) ? tz : FALLBACK_TIMEZONE;
}

export async function userTimezone(userId: string): Promise<string> {
  const row = await get<{ timezone: string | null }>("SELECT timezone FROM user_settings WHERE user_id = ?", userId);
  return isValidTimezone(row?.timezone) ? row!.timezone! : defaultTimezone();
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsIn(t: number, tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    fmtCache.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(t)).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
  return { y: p.year, m: p.month, d: p.day, H: p.hour, M: p.minute, S: p.second };
}

/** Offset of the zone from UTC at instant t, in milliseconds. */
function offsetMs(t: number, tz: string) {
  const p = partsIn(t, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.H, p.M, p.S) - (t - (((t % 1000) + 1000) % 1000));
}

/** UTC instant of 00:00 on the given local date in the zone. */
function localMidnight(y: number, m: number, d: number, tz: string) {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(guess, tz);
  const again = guess - offsetMs(t, tz);
  if (again !== t) t = again;
  return t;
}

/** Start of the current period and the next reset, both at 00:00 in the zone. */
/** The counting window of a plan: the last N hours (rolling), or the calendar day / month in the user's time zone. */
export function windowOf(info: { requestPeriod: RequestPeriod; periodHours: number }, tz: string, at = nowMs()) {
  if (info.requestPeriod === "hours") return { start: at - info.periodHours * 3_600_000, end: at + info.periodHours * 3_600_000, rolling: true as const };
  return { ...periodBounds(info.requestPeriod, tz, at), rolling: false as const };
}

export function periodBounds(period: RequestPeriod, tz: string, at = nowMs()) {
  if (period === "hours") return { start: at - 3_600_000, end: at + 3_600_000 };
  const p = partsIn(at, tz);
  if (period === "day") {
    const next = new Date(Date.UTC(p.y, p.m - 1, p.d + 1));
    return { start: localMidnight(p.y, p.m, p.d, tz), end: localMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), tz) };
  }
  const next = new Date(Date.UTC(p.y, p.m, 1));
  return { start: localMidnight(p.y, p.m, 1, tz), end: localMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, 1, tz) };
}

// ---------------------------------------------------------------- status
const COUNTED = "(status = 'consumed' OR (status = 'reserved' AND updated_at >= ?))";

async function userPlanRow(userId: string): Promise<Plan> {
  return ((await get<{ plan: Plan }>("SELECT plan FROM users WHERE id = ?", userId))?.plan ?? "free") as Plan;
}

export type RequestStatus = {
  plan: Plan; timezone: string; period: RequestPeriod; windowHours: number | null; limit: number; used: number; remaining: number; periodStart: string;
  /** Rolling window: when the next used request becomes free again. Calendar periods: the next reset. */
  resetsAt: string;
  /** Optional extra daily cap on AI advertisement images (set by an administrator); null when the plan has none. */
  imagesToday: { used: number; limit: number; remaining: number; resetsAt: string } | null;
  /** Demand forecasts have their own allowance, in the same period. */
  forecasts: { used: number; limit: number; remaining: number; period: RequestPeriod; windowHours: number | null; periodStart: string; resetsAt: string };
};

export async function requestStatus(userId: string, known?: { plan?: Plan; timezone?: string }): Promise<RequestStatus> {
  const [plan, timezone] = await Promise.all([known?.plan ?? userPlanRow(userId), known?.timezone ?? userTimezone(userId)]);
  const info = getPlans()[plan];
  const w = windowOf(info, timezone);
  const day = periodBounds("day", timezone);
  const expired = iso(nowMs() - RESERVATION_TTL_MS);
  // One round trip for all counts. "requests" are AI advertisement images; forecasts are counted separately.
  // For a rolling window, the oldest counted use tells when the next request becomes free again.
  const C = COUNTED.replaceAll("?", "?3");
  const row = await get<{ n: number; fc: number; img: number; n0: string | null; fc0: string | null }>(
    `SELECT (SELECT COUNT(*) FROM usage_events WHERE user_id = ?1 AND service = 'generation' AND created_at >= ?2 AND ${C}) AS n,
            (SELECT COUNT(*) FROM usage_events WHERE user_id = ?1 AND service = 'forecast' AND created_at >= ?2 AND ${C}) AS fc,
            (SELECT COUNT(*) FROM usage_events WHERE user_id = ?1 AND service = 'generation' AND created_at >= ?4 AND ${C}) AS img,
            (SELECT MIN(created_at) FROM usage_events WHERE user_id = ?1 AND service = 'generation' AND created_at >= ?2 AND ${C}) AS n0,
            (SELECT MIN(created_at) FROM usage_events WHERE user_id = ?1 AND service = 'forecast' AND created_at >= ?2 AND ${C}) AS fc0`,
    userId, iso(w.start), expired, iso(day.start),
  );
  const hours = w.rolling ? info.periodHours : null;
  const freeAt = (oldest: string | null) => (w.rolling ? (oldest ? Date.parse(oldest) + info.periodHours * 3_600_000 : nowMs()) : w.end);
  const used = row?.n ?? 0;
  const limit = info.limits.requests;
  let imagesToday: RequestStatus["imagesToday"] = null;
  if (info.dailyImageLimit !== null) {
    const n = row?.img ?? 0;
    imagesToday = { used: n, limit: info.dailyImageLimit, remaining: Math.max(0, info.dailyImageLimit - n), resetsAt: iso(day.end) };
  }
  const fcUsed = row?.fc ?? 0;
  const forecasts = { used: fcUsed, limit: info.limits.forecasts, remaining: Math.max(0, info.limits.forecasts - fcUsed), period: info.requestPeriod, windowHours: hours, periodStart: iso(w.start), resetsAt: iso(freeAt(row?.fc0 ?? null)) };
  return { plan, timezone, period: info.requestPeriod, windowHours: hours, limit, used, remaining: Math.max(0, limit - used), periodStart: iso(w.start), resetsAt: iso(freeAt(row?.n0 ?? null)), imagesToday, forecasts };
}

// ---------------------------------------------------------------- reserve / consume / release
/**
 * Reserve one request for an operation identified by (service, refId). Throws LIMIT_REACHED when none is left.
 * Calling it again for the same operation does not reserve a second request.
 */
export async function reserveRequest(userId: string, service: QuotaService, refId: string) {
  const existing = await get<{ id: string }>("SELECT id FROM usage_events WHERE service = ? AND ref_id = ?", service, refId);
  if (existing) return existing.id;
  const plan = await userPlanRow(userId);
  const timezone = await userTimezone(userId);
  const info = getPlans()[plan];
  const now = nowMs();
  const { start } = windowOf(info, timezone, now);
  const id = newId();
  // Images and forecasts each have their own allowance.
  const serviceLimit = service === "generation" ? info.limits.requests : info.limits.forecasts;
  // AI images on plans with a daily image cap: the daily count is checked in the same atomic statement.
  const dailyCap = service === "generation" ? info.dailyImageLimit : null;
  const day = periodBounds("day", timezone);
  const dailySql = dailyCap !== null
    ? ` AND (SELECT COUNT(*) FROM usage_events WHERE user_id = ? AND service = 'generation' AND created_at >= ? AND ${COUNTED}) < ?`
    : "";
  const dailyParams = dailyCap !== null ? [userId, iso(day.start), iso(now - RESERVATION_TTL_MS), dailyCap] : [];
  let changes = 0;
  try {
    ({ changes } = await run(
      `INSERT INTO usage_events (id, user_id, service, ref_id, status, plan, period, period_start, created_at, updated_at)
       SELECT ?, ?, ?, ?, 'reserved', ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM usage_events WHERE user_id = ? AND service = ? AND created_at >= ? AND ${COUNTED}) < ?${dailySql}`,
      id, userId, service, refId, plan, info.requestPeriod, iso(start), iso(now), iso(now),
      userId, service, iso(start), iso(now - RESERVATION_TTL_MS), serviceLimit, ...dailyParams,
    ));
  } catch (err) {
    // A parallel call for the same operation won the race: it is counted once.
    const again = await get<{ id: string }>("SELECT id FROM usage_events WHERE service = ? AND ref_id = ?", service, refId);
    if (again) return again.id;
    throw err;
  }
  if (changes === 0) {
    const status = await requestStatus(userId, { plan, timezone });
    if (service === "generation" && dailyCap !== null && status.remaining > 0 && status.imagesToday && status.imagesToday.remaining === 0) {
      throw tooMany(
        `The ${info.name} plan allows ${dailyCap} AI advertisement images per day. More will be available after 00:00 (${timezone}).`,
        { metric: "images_per_day", used: dailyCap, limit: dailyCap, plan, period: "day", resetsAt: iso(day.end) },
      );
    }
    const what = service === "generation" ? "AI advertisement images" : "demand forecasts";
    const free = service === "generation" ? status.resetsAt : status.forecasts.resetsAt;
    const metric = { metric: service === "generation" ? "requests" : "forecasts", used: serviceLimit, limit: serviceLimit, plan, period: info.requestPeriod, resetsAt: free };
    if (info.requestPeriod === "hours") {
      throw tooMany(`You have used all ${serviceLimit} ${what} of the ${info.name} plan for the last ${info.periodHours} hours. The next one is available at ${fmtTime(free, timezone)}.`, metric);
    }
    const when = info.requestPeriod === "day" ? "today" : "this month";
    throw tooMany(`You have used all ${serviceLimit} ${what} of the ${info.name} plan ${when}. They renew on ${fmtReset(free, timezone)}.`, metric);
  }
  return id;
}

/** "2026-04-11 14:30" in the user's time zone. */
function fmtTime(isoStr: string, tz: string) {
  const p = partsIn(Date.parse(isoStr), tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")} ${String(p.H).padStart(2, "0")}:${String(p.M).padStart(2, "0")}`;
}

/** "2026-04-11 00:00" in the user's time zone. */
function fmtReset(isoStr: string, tz: string) {
  const p = partsIn(Date.parse(isoStr), tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")} 00:00`;
}

/** The operation succeeded: count it (once). */
export async function consumeRequest(service: QuotaService, refId: string) {
  await run("UPDATE usage_events SET status = 'consumed', updated_at = ? WHERE service = ? AND ref_id = ? AND status = 'reserved'", iso(nowMs()), service, refId);
}

/** The operation failed: give the request back. */
export async function releaseRequest(service: QuotaService, refId: string) {
  await run("DELETE FROM usage_events WHERE service = ? AND ref_id = ? AND status = 'reserved'", service, refId);
}

/** Counted requests of one user, newest first (admin history). */
export async function usageHistory(userId: string, limit = 100) {
  return all<{ id: string; service: string; ref_id: string | null; status: string; plan: string; period: string; created_at: string }>(
    "SELECT id, service, ref_id, status, plan, period, created_at FROM usage_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?", userId, limit,
  );
}
