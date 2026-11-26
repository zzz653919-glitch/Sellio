import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { config, features, isProd, isTest } from "../../config.js";
import { get, run, transaction } from "../../db/index.js";
import { badRequest, conflict, notConfigured, tooMany, unauthorized, forbidden } from "../../lib/errors.js";
import { settings } from "../../services/settings.js";
import { newId, nowIso, randomToken, sha256 } from "../../lib/util.js";
import { logActivity } from "../../services/activity.js";
import { sendEmail } from "../../services/email.js";
import { notify } from "../../services/notifications.js";

const BCRYPT_ROUNDS = isTest ? 4 : 12;
// Used to keep login timing similar whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

export async function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string | null | undefined) {
  return bcrypt.compare(password, hash ?? DUMMY_HASH);
}

// ------------------------------------------------------------------ password reset links
const RESET_TTL_HOURS = 1;

async function issueResetToken(userId: string) {
  const token = randomToken(32);
  const now = new Date();
  // Only the latest reset link stays valid.
  await run("UPDATE email_tokens SET used_at = ? WHERE user_id = ? AND type = 'reset' AND used_at IS NULL", now.toISOString(), userId);
  await run(
    "INSERT INTO email_tokens (id,user_id,type,token_hash,expires_at,created_at) VALUES (?,?,'reset',?,?,?)",
    newId(), userId, sha256(token), new Date(now.getTime() + RESET_TTL_HOURS * 3600_000).toISOString(), now.toISOString(),
  );
  return token;
}

/** Consume a one-time reset token. Returns the user id, or throws a generic error. */
async function consumeResetToken(token: string): Promise<string> {
  const row = await get<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
    "SELECT id, user_id, expires_at, used_at FROM email_tokens WHERE token_hash = ? AND type = 'reset'",
    sha256(token),
  );
  if (!row || row.used_at || row.expires_at < nowIso()) throw badRequest("This reset link is invalid or has expired.");
  await run("UPDATE email_tokens SET used_at = ? WHERE id = ?", nowIso(), row.id);
  return row.user_id;
}

/** In development without SMTP, the link/code is also returned so the flow can be completed locally. */
function devValue<T>(value: T) {
  return !features.email && !isProd ? value : undefined;
}

// ------------------------------------------------------------------ email one-time codes
export type CodePurpose = "login" | "signup" | "verify";
const CODE_TTL_MIN = 10; // one code
const CHALLENGE_TTL_MIN = 30; // the whole sign-in attempt, including resends
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 5;
export const RESEND_COOLDOWN_SEC = 60;

/** Codes can only be used when they can really be delivered. */
export function assertEmailDelivery() {
  if (isProd && !features.email) {
    throw notConfigured("email", "Email sending is not configured on the server (SMTP), so sign-in codes cannot be delivered.");
  }
}

const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
const codeHash = (token: string, code: string) => sha256(`${token}:${code}`);

async function emailCode(email: string, code: string, purpose: CodePurpose) {
  const action = purpose === "signup" ? "finish creating your account" : purpose === "verify" ? "verify your email address" : "sign in";
  await sendEmail({
    to: email,
    subject: `${code} is your Vendora code`,
    text:
      `Your Vendora code: ${code}\n\nEnter it to ${action}. The code is valid for ${CODE_TTL_MIN} minutes.\n\n` +
      `If you did not try to ${action}, ignore this email and consider changing your password.`,
  });
}

/** Start a code challenge: emails a 6-digit code and returns an opaque challenge token for the client. */
export async function startCodeChallenge(userId: string, email: string, purpose: CodePurpose) {
  assertEmailDelivery();
  const token = randomToken(32);
  const code = newCode();
  const now = new Date();
  const iso = now.toISOString();
  await run("UPDATE login_challenges SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL", iso, userId, purpose);
  await run(
    `INSERT INTO login_challenges (id,user_id,purpose,token_hash,code_hash,last_sent_at,code_expires_at,expires_at,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    newId(), userId, purpose, sha256(token), codeHash(token, code), iso,
    new Date(now.getTime() + CODE_TTL_MIN * 60_000).toISOString(),
    new Date(now.getTime() + CHALLENGE_TTL_MIN * 60_000).toISOString(), iso,
  );
  await emailCode(email, code, purpose);
  return { challenge: token, email, resendInSec: RESEND_COOLDOWN_SEC, devCode: devValue(code) };
}

type ChallengeRow = {
  id: string; user_id: string; purpose: CodePurpose; code_hash: string; attempts: number; sends: number;
  last_sent_at: string; code_expires_at: string; expires_at: string; used_at: string | null;
};

async function openChallenge(token: string) {
  const row = await get<ChallengeRow>("SELECT * FROM login_challenges WHERE token_hash = ?", sha256(token));
  if (!row || row.used_at || row.expires_at < nowIso()) {
    throw badRequest("This sign-in attempt has expired. Start again.");
  }
  return row;
}

export async function resendCode(token: string) {
  const row = await openChallenge(token);
  const wait = Math.ceil((Date.parse(row.last_sent_at) + RESEND_COOLDOWN_SEC * 1000 - Date.now()) / 1000);
  if (wait > 0) throw tooMany(`Wait ${wait} seconds before requesting a new code.`, { retryAfterSec: wait });
  if (row.sends >= MAX_SENDS) throw tooMany("Too many codes were requested. Start again.");
  assertEmailDelivery();
  const user = (await get<{ email: string }>("SELECT email FROM users WHERE id = ?", row.user_id))!;
  const code = newCode();
  const now = new Date();
  await run(
    "UPDATE login_challenges SET code_hash = ?, attempts = 0, sends = sends + 1, last_sent_at = ?, code_expires_at = ? WHERE id = ?",
    codeHash(token, code), now.toISOString(), new Date(now.getTime() + CODE_TTL_MIN * 60_000).toISOString(), row.id,
  );
  await emailCode(user.email, code, row.purpose);
  return { resendInSec: RESEND_COOLDOWN_SEC, devCode: devValue(code) };
}

/** Check a code. A correct code also proves control of the inbox, so the email becomes verified. */
export async function verifyCode(token: string, code: string, sessionUserId?: string) {
  const row = await openChallenge(token);
  // Verifying the email of an existing session: only that session's user may complete it.
  if (row.purpose === "verify" && row.user_id !== sessionUserId) throw unauthorized();
  if (row.attempts >= MAX_ATTEMPTS) throw tooMany("Too many incorrect attempts. Request a new code.");
  if (row.code_expires_at < nowIso()) throw badRequest("This code has expired. Request a new one.");
  const expected = Buffer.from(row.code_hash);
  const actual = Buffer.from(codeHash(token, code));
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    await run("UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ?", row.id);
    const left = MAX_ATTEMPTS - row.attempts - 1;
    throw left > 0
      ? badRequest(`Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.`, { attemptsLeft: left })
      : tooMany("Too many incorrect attempts. Request a new code.");
  }
  const now = nowIso();
  await run("UPDATE login_challenges SET used_at = ? WHERE id = ?", now, row.id);
  const user = await get<{ email_verified_at: string | null }>("SELECT email_verified_at FROM users WHERE id = ?", row.user_id);
  if (user && !user.email_verified_at) {
    await run("UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ?", now, now, row.user_id);
    await logActivity(row.user_id, "email_verified", "account", "Email address verified");
    await notify(row.user_id, "account", "Email verified", "Your email address has been verified. All Vendora services are now available.");
  }
  return { userId: row.user_id, purpose: row.purpose };
}

export async function signup(input: { email: string; password: string; firstName: string; lastName: string; language?: "en" | "uz" | "ru" }) {
  if (!settings().registrationOpen) throw forbidden("New registrations are closed right now.", "REGISTRATION_CLOSED");
  assertEmailDelivery();
  const existing = await get("SELECT id FROM users WHERE email = ?", input.email);
  if (existing) throw conflict("An account with this email already exists.");
  const id = newId();
  const now = nowIso();
  const passwordHash = await hashPassword(input.password);
  await transaction([
    [`INSERT INTO users (id,email,password_hash,first_name,last_name,plan,created_at,updated_at)
       VALUES (?,?,?,?,?, 'free', ?, ?)`,
      id, input.email, passwordHash, input.firstName, input.lastName, now, now,],
    ["INSERT INTO user_settings (user_id, language, updated_at) VALUES (?, ?, ?)", id, input.language ?? "en", now],
    ["INSERT INTO subscriptions (user_id, plan, status, updated_at) VALUES (?, 'free', 'active', ?)", id, now],
    ["INSERT INTO subscription_events (id,user_id,type,plan,created_at) VALUES (?,?,?,?,?)",
      newId(), id, "plan_started", "free", now,],
  ]);
  await logActivity(id, "signup", "account", "Account created");
  return startCodeChallenge(id, input.email, "signup");
}

export async function requestPasswordReset(email: string) {
  const user = await get<{ id: string; email: string }>("SELECT id, email FROM users WHERE email = ?", email);
  if (!user) return { devResetUrl: undefined };
  const token = await issueResetToken(user.id);
  const url = `${config.APP_URL}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: "Reset your Vendora password",
    text: `A password reset was requested for your Vendora account.\n\nOpen this link within 1 hour to choose a new password:\n${url}\n\nIf you did not request this, you can ignore this email.`,
  });
  return { devResetUrl: devValue(url) };
}

export async function resetPassword(token: string, password: string) {
  const userId = await consumeResetToken(token);
  const hash = await hashPassword(password);
  const now = nowIso();
  await transaction([
    ["UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?", hash, now, now, userId],
    // Opening the reset link proves control of the inbox.
    ["UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?", now, userId],
    ["DELETE FROM sessions WHERE user_id = ?", userId],
  ]);
  await logActivity(userId, "password_changed", "account", "Password reset via email");
  await notify(userId, "account", "Password changed", "Your Vendora password was reset. All other sessions were signed out.");
  return userId;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string, keepSessionId?: string) {
  const row = await get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", userId);
  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
    throw badRequest("Your current password is incorrect.");
  }
  const hash = await hashPassword(newPassword);
  const now = nowIso();
  await run("UPDATE users SET password_hash = ?, password_changed_at = ?, updated_at = ? WHERE id = ?", hash, now, now, userId);
  await run("DELETE FROM sessions WHERE user_id = ? AND id != ?", userId, keepSessionId ?? "");
  await logActivity(userId, "password_changed", "account", "Password changed");
  await notify(userId, "account", "Password changed", "Your Vendora password was changed. Other sessions were signed out.");
}
