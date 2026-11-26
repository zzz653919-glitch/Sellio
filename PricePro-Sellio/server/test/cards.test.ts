import "./env.js";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { config, features } from "../src/config.js";
import { setLlmFetchForTests } from "../src/services/llm.js";
import { closeServer, fileForm, makePng, newUser } from "./helpers.js";

const gemini = (obj: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
const enableAi = () => {
  const c = config as { GEMINI_API_KEY?: string; LLM_PROVIDER?: string };
  c.GEMINI_API_KEY = "g-key"; c.LLM_PROVIDER = "gemini"; features.llm = true;
};
const disableAi = () => {
  const c = config as { GEMINI_API_KEY?: string; LLM_PROVIDER?: string };
  c.GEMINI_API_KEY = undefined; c.LLM_PROVIDER = undefined; features.llm = false; setLlmFetchForTests(null);
};
after(() => { disableAi(); closeServer(); });

type C = Awaited<ReturnType<typeof newUser>>["client"];
async function upload(client: C) {
  const r = await client.req("POST", "/api/studio/uploads", undefined, { form: fileForm("file", makePng(400, 400), "bag.png", "image/png") });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.upload.id as string;
}
const doc = (src: string) => ({
  v: 1, templateId: "card-uzum-bold", format: "custom", w: 1080, h: 1440, bg: "#ffffff",
  els: [
    { id: "a", type: "image", src, x: 0.1, y: 0.2, w: 0.8, h: 0.5, fit: "contain" },
    { id: "b", type: "image", src: "icon:truck|color=#7000FF", x: 0.1, y: 0.8, w: 0.08, h: 0.06, fit: "contain" },
    { id: "c", type: "text", text: "Charm sumka", x: 0.1, y: 0.05, w: 0.8, h: 0.1, font: "Montserrat", size: 80, weight: 800, color: "#111", align: "left" },
  ],
});
const thumb = `data:image/jpeg;base64,${makePng(20, 20).toString("base64")}`;

test("card texts: the AI writes them from the seller's facts and the photo; limits and checks apply", async () => {
  const { client } = await newUser();
  const opts = (await client.get("/api/cards/options")).data;
  assert.deepEqual(Object.keys(opts.marketplaces), ["uzum", "wildberries", "ozon", "yandex", "other"]);
  assert.deepEqual(opts.marketplaces.uzum.sizes, [{ w: 1080, h: 1440 }]);
  const body = { name: "Charm sumka", features: ["Haqiqiy charm", "30×20 sm"], benefits: ["Uzoq xizmat qiladi"], price: "350 000 so'm", marketplace: "uzum", language: "uz" };
  // not configured: an honest error, nothing invented
  assert.equal((await client.post("/api/cards/copy", body)).status, 503);

  enableAi();
  let sent = "";
  setLlmFetchForTests((async (_u: string, init: { body: string }) => {
    sent = init.body;
    return gemini({
      title: "Charm sumka", subtitle: "Har kuni uchun qulay", badge: "Yangi",
      benefits: [{ title: "Haqiqiy charm", text: "Uzoq xizmat qiladi", icon: "gem" }, { title: "Ixcham", text: "30×20 sm", icon: "not-an-icon" }, { title: "", text: "no title" }],
      specs: [{ label: "Material", value: "Charm" }, { label: "O'lcham", value: "30×20 sm" }],
      marketplaceTitle: "Ayollar charm sumkasi, 30×20 sm", description: "Tavsif matni.", bullets: ["a", "b"], adTexts: ["Reklama 1"], keywords: ["sumka", "charm"],
      extra: "ignored",
    });
  }) as never);
  const id = await upload(client);
  const r = await client.post("/api/cards/copy", { ...body, uploadId: id });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const c = r.data.copy;
  assert.equal(c.title, "Charm sumka");
  assert.equal(c.benefits.length, 2, "a benefit without a title is dropped");
  assert.equal(c.benefits[0].icon, "gem");
  assert.equal(c.benefits[1].icon, "check", "unknown icons become a check mark");
  assert.equal(c.specs.length, 2);
  assert.equal(c.extra, undefined);
  assert.match(sent, /inlineData|inline_data/, "the photo is sent to the AI");
  assert.match(sent, /Uzbek/);
  assert.match(sent, /Never invent/);
  // the request is counted as one AI text request
  const sub = (await client.get("/api/subscription")).data;
  assert.equal(sub.usage.metrics.ai.used, 1);
  // someone else's photo cannot be used
  const other = await newUser();
  assert.equal((await other.client.post("/api/cards/copy", { ...body, uploadId: id })).status, 404);
  // validation
  assert.equal((await client.post("/api/cards/copy", { ...body, name: "" })).status, 400);
  assert.equal((await client.post("/api/cards/copy", { ...body, marketplace: "amazon" })).status, 400);
  disableAi();
});

test("saved cards: created together, listed, renamed, autosaved, duplicated, deleted; private; pictures must be uploaded files", async () => {
  const { client } = await newUser();
  const photo = await upload(client);
  const src = `/api/files/${photo}`;
  const card = (layout: string) => ({ name: "Charm sumka", marketplace: "uzum", layout, photoUploadId: photo, input: { name: "Charm sumka" }, copy: { title: "Charm sumka" }, doc: doc(src), thumb });
  const created = await client.post("/api/cards", { cards: [card("bold"), card("hero"), card("split")] });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const cards = created.data.cards;
  assert.equal(cards.length, 3);
  assert.equal(new Set(cards.map((x: { groupId: string }) => x.groupId)).size, 1, "variants of one product belong together");
  assert.deepEqual(cards.map((x: { layout: string }) => x.layout), ["bold", "hero", "split"]);
  // embedded pictures (data: URLs) and foreign links are refused
  assert.equal((await client.post("/api/cards", { cards: [{ ...card("x"), doc: doc("data:image/png;base64,AAAA") }] })).status, 400);
  assert.equal((await client.post("/api/cards", { cards: [{ ...card("x"), doc: doc("https://evil.example/x.png") }] })).status, 400);
  assert.equal((await client.post("/api/cards", { cards: [{ ...card("x"), thumb: "javascript:alert(1)" }] })).status, 400);

  const list = (await client.get("/api/cards")).data.items;
  assert.equal(list.length, 3);
  assert.equal(list[0].w, 1080);
  assert.equal(list[0].doc, undefined, "the list is light");
  assert.match(list[0].thumb, /^\/api\/cards\/[0-9a-f-]+\/thumb\?v=/, "previews are separate files");
  const th = await client.req("GET", list[0].thumb, undefined, { raw: true });
  assert.equal(th.status, 200);
  assert.match(String(th.headers?.get?.("content-type") ?? th.headers?.["content-type"] ?? ""), /image\/jpeg/);
  assert.equal((await (await newUser()).client.req("GET", list[0].thumb, undefined, { raw: true })).status, 404, "previews are private");
  const one = cards[0].id;
  // rename + autosave a changed design
  const changed = doc(src); changed.els[2].text = "Yangi sarlavha"; changed.w = 900; changed.h = 1200;
  const p = await client.req("PATCH", `/api/cards/${one}`, { name: "Sumka — Uzum", doc: changed });
  assert.equal(p.status, 200, JSON.stringify(p.data));
  const got = (await client.get(`/api/cards/${one}`)).data.card;
  assert.equal(got.name, "Sumka — Uzum");
  assert.equal(got.doc.els[2].text, "Yangi sarlavha");
  assert.equal(got.w, 900);
  // duplicate
  const d = await client.post(`/api/cards/${one}/duplicate`, {});
  assert.equal(d.status, 201);
  assert.equal(d.data.card.name, "Sumka — Uzum (copy)");
  assert.equal(d.data.card.doc.els[2].text, "Yangi sarlavha");
  // private
  const other = await newUser();
  assert.equal((await other.client.get(`/api/cards/${one}`)).status, 404);
  assert.equal((await other.client.req("PATCH", `/api/cards/${one}`, { name: "x" })).status, 404);
  assert.equal((await other.client.del(`/api/cards/${one}`)).status, 404);
  assert.equal((await other.client.post("/api/cards", { cards: [card("x")] })).status, 404, "another user's photo");
  // the photo cannot be deleted while cards use it
  const del = await client.req("DELETE", `/api/files/${photo}?force=1`);
  assert.equal(del.status, 400);
  assert.match(del.data.error.message, /product card/);
  // delete
  assert.equal((await client.del(`/api/cards/${one}`)).status, 200);
  assert.equal((await client.get(`/api/cards/${one}`)).status, 404);
  assert.equal((await client.get("/api/cards")).data.items.length, 3);
});
