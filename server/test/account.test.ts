import "./env.js";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, test } from "node:test";
import { setPriceProvidersForTests } from "../src/modules/prices/providers.js";
import { baseUrl, closeServer, newUser } from "./helpers.js";

after(() => {
  setPriceProvidersForTests(null);
  closeServer();
});

function signedWebhook(event: unknown, secret = "whsec_test_secret") {
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": `t=${t},v1=${sig}` },
    body,
  });
}

test("checkout is refused when payments are not configured (no fake upgrade)", async () => {
  const { client } = await newUser();
  const r = await client.post("/api/subscription/checkout");
  assert.equal(r.status, 503);
  assert.equal((await client.get("/api/subscription")).data.plan, "free");
});

test("plan changes only through a correctly signed Stripe webhook, idempotently", async () => {
  const { client, user } = await newUser();
  const event = {
    id: `evt_${crypto.randomUUID()}`, type: "checkout.session.completed",
    data: { object: { id: "cs_1", mode: "subscription", payment_status: "paid", client_reference_id: user.id, customer: "cus_1", subscription: "sub_1", amount_total: 1900, currency: "usd" } },
  };
  const forged = await signedWebhook(event, "wrong_secret");
  assert.equal(forged.status, 400);
  assert.equal((await client.get("/api/subscription")).data.plan, "free");

  assert.equal((await signedWebhook(event)).status, 200);
  const dup = await signedWebhook(event);
  assert.equal((await dup.json()).duplicate, true);
  const sub = await client.get("/api/subscription");
  assert.equal(sub.data.plan, "pro");
  assert.equal(sub.data.usage.metrics.generations.limit, 200);
  assert.equal(sub.data.history.filter((h: { type: string }) => h.type === "upgraded").length, 1);

  const cancel = { id: `evt_${crypto.randomUUID()}`, type: "customer.subscription.deleted", data: { object: { id: "sub_1", customer: "cus_1" } } };
  assert.equal((await signedWebhook(cancel)).status, 200);
  assert.equal((await client.get("/api/subscription")).data.plan, "free");
});

test("notifications: list, read/unread, delete, and respect preferences", async () => {
  setPriceProvidersForTests([{ name: "p", label: "P", search: async () => [] }]);
  const { client } = await newUser();
  await client.post("/api/prices/search", { query: "toaster" });
  let list = await client.get("/api/notifications");
  const priceNote = list.data.items.find((n: { type: string }) => n.type === "price");
  assert.ok(priceNote);
  assert.ok(list.data.unread >= 1);
  assert.equal((await client.post(`/api/notifications/${priceNote.id}/read`)).status, 200);
  list = await client.get("/api/notifications?filter=unread");
  assert.ok(!list.data.items.some((n: { id: string }) => n.id === priceNote.id));
  assert.equal((await client.post(`/api/notifications/${priceNote.id}/unread`)).status, 200);
  assert.equal((await client.del(`/api/notifications/${priceNote.id}`)).status, 200);

  await client.patch("/api/user/settings", { notifications: { price: false } });
  const before = (await client.get("/api/notifications")).data.total;
  await client.post("/api/prices/search", { query: "blender" });
  assert.equal((await client.get("/api/notifications")).data.total, before, "disabled type creates no notification");

  const other = await newUser();
  const mine = (await client.get("/api/notifications")).data.items[0];
  if (mine) assert.equal((await other.client.post(`/api/notifications/${mine.id}/read`)).status, 404);
});

test("analytics and dashboard only count the user's own activity", async () => {
  const a = await newUser();
  const b = await newUser();
  setPriceProvidersForTests([{ name: "p", label: "P", search: async () => [] }]);
  await a.client.post("/api/prices/search", { query: "lamp" });
  await a.client.post("/api/prices/search", { query: "desk" });
  assert.equal((await a.client.get("/api/dashboard")).data.stats.priceComparisons, 2);
  assert.equal((await b.client.get("/api/dashboard")).data.stats.priceComparisons, 0);
  const s = await a.client.get("/api/analytics/summary");
  assert.equal(s.data.timeline.length, 30);
  const today = s.data.timeline[s.data.timeline.length - 1];
  assert.equal(today.prices, 2);
  assert.equal((await a.client.get("/api/analytics/summary?from=2026-05-01&to=2026-01-01")).status, 400);
});
