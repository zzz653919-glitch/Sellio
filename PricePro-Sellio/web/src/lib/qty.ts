import { fmtNumber } from "./format";
import { useI18n } from "./i18n";

/** Counts with their unit word ("5 ta" in Uzbek), so a number never stands alone. */
export function useQty() {
  const { t } = useI18n();
  return (n: number, digits = 0) => t("{n} pcs", { n: fmtNumber(n, digits) });
}
