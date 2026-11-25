import crypto from "node:crypto";

export const newId = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function safeJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function startOfMonthIso(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

/** Escape a user string for use inside a SQL LIKE pattern with ESCAPE '\'. */
export function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}
