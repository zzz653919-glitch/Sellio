/** Records every call to an external API (provider, result, duration) for admin usage and error monitoring. */
import { run } from "../db/index.js";
import { newId, nowIso } from "../lib/util.js";

export type ApiProvider = "serpapi" | "gemini" | "openai_text" | "openai_image" | "world_bank" | "comtrade";

export async function recordApiCall(c: { provider: ApiProvider; operation: string; ok: boolean; status?: number | null; ms: number; error?: string | null; userId?: string | null }) {
  try {
    await run(
      "INSERT INTO api_calls (id,provider,operation,ok,status,duration_ms,error,user_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      newId(), c.provider, c.operation.slice(0, 80), c.ok ? 1 : 0, c.status ?? null, Math.round(c.ms), c.error ? c.error.slice(0, 500) : null, c.userId ?? null, nowIso(),
    );
  } catch {
    // Monitoring must never break the feature itself.
  }
}
