/**
 * Text AI used by reports, growth explanations and the ad copywriter.
 * Gemini (free tier from aistudio.google.com) or OpenAI (paid). Keys stay on the server.
 */
import { config, features } from "../config.js";
import { AppError, notConfigured, upstreamError } from "../lib/errors.js";
import { recordApiCall } from "./apiLog.js";
import { settings } from "./settings.js";

export type ChatMessage = { role: "user" | "assistant"; content: string; images?: { mime: string; data: Buffer }[] };
export type CompleteInput = { system: string; messages: ChatMessage[]; json?: boolean; maxTokens?: number };

type FetchFn = typeof fetch;
let fetchOverride: FetchFn | null = null;
export function setLlmFetchForTests(f: FetchFn | null) {
  fetchOverride = f;
}

/** Provider and model: admin panel settings first, then environment variables. Keys only come from the environment. */
export function llmProvider(): { name: "gemini" | "openai"; model: string } | null {
  const ai = settings().ai;
  const preferred = ai.textProvider ?? config.LLM_PROVIDER;
  const pick = (preferred === "gemini" && config.GEMINI_API_KEY) || (preferred === "openai" && config.OPENAI_API_KEY)
    ? preferred
    : (config.GEMINI_API_KEY ? "gemini" : config.OPENAI_API_KEY ? "openai" : null);
  if (pick === "gemini") return { name: "gemini", model: ai.geminiModel || config.GEMINI_MODEL };
  if (pick === "openai") return { name: "openai", model: ai.openaiTextModel || config.OPENAI_TEXT_MODEL };
  return null;
}

const NOT_CONFIGURED = "Text AI is not connected on this server. An administrator must add GEMINI_API_KEY (free tier at aistudio.google.com) or OPENAI_API_KEY.";

/** An AI call that failed in a way worth retrying elsewhere: overloaded (5xx) or out of quota (429). */
class Busy extends Error {
  constructor(readonly status: number, readonly detail: string) { super(detail); }
}

async function post(url: string, headers: Record<string, string>, body: unknown, provider: "gemini" | "openai_text" = "gemini") {
  const started = Date.now();
  const log = (ok: boolean, status: number | null, error: string | null) => recordApiCall({ provider, operation: "generate_text", ok, status, ms: Date.now() - started, error });
  let res: Response;
  try {
    res = await (fetchOverride ?? fetch)(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    await log(false, null, "unreachable");
    throw new Busy(0, "unreachable");
  }
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  await log(res.ok, res.status, res.ok ? null : String(((json?.error ?? {}) as { message?: string }).message ?? `HTTP ${res.status}`));
  if (!res.ok) {
    const err = (json?.error ?? {}) as { message?: string; status?: string; code?: string };
    // Overloaded ("high demand"), temporary server errors and quota limits: another model may still answer.
    if (res.status === 429 || res.status >= 500) throw new Busy(res.status, err.message ?? `HTTP ${res.status}`);
    throw upstreamError("llm", `AI service error: ${err.message ?? `HTTP ${res.status}`}`);
  }
  return json ?? {};
}

/** Google's free models have separate quotas, so when one is busy the next one usually answers. */
const GEMINI_FALLBACKS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
const RETRY_MS = process.env.NODE_ENV === "test" ? 0 : 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGemini(model: string, input: CompleteInput): Promise<string> {
  const body = await post(`${config.GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`, { "x-goog-api-key": config.GEMINI_API_KEY! }, {
    systemInstruction: { parts: [{ text: input.system }] },
    contents: input.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [...(m.images ?? []).map((img) => ({ inlineData: { mimeType: img.mime, data: img.data.toString("base64") } })), { text: m.content }],
    })),
    generationConfig: {
      ...(input.json ? { responseMimeType: "application/json" } : {}),
      // "Thinking" tokens count against maxOutputTokens. 2.5 Flash can turn thinking off;
      // newer models get extra room so the answer is not cut off.
      ...(/2\.5-flash/i.test(model)
        ? { maxOutputTokens: input.maxTokens ?? 4096, thinkingConfig: { thinkingBudget: 0 } }
        : { maxOutputTokens: (input.maxTokens ?? 4096) + 6000 }),
    },
  });
  const cand = (body.candidates as { content?: { parts?: { text?: string }[] }; finishReason?: string }[] | undefined)?.[0];
  const text = (cand?.content?.parts ?? []).map((x) => x.text ?? "").join("").trim();
  if (!text && cand?.finishReason === "SAFETY") throw upstreamError("llm", "The AI service declined to answer this request.");
  return text;
}

async function callOpenAI(model: string, input: CompleteInput): Promise<string> {
  const body = await post(`${config.OPENAI_BASE_URL}/chat/completions`, { Authorization: `Bearer ${config.OPENAI_API_KEY}` }, {
    model,
    messages: [
      { role: "system", content: input.system },
      ...input.messages.map((m) => (m.images?.length
        ? { role: m.role, content: [...m.images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.data.toString("base64")}` } })), { type: "text", text: m.content }] }
        : { role: m.role, content: m.content })),
    ],
    // Reasoning models spend part of the budget on hidden reasoning: keep it low and leave room for the answer.
    ...(/^(gpt-5|o\d)/i.test(model) ? { reasoning_effort: "low", max_completion_tokens: (input.maxTokens ?? 4096) + 4000 } : { max_completion_tokens: input.maxTokens ?? 4096 }),
    ...(input.json ? { response_format: { type: "json_object" } } : {}),
  }, "openai_text");
  return ((body.choices as { message?: { content?: string } }[] | undefined)?.[0]?.message?.content ?? "").trim();
}

/**
 * Returns the model's text answer. Never invents an answer when the service fails.
 * When the chosen model is overloaded or out of quota it retries once, then tries the other free Gemini
 * models, then the other provider (if its key is set).
 */
export async function complete(input: CompleteInput): Promise<string> {
  if (!features.llm) throw notConfigured("llm", NOT_CONFIGURED);
  const p = llmProvider();
  if (!p) throw notConfigured("llm", NOT_CONFIGURED);
  const ai = settings().ai;
  const geminiChain = [...new Set([p.name === "gemini" ? p.model : ai.geminiModel || config.GEMINI_MODEL, ...GEMINI_FALLBACKS])];
  const openaiModel = p.name === "openai" ? p.model : ai.openaiTextModel || config.OPENAI_TEXT_MODEL;
  const attempts: { name: string; run: () => Promise<string> }[] = [];
  const gem = geminiChain.map((m) => ({ name: m, run: () => callGemini(m, input) }));
  const oa = { name: openaiModel, run: () => callOpenAI(openaiModel, input) };
  if (p.name === "gemini") { attempts.push(gem[0], gem[0], ...gem.slice(1)); if (config.OPENAI_API_KEY) attempts.push(oa); }
  else { attempts.push(oa, oa); if (config.GEMINI_API_KEY) attempts.push(...gem); }

  let last: Busy | null = null;
  for (let i = 0; i < attempts.length; i++) {
    try {
      const text = await attempts[i].run();
      if (!text) throw upstreamError("llm", "The AI service returned an empty answer. Try again.");
      return text;
    } catch (err) {
      // A real error from the first model is shown as it is; a fallback model that fails (for example
      // one Google has retired) is just skipped.
      if (!(err instanceof Busy)) { if (i === 0 || !last) throw err; continue; }
      last = err;
      if (i === 0) await sleep(RETRY_MS);
    }
  }
  if (last?.status === 429) throw new AppError(429, "AI_RATE_LIMITED", "The AI service limit is reached for now (free tiers have a per-minute and daily limit). Try again later.", { service: "llm" });
  if (last?.status === 0) throw upstreamError("llm", "The AI service could not be reached. Try again in a moment.");
  throw new AppError(503, "AI_BUSY", "The AI service is overloaded right now. This is temporary on Google's side: try again in a few minutes.", { service: "llm" });
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
