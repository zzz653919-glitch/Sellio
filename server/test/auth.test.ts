import "./env.js";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Client, closeServer, newUser, outbox, signIn } from "./helpers.js";

after(closeServer);

test("signup sends a 6-digit code; the account opens only after the code is entered", async () => {
  const c = new Client();
  const r = await c.post("/api/auth/signup", { firstName: "A", lastName: "B", email: "verify@example.com", password: "secret123" });
  assert.equal(r.status, 201);
  assert.match(r.data.devCode, /^\d{6}$/);
  const mail = outbox.find((m) => m.to === "verify@example.com");
  assert.ok(mail?.text.includes(r.data.devCode), "the code was emailed");
  assert.equal((await c.get("/api/auth/me")).status, 401, "no session before the code");

  const wrong = r.data.devCode === "000000" ? "111111" : "000000";
  const bad = await c.post("/api/auth/verify-code", { challenge: r.data.challenge, code: wrong });
  assert.equal(bad.status, 400);
  assert.equal(bad.data.error.details.attemptsLeft, 4);
  assert.equal((await c.post("/api/auth/verify-code", { challenge: r.data.challenge, code: "12ab" })).status, 400);

  const ok = await c.post("/api/auth/verify-code", { challenge: r.data.challenge, code: r.data.devCode });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.emailVerified, true);
  assert.equal((await c.get("/api/auth/me")).status, 200);
  assert.notEqual((await c.post("/api/market", { query: "green tea", range: "today 12-m", geos: ["WORLD"] })).status, 403, "services unlocked");
  assert.equal((await c.post("/api/auth/verify-code", { challenge: r.data.challenge, code: r.data.devCode })).status, 400, "codes are single-use");
});

test("too many wrong codes lock the attempt; resend has a cooldown", async () => {
  const { email } = await newUser();
  const c = new Client();
  const r = await c.post("/api/auth/login", { email, password: "secret123" });
  assert.equal(r.status, 200);
  assert.equal((await c.post("/api/auth/resend-code", { challenge: r.data.challenge })).status, 429, "cooldown");
  const wrong = r.data.devCode === "000000" ? "111111" : "000000";
  for (let i = 0; i < 4; i++) assert.equal((await c.post("/api/auth/verify-code", { challenge: r.data.challenge, code: wrong })).status, 400);
  assert.equal((await c.post("/api/auth/verify-code", { challenge: r.data.challenge, code: wrong })).status, 429);
  assert.equal((await c.post("/api/auth/verify-code", { challenge: r.data.challenge, code: r.data.devCode })).status, 429, "locked even with the right code");
  assert.equal((await c.get("/api/auth/me")).status, 401);
});

test("a session from before codes existed can verify its email with a code", async () => {
  const { client, email } = await newUser();
  const { run } = await import("../src/db/index.js");
  await run("UPDATE users SET email_verified_at = NULL WHERE email = ?", email);
  const blocked = await client.post("/api/market", { query: "green tea", range: "today 12-m", geos: ["WORLD"] });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.error.code, "EMAIL_NOT_VERIFIED");
  const r = await client.post("/api/auth/resend-verification");
  assert.equal(r.status, 200);
  const intruder = await newUser();
  assert.equal((await intruder.client.post("/api/auth/verify-code", { challenge: r.data.challenge, code: r.data.devCode })).status, 401);
  const r2 = await client.post("/api/auth/resend-verification");
  const v = await client.post("/api/auth/verify-code", { challenge: r2.data.challenge, code: r2.data.devCode });
  assert.equal(v.status, 200);
  assert.equal(v.data.user.emailVerified, true);
  assert.notEqual((await client.post("/api/market", { query: "green tea", range: "today 12-m", geos: ["WORLD"] })).status, 403);
});

test("duplicate email, weak password and invalid input are rejected", async () => {
  const { email } = await newUser();
  const c = new Client();
  assert.equal((await c.post("/api/auth/signup", { firstName: "X", lastName: "Y", email, password: "secret123" })).status, 409);
  assert.equal((await c.post("/api/auth/signup", { firstName: "X", lastName: "Y", email: "new@example.com", password: "short" })).status, 400);
  assert.equal((await c.post("/api/auth/signup", { firstName: "", lastName: "Y", email: "bad", password: "secret123" })).status, 400);
});

test("login, wrong password, logout and protected routes", async () => {
  const { email } = await newUser();
  const c = new Client();
  assert.equal((await c.get("/api/dashboard")).status, 401);
  assert.equal((await c.post("/api/auth/login", { email, password: "wrongpass1" })).status, 401);
  const step1 = await c.post("/api/auth/login", { email: email.toUpperCase(), password: "secret123" });
  assert.equal(step1.status, 200);
  assert.equal((await c.get("/api/dashboard")).status, 401, "password alone does not sign in");
  assert.equal((await c.post("/api/auth/verify-code", { challenge: step1.data.challenge, code: step1.data.devCode })).status, 200);
  assert.equal((await c.get("/api/dashboard")).status, 200);
  assert.equal((await c.post("/api/auth/logout")).status, 200);
  assert.equal((await c.get("/api/dashboard")).status, 401);
});

test("state-changing requests without the client header are refused (CSRF)", async () => {
  const { client } = await newUser();
  const r = await client.req("PATCH", "/api/user/profile", { firstName: "A", lastName: "B" }, { noClientHeader: true });
  assert.equal(r.status, 403);
  assert.equal(r.data.error.code, "CSRF");
});

test("forgot/reset password signs out all sessions; no account enumeration", async () => {
  const { client, email } = await newUser();
  const anon = new Client();
  const unknown = await anon.post("/api/auth/forgot-password", { email: "nobody@example.com" });
  assert.equal(unknown.status, 200);
  const r = await anon.post("/api/auth/forgot-password", { email });
  assert.equal(r.status, 200);
  assert.equal(r.data.message, unknown.data.message);
  const token = new URL(r.data.devResetUrl).searchParams.get("token");
  assert.equal((await anon.post("/api/auth/reset-password", { token, password: "newpass123" })).status, 200);
  assert.equal((await client.get("/api/auth/me")).status, 401, "old session revoked");
  assert.equal((await anon.post("/api/auth/login", { email, password: "secret123" })).status, 401);
  assert.equal((await signIn(anon, email, "newpass123")).status, 200);
  assert.equal((await anon.post("/api/auth/reset-password", { token, password: "another123" })).status, 400, "token single-use");
});

test("change password requires the current password and keeps this session", async () => {
  const { client, email } = await newUser();
  const other = new Client();
  assert.equal((await signIn(other, email, "secret123")).status, 200);
  assert.equal((await client.post("/api/user/password", { currentPassword: "nope12345", newPassword: "fresh1234" })).status, 400);
  assert.equal((await client.post("/api/user/password", { currentPassword: "secret123", newPassword: "fresh1234" })).status, 200);
  assert.equal((await client.get("/api/auth/me")).status, 200);
  assert.equal((await other.get("/api/auth/me")).status, 401);
});

test("profile and settings persist; account deletion removes data", async () => {
  const { client, email } = await newUser();
  const p = await client.patch("/api/user/profile", { firstName: "Akbar", lastName: "Xatamov" });
  assert.equal(p.data.user.firstName, "Akbar");
  assert.equal((await client.patch("/api/user/settings", { language: "ru" })).data.settings.language, "ru");
  const s = await client.patch("/api/user/settings", { theme: "dark", language: "uz", notifications: { price: false } });
  assert.equal(s.data.settings.theme, "dark");
  assert.equal(s.data.settings.language, "uz");
  assert.equal(s.data.settings.notifications.price, false);
  assert.equal((await client.get("/api/user/settings")).data.settings.theme, "dark");
  assert.equal((await client.del("/api/user/account", { password: "wrong1234" })).status, 400);
  assert.equal((await client.del("/api/user/account", { password: "secret123" })).status, 200);
  assert.equal((await new Client().post("/api/auth/login", { email, password: "secret123" })).status, 401);
});
