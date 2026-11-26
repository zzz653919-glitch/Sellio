import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Check as CheckIcon, Clapperboard, Copy, Download, Gauge, ImagePlus, LayoutTemplate, Megaphone, Palette as PaletteIcon, PenLine,
  Save, Shuffle, Sparkles, Swords, Trash2,
} from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorAlert, IntegrationNotice } from "../components/shared";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner, Tabs, Toggle, cx, useToast } from "../components/ui";
import { del, get, post, put, upload, errorMessage } from "../lib/api";
import {
  brandPalette, ensureFonts, FORMATS, getTemplate, loadImage, render, TEMPLATES, toBlob,
  type Content, type FormatKey, type Layout, type Palette, type Template,
} from "../lib/banner";
import { scoreBanner, scoreImage, type ScoreResult } from "../lib/creativeScore";
import { fmtDateTime } from "../lib/format";
import { useI18n, type Lang } from "../lib/i18n";
import { useMsg } from "../lib/msg";
const TemplateStudio = lazy(() => import("../studio/TemplateStudio"));
import { drawFrame, durationOf, recordVideo, supportedType, VIDEO_FORMATS, type VideoFormat, type VideoInput, type VideoStyle } from "../lib/video";

// ------------------------------------------------------------------ API types
type Brand = {
  businessName: string | null; slogan: string | null; logoUploadId: string | null; logoUrl: string | null;
  primaryColor: string | null; secondaryColor: string | null; accentColor: string | null; headingFont: string | null; bodyFont: string | null;
  tone: string | null; styles: string[];
};
type AdsOptions = { textAi: boolean; textAiProvider: string | null; imageGeneration: boolean; platforms: string[]; fonts: string[]; categories: string[] };
type UploadItem = { id: string; name: string | null; url: string; width: number; height: number };
type CopyResult = {
  headlines: string[]; descriptions: string[]; promos: string[]; ctas: string[];
  instagram?: { caption: string; hashtags: string[] }; telegram?: { post: string }; facebook?: { primaryText: string; headline: string }; google?: { headlines: string[]; descriptions: string[] };
};
type CopyItem = { id: string; product: string; language: string; result: CopyResult | null; createdAt: string };
type Review = { summary: string; scores: Record<string, number>; strengths: string[]; improvements: string[] };
type CompetitorAd = { id: string; competitorName: string; adText: string | null; hadImage: boolean; analysis: { style: string; tone: string; audience: string; positioning: string; messages: string[]; offers: string[]; strengths: string[]; weaknesses: string[]; differentiation: string[] } | null; createdAt: string };

type Tab = "templates" | "maker" | "score" | "copy" | "video" | "competitors" | "brand";
type Draft = { template: string; format: FormatKey; headline: string; subline: string; price: string; oldPrice: string; badge: string; cta: string; productId: string | null; useBrand: boolean; primary: string; accent: string };

const STYLE_LABEL: Record<string, string> = { minimal: "Minimal", modern: "Modern", premium: "Premium", luxury: "Luxury", promo: "Promotional", seasonal: "Seasonal" };
const CHECK_LABEL: Record<string, string> = { visualQuality: "Visual quality", readability: "Text readability", composition: "Composition", productVisibility: "Product visibility", brandConsistency: "Brand consistency" };

const useBrand = () => useQuery({ queryKey: ["brand"], queryFn: () => get<{ brand: Brand | null }>("/ads/brand").then((r) => r.brand) });
const useAdsOptions = () => useQuery({ queryKey: ["ads-options"], queryFn: () => get<AdsOptions>("/ads/options"), staleTime: 600_000 });
const useUploads = () => useQuery({ queryKey: ["uploads"], queryFn: () => get<{ uploads: UploadItem[] }>("/user/uploads").then((r) => r.uploads) });

/** Loads an image URL into an <img> (cached per URL). */
function useImage(url: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let alive = true;
    if (!url) { setImg(null); return; }
    loadImage(url).then((i) => alive && setImg(i)).catch(() => alive && setImg(null));
    return () => { alive = false; };
  }, [url]);
  return img;
}

function useFontsReady(fonts: string[]) {
  const [ready, setReady] = useState(0);
  const key = fonts.join("|");
  useEffect(() => { let alive = true; void ensureFonts(key.split("|")).then(() => alive && setReady((n) => n + 1)); return () => { alive = false; }; }, [key]);
  return ready;
}

type Rendered = { canvas: HTMLCanvasElement; layout: Layout };

/** Live canvas preview of one template. `onRender` receives the full-size layout. */
function BannerCanvas({ t, format, content, palette, fonts, width, onRender, className }: {
  t: Template; format: FormatKey; content: Content; palette: Palette; fonts: { heading: string; body: string }; width: number; onRender?: (r: Rendered) => void; className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ready = useFontsReady([fonts.heading, fonts.body]);
  // Colours and fonts are compared by value: new-but-equal objects do not redraw every thumbnail.
  const paletteKey = JSON.stringify(palette), fontsKey = JSON.stringify(fonts);
  useEffect(() => {
    if (!ref.current) return;
    const scale = width / FORMATS[format].w;
    const layout = render(ref.current, t, format, content, JSON.parse(paletteKey) as Palette, JSON.parse(fontsKey) as { heading: string; body: string }, scale * Math.min(2, window.devicePixelRatio || 1));
    onRender?.({ canvas: ref.current, layout });
  }, [t, format, content, paletteKey, fontsKey, width, ready, onRender]);
  return <canvas ref={ref} className={cx("block rounded-xl shadow-sm", className)} style={{ width, height: (width * FORMATS[format].h) / FORMATS[format].w }} />;
}

function useBannerParts(draft: Draft, brand: Brand | null | undefined, product: HTMLImageElement | null, logo: HTMLImageElement | null) {
  const template = getTemplate(draft.template);
  const palette = useMemo<Palette>(() => {
    const base = draft.useBrand ? brandPalette(template, brand ?? null) : template.palette;
    return { ...base, ...(draft.primary ? { primary: draft.primary } : {}), ...(draft.accent ? { accent: draft.accent } : {}), ...(draft.primary && template.palette.bg === template.palette.primary ? { bg: draft.primary } : {}) };
  }, [template, brand, draft.useBrand, draft.primary, draft.accent]);
  const fonts = useMemo(() => ({ heading: (draft.useBrand && brand?.headingFont) || template.fonts.heading, body: (draft.useBrand && brand?.bodyFont) || template.fonts.body }), [template, brand, draft.useBrand]);
  const content = useMemo<Content>(() => ({
    headline: draft.headline, subline: draft.subline, price: draft.price, oldPrice: draft.oldPrice, badge: draft.badge, cta: draft.cta,
    brandName: brand?.businessName ?? "", product, logo: draft.useBrand ? logo : null,
  }), [draft, brand, product, logo]);
  return { template, palette, fonts, content };
}

// ------------------------------------------------------------------ score view
function ScoreView({ result, review }: { result: ScoreResult | null; review?: Review | null }) {
  const { t } = useI18n();
  const msg = useMsg();
  if (!result) return null;
  const tone = (s: number | null) => (s === null ? "bg-slate-300" : s >= 80 ? "bg-emerald-500" : s >= 60 ? "bg-amber-500" : "bg-rose-500");
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className={cx("flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-extrabold text-white", tone(result.overall))}>{result.overall ?? "—"}</div>
        <div>
          <p className="font-semibold">{t("Creative Score")}</p>
          <p className="text-xs muted">{t("Measured from the image and layout (contrast, sizes, areas, margins, sharpness, colours).")}</p>
        </div>
      </div>
      {result.checks.map((c) => (
        <div key={c.key} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{t(CHECK_LABEL[c.key])}</p>
            <span className="flex items-center gap-2">
              {review && <Badge tone="violet">AI {review.scores[c.key] ?? "—"}</Badge>}
              <span className={cx("rounded-full px-2 py-0.5 text-xs font-bold text-white", tone(c.score))}>{c.score ?? t("n/a")}</span>
            </span>
          </div>
          {c.facts.map((f, i) => <p key={`f${i}`} className="text-xs muted">{msg(f)}</p>)}
          {c.tips.map((f, i) => <p key={`t${i}`} className="mt-1 text-xs">→ {msg(f)}</p>)}
        </div>
      ))}
      {review && (
        <Card className="space-y-2 border-violet-200 p-4 dark:border-violet-500/30">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Bot className="h-4 w-4 text-violet-500" />{t("AI review (an opinion of the AI model, not a measurement)")}</p>
          <p className="text-sm">{review.summary}</p>
          {review.strengths.length > 0 && <ul className="text-sm">{review.strengths.map((s, i) => <li key={i}>✓ {s}</li>)}</ul>}
          {review.improvements.length > 0 && <ul className="text-sm">{review.improvements.map((s, i) => <li key={i}>→ {s}</li>)}</ul>}
        </Card>
      )}
    </div>
  );
}

function useReview() {
  const { lang } = useI18n();
  return useMutation({
    mutationFn: async ({ blob, platform }: { blob: Blob; platform: string }) => {
      const f = new FormData();
      f.append("file", blob, "ad.png");
      f.append("platform", platform);
      f.append("language", lang);
      return upload<{ review: Review }>("/ads/review", f).then((r) => r.review);
    },
  });
}

// ------------------------------------------------------------------ product picker
function ProductPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const uploads = useUploads();
  const input = useRef<HTMLInputElement>(null);
  const up = useMutation({
    mutationFn: (file: File) => { const f = new FormData(); f.append("file", file); return upload<{ upload: UploadItem }>("/studio/uploads", f); },
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ["uploads"] }); onChange(d.upload.id); },
    onError: (e) => toast("error", errorMessage(e)),
  });
  const items = uploads.data ?? [];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onChange(null)} className={cx("flex h-16 w-16 items-center justify-center rounded-xl border text-[11px] muted", value === null ? "border-brand-600 ring-2 ring-brand-500/30" : "border-slate-200 dark:border-slate-700")}>{t("No photo")}</button>
        {items.slice(0, 11).map((u) => (
          <button key={u.id} type="button" onClick={() => onChange(u.id)} title={u.name ?? ""} className={cx("h-16 w-16 overflow-hidden rounded-xl border bg-white", value === u.id ? "border-brand-600 ring-2 ring-brand-500/30" : "border-slate-200 dark:border-slate-700")}>
            <img src={u.url} alt="" className="h-full w-full object-contain" />
          </button>
        ))}
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) up.mutate(f); e.target.value = ""; }} />
        <button type="button" onClick={() => input.current?.click()} className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-[11px] muted hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
          {up.isPending ? <Spinner className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}{t("Upload")}
        </button>
      </div>
      <p className="text-xs muted">{t("Tip: a photo of the product on a plain background, at least 1000 px, gives the best result.")}</p>
    </div>
  );
}

// ------------------------------------------------------------------ templates
function TemplateThumb(props: { t: Template; content: Content; palette: Palette; fonts: { heading: string; body: string } }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(200);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(120, Math.floor(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <div ref={box}><BannerCanvas t={props.t} format="post" content={props.content} palette={props.palette} fonts={props.fonts} width={w} /></div>;
}

// ------------------------------------------------------------------ banner maker
function MakerTab({ draft, setDraft, brand, product, logo, productName }: { draft: Draft; setDraft: (f: (d: Draft) => Draft) => void; brand: Brand | null | undefined; product: HTMLImageElement | null; logo: HTMLImageElement | null; productName: string }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const options = useAdsOptions();
  const { template, palette, fonts, content } = useBannerParts(draft, brand, product, logo);
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [seed, setSeed] = useState(0);
  const [alts, setAlts] = useState<CopyResult | null>(null);
  const [name, setName] = useState(productName);
  // Take a new product name from outside (e.g. a chosen photo), but let the user clear the field.
  useEffect(() => { if (productName) setName(productName); }, [productName]);
  const review = useReview();
  const previewBox = useRef<HTMLDivElement>(null);
  const [pw, setPw] = useState(480);
  useEffect(() => {
    const el = previewBox.current; if (!el) return;
    const ro = new ResizeObserver(() => {
      const f = FORMATS[draft.format];
      setPw(Math.max(200, Math.min(el.clientWidth, (560 * f.w) / f.h, 620)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [draft.format]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  // Creative score from the full-size layout and a text-free copy of the same banner.
  const onRender = useCallback((r: Rendered) => setRendered(r), []);
  useEffect(() => {
    if (!rendered) return;
    const bg = document.createElement("canvas");
    render(bg, template, draft.format, { ...content, headline: "", subline: "", price: "", oldPrice: "", cta: "", brandName: "", badge: content.badge ? " " : "" }, palette, fonts, 0.5);
    const full = render(document.createElement("canvas"), template, draft.format, content, palette, fonts, 0.25);
    const bc = [brand?.primaryColor, brand?.secondaryColor, brand?.accentColor].filter(Boolean) as string[];
    setScore(scoreBanner(full, bg, draft.format, { productImg: product, palette: [palette.primary, palette.secondary, palette.accent, palette.bg], brandColors: draft.useBrand || bc.length ? bc : [], hasLogo: Boolean(content.logo), brandName: Boolean(content.brandName), headline: content.headline }));
    review.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendered]);

  const variations = useMemo(() => {
    const others = TEMPLATES.filter((x) => x.key !== template.key);
    const start = (seed * 3) % others.length;
    return [template, ...[0, 1, 2].map((i) => others[(start + i) % others.length])];
  }, [template, seed]);

  const fullBlob = async () => {
    const c = document.createElement("canvas");
    render(c, template, draft.format, content, palette, fonts, 1);
    return toBlob(c);
  };
  const download = async () => {
    const url = URL.createObjectURL(await fullBlob());
    const a = document.createElement("a"); a.href = url; a.download = `${(name || "banner").replace(/[^\w-]+/g, "_")}-${draft.format}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const save = useMutation({
    mutationFn: async () => {
      const f = new FormData();
      f.append("file", await fullBlob(), "banner.png");
      f.append("productName", name.trim() || draft.headline.trim() || t("Banner"));
      f.append("template", template.key);
      f.append("format", draft.format);
      if (draft.productId) f.append("productUploadId", draft.productId);
      return upload<{ generation: { id: string } }>("/ads/banners", f);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["generations"] }); toast("success", t("Saved to your advertisements. Open AI Product Studio history or My Projects to find it.")); },
    onError: (e) => toast("error", errorMessage(e)),
  });
  const write = useMutation({
    mutationFn: () => post<{ copy: { result: CopyResult } }>("/ads/copy", { product: name.trim() || draft.headline || t("Product"), offer: draft.badge || undefined, price: draft.price || undefined, language: lang as Lang, platforms: ["instagram"] }),
    onSuccess: (d) => {
      const r = d.copy.result;
      setAlts(r);
      setDraft((x) => ({ ...x, headline: r.headlines[0] ?? x.headline, subline: (r.promos[0] ?? x.subline).slice(0, 90), cta: r.ctas[0] ?? x.cta }));
      qc.invalidateQueries({ queryKey: ["ad-copies"] });
    },
  });

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
      <Card className="space-y-4 p-5 xl:col-span-2">
        <Field label={t("Product photo")}><ProductPicker value={draft.productId} onChange={(id) => set("productId", id)} /></Field>
        <Field label={t("Product name")}><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={t("e.g. Green tea 100 g")} /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("Format")}><Select value={draft.format} onChange={(e) => set("format", e.target.value as FormatKey)} options={Object.entries(FORMATS).map(([k, f]) => ({ value: k, label: `${t(f.label)} · ${f.w}×${f.h}` }))} /></Field>
          <Field label={t("Template")}><Select value={draft.template} onChange={(e) => set("template", e.target.value)} options={TEMPLATES.map((x) => ({ value: x.key, label: t(x.name) }))} /></Field>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">{t("Texts")}</p>
          <Button size="sm" variant="secondary" icon={<Sparkles className="h-4 w-4" />} loading={write.isPending} disabled={!options.data?.textAi} onClick={() => write.mutate()}>{t("Write with AI")}</Button>
        </div>
        {options.data && !options.data.textAi && <p className="text-xs muted">{t("AI text needs GEMINI_API_KEY or OPENAI_API_KEY on the server. You can type the texts yourself.")}</p>}
        {write.error && <ErrorAlert error={write.error} />}
        <Field label={t("Headline")}><Input value={draft.headline} onChange={(e) => set("headline", e.target.value)} maxLength={80} /></Field>
        {alts && alts.headlines.length > 1 && (
          <div className="flex flex-wrap gap-1.5">{alts.headlines.map((h) => <button key={h} type="button" onClick={() => set("headline", h)} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">{h}</button>)}</div>
        )}
        <Field label={t("Second line")}><Input value={draft.subline} onChange={(e) => set("subline", e.target.value)} maxLength={120} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Price")}><Input value={draft.price} onChange={(e) => set("price", e.target.value)} maxLength={30} placeholder="199 000 so'm" /></Field>
          <Field label={t("Old price")}><Input value={draft.oldPrice} onChange={(e) => set("oldPrice", e.target.value)} maxLength={30} /></Field>
          <Field label={t("Badge")}><Input value={draft.badge} onChange={(e) => set("badge", e.target.value)} maxLength={20} placeholder="-20%" /></Field>
          <Field label={t("Call to action")}><Input value={draft.cta} onChange={(e) => set("cta", e.target.value)} maxLength={30} /></Field>
        </div>
        {alts && alts.ctas.length > 1 && (
          <div className="flex flex-wrap gap-1.5">{alts.ctas.map((h) => <button key={h} type="button" onClick={() => set("cta", h)} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">{h}</button>)}</div>
        )}
        <Toggle checked={draft.useBrand} onChange={(v) => set("useBrand", v)} label={t("Use brand colours, fonts and logo")} description={brand ? undefined : t("Save your brand kit first (Brand tab).")} disabled={!brand} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Main colour")}><input type="color" className="h-10 w-full cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700" value={draft.primary || palette.primary} onChange={(e) => set("primary", e.target.value)} /></Field>
          <Field label={t("Accent colour")}><input type="color" className="h-10 w-full cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700" value={draft.accent || palette.accent} onChange={(e) => set("accent", e.target.value)} /></Field>
        </div>
        {(draft.primary || draft.accent) && <Button size="sm" variant="ghost" onClick={() => setDraft((d) => ({ ...d, primary: "", accent: "" }))}>{t("Reset colours")}</Button>}
      </Card>

      <div className="space-y-5 xl:col-span-3">
        <Card className="space-y-4 p-5">
          <div ref={previewBox} className="flex justify-center">
            <BannerCanvas t={template} format={draft.format} content={content} palette={palette} fonts={fonts} width={pw} onRender={onRender} />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button icon={<Download className="h-4 w-4" />} onClick={() => void download()}>{t("Download PNG")}</Button>
            <Button variant="secondary" icon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate()}>{t("Save to my ads")}</Button>
            <Button variant="secondary" icon={<Bot className="h-4 w-4" />} loading={review.isPending} disabled={!options.data?.textAi}
              onClick={() => void fullBlob().then((blob) => review.mutate({ blob, platform: FORMATS[draft.format].platforms }))}>{t("AI review")}</Button>
          </div>
          <p className="text-center text-xs muted">{FORMATS[draft.format].w}×{FORMATS[draft.format].h} px · {FORMATS[draft.format].platforms}</p>
        </Card>
        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t("Variations")}</h3>
            <Button size="sm" variant="ghost" icon={<Shuffle className="h-4 w-4" />} onClick={() => setSeed((s) => s + 1)}>{t("More variations")}</Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {variations.map((v) => {
              const pal = draft.useBrand ? brandPalette(v, brand ?? null) : v.palette;
              return (
                <button key={v.key} type="button" onClick={() => set("template", v.key)} className={cx("rounded-xl p-1 text-left", v.key === template.key ? "ring-2 ring-brand-500" : "hover:bg-slate-50 dark:hover:bg-slate-800")}>
                  <TemplateThumb t={v} content={content} palette={{ ...pal, ...(draft.primary ? { primary: draft.primary } : {}) }} fonts={{ heading: (draft.useBrand && brand?.headingFont) || v.fonts.heading, body: (draft.useBrand && brand?.bodyFont) || v.fonts.body }} />
                  <p className="mt-1 truncate text-xs">{t(v.name)}</p>
                </button>
              );
            })}
          </div>
        </Card>
        <Card className="p-5">
          {review.error && <div className="mb-3"><ErrorAlert error={review.error} /></div>}
          <ScoreView result={score} review={review.data} />
        </Card>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ score any image
function ScoreTab({ brand }: { brand: Brand | null | undefined }) {
  const { t } = useI18n();
  const options = useAdsOptions();
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [format, setFormat] = useState<FormatKey>("post");
  const img = useImage(url);
  const review = useReview();
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const result = useMemo(() => (img ? scoreImage(img, format, [brand?.primaryColor, brand?.secondaryColor, brand?.accentColor].filter(Boolean) as string[]) : null), [img, format, brand]);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <h3 className="flex items-center gap-2 font-semibold"><Gauge className="h-4 w-4" />{t("Check any advertisement")}</h3>
        <p className="text-sm muted">{t("Upload a ready ad (yours or made elsewhere). Measurements run in your browser; the image is not saved.")}</p>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); review.reset(); setUrl(f ? URL.createObjectURL(f) : null); }} className="block w-full text-sm" />
        <Field label={t("Where will it be shown?")}><Select value={format} onChange={(e) => setFormat(e.target.value as FormatKey)} options={Object.entries(FORMATS).map(([k, f]) => ({ value: k, label: `${t(f.label)} · ${f.platforms}` }))} /></Field>
        {url && <img src={url} alt="" className="max-h-96 w-full rounded-xl object-contain" />}
        {file && (
          options.data?.textAi
            ? <Button icon={<Bot className="h-4 w-4" />} loading={review.isPending} onClick={() => review.mutate({ blob: file, platform: FORMATS[format].platforms })}>{t("AI review")}</Button>
            : <IntegrationNotice service="textAi" />
        )}
        {review.error && <ErrorAlert error={review.error} />}
      </Card>
      <Card className="p-5">{result ? <ScoreView result={result} review={review.data} /> : <EmptyState icon={<Gauge className="h-6 w-6" />} title={t("Upload an advertisement to score it")} />}</Card>
    </div>
  );
}

// ------------------------------------------------------------------ copywriter
function CopyBlock({ title, items }: { title: string; items: string[] }) {
  const { t } = useI18n();
  const toast = useToast();
  if (!items.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide muted">{title}</p>
      {items.map((s, i) => (
        <div key={i} className="group flex items-start gap-2 rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800/60">
          <span className="flex-1 whitespace-pre-line">{s}</span>
          <button type="button" aria-label={t("Copy")} className="text-slate-400 hover:text-brand-600" onClick={() => void navigator.clipboard.writeText(s).then(() => toast("success", t("Copied")))}><Copy className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}

function CopyResultView({ r, onUse }: { r: CopyResult; onUse: (r: CopyResult) => void }) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button size="sm" icon={<LayoutTemplate className="h-4 w-4" />} onClick={() => onUse(r)}>{t("Use in a banner")}</Button></div>
      <CopyBlock title={t("Headlines")} items={r.headlines} />
      <CopyBlock title={t("Descriptions")} items={r.descriptions} />
      <CopyBlock title={t("Promotional messages")} items={r.promos} />
      <CopyBlock title={t("Calls to action")} items={r.ctas} />
      {r.instagram && <CopyBlock title="Instagram" items={[`${r.instagram.caption}\n\n${r.instagram.hashtags.join(" ")}`]} />}
      {r.telegram && <CopyBlock title="Telegram" items={[r.telegram.post]} />}
      {r.facebook && <CopyBlock title="Facebook" items={[r.facebook.headline, r.facebook.primaryText].filter(Boolean)} />}
      {r.google && <CopyBlock title={t("Google Ads (headlines ≤ 30, descriptions ≤ 90 characters)")} items={[...r.google.headlines, ...r.google.descriptions]} />}
    </div>
  );
}

function CopyTab({ onUse, defaultProduct }: { onUse: (r: CopyResult) => void; defaultProduct: string }) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const options = useAdsOptions();
  const history = useQuery({ queryKey: ["ad-copies"], queryFn: () => get<{ items: CopyItem[] }>("/ads/copy").then((r) => r.items) });
  const [f, setF] = useState({ product: defaultProduct, description: "", audience: "", offer: "", price: "", tone: "", language: lang as Lang, platforms: ["instagram", "telegram"] as string[] });
  useEffect(() => { if (defaultProduct) setF((s) => (s.product ? s : { ...s, product: defaultProduct })); }, [defaultProduct]);
  const [current, setCurrent] = useState<CopyResult | null>(null);
  const gen = useMutation({
    mutationFn: () => post<{ copy: CopyItem }>("/ads/copy", { ...f, description: f.description || undefined, audience: f.audience || undefined, offer: f.offer || undefined, price: f.price || undefined, tone: f.tone || undefined }),
    onSuccess: (d) => { setCurrent(d.copy.result); qc.invalidateQueries({ queryKey: ["ad-copies"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
  const remove = useMutation({ mutationFn: (id: string) => del(`/ads/copy/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["ad-copies"] }) });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-2">
        <Card className="space-y-3 p-5">
          <h3 className="flex items-center gap-2 font-semibold"><PenLine className="h-4 w-4" />{t("AI ad copywriter")}</h3>
          {options.data && !options.data.textAi && <IntegrationNotice service="textAi" />}
          <Field label={t("Product")}><Input value={f.product} onChange={set("product")} maxLength={120} /></Field>
          <Field label={t("About the product")} hint={t("Facts only: what it is, what is special. The AI will not add facts you did not give.")}><textarea className="input min-h-20" value={f.description} onChange={set("description")} maxLength={800} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Price")}><Input value={f.price} onChange={set("price")} maxLength={60} /></Field>
            <Field label={t("Offer")}><Input value={f.offer} onChange={set("offer")} maxLength={200} placeholder={t("e.g. free delivery")} /></Field>
          </div>
          <Field label={t("Audience")}><Input value={f.audience} onChange={set("audience")} maxLength={200} placeholder={t("e.g. young mothers in Tashkent")} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Tone")}><Input value={f.tone} onChange={set("tone")} maxLength={100} placeholder={t("friendly, premium…")} /></Field>
            <Field label={t("Language")}><Select value={f.language} onChange={set("language")} options={[{ value: "uz", label: "O'zbekcha" }, { value: "ru", label: "Русский" }, { value: "en", label: "English" }]} /></Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {["instagram", "telegram", "facebook", "google"].map((p) => (
              <label key={p} className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs capitalize dark:border-slate-700">
                <input type="checkbox" className="accent-brand-600" checked={f.platforms.includes(p)} onChange={() => setF((s) => ({ ...s, platforms: s.platforms.includes(p) ? s.platforms.filter((x) => x !== p) : [...s.platforms, p] }))} />{p === "google" ? "Google Ads" : p}
              </label>
            ))}
          </div>
          {gen.error && <ErrorAlert error={gen.error} />}
          <Button icon={<Sparkles className="h-4 w-4" />} loading={gen.isPending} disabled={!options.data?.textAi || f.product.trim().length < 2 || !f.platforms.length} onClick={() => gen.mutate()}>{t("Write texts")}</Button>
        </Card>
        <Card className="divide-y divide-slate-100 dark:divide-slate-800">
          <p className="p-3 text-sm font-semibold">{t("History")}</p>
          {(history.data ?? []).length === 0 ? <p className="p-3 text-sm muted">{t("Nothing yet.")}</p> : history.data!.map((h) => (
            <div key={h.id} className="flex items-center gap-2 p-3">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setCurrent(h.result)}>
                <p className="truncate text-sm font-medium">{h.product} <span className="text-xs uppercase muted">{h.language}</span></p>
                <p className="text-xs muted">{fmtDateTime(h.createdAt)}</p>
              </button>
              <Button size="sm" variant="ghost" aria-label={t("Delete")} onClick={() => remove.mutate(h.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </Card>
      </div>
      <Card className="p-5 lg:col-span-3">
        {gen.isPending ? <div className="flex items-center gap-3 text-sm muted"><Spinner />{t("Writing…")}</div>
          : current ? <CopyResultView r={current} onUse={onUse} /> : <EmptyState icon={<PenLine className="h-6 w-6" />} title={t("Texts will appear here")} text={t("Headlines, descriptions, promo messages, calls to action and posts for each platform.")} />}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ video
function VideoTab({ draft, brand }: { draft: Draft; brand: Brand | null | undefined }) {
  const { t } = useI18n();
  const uploads = useUploads();
  const [ids, setIds] = useState<string[]>(draft.productId ? [draft.productId] : []);
  const [captions, setCaptions] = useState<Record<string, string>>({}); // by photo id, so order changes keep them
  const [title, setTitle] = useState(draft.headline);
  const [price, setPrice] = useState(draft.price);
  const [cta, setCta] = useState(draft.cta);
  const [format, setFormat] = useState<VideoFormat>("vertical");
  const [style, setStyle] = useState<VideoStyle>("zoom");
  const [secs, setSecs] = useState(3);
  const [imgs, setImgs] = useState<{ id: string; img: HTMLImageElement }[]>([]);
  const abort = useRef<AbortController | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [out, setOut] = useState<{ url: string; ext: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const font = brand?.headingFont || "Inter";
  useFontsReady([font]);
  useEffect(() => {
    let alive = true;
    const list = ids.map((id) => ({ id, url: uploads.data?.find((u) => u.id === id)?.url })).filter((x): x is { id: string; url: string } => Boolean(x.url));
    void Promise.all(list.map((x) => loadImage(x.url).then((img) => ({ id: x.id, img })).catch(() => null)))
      .then((loaded) => alive && setImgs(loaded.filter(Boolean) as { id: string; img: HTMLImageElement }[]));
    return () => { alive = false; };
  }, [ids, uploads.data]);
  const input: VideoInput = useMemo(() => ({ images: imgs.map((x) => x.img), captions: imgs.map((x) => captions[x.id] ?? ""), title, price, cta, brandName: brand?.businessName ?? "", color: brand?.primaryColor || "#4f46e5", font, secondsPerSlide: secs, style, format }), [imgs, captions, title, price, cta, brand, font, secs, style, format]);
  // Looping preview.
  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const { w, h } = VIDEO_FORMATS[format]; c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    let raf = 0; const start = performance.now();
    const loop = () => { drawFrame(ctx, input, ((performance.now() - start) / 1000) % durationOf(input)); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [input, format]);
  useEffect(() => () => { if (out) URL.revokeObjectURL(out.url); }, [out]);
  // Leaving the tab stops a running recording.
  useEffect(() => () => abort.current?.abort(), []);
  const make = async () => {
    setErr(null); setOut(null); setProgress(0);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      const r = await recordVideo(input, (p) => { if (!ctrl.signal.aborted) setProgress(p); }, ctrl.signal);
      if (!ctrl.signal.aborted) setOut({ url: URL.createObjectURL(r.blob), ext: r.ext });
    } catch (e) {
      if (!ctrl.signal.aborted) setErr(e instanceof Error ? e.message : String(e));
    } finally { if (!ctrl.signal.aborted) setProgress(null); }
  };
  const supported = supportedType();
  const vw = VIDEO_FORMATS[format];
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <Card className="space-y-4 p-5 lg:col-span-2">
        <h3 className="flex items-center gap-2 font-semibold"><Clapperboard className="h-4 w-4" />{t("Promo video from your photos")}</h3>
        <Alert tone="info">{t("The video is made in your browser from your own photos: slides, motion, subtitles, price and call to action. Generating new video scenes and voice-over with AI needs a video service, which is not connected.")}</Alert>
        <Field label={t("Photos (up to 6, in order)")}>
          <div className="flex flex-wrap gap-2">
            {(uploads.data ?? []).slice(0, 18).map((u) => {
              const k = ids.indexOf(u.id);
              return (
                <button key={u.id} type="button" onClick={() => setIds((s) => (k >= 0 ? s.filter((x) => x !== u.id) : s.length >= 6 ? s : [...s, u.id]))}
                  className={cx("relative h-14 w-14 overflow-hidden rounded-lg border bg-white", k >= 0 ? "border-brand-600 ring-2 ring-brand-500/30" : "border-slate-200 dark:border-slate-700")}>
                  <img src={u.url} alt="" className="h-full w-full object-contain" />
                  {k >= 0 && <span className="absolute right-0.5 top-0.5 rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{k + 1}</span>}
                </button>
              );
            })}
          </div>
          {(uploads.data ?? []).length === 0 && <p className="text-xs muted">{t("Upload product photos in the Banner maker first.")}</p>}
        </Field>
        {ids.map((id, i) => (
          <Field key={id} label={t("Subtitle for slide {n}", { n: i + 1 })}>
            <Input value={captions[id] ?? ""} maxLength={90} onChange={(e) => setCaptions((c) => ({ ...c, [id]: e.target.value }))} />
          </Field>
        ))}
        <Field label={t("Final title")}><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Price")}><Input value={price} onChange={(e) => setPrice(e.target.value)} maxLength={30} /></Field>
          <Field label={t("Call to action")}><Input value={cta} onChange={(e) => setCta(e.target.value)} maxLength={30} /></Field>
          <Field label={t("Format")}><Select value={format} onChange={(e) => setFormat(e.target.value as VideoFormat)} options={Object.entries(VIDEO_FORMATS).map(([k, v]) => ({ value: k, label: t(v.label) }))} /></Field>
          <Field label={t("Motion")}><Select value={style} onChange={(e) => setStyle(e.target.value as VideoStyle)} options={[{ value: "zoom", label: t("Slow zoom") }, { value: "slide", label: t("Slide in") }, { value: "fade", label: t("Fade") }]} /></Field>
          <Field label={t("Seconds per photo")}><Select value={String(secs)} onChange={(e) => setSecs(Number(e.target.value))} options={[2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} /></Field>
        </div>
        {!supported && <Alert tone="warning">{t("This browser cannot record video. Use a recent Chrome, Edge or Firefox.")}</Alert>}
        <Button icon={<Clapperboard className="h-4 w-4" />} disabled={!supported || progress !== null || !imgs.length} loading={progress !== null} onClick={() => void make()}>
          {progress !== null ? t("Recording… {pct}%", { pct: Math.round(progress * 100) }) : t("Create video ({s} s)", { s: durationOf(input) })}
        </Button>
        {progress !== null && <p className="text-xs muted">{t("Keep this tab open while the video is being recorded.")}</p>}
        {err && <Alert tone="error">{err}</Alert>}
      </Card>
      <Card className="space-y-4 p-5 lg:col-span-3">
        <div className="flex justify-center"><canvas ref={canvas} className="max-h-[560px] max-w-full rounded-xl bg-black" style={{ aspectRatio: `${vw.w} / ${vw.h}` }} /></div>
        {out && (
          <div className="space-y-2 text-center">
            <video src={out.url} controls className="mx-auto max-h-80 rounded-xl" />
            <a href={out.url} download={`promo.${out.ext}`} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"><Download className="h-4 w-4" />{t("Download video")} (.{out.ext})</a>
          </div>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ competitor ads
function CompetitorAdsTab() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const options = useAdsOptions();
  const competitors = useQuery({ queryKey: ["competitors"], queryFn: () => get<{ items: { id: string; name: string }[] }>("/intel/competitors").then((r) => r.items) });
  const list = useQuery({ queryKey: ["competitor-ads"], queryFn: () => get<{ items: CompetitorAd[] }>("/ads/competitor-ads").then((r) => r.items) });
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const run = useMutation({
    mutationFn: () => { const f = new FormData(); f.append("competitorName", name); if (text.trim()) f.append("adText", text); f.append("language", lang); if (file) f.append("file", file); return upload<{ item: CompetitorAd }>("/ads/competitor-ads", f); },
    onSuccess: () => { setText(""); setFile(null); if (fileRef.current) fileRef.current.value = ""; qc.invalidateQueries({ queryKey: ["competitor-ads"] }); },
  });
  const remove = useMutation({ mutationFn: (id: string) => del(`/ads/competitor-ads/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["competitor-ads"] }) });
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <Card className="space-y-3 p-5 lg:col-span-2">
        <h3 className="flex items-center gap-2 font-semibold"><Swords className="h-4 w-4" />{t("Analyse a competitor's ad")}</h3>
        <p className="text-sm muted">{t("Paste the text of a public ad or upload a screenshot. The AI explains its style and messages and how you can stand out. Screenshots are not stored.")}</p>
        {options.data && !options.data.textAi && <IntegrationNotice service="textAi" />}
        <Field label={t("Competitor")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} list="competitor-names" maxLength={100} />
          <datalist id="competitor-names">{(competitors.data ?? []).map((c) => <option key={c.id} value={c.name} />)}</datalist>
        </Field>
        <Field label={t("Ad text")}><textarea className="input min-h-28" value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} /></Field>
        <Field label={t("Screenshot (optional)")}><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" /></Field>
        {run.error && <ErrorAlert error={run.error} />}
        <Button icon={<Sparkles className="h-4 w-4" />} loading={run.isPending} disabled={!options.data?.textAi || !name.trim() || (!text.trim() && !file)} onClick={() => run.mutate()}>{t("Analyse")}</Button>
      </Card>
      <div className="space-y-4 lg:col-span-3">
        {(list.data ?? []).length === 0 ? <EmptyState icon={<Swords className="h-6 w-6" />} title={t("No analyses yet")} /> : list.data!.map((a) => (
          <Card key={a.id} className="space-y-2 p-5">
            <div className="flex items-start justify-between gap-2">
              <div><p className="font-semibold">{a.competitorName}</p><p className="text-xs muted">{fmtDateTime(a.createdAt)}{a.hadImage ? ` · ${t("with screenshot")}` : ""}</p></div>
              <Button size="sm" variant="ghost" aria-label={t("Delete")} onClick={() => remove.mutate(a.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            {a.adText && <p className="line-clamp-3 rounded-lg bg-slate-50 p-2 text-xs italic dark:bg-slate-800/60">{a.adText}</p>}
            {a.analysis && (
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                {a.analysis.style && <p><span className="muted">{t("Style")}:</span> {a.analysis.style}</p>}
                {a.analysis.tone && <p><span className="muted">{t("Tone")}:</span> {a.analysis.tone}</p>}
                {a.analysis.audience && <p><span className="muted">{t("Audience")}:</span> {a.analysis.audience}</p>}
                {a.analysis.positioning && <p><span className="muted">{t("Positioning")}:</span> {a.analysis.positioning}</p>}
                {a.analysis.messages.length > 0 && <div><p className="muted">{t("Key messages")}</p><ul>{a.analysis.messages.map((m, i) => <li key={i}>• {m}</li>)}</ul></div>}
                {a.analysis.offers.length > 0 && <div><p className="muted">{t("Offers shown")}</p><ul>{a.analysis.offers.map((m, i) => <li key={i}>• {m}</li>)}</ul></div>}
                {a.analysis.weaknesses.length > 0 && <div><p className="muted">{t("Weak points")}</p><ul>{a.analysis.weaknesses.map((m, i) => <li key={i}>• {m}</li>)}</ul></div>}
                {a.analysis.differentiation.length > 0 && <div className="sm:col-span-2 rounded-xl bg-emerald-50 p-3 dark:bg-emerald-500/10"><p className="font-semibold text-emerald-700 dark:text-emerald-300">{t("How you can stand out")}</p><ul>{a.analysis.differentiation.map((m, i) => <li key={i}>→ {m}</li>)}</ul></div>}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ brand kit
const STYLE_CHOICES = ["minimal", "modern", "premium", "luxury", "promo", "seasonal"];

function BrandTab({ brand }: { brand: Brand | null | undefined }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const options = useAdsOptions();
  const [f, setF] = useState({ businessName: "", slogan: "", logoUploadId: null as string | null, primaryColor: "#4f46e5", secondaryColor: "#e0e7ff", accentColor: "#111827", headingFont: "Montserrat", bodyFont: "Inter", tone: "", styles: [] as string[] });
  useEffect(() => {
    if (brand) setF({ businessName: brand.businessName ?? "", slogan: brand.slogan ?? "", logoUploadId: brand.logoUploadId, primaryColor: brand.primaryColor ?? "#4f46e5", secondaryColor: brand.secondaryColor ?? "#e0e7ff", accentColor: brand.accentColor ?? "#111827", headingFont: brand.headingFont ?? "Montserrat", bodyFont: brand.bodyFont ?? "Inter", tone: brand.tone ?? "", styles: brand.styles });
  }, [brand]);
  const save = useMutation({
    mutationFn: () => put<{ brand: Brand }>("/ads/brand", f),
    onSuccess: (d) => { qc.setQueryData(["brand"], d.brand); toast("success", t("Brand kit saved. New banners and texts will use it.")); },
  });
  const logo = useImage(f.logoUploadId ? `/api/files/${f.logoUploadId}` : null);
  const sample = useMemo<Content>(() => ({ headline: f.slogan || t("Your headline here"), subline: f.businessName, price: "199 000 so'm", oldPrice: "", badge: "", cta: t("Order now"), brandName: f.businessName, product: null, logo }), [f, logo, t]);
  const tp = getTemplate("clean-studio");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <Card className="space-y-4 p-5 lg:col-span-3">
        <h3 className="flex items-center gap-2 font-semibold"><PaletteIcon className="h-4 w-4" />{t("Brand kit")}</h3>
        <p className="text-sm muted">{t("Saved once, used automatically: banner colours and fonts, your logo, and the tone of AI texts.")}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t("Business name")}><Input value={f.businessName} onChange={set("businessName")} maxLength={100} /></Field>
          <Field label={t("Slogan")}><Input value={f.slogan} onChange={set("slogan")} maxLength={150} /></Field>
        </div>
        <Field label={t("Logo")}><ProductPicker value={f.logoUploadId} onChange={(id) => setF((s) => ({ ...s, logoUploadId: id }))} /></Field>
        <div className="grid grid-cols-3 gap-3">
          {(["primaryColor", "secondaryColor", "accentColor"] as const).map((k) => (
            <Field key={k} label={t(k === "primaryColor" ? "Main colour" : k === "secondaryColor" ? "Second colour" : "Accent colour")}>
              <input type="color" value={f[k]} onChange={set(k)} className="h-10 w-full cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700" />
            </Field>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Heading font")}><Select value={f.headingFont} onChange={set("headingFont")} options={(options.data?.fonts ?? ["Inter"]).map((x) => ({ value: x, label: x }))} /></Field>
          <Field label={t("Text font")}><Select value={f.bodyFont} onChange={set("bodyFont")} options={(options.data?.fonts ?? ["Inter"]).map((x) => ({ value: x, label: x }))} /></Field>
        </div>
        <Field label={t("Tone of voice")} hint={t("e.g. friendly and simple, premium, playful")}><Input value={f.tone} onChange={set("tone")} maxLength={200} /></Field>
        <Field label={t("Preferred styles")}>
          <div className="flex flex-wrap gap-2">
            {STYLE_CHOICES.map((s) => (
              <button key={s} type="button" onClick={() => setF((x) => ({ ...x, styles: x.styles.includes(s) ? x.styles.filter((y) => y !== s) : [...x.styles, s] }))}
                className={cx("rounded-full border px-3 py-1 text-xs", f.styles.includes(s) ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 dark:border-slate-700")}>{t(STYLE_LABEL[s])}</button>
            ))}
          </div>
        </Field>
        {save.error && <ErrorAlert error={save.error} />}
        <Button icon={<CheckIcon className="h-4 w-4" />} loading={save.isPending} onClick={() => save.mutate()}>{t("Save brand kit")}</Button>
      </Card>
      <Card className="space-y-3 p-5 lg:col-span-2">
        <p className="text-sm font-semibold">{t("Preview")}</p>
        <TemplateThumb t={tp} content={sample} palette={{ ...tp.palette, primary: f.primaryColor, secondary: f.secondaryColor, accent: f.accentColor }} fonts={{ heading: f.headingFont, body: f.bodyFont }} />
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ page
const EMPTY: Draft = { template: "clean-studio", format: "post", headline: "", subline: "", price: "", oldPrice: "", badge: "", cta: "", productId: null, useBrand: true, primary: "", accent: "" };

export default function AdStudio() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "templates";
  const brand = useBrand();
  const uploads = useUploads();
  const [productName] = useState(() => params.get("product") ?? "");
  const [draft, setDraftState] = useState<Draft>(() => ({ ...EMPTY, headline: params.get("product") ?? "" }));
  const setDraft = useCallback((f: (d: Draft) => Draft) => setDraftState(f), []);
  const setTab = (v: Tab) => setParams({ tab: v });
  const productUrl = draft.productId ? uploads.data?.find((u) => u.id === draft.productId)?.url ?? `/api/files/${draft.productId}` : null;
  const product = useImage(productUrl);
  const logo = useImage(brand.data?.logoUrl ?? null);
  const productLabel = (draft.productId && uploads.data?.find((u) => u.id === draft.productId)?.name?.replace(/\.[a-z0-9]+$/i, "")) || productName;
  return (
    <div className="space-y-6">
      <PageHeader title={t("Ad Studio")} subtitle={t("Templates, banners, ad texts, creative score, promo videos, competitor ads and your brand kit.")} icon={<Megaphone className="h-5 w-5" />}
        actions={<Link to="/studio" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">{t("AI product photos →")}</Link>} />
      <div className="overflow-x-auto">
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: "templates", label: t("Templates") },
          { value: "maker", label: t("Banner maker") },
          { value: "score", label: t("Creative Score") },
          { value: "copy", label: t("Ad copy") },
          { value: "video", label: t("Video") },
          { value: "competitors", label: t("Competitor ads") },
          { value: "brand", label: t("Brand kit") },
        ]} />
      </div>
      {brand.error && <ErrorAlert error={brand.error} />}
      {tab === "templates" && <Suspense fallback={<div className="grid place-items-center py-16"><Spinner /></div>}><TemplateStudio /></Suspense>}
      {tab === "maker" && <MakerTab draft={draft} setDraft={setDraft} brand={brand.data} product={product} logo={logo} productName={productLabel} />}
      {tab === "score" && <ScoreTab brand={brand.data} />}
      {tab === "copy" && <CopyTab defaultProduct={productLabel} onUse={(r) => { setDraft((d) => ({ ...d, headline: r.headlines[0] ?? d.headline, subline: (r.promos[0] ?? d.subline).slice(0, 90), cta: r.ctas[0] ?? d.cta })); setTab("maker"); }} />}
      {tab === "video" && <VideoTab draft={draft} brand={brand.data} />}
      {tab === "competitors" && <CompetitorAdsTab />}
      {tab === "brand" && <BrandTab brand={brand.data} />}
      {tab === "maker" && uploads.isLoading && <Spinner />}
    </div>
  );
}
