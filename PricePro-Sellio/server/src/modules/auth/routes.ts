import { Router } from "express";
import { get, run } from "../../db/index.js";
import { unauthorized } from "../../lib/errors.js";
import { parseBody } from "../../lib/validate.js";
import { clearSessionCookie, createSession, currentUser, requireAuth, type AuthUser } from "../../middleware/auth.js";
import { authLimiter } from "../../middleware/rateLimit.js";
import { logActivity } from "../../services/activity.js";
import { publicUser } from "../user/serialize.js";
import { challengeSchema, forgotSchema, loginSchema, resetSchema, signupSchema, verifyCodeSchema } from "./schemas.js";
import * as auth from "./service.js";

export const authRouter = Router();

const USER_COLUMNS = "id, email, first_name, last_name, avatar_key, email_verified_at, plan, created_at";

// Sign-up and sign-in are two steps: password first, then a 6-digit code sent to the email.
authRouter.post("/signup", authLimiter, async (req, res) => {
  const input = parseBody(req, signupSchema);
  res.status(201).json(await auth.signup(input));
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const { email, password } = parseBody(req, loginSchema);
  const row = await get<{ id: string; email: string; password_hash: string }>("SELECT id, email, password_hash FROM users WHERE email = ?", email);
  const ok = await auth.verifyPassword(password, row?.password_hash);
  if (!row || !ok) throw unauthorized("Incorrect email or password.");
  res.json(await auth.startCodeChallenge(row.id, row.email, "login"));
});

authRouter.post("/verify-code", authLimiter, async (req, res) => {
  const { challenge, code } = parseBody(req, verifyCodeSchema);
  const { userId, purpose } = await auth.verifyCode(challenge, code, req.user?.id);
  if (purpose !== "verify") {
    await createSession(res, userId, req);
    if (purpose === "login") await logActivity(userId, "login", "account", "Signed in");
  }
  const user = (await get<AuthUser>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, userId))!;
  res.json({ user: publicUser(user) });
});

authRouter.post("/resend-code", authLimiter, async (req, res) => {
  const { challenge } = parseBody(req, challengeSchema);
  res.json({ ok: true, ...(await auth.resendCode(challenge)) });
});

authRouter.post("/logout", async (req, res) => {
  if (req.sessionId) await run("DELETE FROM sessions WHERE id = ?", req.sessionId);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get("/me", (req, res) => {
  if (!req.user) throw unauthorized();
  res.json({ user: publicUser(req.user) });
});

/** For sessions created before codes were required: send a code to verify the email. */
authRouter.post("/resend-verification", authLimiter, requireAuth, async (req, res) => {
  const user = currentUser(req);
  if (user.email_verified_at) {
    res.json({ ok: true, alreadyVerified: true });
    return;
  }
  res.json({ ok: true, ...(await auth.startCodeChallenge(user.id, user.email, "verify")) });
});

authRouter.post("/forgot-password", authLimiter, async (req, res) => {
  const { email } = parseBody(req, forgotSchema);
  const { devResetUrl } = await auth.requestPasswordReset(email);
  // Same response whether or not the account exists (no account enumeration).
  res.json({
    ok: true,
    message: "If an account exists for this email, a reset link has been sent.",
    devResetUrl,
  });
});

authRouter.post("/reset-password", authLimiter, async (req, res) => {
  const { token, password } = parseBody(req, resetSchema);
  await auth.resetPassword(token, password);
  clearSessionCookie(res);
  res.json({ ok: true });
});
