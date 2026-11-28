/**
 * Multi-Angle Generator (AI Product Studio tab):
 *  Mode A — upload one product photo and generate AI photos of the same product from other camera angles;
 *  Mode B — turn the chosen images (original + generated) into marketplace product cards with every design theme.
 * Every image is a normal AI image of the plan (counted only when it succeeds). Sessions are kept in My Projects.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Camera, Check, Download, Eye, ImagePlus, LayoutGrid, Loader2, Plus, RefreshCw, Trash2, UploadCloud, Wand2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ErrorAlert, IntegrationNotice } from "../components/shared";
import { Alert, Button, Card, ConfirmDialog, EmptyState, Field, Select, Tabs, cx, useToast } from "../components/ui";
import { del, errorMessage, get, patch, post, upload } from "../lib/api";
import { timeAgo } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { CreateCard } from "../cards/CreateCard";
import { SlideViewer } from "../cards/SlideViewer";
import { useCards } from "../cards/common";

type Options = { imageAi: boolean; angles: { key: string; label: string; needsCheck: boolean }[]; counts: number[]; backgrounds: string[]; lights: string[]; ratios: string[]; qualities: string[] };
type Item = { id: string; angle: string; angleLabel: string; needsCheck: boolean; generationId: string; status: string; resultUrl: string | null; resultUploadId: string | null; error: string | null; createdAt: string };
type Session = {
  id: string; name: string; uploadId: string; originalUrl: string; createdAt: string; updatedAt: string; imageCount: number;
  settings: { last?: { angles: string[]; count: number; background: string; color?: string; lighting: string; quality: string; ratio: string }; cardGroups?: string[] };
  items?: Item[];
};
type Sub = { usage: { metrics: Record<string, { used: number; limit: number }> } };

const BG_LABEL: Record<string, string> = { white: "White", black: "Black", studio: "Studio", nature: "Nature", luxury: "Luxury", gradient: "Gradient", ai: "AI-generated background", custom: "Custom colour" };
const LIGHT_LABEL: Record<string, string> = { soft: "Soft", studio: "Studio", cinematic: "Cinematic", natural: "Natural", dramatic: "Dramatic" };
const RATIO_LABEL: Record<string, string> = { "1:1": "Square 1:1", "2:3": "Portrait 2:3", "3:2": "Landscape 3:2" };
const QUALITY_LABEL: Record<string, string> = { low: "Fast (low)", medium: "Standard", high: "High quality" };
const pending = (i: Item) => i.status !== "succeeded" && i.status !== "failed";

function NewSession({ onCreated }: { onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [drag, setDrag] = useState(false);
  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const up = await upload<{ upload: { id: string } }>("/studio/uploads", fd);
      const r = await post<{ session: Session }>("/angles/sessions", { uploadId: up.upload.id });
      onCreated(r.session.id);
    } catch (e) { setError(e); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  };
  return (
    <Card className="space-y-3 p-5">
      <h3 className="font-semibold">{t("1. Upload the original product photo")}</h3>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} data-testid="angles-input" />
      <div role="button" tabIndex={0} onClick={() => ref.current?.click()} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); void pick(e.dataTransfer.files?.[0]); }}
        className={cx("flex min-h-52 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition", drag ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-slate-300 hover:border-brand-400 dark:border-slate-700")}>
        {busy ? <Loader2 className="h-8 w-8 animate-spin text-brand-600" /> : <UploadCloud className="h-9 w-9 text-brand-500" />}
        <p className="font-medium">{busy ? t("Uploading securely…") : t("Drag & drop a product photo")}</p>
        <p className="max-w-md text-xs muted">{t("A clear, well-lit photo of the whole product works best. More angles of the real product give more accurate results.")}</p>
      </div>
      {error != null && <ErrorAlert error={error} />}
    </Card>
  );
}

export default function AnglesTab() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const sessionId = params.get("session");
  const mode = params.get("mode") === "cards" ? "cards" : "photos";
  const go = (p: Record<string, string>) => setParams({ tab: "angles", ...p });

  const options = useQuery({ queryKey: ["angles-options"], queryFn: () => get<Options>("/angles/options") });
  const sessions = useQuery({ queryKey: ["angles-sessions"], queryFn: () => get<{ items: Session[] }>("/angles/sessions").then((r) => r.items) });
  const session = useQuery({
    queryKey: ["angles-session", sessionId], enabled: Boolean(sessionId),
    queryFn: () => get<{ session: Session }>(`/angles/sessions/${sessionId}`).then((r) => r.session),
    refetchInterval: (q) => ((q.state.data?.items ?? []).some(pending) ? 2500 : false),
  });
  const sub = useQuery({ queryKey: ["subscription"], queryFn: () => get<Sub>("/subscription"), staleTime: 10_000 });
  const cards = useCards();
  const s = session.data;
  const o = options.data;

  // settings (start from the session's last run)
  const last = s?.settings.last;
  const [angles, setAngles] = useState<string[] | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [bg, setBg] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [light, setLight] = useState<string | null>(null);
  const [quality, setQuality] = useState<string | null>(null);
  const [ratio, setRatio] = useState<string | null>(null);
  const cur = {
    angles: angles ?? last?.angles ?? ["front", "angle45", "back", "closeup"], count: count ?? last?.count ?? 4,
    bg: bg ?? last?.background ?? "white", color: color ?? last?.color ?? "#F3F4F6", light: light ?? last?.lighting ?? "studio",
    quality: quality ?? last?.quality ?? "medium", ratio: ratio ?? last?.ratio ?? "1:1",
  };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<Item | null>(null);
  const [delSession, setDelSession] = useState(false);

  const requests = sub.data?.usage.metrics.requests;
  const left = requests ? Math.max(0, requests.limit - requests.used) : null;
  const items = s?.items ?? [];
  const done = items.filter((i) => !pending(i)).length;
  const running = items.some(pending);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["angles-session", sessionId] });
    qc.invalidateQueries({ queryKey: ["angles-sessions"] });
    qc.invalidateQueries({ queryKey: ["subscription"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };
  const generate = useMutation({
    mutationFn: () => post<{ items: Item[]; limitMessage: string | null }>(`/angles/sessions/${sessionId}/generate`, {
      angles: cur.angles, count: cur.count, background: cur.bg, color: cur.bg === "custom" ? cur.color : undefined, lighting: cur.light, quality: cur.quality, ratio: cur.ratio,
    }),
    onSuccess: (r) => { refresh(); if (r.limitMessage) toast("error", r.limitMessage); else toast("success", t("{n} images are being generated.", { n: r.items.length })); },
    onError: (e) => toast("error", errorMessage(e)),
  });
  const regenerate = useMutation({
    mutationFn: (id: string) => post(`/angles/items/${id}/regenerate`),
    onSuccess: () => refresh(),
    onError: (e) => toast("error", errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/angles/items/${id}`),
    onSuccess: (_r, id) => { setToDelete(null); setSelected((x) => { const n = new Set(x); n.delete(id); return n; }); refresh(); },
    onError: (e) => toast("error", errorMessage(e)),
  });
  const removeSession = useMutation({
    mutationFn: () => del(`/angles/sessions/${sessionId}`),
    onSuccess: () => { setDelSession(false); qc.invalidateQueries({ queryKey: ["angles-sessions"] }); qc.invalidateQueries({ queryKey: ["projects"] }); go({}); },
    onError: (e) => toast("error", errorMessage(e)),
  });

  // gallery entries: the original first, then the generated views
  const gallery = useMemo(() => (s ? [
    { id: "original", label: t("Original photo"), src: s.originalUrl, uploadId: s.uploadId, item: null as Item | null },
    ...items.map((i) => ({ id: i.id, label: t(i.angleLabel), src: i.resultUrl, uploadId: i.resultUploadId, item: i })),
  ] : []), [s, items, t]);
  const ready = gallery.filter((g) => g.src && g.uploadId);
  const chosen = ready.filter((g) => selected.has(g.id));
  const toggle = (id: string) => setSelected((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const cardGroups = s?.settings.cardGroups ?? [];
  const sessionCards = (cards.data ?? []).filter((c) => cardGroups.includes(c.groupId));

  if (o && !o.imageAi) return <IntegrationNotice service="imageGeneration" />;

  // ---------------------------------------------------------------- no session: upload + previous sessions
  if (!sessionId) {
    return (
      <div className="space-y-5" data-testid="angles">
        <Intro />
        <NewSession onCreated={(id) => { qc.invalidateQueries({ queryKey: ["angles-sessions"] }); go({ session: id }); }} />
        {(sessions.data?.length ?? 0) > 0 && (
          <Card className="space-y-3 p-5">
            <h3 className="font-semibold">{t("Previous multi-angle projects")}</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {sessions.data!.map((x) => (
                <button key={x.id} type="button" onClick={() => go({ session: x.id })} className="overflow-hidden rounded-xl border border-slate-200 text-left transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-700" data-session={x.id}>
                  <img src={x.originalUrl} alt="" className="aspect-square w-full bg-slate-50 object-contain dark:bg-slate-800" loading="lazy" />
                  <div className="p-2"><p className="truncate text-sm font-semibold">{x.name}</p><p className="text-[11px] muted">{t("{n} images", { n: x.imageCount })} · {timeAgo(x.updatedAt)}</p></div>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  }

  if (session.isLoading) return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>;
  if (session.error || !s) return <Card className="p-6"><EmptyState icon={<Camera className="h-6 w-6" />} title={t("Project not found")} action={<Button onClick={() => go({})}>{t("Multi-angle projects")}</Button>} /></Card>;

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => go({})}>{t("Multi-angle projects")}</Button>
      <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{s.name}</h2>
      <Tabs value={mode} onChange={(v) => go({ session: s.id, ...(v === "cards" ? { mode: "cards" } : {}) })} tabs={[
        { value: "photos", label: t("Product photos") }, { value: "cards", label: t("Product cards") },
      ]} />
      <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDelSession(true)}>{t("Delete")}</Button>
    </div>
  );

  // ---------------------------------------------------------------- Mode B: product cards
  if (mode === "cards") {
    return (
      <div className="space-y-5" data-testid="angles">
        {header}
        {chosen.length === 0 ? (
          <Card className="space-y-3 p-6 text-center" data-testid="angles-cards-empty">
            <LayoutGrid className="mx-auto h-8 w-8 text-brand-500" />
            <p className="font-semibold">{t("Choose the images for the cards first")}</p>
            <p className="text-sm muted">{t("Tick the best images in Product photos (the original and generated angles), then press Create product cards.")}</p>
            <div><Button onClick={() => go({ session: s.id })}>{t("Go to Product photos")}</Button></div>
          </Card>
        ) : (
          <CreateCard key={chosen.map((c) => c.id).join(",")} preset={{ photos: chosen.map((c) => ({ src: c.src!, uploadId: c.uploadId! })), name: s.name }}
            backLabel={t("Back to photos")} onCancel={() => go({ session: s.id })}
            onDone={async (groupId) => {
              try { await patch(`/angles/sessions/${s.id}`, { cardGroups: [...cardGroups, groupId] }); } catch { /* the cards are saved anyway */ }
              refresh();
              qc.invalidateQueries({ queryKey: ["cards"] });
              nav(`/studio?tab=cards&group=${groupId}`);
            }} />
        )}
        <ConfirmDialog open={delSession} title={t("Delete this project?")} text={t("The project and its generated images will be removed from here. Product cards made from it are kept.")} confirmLabel={t("Delete")}
          loading={removeSession.isPending} onClose={() => setDelSession(false)} onConfirm={() => removeSession.mutate()} />
      </div>
    );
  }

  // ---------------------------------------------------------------- Mode A: product photos
  const reconstructed = cur.angles.filter((k) => o?.angles.find((a) => a.key === k)?.needsCheck);
  return (
    <div className="space-y-5" data-testid="angles">
      {header}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* settings */}
        <Card className="space-y-4 self-start p-4 lg:sticky lg:top-4" data-testid="angles-settings">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{t("Camera angles")}</p>
              <div className="flex gap-1 text-[11px]">
                <button type="button" className="font-semibold text-brand-600" onClick={() => setAngles((o?.angles ?? []).filter((a) => a.key !== "auto").map((a) => a.key))}>{t("All")}</button>
                <span className="muted">·</span>
                <button type="button" className="font-semibold text-brand-600" onClick={() => setAngles(["auto"])}>{t("Clear")}</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="angle-chips">
              {(o?.angles ?? []).map((a) => {
                const on = cur.angles.includes(a.key);
                return (
                  <button key={a.key} type="button" aria-pressed={on} data-angle={a.key} title={a.needsCheck ? t("This side is not visible in one photo: the AI reconstructs it. Check it against the real product.") : undefined}
                    onClick={() => setAngles(on ? (cur.angles.length > 1 ? cur.angles.filter((x) => x !== a.key) : cur.angles) : [...cur.angles.filter((x) => x !== "auto" || a.key === "auto"), a.key].filter((x) => a.key !== "auto" || x === "auto"))}
                    className={cx("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition", on ? "border-brand-500 bg-brand-600 text-white" : "border-slate-200 hover:border-brand-300 dark:border-slate-700")}>
                    {on && <Check className="h-3 w-3" />}{t(a.label)}{a.needsCheck && <span className={on ? "text-amber-200" : "text-amber-500"}>*</span>}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] muted">{t("* Not visible in a single photo — the AI reconstructs it; check the result.")}</p>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-semibold">{t("Number of images")}</p>
            <div className="flex gap-1.5" data-testid="angle-count">
              {(o?.counts ?? [2, 4, 6, 8, 12]).map((n) => (
                <button key={n} type="button" onClick={() => setCount(n)} aria-pressed={cur.count === n}
                  className={cx("flex-1 rounded-lg border py-1.5 text-sm font-bold transition", cur.count === n ? "border-brand-500 bg-brand-600 text-white" : "border-slate-200 hover:border-brand-300 dark:border-slate-700")}>{n}</button>
              ))}
            </div>
            <p className="mt-1 text-[11px] muted">{cur.count < cur.angles.length ? t("Only the first {n} chosen angles fit into {n} images.", { n: cur.count }) : cur.count > cur.angles.length ? t("Each angle gets {k} variations.", { k: Math.ceil(cur.count / cur.angles.length) }) : t("One image for each angle.")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("Background")}>
              <Select value={cur.bg} onChange={(e) => setBg(e.target.value)} options={(o?.backgrounds ?? []).map((b) => ({ value: b, label: t(BG_LABEL[b] ?? b) }))} data-testid="angle-bg" />
            </Field>
            <Field label={t("Lighting")}>
              <Select value={cur.light} onChange={(e) => setLight(e.target.value)} options={(o?.lights ?? []).map((l) => ({ value: l, label: t(LIGHT_LABEL[l] ?? l) }))} />
            </Field>
            {cur.bg === "custom" && (
              <Field label={t("Background colour")}>
                <input type="color" value={cur.color} onChange={(e) => setColor(e.target.value.toUpperCase())} className="h-10 w-full cursor-pointer rounded-lg border border-slate-200 dark:border-slate-700" aria-label={t("Background colour")} />
              </Field>
            )}
            <Field label={t("Quality")}>
              <Select value={cur.quality} onChange={(e) => setQuality(e.target.value)} options={(o?.qualities ?? []).map((q) => ({ value: q, label: t(QUALITY_LABEL[q] ?? q) }))} />
            </Field>
            <Field label={t("Aspect ratio")}>
              <Select value={cur.ratio} onChange={(e) => setRatio(e.target.value)} options={(o?.ratios ?? []).map((r) => ({ value: r, label: t(RATIO_LABEL[r] ?? r) }))} />
            </Field>
          </div>
          {reconstructed.length > 0 && (
            <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("Some chosen sides are not visible in your photo. The AI will reconstruct them, and they may differ from the real product. Check them before using; a photo of that side gives an accurate result.")}</span>
            </div>
          )}
          <div className="rounded-xl bg-slate-50 p-2.5 text-xs dark:bg-slate-800/60">
            {t("{n} images = {n} AI images from your plan.", { n: cur.count })} {left !== null && <b>{t("Left now: {n}", { n: left })}</b>}
          </div>
          <Button size="lg" className="w-full" icon={<Wand2 className="h-5 w-5" />} loading={generate.isPending} disabled={running} onClick={() => generate.mutate()} data-testid="angles-generate">
            {running ? t("Generating… {done}/{total}", { done, total: items.length }) : t("Generate {n} images", { n: cur.count })}
          </Button>
          {generate.error != null && <ErrorAlert error={generate.error} />}
        </Card>

        {/* gallery */}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{t("Images")}</h3>
            <span className="text-xs muted">{t("{n} selected", { n: chosen.length })}</span>
            <button type="button" className="text-xs font-semibold text-brand-600" onClick={() => setSelected(new Set(ready.map((g) => g.id)))}>{t("Select all")}</button>
            <div className="flex-1" />
            <Button icon={<LayoutGrid className="h-4 w-4" />} disabled={chosen.length === 0} onClick={() => go({ session: s.id, mode: "cards" })} data-testid="angles-to-cards">{t("Create product cards")}</Button>
          </div>
          {running && (
            <div className="space-y-1" data-testid="angles-progress">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${items.length ? Math.round((done / items.length) * 100) : 0}%` }} /></div>
              <p className="text-xs muted">{t("The AI is making the images: {done}/{total}. You can leave this page — they are saved.", { done, total: items.length })}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" data-testid="angles-gallery">
            {gallery.map((g) => {
              const it = g.item;
              const isReady = Boolean(g.src && g.uploadId);
              const idx = ready.findIndex((x) => x.id === g.id);
              return (
                <div key={g.id} data-item={g.id} className={cx("card overflow-hidden transition", selected.has(g.id) && "ring-2 ring-brand-500")}>
                  <div className="relative aspect-square bg-slate-100 dark:bg-slate-800">
                    {isReady ? (
                      <button type="button" className="block h-full w-full" onClick={() => setViewing(idx)} title={t("Preview")}><img src={g.src!} alt={g.label} className="h-full w-full object-contain" loading="lazy" /></button>
                    ) : it && pending(it) ? (
                      <div className="grid h-full place-items-center text-center text-xs muted"><div><Loader2 className="mx-auto mb-1 h-6 w-6 animate-spin text-brand-600" />{t("Generating…")}</div></div>
                    ) : (
                      <div className="grid h-full place-items-center p-3 text-center text-xs text-rose-600"><div><AlertTriangle className="mx-auto mb-1 h-5 w-5" />{it?.error ? t(it.error) : t("Failed")}</div></div>
                    )}
                    {isReady && (
                      <button type="button" onClick={() => toggle(g.id)} aria-pressed={selected.has(g.id)} aria-label={t("Select")} data-testid="angle-select"
                        className={cx("absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-lg border shadow", selected.has(g.id) ? "border-brand-600 bg-brand-600 text-white" : "border-white bg-white/90 text-slate-500")}>
                        {selected.has(g.id) && <Check className="h-4 w-4" />}
                      </button>
                    )}
                    {g.id === "original" && <span className="absolute right-2 top-2 rounded-md bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-bold text-white">{t("Original")}</span>}
                    {it?.needsCheck && isReady && <span className="absolute bottom-2 left-2 right-2 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-center text-[10px] font-bold text-white" title={t("This side is not visible in one photo: the AI reconstructs it. Check it against the real product.")}>{t("AI-reconstructed · check")}</span>}
                  </div>
                  <p className="truncate px-2 pt-2 text-xs font-semibold" title={g.label}>{g.label}</p>
                  <div className="flex items-center justify-end gap-0.5 px-1.5 pb-1.5">
                    {isReady && <button type="button" onClick={() => setViewing(idx)} title={t("Preview")} aria-label={t("Preview")} className="rounded-lg p-1.5 muted hover:bg-[var(--v-th)]"><Eye className="h-4 w-4" /></button>}
                    {it && !pending(it) && <button type="button" onClick={() => regenerate.mutate(it.id)} disabled={regenerate.isPending} title={t("Regenerate")} aria-label={t("Regenerate")} className="rounded-lg p-1.5 muted hover:bg-[var(--v-th)]" data-testid="angle-regenerate"><RefreshCw className="h-4 w-4" /></button>}
                    {isReady && <a href={`${g.src}?download=1`} title={t("Download")} aria-label={t("Download")} className="rounded-lg p-1.5 muted hover:bg-[var(--v-th)]"><Download className="h-4 w-4" /></a>}
                    {it && <button type="button" onClick={() => setToDelete(it)} title={t("Delete")} aria-label={t("Delete")} className="rounded-lg p-1.5 muted hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" data-testid="angle-delete"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </div>
              );
            })}
          </div>
          {items.length === 0 && <Alert tone="info">{t("Choose the angles and settings on the left and press Generate. The images appear here.")}</Alert>}

          {sessionCards.length > 0 && (
            <div className="space-y-2" data-testid="angles-cards">
              <h3 className="font-semibold">{t("Product cards made from these images")}</h3>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
                {sessionCards.map((c) => (
                  <button key={c.id} type="button" onClick={() => nav(`/studio?tab=cards&group=${c.groupId}`)} className="overflow-hidden rounded-lg border border-slate-200 text-left hover:shadow-md dark:border-slate-700" title={c.name}>
                    {c.thumb ? <img src={c.thumb} alt={c.name} className="aspect-[3/4] w-full object-contain" loading="lazy" /> : <div className="grid aspect-[3/4] place-items-center"><LayoutGrid className="h-5 w-5 muted" /></div>}
                    <p className="truncate p-1.5 text-[11px] font-semibold">{c.name}</p>
                  </button>
                ))}
              </div>
              <p className="text-xs muted">{t("Open a card to edit, regenerate or download it.")}</p>
            </div>
          )}
        </div>
      </div>

      {viewing !== null && (
        <SlideViewer start={viewing} onClose={() => setViewing(null)}
          slides={ready.map((g) => ({ key: g.id, title: g.label, render: (w) => <img src={g.src!} alt={g.label} style={{ width: w }} className="max-h-[70vh] bg-white object-contain" />, thumb: () => <img src={g.src!} alt="" className="aspect-square w-full object-cover" /> }))}
          footer={(k) => (
            <>
              <Button variant="secondary" icon={selected.has(ready[k].id) ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />} onClick={() => toggle(ready[k].id)}>{selected.has(ready[k].id) ? t("Selected") : t("Select")}</Button>
              <a href={`${ready[k].src}?download=1`} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-900"><Download className="h-4 w-4" />{t("Download")}</a>
            </>
          )} />
      )}
      <ConfirmDialog open={Boolean(toDelete)} title={t("Delete image?")} text={t("This generated image will be removed from the project.")} confirmLabel={t("Delete")}
        loading={remove.isPending} onClose={() => setToDelete(null)} onConfirm={() => toDelete && remove.mutate(toDelete.id)} />
      <ConfirmDialog open={delSession} title={t("Delete this project?")} text={t("The project and its generated images will be removed from here. Product cards made from it are kept.")} confirmLabel={t("Delete")}
        loading={removeSession.isPending} onClose={() => setDelSession(false)} onConfirm={() => removeSession.mutate()} />
    </div>
  );
}

function Intro() {
  const { t } = useI18n();
  const steps = ["Upload one product photo", "Choose angles and settings", "Generate and preview", "Tick the best images", "Create product cards"];
  return (
    <Card className="space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Camera className="h-5 w-5 text-brand-600" />{t("Multi-Angle Generator")}</h2>
      <p className="text-sm muted">{t("Turn one product photo into AI photos of the same product from different camera angles, then make marketplace product cards from them.")}</p>
      <ol className="flex flex-wrap gap-2 text-xs">
        {steps.map((x, k) => <li key={x} className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800"><b className="text-brand-600">{k + 1}</b>{t(x)}</li>)}
      </ol>
      <p className="flex gap-1.5 text-xs muted"><ImagePlus className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("The AI keeps the product's shape, colours, logo and details, but it cannot build an exact 3D model from one photo: views of hidden sides are marked for checking.")}</p>
    </Card>
  );
}
