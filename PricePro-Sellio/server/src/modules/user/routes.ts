import { Router } from "express";
import { z } from "zod";
import { all, get, run } from "../../db/index.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { inspectImage } from "../../lib/image.js";
import { imageUpload } from "../../lib/upload.js";
import { nowIso } from "../../lib/util.js";
import { param, parseBody } from "../../lib/validate.js";
import { clearSessionCookie, currentUser, requireAuth } from "../../middleware/auth.js";
import { logActivity } from "../../services/activity.js";
import { usage } from "../../services/plans.js";
import { deleteAllFilesOf, deleteUpload, filePath, getOwnedUpload, saveImage, type UploadRow } from "../../services/storage.js";
import { changePasswordSchema } from "../auth/schemas.js";
import { changePassword, verifyPassword } from "../auth/service.js";
import { publicUser } from "./serialize.js";

export const userRouter = Router();
userRouter.use(requireAuth);

function subscriptionOf(userId: string) {
  return get(
    "SELECT plan, status, provider, current_period_end, cancel_at_period_end FROM subscriptions WHERE user_id = ?",
    userId,
  );
}

userRouter.get("/profile", (req, res) => {
  const user = currentUser(req);
  res.json({ user: publicUser(user), subscription: subscriptionOf(user.id), usage: usage(user.id) });
});

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
});

userRouter.patch("/profile", (req, res) => {
  const user = currentUser(req);
  const input = parseBody(req, profileSchema);
  run("UPDATE users SET first_name = ?, last_name = ?, updated_at = ? WHERE id = ?", input.firstName, input.lastName, nowIso(), user.id);
  logActivity(user.id, "profile_updated", "account", "Profile updated");
  res.json({ user: publicUser({ ...user, first_name: input.firstName, last_name: input.lastName }) });
});

userRouter.post("/avatar", imageUpload.single("file"), (req, res) => {
  const user = currentUser(req);
  if (!req.file) throw badRequest("Choose an image to upload.");
  const info = inspectImage(req.file.buffer);
  if (info.width < 64 || info.height < 64) throw badRequest("The profile photo must be at least 64×64 pixels.");
  const saved = saveImage(user.id, "avatar", req.file.buffer, info, req.file.originalname);
  const previous = user.avatar_key;
  run("UPDATE users SET avatar_key = ?, updated_at = ? WHERE id = ?", saved.id, nowIso(), user.id);
  if (previous) {
    try {
      deleteUpload(user.id, previous);
    } catch {
      /* previous file already gone */
    }
  }
  logActivity(user.id, "profile_updated", "account", "Profile photo changed");
  res.json({ user: publicUser({ ...user, avatar_key: saved.id }) });
});

userRouter.get("/avatar", (req, res) => {
  const user = currentUser(req);
  if (!user.avatar_key) throw notFound("No profile photo");
  const row = getOwnedUpload(user.id, user.avatar_key);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.type(row.mime).sendFile(filePath(row));
});

userRouter.delete("/avatar", (req, res) => {
  const user = currentUser(req);
  if (user.avatar_key) {
    run("UPDATE users SET avatar_key = NULL, updated_at = ? WHERE id = ?", nowIso(), user.id);
    try {
      deleteUpload(user.id, user.avatar_key);
    } catch {
      /* already gone */
    }
  }
  res.json({ user: publicUser({ ...user, avatar_key: null }) });
});

userRouter.post("/password", async (req, res) => {
  const user = currentUser(req);
  const { currentPassword, newPassword } = parseBody(req, changePasswordSchema);
  await changePassword(user.id, currentPassword, newPassword, req.sessionId);
  res.json({ ok: true });
});

userRouter.get("/sessions", (req, res) => {
  const user = currentUser(req);
  const rows = all<{ id: string; created_at: string; last_seen_at: string; user_agent: string | null; ip: string | null }>(
    "SELECT id, created_at, last_seen_at, user_agent, ip FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC",
    user.id, nowIso(),
  );
  res.json({
    sessions: rows.map((s) => ({
      id: s.id.slice(0, 16),
      createdAt: s.created_at,
      lastSeenAt: s.last_seen_at,
      userAgent: s.user_agent,
      ip: s.ip,
      current: s.id === req.sessionId,
    })),
  });
});

userRouter.delete("/sessions/:id", (req, res) => {
  const user = currentUser(req);
  const prefix = param(req, "id");
  if (prefix.length !== 16) throw badRequest("Invalid session id");
  const result = run("DELETE FROM sessions WHERE user_id = ? AND substr(id, 1, 16) = ? AND id != ?", user.id, prefix, req.sessionId ?? "");
  if (result.changes === 0) throw notFound("Session not found");
  res.json({ ok: true });
});

type SettingsRow = {
  theme: string; language: string; notify_inapp: number; notify_email: number;
  notify_generation: number; notify_forecast: number; notify_price: number; notify_account: number;
};

function settingsOf(userId: string) {
  const s = get<SettingsRow>("SELECT * FROM user_settings WHERE user_id = ?", userId)!;
  return {
    theme: s.theme,
    language: s.language,
    notifications: {
      inApp: s.notify_inapp === 1,
      email: s.notify_email === 1,
      generation: s.notify_generation === 1,
      forecast: s.notify_forecast === 1,
      price: s.notify_price === 1,
      account: s.notify_account === 1,
    },
  };
}

userRouter.get("/settings", (req, res) => {
  res.json({ settings: settingsOf(currentUser(req).id) });
});

const settingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  language: z.enum(["en", "uz", "ru"]).optional(),
  notifications: z
    .object({
      inApp: z.boolean(),
      email: z.boolean(),
      generation: z.boolean(),
      forecast: z.boolean(),
      price: z.boolean(),
      account: z.boolean(),
    })
    .partial()
    .optional(),
});

const NOTIFY_COLUMNS: Record<string, string> = {
  inApp: "notify_inapp", email: "notify_email", generation: "notify_generation",
  forecast: "notify_forecast", price: "notify_price", account: "notify_account",
};

userRouter.patch("/settings", (req, res) => {
  const user = currentUser(req);
  const input = parseBody(req, settingsSchema);
  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (input.theme) { sets.push("theme = ?"); values.push(input.theme); }
  if (input.language) { sets.push("language = ?"); values.push(input.language); }
  for (const [key, value] of Object.entries(input.notifications ?? {})) {
    if (typeof value === "boolean") { sets.push(`${NOTIFY_COLUMNS[key]} = ?`); values.push(value ? 1 : 0); }
  }
  if (sets.length) {
    sets.push("updated_at = ?");
    values.push(nowIso());
    run(`UPDATE user_settings SET ${sets.join(", ")} WHERE user_id = ?`, ...values, user.id);
  }
  res.json({ settings: settingsOf(user.id) });
});

userRouter.get("/uploads", (req, res) => {
  const user = currentUser(req);
  const rows = all<UploadRow>(
    "SELECT * FROM uploads WHERE user_id = ? AND kind = 'product' ORDER BY created_at DESC LIMIT 200",
    user.id,
  );
  res.json({
    uploads: rows.map((u) => ({
      id: u.id, name: u.original_name, mime: u.mime, size: u.size, width: u.width, height: u.height,
      createdAt: u.created_at, url: `/api/files/${u.id}`,
    })),
  });
});

const deleteAccountSchema = z.object({ password: z.string().min(1).max(128) });

userRouter.delete("/account", async (req, res) => {
  const user = currentUser(req);
  const { password } = parseBody(req, deleteAccountSchema);
  const row = get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", user.id);
  if (!row || !(await verifyPassword(password, row.password_hash))) throw badRequest("Your password is incorrect.");
  deleteAllFilesOf(user.id);
  run("DELETE FROM users WHERE id = ?", user.id); // cascades to every owned record
  clearSessionCookie(res);
  res.json({ ok: true });
});
