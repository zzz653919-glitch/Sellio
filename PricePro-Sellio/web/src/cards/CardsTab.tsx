/**
 * AI Product Studio → "Product cards": marketplace product cards (Uzum Market, Wildberries, Ozon,
 * Yandex Market…). The seller uploads a photo and types the facts; the AI writes the texts; several designs
 * are drawn; every card is kept on the server, can be edited, renamed, duplicated, deleted and downloaded.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Check, CheckSquare, ClipboardCopy, Copy, Download, LayoutGrid, Loader2, PencilLine, Plus, Search, Sparkles, Square, Trash2, UploadCloud, Wand2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorAlert } from "../components/shared";
import { Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, Select, cx, useToast } from "../components/ui";
import { del, errorMessage, get, patch, post, upload } from "../lib/api";
import { useAuth } from "../lib/auth";
import { timeAgo } from "../lib/format";
import { useI18n } from "../lib/i18n";
import Editor from "../studio/Editor";
import { ensureFonts } from "../studio/fonts";
import { readPhoto } from "../studio/photo";
import { exportDoc, loadDocImages, renderTo, type ExportType } from "../studio/render";
import { docFonts } from "../studio/thumbs";
import type { Doc, ImageEl } from "../studio/types";
import type { Generation } from "../lib/types";
import {
  buildCard, LAYOUT_LABEL, layoutsFor, MARKETPLACE_LAYOUTS, manualCopy, PALETTES, SAMPLE_COPY,
  type CardCopy, type CardInput, type CardPhoto, type LayoutKey, type MarketplaceKey,
} from "./layouts";
import { makeZip } from "./zip";

type Options = { textAi: boolean; marketplaces: Record<MarketplaceKey, { label: string; sizes: { w: number; h: number }[] }>; icons: string[] };
type Summary = { id: string; groupId: string; name: string; marketplace: MarketplaceKey; layout: LayoutKey; w: number | null; h: number | null; thumb: string | null; createdAt: string; updatedAt: string };
type Full = Summary & { photoUploadId: string | null; input: Partial<CardInput> & { photoCutout?: boolean }; copy: Partial<CardCopy>; doc: Doc };

const MP_ORDER: MarketplaceKey[] = ["uzum", "wildberries", "ozon", "yandex", "other"];
const useOptions = () => useQuery({ queryKey: ["card-options"], queryFn: () => get<Options>("/cards/options"), staleTime: 600_000 });
const useCards = () => useQuery({ queryKey: ["cards"], queryFn: () => get<{ items: Summary[] }>("/cards").then((r) => r.items) });

// ------------------------------------------------------------------ helpers
const EXT: Record<ExportType, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "card";

function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Small JPEG preview kept with the card (for the list). */
async function thumbOf(doc: Doc) {
  await ensureFonts(docFonts(doc));
  await loadDocImages(doc);
  const c = document.createElement("canvas");
  renderTo(c, doc, 360);
  return c.toDataURL("image/jpeg", 0.8);
}

/** data: URL → Blob without a network request (the site's security policy blocks fetch() of data: URLs). */
function dataUrlToBlob(u: string): Blob {
  const [head, body] = u.split(",", 2);
  const mime = /data:([^;,]+)/.exec(head)?.[1] ?? "application/octet-stream";
  if (!/;base64/.test(head)) return new Blob([decodeURIComponent(body)], { type: mime });
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Put a picture made in the browser (a cut-out photo) on the server; cards keep only links to files. */
async function storeImage(dataUrl: string, name = "card-image.png") {
  const blob = dataUrlToBlob(dataUrl);
  const fd = new FormData();
  fd.append("file", new File([blob], name, { type: blob.type || "image/png" }));
  const r = await upload<{ upload: { id: string } }>("/studio/uploads", fd);
  return `/api/files/${r.upload.id}`;
}

/** Render saved cards to files and pack them into one ZIP. */
async function downloadZip(ids: string[], type: ExportType, onProgress?: (n: number) => void) {
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

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  const key = JSON.stringify(value);
  useEffect(() => { const h = setTimeout(() => setV(value), ms); return () => clearTimeout(h); }, [key, ms]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

/** A design drawn live (previews before saving). */
function DocPreview({ doc, className, width = 420 }: { doc: Doc; className?: string; width?: number }) {
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

function CopyButton({ text }: { text: string }) {
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
function CopyPanel({ copy, compact }: { copy: Partial<CardCopy>; compact?: boolean }) {
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

// ------------------------------------------------------------------ create
type PhotoState = { file: File; preview: string; cutout: boolean; uploadId: string | null; busy: boolean; error?: string };

function CreateCard({ onDone, onCancel }: { onDone: (groupId: string) => void; onCancel: () => void }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const opts = useOptions();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<PhotoState | null>(null);
  const [photoError, setPhotoError] = useState<unknown>(null);
  const [cutTried, setCutTried] = useState(false);
  /** The automatic cut-out did not look right: use the photo as it is (with its background). */
  const useOriginal = async () => {
    if (!photo) return;
    const file = photo.file;
    setPhoto({ ...photo, busy: true });
    try {
      const preview = URL.createObjectURL(file);
      const fd = new FormData(); fd.append("file", file);
      const r = await upload<{ upload: { id: string } }>("/studio/uploads", fd);
      setPhoto({ file, preview, cutout: false, uploadId: r.upload.id, busy: false });
    } catch (e) { setPhoto({ ...photo, busy: false }); setPhotoError(e); }
  };
  const [dragging, setDragging] = useState(false);
  const [f, setF] = useState({ name: "", features: "", benefits: "", price: "", oldPrice: "", marketplace: "uzum" as MarketplaceKey, language: (["uz", "ru", "en"].includes(lang) ? lang : "uz") as CardInput["language"] });
  const sizes = opts.data?.marketplaces[f.marketplace]?.sizes ?? [{ w: 1080, h: 1440 }];
  const [size, setSize] = useState("");
  const sizeKey = sizes.some((z) => `${z.w}x${z.h}` === size) ? size : `${sizes[0].w}x${sizes[0].h}`;
  // all twelve designs; the marketplace's four recommended ones come first and are picked by default
  const layouts = layoutsFor(f.marketplace);
  const [chosen, setChosen] = useState<Set<LayoutKey>>(new Set(MARKETPLACE_LAYOUTS[f.marketplace]));
  useEffect(() => { setChosen(new Set(MARKETPLACE_LAYOUTS[f.marketplace])); }, [f.marketplace]);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [aiFailed, setAiFailed] = useState(false);

  const lines = (s: string) => s.split(/\n+/).map((x) => x.replace(/^[\s•\-–*]+/, "").trim()).filter(Boolean).slice(0, 12);
  const input: CardInput = { name: f.name.trim(), features: lines(f.features), benefits: lines(f.benefits), price: f.price.trim() || undefined, oldPrice: f.oldPrice.trim() || undefined, marketplace: f.marketplace, language: f.language };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setPhotoError(null);
    try {
      const read = await readPhoto(file);
      // a short blob: link instead of a data: URL of several MB (cheap to pass around and redraw)
      const state: PhotoState = { file, preview: URL.createObjectURL(dataUrlToBlob(read.src)), cutout: read.cutout, uploadId: null, busy: true };
      setPhoto(state);
      const fd = new FormData();
      // a cut-out product is stored as a transparent PNG; any other photo as it is
      if (read.cutout) fd.append("file", new File([dataUrlToBlob(read.src)], `${file.name.replace(/\.\w+$/, "")}.png`, { type: "image/png" }));
      else fd.append("file", file);
      const r = await upload<{ upload: { id: string } }>("/studio/uploads", fd);
      setPhoto({ ...state, uploadId: r.upload.id, busy: false });
      setCutTried(read.cutout);
      if (!f.name) setF((x) => ({ ...x, name: x.name || file.name.replace(/\.\w+$/, "").replace(/[-_]+/g, " ").slice(0, 120).replace(/^(img|dsc|photo|image)\s?\d+$/i, "") }));
    } catch (e) {
      setPhoto(null);
      setPhotoError(e instanceof Error && !("status" in e) ? new Error(t(e.message)) : e);
    } finally { if (fileRef.current) fileRef.current.value = ""; }
  };

  const previewPhoto: CardPhoto | null = photo ? { src: photo.preview, cutout: photo.cutout } : null;
  const [pw, ph] = sizeKey.split("x").map(Number);
  // the previews are redrawn a moment after typing stops, not on every key press
  const live = useDebounced({ name: f.name.trim(), price: input.price, oldPrice: input.oldPrice }, 300);
  const previewCopy: CardCopy = { ...SAMPLE_COPY, title: live.name || t(SAMPLE_COPY.title), subtitle: t(SAMPLE_COPY.subtitle), badge: "", benefits: SAMPLE_COPY.benefits.map((b) => ({ ...b, title: t(b.title), text: t(b.text) })), specs: SAMPLE_COPY.specs.map((s) => ({ label: t(s.label), value: t(s.value) })) };
  const previews = layouts.map((l) => ({ l, doc: buildCard(l, { copy: previewCopy, input: { ...input, price: live.price ?? "199 000", oldPrice: live.oldPrice }, photo: previewPhoto }, { w: pw, h: ph }) }));

  const ready = Boolean(photo?.uploadId && input.name.length >= 2 && chosen.size > 0 && user?.emailVerified);
  const create = async (withAi: boolean) => {
    if (!photo?.uploadId) return;
    setError(null); setAiFailed(false);
    try {
      let copy: CardCopy;
      if (withAi) {
        setStep(t("The AI is writing the texts…"));
        try {
          copy = (await post<{ copy: CardCopy }>("/cards/copy", { ...input, uploadId: photo.uploadId })).copy;
          qc.invalidateQueries({ queryKey: ["subscription"] });
        } catch (e) { setAiFailed(true); throw e; }
      } else copy = manualCopy(input);
      setStep(t("Drawing the designs…"));
      const data = { copy, input, photo: { src: `/api/files/${photo.uploadId}`, cutout: photo.cutout } };
      const picked = layouts.filter((l) => chosen.has(l));
      const docs = picked.map((l) => buildCard(l, data, { w: pw, h: ph }));
      const thumbs = await Promise.all(docs.map(thumbOf));
      setStep(t("Saving…"));
      const r = await post<{ cards: Full[] }>("/cards", {
        cards: docs.map((doc, i) => ({
          name: `${input.name} · ${t(LAYOUT_LABEL[picked[i]])}`, marketplace: f.marketplace, layout: picked[i], photoUploadId: photo.uploadId,
          input: { ...input, photoCutout: photo.cutout }, copy, doc, thumb: thumbs[i],
        })),
      });
      qc.invalidateQueries({ queryKey: ["cards"] });
      onDone(r.cards[0].groupId);
    } catch (e) { setError(e); } finally { setStep(null); }
  };

  const mp = opts.data?.marketplaces;
  return (
    <div className="space-y-5" data-testid="card-create">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={onCancel}>{t("My cards")}</Button>
        <h2 className="text-lg font-bold">{t("New product card")}</h2>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <h3 className="mb-3 font-semibold">1. {t("Product photo")}</h3>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} data-testid="card-photo-input" />
            <div role="button" tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); void pick(e.dataTransfer.files?.[0]); }}
              className={cx("flex min-h-52 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition",
                dragging ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-slate-300 hover:border-brand-400 dark:border-slate-700")} data-testid="card-photo">
              {photo ? (
                <>
                  <div className="checker grid max-h-56 place-items-center overflow-hidden rounded-lg"><img src={photo.preview} alt="" className="max-h-56 object-contain" /></div>
                  <p className="flex items-center gap-1.5 text-xs muted">{photo.busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("Uploading securely…")}</> : photo.cutout ? <><Check className="h-3.5 w-3.5 text-emerald-600" />{t("Background removed automatically")}</> : t("The photo is used with its background")}</p>
                  <p className="text-xs font-medium text-brand-600 dark:text-brand-400">{t("Click or drop to replace")}</p>
                </>
              ) : (
                <>
                  <UploadCloud className="h-9 w-9 text-brand-500" />
                  <p className="font-medium">{t("Drag & drop a product photo")}</p>
                  <p className="text-xs muted">{t("A photo on a plain (white) background works best: the background is removed automatically.")}</p>
                </>
              )}
            </div>
            {photo && !photo.busy && cutTried && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-2.5 text-xs dark:bg-slate-800/60">
                <span className="muted">{photo.cutout ? t("Background not removed correctly?") : t("The original photo with its background is used.")}</span>
                {photo.cutout
                  ? <Button size="sm" variant="secondary" onClick={() => void useOriginal()} data-testid="use-original">{t("Use the original photo")}</Button>
                  : <Button size="sm" variant="ghost" onClick={() => void pick(photo.file)}>{t("Remove the background again")}</Button>}
              </div>
            )}
            {photoError != null && <div className="mt-3"><ErrorAlert error={photoError} /></div>}
          </Card>

          <Card className="space-y-4 p-5">
            <h3 className="font-semibold">2. {t("About the product")}</h3>
            <Field label={t("Product name")}><Input value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t("e.g. Women's leather handbag")} data-testid="card-name" /></Field>
            <Field label={t("Characteristics")} hint={t("One per line, e.g. Material: leather")}>
              <textarea className="input min-h-24" value={f.features} onChange={(e) => setF({ ...f, features: e.target.value })} placeholder={t("Material: genuine leather\nSize: 30 × 20 cm\nColour: black")} data-testid="card-features" />
            </Field>
            <Field label={t("Advantages")} hint={t("One per line")}>
              <textarea className="input min-h-20" value={f.benefits} onChange={(e) => setF({ ...f, benefits: e.target.value })} placeholder={t("Lasts for years\nFits A4 documents\nGift box included")} data-testid="card-benefits" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("Price")}><Input value={f.price} maxLength={40} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="349 000 so'm" data-testid="card-price" /></Field>
              <Field label={t("Old price (optional)")}><Input value={f.oldPrice} maxLength={40} onChange={(e) => setF({ ...f, oldPrice: e.target.value })} placeholder="420 000 so'm" /></Field>
            </div>
          </Card>
        </div>

        <div className="space-y-5 lg:col-span-3">
          <Card className="space-y-4 p-5">
            <h3 className="font-semibold">3. {t("Marketplace")}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup">
              {MP_ORDER.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={f.marketplace === k} onClick={() => setF({ ...f, marketplace: k })} data-mp={k}
                  className={cx("flex items-center gap-2 rounded-xl border-2 p-2.5 text-left text-sm font-semibold transition", f.marketplace === k ? "border-brand-500 ring-4 ring-brand-500/15" : "border-slate-200 hover:border-slate-300 dark:border-slate-800")}>
                  <span className="h-6 w-6 flex-none rounded-lg" style={{ background: `linear-gradient(135deg, ${PALETTES[k].primary}, ${PALETTES[k].deep})` }} />
                  <span className="min-w-0 leading-tight">{t(mp?.[k]?.label ?? k)}</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("Size")}><Select value={sizeKey} onChange={(e) => setSize(e.target.value)} options={sizes.map((z) => ({ value: `${z.w}x${z.h}`, label: `${z.w}×${z.h}${z.w === z.h ? " (1:1)" : " (3:4)"}` }))} data-testid="card-size-create" /></Field>
              <Field label={t("Card language")}><Select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value as CardInput["language"] })} options={[{ value: "uz", label: "O'zbekcha" }, { value: "ru", label: "Русский" }, { value: "en", label: "English" }]} /></Field>
            </div>
          </Card>

          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">4. {t("Designs")}</h3>
              <span className="text-xs muted">{t("{n} selected — one card is made for each", { n: chosen.size })}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {previews.map(({ l, doc }) => {
                const on = chosen.has(l);
                return (
                  <button key={l} type="button" aria-pressed={on} data-layout={l}
                    onClick={() => setChosen((s) => { const n = new Set(s); if (n.has(l)) n.delete(l); else n.add(l); return n; })}
                    className={cx("group relative overflow-hidden rounded-xl border-2 text-left transition", on ? "border-brand-500 ring-4 ring-brand-500/15" : "border-slate-200 opacity-70 hover:opacity-100 dark:border-slate-800")}>
                    <DocPreview doc={doc} width={300} />
                    <span className={cx("absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-white shadow", on ? "bg-brand-600" : "bg-slate-900/40")}>{on && <Check className="h-4 w-4" />}</span>
                    <span className="block px-2 py-1.5 text-xs font-semibold">{t(LAYOUT_LABEL[l])}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs muted">{t("The previews show sample texts. Your card gets the texts written by the AI from your product data.")}</p>
          </Card>

          <Card className="space-y-3 p-5">
            {error != null && <ErrorAlert error={error} />}
            {opts.data && !opts.data.textAi && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">{t("AI text writing is not connected on this server. Cards are made from the texts you typed.")}</p>}
            <Button size="lg" className="w-full" disabled={!ready || step !== null} loading={step !== null} onClick={() => void create(Boolean(opts.data?.textAi))} icon={<Wand2 className="h-5 w-5" />} data-testid="card-generate">
              {step ?? (opts.data?.textAi ? t("Create cards with AI") : t("Create cards"))}
            </Button>
            {aiFailed && opts.data?.textAi && (
              <Button variant="secondary" className="w-full" disabled={step !== null} onClick={() => void create(false)} data-testid="card-generate-manual">{t("Create from my texts without AI")}</Button>
            )}
            <p className="text-center text-xs muted">
              {!photo ? t("Upload a product photo to continue.") : input.name.length < 2 ? t("Enter the product name.") : chosen.size === 0 ? t("Choose at least one design.") : !user?.emailVerified ? t("Verify your email to continue.") : opts.data?.textAi ? t("The AI writes the title, infographic, description and ad texts. Uses one AI text request.") : ""}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ list + actions
function RenameDialog({ card, onClose }: { card: Summary | null; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  useEffect(() => { if (card) setName(card.name); }, [card]);
  const m = useMutation({
    mutationFn: () => patch(`/cards/${card!.id}`, { name: name.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cards"] }); qc.invalidateQueries({ queryKey: ["card", card!.id] }); onClose(); },
  });
  return (
    <Modal open={Boolean(card)} onClose={onClose} title={t("Rename card")}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) m.mutate(); }}>
        <Field label={t("Name")}><Input value={name} maxLength={120} autoFocus onChange={(e) => setName(e.target.value)} data-testid="rename-input" /></Field>
        {m.error && <ErrorAlert error={m.error} />}
        <div className="flex justify-end gap-2"><Button variant="ghost" type="button" onClick={onClose}>{t("Cancel")}</Button><Button type="submit" loading={m.isPending} disabled={!name.trim()}>{t("Save")}</Button></div>
      </form>
    </Modal>
  );
}

function useCardActions() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const duplicate = useMutation({
    mutationFn: (id: string) => post<{ card: Full }>(`/cards/${id}/duplicate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cards"] }); toast("success", t("Card duplicated")); },
    onError: (e) => toast("error", errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/cards/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cards"] }); toast("success", t("Deleted")); },
    onError: (e) => toast("error", errorMessage(e)),
  });
  const [zipping, setZipping] = useState<string | null>(null);
  const zip = async (ids: string[], type: ExportType) => {
    if (!ids.length) return;
    setZipping(`0/${ids.length}`);
    try { await downloadZip(ids, type, (n) => setZipping(`${n}/${ids.length}`)); toast("success", t("Downloaded {n} cards (ZIP).", { n: ids.length })); }
    catch (e) { toast("error", e instanceof Error && e.message === "WEBP_UNSUPPORTED" ? t("This browser cannot save {type}. Use PNG or JPG, or another browser (Chrome, Edge, Firefox).", { type: "WEBP" }) : t("The file could not be created. Try again.")); }
    finally { setZipping(null); }
  };
  return { duplicate, remove, zip, zipping };
}

function ZipButton({ ids, actions, label }: { ids: string[]; actions: ReturnType<typeof useCardActions>; label: string }) {
  const { t } = useI18n();
  const [type, setType] = useState<ExportType>("image/png");
  return (
    <div className="flex items-center gap-1.5">
      <Select value={type} onChange={(e) => setType(e.target.value as ExportType)} aria-label={t("File type")} className="!w-24" options={[{ value: "image/png", label: "PNG" }, { value: "image/jpeg", label: "JPG" }, { value: "image/webp", label: "WEBP" }]} />
      <Button size="sm" disabled={!ids.length || actions.zipping !== null} loading={actions.zipping !== null} icon={<Download className="h-4 w-4" />} onClick={() => void actions.zip(ids, type)} data-testid="zip-download">
        {actions.zipping ? `${t("Preparing")} ${actions.zipping}` : label}
      </Button>
    </div>
  );
}

function CardTile({ c, selected, onSelect, onOpen, onRename, onDelete, actions, mpLabel }: {
  c: Summary; selected?: boolean; onSelect?: () => void; onOpen: () => void; onRename: () => void; onDelete: () => void; actions: ReturnType<typeof useCardActions>; mpLabel: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cx("card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg", selected && "ring-2 ring-brand-500")} data-card={c.id}>
      <div className="relative">
        <button type="button" className="block w-full bg-slate-100 dark:bg-slate-800" onClick={onOpen} aria-label={`${t("Edit")}: ${c.name}`}>
          {c.thumb ? <img src={c.thumb} alt={c.name} className="aspect-[3/4] w-full object-contain" loading="lazy" decoding="async" /> : <div className="grid aspect-[3/4] place-items-center"><LayoutGrid className="h-6 w-6 muted" /></div>}
        </button>
        {onSelect && (
          <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={t("Select")} className={cx("absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-lg shadow", selected ? "bg-brand-600 text-white" : "bg-white/90 text-slate-700")}>
            {selected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </button>
        )}
        <span className="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white shadow" style={{ background: PALETTES[c.marketplace]?.primary === "#FFCC00" ? "#1A1A1A" : PALETTES[c.marketplace]?.primary }}>{mpLabel}</span>
      </div>
      <div className="space-y-2 p-2.5 sm:p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold" title={c.name}>{c.name}</p>
          <p className="truncate text-[11px] muted">{c.w}×{c.h} · {timeAgo(c.updatedAt)}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" className="flex-1" icon={<PencilLine className="h-3.5 w-3.5" />} onClick={onOpen}>{t("Edit")}</Button>
          <button type="button" title={t("Rename")} aria-label={t("Rename")} onClick={onRename} className="rounded-lg p-2 muted hover:bg-[var(--v-th)] hover:text-current" data-testid="card-rename"><PencilLine className="h-4 w-4" /></button>
          <button type="button" title={t("Duplicate")} aria-label={t("Duplicate")} onClick={() => actions.duplicate.mutate(c.id)} className="rounded-lg p-2 muted hover:bg-[var(--v-th)] hover:text-current" data-testid="card-duplicate"><Copy className="h-4 w-4" /></button>
          <button type="button" title={t("Delete")} aria-label={t("Delete")} onClick={onDelete} className="rounded-lg p-2 muted hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" data-testid="card-delete"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}

function CardList({ onNew, open, openGroup }: { onNew: () => void; open: (id: string) => void; openGroup: (g: string) => void }) {
  const { t } = useI18n();
  const opts = useOptions();
  const cards = useCards();
  const actions = useCardActions();
  const [mp, setMp] = useState<"all" | MarketplaceKey>("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [rename, setRename] = useState<Summary | null>(null);
  const [toDelete, setToDelete] = useState<Summary | null>(null);
  const items = useMemo(() => (cards.data ?? []).filter((c) => (mp === "all" || c.marketplace === mp) && (!q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()))), [cards.data, mp, q]);
  const label = (k: MarketplaceKey) => t(opts.data?.marketplaces[k]?.label ?? k);
  const counts = useMemo(() => { const m: Record<string, number> = {}; for (const c of cards.data ?? []) m[c.marketplace] = (m[c.marketplace] ?? 0) + 1; return m; }, [cards.data]);
  void openGroup;

  if (cards.isLoading) return <Card className="grid h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></Card>;
  if (cards.error) return <ErrorAlert error={cards.error} />;
  const all = cards.data ?? [];
  return (
    <div className="space-y-4" data-testid="card-list">
      <Card className="relative overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-violet-500/25 via-fuchsia-500/20 to-sky-400/20 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <h2 className="text-lg font-bold">{t("Product cards for marketplaces")}</h2>
            <p className="mt-1 text-sm muted">{t("Upload a product photo and its details: the AI writes the texts and makes several card designs for Uzum Market, Wildberries, Ozon, Yandex Market and others. Edit and download them in the right sizes.")}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {MP_ORDER.slice(0, 4).map((k) => <span key={k} className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `${PALETTES[k].primary}1f`, color: k === "yandex" ? "#8a6d00" : PALETTES[k].primary }}>{label(k)}</span>)}
            </div>
          </div>
          <Button size="lg" icon={<Plus className="h-5 w-5" />} onClick={onNew} data-testid="card-new">{t("New card")}</Button>
        </div>
      </Card>

      {all.length === 0 ? (
        <Card className="p-6"><EmptyState icon={<LayoutGrid className="h-6 w-6" />} title={t("No product cards yet")} text={t("Create your first card: it takes about a minute.")} action={<Button icon={<Sparkles className="h-4 w-4" />} onClick={onNew}>{t("Create a card")}</Button>} /></Card>
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
              {(["all", ...MP_ORDER] as const).map((k) => (
                <button key={k} type="button" onClick={() => setMp(k)} className={cx("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition", mp === k ? "border-transparent bg-[var(--v-btn)] text-[var(--v-btn-text)]" : "border-[var(--v-line)] hover:bg-[var(--v-th)]")}>
                  {k === "all" ? t("All") : label(k)}<span className="opacity-60">{k === "all" ? all.length : counts[k] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search cards")} className="pl-9" aria-label={t("Search cards")} />
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSel(sel.size === items.length ? new Set() : new Set(items.map((c) => c.id)))}>{sel.size === items.length && items.length ? t("Clear selection") : t("Select all")}</Button>
              <ZipButton ids={[...sel].filter((id) => all.some((c) => c.id === id))} actions={actions} label={t("Download {n} (ZIP)", { n: sel.size })} />
            </div>
          </div>
          {items.length === 0 ? <p className="py-10 text-center text-sm muted">{t("No cards found")}</p> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-5">
              {items.map((c) => (
                <CardTile key={c.id} c={c} actions={actions} mpLabel={label(c.marketplace)} selected={sel.has(c.id)}
                  onSelect={() => setSel((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                  onOpen={() => open(c.id)} onRename={() => setRename(c)} onDelete={() => setToDelete(c)} />
              ))}
            </div>
          )}
        </>
      )}
      <RenameDialog card={rename} onClose={() => setRename(null)} />
      <ConfirmDialog open={Boolean(toDelete)} title={t("Delete card?")} text={t("The card design will be permanently deleted.")} confirmLabel={t("Delete")} loading={actions.remove.isPending}
        onClose={() => setToDelete(null)} onConfirm={() => toDelete && actions.remove.mutate(toDelete.id, { onSuccess: () => { setSel((s) => { const n = new Set(s); n.delete(toDelete.id); return n; }); setToDelete(null); } })} />
    </div>
  );
}

// ------------------------------------------------------------------ result of one creation (the variants)
function GroupView({ groupId, open, onBack, onNew }: { groupId: string; open: (id: string) => void; onBack: () => void; onNew: () => void }) {
  const { t } = useI18n();
  const opts = useOptions();
  const cards = useCards();
  const actions = useCardActions();
  const [rename, setRename] = useState<Summary | null>(null);
  const [toDelete, setToDelete] = useState<Summary | null>(null);
  const items = (cards.data ?? []).filter((c) => c.groupId === groupId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const first = items[0];
  const detail = useQuery({ queryKey: ["card", first?.id], queryFn: () => get<{ card: Full }>(`/cards/${first!.id}`).then((r) => r.card), enabled: Boolean(first) });
  if (cards.isLoading) return <Card className="grid h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></Card>;
  if (!first) return <Card className="p-6"><EmptyState icon={<LayoutGrid className="h-6 w-6" />} title={t("These cards were deleted")} action={<Button onClick={onBack}>{t("My cards")}</Button>} /></Card>;
  const mpLabel = t(opts.data?.marketplaces[first.marketplace]?.label ?? first.marketplace);
  return (
    <div className="space-y-5" data-testid="card-group">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBack}>{t("My cards")}</Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold">{detail.data?.input?.name ?? first.name}</h2>
          <p className="text-xs muted">{mpLabel} · {t("{n} designs", { n: items.length })} · {first.w}×{first.h}</p>
        </div>
        <ZipButton ids={items.map((c) => c.id)} actions={actions} label={t("Download all (ZIP)")} />
        <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={onNew}>{t("New card")}</Button>
      </div>
      <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
        <Check className="mt-0.5 h-4 w-4 flex-none" /><span>{t("Your cards are ready and saved. Open a design to change texts, colours, pictures and icons.")}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {items.map((c) => <CardTile key={c.id} c={c} actions={actions} mpLabel={mpLabel} onOpen={() => open(c.id)} onRename={() => setRename(c)} onDelete={() => setToDelete(c)} />)}
      </div>
      <Card className="p-5">
        <h3 className="mb-1 flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-brand-600" />{t("Texts for the marketplace")}</h3>
        <p className="mb-4 text-xs muted">{t("Paste them into the product page on the marketplace and into your ads.")}</p>
        {detail.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-brand-600" /> : <CopyPanel copy={detail.data?.copy ?? {}} />}
      </Card>
      <RenameDialog card={rename} onClose={() => setRename(null)} />
      <ConfirmDialog open={Boolean(toDelete)} title={t("Delete card?")} text={t("The card design will be permanently deleted.")} confirmLabel={t("Delete")} loading={actions.remove.isPending}
        onClose={() => setToDelete(null)} onConfirm={() => toDelete && actions.remove.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })} />
    </div>
  );
}

// ------------------------------------------------------------------ edit one card
/** Everything a design is built from, as saved with the card. */
function cardData(c: Full) {
  const input = { name: c.input.name ?? c.name, features: c.input.features ?? [], benefits: c.input.benefits ?? [], price: c.input.price, oldPrice: c.input.oldPrice, marketplace: c.marketplace, language: c.input.language ?? "uz" } as CardInput;
  const copy = { ...manualCopy(input), ...c.copy } as CardCopy;
  const photo = c.photoUploadId ? { src: `/api/files/${c.photoUploadId}`, cutout: c.input.photoCutout ?? true } : null;
  return { copy, input, photo };
}

/** Choose another design for a card (the texts and photo stay). */
function DesignPicker({ c, current, size, onPick, busy }: { c: Full; current: string; size: { w: number; h: number }; onPick: (l: LayoutKey) => void; busy: boolean }) {
  const { t } = useI18n();
  const data = useMemo(() => cardData(c), [c]);
  return (
    <div className="space-y-2" data-testid="design-picker">
      <p className="text-xs font-bold uppercase tracking-wide muted">{t("Change the design")}</p>
      <div className="grid grid-cols-3 gap-2">
        {layoutsFor(c.marketplace).map((l) => (
          <button key={l} type="button" disabled={busy} onClick={() => l !== current && onPick(l)} data-design={l} title={t(LAYOUT_LABEL[l])}
            className={cx("overflow-hidden rounded-lg border-2 text-left transition disabled:opacity-60", l === current ? "border-brand-500 ring-2 ring-brand-500/20" : "border-slate-200 hover:border-brand-300 dark:border-slate-700")}>
            <DocPreview doc={buildCard(l, data, size)} width={150} />
            <span className="block truncate px-1.5 py-1 text-[10px] font-semibold">{t(LAYOUT_LABEL[l])}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] muted">{t("The texts, price and photo stay; your manual changes on this card are replaced by the new design.")}</p>
    </div>
  );
}

const PICTURE_IDEAS = ["Remove all words from the picture", "Change the words in the picture to \"NEW\"", "Remove the logo from the picture", "Make the words in the picture bigger and clearer"];

/**
 * Change the words inside a picture (they are part of the photo, not editable text) with the AI image
 * editor. One AI image from the plan's limit; the new picture replaces the old one on the card.
 */
function AiPictureEdit({ el, apply }: { el: ImageEl; apply: (src: string) => Promise<void> }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const uploadId = /^\/api\/files\/([0-9a-f-]{36})/.exec(el.src)?.[1];
  const run = async () => {
    if (!uploadId) return;
    setError(null); setBusy(t("Sending to the AI…"));
    try {
      // a cut-out product (no frame) is edited with a transparent background, so it stays cut out
      const transparent = el.fit === "contain" && (el.mask ?? "none") === "none";
      const r = await post<{ generation: Generation }>("/cards/edit-image", { uploadId, instructions: text.trim(), transparent });
      setBusy(t("The AI is changing the picture… (up to a minute)"));
      let g = r.generation;
      const until = Date.now() + 4 * 60_000;
      while (g.status !== "succeeded" && g.status !== "failed") {
        if (Date.now() > until) throw new Error(t("The AI is taking too long. The result will appear in the AI Product Studio history."));
        await new Promise((ok) => setTimeout(ok, 2000));
        g = (await get<{ generation: Generation }>(`/studio/generations/${g.id}`)).generation;
      }
      qc.invalidateQueries({ queryKey: ["subscription"] });
      qc.invalidateQueries({ queryKey: ["generations"] });
      if (g.status === "failed" || !g.resultUrl) throw new Error(g.error ?? t("Generation failed"));
      await apply(g.resultUrl);
      setText("");
      toast("success", t("The picture was changed."));
    } catch (e) { setError(e); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-500/30 dark:bg-brand-500/5" data-testid="ai-picture">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><Wand2 className="h-4 w-4 text-brand-600" />{t("Change the words in the picture with AI")}</p>
      <p className="text-[11px] muted">{t("Words that are part of the photo (printed on the product or on the background) cannot be typed over. Write what to do with them, the AI redraws the picture. Uses one AI image from your limit.")}</p>
      {!uploadId ? <p className="text-xs muted">{t("Upload your product photo first.")}</p> : (
        <>
          <div className="flex flex-wrap gap-1">
            {PICTURE_IDEAS.map((x) => <button key={x} type="button" onClick={() => setText(t(x))} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] hover:border-brand-400 dark:border-slate-700 dark:bg-slate-900">{t(x)}</button>)}
          </div>
          <textarea className="input min-h-16 text-sm" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("e.g. remove the words OVERSIZED FIT")} data-testid="ai-picture-input" />
          {error != null && <ErrorAlert error={error} />}
          <Button size="sm" className="w-full" disabled={text.trim().length < 3 || busy !== null} loading={busy !== null} onClick={() => void run()} icon={<Sparkles className="h-4 w-4" />} data-testid="ai-picture-apply">
            {busy ?? t("Change the picture")}
          </Button>
        </>
      )}
    </div>
  );
}

function CardEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const opts = useOptions();
  const q = useQuery({ queryKey: ["card", id], queryFn: () => get<{ card: Full }>(`/cards/${id}`).then((r) => r.card), staleTime: Infinity, gcTime: 0 });
  const [status, setStatus] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const pending = useRef<Doc | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDoc = useRef<Doc | null>(null);
  const [ver, setVer] = useState(0);
  const [switching, setSwitching] = useState<LayoutKey | null>(null);
  const [confirmLayout, setConfirmLayout] = useState<LayoutKey | null>(null);
  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const doc = pending.current;
    if (!doc) return;
    pending.current = null;
    setStatus("saving");
    try {
      const thumb = await thumbOf(doc);
      await patch(`/cards/${id}`, { doc, thumb });
      if (!pending.current) setStatus("saved");
      qc.invalidateQueries({ queryKey: ["cards"] });
    } catch (e) {
      pending.current ??= doc;
      setStatus("error");
      toast("error", errorMessage(e));
    }
  }, [id, qc, toast]);
  const onChange = useCallback((doc: Doc) => {
    pending.current = doc;
    lastDoc.current = doc;
    setStatus("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1200);
  }, [flush]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (pending.current) { e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); void flush(); };
  }, [flush]);
  const c = q.data;
  const original = useMemo(() => {
    if (!c) return null;
    return MARKETPLACE_LAYOUTS[c.marketplace] && LAYOUT_LABEL[c.layout] ? buildCard(c.layout, cardData(c), { w: c.doc.w, h: c.doc.h }) : c.doc;
  }, [c]);
  /** Put another design on the card (saved at once; the editor starts again from it). */
  const switchDesign = async (layout: LayoutKey) => {
    if (!c) return;
    setSwitching(layout);
    try {
      await flush();
      const cur = lastDoc.current ?? c.doc;
      const doc = buildCard(layout, cardData(c), { w: cur.w, h: cur.h });
      const thumb = await thumbOf(doc);
      // "Bag · Bright" becomes "Bag · Frame" (a name the user typed is kept)
      const oldSuffix = ` · ${t(LAYOUT_LABEL[c.layout as LayoutKey] ?? c.layout)}`;
      const name = c.name.endsWith(oldSuffix) ? `${c.name.slice(0, -oldSuffix.length)} · ${t(LAYOUT_LABEL[layout])}`.slice(0, 120) : undefined;
      const r = await patch<{ card: Full }>(`/cards/${id}`, { layout, doc, thumb, ...(name ? { name } : {}) });
      lastDoc.current = null;
      qc.setQueryData(["card", id], r.card);
      qc.invalidateQueries({ queryKey: ["cards"] });
      setVer((v) => v + 1);
      toast("success", t("Design changed"));
    } catch (e) { toast("error", errorMessage(e)); } finally { setSwitching(null); }
  };
  if (q.isLoading) return <Card className="grid h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></Card>;
  if (q.error || !c || !original) return <div className="space-y-3"><ErrorAlert error={q.error} /><Button variant="ghost" onClick={onBack}>{t("My cards")}</Button></div>;
  const mpLabel = t(opts.data?.marketplaces[c.marketplace]?.label ?? c.marketplace);
  const statusEl = (
    <span className={cx("hidden items-center gap-1 text-xs sm:inline-flex", status === "error" ? "text-rose-600" : "muted")} data-testid="save-status" data-status={status}>
      {status === "saving" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("Saving…")}</> : status === "pending" ? t("Unsaved changes") : status === "error" ? t("Not saved") : <><Check className="h-3.5 w-3.5 text-emerald-600" />{t("Saved")}</>}
    </span>
  );
  return (
    <>
    <Editor
      key={`${c.layout}:${ver}`}
      onBack={() => { void flush().then(onBack); }}
      card={{
        doc: c.doc, original, title: c.name, subtitle: `${mpLabel} · ${t(LAYOUT_LABEL[c.layout] ?? c.layout)}`, backLabel: t("My cards"),
        sizes: opts.data?.marketplaces[c.marketplace]?.sizes ?? [{ w: c.doc.w, h: c.doc.h }],
        onChange, storeImage: (u) => storeImage(u), fileName: slug(c.name), status: statusEl,
        extra: {
          label: t("Design and texts"),
          content: (
            <div className="space-y-5">
              <DesignPicker c={c} current={c.layout} size={{ w: (lastDoc.current ?? c.doc).w, h: (lastDoc.current ?? c.doc).h }} onPick={setConfirmLayout} busy={switching !== null} />
              <div className="space-y-2"><p className="text-xs font-bold uppercase tracking-wide muted">{t("AI texts")}</p><CopyPanel copy={c.copy} compact /></div>
            </div>
          ),
        },
        imageTool: (el, apply) => <AiPictureEdit key={el.id} el={el} apply={apply} />,
      }}
    />
    <ConfirmDialog open={Boolean(confirmLayout)} title={t("Change the design?")} text={t("The card gets the new design with the same texts, price and photo. Changes you made by hand on this card are replaced.")}
      confirmLabel={t("Change")} loading={switching !== null} onClose={() => setConfirmLayout(null)}
      onConfirm={() => { const l = confirmLayout; setConfirmLayout(null); if (l) void switchDesign(l); }} />
    </>
  );
}

// ------------------------------------------------------------------ tab
export default function CardsTab() {
  const [params, setParams] = useSearchParams();
  const go = (p: Record<string, string>) => { setParams({ tab: "cards", ...p }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cardId = params.get("card"), group = params.get("group"), isNew = params.get("new") === "1";
  if (cardId) return <CardEditor key={cardId} id={cardId} onBack={() => (group ? go({ group }) : go({}))} />;
  if (isNew) return <CreateCard onDone={(g) => go({ group: g })} onCancel={() => go({})} />;
  if (group) return <GroupView groupId={group} open={(id) => go({ group, card: id })} onBack={() => go({})} onNew={() => go({ new: "1" })} />;
  return <CardList onNew={() => go({ new: "1" })} open={(id) => go({ card: id })} openGroup={(g) => go({ group: g })} />;
}

