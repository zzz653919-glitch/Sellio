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
  assert.equal((await client.get("/api/intel/opportunities")).status, 404, "Opportunities were removed");
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

test("API: top products for a period — one shared scale across requests via the anchor, change vs the period before", async () => {
  const { client } = await newUser();
  setTrendsProviderForTests(null);
  assert.equal((await client.get("/api/intel/top?period=week")).data.configured, false);
  const calls: string[][] = [];
  const day = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10), units: f(i) }));
  // True (absolute) interest per product; each request is normalized so its own maximum is 100, like Google does.
  const truth = (q: string, i: number, last: number) =>
    q === "телефон" ? 40
    : q === "кондиционер" ? (i >= last - 7 ? 120 : 30) // jumps in the last week: most wanted and fastest growing this week
    : q === "обогреватель" ? (i >= last - 7 ? 5 : 20) // falls in the last week
    : 10;
  const provider: TrendsProvider = {
    name: "fake",
    async interestOverTime() { return []; },
    async interestByCountry() { return []; },
    async interestOverTimeMulti(qs, _geo, range) {
      calls.push(qs);
      const n = range === "today 3-m" ? 90 : range === "today 12-m" ? 52 : 260;
      const raw = Object.fromEntries(qs.map((q) => [q, day(n, (i) => truth(q, i, n))]));
      const max = Math.max(...Object.values(raw).flat().map((p) => p.units));
      return Object.fromEntries(Object.entries(raw).map(([q, s]) => [q, s.map((p) => ({ ...p, units: Math.round((p.units / max) * 100) }))]));
    },
  };
  setTrendsProviderForTests(provider);
  const w = (await client.get("/api/intel/top?period=week")).data;
  assert.equal(w.configured, true);
  assert.equal(w.comparable, true);
  assert.ok(calls.every((c) => c[0] === "телефон" && c.length <= 5), "every request carries the anchor, at most 5 queries");
  assert.equal(w.mostWanted[0].query, "кондиционер");
  assert.equal(w.mostWanted[0].index, 100);
  const phone = w.mostWanted.find((i: { query: string }) => i.query === "телефон");
  // The calendar week 23–29 March holds 5 of the 7 jump days: conditioners average (2·30 + 5·120) / 7 ≈ 94.
  assert.ok(Math.abs(phone.index - 42) <= 2, `phone ≈ 40/94 of the top (${phone.index})`);
  assert.equal(w.fastestGrowing[0].query, "кондиционер");
  assert.ok(w.fastestGrowing[0].changePct > 200);
  assert.equal(w.declining[0].query, "обогреватель");
  assert.equal(w.mostWanted[0].series.length, 7);
  assert.equal(w.from, "2026-03-23", "the last complete week, Monday to Sunday");
  assert.equal(w.to, "2026-03-29");
  assert.equal(w.dates.length, 7);
  // A month compares the last 30 days with the 30 before; the same cached data is reused (no new requests).
  const before = calls.length;
  const m = (await client.get("/api/intel/top?period=month")).data;
  assert.equal(calls.length, before, "week and month share one cached download");
  assert.equal(m.from, "2026-03-01", "the last complete calendar month");
  assert.equal(m.to, "2026-03-31");
  assert.equal(m.mostWanted[0].series.length, 31);
  assert.equal(m.prevFrom, "2026-02-01");
  assert.equal(m.mostWanted[0].prevSeries.length, 31);
  assert.equal(m.leastWanted[m.leastWanted.length - 1].query, m.mostWanted[0].query, "least wanted is the same ranking reversed");
  assert.equal((await client.get("/api/intel/top?period=decade")).status, 400);
  setTrendsProviderForTests(undefined);
});
