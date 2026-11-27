/**
 * Shared pieces of the Product cards section: data types, server calls, previews, files.
 */
import { useQuery } from "@tanstack/react-query";
import { Check, ClipboardCopy } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../components/ui";
import { get, upload } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { ensureFonts } from "../studio/fonts";
import { exportDoc, loadDocImages, renderTo, type ExportType } from "../studio/render";
import { docFonts } from "../studio/thumbs";
import type { Doc } from "../studio/types";
import { manualCopy, type BuildData, type CardCopy, type CardInput, type CardPhoto, type LayoutKey, type MarketplaceKey, type StyleConfig } from "./layouts";
import { makeZip } from "./zip";

export type Platform = { label: string; ratio: Ratio; base: number; sizes: { w: number; h: number }[] };
export type Options = { textAi: boolean; imageAi: boolean; marketplaces: Record<MarketplaceKey, Platform>; icons: string[] };
export type Summary = { id: string; groupId: string; name: string; product?: string | null; theme?: string | null; marketplace: MarketplaceKey; layout: LayoutKey; w: number | null; h: number | null; thumb: string | null; createdAt: string; updatedAt: string };
/** Everything chosen in the generator; saved with every card of a session so it can be reused. */
export type GenConfig = {
  style: StyleConfig; layouts: LayoutKey[]; angle: string; aiPhoto: boolean; variations: number; ratio: Ratio; size: { w: number; h: number };
  referenceUploadId?: string | null; referenceStyle?: string | null;
};
export type SavedInput = Partial<CardInput> & { photoCutout?: boolean; config?: GenConfig; aiPhotos?: CardPhoto[]; originalUploadId?: string | null };
export type Full = Summary & { photoUploadId: string | null; input: SavedInput; copy: Partial<CardCopy>; doc: Doc };

export const MP_ORDER: MarketplaceKey[] = ["uzum", "wildberries", "ozon", "yandex", "amazon", "alibaba", "etsy", "shopify", "instagram", "tiktok", "universal", "other"];
export type Ratio = "1:1" | "4:5" | "3:4" | "16:9" | "9:16";
export const RATIOS: Ratio[] = ["1:1", "4:5", "3:4", "16:9", "9:16"];
/** Image size for a platform and a ratio: a size the platform lists, otherwise one made from its base side. */
export function sizeFor(pl: Platform | undefined, ratio: Ratio): { w: number; h: number } {
  const [rw, rh] = ratio.split(":").map(Number);
  const listed = pl?.sizes.find((z) => Math.abs(z.w / z.h - rw / rh) < 0.01);
  if (listed) return listed;
  const base = pl?.base ?? 1080;
  return rw >= rh ? { w: Math.round((base * rw) / rh), h: base } : { w: base, h: Math.round((base * rh) / rw) };
}
export const useOptions = () => useQuery({ queryKey: ["card-options"], queryFn: () => get<Options>("/cards/options"), staleTime: 600_000 });
export const useCards = () => useQuery({ queryKey: ["cards"], queryFn: () => get<{ items: Summary[] }>("/cards").then((r) => r.items) });

// ------------------------------------------------------------------ helpers
export const EXT: Record<ExportType, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "card";

export function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Small JPEG preview kept with the card (for the list). */
export async function thumbOf(doc: Doc) {
  await ensureFonts(docFonts(doc));
  await loadDocImages(doc);
  const c = document.createElement("canvas");
  renderTo(c, doc, 360);
  return c.toDataURL("image/jpeg", 0.8);
}

/** data: URL → Blob without a network request (the site's security policy blocks fetch() of data: URLs). */
export function dataUrlToBlob(u: string): Blob {
  const [head, body] = u.split(",", 2);
  const mime = /data:([^;,]+)/.exec(head)?.[1] ?? "application/octet-stream";
  if (!/;base64/.test(head)) return new Blob([decodeURIComponent(body)], { type: mime });
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Put a picture made in the browser (a cut-out photo) on the server; cards keep only links to files. */
export async function storeImage(dataUrl: string, name = "card-image.png") {
  const blob = dataUrlToBlob(dataUrl);
  const fd = new FormData();
  fd.append("file", new File([blob], name, { type: blob.type || "image/png" }));
  const r = await upload<{ upload: { id: string } }>("/studio/uploads", fd);
  return `/api/files/${r.upload.id}`;
}

/** Render saved cards to files and pack them into one ZIP. */
export async function downloadZip(ids: string[], type: ExportType, onProgress?: (n: number) => void) {
  const files: { name: string; data: Blob }[] = [];
  const used = new Set<string>();
  for (const [i, id] of ids.entries()) {
    const { card } = await get<{ card: Full }>(`/cards/${id}`);
    await ensureFonts(docFonts(card.doc));
    const blob = await exportDoc(card.doc, type);
    if (blob.type !== type) throw new Error("WEBP_UNSUPPORTED");
    let name = `${slug(card.name)}-${card.doc.w}x${card.doc.h}`;
    for (let k = 2; used.has(name); k++) name = `${slug(card.name)}-${card.doc.w}x${card.doc.h}-${k}`;
    used.add(name);
    files.push({ name: `${name}.${EXT[type]}`, data: blob });
    onProgress?.(i + 1);
  }
  saveBlob(await makeZip(files), `vendora-cards-${new Date().toISOString().slice(0, 10)}.zip`);
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  const key = JSON.stringify(value);
  useEffect(() => { const h = setTimeout(() => setV(value), ms); return () => clearTimeout(h); }, [key, ms]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

/** A design drawn live (previews before saving). */
export function DocPreview({ doc, className, width = 420 }: { doc: Doc; className?: string; width?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(doc);
  useEffect(() => {
    let alive = true;
    void (async () => {
      await ensureFonts(docFonts(doc));
      await loadDocImages(doc);
      if (alive && ref.current) renderTo(ref.current, doc, width);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <canvas ref={ref} className={cx("block h-auto w-full", className)} />;
}

export function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
      onClick={() => { void navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }); }}>
      {done ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}{done ? t("Copied") : t("Copy")}
    </button>
  );
}

/** The texts the AI wrote: for the marketplace product page and for ads. */
export function CopyPanel({ copy, compact }: { copy: Partial<CardCopy>; compact?: boolean }) {
  const { t } = useI18n();
  const block = (title: string, body: ReactNode, text: string) => (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="mb-1.5 flex items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide muted">{title}</p><CopyButton text={text} /></div>
      <div className="text-sm">{body}</div>
    </div>
  );
  const bullets = copy.bullets ?? [], ads = copy.adTexts ?? [], kw = copy.keywords ?? [], specs = copy.specs ?? [];
  return (
    <div className={cx("space-y-3", !compact && "lg:columns-2 lg:gap-3 [&>*]:mb-3 [&>*]:break-inside-avoid lg:space-y-0")} data-testid="copy-panel">
      {copy.marketplaceTitle && block(t("Product title for the marketplace"), <p className="font-semibold">{copy.marketplaceTitle}</p>, copy.marketplaceTitle)}
      {copy.description && block(t("Product description"), <p className="whitespace-pre-line leading-relaxed">{copy.description}</p>, copy.description)}
      {bullets.length > 0 && block(t("Selling points"), <ul className="list-disc space-y-1 pl-5">{bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>, bullets.map((b) => `• ${b}`).join("\n"))}
      {specs.length > 0 && block(t("Characteristics"), <dl className="grid grid-cols-2 gap-x-3 gap-y-1">{specs.map((s, i) => <><dt key={`l${i}`} className="muted">{s.label}</dt><dd key={`v${i}`} className="font-medium">{s.value}</dd></>)}</dl>, specs.map((s) => `${s.label}: ${s.value}`).join("\n"))}
      {ads.length > 0 && block(t("Ad texts"), <div className="space-y-2">{ads.map((a, i) => <p key={i} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">{a}</p>)}</div>, ads.join("\n\n"))}
      {kw.length > 0 && block(t("Search keywords"), <div className="flex flex-wrap gap-1.5">{kw.map((k, i) => <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">{k}</span>)}</div>, kw.join(", "))}
      {!copy.marketplaceTitle && !copy.description && !bullets.length && !ads.length && <p className="text-sm muted">{t("No AI texts for this card.")}</p>}
    </div>
  );
}


/** Everything a design is built from, as saved with the card. */
export function cardData(c: Full, photoIndex = 0): BuildData {
  const input = { name: c.input.name ?? c.name, features: c.input.features ?? [], benefits: c.input.benefits ?? [], price: c.input.price, oldPrice: c.input.oldPrice, marketplace: c.marketplace, language: c.input.language ?? "uz" } as CardInput;
  const copy = { ...manualCopy(input), ...c.copy } as CardCopy;
  const original = c.photoUploadId ? { src: `/api/files/${c.photoUploadId}`, cutout: c.input.photoCutout ?? true } : null;
  const ai = c.input.aiPhotos ?? [];
  const photo = ai[photoIndex] ?? ai[0] ?? original;
  return { copy, input, photo, photos: { before: original, extra: ai.filter((x) => x !== photo) }, style: c.input.config?.style };
}

