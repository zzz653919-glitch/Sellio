/**
 * Brands and models inside a product for a period (e.g. phones → iPhone 50%, Samsung 30% →
 * "iPhone 16 Pro Max"). Model names come from what people actually searched on Google.
 */
import { useQuery } from "@tanstack/react-query";
import { Flame, Smartphone } from "lucide-react";
import { Badge, cx } from "../components/ui";
import { get } from "../lib/api";
import { fmtDate } from "../lib/format";
import { useI18n } from "../lib/i18n";

/** Products (search terms) that have brands and models. */
export const HAS_MODELS = new Set(["телефон", "ноутбук", "телевизор", "холодильник", "кондиционер", "кроссовки"]);
export type ModelPeriod = "week" | "month" | "quarter" | "year";

type ModelsData =
  | { configured: false }
  | { configured: true; available: false }
  | {
    configured: true; available: true; query: string; period: ModelPeriod; from: string; to: string; computedAt: string;
    brands: { label: string; query: string; sharePct: number }[];
    models: { name: string; brand: string; index: number }[];
    measured: boolean;
    byBrand: { brand: string; models: { name: string; value: number }[] }[];
    rising: { name: string; brand: string; growthPct: number }[];
  };

const BRAND_COLORS = ["#0ea5e9", "#6366f1", "#10b981", "#f59e0b", "#ec4899"];

export function ModelsPanel({ query, period }: { query: string; period: ModelPeriod }) {
  const { t } = useI18n();
  const q = useQuery({
    queryKey: ["intel-models", query, period],
    queryFn: () => get<ModelsData>(`/intel/top/models?query=${encodeURIComponent(query)}&period=${period}`),
    staleTime: 3600_000, retry: false, enabled: HAS_MODELS.has(query),
  });
  if (!HAS_MODELS.has(query)) return null;
  if (q.isLoading) {
    return (
      <div className="space-y-2" data-testid="models-loading">
        <p className="text-sm muted">{t("Finding which brands and models people searched for…")}</p>
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }
  const d = q.data;
  if (q.error || !d || !d.configured || !d.available || d.brands.every((b) => b.sharePct === 0)) {
    return <p className="text-sm muted">{t("No brand and model data for this product in this period.")}</p>;
  }
  const color = new Map(d.brands.map((b, i) => [b.label, BRAND_COLORS[i % BRAND_COLORS.length]]));
  return (
    <div className="space-y-4" data-testid="models-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><Smartphone className="h-4 w-4 text-brand-500" />{t("Which brands and models sold best")}</h3>
        <span className="text-xs muted">{fmtDate(d.from)} — {fmtDate(d.to)}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800" data-testid="models-brands">
          <p className="mb-2 text-xs font-semibold muted">{t("Share of searches among these brands")}</p>
          <ul className="space-y-1.5">
            {d.brands.map((b) => (
              <li key={b.label} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 truncate font-medium">{b.label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(2, b.sharePct)}%`, background: color.get(b.label) }} />
                </span>
                <span className="w-12 text-right font-semibold">{Math.round(b.sharePct)}%</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800" data-testid="models-top">
          <p className="mb-2 text-xs font-semibold muted">{t("Most searched models")} {!d.measured && <Badge tone="amber" className="ml-1">{t("estimate")}</Badge>}</p>
          {d.models.length === 0 ? <p className="text-sm muted">{t("Google did not show separate models for this period.")}</p> : (
            <ol className="space-y-1.5">
              {d.models.map((m, k) => (
                <li key={m.name} className="flex items-center gap-2 text-sm" data-model={m.name}>
                  <span className={cx("grid h-6 w-6 flex-none place-items-center rounded-md text-xs font-bold text-white", k === 0 ? "bg-amber-500" : "bg-slate-400 dark:bg-slate-600")}>{k + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{m.name}</span>
                    <span className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(3, m.index)}%`, background: color.get(m.brand) ?? "#0ea5e9" }} />
                    </span>
                  </span>
                  <span className="w-9 text-right text-xs font-semibold">{m.index}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {d.byBrand.some((g) => g.models.length > 0) && (
        <div className="space-y-2" data-testid="models-by-brand">
          <p className="text-xs font-semibold muted">{t("Popular models of each brand")}</p>
          {d.byBrand.filter((g) => g.models.length > 0).map((g) => (
            <div key={g.brand} className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="w-20 shrink-0 font-semibold" style={{ color: color.get(g.brand) }}>{g.brand}</span>
              {g.models.map((m) => (
                <span key={m.name} className="rounded-full border border-slate-200 px-2 py-0.5 dark:border-slate-700">{m.name} <span className="muted">{m.value}</span></span>
              ))}
            </div>
          ))}
        </div>
      )}

      {d.rising.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10" data-testid="models-rising">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300"><Flame className="h-3.5 w-3.5" />{t("Growing fastest")}</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {d.rising.map((r) => <li key={r.name}><b>{r.name}</b> <span className="muted">{r.growthPct >= 5000 ? t("new, sharp rise") : `+${Math.round(r.growthPct)}%`}</span></li>)}
          </ul>
        </div>
      )}

      <p className="text-xs muted">{t("From Google searches in Uzbekistan for the period: brands compared with each other; models are what people typed with the brand name (100 = the most searched model). Popular models per brand: 100 = that brand's most searched query. It shows demand, not the number of items sold.")}</p>
    </div>
  );
}
