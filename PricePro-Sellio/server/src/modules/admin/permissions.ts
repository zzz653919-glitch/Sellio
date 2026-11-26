/**
 * Role-based access control for the admin panel, enforced on the server for every admin endpoint.
 */
import type { NextFunction, Request, Response } from "express";
import { forbidden, unauthorized } from "../../lib/errors.js";
import type { AdminRole, AuthUser } from "../../middleware/auth.js";
import { settings } from "../../services/settings.js";

export const PERMISSIONS = [
  "dashboard.view",
  "users.view", "users.manage", "users.delete", "users.flag",
  "content.view", "content.moderate",
  "studio.view", "forecast.view", "forecast.manage",
  "subscriptions.view", "plans.manage", "payments.view",
  "notifications.manage",
  "support.manage",
  "analytics.view",
  "admins.manage", "audit.view", "settings.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  admin: [
    "dashboard.view", "users.view", "users.manage", "users.delete", "users.flag", "content.view", "content.moderate",
    "studio.view", "forecast.view", "forecast.manage", "subscriptions.view", "payments.view", "notifications.manage",
    "support.manage", "analytics.view",
  ],
  moderator: ["dashboard.view", "users.view", "users.flag", "content.view", "content.moderate", "support.manage"],
};

export const can = (role: AdminRole | null | undefined, p: Permission) => Boolean(role && ROLE_PERMISSIONS[role].includes(p));

/** Two-factor check: once an admin enables 2FA, every admin session must pass it (valid for 12 hours). */
export const MFA_VALID_MS = 12 * 3600 * 1000;
export function mfaState(u: AuthUser): "ok" | "required" | "setup_required" {
  if (u.admin_totp) return u.admin_mfa_at && Date.now() - Date.parse(u.admin_mfa_at) < MFA_VALID_MS ? "ok" : "required";
  return settings().requireAdmin2fa ? "setup_required" : "ok";
}

/** Any admin role, with a passed 2FA check (unless `allowMfaPending` for the 2FA endpoints themselves). */
export function requireAdmin(opts: { allowMfaPending?: boolean } = {}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const u = req.user;
    if (!u) return next(unauthorized());
    if (!u.admin_role) return next(forbidden("You do not have access to the admin panel.", "NOT_ADMIN"));
    const mfa = mfaState(u);
    if (mfa !== "ok" && !opts.allowMfaPending) {
      return next(forbidden(mfa === "required" ? "Enter your two-factor code to continue." : "Set up two-factor authentication to use the admin panel.", mfa === "required" ? "MFA_REQUIRED" : "MFA_SETUP_REQUIRED"));
    }
    next();
  };
}

export function requirePermission(p: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!can(req.user?.admin_role, p)) return next(forbidden("Your admin role does not allow this action.", "PERMISSION_DENIED"));
    next();
  };
}
