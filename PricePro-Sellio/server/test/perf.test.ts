import "./env.js";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { queryCount } from "../src/db/index.js";
import { closeServer, makePng, newUser } from "./helpers.js";

after(() => closeServer());

/** Lists must not run one query per item (each query is a network round trip to Turso). */
test("list endpoints use a fixed number of database queries", async () => {
  const { client } = await newUser();
  for (let i = 0; i < 12; i++) {
    const c = await client.post("/api/campaigns", { name: `C${i}`, objective: "sales", startDate: "2027-01-01", endDate: "2027-01-31", channels: ["instagram"] });
    await client.post(`/api/campaigns/${c.data.campaign.id}/items`, { date: "2027-01-05", channel: "instagram", title: "Post" });
    await client.post(`/api/campaigns/${c.data.campaign.id}/stats`, { date: "2027-01-05", creative: "A", impressions: 100, clicks: 5, conversions: 1, spend: 10 });
    const f = new FormData();
    f.append("file", new Blob([makePng(400, 400)], { type: "image/png" }), "b.png");
    f.append("productName", `P${i}`); f.append("template", "summer"); f.append("format", "post");
    await client.req("POST", "/api/ads/banners", undefined, { form: f });
  }
  const measure = async (url: string) => {
    const before = queryCount();
    const r = await client.get(url);
    assert.equal(r.status, 200, url);
    return queryCount() - before;
  };
  const campaigns = await measure("/api/campaigns");
  const generations = await measure("/api/studio/generations");
  console.log({ campaigns, generations });
  assert.ok(campaigns <= 8, `campaigns list used ${campaigns} queries`);
  assert.ok(generations <= 10, `generations list used ${generations} queries`);
  assert.equal((await client.get("/api/studio/generations")).data.items.length, 12);
  assert.equal((await client.get("/api/campaigns")).data.items[0].progress.itemsTotal, 1);
});

test("daily cron warm-up is hidden without the secret and refreshes shared data with it", async () => {
  const { config } = await import("../src/config.js");
  const { setTrendsProviderForTests } = await import("../src/modules/forecast/trends.js");
  const { baseUrl } = await import("./helpers.js");
  setTrendsProviderForTests(null);
  (config as { CRON_SECRET?: string }).CRON_SECRET = undefined;
  assert.equal((await fetch(`${baseUrl}/api/cron/warm`)).status, 404);
  (config as { CRON_SECRET?: string }).CRON_SECRET = "s3cret";
  try {
    assert.equal((await fetch(`${baseUrl}/api/cron/warm`, { headers: { authorization: "Bearer wrong" } })).status, 404);
    const ok = await fetch(`${baseUrl}/api/cron/warm`, { headers: { authorization: "Bearer s3cret" } });
    assert.equal(ok.status, 200);
    const body = await ok.json() as { radar: string };
    assert.equal(body.radar, "not configured");
  } finally {
    (config as { CRON_SECRET?: string }).CRON_SECRET = undefined;
    setTrendsProviderForTests(undefined);
  }
});
