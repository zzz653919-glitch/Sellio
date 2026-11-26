import "./env.js";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { setImageProviderForTests, type ImageProvider } from "../src/modules/studio/provider.js";
import { closeServer, fileForm, makePng, newUser } from "./helpers.js";

after(() => {
  setImageProviderForTests(null);
  closeServer();
});

type C = Awaited<ReturnType<typeof newUser>>["client"];
async function waitFor(client: C, id: string) {
  for (let i = 0; i < 200; i++) {
    const s = (await client.get(`/api/studio/generations/${id}`)).data.generation.status;
    if (s === "succeeded" || s === "failed") return;
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error("generation did not finish");
}

async function upload(client: Awaited<ReturnType<typeof newUser>>["client"], png = makePng(400, 400)) {
  const r = await client.req("POST", "/api/studio/uploads", undefined, { form: fileForm("file", png, "shoe.png", "image/png") });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.upload.id as string;
}

const body = (uploadId: string) => ({
  uploadId, productName: "Running shoe", category: "Fashion & Apparel", style: "minimal_studio", background: "studio_white",
  settings: { size: "square", quality: "medium", lighting: "soft" },
});

test("upload validation uses the file bytes", async () => {
  const { client } = await newUser();
  const fake = await client.req("POST", "/api/studio/uploads", undefined, { form: fileForm("file", Buffer.from("not an image at all, just text....."), "x.png", "image/png") });
  assert.equal(fake.status, 400);
  const small = await client.req("POST", "/api/studio/uploads", undefined, { form: fileForm("file", makePng(100, 100), "s.png", "image/png") });
  assert.equal(small.status, 400);
  assert.match(small.data.error.message, /too small/);
  await upload(client);
});

test("without a configured AI provider, generation is refused and nothing fake is stored", async () => {
  const { client } = await newUser();
  const id = await upload(client);
  const r = await client.post("/api/studio/generations", body(id));
  assert.equal(r.status, 503);
  assert.equal(r.data.error.code, "SERVICE_NOT_CONFIGURED");
  assert.equal((await client.get("/api/studio/generations")).data.total, 0);
});

test("generation pipeline stores the provider's image, notifies, and supports retry", async () => {
  const output = makePng(512, 512, [200, 40, 40]);
  let fail = true;
  const provider: ImageProvider = {
    name: "test", model: "test-model",
    async edit(req) {
      assert.match(req.prompt, /Running shoe/);
      assert.equal(req.mime, "image/png");
      if (fail) throw new Error("Upstream exploded");
      return output;
    },
  };
  setImageProviderForTests(provider);
  const { client } = await newUser();
  const uploadId = await upload(client);

  const first = await client.post("/api/studio/generations", body(uploadId));
  assert.equal(first.status, 202);
  await waitFor(client, first.data.generation.id);
  const failed = await client.get(`/api/studio/generations/${first.data.generation.id}`);
  assert.equal(failed.data.generation.status, "failed");
  assert.match(failed.data.generation.error, /Upstream exploded/);

  fail = false;
  const retry = await client.post(`/api/studio/generations/${first.data.generation.id}/retry`);
  assert.equal(retry.status, 202);
  await waitFor(client, retry.data.generation.id);
  const ok = (await client.get(`/api/studio/generations/${retry.data.generation.id}`)).data.generation;
  assert.equal(ok.status, "succeeded");
  assert.equal(ok.retryOf, first.data.generation.id);
  const img = await client.req("GET", ok.resultUrl, undefined, { raw: true });
  assert.equal(img.status, 200);
  assert.deepEqual(Buffer.from(img.data), output);

  const notes = await client.get("/api/notifications");
  assert.ok(notes.data.items.some((n: { title: string }) => n.title === "Advertisement ready"));
  assert.ok(notes.data.items.some((n: { title: string }) => n.title === "Advertisement failed"));

  const save = await client.post("/api/projects", { type: "advertisement", refId: ok.id });
  assert.equal(save.status, 201);
  assert.equal((await client.post("/api/projects", { type: "advertisement", refId: ok.id })).status, 409);
  const dash = await client.get("/api/dashboard");
  assert.equal(dash.data.stats.adsCreated, 1);
  assert.equal(dash.data.stats.totalProjects, 1);
});

test("a provider returning a non-image is treated as a failure", async () => {
  setImageProviderForTests({ name: "test", model: "m", edit: async () => Buffer.from("<html>error</html>".repeat(5)) });
  const { client } = await newUser();
  const r = await client.post("/api/studio/generations", body(await upload(client)));
  await waitFor(client, r.data.generation.id);
  const g = (await client.get(`/api/studio/generations/${r.data.generation.id}`)).data.generation;
  assert.equal(g.status, "failed");
  assert.equal(g.resultUrl, null);
});

test("free plan: 2 AI advertisement images per day", async () => {
  setImageProviderForTests({ name: "test", model: "m", edit: async () => makePng(300, 300) });
  const { client } = await newUser();
  const id = await upload(client);
  for (let i = 0; i < 2; i++) {
    const r = await client.post("/api/studio/generations", body(id));
    assert.equal(r.status, 202);
    await waitFor(client, r.data.generation.id);
  }
  const third = await client.post("/api/studio/generations", body(id));
  assert.equal(third.status, 429);
  assert.equal(third.data.error.code, "LIMIT_REACHED");
  assert.ok(["images_per_day", "requests"].includes(third.data.error.details.metric));
});

test("users cannot read each other's files or generations", async () => {
  setImageProviderForTests({ name: "test", model: "m", edit: async () => makePng(300, 300) });
  const a = await newUser();
  const b = await newUser();
  const uploadId = await upload(a.client);
  const r = await a.client.post("/api/studio/generations", body(uploadId));
  await waitFor(a.client, r.data.generation.id);
  assert.equal((await b.client.get(`/api/files/${uploadId}`)).status, 404);
  assert.equal((await b.client.get(`/api/studio/generations/${r.data.generation.id}`)).status, 404);
  assert.equal((await b.client.del(`/api/studio/generations/${r.data.generation.id}`)).status, 404);
  assert.equal((await b.client.post("/api/studio/generations", body(uploadId))).status, 404);
});
