import "./env.js";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { config, features } from "../src/config.js";
import { cleanCopy } from "../src/modules/ads/routes.js";
import { metrics } from "../src/modules/campaigns/routes.js";
import { setTrendsProviderForTests } from "../src/modules/forecast/trends.js";
import { setLlmFetchForTests } from "../src/services/llm.js";
import { closeServer, makePng, newUser } from "./helpers.js";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const gemini = (obj: unknown) => json({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
const enableAi = (provider: "gemini" | "openai" = "gemini") => {
  const c = config as { GEMINI_API_KEY?: string; OPENAI_API_KEY?: string; LLM_PROVIDER?: string };
  if (provider === "gemini") c.GEMINI_API_KEY = "g-key"; else c.OPENAI_API_KEY = "o-key";
  c.LLM_PROVIDER = provider;
  features.llm = true;
};
const disableAi = () => {
  const c = config as { GEMINI_API_KEY?: string; OPENAI_API_KEY?: string; LLM_PROVIDER?: string };
  c.GEMINI_API_KEY = undefined; c.OPENAI_API_KEY = undefined; c.LLM_PROVIDER = undefined;
  features.llm = false;
  setLlmFetchForTests(null);
};
after(() => { disableAi(); setTrendsProviderForTests(undefined); closeServer(); });

const pngForm = (fields: Record<string, string>, w = 600, h = 600) => {
  const f = new FormData();
  f.append("file", new Blob([makePng(w, h)], { type: "image/png" }), "ad.png");
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};

test("brand kit: validated, private, logo must be the user's own file", async () => {
  const a = await newUser(), b = await newUser();
  assert.equal((await a.client.get("/api/ads/brand")).data.brand, null);
  assert.equal((await a.client.req("PUT", "/api/ads/brand", { primaryColor: "blue" })).status, 400);
  const up = await a.client.req("POST", "/api/studio/uploads", undefined, { form: pngForm({}) });
  assert.equal(up.status, 201);
  assert.equal((await b.client.req("PUT", "/api/ads/brand", { logoUploadId: up.data.upload.id })).status, 404);
  const ok = await a.client.req("PUT", "/api/ads/brand", { businessName: "Choyxona", primaryColor: "#1F5BE0", headingFont: "Montserrat", tone: "friendly", logoUploadId: up.data.upload.id });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.brand.logoUrl, `/api/files/${up.data.upload.id}`);
  assert.equal((await b.client.get("/api/ads/brand")).data.brand, null);
});

test("ad copy: refused without AI; Google limits enforced; counted as AI request", async () => {
  assert.deepEqual(cleanCopy({ google: { headlines: ["Short one", "x".repeat(31)], descriptions: ["ok", "y".repeat(91)] } }, ["google"]).google, { headlines: ["Short one"], descriptions: ["ok"] });
  const { client } = await newUser();
  const body = { product: "Green tea", language: "uz", platforms: ["instagram", "google", "telegram"] };
  const no = await client.post("/api/ads/copy", body);
  assert.equal(no.status, 503);
  enableAi();
  let prompt = "";
  setLlmFetchForTests((async (_u: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body));
    prompt = b.systemInstruction.parts[0].text;
    assert.equal(b.generationConfig.responseMimeType, "application/json");
    return gemini({ headlines: ["Yashil choy"], descriptions: ["Tabiiy choy."], promos: ["Yangi hosil"], ctas: ["Buyurtma bering"], instagram: { caption: "Choy", hashtags: ["choy"] }, telegram: { post: "Post" }, google: { headlines: ["Yashil choy", "z".repeat(40)], descriptions: ["Tabiiy"] } });
  }) as unknown as typeof fetch);
  try {
    const r = await client.post("/api/ads/copy", body);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.match(prompt, /Uzbek/);
    assert.match(prompt, /Never invent discounts/);
    assert.deepEqual(r.data.copy.result.google.headlines, ["Yashil choy"]);
    assert.deepEqual(r.data.copy.result.instagram.hashtags, ["#choy"]);
    assert.equal(r.data.copy.result.facebook, undefined);
    assert.equal((await client.get("/api/ads/copy")).data.items.length, 1);
    assert.equal((await client.get("/api/dashboard")).data.usage.metrics.ai.used, 1);
  } finally { disableAi(); }
});

test("AI review sends the image to the vision model (OpenAI format) and clamps scores", async () => {
  const { client } = await newUser();
  enableAi("openai");
  let content: unknown;
  setLlmFetchForTests((async (url: string, init: RequestInit) => {
    assert.match(url, /chat\/completions$/);
    content = JSON.parse(String(init.body)).messages[1].content;
    return json({ choices: [{ message: { content: JSON.stringify({ summary: "Clear.", scores: { visualQuality: 140, readability: 70, composition: "x" }, strengths: ["Big product"], improvements: ["Larger price"] }) } }] });
  }) as unknown as typeof fetch);
  try {
    const r = await client.req("POST", "/api/ads/review", undefined, { form: pngForm({ platform: "instagram" }) });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.review.scores.visualQuality, 100);
    assert.equal(r.data.review.scores.composition, 0);
    const parts = content as { type: string; image_url?: { url: string } }[];
    assert.equal(parts[0].type, "image_url");
    assert.match(parts[0].image_url!.url, /^data:image\/png;base64,/);
    const bad = new FormData();
    bad.append("file", new Blob([Buffer.from("not an image")], { type: "image/png" }), "x.png");
    assert.equal((await client.req("POST", "/api/ads/review", undefined, { form: bad })).status, 400);
  } finally { disableAi(); }
});

test("competitor ads: text or screenshot required; the screenshot is not stored", async () => {
  const { client } = await newUser();
  enableAi();
  setLlmFetchForTests((async () => gemini({ style: "Bright", messages: ["Cheap"], offers: ["-20%"], differentiation: ["Show quality"], strengths: [], weaknesses: [] })) as unknown as typeof fetch);
  try {
    const none = new FormData();
    none.append("competitorName", "Shop A");
    assert.equal((await client.req("POST", "/api/ads/competitor-ads", undefined, { form: none })).status, 400);
    const r = await client.req("POST", "/api/ads/competitor-ads", undefined, { form: pngForm({ competitorName: "Shop A", adText: "Arzon narx!" }) });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.item.hadImage, true);
    assert.deepEqual(r.data.item.analysis.differentiation, ["Show quality"]);
    const uploads = await client.get("/api/user/uploads");
    assert.equal(uploads.status, 200);
    assert.equal(uploads.data.uploads.length, 0);
  } finally { disableAi(); }
});

test("template banners are saved like ads but do not use the AI image limit", async () => {
  const { client } = await newUser();
  const r = await client.req("POST", "/api/ads/banners", undefined, { form: pngForm({ productName: "Choy", template: "bold-sale", format: "post" }, 1080, 1080) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const g = r.data.generation;
  assert.equal(g.status, "succeeded");
  assert.equal(g.provider, "vendora-templates");
  assert.equal(g.styleLabel, "Banner template");
  assert.ok(g.resultUrl);
  const file = await client.req("GET", g.resultUrl, undefined, { raw: true });
  assert.equal(file.status, 200);
  assert.equal((await client.get("/api/dashboard")).data.usage.metrics.requests.used, 0);
  const list = await client.get("/api/studio/generations");
  assert.ok(JSON.stringify(list.data).includes(g.id));
  const other = await newUser();
  assert.equal((await other.client.req("POST", "/api/ads/banners", undefined, { form: pngForm({ productName: "x", template: "t", format: "post", productUploadId: g.uploadId }) })).status, 404);
});

test("campaign metrics never guess missing values", () => {
  assert.deepEqual(metrics([{ impressions: 1000, clicks: 50, conversions: 5, spend: 100, revenue: null }]), { impressions: 1000, clicks: 50, conversions: 5, spend: 100, revenue: null, ctrPct: 5, conversionRatePct: 10, cpc: 2, cpa: 20, roas: null });
  assert.equal(metrics([{ impressions: 0, clicks: 0, conversions: 0, spend: 10, revenue: 30 }]).cpa, null);
});

test("campaigns: planner, AI plan within dates and channels, results with CPA / ROAS", async () => {
  const a = await newUser(), b = await newUser();
  const base = { name: "Navruz", objective: "sales", budget: 1_000_000, startDate: "2027-03-01", endDate: "2027-03-21", channels: ["instagram", "telegram"] };
  assert.equal((await a.client.post("/api/campaigns", { ...base, endDate: "2027-02-01" })).status, 400);
  const c = await a.client.post("/api/campaigns", base);
  assert.equal(c.status, 201, JSON.stringify(c.data));
  const id = c.data.campaign.id;
  assert.equal((await b.client.get(`/api/campaigns/${id}`)).status, 404);
  const it = await a.client.post(`/api/campaigns/${id}/items`, { date: "2027-03-05", channel: "telegram", title: "Post" });
  assert.equal(it.status, 201);
  const itemId = it.data.campaign.items[0].id;
  const done = await a.client.patch(`/api/campaigns/${id}/items/${itemId}`, { status: "done" });
  assert.equal(done.data.campaign.progress.itemsDone, 1);

  assert.equal((await a.client.post(`/api/campaigns/${id}/plan`, {})).status, 503);
  enableAi();
  setTrendsProviderForTests(null);
  setLlmFetchForTests((async () => gemini({
    summary: "Plan", objectives: ["100 orders"], budgetSplit: [{ channel: "instagram", pct: 60 }, { channel: "telegram", pct: 20 }, { channel: "tiktok", pct: 20 }],
    items: [{ date: "2027-03-02", channel: "instagram", title: "Teaser" }, { date: "2027-04-02", channel: "instagram", title: "Too late" }, { date: "2027-03-03", channel: "tiktok", title: "Wrong channel" }, { date: "2027-03-08", channel: "telegram", title: "8 March" }],
  })) as unknown as typeof fetch);
  try {
    const p = await a.client.post(`/api/campaigns/${id}/plan`, {});
    assert.equal(p.status, 200, JSON.stringify(p.data));
    assert.equal(p.data.added, 2);
    assert.deepEqual(p.data.campaign.plan.budgetSplit.map((x: { channel: string; pct: number; amount: number }) => [x.channel, x.pct, x.amount]), [["instagram", 75, 750000], ["telegram", 25, 250000]]);
    assert.equal(p.data.campaign.items.length, 3);
    const again = await a.client.post(`/api/campaigns/${id}/plan`, {});
    assert.equal(again.data.campaign.items.length, 3, "AI items are replaced, manual ones kept");
  } finally { disableAi(); }

  assert.equal((await a.client.post(`/api/campaigns/${id}/stats`, { date: "2027-03-02", creative: "A", impressions: 10, clicks: 20, conversions: 0, spend: 5 })).status, 400);
  const st = await a.client.post(`/api/campaigns/${id}/stats`, { rows: [
    { date: "2027-03-02", creative: "Banner A", channel: "instagram", impressions: 10000, clicks: 200, conversions: 10, spend: 200000, revenue: 900000 },
    { date: "2027-03-03", creative: "Banner B", channel: "instagram", impressions: 8000, clicks: 80, conversions: 2, spend: 150000, revenue: 120000 },
  ] });
  assert.equal(st.status, 201, JSON.stringify(st.data));
  const camp = st.data.campaign;
  assert.equal(camp.totals.cpa, 29166.67);
  assert.equal(camp.totals.roas, 2.91);
  assert.equal(camp.progress.budgetUsedPct, 35);
  const A = camp.byCreative.find((x: { creative: string }) => x.creative === "Banner A");
  assert.equal(A.ctrPct, 2);
  assert.equal(A.roas, 4.5);
  assert.equal((await a.client.del(`/api/campaigns/${id}`)).status, 200);
  assert.equal((await a.client.get("/api/campaigns")).data.items.length, 0);
});
