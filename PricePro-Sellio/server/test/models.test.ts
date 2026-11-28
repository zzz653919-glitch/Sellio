import "./env.js";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { modelName, MODEL_GROUPS } from "../src/modules/forecast/models.js";
import { parseRelated, setTrendsProviderForTests, type TrendsProvider } from "../src/modules/forecast/trends.js";
import { closeServer, newUser } from "./helpers.js";

after(() => { setTrendsProviderForTests(undefined); closeServer(); });

test("model names come out clean from what people typed", () => {
  const phone = MODEL_GROUPS["телефон"];
  const iphone = phone.brands[0];
  assert.equal(modelName("iphone 15 pro max цена", iphone, true), "iPhone 15 Pro Max");
  assert.equal(modelName("iphone 13 narxi", iphone, true), "iPhone 13");
  assert.equal(modelName("15 pro max", iphone, true), "iPhone 15 Pro Max");
  assert.equal(modelName("iphone цена в ташкенте", iphone, true), null, "no model in it");
  assert.equal(modelName("телевизор samsung 55 дюймов", MODEL_GROUPS["телевизор"].brands[0], true), "Samsung 55");
  assert.equal(modelName("nike air force 1", MODEL_GROUPS["кроссовки"].brands[0], false), "Nike Air Force 1");
  assert.deepEqual(parseRelated({ related_queries: { top: [{ query: "iphone 16", value: "100", extracted_value: 100 }, { query: "" }], rising: [{ query: "iphone 17", value: "Breakout", extracted_value: 5000 }] } }),
    { top: [{ query: "iphone 16", value: 100 }], rising: [{ query: "iphone 17", value: 5000 }] });
});

test("API: brands and models inside a product — which phone models are searched most", async () => {
  const { client } = await newUser();
  const ranges: string[] = [];
  const level: Record<string, number> = { iphone: 50, samsung: 30, redmi: 15, honor: 3, tecno: 2, "iphone 16 pro max": 40, "iphone 13": 25, "samsung a55": 20, "samsung s25 ultra": 8, "redmi note 14": 12, "iphone 15": 18 };
  const provider: TrendsProvider = {
    name: "fake",
    async interestOverTime() { return []; },
    async interestByCountry() { return []; },
    async interestOverTimeMulti(qs, _geo, range) {
      ranges.push(range);
      return Object.fromEntries(qs.map((q) => [q, Array.from({ length: 10 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, units: level[q] ?? 1 }))]));
    },
    async relatedQueries(q) {
      if (q === "iphone") return { top: [{ query: "iphone 16 pro max", value: 100 }, { query: "iphone цена", value: 90 }, { query: "iphone 13 narxi", value: 60 }, { query: "iphone 15", value: 45 }], rising: [{ query: "iphone 17", value: 5000 }] };
      if (q === "samsung") return { top: [{ query: "samsung a55", value: 100 }, { query: "samsung s25 ultra цена", value: 40 }], rising: [] };
      if (q === "redmi") return { top: [{ query: "redmi note 14", value: 100 }], rising: [] };
      return { top: [], rising: [] };
    },
  };
  setTrendsProviderForTests(provider);
  assert.equal((await client.get("/api/intel/top/models?query=куртка&period=month")).data.available, false, "jackets have no models");
  const r = (await client.get("/api/intel/top/models?query=телефон&period=month")).data;
  assert.equal(r.available, true, JSON.stringify(r));
  assert.match(ranges[0], /^\d{4}-\d{2}-01 \d{4}-\d{2}-\d{2}$/, "the exact last calendar month is asked for");
  assert.deepEqual(r.brands.slice(0, 3).map((b: { label: string }) => b.label), ["iPhone", "Samsung", "Redmi"]);
  assert.ok(Math.abs(r.brands[0].sharePct - 50) < 1, "iPhone ≈ 50% of the five brands");
  assert.equal(r.byBrand[0].brand, "iPhone");
  assert.deepEqual(r.byBrand[0].models.map((m: { name: string }) => m.name), ["iPhone 16 Pro Max", "iPhone 13", "iPhone 15"], "price words are dropped, not counted as models");
  assert.equal(r.measured, true);
  assert.equal(r.models[0].name, "iPhone 16 Pro Max");
  assert.equal(r.models[0].index, 100);
  assert.ok(r.models.some((m: { name: string }) => m.name === "Samsung A55"));
  assert.deepEqual(r.rising[0], { name: "iPhone 17", brand: "iPhone", growthPct: 5000 });
  const calls = ranges.length;
  await client.get("/api/intel/top/models?query=телефон&period=month");
  assert.equal(ranges.length, calls, "cached");
});
