import "./env.js";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { config, features } from "../src/config.js";
import { metrics } from "../src/modules/campaigns/metrics.js";
import { setLlmFetchForTests } from "../src/services/llm.js";
import { run } from "../src/db/index.js";
import { closeServer, makePng, newUser } from "./helpers.js";

after(() => { features.llm = false; (config as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = undefined; setLlmFetchForTests(null); closeServer(); });

test("ROAS ignores spend of rows without revenue", () => {
  assert.equal(metrics([{ impressions: 0, clicks: 0, conversions: 0, spend: 100, revenue: 300 }, { impressions: 0, clicks: 0, conversions: 0, spend: 100, revenue: null }]).roas, 3);
});

test("template banners cannot be retried with AI; partial item update keeps status", async () => {
  const { client } = await newUser();
  const up = new FormData(); up.append("file", new Blob([makePng(600, 600)], { type: "image/png" }), "p.png");
  const product = await client.req("POST", "/api/studio/uploads", undefined, { form: up });
  const f = new FormData();
  f.append("file", new Blob([makePng(1080, 1080)], { type: "image/png" }), "b.png");
  f.append("productName", "Tea"); f.append("template", "summer"); f.append("format", "post"); f.append("productUploadId", product.data.upload.id);
  const b = await client.req("POST", "/api/ads/banners", undefined, { form: f });
  assert.equal((await client.post(`/api/studio/generations/${b.data.generation.id}/retry`, {})).status, 400);
  const c = await client.post("/api/campaigns", { name: "C", objective: "sales", startDate: "2027-01-01", endDate: "2027-01-31", channels: ["instagram"] });
  const it = await client.post(`/api/campaigns/${c.data.campaign.id}/items`, { date: "2027-01-02", channel: "instagram", title: "Post", status: "done" });
  const itemId = it.data.campaign.items[0].id;
  const p = await client.patch(`/api/campaigns/${c.data.campaign.id}/items/${itemId}`, { title: "New title" });
  assert.equal(p.data.campaign.items[0].status, "done");
  assert.equal(p.data.campaign.items[0].title, "New title");
});

test("indicators are validated; AI text requests count against the plan", async () => {
  const { client } = await newUser();
  assert.equal((await client.get("/api/intel/stats?countries=UZ&indicators=constructor,__proto__")).status, 400);
  (config as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = "k"; features.llm = true;
  let body: { generationConfig: { thinkingConfig?: { thinkingBudget: number } } } | null = null;
  setLlmFetchForTests((async (_u: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    const copy = { headlines: ["Tea"], descriptions: ["Fresh."], promos: ["New"], ctas: ["Buy"], instagram: { caption: "c", hashtags: ["t"] }, telegram: { post: "p" }, google: { headlines: ["Tea"], descriptions: ["Fresh"] } };
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(copy) }] } }] }), { headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch);
  const r = await client.post("/api/ads/copy", { product: "Tea", language: "en", platforms: ["instagram"] });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(body!.generationConfig.thinkingConfig, undefined); // default model: room for thinking instead
  assert.ok((body!.generationConfig as unknown as { maxOutputTokens: number }).maxOutputTokens > 6000);
  assert.equal((await client.get("/api/dashboard")).data.usage.metrics.ai.used, 1);
});
