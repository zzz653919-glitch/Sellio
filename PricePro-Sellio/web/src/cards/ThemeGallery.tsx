/**
 * "Explore all designs": every theme with a live preview of a card, its name and description, a search
 * box and category filters. Up to three themes can be put side by side to compare; "Select" applies the
 * theme and the settings it suggests.
 */
import { Check, Columns3, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Input, Modal, cx } from "../components/ui";
import { useI18n } from "../lib/i18n";
import { DocPreview } from "./common";
import { buildCard, defaultStyle, type BuildData, type LayoutKey, type MarketplaceKey } from "./layouts";
import { THEME_CATEGORIES, THEMES, type ThemeCategory, type ThemeKey, type ThemePreset } from "./themes";

export function ThemeGallery({ open, onClose, current, onSelect, sample, size, mp }: {
  open: boolean; onClose: () => void; current: ThemeKey; onSelect: (t: ThemePreset) => void;
  sample: BuildData; size: { w: number; h: number }; mp: MarketplaceKey;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<ThemeCategory | "all">("all");
  const [compare, setCompare] = useState<ThemeKey[]>([]);
  const [comparing, setComparing] = useState(false);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return THEMES.filter((x) => (cat === "all" || x.categories.includes(cat))
      && (!needle || `${x.name} ${t(x.name)} ${x.description} ${t(x.description)}`.toLowerCase().includes(needle)));
  }, [q, cat, t]);
  // previews are portrait so they line up; the real format is used on the card itself
  const previewSize = size.w > size.h * 1.2 ? { w: 1080, h: 1350 } : size;
  const docFor = (th: ThemePreset) => buildCard((th.suggest.layout || "hero") as LayoutKey, { ...sample, style: { ...defaultStyle(mp), theme: th.key, lighting: th.suggest.lighting as never } }, previewSize);
  const pick = (th: ThemePreset) => { onSelect(th); setComparing(false); setCompare([]); onClose(); };
  const toggle = (k: ThemeKey) => setCompare((c) => (c.includes(k) ? c.filter((x) => x !== k) : c.length >= 3 ? [...c.slice(1), k] : [...c, k]));

  return (
    <Modal open={open} onClose={onClose} title={t("Explore all designs")} wide>
      {comparing ? (
        <div className="space-y-4" data-testid="theme-compare">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm muted">{t("Compare the themes side by side, then choose one.")}</p>
            <Button size="sm" variant="ghost" onClick={() => setComparing(false)}>{t("Back to all designs")}</Button>
          </div>
          <div className={cx("grid gap-4", compare.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
            {compare.map((k) => {
              const th = THEMES.find((x) => x.key === k)!;
              return (
                <div key={k} className="space-y-2">
                  <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"><DocPreview doc={docFor(th)} width={420} /></div>
                  <p className="font-semibold">{t(th.name)}</p>
                  <Button className="w-full" onClick={() => pick(th)}>{t("Select")}</Button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-4" data-testid="theme-gallery">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search designs")} className="pl-9" aria-label={t("Search designs")} data-testid="theme-search" />
            </div>
            {compare.length >= 2 && <Button icon={<Columns3 className="h-4 w-4" />} onClick={() => setComparing(true)} data-testid="theme-compare-open">{t("Compare ({n})", { n: compare.length })}</Button>}
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
            {THEME_CATEGORIES.map((c) => (
              <button key={c.key} type="button" onClick={() => setCat(c.key)} data-theme-cat={c.key}
                className={cx("shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition", cat === c.key ? "border-transparent bg-[var(--v-btn)] text-[var(--v-btn-text)]" : "border-[var(--v-line)] hover:bg-[var(--v-th)]")}>{t(c.label)}</button>
            ))}
          </div>
          {list.length === 0 ? <p className="py-10 text-center text-sm muted">{t("No designs found")}</p> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {list.map((th) => (
                <div key={th.key} data-theme={th.key} className={cx("flex flex-col overflow-hidden rounded-xl border-2 transition", th.key === current ? "border-brand-500 ring-4 ring-brand-500/15" : "border-slate-200 dark:border-slate-700")}>
                  <div className="relative">
                    <DocPreview doc={docFor(th)} width={260} />
                    <label className="absolute left-2 top-2 flex cursor-pointer items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-800 shadow" title={t("Compare")}>
                      <input type="checkbox" checked={compare.includes(th.key)} onChange={() => toggle(th.key)} className="h-3 w-3" />{t("Compare")}
                    </label>
                    {th.key === current && <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-white shadow"><Check className="h-4 w-4" /></span>}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-2.5">
                    <p className="text-sm font-bold">{t(th.name)}</p>
                    <p className="line-clamp-2 flex-1 text-[11px] muted">{t(th.description)}</p>
                    <Button size="sm" className="mt-1 w-full" variant={th.key === current ? "secondary" : "primary"} onClick={() => pick(th)} data-testid={`theme-select-${th.key}`}>{th.key === current ? t("Selected") : t("Select")}</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <button type="button" className="sr-only" onClick={onClose}><X /></button>
    </Modal>
  );
}
