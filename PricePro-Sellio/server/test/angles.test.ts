import "./env.js";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { buildAnglePrompt } from "../src/modules/angles/routes.js";
import { closeServer, fileForm, makePng, newUser, type Client } from "./helpers.js";

after(() => closeServer());

async function upload(client: Client) {
  const r = await client.req("POST", "/api/studio/uploads", undefined, { form: fileForm("file", makePng(400, 400), "Charm sumka.png", "image/png") });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.upload.id as string;
}
async function settle(client: Client, sessionId: string) {
  for (let i = 0; i < 60; i++) {
    const s = (await client.get(`/api/angles/sessions/${sessionId}`)).data.session;
    if (s.items.every((x: { status: string }) => ["succeeded", "failed"].includes(x.status))) return s;
    await new Promise((ok) => setTimeout(ok, 50));
  }
  throw new Error("generations did not finish");
}

test("angle prompts keep the product the same and describe the view", () => {
  const p = buildAnglePrompt({ angle: "back", background: "custom", color: "#112233", lighting: "cinematic", productName: "Sumka", variant: 1, variants: 2 });
  assert.match(p, /back view/);
  assert.match(p, /#112233/);
  assert.match(p, /cinematic/);
  assert.match(p, /THE PRODUCT MUST STAY EXACTLY THE SAME/);
  assert.match(p, /Do not invent features that are not visible/);
  assert.match(p, /Variation 2 of 2/);
});

test("API: multi-angle generator — session, several angles, regenerate, delete, My Projects and plan limits", async () => {
  const { setImageProviderForTests } = await import("../src/modules/studio/provider.js");
  const calls: { prompt: string; size: string; quality: string }[] = [];
  setImageProviderForTests({ name: "test", model: "m", edit: async (r: { prompt: string; size: string; quality: string }) => {
    calls.push(r);
    if (r.prompt.includes("underside")) throw new Error("model failed"); // the bottom view fails in this test
    return makePng(320, 320);
  } } as never);
  try {
    const { client } = await newUser();
    const opts = (await client.get("/api/angles/options")).data;
    assert.equal(opts.angles.length, 15);
    assert.deepEqual(opts.counts, [2, 4, 6, 8, 12]);
    assert.ok(opts.angles.find((a: { key: string }) => a.key === "back").needsCheck);
    const uploadId = await upload(client);
    const c = await client.post("/api/angles/sessions", { uploadId });
    assert.equal(c.status, 201, JSON.stringify(c.data));
    const id = c.data.session.id;
    assert.equal(c.data.session.name, "Charm sumka");
    // bad requests
    assert.equal((await client.post(`/api/angles/sessions/${id}/generate`, { angles: [], count: 2 })).status, 400);
    assert.equal((await client.post(`/api/angles/sessions/${id}/generate`, { angles: ["front"], count: 3 })).status, 400);
    // two angles, four images: each angle twice (variations)
    const g = await client.post(`/api/angles/sessions/${id}/generate`, { angles: ["front", "back"], count: 4, background: "studio", lighting: "soft", quality: "low", ratio: "2:3" });
    assert.equal(g.status, 202, JSON.stringify(g.data));
    assert.equal(g.data.items.length, 4);
    const s = await settle(client, id);
    assert.deepEqual(s.items.map((x: { angle: string }) => x.angle), ["front", "back", "front", "back"]);
    assert.ok(s.items.every((x: { status: string; resultUrl: string }) => x.status === "succeeded" && x.resultUrl));
    assert.equal(s.items[1].needsCheck, true, "the back cannot be seen in a front photo: marked to check");
    assert.equal(s.items[0].needsCheck, false);
    assert.equal(calls.length, 4);
    assert.match(calls[1].prompt, /back view/);
    assert.match(calls[2].prompt, /Variation 2 of 2/);
    assert.equal(calls[0].size, "1024x1536");
    assert.equal(calls[0].quality, "low");
    const used = async () => (await client.get("/api/subscription")).data.usage.metrics.requests.used as number;
    // two images use one request of the plan: 4 images = 2 requests
    assert.equal(await used(), 2);
    // regenerated images are paired too: the first opens a request, the second uses it
    const r = await client.post(`/api/angles/items/${s.items[1].id}/regenerate`);
    assert.equal(r.status, 202, JSON.stringify(r.data));
    assert.notEqual(r.data.item.generationId, s.items[1].generationId);
    await settle(client, id);
    assert.match(calls[4].prompt, /back view/);
    assert.equal(await used(), 3);
    assert.equal((await client.post(`/api/angles/items/${s.items[0].id}/regenerate`)).status, 202);
    await settle(client, id);
    assert.equal(await used(), 3, "the second regenerated image shares the request");
    // both images of a pair fail: the request is given back
    const bad = await client.post(`/api/angles/sessions/${id}/generate`, { angles: ["bottom"], count: 2 });
    assert.equal(bad.status, 202);
    await settle(client, id);
    assert.equal(await used(), 3, "nothing counted when both images failed");
    // one of the pair fails, the other succeeds: one request
    const half = await client.post(`/api/angles/sessions/${id}/generate`, { angles: ["bottom", "top"], count: 2 });
    assert.equal(half.status, 202);
    await settle(client, id);
    assert.equal(await used(), 4);
    for (const it of [...bad.data.items, ...half.data.items]) assert.equal((await client.del(`/api/angles/items/${it.id}`)).status, 200);
    // the free limit (5) is reached part way: 4 images need 2 requests, only 1 is left
    const p = await client.post(`/api/angles/sessions/${id}/generate`, { angles: ["auto"], count: 4 });
    assert.equal(p.status, 202, JSON.stringify(p.data));
    assert.equal(p.data.items.length, 2, "one pair started");
    assert.ok(p.data.limitMessage);
    assert.ok(Date.parse(p.data.limitResetsAt) > Date.now());
    await settle(client, id);
    assert.equal(await used(), 5);
    for (const it of p.data.items) assert.equal((await client.del(`/api/angles/items/${it.id}`)).status, 200);
    const l = await client.post(`/api/angles/sessions/${id}/generate`, { angles: ["auto"], count: 2 });
    assert.equal(l.status, 429, "no images left");
    // the app is told when the limit renews
    assert.ok(Date.parse(l.data.error.details.resetsAt) > Date.now(), JSON.stringify(l.data));
    // delete an image
    assert.equal((await client.del(`/api/angles/items/${s.items[3].id}`)).status, 200);
    assert.equal((await client.get(`/api/angles/sessions/${id}`)).data.session.items.length, 3);
    // remember created product cards
    const groupId = "11111111-2222-4333-8444-555555555555";
    assert.deepEqual((await client.patch(`/api/angles/sessions/${id}`, { cardGroups: [groupId] })).data.session.settings.cardGroups, [groupId]);
    // in My Projects, reopened by id
    const projects = (await client.get("/api/projects?type=angle_session")).data;
    assert.equal(projects.items.length, 1);
    assert.equal(projects.items[0].refId, id);
    assert.match(projects.items[0].subtitle, /3 images/);
    assert.equal((await client.get("/api/angles/sessions")).data.items[0].imageCount, 3);
    // another user cannot see it
    const other = await newUser();
    assert.equal((await other.client.get(`/api/angles/sessions/${id}`)).status, 404);
    // delete the session
    assert.equal((await client.del(`/api/angles/sessions/${id}`)).status, 200);
    assert.equal((await client.get("/api/projects?type=angle_session")).data.items.length, 0);
  } finally {
    setImageProviderForTests(null);
  }
});
