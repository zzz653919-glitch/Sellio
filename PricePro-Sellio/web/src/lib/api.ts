import { limitText } from "./limit";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Options = { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal };

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = { "x-pricepro-client": "web" };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method: opts.method ?? "GET", headers, body, credentials: "same-origin", signal: opts.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK", "Cannot reach the server. Check your connection.");
  }
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    if (e?.code === "MAINTENANCE" && typeof window !== "undefined") window.dispatchEvent(new Event("vendora:maintenance"));
    throw new ApiError(res.status, e?.code ?? "HTTP_ERROR", e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return data as T;
}

export const get = <T>(p: string, signal?: AbortSignal) => api<T>(p, { signal });
export const post = <T>(p: string, body?: unknown) => api<T>(p, { method: "POST", body: body ?? {} });
export const put = <T>(p: string, body: unknown) => api<T>(p, { method: "PUT", body });
export const patch = <T>(p: string, body: unknown) => api<T>(p, { method: "PATCH", body });
export const del = <T>(p: string, body?: unknown) => api<T>(p, { method: "DELETE", body });
export const upload = <T>(p: string, form: FormData) => api<T>(p, { method: "POST", form });

export function errorMessage(err: unknown) {
  if (err instanceof ApiError) {
    // A used-up plan limit: say what ran out and when it renews, in the user's language.
    if (err.code === "LIMIT_REACHED") return limitText(err.details) ?? err.message;
    const details = Array.isArray(err.details) ? (err.details as { message: string }[]).map((d) => d.message).join(" ") : "";
    return details && err.code === "BAD_REQUEST" ? details : err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}
