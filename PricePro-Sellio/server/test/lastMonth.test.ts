import "./env.js";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { setTrendsProviderForTests, type TrendsProvider } from "../src/modules/forecast/trends.js";
import { scoreItem } from "../src/modules/forecast/topDemand.js";
import { closeServer, newUser } from "./helpers.js";

after(() => { setTrendsProviderForTests(undefined); closeServer(); });

test("API: last month — most and least searched watched products on one scale, change vs the month before", async () => {
  const { client } = await newUser();
  setTrendsProviderForTests(null);
  assert.equal((await client.get("/api/market/last-month")).data.configured, false);
  // 90 days of daily data ending 26 Nov 2026: October and September are complete months.
  const end = Date.UTC(2026, 10, 26);
  const days = Array.from({ length: 90 }, (_, i) => new Date(end - (89 - i) * 86_400_000).toISOString().slice(0, 10));
  const truth = (q: string, date: string) => {
    const oct = date.startsWith("2026-10"), sep = date.startsWith("2026-09");
    if (q === "телефон") return 40;
    if (q === "обогреватель") return oct ? 80 : sep ? 20 : 90; // most searched in October, +300% vs September
    if (q === "кондиционер") return oct ? 2 : sep ? 10 : 1; // least searched, falling
    if (q === "вентилятор") return 3;
    if (q === "ёлка") return oct ? 4 : 2;
    return 15;
  };
  const provider: TrendsProvider = {
    name: "fake",
    async interestOverTime() { return []; },
    async interestByCountry() { return []; },
    async interestOverTimeMulti(qs) {
      const raw = Object.fromEntries(qs.map((q) => [q, days.map((date) => ({ date, units: truth(q, date) }))]));
      const max = Math.max(...Object.values(raw).flat().map((p) => p.units));
      return Object.fromEntries(Object.entries(raw).map(([q, s]) => [q, s.map((p) => ({ ...p, units: Math.round((p.units / max) * 100) }))]));
    },
  };
  setTrendsProviderForTests(provider);
  const r = (await client.get("/api/market/last-month")).data;
  assert.equal(r.configured, true);
  assert.equal(r.month, "2026-10", "November is not complete yet");
  assert.equal(r.comparable, true);
  assert.equal(r.best[0].query, "обогреватель");
  assert.equal(r.best[0].index, 100);
  assert.ok(Math.abs(r.best[0].changePct - 300) < 15, `heaters +300% vs September (${r.best[0].changePct})`);
  assert.equal(r.best[1].query, "телефон");
  assert.equal(r.worst[0].query, "кондиционер");
  assert.ok(r.worst[0].changePct < -50);
  assert.equal(r.worst.length, 3);
  assert.ok(r.worst.every((w: { query: string }) => !r.best.some((b: { query: string }) => b.query === w.query)));
});

test("top demand ignores products with too little search data (no '+1200%' from one spike)", () => {
  const weeks = (f: (i: number) => number) => Array.from({ length: 260 }, (_, i) => ({ date: new Date(Date.UTC(2021, 11, 5) + i * 7 * 86_400_000).toISOString().slice(0, 10), units: f(i) }));
  assert.equal(scoreItem("детская одежда", "Children's clothing", weeks((i) => (i >= 256 ? 13 : i % 4 === 0 ? 1 : 0))), null);
  assert.ok(scoreItem("куртка", "Jackets", weeks((i) => 30 + (i % 52 > 45 ? 40 : 0))));
});
