import "./env.js";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { config, features } from "../src/config.js";
import { analyseBusiness, normalizeDate } from "../src/modules/business/analysis.js";
import { metrics } from "../src/modules/campaigns/metrics.js";
import { setLlmFetchForTests } from "../src/services/llm.js";
import { run } from "../src/db/index.js";
import { closeServer, makePng, newUser } from "./helpers.js";

after(() => { features.llm = false; (config as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = undefined; setLlmFetchForTests(null); closeServer(); });

test("impossible years are rejected and never hang the analysis", async () => {
  assert.equal(normalizeDate("9999-12-31"), null);
  assert.equal(normalizeDate("0001-01-01"), null);
  assert.equal(normalizeDate("31.12.9999"), null);
  const started = Date.now();
  const a = analyseBusiness([{ date: "9999-12-31", revenue: 1 }, { date: "2025-01-01", revenue: 5 }, { date: "0050-03-01", revenue: 2 }]);
  assert.ok(Date.now() - started < 1000);
  assert.equal(a.rows, 1);
  const { client, user } = await newUser();
  assert.equal((await client.post("/api/business/datasets", { name: "x", source: "csv", rows: [{ date: "9999-12-31", revenue: 1 }] })).status, 400);
  // A dataset saved earlier with a bad row still opens.
  const ok = await client.post("/api/business/datasets", { name: "y", source: "csv", rows: [{ date: "2025-01-01", revenue: 1 }] });
  await run("UPDATE business_datasets SET rows_json = ? WHERE id = ?", JSON.stringify([{ date: "9999-12-31", revenue: 1 }, { date: "2025-01-01", revenue: 1 }]), ok.data.dataset.id);
  assert.equal((await client.get(`/api/business/datasets/${ok.data.dataset.id}`)).status, 200);
  void user;
});

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

test("indicators are validated; reports count the AI summary against the plan", async () => {
  const { client } = await newUser();
  assert.equal((await client.get("/api/intel/stats?countries=UZ&indicators=constructor,__proto__")).status, 400);
  await client.post("/api/business/datasets", { name: "s", source: "manual", rows: [{ date: "2025-01", revenue: 10 }, { date: "2025-02", revenue: 12 }] });
  (config as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = "k"; features.llm = true;
  let body: { generationConfig: { thinkingConfig?: { thinkingBudget: number } } } | null = null;
  setLlmFetchForTests((async (_u: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "- ok" }] } }] }), { headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch);
  const r = await client.post("/api/business/reports", { period: "month" });
  assert.equal(r.data.report.content.summary, "- ok");
  assert.equal(body!.generationConfig.thinkingConfig, undefined); // default model: room for thinking instead
  assert.ok((body!.generationConfig as unknown as { maxOutputTokens: number }).maxOutputTokens > 6000);
  assert.equal((await client.get("/api/dashboard")).data.usage.metrics.ai.used, 1);
});

test("a growth campaign never ends before it starts", async () => {
  const { client, user } = await newUser();
  const g = await client.post("/api/growth", { source: "manual", product: "Fans" });
  const id = g.data.initiative.id;
  // Evidence saved months ago with a peak that is already over.
  await run("UPDATE initiatives SET evidence_json = ?, direction_json = ? WHERE id = ?",
    JSON.stringify({ kind: "opportunity", nextPeak: { date: "2020-05-01", months: 2 } }),
    JSON.stringify({ title: "Summer", audience: "", message: "", channels: ["instagram"], offer: "", why: "" }), id);
  const c = await client.post(`/api/growth/${id}/campaign`, {});
  assert.equal(c.status, 201, JSON.stringify(c.data));
  const camp = (await client.get(`/api/campaigns/${c.data.campaignId}`)).data.campaign;
  assert.ok(camp.endDate > camp.startDate, `${camp.startDate} → ${camp.endDate}`);
  void user;
});
