import "./env.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { cutOutWhite, decodePng, encodePng } from "../src/lib/png.js";
import { OpenAIImageProvider, WHITE_BACKGROUND } from "../src/modules/studio/provider.js";

/** A white 40×40 PNG with a dark-blue 20×20 square in the middle. */
function productOnWhite() {
  const w = 40, h = 40, data = Buffer.alloc(w * h * 4, 255);
  for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) { const o = (y * w + x) * 4; data[o] = 20; data[o + 1] = 40; data[o + 2] = 160; }
  return encodePng({ width: w, height: h, data });
}

test("PNG round trip and white background cut-out", () => {
  const img = decodePng(productOnWhite())!;
  assert.equal(img.width, 40);
  const cut = cutOutWhite(img)!;
  const alpha = (x: number, y: number) => cut.data[(y * 40 + x) * 4 + 3];
  assert.equal(alpha(0, 0), 0, "corner is transparent");
  assert.equal(alpha(5, 20), 0);
  assert.equal(alpha(20, 20), 255, "product stays solid");
  // A photo that does not sit on white is left alone.
  const dark = { width: 10, height: 10, data: Buffer.alloc(400, 30) };
  assert.equal(cutOutWhite(dark), null);
});

test("model without transparent backgrounds: retried on white and cut out, then remembered", async () => {
  const bodies: FormData[] = [];
  const fake = (async (_url: string, init: RequestInit) => {
    const form = init.body as FormData;
    bodies.push(form);
    if (form.get("background") === "transparent") {
      return new Response(JSON.stringify({ error: { message: "Transparent background is not supported for this model." } }), { status: 400, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ data: [{ b64_json: productOnWhite().toString("base64") }] }), { headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  const p = new OpenAIImageProvider("k", "test-image-model", "https://example.test/v1", fake);
  const req = { image: productOnWhite(), mime: "image/png", prompt: "Make an ad", size: "1024x1024", quality: "low" as const, transparent: true };
  const out = decodePng(await p.edit(req))!;
  assert.equal(bodies.length, 2, "one refused try, one on white");
  assert.equal(bodies[1].get("background"), null);
  assert.ok(String(bodies[1].get("prompt")).includes(WHITE_BACKGROUND));
  assert.equal(out.data[3], 0, "the result is a transparent PNG");
  assert.equal(out.data[(20 * 40 + 20) * 4 + 3], 255);
  await p.edit(req);
  assert.equal(bodies.length, 3, "the model is remembered: no second refused try");
  // Ordinary (not transparent) requests are unchanged.
  await p.edit({ ...req, transparent: false });
  assert.equal(String(bodies[3].get("prompt")), "Make an ad");
});
