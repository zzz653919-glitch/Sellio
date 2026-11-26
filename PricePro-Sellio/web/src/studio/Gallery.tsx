import { Eye, Heart, ImagePlus, LayoutTemplate, Loader2, PencilLine, Search, X } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Button, EmptyState, Input, Modal, cx, useToast } from "../components/ui";
import { useI18n } from "../lib/i18n";
import { CATEGORIES, TEMPLATES } from "./templates";
import { galleryPhoto, onGalleryPhoto, readPhoto, setGalleryPhoto } from "./photo";
import { thumbnail } from "./thumbs";
import type { TemplateDef } from "./types";

const CAT_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

/** Preview image that renders only when it scrolls into view. */
export const useGalleryPhoto = () => useSyncExternalStore(onGalleryPhoto, galleryPhoto, galleryPhoto);

export const Thumb = memo(function Thumb({ t, width = 360, eager, className }: { t: TemplateDef; width?: number; eager?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const photo = useGalleryPhoto();
  useEffect(() => {
    let alive = true;
    const el = ref.current;
    if (!el) return;
    const go = () => void thumbnail(t, width, photo).then((u) => alive && setUrl(u));
    if (eager || typeof IntersectionObserver === "undefined") { go(); return () => { alive = false; }; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: "300px" });
    io.observe(el);
    return () => { alive = false; io.disconnect(); };
  }, [t, width, eager, photo]);
  return (
    <div ref={ref} className={cx("relative aspect-square w-full overflow-hidden bg-[var(--v-th)]", className)}>
      {url ? <img src={url} alt={t.name} className="h-full w-full object-cover" draggable={false} /> : <div className="h-full w-full animate-pulse bg-slate-200/60 dark:bg-slate-700/40" />}
    </div>
  );
});

export function Gallery({ favorites, onToggleFavorite, onOpen }: { favorites: Set<string>; onToggleFavorite: (id: string) => void; onOpen: (id: string) => void }) {
  const { t } = useI18n();
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<TemplateDef | null>(null);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: TEMPLATES.length, favorites: TEMPLATES.filter((x) => favorites.has(x.id)).length };
    for (const x of TEMPLATES) c[x.category] = (c[x.category] ?? 0) + 1;
    return c;
  }, [favorites]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return TEMPLATES.filter((x) => (cat === "all" || (cat === "favorites" ? favorites.has(x.id) : x.category === cat))
      && (!needle || `${x.name} ${t(CAT_LABEL[x.category])} ${CAT_LABEL[x.category]} ${x.tags.join(" ")}`.toLowerCase().includes(needle)));
  }, [cat, q, favorites, t]);
  const photo = useGalleryPhoto();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setReading(true);
    try { setGalleryPhoto(await readPhoto(file)); toast("success", t("Your photo is now shown in every template.")); }
    catch (e) { toast("error", t(e instanceof Error ? e.message : "This image could not be opened.")); }
    finally { setReading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const chips = [{ key: "all", label: t("All templates") }, { key: "favorites", label: t("Favorites") }, ...CATEGORIES.map((c) => ({ key: c.key, label: t(c.label) }))];
  return (
    <div className="space-y-4">
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} data-testid="gallery-photo-input" />
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void pick(e.dataTransfer.files?.[0]); }}>
        <span className="grid h-16 w-16 flex-none place-items-center overflow-hidden rounded-2xl bg-[var(--v-sky-soft)]">
          {photo ? <img src={photo.src} alt="" className="h-full w-full object-contain" /> : <ImagePlus className="h-7 w-7 text-[var(--v-sky)]" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{photo ? t("Your product is in every template") : t("See your product in all 100 templates")}</p>
          <p className="text-sm muted">{t("Upload one product photo: it takes the place of the sample picture in every template. A plain (white or one-colour) background is removed automatically.")}</p>
        </div>
        <div className="flex flex-none gap-2">
          <Button icon={reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} disabled={reading} onClick={() => fileRef.current?.click()} data-testid="gallery-photo">
            {photo ? t("Change photo") : t("Upload product photo")}
          </Button>
          {photo && <Button variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => setGalleryPhoto(null)}>{t("Remove")}</Button>}
        </div>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search 100 templates by name")} className="pl-9" aria-label={t("Search templates")} />
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        {chips.map((c) => (
          <button key={c.key} type="button" onClick={() => setCat(c.key)} data-cat={c.key}
            className={cx("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              cat === c.key ? "border-transparent bg-[var(--v-btn)] text-[var(--v-btn-text)]" : "border-[var(--v-line)] hover:bg-[var(--v-th)]")}>
            {c.key === "favorites" && <Heart className="h-3.5 w-3.5" />}{c.label}<span className="opacity-60">{counts[c.key] ?? 0}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<LayoutTemplate className="h-6 w-6" />} title={cat === "favorites" ? t("No favorite templates yet") : t("No templates found")} text={cat === "favorites" ? t("Tap the heart on a template to keep it here.") : undefined} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5" data-testid="template-grid">
          {list.map((x) => (
            <div key={x.id} data-template={x.id} className="card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="relative">
                <button type="button" className="block w-full" onClick={() => setPreview(x)} aria-label={`${t("Preview")}: ${x.name}`}>
                  <Thumb t={x} className="transition duration-300 group-hover:scale-[1.02]" />
                </button>
                <div className="pointer-events-none absolute inset-0 hidden items-end justify-center gap-2 bg-gradient-to-t from-black/45 via-transparent to-transparent p-3 opacity-0 transition group-hover:opacity-100 sm:flex">
                  <button type="button" className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-900 shadow" onClick={() => setPreview(x)}><Eye className="h-3.5 w-3.5" />{t("Preview")}</button>
                  <button type="button" className="pointer-events-auto inline-flex items-center gap-1 rounded-full bg-[var(--v-sky)] px-3 py-1.5 text-xs font-semibold text-white shadow" onClick={() => onOpen(x.id)}><PencilLine className="h-3.5 w-3.5" />{t("Edit")}</button>
                </div>
                <button type="button" onClick={() => onToggleFavorite(x.id)} aria-pressed={favorites.has(x.id)} aria-label={t(favorites.has(x.id) ? "Remove from favorites" : "Add to favorites")}
                  className={cx("absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full shadow transition", favorites.has(x.id) ? "bg-rose-500 text-white" : "bg-white/90 text-slate-700 hover:text-rose-500")}>
                  <Heart className={cx("h-4 w-4", favorites.has(x.id) && "fill-current")} />
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 p-2.5 sm:p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{x.name}</p>
                  <p className="truncate text-[11px] muted">{t(CAT_LABEL[x.category])}</p>
                </div>
                <Button size="sm" variant="secondary" className="shrink-0" onClick={() => onOpen(x.id)}>{t("Edit")}</Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs muted">{t("All templates are drawn in your browser: free, unlimited and fully editable. Replace the sample pictures with your own product photos.")}</p>
      {preview && (
        <Modal open onClose={() => setPreview(null)} title={preview.name}>
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-[var(--v-line)]"><Thumb t={preview} width={900} eager /></div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm muted">{t(CAT_LABEL[preview.category])}</span>
              <div className="flex gap-2">
                <Button variant="secondary" icon={<Heart className={cx("h-4 w-4", favorites.has(preview.id) && "fill-current text-rose-500")} />} onClick={() => onToggleFavorite(preview.id)}>{t(favorites.has(preview.id) ? "Saved" : "Save")}</Button>
                <Button icon={<PencilLine className="h-4 w-4" />} onClick={() => { const id = preview.id; setPreview(null); onOpen(id); }}>{t("Edit this template")}</Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
