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

test("free plan: 5 AI advertisement images per day", async () => {
  setImageProviderForTests({ name: "test", model: "m", edit: async () => makePng(300, 300) });
  const { client } = await newUser();
  const id = await upload(client);
  for (let i = 0; i < 5; i++) {
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

test("only the photo is needed: the AI decides; a finished ad can be changed with a request in plain words", async () => {
  const prompts: string[] = [];
  setImageProviderForTests({ name: "test", model: "m", edit: async (i: { prompt: string }) => { prompts.push(i.prompt); return makePng(300, 300); } } as ImageProvider);
  const { client } = await newUser();
  const id = await upload(client);
  const r = await client.post("/api/studio/generations", { uploadId: id });
  assert.equal(r.status, 202, JSON.stringify(r.data));
  await waitFor(client, r.data.generation.id);
  const g = (await client.get(`/api/studio/generations/${r.data.generation.id}`)).data.generation;
  assert.equal(g.status, "succeeded");
  assert.equal(g.productName, "shoe", "name taken from the file");
  assert.match(prompts[0], /art director/i);
  // change it with AI
  assert.equal((await client.post(`/api/studio/generations/${g.id}/edit`, { instructions: "x" })).status, 400);
  const e = await client.post(`/api/studio/generations/${g.id}/edit`, { instructions: "make the background light blue" });
  assert.equal(e.status, 202, JSON.stringify(e.data));
  await waitFor(client, e.data.generation.id);
  const ge = (await client.get(`/api/studio/generations/${e.data.generation.id}`)).data.generation;
  assert.equal(ge.status, "succeeded");
  assert.equal(ge.uploadId, g.resultUploadId, "the finished ad is the input");
  assert.match(prompts[1], /light blue/);
  // deleting the first ad keeps the picture the change started from
  assert.equal((await client.del(`/api/studio/generations/${g.id}`)).status, 200);
  assert.equal((await client.req("GET", ge.originalUrl, undefined, { raw: true })).status, 200);
  // a running or someone else's generation cannot be changed
  const other = await newUser();
  assert.equal((await other.client.post(`/api/studio/generations/${ge.id}/edit`, { instructions: "make it red" })).status, 404);
});

test("a change request in Uzbek is translated for the image model, and may change the product's colour when asked", async () => {
  const { config, features } = await import("../src/config.js");
  const { setLlmFetchForTests } = await import("../src/services/llm.js");
  const c = config as { GEMINI_API_KEY?: string; LLM_PROVIDER?: string };
  c.GEMINI_API_KEY = "g-key"; c.LLM_PROVIDER = "gemini"; features.llm = true;
  const asked: string[] = [];
  let answer: unknown = { english: "Make the bag itself bright red", changesProduct: true };
  setLlmFetchForTests((async (_url: string, init: { body: string }) => {
    asked.push(init.body);
    if (answer === "fail") return new Response("{}", { status: 500 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as never);
  try {
    const prompts: string[] = [];
    setImageProviderForTests({ name: "test", model: "m", edit: async (i: { prompt: string }) => { prompts.push(i.prompt); return makePng(300, 300); } } as ImageProvider);
    const { client } = await newUser();
    const r = await client.post("/api/studio/generations", { uploadId: await upload(client) });
    await waitFor(client, r.data.generation.id);
    // 1) asks to change the product: translated, and the product may change
    const e1 = await client.post(`/api/studio/generations/${r.data.generation.id}/edit`, { instructions: "sumkani qizil qil" });
    assert.equal(e1.status, 202, JSON.stringify(e1.data));
    await waitFor(client, e1.data.generation.id);
    assert.match(asked[0], /sumkani qizil qil/);
    assert.match(prompts[1], /Request: Make the bag itself bright red/);
    assert.match(prompts[1], /change exactly that/);
    // 2) a background change: the product is kept exactly
    answer = { english: "Make the background dark blue", changesProduct: false };
    const e2 = await client.post(`/api/studio/generations/${e1.data.generation.id}/edit`, { instructions: "fonni to'q ko'k qil" });
    await waitFor(client, e2.data.generation.id);
    assert.match(prompts[2], /Request: Make the background dark blue/);
    assert.match(prompts[2], /Keep the product exactly as it is — same shape, proportions, colours/);
    assert.doesNotMatch(prompts[2], /unless the request explicitly/);
    // 2b) hang it on a hanger: the presentation changes, the design is kept
    answer = { english: "Hang the jacket on a wooden hanger", changesProduct: false, changesPresentation: true };
    const eh = await client.post(`/api/studio/generations/${e2.data.generation.id}/edit`, { instructions: "veshalkaga il" });
    await waitFor(client, eh.data.generation.id);
    const ph = prompts[prompts.length - 1];
    assert.match(ph, /Request: Hang the jacket on a wooden hanger/);
    assert.match(ph, /present the product differently/);
    assert.match(ph, /keep its design exactly/);
    assert.doesNotMatch(ph, /Keep the product exactly as it is/);
    // 3) the text AI fails: the request is used as written, never blocked
    answer = "fail";
    const e3 = await client.post(`/api/studio/generations/${e2.data.generation.id}/edit`, { instructions: "yorug'likni iliqroq qil" });
    assert.equal(e3.status, 202);
    await waitFor(client, e3.data.generation.id);
    const pf = prompts[prompts.length - 1];
    assert.match(pf, /Request: yorug'likni iliqroq qil/);
    assert.match(pf, /unless the request explicitly asks to change the product's colour/);
    assert.match(pf, /on a hanger/);
    // the history keeps what the user wrote
    const g3 = (await client.get(`/api/studio/generations/${e3.data.generation.id}`)).data.generation;
    assert.equal(g3.status, "succeeded");
  } finally {
    c.GEMINI_API_KEY = undefined; c.LLM_PROVIDER = undefined; features.llm = false; setLlmFetchForTests(null);
  }
});
