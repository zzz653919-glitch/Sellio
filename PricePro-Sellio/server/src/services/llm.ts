/**
 * Text AI used by the Business Advisor, reports and the ad copywriter.
 * Gemini (free tier from aistudio.google.com) or OpenAI (paid). Keys stay on the server.
 */
import { config, features } from "../config.js";
import { AppError, notConfigured, upstreamError } from "../lib/errors.js";

export type ChatMessage = { role: "user" | "assistant"; content: string; images?: { mime: string; data: Buffer }[] };
export type CompleteInput = { system: string; messages: ChatMessage[]; json?: boolean; maxTokens?: number };

type FetchFn = typeof fetch;
let fetchOverride: FetchFn | null = null;
export function setLlmFetchForTests(f: FetchFn | null) {
  fetchOverride = f;
}

export function llmProvider(): { name: "gemini" | "openai"; model: string } | null {
  const pick = config.LLM_PROVIDER ?? (config.GEMINI_API_KEY ? "gemini" : config.OPENAI_API_KEY ? "openai" : null);
  if (pick === "gemini" && config.GEMINI_API_KEY) return { name: "gemini", model: config.GEMINI_MODEL };
  if (pick === "openai" && config.OPENAI_API_KEY) return { name: "openai", model: config.OPENAI_TEXT_MODEL };
  return null;
}

const NOT_CONFIGURED = "Text AI is not connected on this server. An administrator must add GEMINI_API_KEY (free tier at aistudio.google.com) or OPENAI_API_KEY.";

async function post(url: string, headers: Record<string, string>, body: unknown) {
  let res: Response;
  try {
    res = await (fetchOverride ?? fetch)(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw upstreamError("llm", "The AI service could not be reached. Try again in a moment.");
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const err = (json?.error ?? {}) as { message?: string; status?: string; code?: string };
    if (res.status === 429) throw new AppError(429, "AI_RATE_LIMITED", "The AI service limit is reached for now (free tiers have a per-minute and daily limit). Try again later.", { service: "llm" });
    throw upstreamError("llm", `AI service error: ${err.message ?? `HTTP ${res.status}`}`);
  }
  return json ?? {};
}

/** Returns the model's text answer. Never invents an answer when the service fails. */
export async function complete(input: CompleteInput): Promise<string> {
  if (!features.llm) throw notConfigured("llm", NOT_CONFIGURED);
  const p = llmProvider();
  if (!p) throw notConfigured("llm", NOT_CONFIGURED);
  let text = "";
  if (p.name === "gemini") {
    const body = await post(`${config.GEMINI_API_BASE}/models/${encodeURIComponent(p.model)}:generateContent`, { "x-goog-api-key": config.GEMINI_API_KEY! }, {
      systemInstruction: { parts: [{ text: input.system }] },
      contents: input.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [...(m.images ?? []).map((img) => ({ inlineData: { mimeType: img.mime, data: img.data.toString("base64") } })), { text: m.content }],
      })),
      generationConfig: {
        ...(input.json ? { responseMimeType: "application/json" } : {}),
        // "Thinking" tokens count against maxOutputTokens. 2.5 Flash can turn thinking off;
        // newer models get extra room so the answer is not cut off.
        ...(/2\.5-flash/i.test(p.model)
          ? { maxOutputTokens: input.maxTokens ?? 4096, thinkingConfig: { thinkingBudget: 0 } }
          : { maxOutputTokens: (input.maxTokens ?? 4096) + 6000 }),
      },
    });
    const cand = (body.candidates as { content?: { parts?: { text?: string }[] }; finishReason?: string }[] | undefined)?.[0];
    text = (cand?.content?.parts ?? []).map((x) => x.text ?? "").join("").trim();
    if (!text && cand?.finishReason === "SAFETY") throw upstreamError("llm", "The AI service declined to answer this request.");
  } else {
    const body = await post(`${config.OPENAI_BASE_URL}/chat/completions`, { Authorization: `Bearer ${config.OPENAI_API_KEY}` }, {
      model: p.model,
      messages: [
        { role: "system", content: input.system },
        ...input.messages.map((m) => (m.images?.length
          ? { role: m.role, content: [...m.images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.data.toString("base64")}` } })), { type: "text", text: m.content }] }
          : { role: m.role, content: m.content })),
      ],
      // Reasoning models spend part of the budget on hidden reasoning: keep it low and leave room for the answer.
      ...(/^(gpt-5|o\d)/i.test(p.model) ? { reasoning_effort: "low", max_completion_tokens: (input.maxTokens ?? 4096) + 4000 } : { max_completion_tokens: input.maxTokens ?? 4096 }),
      ...(input.json ? { response_format: { type: "json_object" } } : {}),
    });
    text = ((body.choices as { message?: { content?: string } }[] | undefined)?.[0]?.message?.content ?? "").trim();
  }
  if (!text) throw upstreamError("llm", "The AI service returned an empty answer. Try again.");
  return text;
}

/** Ask for JSON and parse it (tolerates ```json fences). */
export async function completeJson<T>(input: Omit<CompleteInput, "json">): Promise<T> {
  const text = await complete({ ...input, json: true });
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw upstreamError("llm", "The AI service returned an answer in the wrong format. Try again.");
  }
}

export const LANGUAGE_NAME: Record<string, string> = { en: "English", uz: "Uzbek (Latin script)", ru: "Russian" };
