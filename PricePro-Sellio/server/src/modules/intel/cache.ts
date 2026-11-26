/** Shared cache for public market data (never user data), stored in trend_cache. */
import { get, run } from "../../db/index.js";
import { nowIso } from "../../lib/util.js";

const inFlight = new Map<string, Promise<unknown>>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, keep: (v: T) => boolean = () => true): Promise<T> {
  const row = await get<{ data_json: string; created_at: string }>("SELECT data_json, created_at FROM trend_cache WHERE key = ?", key);
  if (row && Date.now() - Date.parse(row.created_at) < ttlMs) return JSON.parse(row.data_json) as T;
  const running = inFlight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = (async () => {
    const value = await load();
    if (keep(value)) {
      await run(
        "INSERT INTO trend_cache (key, data_json, created_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data_json = excluded.data_json, created_at = excluded.created_at",
        key, JSON.stringify(value), nowIso(),
      );
    }
    return value;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

export const DAY_MS = 86_400_000;
