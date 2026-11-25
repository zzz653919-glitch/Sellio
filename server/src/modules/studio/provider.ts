import { config } from "../../config.js";
import { notConfigured, upstreamError } from "../../lib/errors.js";

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
    const ext = req.mime === "image/png" ? "png" : req.mime === "image/webp" ? "webp" : "jpg";
    const form = new FormData();
    form.append("model", this.model);
    form.append("image", new Blob([new Uint8Array(req.image)], { type: req.mime }), `product.${ext}`);
    form.append("prompt", req.prompt);
    form.append("size", req.size);
    form.append("quality", req.quality);
    form.append("n", "1");
    if (req.transparent) form.append("background", "transparent");

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
      throw upstreamError("image_generation", `The AI image service ${reason}. Please retry.`);
    }

    const body = (await response.json().catch(() => null)) as
      | { data?: { b64_json?: string; url?: string }[]; error?: { message?: string } }
      | null;
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
  return new OpenAIImageProvider(config.OPENAI_API_KEY, config.IMAGE_MODEL, config.OPENAI_BASE_URL);
}
