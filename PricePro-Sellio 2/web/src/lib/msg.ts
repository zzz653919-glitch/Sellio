import { useCallback } from "react";
import { fmtMonthName } from "./format";
import { useI18n } from "./i18n";

/** A server message: an English template with {placeholders} (translated in the web app). */
export type Msg = { key: string; vars?: Record<string, string | number> };

/** Translate a server Msg. Text variables (product labels) are translated too; {month} becomes a month name. */
export function useMsg() {
  const { t } = useI18n();
  return useCallback((m: Msg) => {
    const vars: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(m.vars ?? {})) {
      if (k === "month" && typeof v === "number") vars[k] = fmtMonthName(v);
      else if (typeof v === "string") vars[k] = v.split(", ").map((x) => t(x)).join(", ");
      else vars[k] = Math.round(v * 10) / 10;
    }
    return t(m.key, vars);
  }, [t]);
}
