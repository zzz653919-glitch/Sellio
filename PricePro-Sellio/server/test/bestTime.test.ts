import "./env.js";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { config, features } from "../src/config.js";
import { setTrendsProviderForTests } from "../src/modules/forecast/trends.js";
import { setLlmFetchForTests } from "../src/services/llm.js";
import { closeServer, newUser } from "./helpers.js";

const setAi = (on: boolean) => {
  const c = config as { GEMINI_API_KEY?: string; LLM_PROVIDER?: string };
  c.GEMINI_API_KEY = on ? "g-key" : undefined;
  c.LLM_PROVIDER = on ? "gemini" : undefined;
  features.llm = on;
  if (!on) setLlmFetchForTests(null);
};
after(() => { setAi(false); setTrendsProviderForTests(undefined); closeServer(); });

/** Five years of weekly search interest ending today, from a per-month shape. */
const weeks = (shape: (m: number, i: number) => number) => {
  const end = new Date();
  return Array.from({ length: 262 }, (_, i) => {
    const d = new Date(end.getTime() - (261 - i) * 7 * 86_400_000);
    return { date: d.toISOString().slice(0, 10), units: Math.max(0, Math.round(shape(d.getUTCMonth() + 1, i))) };
  });
};
const winter = (m: number) => 25 + (m === 12 ? 60 : m === 11 ? 35 : m === 1 ? 40 : 0);

test("API: when does a product sell best — months rated from 5 years of searches", async () => {
  const calls: string[] = [];
  setTrendsProviderForTests({
    name: "fake",
    async interestOverTime(q, geo) {
      calls.push(`${q}@${geo || "WORLD"}`);
      if (q === "kurtka") return weeks(winter);
      if (q === "sparse" && geo === "UZ") return weeks((_m, i) => (i % 3 === 0 ? 4 : 0)); // mostly empty weeks
      if (q === "sparse") return weeks((m) => 30 + (m === 7 ? 50 : m === 6 ? 30 : 0));
      if (q === "flat") return weeks(() => 50);
      return [];
    },
    async interestByCountry() { return []; },
  });
  const { client } = await newUser();
  assert.equal((await client.post("/api/market/when", { query: "kurtka", geo: "XX" })).status, 400);

  const r = await client.post("/api/market/when", { query: "kurtka", geo: "UZ" });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const res = r.data.analysis.result;
  assert.equal(r.data.analysis.range, "when");
  assert.equal(res.kind, "when");
  assert.equal(res.geo, "UZ");
  assert.equal(res.usedQuery, "kurtka");
  assert.deepEqual(res.bestMonths, [12, 1], "December and January are the best months");
  assert.ok(res.months.find((m: { month: number }) => m.month === 12).rating === "best");
  assert.ok(["slow", "worst", "normal"].includes(res.months.find((m: { month: number }) => m.month === 6).rating));
  assert.ok(res.prepare, "a date to get stock and ads ready");
  assert.equal(res.weekly.length, 262, "the weekly series is kept for the weeks / seasons / years views");
  assert.equal((await client.get("/api/dashboard")).data.usage.metrics.forecasts.used, 1);

  // Too little data in Uzbekistan: the answer comes from worldwide searches and says so.
  const w = (await client.post("/api/market/when", { query: "sparse", geo: "UZ" })).data.analysis.result;
  assert.equal(w.geo, "WORLD");
  assert.equal(w.requestedGeo, "UZ");
  assert.ok(w.bestMonths.includes(7));
  assert.deepEqual(w.tried.map((t: { geo: string }) => t.geo), ["UZ", "WORLD"]);

  // No seasonal pattern: every month is ordinary.
  const f = (await client.post("/api/market/when", { query: "flat", geo: "UZ" })).data.analysis.result;
  assert.ok(f.months.every((m: { rating: string }) => m.rating === "normal"));
  assert.deepEqual(f.bestMonths, []);
  assert.equal(f.prepare, null);

  // Nothing anywhere: stored as no data and not counted.
  const n = await client.post("/api/market/when", { query: "nothing at all", geo: "UZ" });
  assert.equal(n.data.analysis.status, "no_data");
  assert.equal((await client.get("/api/dashboard")).data.usage.metrics.forecasts.used, 3);

  const list = await client.get("/api/market");
  assert.equal(list.data.items[0].range, "when");
  assert.ok(list.data.items.every((i: { result: { weekly?: unknown[] } }) => !i.result.weekly?.length), "the list stays light");
  assert.ok((await client.get("/api/dashboard")).data.analyses.length >= 1);
});

test("API: when — the usual Russian search term is tried when the typed name has no data", async () => {
  setAi(true);
  setLlmFetchForTests((async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ru: "кондиционер", en: "air conditioner" }) }] } }] }), { headers: { "content-type": "application/json" } })) as unknown as typeof fetch);
  setTrendsProviderForTests({
    name: "fake",
    async interestOverTime(q) {
      if (q === "кондиционер") return weeks((m) => 20 + (m === 6 ? 50 : m === 7 ? 60 : 0));
      return [];
    },
    async interestByCountry() { return []; },
  });
  try {
    const { client } = await newUser();
    const r = (await client.post("/api/market/when", { query: "konditsioner", geo: "UZ" })).data.analysis.result;
    assert.equal(r.usedQuery, "кондиционер");
    assert.equal(r.geo, "UZ");
    assert.deepEqual(r.bestMonths, [6, 7]);
  } finally {
    setAi(false);
  }
});
