import "./env.js";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { config } from "../src/config.js";
import { get, run } from "../src/db/index.js";
import { reserveRequest } from "../src/services/quota.js";
import { closeServer, fileForm, makePng, newUser } from "./helpers.js";

const cfg = config as unknown as { SUPER_ADMIN_EMAILS: string[] };
after(() => {
  cfg.SUPER_ADMIN_EMAILS = [];
  closeServer();
});

type U = Awaited<ReturnType<typeof newUser>>;
async function superAdmin() {
  const u = await newUser();
  cfg.SUPER_ADMIN_EMAILS = [...cfg.SUPER_ADMIN_EMAILS, u.email.toLowerCase()];
  return u;
}
async function withRole(role: "admin" | "moderator") {
  const u = await newUser();
  await run("INSERT INTO admin_roles (user_id, role, created_at, updated_at) VALUES (?,?,?,?)", u.user.id, role, new Date().toISOString(), new Date().toISOString());
  return u;
}
const pdf = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n");
const uploadReceipt = (u: U, id: string, data: Buffer = makePng(300, 500), name = "chek.png", type = "image/png") =>
  u.client.req("POST", `/api/payments/${id}/receipt`, undefined, { form: fileForm("file", data, name, type) });
const plan = async (u: U) => (await u.client.get("/api/auth/me")).data.user.plan;

/** User side up to "To'lovni tasdiqlash": returns the request id. */
async function payAndSubmit(u: U, body: { plan: "pro" | "max"; interval?: "month" | "year" } = { plan: "pro" }) {
  const r = await u.client.post("/api/payments", body);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal((await uploadReceipt(u, r.data.payment.id)).status, 200);
  const s = await u.client.post(`/api/payments/${r.data.payment.id}/submit`, {});
  assert.equal(s.status, 200, JSON.stringify(s.data));
  return r.data.payment.id as string;
}

test("user flow: request, receipt checks, submit — the plan never changes before an admin approves", async () => {
  const u = await newUser();
  const cfgRes = await u.client.get("/api/payments/config");
  assert.equal(cfgRes.data.card.number, "4466136951534453");
  assert.equal(cfgRes.data.card.bank, "TBC Bank");
  const pro = cfgRes.data.plans.find((p: { key: string }) => p.key === "pro");
  assert.deepEqual(pro.month, { usd: 19, uzs: 240000 });

  const r = await u.client.post("/api/payments", { plan: "pro", interval: "month" });
  assert.equal(r.status, 201);
  assert.equal(r.data.payment.status, "pending");
  assert.equal(r.data.payment.amountUzs, 240000);
  const id = r.data.payment.id;
  const proYear = await u.client.post("/api/payments", { plan: "pro", interval: "year" });
  assert.equal(proYear.data.payment.amountUzs, 2394000, "Pro yearly: $190");
  // A receipt uploaded for one amount is dropped when the plan or period changes.
  assert.equal((await uploadReceipt(u, id)).status, 200);
  // Switching plan before sending keeps one open request.
  const sw = await u.client.post("/api/payments", { plan: "max", interval: "year" });
  assert.equal(sw.data.payment.id, id);
  assert.equal(sw.data.payment.amountUzs, 2520000);
  assert.equal(sw.data.payment.receipt, null, "receipt for the old amount removed");

  assert.equal((await u.client.post(`/api/payments/${id}/submit`, {})).status, 400, "receipt required");
  assert.equal((await uploadReceipt(u, id, Buffer.from("this is not a receipt file at all!!"), "x.png")).status, 400);
  assert.equal((await uploadReceipt(u, id, pdf, "chek.pdf", "application/pdf")).status, 200);
  assert.equal((await uploadReceipt(u, id)).status, 200, "the receipt can be replaced before sending");

  const sent = await u.client.post(`/api/payments/${id}/submit`, {});
  assert.equal(sent.status, 200);
  assert.equal(sent.data.payment.submitted, true);
  assert.equal((await u.client.post(`/api/payments/${id}/submit`, {})).status, 200, "double click is harmless");
  assert.equal(await plan(u), "free", "NOT activated by the user's confirmation");
  assert.equal((await u.client.get("/api/subscription")).data.usage.metrics.requests.limit, 2);
  assert.equal((await uploadReceipt(u, id)).status, 400, "locked while being checked");
  assert.equal((await u.client.del(`/api/payments/${id}`)).status, 400);
  assert.equal((await u.client.post("/api/payments", { plan: "pro" })).status, 409, "one payment at a time");

  // Receipts: owner yes, other users no.
  assert.equal((await u.client.req("GET", `/api/payments/${id}/receipt`, undefined, { raw: true })).status, 200);
  const other = await newUser();
  assert.equal((await other.client.req("GET", `/api/payments/${id}/receipt`, undefined, { raw: true })).status, 404);
});

test("only authorised admins review; no self-approval; approval activates the plan exactly once", async () => {
  const u = await newUser();
  const id = await payAndSubmit(u, { plan: "pro" });
  const moderator = await withRole("moderator");
  assert.equal((await u.client.post(`/api/admin/payment-requests/${id}/approve`, { password: "secret123" })).status, 403, "users cannot approve");
  assert.equal((await moderator.client.get("/api/admin/payment-requests")).status, 403);
  assert.equal((await moderator.client.post(`/api/admin/payment-requests/${id}/approve`, { password: "secret123" })).status, 403);
  assert.equal((await moderator.client.req("GET", `/api/admin/payment-requests/${id}/receipt`, undefined, { raw: true })).status, 403);

  const admin = await withRole("admin");
  const list = await admin.client.get("/api/admin/payment-requests");
  const item = list.data.items.find((p: { id: string }) => p.id === id);
  assert.equal(item.user.email, u.email);
  assert.equal(item.amountUzs, 240000);
  assert.equal((await admin.client.req("GET", `/api/admin/payment-requests/${id}/receipt`, undefined, { raw: true })).status, 200);
  assert.equal((await admin.client.post(`/api/admin/payment-requests/${id}/approve`, { password: "wrong" })).status, 400);
  assert.equal(await plan(u), "free");

  // Two administrators press "Tasdiqlash" at the same moment: exactly one wins.
  const sa = await superAdmin();
  const results = await Promise.all([
    admin.client.post(`/api/admin/payment-requests/${id}/approve`, { password: "secret123" }),
    sa.client.post(`/api/admin/payment-requests/${id}/approve`, { password: "secret123" }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(await plan(u), "pro");
  const sub = (await u.client.get("/api/subscription")).data;
  assert.equal(sub.usage.metrics.requests.limit, 10);
  assert.equal(sub.usage.metrics.requests.period, "day");
  assert.equal(sub.subscription.provider, "manual");
  const days = (Date.parse(sub.subscription.currentPeriodEnd) - Date.now()) / 86_400_000;
  assert.ok(days > 27 && days < 32, `about one month (${days})`);
  assert.ok(sub.history.some((h: { type: string; amountCents: number; currency: string }) => h.type === "payment" && h.amountCents === 24000000 && h.currency === "uzs"));
  assert.equal((await admin.client.post(`/api/admin/payment-requests/${id}/reject`, { reason: "x" })).status, 409, "cannot reject an approved payment");
  const audit = await get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'payment.approved' AND target_id = ?", id);
  assert.equal(audit!.n, 1);
  const row = await get<{ reviewed_by: string }>("SELECT reviewed_by FROM payment_requests WHERE id = ?", id);
  assert.ok([admin.user.id, sa.user.id].includes(row!.reviewed_by), "approver recorded");

  // An administrator cannot approve their own payment.
  const ownId = await payAndSubmit(admin, { plan: "max" });
  assert.equal((await admin.client.post(`/api/admin/payment-requests/${ownId}/approve`, { password: "secret123" })).status, 403);
  assert.equal(await plan(admin), "free");
});

test("rejection keeps the plan, shows the reason, and the user can send a new receipt", async () => {
  const u = await newUser();
  const admin = await withRole("admin");
  const id = await payAndSubmit(u, { plan: "max", interval: "year" });
  const rej = await admin.client.post(`/api/admin/payment-requests/${id}/reject`, { reason: "Summa noto'g'ri" });
  assert.equal(rej.status, 200);
  assert.equal(await plan(u), "free");
  const hist = (await u.client.get("/api/payments")).data;
  assert.equal(hist.items[0].status, "rejected");
  assert.equal(hist.items[0].rejectReason, "Summa noto'g'ri");
  assert.equal(hist.open, null);
  assert.equal((await admin.client.post(`/api/admin/payment-requests/${id}/approve`, { password: "secret123" })).status, 409, "a rejected payment cannot be approved later");

  const again = await payAndSubmit(u, { plan: "max", interval: "year" });
  assert.notEqual(again, id);
  assert.equal((await admin.client.post(`/api/admin/payment-requests/${again}/approve`, { password: "secret123" })).status, 200);
  assert.equal(await plan(u), "max");
  const sub = (await u.client.get("/api/subscription")).data;
  assert.equal(sub.usage.metrics.requests.limit, 20);
  const days = (Date.parse(sub.subscription.currentPeriodEnd) - Date.now()) / 86_400_000;
  assert.ok(days > 360 && days < 370, "one year");
});

test("a card-paid plan ends at its period end and the user returns to Free", async () => {
  const u = await newUser();
  const admin = await withRole("admin");
  const id = await payAndSubmit(u, { plan: "pro" });
  await admin.client.post(`/api/admin/payment-requests/${id}/approve`, { password: "secret123" });
  assert.equal(await plan(u), "pro");
  await run("UPDATE subscriptions SET current_period_end = ? WHERE user_id = ?", new Date(Date.now() - 60_000).toISOString(), u.user.id);
  assert.equal(await plan(u), "free");
  assert.equal((await u.client.get("/api/subscription")).data.usage.metrics.requests.limit, 2);
});

test("FREE: at most 2 AI advertisement images per day, renewed every day", async () => {
  const u = await newUser();
  await reserveRequest(u.user.id, "generation", `img-${u.user.id}-1`);
  await reserveRequest(u.user.id, "generation", `img-${u.user.id}-2`);
  await assert.rejects(reserveRequest(u.user.id, "generation", `img-${u.user.id}-3`), (e: { code?: string }) => e.code === "LIMIT_REACHED");
  const s = (await u.client.get("/api/dashboard")).data.usage.metrics.requests;
  assert.deepEqual([s.period, s.used, s.limit, s.imagesToday.used, s.imagesToday.limit, s.imagesToday.remaining], ["day", 2, 2, 2, 2, 0]);
});
