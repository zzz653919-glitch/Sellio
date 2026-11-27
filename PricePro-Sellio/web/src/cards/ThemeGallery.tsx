/**
 * Themes as folders: every theme is one folder with five card designs in that same theme. The gallery
 * ("Explore all designs") lists the folders with search and category filters; opening a folder shows its
 * five designs large, and "Choose this theme" applies the theme and its five designs.
 */
import { ArrowLeft, Check, Folder, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Input, Modal, cx } from "../components/ui";
import { useI18n } from "../lib/i18n";
import { DocPreview } from "./common";
import { buildCard, defaultStyle, LAYOUT_LABEL, type BuildData, type LayoutKey, type MarketplaceKey } from "./layouts";
import { THEME_CATEGORIES, THEME_LAYOUTS, THEMES, type ThemeCategory, type ThemeKey, type ThemePreset } from "./themes";

export const themeLayouts = (k: ThemeKey) => (THEME_LAYOUTS[k] ?? THEME_LAYOUTS.brand) as LayoutKey[];

/** A theme's folder: three of its designs fanned out, its name and "5 designs". */
export function ThemeFolder({ th, sample, size, mp, selected, onClick, small }: {
  th: ThemePreset; sample: BuildData; size: { w: number; h: number }; mp: MarketplaceKey; selected?: boolean; onClick: () => void; small?: boolean;
}) {
  const { t } = useI18n();
  const style = { ...defaultStyle(mp), theme: th.key, lighting: th.suggest.lighting as never };
  const covers = themeLayouts(th.key).slice(0, 3);
  const pos = ["left-[24%] w-[52%] z-[3]", "left-[2%] w-[44%] top-[8%] z-[2] -rotate-6", "right-[2%] w-[44%] top-[8%] z-[1] rotate-6"];
  return (
    <button type="button" onClick={onClick} data-folder={th.key} title={t(th.name)}
      className={cx("group flex flex-col overflow-hidden rounded-xl border-2 text-left transition hover:-translate-y-0.5 hover:shadow-md", selected ? "border-brand-500 ring-4 ring-brand-500/15" : "border-slate-200 dark:border-slate-700", small ? "w-36 shrink-0" : "")}>
      <div className="relative bg-slate-100 p-2 dark:bg-slate-800/60">
        <div className={cx("relative mx-auto w-full", small ? "aspect-[4/3.2]" : "aspect-[4/3.1]")}>
          {covers.map((l, i) => (
            <div key={l} className={cx("absolute top-0 overflow-hidden rounded-md shadow-md ring-1 ring-black/5", pos[i])}>
              <DocPreview doc={buildCard(l, { ...sample, style }, size)} width={small ? 110 : 170} />
            </div>
          ))}
        </div>
        {selected && <span className="absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-white shadow"><Check className="h-4 w-4" /></span>}
      </div>
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <Folder className="h-3.5 w-3.5 shrink-0 text-brand-600" />
        <span className={cx("min-w-0 flex-1 truncate font-semibold", small ? "text-[11px]" : "text-sm")}>{t(th.name)}</span>
        <span className="shrink-0 text-[10px] muted">{t("{n} designs", { n: themeLayouts(th.key).length })}</span>
      </div>
    </button>
  );
}

export function ThemeGallery({ open, onClose, current, onSelect, sample, size, mp }: {
  open: boolean; onClose: () => void; current: ThemeKey; onSelect: (t: ThemePreset) => void;
  sample: BuildData; size: { w: number; h: number }; mp: MarketplaceKey;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<ThemeCategory | "all">("all");
  const [folder, setFolder] = useState<ThemePreset | null>(null);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return THEMES.filter((x) => (cat === "all" || x.categories.includes(cat))
      && (!needle || `${x.name} ${t(x.name)} ${x.description} ${t(x.description)}`.toLowerCase().includes(needle)));
  }, [q, cat, t]);
  // previews are portrait so they line up; the real format is used on the cards themselves
  const previewSize = size.w > size.h * 1.2 ? { w: 1080, h: 1350 } : size;
  const pick = (th: ThemePreset) => { onSelect(th); setFolder(null); onClose(); };

  return (
    <Modal open={open} onClose={() => { setFolder(null); onClose(); }} title={folder ? t(folder.name) : t("Explore all designs")} wide>
      {folder ? (
        <div className="space-y-4" data-testid="theme-folder">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => setFolder(null)}>{t("All themes")}</Button>
            <p className="min-w-0 flex-1 text-sm muted">{t(folder.description)}</p>
            <Button onClick={() => pick(folder)} data-testid="folder-choose">{folder.key === current ? t("Selected") : t("Choose this theme")}</Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {themeLayouts(folder.key).map((l) => (
              <div key={l} className="space-y-1">
                <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                  <DocPreview doc={buildCard(l, { ...sample, style: { ...defaultStyle(mp), theme: folder.key, lighting: folder.suggest.lighting as never } }, previewSize)} width={300} />
                </div>
                <p className="truncate text-[11px] font-semibold">{t(LAYOUT_LABEL[l])}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4" data-testid="theme-gallery">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search designs")} className="pl-9" aria-label={t("Search designs")} data-testid="theme-search" />
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
                <div key={th.key} data-theme={th.key} className="flex flex-col gap-1">
                  <ThemeFolder th={th} sample={sample} size={previewSize} mp={mp} selected={th.key === current} onClick={() => setFolder(th)} />
                  <p className="line-clamp-2 px-0.5 text-[11px] muted">{t(th.description)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
