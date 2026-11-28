import { recordApiCall } from "../../services/apiLog.js";
import { settings } from "../../services/settings.js";
import { config } from "../../config.js";
import { notConfigured, upstreamError } from "../../lib/errors.js";
import { cutOutWhite, decodePng, encodePng } from "../../lib/png.js";

/** Models that answered "transparent background is not supported" (remembered while the server runs). */
const NO_TRANSPARENCY = new Set<string>();
const NOT_SUPPORTED = /transparent background is not supported|background.*not supported|does not support.*transparen/i;
/** Added to the prompt when the model cannot make the background transparent itself. */
export const WHITE_BACKGROUND = "Place the product on a plain, pure white (#FFFFFF) seamless background that fills the whole frame, with nothing else in it: no shadow, no reflection, no props, no text. Keep a clear margin around the product.";

/** Turns a white-background result into a transparent PNG; the original is kept if that is not possible. */
export function makeTransparent(image: Buffer): Buffer {
  const decoded = decodePng(image);
  const cut = decoded ? cutOutWhite(decoded) : null;
  return cut ? encodePng(cut) : image;
}

export type EditRequest = {
  image: Buffer;
  mime: string;
  prompt: string;
  size: string;
  quality: "low" | "medium" | "high";
  transparent: boolean;
};

export interface ImageProvider {
  readonly name: string;
  readonly model: string;
  edit(req: EditRequest): Promise<Buffer>;
}

type FetchFn = typeof fetch;

/**
 * OpenAI Images API (image edits). The product photo is sent as the reference
 * image and the model returns a new advertising image as base64.
 */
export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai";
  constructor(
    private apiKey: string,
    readonly model: string,
    private baseUrl: string,
    private fetchFn: FetchFn = fetch,
  ) {}

  async edit(req: EditRequest): Promise<Buffer> {
    if (!req.transparent) return this.call(req, false);
    if (!NO_TRANSPARENCY.has(this.model)) {
      try {
        return await this.call(req, true);
      } catch (err) {
        if (!(err instanceof Error && NOT_SUPPORTED.test(err.message))) throw err;
        NO_TRANSPARENCY.add(this.model);
      }
    }
    // The model cannot make a transparent background: make it on white and cut the white out here.
    const white = await this.call({ ...req, prompt: `${req.prompt}\n\n${WHITE_BACKGROUND}` }, false);
    return makeTransparent(white);
  }

  private async call(req: EditRequest, transparent: boolean): Promise<Buffer> {
    const ext = req.mime === "image/png" ? "png" : req.mime === "image/webp" ? "webp" : "jpg";
    const form = new FormData();
    form.append("model", this.model);
    form.append("image", new Blob([new Uint8Array(req.image)], { type: req.mime }), `product.${ext}`);
    form.append("prompt", req.prompt);
    form.append("size", req.size);
    form.append("quality", req.quality);
    form.append("n", "1");
    if (transparent) form.append("background", "transparent");


    const started = Date.now();
    const log = (ok: boolean, status: number | null, error: string | null) => recordApiCall({ provider: "openai_image", operation: `edit ${this.model}`, ok, status, ms: Date.now() - started, error });
    let response: Response;
    try {
      response = await this.fetchFn(`${this.baseUrl.replace(/\/$/, "")}/images/edits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(240_000),
      });
    } catch (err) {
      const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "could not be reached";
      await log(false, null, reason);
      throw upstreamError("image_generation", `The AI image service ${reason}. Please retry.`);
    }

    const body = (await response.json().catch(() => null)) as
      | { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } }
      | null;
    await log(response.ok, response.status, response.ok ? null : (body?.error?.message ?? `HTTP ${response.status}`));
    if (!response.ok) {
      const msg = body?.error?.message ?? `HTTP ${response.status}`;
      throw upstreamError("image_generation", `The AI image service returned an error: ${msg}`);
    }
    const item = body?.data?.[0];
    if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
    if (item?.url) {
      const img = await this.fetchFn(item.url, { signal: AbortSignal.timeout(60_000) });
      if (!img.ok) throw upstreamError("image_generation", "Could not download the generated image.");
      return Buffer.from(await img.arrayBuffer());
    }
    throw upstreamError("image_generation", "The AI image service returned no image.");
  }
}

let override: ImageProvider | null = null;

/** Test hook: replace the provider (used only by automated tests). */
export function setImageProviderForTests(p: ImageProvider | null) {
  override = p;
}

export function getImageProvider(): ImageProvider {
  if (override) return override;
  if (!config.OPENAI_API_KEY) {
    throw notConfigured(
      "image_generation",
      "AI image generation is not configured on this server. An administrator must set OPENAI_API_KEY.",
    );
  }
  return new OpenAIImageProvider(config.OPENAI_API_KEY, settings().ai.imageModel || config.IMAGE_MODEL, config.OPENAI_BASE_URL);
}
