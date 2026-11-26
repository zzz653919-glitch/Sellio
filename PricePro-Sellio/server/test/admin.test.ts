import "./env.js";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { config } from "../src/config.js";
import { run } from "../src/db/index.js";
import { deliverDueAnnouncements } from "../src/services/announcements.js";
import { recordApiCall } from "../src/services/apiLog.js";
import { resetSettingsCache } from "../src/services/settings.js";
import { totp } from "../src/services/totp.js";
import { Client, closeServer, makePng, newUser, signIn } from "./helpers.js";

const cfg = config as unknown as { SUPER_ADMIN_EMAILS: string[] };
after(async () => {
  cfg.SUPER_ADMIN_EMAILS = [];
  await run("DELETE FROM platform_settings");
  resetSettingsCache();
  closeServer();
});

async function superAdmin() {
  const u = await newUser();
  cfg.SUPER_ADMIN_EMAILS = [...cfg.SUPER_ADMIN_EMAILS, u.email.toLowerCase()];
  return u;
}

test("admin API is closed to visitors and normal users; super admin comes from SUPER_ADMIN_EMAILS", async () => {
  assert.equal((await new Client().get("/api/admin/me")).status, 401);
  const normal = await newUser();
  assert.equal((await normal.client.get("/api/admin/me")).status, 403);
  assert.equal((await normal.client.get("/api/admin/users")).status, 403);
  assert.equal((await normal.client.get("/api/auth/me")).data.user.adminRole, null);
  const sa = await superAdmin();
  const me = await sa.client.get("/api/admin/me");
  assert.equal(me.status, 200);
  assert.equal(me.data.role, "super_admin");
  assert.ok(me.data.permissions.includes("admins.manage"));
  assert.equal((await sa.client.get("/api/auth/me")).data.user.adminRole, "super_admin");
});

test("roles: moderators review content but cannot manage users; permissions are enforced on the server", async () => {
  const sa = await superAdmin();
  const mod = await newUser();
  assert.equal((await sa.client.req("PUT", "/api/admin/admins", { email: mod.email, role: "moderator", password: "wrong" })).status, 400);
  const g = await sa.client.req("PUT", "/api/admin/admins", { email: mod.email, role: "moderator", password: "secret123" });
  assert.equal(g.status, 200, JSON.stringify(g.data));
  const victim = await newUser();
  assert.equal((await mod.client.get("/api/admin/content?type=images")).status, 200);
  assert.equal((await mod.client.post(`/api/admin/users/${victim.user.id}/suspend`, { reason: "spam spam" })).status, 403);
  assert.equal((await mod.client.get("/api/admin/settings")).status, 403);
  assert.equal((await mod.client.get("/api/admin/payments")).status, 403);
  const flag = await mod.client.post(`/api/admin/users/${victim.user.id}/flag`, { reason: "Many fake accounts" });
  assert.equal(flag.status, 201);
  const list = await sa.client.get("/api/admin/users?flagged=1");
  assert.ok(list.data.items.some((u: { id: string }) => u.id === victim.user.id));
  const admins = await sa.client.get("/api/admin/admins");
  assert.ok(admins.data.items.some((a: { email: string; role: string }) => a.email === mod.email && a.role === "moderator"));
  // An admin (not super) cannot manage roles.
  await sa.client.req("PUT", "/api/admin/admins", { email: mod.email, role: "admin", password: "secret123" });
  assert.equal((await mod.client.get("/api/admin/admins")).status, 403);
  assert.equal((await mod.client.post(`/api/admin/users/${victim.user.id}/suspend`, { reason: "spam spam" })).status, 200);
});

test("user management: search, profile, plan, suspend, reactivate, delete, CSV export without secrets", async () => {
  const sa = await superAdmin();
  const u = await newUser();
  const found = await sa.client.get(`/api/admin/users?q=${encodeURIComponent(u.email)}`);
  assert.equal(found.data.total, 1);
  const profile = await sa.client.get(`/api/admin/users/${u.user.id}`);
  assert.equal(profile.status, 200);
  assert.equal(JSON.stringify(profile.data).includes("password_hash"), false);
  assert.equal(profile.data.usage.plan, "free");

  const plan = await sa.client.post(`/api/admin/users/${u.user.id}/plan`, { plan: "pro", password: "secret123" });
  assert.equal(plan.status, 200, JSON.stringify(plan.data));
  assert.equal((await u.client.get("/api/dashboard")).data.usage.plan, "pro");
  const events = (await sa.client.get(`/api/admin/users/${u.user.id}`)).data.subscriptionEvents;
  assert.equal(events[0].type, "admin_assigned");
  assert.equal(events[0].amountCents, null, "no payment is invented");

  assert.equal((await sa.client.post(`/api/admin/users/${sa.user.id}/suspend`, { reason: "test it" })).status, 400);
  assert.equal((await sa.client.post(`/api/admin/users/${u.user.id}/suspend`, { reason: "Fraud reports" })).status, 200);
  assert.equal((await u.client.get("/api/dashboard")).status, 401, "suspended user is signed out");
  const login = await new Client().post("/api/auth/login", { email: u.email, password: "secret123" });
  assert.equal(login.status, 403);
  assert.equal(login.data.error.code, "ACCOUNT_SUSPENDED");
  assert.equal((await sa.client.post(`/api/admin/users/${u.user.id}/reactivate`, {})).status, 200);
  const back = new Client();
  assert.equal((await signIn(back, u.email, "secret123")).status, 200);

  const csv = await sa.client.get("/api/admin/users/export");
  assert.equal(csv.status, 200);
  assert.match(csv.data, /^id,email,name,plan,status/);
  assert.equal(/\$2[aby]\$/.test(csv.data), false, "no password hashes");

  assert.equal((await sa.client.req("DELETE", `/api/admin/users/${u.user.id}`, { password: "secret123", confirmEmail: "wrong@x.com" })).status, 400);
  assert.equal((await sa.client.req("DELETE", `/api/admin/users/${u.user.id}`, { password: "secret123", confirmEmail: u.email })).status, 200);
  assert.equal((await sa.client.get(`/api/admin/users/${u.user.id}`)).status, 404);
  const audit = await sa.client.get("/api/admin/audit");
  const actions = audit.data.items.map((a: { action: string }) => a.action);
  for (const a of ["user.plan_assigned", "user.suspended", "user.reactivated", "users.exported", "user.deleted"]) assert.ok(actions.includes(a), a);
});

test("settings: registration closed, maintenance mode, plan limits", async () => {
  const sa = await superAdmin();
  const normal = await newUser();
  assert.equal((await sa.client.req("PUT", "/api/admin/settings", { registrationOpen: false, password: "secret123" })).status, 200);
  const signup = await new Client().post("/api/auth/signup", { firstName: "A", lastName: "B", email: `closed${Date.now()}@example.com`, password: "secret123" });
  assert.equal(signup.status, 403);
  assert.equal((await new Client().get("/api/status")).data.registrationOpen, false);
  await sa.client.req("PUT", "/api/admin/settings", { registrationOpen: true, maintenance: { enabled: true, message: "Back at 10:00" }, password: "secret123" });
  const blocked = await normal.client.get("/api/dashboard");
  assert.equal(blocked.status, 503);
  assert.equal(blocked.data.error.message, "Back at 10:00");
  assert.equal((await sa.client.get("/api/dashboard")).status, 200, "admins keep working");
  await sa.client.req("PUT", "/api/admin/settings", { maintenance: { enabled: false, message: "" }, password: "secret123" });
  assert.equal((await normal.client.get("/api/dashboard")).status, 200);

  const plans = await sa.client.get("/api/admin/plans");
  const free = plans.data.plans.find((p: { key: string }) => p.key === "free");
  const upd = await sa.client.req("PUT", "/api/admin/plans/free", { name: free.name, priceMonthlyUsd: 0, limits: { requests: 7, ai: 55 }, requestPeriod: "month", benefits: ["7 requests"], enabled: true, password: "secret123" });
  assert.equal(upd.status, 200, JSON.stringify(upd.data));
  assert.equal((await normal.client.get("/api/dashboard")).data.usage.metrics.ai.limit, 55);
  assert.equal((await normal.client.get("/api/dashboard")).data.usage.metrics.requests.limit, 7);
  await run("DELETE FROM platform_settings WHERE key = 'plans'");
  resetSettingsCache();
});

test("two-factor authentication for admins", async () => {
  const sa = await superAdmin();
  const setup = await sa.client.post("/api/admin/2fa/setup", {});
  assert.equal(setup.status, 200);
  assert.match(setup.data.otpauthUrl, /^otpauth:\/\/totp\//);
  assert.equal((await sa.client.post("/api/admin/2fa/enable", { code: "000000" })).status, 400);
  assert.equal((await sa.client.post("/api/admin/2fa/enable", { code: totp(setup.data.secret) })).status, 200);
  assert.equal((await sa.client.get("/api/admin/users")).status, 200, "this session passed 2FA");
  const other = new Client();
  await signIn(other, sa.email, "secret123");
  const blocked = await other.get("/api/admin/users");
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.error.code, "MFA_REQUIRED");
  assert.equal((await other.post("/api/admin/2fa/verify", { code: totp(setup.data.secret) })).status, 200);
  assert.equal((await other.get("/api/admin/users")).status, 200);
});

test("announcements now and scheduled; support conversation; content moderation; payments; analytics", async () => {
  const sa = await superAdmin();
  const u = await newUser();
  const a = await sa.client.post("/api/admin/announcements", { title: "New feature", body: "Ad Studio is live", audience: "all", link: "/ads" });
  assert.equal(a.status, 201, JSON.stringify(a.data));
  assert.equal(a.data.status, "sent");
  let notes = (await u.client.get("/api/notifications")).data.items;
  assert.ok(notes.some((n: { title: string; type: string }) => n.title === "New feature" && n.type === "announcement"));
  const future = new Date(Date.now() + 3600_000).toISOString();
  const s = await sa.client.post("/api/admin/announcements", { title: "Planned", body: "Tomorrow", audience: "selected", emails: [u.email], publishAt: future });
  assert.equal(s.data.status, "scheduled");
  await run("UPDATE announcements SET publish_at = ? WHERE id = ?", new Date(Date.now() - 1000).toISOString(), s.data.id);
  await deliverDueAnnouncements(true);
  notes = (await u.client.get("/api/notifications")).data.items;
  assert.ok(notes.some((n: { title: string }) => n.title === "Planned"));
  assert.equal((await sa.client.del(`/api/admin/announcements/${a.data.id}`)).status, 200);
  notes = (await u.client.get("/api/notifications")).data.items;
  assert.ok(!notes.some((n: { title: string }) => n.title === "New feature"), "deleting removes delivered copies");

  // Support
  const t = await u.client.post("/api/support", { subject: "Cannot download", category: "bug", body: "The PNG button does nothing" });
  assert.equal(t.status, 201);
  const list = await sa.client.get("/api/admin/support?status=open");
  assert.ok(list.data.items.some((x: { id: string }) => x.id === t.data.id));
  assert.equal((await sa.client.post(`/api/admin/support/${t.data.id}/reply`, { body: "Fixed, please retry", status: "pending" })).status, 201);
  const mine = await u.client.get(`/api/support/${t.data.id}`);
  assert.equal(mine.data.ticket.status, "pending");
  assert.equal(mine.data.messages.length, 2);
  assert.ok((await u.client.get("/api/notifications")).data.items.some((n: { title: string }) => n.title.startsWith("Reply to your request")));
  const other = await newUser();
  assert.equal((await other.client.get(`/api/support/${t.data.id}`)).status, 404);
  assert.equal((await sa.client.req("PATCH", `/api/admin/support/${t.data.id}`, { status: "resolved", assignedTo: sa.user.id })).status, 200);

  // Content moderation
  const up = new FormData(); up.append("file", new Blob([makePng(400, 400)], { type: "image/png" }), "bad.png");
  const upl = await u.client.req("POST", "/api/studio/uploads", undefined, { form: up });
  const imgs = await sa.client.get(`/api/admin/content?type=images&q=${encodeURIComponent(u.email)}`);
  assert.equal(imgs.data.items[0].id, upl.data.upload.id);
  assert.equal((await sa.client.req("GET", imgs.data.items[0].imageUrl, undefined, { raw: true })).status, 200);
  assert.equal((await sa.client.req("DELETE", `/api/admin/content/images/${upl.data.upload.id}`, { reason: "Not allowed" })).status, 200);
  assert.ok((await u.client.get("/api/notifications")).data.items.some((n: { title: string }) => n.title === "Content removed by an administrator"));

  // Payment events (recorded when an administrator approves a card payment) are summed per type.
  const ev = (type: string, cents: number) => run("INSERT INTO subscription_events (id,user_id,type,plan,amount_cents,currency,provider_ref,created_at) VALUES (?,?,?,?,?,?,?,?)",
    crypto.randomUUID(), u.user.id, type, "pro", cents, "usd", null, new Date().toISOString());
  await ev("payment", 1900); await ev("payment_failed", 1900); await ev("refund", 500);
  const pay = await sa.client.get("/api/admin/payments");
  const tot = (type: string) => pay.data.totals.find((x: { type: string }) => x.type === type);
  assert.equal(tot("payment").amountCents, 1900);
  assert.equal(tot("payment_failed").count, 1);
  assert.equal(tot("refund").amountCents, 500);

  // Analytics and API monitoring
  await recordApiCall({ provider: "serpapi", operation: "TIMESERIES", ok: false, status: 429, ms: 120, error: "quota" });
  const an = await sa.client.get("/api/admin/analytics");
  assert.equal(an.status, 200);
  assert.ok(an.data.api.some((x: { provider: string; failed: number }) => x.provider === "serpapi" && x.failed >= 1));
  assert.ok(an.data.daily.length >= 30);
  const csv = await sa.client.get("/api/admin/analytics/export?report=daily");
  assert.match(csv.data, /^date,signups,total_users/);
  const dash = await sa.client.get("/api/admin/dashboard");
  assert.ok(dash.data.stats.totalUsers >= 2);
  assert.equal(dash.data.chart.length, 30);
  const logins = await sa.client.get("/api/admin/logins");
  assert.ok(logins.data.items.some((l: { success: boolean }) => l.success));
  assert.equal((await sa.client.get("/api/admin/studio")).status, 200);
  assert.equal((await sa.client.get("/api/admin/forecast")).status, 200);
  const refreshAll = await sa.client.post("/api/admin/forecast/refresh-all", {});
  assert.equal(refreshAll.status, 400); // SerpApi is not connected in tests; the full refresh is covered in the browser test
  assert.equal((await sa.client.get("/api/admin/system")).status, 200);
  assert.equal((await sa.client.get("/api/admin/subscriptions?status=all")).status, 200);
  assert.equal((await sa.client.get("/api/admin/subscriptions/usage")).status, 200);
  const summary = await sa.client.get("/api/admin/usage/summary");
  assert.equal(summary.status, 200);
  assert.equal(summary.data.daily.length, 30);
  assert.equal(summary.data.timezone, "Asia/Tashkent");
  const someUser = (await sa.client.get("/api/admin/users")).data.items[0];
  assert.ok(Array.isArray((await sa.client.get(`/api/admin/users/${someUser.id}`)).data.usageHistory));
  const tzBad = await sa.client.req("PUT", "/api/admin/settings", { defaultTimezone: "Nowhere/City", password: "secret123" });
  assert.equal(tzBad.status, 400);
});
