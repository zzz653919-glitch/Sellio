/**
 * Product card generator: photo → platform → theme → camera angle → composition and background →
 * colours and text → Generate. Every control changes the generation settings (the live preview shows them);
 * the AI writes the texts and, when chosen, re-shoots the product photo in the chosen theme, angle,
 * background and light (the product itself is kept exactly as it is).
 */
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, Loader2, Palette as PaletteIcon, Sparkles, UploadCloud, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ErrorAlert } from "../components/shared";
import { Button, Card, Field, Input, Select, cx, useToast } from "../components/ui";
import { errorMessage, get, post, upload } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import type { Generation } from "../lib/types";
import { readPhoto } from "../studio/photo";
import {
  dataUrlToBlob, DocPreview, MP_ORDER, RATIOS, sizeFor, thumbOf, useDebounced, useOptions,
  type Full, type GenConfig, type Ratio, type Summary,
} from "./common";
import {
  brandOf, buildCard, defaultStyle, LAYOUT_LABEL, manualCopy, SAMPLE_COPY,
  type BackgroundKey, type CardCopy, type CardInput, type CardPhoto, type LayoutKey, type LightKey, type MarketplaceKey, type StyleConfig,
} from "./layouts";
import { ThemeFolder, ThemeGallery, themeLayouts } from "./ThemeGallery";
import { FONT_PAIRS, THEME_BY_KEY, THEMES, type ThemePreset } from "./themes";

const BG_OPTIONS: { key: BackgroundKey; label: string; swatch: string }[] = [
  { key: "auto", label: "Theme default", swatch: "conic-gradient(#f43f5e,#f59e0b,#10b981,#3b82f6,#a855f7,#f43f5e)" },
  { key: "white", label: "Pure white", swatch: "#FFFFFF" }, { key: "black", label: "Dark black", swatch: "#0B0B0F" },
  { key: "gray", label: "Light gray", swatch: "#E5E7EB" }, { key: "beige", label: "Beige", swatch: "#EEE3D2" },
  { key: "gradient", label: "Gradient", swatch: "linear-gradient(135deg,#6366F1,#EC4899)" },
  { key: "flowers", label: "Flowers", swatch: "radial-gradient(circle at 30% 30%,#F9A8D4 20%,#FDE7EE 21%)" },
  { key: "nature", label: "Nature", swatch: "linear-gradient(135deg,#86B97F,#E6EEDD)" },
  { key: "marble", label: "Marble", swatch: "linear-gradient(120deg,#F4F3F1 40%,#C9C7C2 45%,#F4F3F1 50%)" },
  { key: "studio", label: "Studio background", swatch: "radial-gradient(circle,#FFFFFF,#C9CDD3)" },
  { key: "interior", label: "Luxury interior", swatch: "linear-gradient(160deg,#2A211B,#6B5543)" },
  { key: "custom", label: "Custom background", swatch: "repeating-linear-gradient(45deg,#e5e7eb 0 4px,#fff 4px 8px)" },
];
const SCENE_BACKGROUNDS: BackgroundKey[] = ["flowers", "nature", "marble", "studio", "interior"];
const SCENE_THEMES = ["flowers", "nature", "marble", "studio-3d", "cinematic", "seasonal"];

/** The AI photo gets a transparent background when the card draws its own (plain) background. */
const wantsTransparent = (cfg: Pick<GenConfig, "style" | "layouts">) =>
  !(SCENE_BACKGROUNDS.includes(cfg.style.background) || (cfg.style.background === "auto" && SCENE_THEMES.includes(cfg.style.theme)) || cfg.layouts.every((l) => l === "lifestyle"));

type PhotoState = { file?: File; preview: string; cutout: boolean; uploadId: string | null; busy: boolean };
type Step = { key: string; label: string; state: "wait" | "run" | "done" | "warn"; note?: string };

function Section({ n, title, children, right, testId }: { n: number; title: string; children: ReactNode; right?: ReactNode; testId?: string }) {
  return (
    <Card className="space-y-4 p-5" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{n}. {title}</h3>{right}</div>
      {children}
    </Card>
  );
}

export function CreateCard({ onDone, onCancel, from, regen }: { onDone: (groupId: string) => void; onCancel: () => void; from?: string | null; regen?: boolean }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const opts = useOptions();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<PhotoState | null>(null);
  const [photoError, setPhotoError] = useState<unknown>(null);
  const [dragging, setDragging] = useState(false);
  const [f, setF] = useState({ name: "", features: "", benefits: "", price: "", oldPrice: "", marketplace: "uzum" as MarketplaceKey, language: (["uz", "ru", "en"].includes(lang) ? lang : "uz") as CardInput["language"] });
  // a theme is a folder of five designs; the camera angle is left to the AI
  const [cfg, setCfg] = useState<Omit<GenConfig, "size">>({ style: defaultStyle("uzum"), layouts: themeLayouts(defaultStyle("uzum").theme), angle: "auto", aiPhoto: true, variations: 1, ratio: "3:4" });
  const [customColors, setCustomColors] = useState(false);
  const [more, setMore] = useState(true);
  const [gallery, setGallery] = useState(false);
  const [previewLayout, setPreviewLayout] = useState<LayoutKey | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const setStyle = (p: Partial<StyleConfig>) => setCfg((c) => ({ ...c, style: { ...c.style, ...p } }));

  const platform = opts.data?.marketplaces[f.marketplace];
  const size = sizeFor(platform, cfg.ratio);
  const imageAi = Boolean(opts.data?.imageAi);
  const aiPhoto = cfg.aiPhoto && imageAi;
  const lines = (s: string) => s.split(/\n+/).map((x) => x.replace(/^[\s•\-–*]+/, "").trim()).filter(Boolean).slice(0, 12);
  const input: CardInput = { name: f.name.trim(), features: lines(f.features), benefits: lines(f.benefits), price: f.price.trim() || undefined, oldPrice: f.oldPrice.trim() || undefined, marketplace: f.marketplace, language: f.language };

  // platform change: its recommended ratio and compositions
  const firstPlatform = useRef(true);
  useEffect(() => {
    if (firstPlatform.current) { firstPlatform.current = false; return; }
    if (platform) setCfg((c) => ({ ...c, ratio: platform.ratio }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.marketplace]);

  // "reuse these settings" / "regenerate": start from a saved session
  const [prefilled, setPrefilled] = useState(!from);
  useEffect(() => {
    if (!from) return;
    let alive = true;
    void (async () => {
      try {
        const list = (await get<{ items: Summary[] }>("/cards")).items.filter((x) => x.groupId === from);
        if (!list.length) { setPrefilled(true); return; }
        const { card } = await get<{ card: Full }>(`/cards/${list[0].id}`);
        if (!alive) return;
        const i = card.input;
        firstPlatform.current = true;
        setF({ name: i.name ?? card.name, features: (i.features ?? []).join("\n"), benefits: (i.benefits ?? []).join("\n"), price: i.price ?? "", oldPrice: i.oldPrice ?? "", marketplace: card.marketplace, language: i.language ?? "uz" });
        const up = i.originalUploadId ?? card.photoUploadId;
        if (up) setPhoto({ preview: `/api/files/${up}`, cutout: i.photoCutout ?? true, uploadId: up, busy: false });
        if (i.config) {
          setCfg({ style: i.config.style, layouts: i.config.layouts, angle: "auto", aiPhoto: i.config.aiPhoto, variations: 1, ratio: i.config.ratio });
          if (i.config.style.colors?.main) setCustomColors(true);
        } else setCfg((c) => ({ ...c, layouts: list.map((x) => x.layout).filter((l, k, a) => a.indexOf(l) === k).slice(0, 4) }));
      } catch (e) { setError(e); } finally { if (alive) setPrefilled(true); }
    })();
    return () => { alive = false; };
  }, [from]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setPhotoError(null);
    try {
      const read = await readPhoto(file);
      const state: PhotoState = { file, preview: URL.createObjectURL(dataUrlToBlob(read.src)), cutout: read.cutout, uploadId: null, busy: true };
      setPhoto(state);
      const fd = new FormData();
      if (read.cutout) fd.append("file", new File([dataUrlToBlob(read.src)], `${file.name.replace(/\.\w+$/, "")}.png`, { type: "image/png" }));
      else fd.append("file", file);
      const r = await upload<{ upload: { id: string } }>("/studio/uploads", fd);
      setPhoto({ ...state, uploadId: r.upload.id, busy: false });
      if (!f.name) setF((x) => ({ ...x, name: x.name || file.name.replace(/\.\w+$/, "").replace(/[-_]+/g, " ").slice(0, 120).replace(/^(img|dsc|photo|image)\s?\d+$/i, "") }));
    } catch (e) {
      setPhoto(null);
      setPhotoError(e instanceof Error && !("status" in e) ? new Error(t(e.message)) : e);
    } finally { if (fileRef.current) fileRef.current.value = ""; }
  };
  const useOriginal = async () => {
    if (!photo?.file) return;
    const file = photo.file;
    setPhoto({ ...photo, busy: true });
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await upload<{ upload: { id: string } }>("/studio/uploads", fd);
      setPhoto({ file, preview: URL.createObjectURL(file), cutout: false, uploadId: r.upload.id, busy: false });
    } catch (e) { setPhoto({ ...photo, busy: false }); setPhotoError(e); }
  };
  /** Open a theme's folder: its five designs, its background and light. */
  const applyTheme = (th: ThemePreset) => {
    const layouts = themeLayouts(th.key);
    setCfg((c) => ({ ...c, layouts, style: { ...c.style, theme: th.key, background: (th.suggest.background || "auto") as BackgroundKey, lighting: (th.suggest.lighting || "soft") as LightKey } }));
    setPreviewLayout(layouts[0]);
  };

  // live preview (redrawn a moment after typing stops)
  const live = useDebounced({ name: f.name.trim(), price: input.price, oldPrice: input.oldPrice, style: cfg.style, size, mp: f.marketplace }, 250);
  const previewPhoto: CardPhoto | null = photo ? { src: photo.preview, cutout: photo.cutout } : null;
  const sampleCopy: CardCopy = useMemo(() => ({ ...SAMPLE_COPY, title: live.name || t(SAMPLE_COPY.title), subtitle: t(SAMPLE_COPY.subtitle), badge: t("New"), benefits: SAMPLE_COPY.benefits.map((b) => ({ ...b, title: t(b.title), text: t(b.text) })), specs: SAMPLE_COPY.specs.map((s) => ({ label: t(s.label), value: t(s.value) })) }), [live.name, t]);
  const sample = { copy: sampleCopy, input: { ...input, marketplace: live.mp, price: live.price ?? "199 000", oldPrice: live.oldPrice }, photo: previewPhoto, photos: { before: previewPhoto }, style: live.style };
  const shownLayout = previewLayout && cfg.layouts.includes(previewLayout) ? previewLayout : cfg.layouts[0] ?? "hero";
  const previewDoc = buildCard(shownLayout, sample, live.size);
  const cardsCount = cfg.layouts.length;

  const ready = Boolean(photo?.uploadId && input.name.length >= 2 && cfg.layouts.length > 0 && user?.emailVerified && prefilled);
  const setStep = (key: string, p: Partial<Step>) => setSteps((s) => s?.map((x) => (x.key === key ? { ...x, ...p } : x)) ?? null);

  const create = async () => {
    if (!photo?.uploadId) return;
    setError(null);
    const warnings: string[] = [];
    const original: CardPhoto = { src: `/api/files/${photo.uploadId}`, cutout: photo.cutout };
    const textAi = Boolean(opts.data?.textAi);
    const transparent = wantsTransparent(cfg);
    setSteps([
      { key: "texts", label: textAi ? t("The AI is writing the texts") : t("Preparing your texts"), state: "run" },
      ...(aiPhoto ? [{ key: "photos", label: t("The AI is making the product photo"), state: "run" as const }] : []),
      { key: "design", label: t("Drawing the designs"), state: "wait" },
      { key: "save", label: t("Saving"), state: "wait" },
    ]);
    try {
      const textsP = (textAi ? post<{ copy: CardCopy }>("/cards/copy", { ...input, uploadId: photo.uploadId }).then((r) => r.copy) : Promise.resolve(manualCopy(input)))
        .catch((e) => { warnings.push(`${t("AI texts")}: ${errorMessage(e)}`); return manualCopy(input); })
        .finally(() => setStep("texts", { state: "done" }));
      let aiPhotos: CardPhoto[] = [];
      let referenceStyle: string | null = null;
      const photosP = aiPhoto ? (async () => {
        try {
          const r = await post<{ generations: Generation[]; referenceStyle: string | null; limitMessage: string | null }>("/cards/photos", {
            uploadId: photo.uploadId, productName: input.name, platform: f.marketplace, theme: cfg.style.theme, angle: "auto", background: cfg.style.background,
            lighting: cfg.style.lighting, shadow: Math.round(cfg.style.shadow), ratio: cfg.ratio, count: 1, transparent,
            colors: cfg.style.colors?.main ? cfg.style.colors : undefined,
          });
          referenceStyle = r.referenceStyle;
          if (r.limitMessage) warnings.push(r.limitMessage);
          const until = Date.now() + 4 * 60_000;
          const gens = [...r.generations];
          let done = 0;
          while (gens.some((g) => g.status !== "succeeded" && g.status !== "failed")) {
            if (Date.now() > until) { warnings.push(t("The AI is taking too long. The result will appear in the AI Product Studio history.")); break; }
            await new Promise((ok) => setTimeout(ok, 2000));
            for (const [k, g] of gens.entries()) if (g.status !== "succeeded" && g.status !== "failed") gens[k] = (await get<{ generation: Generation }>(`/studio/generations/${g.id}`)).generation;
            done = gens.filter((g) => g.status === "succeeded" || g.status === "failed").length;
            setStep("photos", { note: `${done}/${gens.length}` });
          }
          aiPhotos = gens.filter((g) => g.status === "succeeded" && g.resultUrl).map((g) => ({ src: g.resultUrl!, cutout: transparent }));
          const failed = gens.filter((g) => g.status === "failed");
          if (failed.length) warnings.push(`${t("Some AI photos failed")}: ${failed[0].error ?? ""}`);
          qc.invalidateQueries({ queryKey: ["subscription"] });
          qc.invalidateQueries({ queryKey: ["generations"] });
          setStep("photos", { state: aiPhotos.length ? "done" : "warn", note: aiPhotos.length ? `${aiPhotos.length}/${gens.length}` : t("your photo is used") });
        } catch (e) {
          warnings.push(`${t("AI photos")}: ${errorMessage(e)}`);
          setStep("photos", { state: "warn", note: t("your photo is used") });
        }
      })() : Promise.resolve();
      const [copy] = await Promise.all([textsP, photosP]);
      setStep("design", { state: "run" });
      const photos = aiPhotos.length ? aiPhotos : [original];
      const jobs: { layout: LayoutKey; photo: CardPhoto; extra: CardPhoto[] }[] = [];
      for (const l of cfg.layouts) {
        if (l === "multiAngle" || photos.length === 1) jobs.push({ layout: l, photo: photos[0], extra: photos.slice(1) });
        else for (const ph of photos) jobs.push({ layout: l, photo: ph, extra: photos.filter((x) => x !== ph) });
      }
      const picked = jobs.slice(0, 12);
      const docs = picked.map((j) => buildCard(j.layout, { copy, input, photo: j.photo, photos: { before: original, extra: j.extra }, style: cfg.style }, size));
      const thumbs = await Promise.all(docs.map(thumbOf));
      setStep("design", { state: "done" }); setStep("save", { state: "run" });
      const config: GenConfig = { ...cfg, angle: "auto", variations: 1, size, referenceUploadId: null, referenceStyle };
      const r = await post<{ cards: Full[] }>("/cards", {
        cards: docs.map((doc, i) => ({
          name: `${input.name} · ${t(LAYOUT_LABEL[picked[i].layout])}${photos.length > 1 && picked[i].layout !== "multiAngle" ? ` ${photos.indexOf(picked[i].photo) + 1}` : ""}`,
          marketplace: f.marketplace, layout: picked[i].layout, photoUploadId: photo.uploadId,
          input: { ...input, photoCutout: photo.cutout, config, aiPhotos, originalUploadId: photo.uploadId }, copy, doc, thumb: thumbs[i],
        })),
      });
      setStep("save", { state: "done" });
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      for (const w of warnings) toast("error", w);
      onDone(r.cards[0].groupId);
    } catch (e) { setError(e); setSteps(null); }
  };
  // "Regenerate": start as soon as the saved settings are loaded
  const autoRan = useRef(false);
  useEffect(() => { if (regen && prefilled && ready && !autoRan.current && opts.data) { autoRan.current = true; void create(); } });

  const mp = opts.data?.marketplaces;
  const theme = THEME_BY_KEY[cfg.style.theme];
  const busy = steps !== null;
  const styleDeb = useDebounced(cfg.style, 300);
  const layoutSample = { ...sample, style: styleDeb };
  const thumbSize = size.w > size.h * 1.2 ? { w: 1080, h: 1350 } : size;

  return (
    <div className="space-y-5" data-testid="card-create">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={onCancel}>{t("My cards")}</Button>
        <h2 className="text-lg font-bold">{t("New product card")}</h2>
        <span className="ml-auto hidden text-xs muted sm:inline">{t("Universal AI product card studio")}</span>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          {/* 1. photo */}
          <Section n={1} title={t("Product photo")}>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} data-testid="card-photo-input" />
            <div>
              <div role="button" tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); void pick(e.dataTransfer.files?.[0]); }}
                className={cx("flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition", dragging ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-slate-300 hover:border-brand-400 dark:border-slate-700")} data-testid="card-photo">
                {photo ? (
                  <>
                    <div className="checker grid max-h-48 place-items-center overflow-hidden rounded-lg"><img src={photo.preview} alt="" className="max-h-48 object-contain" /></div>
                    <p className="flex items-center gap-1.5 text-xs muted">{photo.busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("Uploading securely…")}</> : photo.cutout ? <><Check className="h-3.5 w-3.5 text-emerald-600" />{t("Background removed automatically")}</> : t("The photo is used with its background")}</p>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-9 w-9 text-brand-500" />
                    <p className="font-medium">{t("Drag & drop a product photo")}</p>
                    <p className="text-xs muted">{t("A photo on a plain (white) background works best: the background is removed automatically.")}</p>
                  </>
                )}
              </div>
            </div>
            {photo?.file && !photo.busy && photo.cutout && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-2.5 text-xs dark:bg-slate-800/60">
                <span className="muted">{t("Background not removed correctly?")}</span>
                <Button size="sm" variant="secondary" onClick={() => void useOriginal()} data-testid="use-original">{t("Use the original photo")}</Button>
              </div>
            )}
            {photoError != null && <ErrorAlert error={photoError} />}
          </Section>

          {/* 2. product */}
          <Section n={2} title={t("About the product")}>
            <Field label={t("Product name")}><Input value={f.name} maxLength={120} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t("e.g. Women's leather handbag")} data-testid="card-name" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("Characteristics")} hint={t("One per line, e.g. Material: leather")}>
                <textarea className="input min-h-24" value={f.features} onChange={(e) => setF({ ...f, features: e.target.value })} placeholder={t("Material: genuine leather\nSize: 30 × 20 cm\nColour: black")} data-testid="card-features" />
              </Field>
              <Field label={t("Advantages")} hint={t("One per line")}>
                <textarea className="input min-h-24" value={f.benefits} onChange={(e) => setF({ ...f, benefits: e.target.value })} placeholder={t("Lasts for years\nFits A4 documents\nGift box included")} data-testid="card-benefits" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("Price")}><Input value={f.price} maxLength={40} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="349 000 so'm" data-testid="card-price" /></Field>
              <Field label={t("Old price (optional)")}><Input value={f.oldPrice} maxLength={40} onChange={(e) => setF({ ...f, oldPrice: e.target.value })} placeholder="420 000 so'm" /></Field>
            </div>
          </Section>

          {/* 3. platform */}
          <Section n={3} title={t("Marketplace or platform")} testId="platform-section">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t("Platform")}>
                <Select value={f.marketplace} onChange={(e) => setF({ ...f, marketplace: e.target.value as MarketplaceKey })} data-testid="platform-select"
                  options={MP_ORDER.map((k) => ({ value: k, label: t(mp?.[k]?.label ?? k) }))} />
              </Field>
              <Field label={t("Image ratio")}>
                <Select value={cfg.ratio} onChange={(e) => setCfg({ ...cfg, ratio: e.target.value as Ratio })} data-testid="ratio-select"
                  options={RATIOS.map((r) => ({ value: r, label: `${r}${platform?.ratio === r ? ` · ${t("recommended")}` : ""}` }))} />
              </Field>
              <Field label={t("Card language")}><Select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value as CardInput["language"] })} options={[{ value: "uz", label: "O'zbekcha" }, { value: "ru", label: "Русский" }, { value: "en", label: "English" }]} /></Field>
            </div>
            <p className="flex items-center gap-2 text-xs muted"><span className="h-3 w-3 rounded" style={{ background: brandOf(f.marketplace).primary }} />{t("Image size")}: <b className="text-current" data-testid="size-label">{size.w}×{size.h}</b> · {t("adapted to the platform's requirements")}</p>
          </Section>

          {/* 4. theme: every theme is a folder of five designs */}
          <Section n={4} title={t("Design theme")} testId="theme-section" right={<Button size="sm" icon={<PaletteIcon className="h-4 w-4" />} onClick={() => setGallery(true)} data-testid="explore-designs">{t("Explore all designs")}</Button>}>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-end">
              <Field label={t("Theme")}>
                <Select value={cfg.style.theme} onChange={(e) => applyTheme(THEME_BY_KEY[e.target.value as keyof typeof THEME_BY_KEY])} data-testid="theme-select"
                  options={THEMES.map((th) => ({ value: th.key, label: t(th.name) }))} />
              </Field>
              <p className="text-xs muted">{t(theme?.description ?? "")}</p>
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]" data-testid="theme-folders">
              {THEMES.map((th) => <ThemeFolder key={th.key} th={th} sample={layoutSample} size={thumbSize} mp={f.marketplace} selected={cfg.style.theme === th.key} onClick={() => applyTheme(th)} small />)}
            </div>
          </Section>

          {/* 5. background */}
          <Section n={5} title={t("Background")} testId="layout-section">
            <div>
              <div className="flex flex-wrap gap-2" role="radiogroup" data-testid="background-picker">
                {BG_OPTIONS.map((b) => (
                  <button key={b.key} type="button" role="radio" aria-checked={cfg.style.background === b.key} onClick={() => setStyle({ background: b.key })} data-bg={b.key}
                    className={cx("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition", cfg.style.background === b.key ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300" : "border-slate-200 hover:border-slate-300 dark:border-slate-700")}>
                    <span className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ background: b.swatch }} />{t(b.label)}
                  </button>
                ))}
              </div>
              {cfg.style.background === "custom" && (
                <label className="mt-2 flex items-center gap-2 text-xs">{t("Background colour")}<input type="color" value={cfg.style.bgColor ?? "#0E7490"} onChange={(e) => setStyle({ bgColor: e.target.value })} className="h-8 w-14 cursor-pointer rounded border border-slate-300 bg-transparent" data-testid="bg-color" /></label>
              )}
            </div>
          </Section>

          {/* 7. customisation */}
          <Card className="p-5" data-testid="custom-section">
            <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="flex w-full items-center justify-between">
              <span className="font-semibold">6. {t("Colours and text")}</span><ChevronDown className={cx("h-4 w-4 transition", more && "rotate-180")} />
            </button>
            {more && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={customColors} onChange={(e) => { setCustomColors(e.target.checked); if (!e.target.checked) setStyle({ colors: undefined }); else setStyle({ colors: { main: cfg.style.colors?.main ?? brandOf(f.marketplace).primary, second: cfg.style.colors?.second ?? brandOf(f.marketplace).accent } }); }} data-testid="custom-colors" />{t("My own colours")}</label>
                  {customColors && (
                    <div className="flex flex-wrap gap-4 text-xs">
                      <label className="flex items-center gap-2">{t("Main colour")}<input type="color" value={cfg.style.colors?.main ?? "#2563EB"} onChange={(e) => setStyle({ colors: { ...cfg.style.colors, main: e.target.value } })} className="h-8 w-14 cursor-pointer rounded border border-slate-300 bg-transparent" data-testid="color-main" /></label>
                      <label className="flex items-center gap-2">{t("Secondary colour")}<input type="color" value={cfg.style.colors?.second ?? "#F59E0B"} onChange={(e) => setStyle({ colors: { ...cfg.style.colors, second: e.target.value } })} className="h-8 w-14 cursor-pointer rounded border border-slate-300 bg-transparent" data-testid="color-second" /></label>
                    </div>
                  )}
                </div>
                <Field label={t("Font style")}><Select value={cfg.style.font} onChange={(e) => setStyle({ font: e.target.value })} data-testid="font-select" options={Object.entries(FONT_PAIRS).map(([k, v]) => ({ value: k, label: v ? t(v.label) : t("Theme font") }))} /></Field>
                <Field label={t("Text placement")}><Select value={cfg.style.textAlign} onChange={(e) => setStyle({ textAlign: e.target.value as StyleConfig["textAlign"] })} data-testid="text-select" options={[{ value: "auto", label: t("As in the design") }, { value: "left", label: t("Left") }, { value: "center", label: t("Centre") }, { value: "right", label: t("Right") }]} /></Field>
              </div>
            )}
          </Card>
        </div>

        {/* preview + generate */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card className="space-y-3 p-4" data-testid="live-preview">
            <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">{t("Live preview")}</p><span className="text-[11px] muted">{t(LAYOUT_LABEL[shownLayout])} · {size.w}×{size.h}</span></div>
            <div className="mx-auto overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700" style={{ maxWidth: size.w >= size.h ? "100%" : 340 }}><DocPreview doc={previewDoc} width={480} /></div>
            {cfg.layouts.length > 1 && (
              <div className="flex flex-wrap gap-1">{cfg.layouts.map((l) => <button key={l} type="button" onClick={() => setPreviewLayout(l)} className={cx("rounded-full border px-2 py-0.5 text-[10px] font-semibold", l === shownLayout ? "border-brand-500 text-brand-600" : "border-slate-200 muted dark:border-slate-700")}>{t(LAYOUT_LABEL[l])}</button>)}</div>
            )}
            <div className="flex flex-wrap gap-1 text-[10px]">
              {[t(theme?.name ?? ""), t(BG_OPTIONS.find((b) => b.key === cfg.style.background)?.label ?? "")].filter(Boolean).map((x, i) => <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">{x}</span>)}
            </div>
            <p className="text-[11px] muted">{t("The preview shows sample texts. Your card gets the texts written by the AI from your product data.")}</p>
          </Card>

          <Card className="space-y-3 p-4" data-testid="ai-photo-section">
            <label className={cx("flex items-start gap-3", !imageAi && "opacity-60")}>
              <input type="checkbox" checked={aiPhoto} disabled={!imageAi} onChange={(e) => setCfg({ ...cfg, aiPhoto: e.target.checked })} className="mt-1" data-testid="ai-photo-toggle" />
              <span>
                <span className="block text-sm font-semibold">{t("AI product photo")}</span>
                <span className="block text-xs muted">{imageAi ? t("The AI re-shoots your product in the chosen theme, background and light and picks the best angle itself. The product's shape, colours and details stay exactly as they are. Uses one AI image from your limit.") : t("AI image generation is not connected on this server: your own photo is used.")}</span>
              </span>
            </label>
            {error != null && <ErrorAlert error={error} />}
            {steps ? (
              <ul className="space-y-1.5 text-sm" data-testid="gen-steps">
                {steps.map((s) => (
                  <li key={s.key} className="flex items-center gap-2">
                    {s.state === "run" ? <Loader2 className="h-4 w-4 animate-spin text-brand-600" /> : s.state === "done" ? <Check className="h-4 w-4 text-emerald-600" /> : s.state === "warn" ? <X className="h-4 w-4 text-amber-600" /> : <span className="h-4 w-4 rounded-full border border-slate-300" />}
                    <span className={cx(s.state === "wait" && "muted")}>{s.label}</span>{s.note && <span className="text-xs muted">· {s.note}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <Button size="lg" className="w-full" disabled={!ready} onClick={() => void create()} icon={<Wand2 className="h-5 w-5" />} data-testid="card-generate">
                {t("Generate {n} card(s)", { n: cardsCount })}
              </Button>
            )}
            <p className="text-center text-xs muted">
              {!photo ? t("Upload a product photo to continue.") : input.name.length < 2 ? t("Enter the product name.") : !user?.emailVerified ? t("Verify your email to continue.") : busy ? t("You can follow every step here.") : opts.data?.textAi ? t("The AI writes the title, infographic, description and ad texts. Uses one AI text request.") : t("AI text writing is not connected on this server. Cards are made from the texts you typed.")}
            </p>
          </Card>
          <p className="flex items-center justify-center gap-1 text-[11px] muted"><Sparkles className="h-3 w-3" />{t("Settings are saved with the cards in My Projects and can be reused.")}</p>
        </div>
      </div>
      <ThemeGallery open={gallery} onClose={() => setGallery(false)} current={cfg.style.theme} onSelect={applyTheme} sample={layoutSample} size={size} mp={f.marketplace} />
    </div>
  );
}
