import "./env.js";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { config, features } from "../src/config.js";
import { parseComtrade, setComtradeFetchForTests } from "../src/modules/intel/comtrade.js";
import { parseWorldBank, setWorldBankFetchForTests } from "../src/modules/intel/worldbank.js";
import { setTrendsProviderForTests, type TrendsProvider } from "../src/modules/forecast/trends.js";
import { setLlmFetchForTests } from "../src/services/llm.js";
import { closeServer, newUser } from "./helpers.js";

after(() => {
  setTrendsProviderForTests(undefined);
  setWorldBankFetchForTests(null);
  setComtradeFetchForTests(null);
  setLlmFetchForTests(null);
  closeServer();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const weeks = (n: number, f: (i: number, d: Date) => number) => {
  const start = Date.UTC(2020, 10, 1);
  return Array.from({ length: n }, (_, i) => { const d = new Date(start + i * 7 * 86_400_000); return { date: d.toISOString().slice(0, 10), units: Math.max(0, Math.round(f(i, d))) }; });
};

test("World Bank parser keeps real yearly values and reports API errors", () => {
  const ok = [{ page: 1 }, [
    { indicator: { id: "SP.POP.TOTL" }, country: { id: "UZ", value: "Uzbekistan" }, date: "2024", value: 36_361_859 },
    { indicator: { id: "SP.POP.TOTL" }, country: { id: "UZ", value: "Uzbekistan" }, date: "2025", value: null },
  ]];
  assert.deepEqual(parseWorldBank(ok).rows, [{ country: "UZ", name: "Uzbekistan", year: 2024, value: 36_361_859 }]);
  assert.equal(parseWorldBank([{ message: [{ id: "120", value: "Invalid value" }] }]).error, "Invalid value");
});

test("API: economic statistics from World Bank, cached, with 5-year change", async () => {
  let calls = 0;
  setWorldBankFetchForTests((async (url: string) => {
    calls++;
    const u = new URL(url);
    assert.equal(u.searchParams.get("format"), "json");
    const ind = u.pathname.split("/indicator/")[1];
    const rows = [];
    for (const c of ["KZ", "UZ"]) for (let y = 2015; y <= 2024; y++) rows.push({ country: { id: c, value: c === "UZ" ? "Uzbekistan" : "Kazakhstan" }, date: String(y), value: ind === "FP.CPI.TOTL.ZG" ? 10 + (y - 2015) * 0.1 : 100 * (y - 2014) });
    return json([{ page: 1 }, rows]);
  }) as unknown as typeof fetch);
  const { client } = await newUser();
  const r = await client.get("/api/intel/stats?countries=UZ,KZ&indicators=gdp,inflation");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const uz = r.data.countries.find((c: { country: string }) => c.country === "UZ");
  assert.equal(uz.name, "Uzbekistan");
  const gdp = uz.indicators.find((i: { key: string }) => i.key === "gdp");
  assert.deepEqual(gdp.latest, { year: 2024, value: 1000 });
  assert.equal(gdp.change5y, 100); // 1000 vs 500 five years before
  const infl = uz.indicators.find((i: { key: string }) => i.key === "inflation");
  assert.equal(infl.change5y, 0.5); // percentage points
  const before = calls;
  await client.get("/api/intel/stats?countries=KZ,UZ&indicators=gdp,inflation");
  assert.equal(calls, before, "second request is served from the cache");
  assert.equal((await client.get("/api/intel/stats?countries=XX")).status, 400);
});

test("UN Comtrade: refused without a key; with a key, top product groups of the latest published year", async () => {
  const { client } = await newUser();
  const r = await client.get("/api/intel/trade/UZ");
  assert.equal(r.status, 503);
  assert.equal(r.data.error.code, "SERVICE_NOT_CONFIGURED");
  assert.deepEqual(parseComtrade({ data: [{ cmdCode: "TOTAL", primaryValue: 5 }, { cmdCode: "84", primaryValue: 3 }] }).map((x) => x.cmdCode), ["84"]);
  (config as { COMTRADE_API_KEY?: string }).COMTRADE_API_KEY = "test";
  features.comtrade = true;
  const years: string[] = [];
  setComtradeFetchForTests((async (url: string, init: RequestInit) => {
    const q = new URL(url).searchParams;
    years.push(q.get("period")!);
    assert.equal((init.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"], "test");
    if (Number(q.get("period")) === new Date().getUTCFullYear() - 1) return json({ data: [] }); // not published yet
    return json({ data: [{ cmdCode: "84", cmdDesc: "Machinery", primaryValue: 600, flowCode: q.get("flowCode") }, { cmdCode: "87", cmdDesc: "Vehicles", primaryValue: 400 }] });
  }) as unknown as typeof fetch);
  try {
    const t = await client.get("/api/intel/trade/UZ");
    assert.equal(t.status, 200, JSON.stringify(t.data));
    assert.equal(t.data.profile.imports.year, new Date().getUTCFullYear() - 2);
    assert.deepEqual(t.data.profile.imports.groups.map((g: { code: string; sharePct: number }) => [g.code, g.sharePct]), [["84", 60], ["87", 40]]);
    assert.ok(years.includes(String(new Date().getUTCFullYear() - 1)));
  } finally {
    features.comtrade = false;
  }
});

test("API: Market Radar, opportunities and regions come only from measured search interest", async () => {
  const { client } = await newUser();
  setTrendsProviderForTests(null);
  assert.equal((await client.get("/api/intel/radar")).data.configured, false);
  assert.equal((await client.post("/api/intel/regions", { query: "куртка" })).status, 503);

  const provider: TrendsProvider = {
    name: "fake",
    async interestOverTime(q) {
      // Fans grow steadily; heaters decline; the rest are flat with noise.
      if (q === "вентилятор") return weeks(260, (i) => 20 + i * 0.3);
      if (q === "обогреватель") return weeks(260, (i) => 80 - i * 0.2);
      return weeks(260, (i) => 50 + ((i * 7) % 5));
    },
    async interestByCountry() { return []; },
    async interestByRegion(q, geo) {
      assert.equal(geo, "UZ");
      return [{ code: "UZ-TK", name: "Tashkent", value: 100 }, { code: "UZ-SA", name: "Samarqand Region", value: 62 }];
    },
  };
  setTrendsProviderForTests(provider);
  const radar = (await client.get("/api/intel/radar")).data;
  assert.equal(radar.configured, true);
  assert.equal(radar.checked, 16);
  assert.ok(radar.items.length >= 10);
  assert.ok(radar.declining.some((i: { query: string }) => i.query === "обогреватель"), "declining heaters");
  assert.ok(Array.isArray(radar.updates));
  const opp = (await client.get("/api/intel/opportunities")).data;
  assert.equal(opp.configured, true);
  assert.equal(opp.items[0].query, "вентилятор");
  assert.ok(opp.items[0].reasons.length > 0 && opp.items[0].evidence.yoyPct > 0);
  assert.ok(!opp.items.some((o: { query: string }) => o.query === "обогреватель"));
  const reg = await client.post("/api/intel/regions", { query: "куртка" });
  assert.equal(reg.status, 200);
  assert.equal(reg.data.regions[0].name, "Tashkent");
});

test("API: demand analysis returns 7 / 30 / 90 / 365-day horizons with back-test accuracy", async () => {
  setTrendsProviderForTests({
    name: "fake",
    async interestOverTime() { return weeks(260, (i, d) => 40 + i * 0.05 + (d.getUTCMonth() === 8 ? 30 : 0)); },
    async interestByCountry() { return []; },
  });
  const { client } = await newUser();
  const r = await client.post("/api/market", { query: "рюкзак", range: "today 12-m", geos: ["UZ"] });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const h = r.data.analysis.result.areas[0].horizons;
  assert.deepEqual(h.map((x: { days: number }) => x.days), [7, 30, 90, 365]);
  for (const x of h) {
    assert.equal(x.status, "ok");
    assert.ok(x.expected > 0 && x.lower <= x.expected && x.upper >= x.expected);
    assert.ok(typeof x.smapePct === "number" && x.confidence);
  }
});

test("API: competitors are private notes with ownership checks", async () => {
  const a = await newUser(), b = await newUser();
  const bad = await a.client.post("/api/intel/competitors", { name: "Shop", website: "not a url" });
  assert.equal(bad.status, 400);
  assert.equal((await a.client.post("/api/intel/competitors", { name: "Shop", website: "javascript:alert(1)" })).status, 400);
  const c = await a.client.post("/api/intel/competitors", { name: "TechnoMart", website: "https://example.uz", priceNote: "Phones from 2 mln" });
  assert.equal(c.status, 201);
  const id = c.data.competitor.id;
  assert.equal((await b.client.get("/api/intel/competitors")).data.items.length, 0);
  assert.equal((await b.client.del(`/api/intel/competitors/${id}`)).status, 404);
  assert.equal((await a.client.patch(`/api/intel/competitors/${id}`, { name: "TechnoMart UZ", positioning: "Cheap" })).data.competitor.name, "TechnoMart UZ");
  assert.equal((await a.client.del(`/api/intel/competitors/${id}`)).status, 200);
});
