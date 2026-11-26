import { Router } from "express";
import { z } from "zod";
import { config, features } from "../../config.js";
import { all, get, run, getDb } from "../../db/index.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { nowIso } from "../../lib/util.js";
import { parseBody } from "../../lib/validate.js";
import { currentUser, type AdminRole } from "../../middleware/auth.js";
import { logAudit } from "../../services/audit.js";
import { smtpSummary } from "../../services/email.js";
import { llmProvider } from "../../services/llm.js";
import { isValidTimezone } from "../../services/quota.js";
import { saveSetting, settings } from "../../services/settings.js";
import { newTotpSecret, otpauthUrl, verifyTotp } from "../../services/totp.js";
import { mfaState, PERMISSIONS, requireAdmin, requirePermission, ROLE_PERMISSIONS } from "./permissions.js";
import { confirmPassword } from "./util.js";

export const systemRouter = Router();

/** Who am I in the admin panel: role, permissions, 2FA state. */
systemRouter.get("/me", requireAdmin({ allowMfaPending: true }), (req, res) => {
  const u = currentUser(req);
  res.json({
    role: u.admin_role,
    permissions: ROLE_PERMISSIONS[u.admin_role!],
    mfa: { enabled: Boolean(u.admin_totp), state: mfaState(u), requiredBySettings: settings().requireAdmin2fa },
    superAdminFromEnv: config.SUPER_ADMIN_EMAILS.includes(u.email.toLowerCase()),
  });
});

// ---------- Two-factor authentication (TOTP) ----------

async function ensureRoleRow(userId: string, role: AdminRole) {
  const now = nowIso();
  await run("INSERT INTO admin_roles (user_id, role, created_at, updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id) DO NOTHING", userId, role, now, now);
}

systemRouter.post("/2fa/setup", requireAdmin({ allowMfaPending: true }), async (req, res) => {
  const u = currentUser(req);
  if (u.admin_totp) throw badRequest("Two-factor authentication is already on.");
  await ensureRoleRow(u.id, u.admin_role!);
  const secret = newTotpSecret();
  await run("UPDATE admin_roles SET totp_secret = ?, updated_at = ? WHERE user_id = ?", secret, nowIso(), u.id);
  res.json({ secret, otpauthUrl: otpauthUrl(secret, u.email) });
});

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the app") });

systemRouter.post("/2fa/enable", requireAdmin({ allowMfaPending: true }), async (req, res) => {
  const u = currentUser(req);
  const { code } = parseBody(req, codeSchema);
  const row = await get<{ totp_secret: string | null; totp_enabled_at: string | null }>("SELECT totp_secret, totp_enabled_at FROM admin_roles WHERE user_id = ?", u.id);
  if (!row?.totp_secret) throw badRequest("Start the setup first.");
  if (!verifyTotp(row.totp_secret, code)) throw badRequest("The code is not correct. Check the time on your phone and try again.");
  const now = nowIso();
  await run("UPDATE admin_roles SET totp_enabled_at = ?, updated_at = ? WHERE user_id = ?", now, now, u.id);
  if (req.sessionId) await run("UPDATE sessions SET admin_mfa_at = ? WHERE id = ?", now, req.sessionId);
  await logAudit(req, "2fa.enabled", { type: "admin", id: u.id }, "Turned on two-factor authentication");
  res.json({ ok: true });
});

systemRouter.post("/2fa/verify", requireAdmin({ allowMfaPending: true }), async (req, res) => {
  const u = currentUser(req);
  const { code } = parseBody(req, codeSchema);
  const row = await get<{ totp_secret: string | null; totp_enabled_at: string | null }>("SELECT totp_secret, totp_enabled_at FROM admin_roles WHERE user_id = ?", u.id);
  if (!row?.totp_enabled_at || !row.totp_secret) throw badRequest("Two-factor authentication is not on.");
  if (!verifyTotp(row.totp_secret, code)) {
    await logAudit(req, "2fa.failed", { type: "admin", id: u.id }, "Wrong two-factor code");
    throw badRequest("The code is not correct.");
  }
  if (req.sessionId) await run("UPDATE sessions SET admin_mfa_at = ? WHERE id = ?", nowIso(), req.sessionId);
  res.json({ ok: true });
});

systemRouter.post("/2fa/disable", requireAdmin(), async (req, res) => {
  const u = currentUser(req);
  const b = parseBody(req, codeSchema.extend({ password: z.string().min(1) }));
  await confirmPassword(req, b.password);
  const row = await get<{ totp_secret: string | null }>("SELECT totp_secret FROM admin_roles WHERE user_id = ?", u.id);
  if (!row?.totp_secret || !verifyTotp(row.totp_secret, b.code)) throw badRequest("The code is not correct.");
  if (settings().requireAdmin2fa) throw badRequest("Two-factor authentication is required for all administrators by the platform settings.");
  await run("UPDATE admin_roles SET totp_secret = NULL, totp_enabled_at = NULL, updated_at = ? WHERE user_id = ?", nowIso(), u.id);
  await logAudit(req, "2fa.disabled", { type: "admin", id: u.id }, "Turned off two-factor authentication");
  res.json({ ok: true });
});

// ---------- Administrators and roles ----------

systemRouter.get("/admins", requireAdmin(), requirePermission("admins.manage"), async (_req, res) => {
  const rows = await all<{ user_id: string; role: AdminRole; totp_enabled_at: string | null; created_at: string; email: string; first_name: string; last_name: string; granted_by: string | null }>(
    "SELECT a.user_id, a.role, a.totp_enabled_at, a.created_at, a.granted_by, u.email, u.first_name, u.last_name FROM admin_roles a JOIN users u ON u.id = a.user_id ORDER BY a.created_at",
  );
  const envOnly = config.SUPER_ADMIN_EMAILS.filter((e) => !rows.some((r) => r.email.toLowerCase() === e));
  res.json({
    items: rows.map((r) => ({ userId: r.user_id, email: r.email, name: `${r.first_name} ${r.last_name}`, role: config.SUPER_ADMIN_EMAILS.includes(r.email.toLowerCase()) ? "super_admin" : r.role, fromEnv: config.SUPER_ADMIN_EMAILS.includes(r.email.toLowerCase()), twoFactor: Boolean(r.totp_enabled_at), since: r.created_at })),
    envSuperAdmins: envOnly,
    roles: ROLE_PERMISSIONS,
    permissions: PERMISSIONS,
  });
});

const roleSchema = z.object({ email: z.string().trim().email("Enter the user's email"), role: z.enum(["super_admin", "admin", "moderator"]).nullable(), password: z.string().min(1) });

/** Give, change or remove an admin role (Super Admin only, password confirmation). */
systemRouter.put("/admins", requireAdmin(), requirePermission("admins.manage"), async (req, res) => {
  const b = parseBody(req, roleSchema);
  await confirmPassword(req, b.password);
  const target = await get<{ id: string; email: string; status: string }>("SELECT id, email, status FROM users WHERE email = ?", b.email);
  if (!target) throw notFound("No user with this email. The person must register first.");
  if (target.id === currentUser(req).id) throw badRequest("You cannot change your own role.");
  if (config.SUPER_ADMIN_EMAILS.includes(target.email.toLowerCase())) throw badRequest("This Super Admin is set in SUPER_ADMIN_EMAILS on the server and cannot be changed here.");
  const before = await get<{ role: string }>("SELECT role FROM admin_roles WHERE user_id = ?", target.id);
  const now = nowIso();
  if (b.role === null) await run("DELETE FROM admin_roles WHERE user_id = ?", target.id);
  else await run(
    "INSERT INTO admin_roles (user_id, role, granted_by, created_at, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET role = excluded.role, granted_by = excluded.granted_by, updated_at = excluded.updated_at",
    target.id, b.role, currentUser(req).id, now, now,
  );
  await run("UPDATE sessions SET admin_mfa_at = NULL WHERE user_id = ?", target.id);
  await logAudit(req, "admin.role_changed", { type: "user", id: target.id }, `Role of ${target.email}: ${before?.role ?? "none"} → ${b.role ?? "none"}`);
  res.json({ ok: true });
});

/** People that support tickets can be assigned to. */
systemRouter.get("/staff", requireAdmin(), requirePermission("support.manage"), async (_req, res) => {
  const envEmails = config.SUPER_ADMIN_EMAILS;
  const rows = await all<{ user_id: string; email: string; first_name: string; last_name: string; role: string }>(
    `SELECT u.id AS user_id, u.email, u.first_name, u.last_name, COALESCE(a.role, 'super_admin') AS role FROM users u LEFT JOIN admin_roles a ON a.user_id = u.id
     WHERE a.role IS NOT NULL ${envEmails.length ? `OR lower(u.email) IN (${envEmails.map(() => "?").join(",")})` : ""} ORDER BY u.first_name`, ...envEmails,
  );
  res.json({ items: rows.map((r) => ({ id: r.user_id, name: `${r.first_name} ${r.last_name}`, email: r.email, role: r.role })) });
});

// ---------- Settings and system status ----------

systemRouter.get("/settings", requireAdmin(), requirePermission("settings.manage"), (_req, res) => {
  res.json({ settings: settings() });
});

const settingsSchema = z.object({
  registrationOpen: z.boolean().optional(),
  maintenance: z.object({ enabled: z.boolean(), message: z.string().trim().max(300) }).optional(),
  requireAdmin2fa: z.boolean().optional(),
  accountEmails: z.boolean().optional(),
  manualPayment: z.object({
    enabled: z.boolean(),
    cardNumber: z.string().trim().regex(/^\d{16}$/, "Card number: 16 digits"),
    cardholder: z.string().trim().min(2).max(80),
    bank: z.string().trim().min(2).max(60),
    cardType: z.string().trim().min(2).max(30),
    uzsPerUsd: z.number().min(1000).max(100_000),
  }).optional(),
  defaultTimezone: z.string().trim().max(64).refine(isValidTimezone, "Unknown time zone").optional(),
  ai: z.object({
    imageModel: z.string().trim().max(60).regex(/^[\w.:-]*$/).nullable(),
    textProvider: z.enum(["gemini", "openai"]).nullable(),
    openaiTextModel: z.string().trim().max(60).regex(/^[\w.:-]*$/).nullable(),
    geminiModel: z.string().trim().max(60).regex(/^[\w.:-]*$/).nullable(),
  }).optional(),
  password: z.string().min(1),
});

systemRouter.put("/settings", requireAdmin(), requirePermission("settings.manage"), async (req, res) => {
  const b = parseBody(req, settingsSchema);
  await confirmPassword(req, b.password);
  const admin = currentUser(req).id;
  const changed: string[] = [];
  if (b.registrationOpen !== undefined) { await saveSetting("registrationOpen", b.registrationOpen, admin); changed.push(`registration ${b.registrationOpen ? "open" : "closed"}`); }
  if (b.maintenance) { await saveSetting("maintenance", b.maintenance, admin); changed.push(`maintenance ${b.maintenance.enabled ? "on" : "off"}`); }
  if (b.requireAdmin2fa !== undefined) {
    if (b.requireAdmin2fa && !currentUser(req).admin_totp) throw badRequest("Turn on two-factor authentication for your own account first.");
    await saveSetting("requireAdmin2fa", b.requireAdmin2fa, admin); changed.push(`admin 2FA ${b.requireAdmin2fa ? "required" : "optional"}`);
  }
  if (b.accountEmails !== undefined) { await saveSetting("accountEmails", b.accountEmails, admin); changed.push(`account emails ${b.accountEmails ? "on" : "off"}`); }
  if (b.manualPayment) { await saveSetting("manualPayment", b.manualPayment, admin); changed.push(`card payments ${b.manualPayment.enabled ? "on" : "off"} (card ****${b.manualPayment.cardNumber.slice(-4)}, rate ${b.manualPayment.uzsPerUsd})`); }
  if (b.defaultTimezone !== undefined) { await saveSetting("defaultTimezone", b.defaultTimezone, admin); changed.push(`default time zone ${b.defaultTimezone}`); }
  if (b.ai) {
    const clean = { imageModel: b.ai.imageModel || null, textProvider: b.ai.textProvider, openaiTextModel: b.ai.openaiTextModel || null, geminiModel: b.ai.geminiModel || null };
    await saveSetting("ai", clean, admin); changed.push("AI configuration");
  }
  await logAudit(req, "settings.updated", { type: "settings" }, `Settings changed: ${changed.join(", ") || "nothing"}`, { ...b, password: undefined });
  res.json({ settings: settings() });
});

/** System status: database, storage, email, integrations (names of missing keys, never values). */
systemRouter.get("/system", requireAdmin(), requirePermission("dashboard.view"), async (_req, res) => {
  let database = { ok: true, driver: config.TURSO_DATABASE_URL ? "turso" : "sqlite-file", error: null as string | null };
  try { await getDb(); await get("SELECT 1"); } catch (e) { database = { ...database, ok: false, error: e instanceof Error ? e.message : "error" }; }
  const onVercel = Boolean(process.env.VERCEL);
  const last = await all<{ provider: string; ok: number; created_at: string }>(
    "SELECT provider, ok, MAX(created_at) AS created_at FROM api_calls GROUP BY provider, ok",
  );
  const lastOf = (p: string, ok: number) => last.find((x) => x.provider === p && x.ok === ok)?.created_at ?? null;
  const integ = (name: string, configured: boolean, provider: string | null, envVar: string) => ({
    name, configured, envVar, lastSuccess: provider ? lastOf(provider, 1) : null, lastFailure: provider ? lastOf(provider, 0) : null,
  });
  const text = llmProvider();
  res.json({
    platform: onVercel ? "vercel" : "server",
    database,
    storage: { ok: !onVercel || features.blobStorage, driver: features.blobStorage ? "vercel-blob" : "local-disk" },
    email: { ok: features.email, settings: features.email ? smtpSummary() : null },
    maintenance: settings().maintenance,
    registrationOpen: settings().registrationOpen,
    integrations: [
      integ("Google Trends (SerpApi)", features.serpapi, "serpapi", "SERPAPI_API_KEY"),
      integ(`Text AI${text ? ` (${text.name}: ${text.model})` : ""}`, features.llm, text?.name === "openai" ? "openai_text" : "gemini", "GEMINI_API_KEY / OPENAI_API_KEY"),
      integ(`AI images (${settings().ai.imageModel || config.IMAGE_MODEL})`, features.imageGeneration, "openai_image", "OPENAI_API_KEY"),
      integ("World Bank Open Data", features.worldBank, "world_bank", "WORLD_BANK_ENABLED"),
      integ("UN Comtrade", features.comtrade, "comtrade", "COMTRADE_API_KEY"),
      integ("Card payments (receipt + admin approval)", settings().manualPayment.enabled, null, "Admin → Settings → Card payments"),
      integ("Daily cron", Boolean(config.CRON_SECRET), null, "CRON_SECRET"),
    ],
    canEditSettings: true,
  });
});

