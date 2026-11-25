import "./env.js";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { after, test } from "node:test";
import { groupOffers } from "../src/modules/prices/matching.js";
import { SerpApiProvider, setPriceProvidersForTests, type Offer, type PriceProvider } from "../src/modules/prices/providers.js";
import { closeServer, newUser } from "./helpers.js";

after(() => {
  setPriceProvidersForTests(null);
  closeServer();
});

const offer = (store: string, title: string, price: number, extra: Partial<Offer> = {}): Offer => ({
  id: crypto.createHash("sha256").update(store + title + price).digest("hex").slice(0, 24),
  provider: "test", storeName: store, title, price, currency: "USD", priceText: `$${price}`, previousPrice: null,
  imageUrl: null, url: `https://${store.toLowerCase().replace(/\W/g, "")}.example/p`, condition: null, availability: null,
  gtin: null, shipping: null, ...extra,
});

test("matching groups the same product and keeps different specs apart", () => {
  const offers = [
    offer("StoreA", "Apple iPhone 15 128GB Black", 799),
    offer("StoreB", "iPhone 15 128 GB - Black (Apple)", 749),
    offer("StoreC", "Apple iPhone 15 256GB Black", 899),
    offer("StoreD", "Apple iPhone 15 128GB Black unlocked", 779),
    offer("StoreE", "Samsung Galaxy S24", 699),
  ];
  const groups = groupOffers("iphone 15 128gb", offers);
  const best = groups[0];
  assert.equal(best.offers.length, 3);
  assert.equal(best.cheapest.storeName, "StoreB");
  assert.equal(best.potentialSavings, 50);
  assert.ok(!best.offers.some((o) => o.title.includes("256GB")));
  assert.ok(!groups.some((g) => g.title.includes("Samsung")), "irrelevant offers are dropped");
});

test("SerpApi adapter parses real response shapes and drops incomplete records", async () => {
  const fake = (async () =>
    new Response(
      JSON.stringify({
        shopping_results: [
          { title: "Widget Pro", source: "Shop One", price: "$19.99", extracted_price: 19.99, product_link: "https://shop.one/w", thumbnail: "https://img/1.jpg", extracted_old_price: 24.99 },
          { title: "Widget Pro (used)", source: "Shop Two", price: "$12.00", extracted_price: 12, link: "https://shop.two/w", second_hand_condition: "used" },
          { title: "No price", source: "Shop Three", product_link: "https://shop.three/w" },
          { title: "Bad link", source: "Shop Four", price: "$1", extracted_price: 1, product_link: "javascript:alert(1)" },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;
  const offers = await new SerpApiProvider("key", "us", "en", fake).search("widget pro");
  assert.equal(offers.length, 2);
  assert.equal(offers[0].previousPrice, 24.99);
  assert.equal(offers[0].currency, "USD");
  assert.equal(offers[1].condition, "used");
  assert.equal(offers[0].availability, null, "availability is not invented");
});

test("API: without providers the search is refused", async () => {
  setPriceProvidersForTests([]);
  const { client } = await newUser();
  const r = await client.post("/api/prices/search", { query: "iphone 15" });
  assert.equal(r.status, 503);
  assert.equal(r.data.error.code, "SERVICE_NOT_CONFIGURED");
});

test("API: search finds the cheapest offer, reports failing providers, and supports projects/favorites", async () => {
  const good: PriceProvider = { name: "good", label: "Good", search: async () => [offer("StoreA", "Acme Kettle 1.7L", 30), offer("StoreB", "Acme Kettle 1.7 L steel", 25)] };
  const broken: PriceProvider = { name: "broken", label: "Broken", search: async () => { throw new Error("timeout"); } };
  setPriceProvidersForTests([good, broken]);
  const { client } = await newUser();
  const r = await client.post("/api/prices/search", { query: "acme kettle" });
  assert.equal(r.status, 201);
  const s = r.data.search;
  assert.equal(s.status, "partial");
  assert.equal(s.bestOffer.storeName, "StoreB");
  assert.equal(s.bestPrice, 25);
  assert.equal(s.providers.find((p: { name: string }) => p.name === "broken").status, "error");

  const fav = await client.post("/api/favorites", { itemType: "product", searchId: s.id, offerId: s.bestOffer.id });
  assert.equal(fav.status, 201);
  assert.equal(fav.data.favorite.data.price, 25);
  assert.equal((await client.post("/api/favorites", { itemType: "product", searchId: s.id, offerId: "0".repeat(24) })).status, 404);

  const proj = await client.post("/api/projects", { type: "price_comparison", refId: s.id });
  assert.equal(proj.status, 201);
  const renamed = await client.patch(`/api/projects/${proj.data.project.id}`, { title: "Kettles" });
  assert.equal(renamed.data.project.title, "Kettles");
  const list = await client.get("/api/projects?type=price_comparison&q=kett");
  assert.equal(list.data.total, 1);
  const csv = await client.get(`/api/prices/searches/${s.id}/export.csv`);
  assert.match(csv.data, /StoreB/);

  const other = await newUser();
  assert.equal((await other.client.get(`/api/prices/searches/${s.id}`)).status, 404);
  assert.equal((await other.client.patch(`/api/projects/${proj.data.project.id}`, { title: "x" })).status, 404);
  assert.equal((await other.client.post("/api/favorites", { itemType: "product", searchId: s.id, offerId: s.bestOffer.id })).status, 404);

  const analytics = await client.get("/api/analytics/summary");
  assert.equal(analytics.data.totals.priceComparisons, 1);
  assert.equal(analytics.data.totals.projectsSaved, 1);
  assert.equal(analytics.data.totals.favoritesAdded, 1);

  const sugg = await client.get("/api/prices/suggestions?q=acm");
  assert.deepEqual(sugg.data.suggestions, ["acme kettle"]);

  assert.equal((await client.del(`/api/projects/${proj.data.project.id}`)).status, 200);
  assert.equal((await client.get("/api/projects")).data.total, 0);
});
