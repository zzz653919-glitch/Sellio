import "./env.js";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { config, features } from "../src/config.js";
import { setTrendsProviderForTests, type TrendsProvider } from "../src/modules/forecast/trends.js";
import { setLlmFetchForTests } from "../src/services/llm.js";
import { closeServer, makePng, newUser } from "./helpers.js";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const gemini = (obj: unknown) => json({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
const ai = (on: boolean) => {
  (config as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = on ? "k" : undefined;
  features.llm = on;
  if (!on) setLlmFetchForTests(null);
};
after(() => { ai(false); setTrendsProviderForTests(undefined); closeServer(); });

const weeks = (n: number, f: (i: number) => number) => {
  const end = Date.now();
  return Array.from({ length: n }, (_, i) => ({ date: new Date(end - (n - 1 - i) * 7 * 86_400_000).toISOString().slice(0, 10), units: Math.max(0, Math.round(f(i))) }));
};
const provider: TrendsProvider = {
  name: "fake",
  async interestOverTime(q) { return q === "вентилятор" ? weeks(260, (i) => 20 + i * 0.3) : weeks(260, (i) => 50 + ((i * 7) % 5)); },
  async interestByCountry() { return []; },
};

test("growth workflow: opportunity → AI directions → ads → campaign → results → learnings", async () => {
  setTrendsProviderForTests(provider);
  const { client } = await newUser();
  const other = await newUser();

  assert.equal((await client.post("/api/growth", { source: "opportunity", product: "X", query: "nothing" })).status, 400);
  const c = await client.post("/api/growth", { source: "opportunity", product: "Fans", query: "вентилятор" });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  const id = c.data.initiative.id;
  assert.equal(c.data.initiative.evidence.kind, "opportunity");
  assert.ok(c.data.initiative.evidence.yoyPct > 0, "evidence comes from the server's own data");
  assert.equal(c.data.initiative.nextStep, "explain");
  assert.equal((await other.client.get(`/api/growth/${id}`)).status, 404);

  // Step 2: refused without AI, then explained with AI (channels outside the list are dropped).
  assert.equal((await client.post(`/api/growth/${id}/explain`, {})).status, 503);
  ai(true);
  let prompt = "";
  setLlmFetchForTests((async (_u: string, init: RequestInit) => {
    prompt = JSON.parse(String(init.body)).systemInstruction.parts[0].text;
    return gemini({ explanation: "Fans grow every year.", fit: "Fits.", risks: ["Competition"], directions: [
      { title: "Summer comfort", audience: "Families", message: "Cool home", channels: ["instagram", "telegram", "billboard"], offer: "Free delivery", why: "Season" },
      { title: "Office", audience: "Offices", message: "Quiet fans", channels: ["facebook"], offer: "", why: "" },
      { title: "Gift", audience: "Young", message: "Gift", channels: ["tiktok"], offer: "", why: "" },
    ] });
  }) as unknown as typeof fetch);
  try {
    const e = await client.post(`/api/growth/${id}/explain`, {});
    assert.equal(e.status, 200, JSON.stringify(e.data));
    assert.match(prompt, /Google Trends/);
    assert.deepEqual(e.data.initiative.directions[0].channels, ["instagram", "telegram"]);
    assert.match(e.data.initiative.explanation, /Competition/);

    // Step 3
    assert.equal((await client.post(`/api/growth/${id}/direction`, {})).status, 400);
    const d = await client.post(`/api/growth/${id}/direction`, { index: 0 });
    assert.equal(d.data.initiative.direction.title, "Summer comfort");
    assert.equal(d.data.initiative.nextStep, "assets");

    // Step 4: ad copy and a banner are attached to the plan; a foreign plan id is refused.
    setLlmFetchForTests((async () => gemini({ headlines: ["Salqin uy"], descriptions: ["d"], promos: [], ctas: ["Oling"] })) as unknown as typeof fetch);
    assert.equal((await other.client.post("/api/ads/copy", { product: "Fans", language: "en", platforms: ["instagram"], initiativeId: id })).status, 404);
    const cp = await client.post("/api/ads/copy", { product: "Fans", language: "en", platforms: ["instagram"], initiativeId: id });
    assert.equal(cp.status, 201, JSON.stringify(cp.data));
  } finally { ai(false); }
  const f = new FormData();
  f.append("file", new Blob([makePng(1080, 1080)], { type: "image/png" }), "b.png");
  f.append("productName", "Fans"); f.append("template", "summer"); f.append("format", "post"); f.append("initiativeId", id);
  assert.equal((await client.req("POST", "/api/ads/banners", undefined, { form: f })).status, 201);
  let g = (await client.get(`/api/growth/${id}`)).data.initiative;
  assert.equal(g.copies[0].headline, "Salqin uy");
  assert.equal(g.banners.length, 1);
  assert.equal(g.nextStep, null);

  // Step 5: campaign built from the chosen direction.
  const camp = await client.post(`/api/growth/${id}/campaign`, { budget: 1_000_000 });
  assert.equal(camp.status, 201, JSON.stringify(camp.data));
  const campaign = (await client.get(`/api/campaigns/${camp.data.campaignId}`)).data.campaign;
  assert.deepEqual(campaign.channels, ["instagram", "telegram"]);
  assert.equal(campaign.audience, "Families");
  assert.equal((await client.post(`/api/growth/${id}/campaign`, {})).status, 400);

  // Step 6: results entered by the user → learnings and the opportunity list use them.
  await client.post(`/api/campaigns/${campaign.id}/stats`, { rows: [
    { date: campaign.startDate, creative: "Banner A", channel: "instagram", impressions: 5000, clicks: 150, conversions: 6, spend: 300000, revenue: 1200000 },
    { date: campaign.startDate, creative: "Post B", channel: "telegram", impressions: 3000, clicks: 60, conversions: 2, spend: 200000, revenue: 300000 },
  ] });
  g = (await client.get(`/api/growth/${id}`)).data.initiative;
  assert.equal(g.steps.results, true);
  assert.equal(g.nextStep, null);
  assert.equal(g.campaign.results.conversions, 8);
  const list = (await client.get("/api/growth")).data;
  assert.equal(list.learnings.byChannel.length, 2);
  assert.ok(list.learnings.insights.some((m: { key: string; vars: { channel: string } }) => m.key.startsWith("Best channel by return") && m.vars.channel === "instagram"));
  const opp = (await client.get("/api/intel/opportunities")).data.items.find((o: { query: string }) => o.query === "вентилятор");
  assert.equal(opp.mine.initiativeId, id);
  assert.equal(opp.mine.results.roas, 3);
  assert.equal((await other.client.get("/api/intel/opportunities")).data.items.find((o: { query: string }) => o.query === "вентилятор").mine, null);

  // AI campaign plans and the advisor see the measured results.
  ai(true);
  const prompts: string[] = [];
  setLlmFetchForTests((async (_u: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body));
    prompts.push(b.systemInstruction.parts[0].text);
    return /marketing planner/.test(b.systemInstruction.parts[0].text) ? gemini({ items: [] }) : json({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
  }) as unknown as typeof fetch);
  try {
    assert.equal((await client.post(`/api/campaigns/${campaign.id}/plan`, {})).status, 200);
    assert.match(prompts[0], /Past campaign results: .*instagram.*"roas":4/);
    assert.equal((await client.post("/api/advisor/messages", { message: "What worked?" })).status, 201);
    assert.match(prompts[1], /myCampaignResults/);
    assert.match(prompts[1], /myGrowthPlans/);
  } finally { ai(false); }
  assert.equal((await client.del(`/api/growth/${id}`)).status, 200);
});

test("manual plan and a plan from a demand analysis", async () => {
  setTrendsProviderForTests(provider);
  const { client } = await newUser();
  const m = await client.post("/api/growth", { source: "manual", product: "Handmade soap" });
  assert.equal(m.status, 201);
  assert.equal(m.data.initiative.evidence, null);
  const a = await client.post("/api/market", { query: "вентилятор", range: "today 12-m", geos: ["UZ"] });
  const f = await client.post("/api/growth", { source: "forecast", product: "Fans", analysisId: a.data.analysis.id });
  assert.equal(f.status, 201, JSON.stringify(f.data));
  assert.equal(f.data.initiative.evidence.areas[0].geo, "UZ");
  const other = await newUser();
  assert.equal((await other.client.post("/api/growth", { source: "forecast", product: "Fans", analysisId: a.data.analysis.id })).status, 404);
});
