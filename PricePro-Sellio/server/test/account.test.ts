import "./env.js";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, test } from "node:test";
import { setTrendsProviderForTests, type TrendsProvider } from "../src/modules/forecast/trends.js";
import { baseUrl, closeServer, newUser } from "./helpers.js";

after(() => {
  setTrendsProviderForTests(undefined);
  closeServer();
});

/** A Trends provider with a steady 52-week series, so every analysis completes. */
const steadyTrends: TrendsProvider = {
  name: "fake",
  async interestOverTime() {
    return Array.from({ length: 52 }, (_, i) => ({ date: new Date(Date.UTC(2025, 0, 5) + i * 7 * 86_400_000).toISOString().slice(0, 10), units: 40 + (i % 5) }));
  },
  async interestByCountry() {
    return [];
  },
};
const analyse = (client: { post: (u: string, b?: unknown) => Promise<{ status: number }> }, query: string) =>
  client.post("/api/market", { query, range: "today 12-m", geos: ["WORLD"] });

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
  setTrendsProviderForTests(steadyTrends);
  const { client } = await newUser();
  assert.equal((await analyse(client, "toaster")).status, 201);
  let list = await client.get("/api/notifications");
  const note = list.data.items.find((n: { type: string }) => n.type === "forecast");
  assert.ok(note);
  assert.ok(list.data.unread >= 1);
  assert.equal((await client.post(`/api/notifications/${note.id}/read`)).status, 200);
  list = await client.get("/api/notifications?filter=unread");
  assert.ok(!list.data.items.some((n: { id: string }) => n.id === note.id));
  assert.equal((await client.post(`/api/notifications/${note.id}/unread`)).status, 200);
  assert.equal((await client.del(`/api/notifications/${note.id}`)).status, 200);

  await client.patch("/api/user/settings", { notifications: { forecast: false } });
  const before = (await client.get("/api/notifications")).data.total;
  await analyse(client, "blender");
  assert.equal((await client.get("/api/notifications")).data.total, before, "disabled type creates no notification");

  const other = await newUser();
  const mine = (await client.get("/api/notifications")).data.items[0];
  if (mine) assert.equal((await other.client.post(`/api/notifications/${mine.id}/read`)).status, 404);
});

test("analytics and dashboard only count the user's own activity", async () => {
  const a = await newUser();
  const b = await newUser();
  setTrendsProviderForTests(steadyTrends);
  await analyse(a.client, "lamp");
  await analyse(a.client, "desk");
  const dash = (await a.client.get("/api/dashboard")).data;
  assert.equal(dash.stats.forecastsCompleted, 2);
  assert.equal(dash.stats.priceComparisons, undefined, "price search is gone");
  assert.equal(dash.usage.metrics.priceSearches, undefined);
  assert.equal((await b.client.get("/api/dashboard")).data.stats.forecastsCompleted, 0);
  const s = await a.client.get("/api/analytics/summary");
  assert.equal(s.data.timeline.length, 30);
  const today = s.data.timeline[s.data.timeline.length - 1];
  assert.equal(today.forecast, 2);
  assert.equal(today.prices, undefined);
  assert.equal((await a.client.get("/api/analytics/summary?from=2026-05-01&to=2026-01-01")).status, 400);
  assert.equal((await a.client.post("/api/prices/search", { query: "lamp" })).status, 404, "price search API removed");
});
