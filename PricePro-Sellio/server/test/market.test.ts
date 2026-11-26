import "./env.js";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { parseByRegion, parseTimeline, SerpApiTrendsProvider, setTrendsProviderForTests, type TrendsProvider } from "../src/modules/forecast/trends.js";
import { closeServer, newUser } from "./helpers.js";

after(() => { setTrendsProviderForTests(undefined); closeServer(); });

const week = (i: number) => new Date(Date.UTC(2025, 0, 5) + i * 7 * 86_400_000);

test("timeline and by-country parsers keep real values and drop the partial week", () => {
  const body = {
    interest_over_time: {
      timeline_data: [
        { date: "Jan 5 – 11, 2025", timestamp: "1736035200", values: [{ query: "air fryer", value: "54", extracted_value: 54 }] },
        { date: "Jan 12 – 18, 2025", timestamp: "1736640000", values: [{ query: "air fryer", value: "<1", extracted_value: 0 }] },
        { date: "Jan 19 – 25, 2025", timestamp: "1737244800", partial_data: true, values: [{ value: "60", extracted_value: 60 }] },
        { date: "broken", values: [] },
      ],
    },
  };
  assert.deepEqual(parseTimeline(body), [{ date: "2025-01-05", units: 54 }, { date: "2025-01-12", units: 0 }]);
  assert.deepEqual(parseTimeline({}), []);
  const geo = { interest_by_region: [{ geo: "KZ", location: "Kazakhstan", value: "61", extracted_value: 61 }, { geo: "UZ", location: "Uzbekistan", value: "100", extracted_value: 100 }, { location: "" }] };
  assert.deepEqual(parseByRegion(geo), [{ code: "UZ", name: "Uzbekistan", value: 100 }, { code: "KZ", name: "Kazakhstan", value: 61 }]);
});

test("SerpApi adapter: 'no results' is empty data, other errors are failures", async () => {
  const fake = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch;
  assert.deepEqual(await new SerpApiTrendsProvider("k", fake({ error: "Google Trends hasn't returned any results for this query." })).interestOverTime("zzz", "UZ", "today 12-m"), []);
  await assert.rejects(new SerpApiTrendsProvider("k", fake({ error: "Invalid API key." }, 401)).interestOverTime("tea", "", "today 12-m"), /Invalid API key/);
  let url = "";
  const capture = (async (u: string) => { url = u; return new Response("{}", { headers: { "content-type": "application/json" } }); }) as unknown as typeof fetch;
  await new SerpApiTrendsProvider("k", capture).interestOverTime("green tea", "UZ", "today 5-y");
  const q = new URL(url).searchParams;
  assert.equal(q.get("engine"), "google_trends");
  assert.equal(q.get("geo"), "UZ");
  assert.equal(q.get("date"), "today 5-y");
  assert.equal(q.get("data_type"), "TIMESERIES");
});

test("API: refused without a provider (nothing invented, nothing counted)", async () => {
  setTrendsProviderForTests(null);
  const { client } = await newUser();
  assert.equal((await client.get("/api/market/options")).data.configured, false);
  const r = await client.post("/api/market", { query: "air fryer", range: "today 12-m", geos: ["WORLD"] });
  assert.equal(r.status, 503);
  assert.equal(r.data.error.code, "SERVICE_NOT_CONFIGURED");
  assert.equal((await client.get("/api/dashboard")).data.usage.metrics.forecasts.used, 0);
});

test("API: world and country demand with trends, no-data areas and per-user ownership", async () => {
  const calls: string[] = [];
  const provider: TrendsProvider = {
    name: "fake",
    async interestOverTime(_q, geo) {
      calls.push(geo || "WORLD");
      if (geo === "TM") return [];
      if (geo === "RU") throw new (await import("../src/modules/forecast/trends.js")).TrendsError("quota exceeded");
      const slope = geo === "UZ" ? 1 : -0.4;
      return Array.from({ length: 52 }, (_, i) => ({ date: week(i).toISOString().slice(0, 10), units: Math.max(0, Math.round(50 + slope * i)) }));
    },
    async interestByCountry() {
      return [{ code: "UZ", name: "Uzbekistan", value: 100 }, { code: "KZ", name: "Kazakhstan", value: 64 }];
    },
  };
  setTrendsProviderForTests(provider);
  const { client } = await newUser();
  const r = await client.post("/api/market", { query: "Air fryer", range: "today 12-m", geos: ["WORLD", "UZ", "TM", "RU"] });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const a = r.data.analysis;
  assert.equal(a.status, "completed");
  assert.equal(a.result.metric, "search_interest_index");
  const area = (g: string) => a.result.areas.find((x: { geo: string }) => x.geo === g);
  assert.equal(area("UZ").trend, "growing");
  assert.equal(area("WORLD").trend, "declining");
  assert.equal(area("UZ").granularity, "week");
  assert.ok(area("UZ").periodChangePct > 50, `period change ${area("UZ").periodChangePct}`);
  assert.equal(area("UZ").forecast.length, 13);
  assert.equal(area("TM").status, "no_data");
  assert.equal(area("RU").status, "error");
  assert.match(area("RU").error, /quota/);
  assert.equal(a.result.byCountry[0].code, "UZ");
  assert.deepEqual(calls.sort(), ["RU", "TM", "UZ", "WORLD"]);

  assert.equal((await client.get("/api/dashboard")).data.usage.metrics.forecasts.used, 1, "counts toward the forecast limit");
  assert.equal((await client.get("/api/market")).data.items.length, 1);
  const dash = (await client.get("/api/dashboard")).data;
  assert.equal(dash.stats.forecastsCompleted, 1);
  assert.equal(dash.analyses[0].query, "Air fryer");
  const proj = await client.post("/api/projects", { type: "forecast", refId: a.id });
  assert.equal(proj.status, 201, JSON.stringify(proj.data));
  assert.match(proj.data.project.title, /Demand — Air fryer/);
  const fav = await client.post("/api/favorites", { itemType: "forecast", refId: a.id });
  assert.equal(fav.status, 201, JSON.stringify(fav.data));
  const again = (await client.get(`/api/market/${a.id}`)).data.analysis;
  assert.ok(again.projectId && again.favoriteId);
  assert.equal((await client.post("/api/market", { query: "x", range: "today 12-m", geos: ["WORLD"] })).status, 400);
  assert.equal((await client.post("/api/market", { query: "tea", range: "today 12-m", geos: ["XX"] })).status, 400);

  const other = await newUser();
  assert.equal((await other.client.get(`/api/market/${a.id}`)).status, 404);
  assert.equal((await other.client.del(`/api/market/${a.id}`)).status, 404);
  assert.equal((await client.del(`/api/market/${a.id}`)).status, 200);
});

test("API: compare products — ranks rising vs falling demand and gives season timing", async () => {
  const weeks = (shape: (m: number, i: number) => number) => {
    const end = new Date();
    const out = [];
    for (let i = 0; i < 262; i++) {
      const d = new Date(end.getTime() - (261 - i) * 7 * 86_400_000);
      out.push({ date: d.toISOString().slice(0, 10), units: Math.max(0, Math.round(shape(d.getUTCMonth() + 1, i))) });
    }
    return out;
  };
  setTrendsProviderForTests({
    name: "fake",
    async interestOverTime(q) {
      if (q === "school backpack") return weeks((m, i) => 30 + i * 0.05 + (m === 8 ? 45 : m === 9 ? 30 : 0));
      if (q === "fidget spinner") return weeks((_m, i) => 90 - i * 0.3);
      if (q === "unknown thing") return [];
      return weeks(() => 50);
    },
    async interestByCountry() { return []; },
  });
  const { client } = await newUser();
  assert.equal((await client.post("/api/market/compare", { queries: ["a"], geo: "UZ" })).status, 400);
  assert.equal((await client.post("/api/market/compare", { queries: ["tea", "tea"], geo: "UZ" })).status, 400);
  const r = await client.post("/api/market/compare", { queries: ["school backpack", "fidget spinner", "unknown thing"], geo: "UZ" });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const res = r.data.analysis.result;
  assert.equal(res.kind, "compare");
  const item = (q: string) => res.items.find((i: { query: string }) => i.query === q);
  assert.equal(item("fidget spinner").seasonality.direction, "declining");
  assert.ok(item("school backpack").seasonality.peakMonths.includes(8));
  assert.ok(item("school backpack").seasonality.events.includes("school"));
  assert.equal(item("unknown thing").status, "no_data");
  assert.equal(res.items[res.items.length - 1].query, "unknown thing", "items without data go last");
  const list = await client.get("/api/market");
  assert.equal(list.data.items[0].range, "compare");
  assert.equal((await client.get("/api/dashboard")).data.analyses[0].headline !== undefined, true);
});

test("API: top 3 demand now — ranks the watchlist by current vs usual interest and caches it", async () => {
  const weeks = (shape: (m: number) => number) => {
    const end = new Date();
    return Array.from({ length: 262 }, (_, i) => {
      const d = new Date(end.getTime() - (261 - i) * 7 * 86_400_000);
      return { date: d.toISOString().slice(0, 10), units: Math.round(shape(d.getUTCMonth() + 1)) };
    });
  };
  const nowM = new Date().getUTCMonth() + 1;
  const near = (m: number, a: number[]) => a.includes(m);
  let calls = 0;
  setTrendsProviderForTests({
    name: "fake",
    async interestOverTime(q) {
      calls++;
      // Products in season now get a peak in the current month; others peak half a year away.
      const inSeason = ["куртка", "обогреватель", "ёлка"].includes(q);
      const peak = inSeason ? nowM : ((nowM + 5) % 12) + 1;
      const boost = q === "куртка" ? 60 : q === "обогреватель" ? 45 : q === "ёлка" ? 30 : 40;
      return weeks((m) => 30 + (near(m, [peak]) ? boost : 0));
    },
    async interestByCountry() { return []; },
  });
  const { client } = await newUser();
  const r = await client.get("/api/market/top");
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.configured, true);
  assert.deepEqual(r.data.top.map((i: { query: string }) => i.query), ["куртка", "обогреватель", "ёлка"]);
  assert.ok(r.data.top[0].nowVsAvgPct > 50);
  const used = calls;
  assert.equal((await client.get("/api/market/top")).data.top[0].query, "куртка");
  assert.equal(calls, used, "second request is served from the weekly cache");
  assert.equal((await client.get("/api/dashboard")).data.usage.metrics.forecasts.used, 0, "not counted against the user's plan");
});
