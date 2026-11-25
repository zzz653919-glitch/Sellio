import "./env.js";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { setBlobForTests } from "../src/services/storage.js";
import { closeServer, fileForm, makePng, newUser } from "./helpers.js";

after(() => { setBlobForTests(null); closeServer(); });

/** In-memory stand-in for the Vercel Blob SDK (put/get/del with the same shapes). */
function fakeBlob() {
  const store = new Map<string, { data: Buffer; type: string }>();
  const calls: string[] = [];
  return {
    store, calls,
    async put(pathname: string, body: unknown, opts: { access: string; contentType?: string; addRandomSuffix?: boolean }) {
      calls.push(`put:${opts.access}`);
      const name = opts.addRandomSuffix ? pathname.replace(/(\.\w+)$/, `-r4nd0m$1`) : pathname;
      store.set(name, { data: Buffer.from(body as Buffer), type: opts.contentType ?? "" });
      return { pathname: name, url: `https://store.private.blob.vercel-storage.com/${name}`, downloadUrl: "", contentType: opts.contentType ?? "", contentDisposition: "", etag: "e" };
    },
    async get(pathname: string, opts: { access: string }) {
      calls.push(`get:${opts.access}`);
      const f = store.get(pathname);
      if (!f) return null;
      return { stream: new Blob([new Uint8Array(f.data)]).stream(), headers: new Headers(), blob: { pathname, contentType: f.type, size: f.data.length } };
    },
    async del(pathname: string | string[]) {
      for (const p of [pathname].flat()) { calls.push("del"); store.delete(p); }
    },
  };
}

test("Vercel Blob driver: avatar is stored privately, served to its owner only, and removed", async () => {
  const blob = fakeBlob();
  setBlobForTests(blob as never);
  const { client } = await newUser();
  const png = makePng(300, 300);
  const up = await client.req("POST", "/api/user/avatar", undefined, { form: fileForm("file", png, "me.png", "image/png") });
  assert.equal(up.status, 200, JSON.stringify(up.data));
  assert.equal(blob.store.size, 1);
  assert.ok([...blob.store.keys()][0].startsWith("avatar/"));
  assert.ok(blob.calls.includes("put:private"));

  const img = await client.req("GET", "/api/user/avatar", undefined, { raw: true });
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(img.data), png);

  const other = await newUser();
  assert.equal((await other.client.get("/api/user/avatar")).status, 404);

  // Replacing the photo deletes the old blob; deleting the account deletes the rest.
  await client.req("POST", "/api/user/avatar", undefined, { form: fileForm("file", makePng(320, 320), "me2.png", "image/png") });
  assert.equal(blob.store.size, 1);
  assert.equal((await client.del("/api/user/account", { password: "secret123" })).status, 200);
  assert.equal(blob.store.size, 0);
});

test("health check reports the configuration without secrets", async () => {
  const { baseUrl } = await import("./helpers.js");
  const r = await fetch(`${baseUrl}/api/health`);
  const body = await r.json();
  assert.equal(r.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.platform, "server");
  assert.equal(body.checks.database.ok, true);
  assert.ok(!JSON.stringify(body).includes("test-token"));
});
