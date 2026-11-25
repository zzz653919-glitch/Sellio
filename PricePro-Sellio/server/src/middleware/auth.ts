import type { NextFunction, Request, Response } from "express";
import { config, isProd } from "../config.js";
import { get, run } from "../db/index.js";
import { AppError, forbidden, unauthorized } from "../lib/errors.js";
import { addDays, nowIso, randomToken, sha256 } from "../lib/util.js";

export const SESSION_COOKIE = "pp_session";

export type AuthUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_key: string | null;
  email_verified_at: string | null;
  plan: "free" | "pro";
  created_at: string;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: string;
    }
  }
}

export async function createSession(res: Response, userId: string, req: Request) {
  const token = randomToken(32);
  const id = sha256(token);
  const now = new Date();
  const expires = addDays(now, config.SESSION_TTL_DAYS);
  await run(
    "INSERT INTO sessions (id,user_id,created_at,expires_at,last_seen_at,user_agent,ip) VALUES (?,?,?,?,?,?,?)",
    id, userId, now.toISOString(), expires.toISOString(), now.toISOString(),
    (req.get("user-agent") ?? "").slice(0, 300), req.ip ?? null,
  );
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: isProd, sameSite: "lax", path: "/" });
}

/** Loads the user from the session cookie, if any. Never throws. */
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token.length >= 20 && token.length <= 100) {
    const id = sha256(token);
    const row = await get<AuthUser & { session_id: string; expires_at: string; last_seen_at: string }>(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.avatar_key, u.email_verified_at, u.plan, u.created_at,
              s.id AS session_id, s.expires_at, s.last_seen_at
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
      id,
    );
    if (row && row.expires_at > nowIso()) {
      const { session_id, expires_at: _e, last_seen_at, ...user } = row;
      req.user = user;
      req.sessionId = session_id;
      // Touch at most once per minute.
      if (Date.now() - Date.parse(last_seen_at) > 60_000) {
        await run("UPDATE sessions SET last_seen_at = ? WHERE id = ?", nowIso(), session_id);
      }
    } else if (row) {
      await run("DELETE FROM sessions WHERE id = ?", id);
    }
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  next();
}

/** Core services require a verified email address. */
export function requireVerified(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  if (!req.user.email_verified_at) {
    return next(forbidden("Please verify your email address to use this feature.", "EMAIL_NOT_VERIFIED"));
  }
  next();
}

/**
 * CSRF defence: state-changing requests must carry a custom header. Browsers cannot
 * send it cross-origin without a CORS preflight, which this API never approves.
 */
export function requireClientHeader(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("x-pricepro-client") !== "web") {
    return next(new AppError(403, "CSRF", "Missing client header"));
  }
  next();
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
