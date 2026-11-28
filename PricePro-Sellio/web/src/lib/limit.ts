/**
 * Texts for a used-up plan limit: what ran out and when it renews ("Renews: 28-noyabr, 16:35 (2 soat 5 daqiqa left)").
 * The server sends the renewal moment in LIMIT_REACHED errors (details.resetsAt) and in the usage numbers.
 */
import { fmtDuration, fmtInZone } from "./format";
import { translateNow as t } from "./i18n";

let userZone: string | null = null;
/** The time zone from the user's settings (sent with the usage numbers); used for every renewal time. */
export function setUserZone(tz: string | null | undefined) {
  if (tz) userZone = tz;
}

export function localZone() {
  if (userZone) return userZone;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tashkent";
  } catch {
    return "Asia/Tashkent";
  }
}

export function renewsText(resetsAt: string, timezone: string = localZone(), now = Date.now()) {
  const left = Date.parse(resetsAt) - now;
  if (!(left > 0)) return t("Available again now. Try again.");
  return t("Renews: {when} ({left} left)", { when: fmtInZone(resetsAt, timezone), left: fmtDuration(left) });
}

const WHAT: Record<string, string> = {
  requests: "You have used all AI images of your plan.",
  images_per_day: "You have used all of today's AI images of your plan.",
  forecasts: "You have used all demand forecasts of your plan.",
};

/** What ran out and when it renews, from LIMIT_REACHED error details; null when there is no renewal time. */
export function limitInfo(details: unknown): { what: string; resetsAt: string } | null {
  const d = details as { metric?: string; resetsAt?: unknown } | null | undefined;
  if (!d || typeof d.resetsAt !== "string" || Number.isNaN(Date.parse(d.resetsAt))) return null;
  return { what: t(WHAT[d.metric ?? ""] ?? "Your plan limit is used up."), resetsAt: d.resetsAt };
}

/** The full text for a LIMIT_REACHED error, or null when it carries no renewal time. */
export function limitText(details: unknown, timezone?: string): string | null {
  const i = limitInfo(details);
  return i ? `${i.what} ${renewsText(i.resetsAt, timezone)}` : null;
}

/** When an AI image is available again, if none is left now (the plan limit or the daily image cap). */
export function imageResetsAt(m: { remaining: number; resetsAt: string; imagesToday?: { remaining: number; resetsAt: string } | null } | null | undefined): string | null {
  if (!m) return null;
  if (m.remaining <= 0) return m.resetsAt;
  if (m.imagesToday && m.imagesToday.remaining <= 0) return m.imagesToday.resetsAt;
  return null;
}
