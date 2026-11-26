import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Download, ImagePlus, Loader2, PencilLine, RefreshCw, SlidersHorizontal, Sparkles, Trash2, UploadCloud, Wand2, XCircle } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ErrorAlert, FavoriteButton, IntegrationNotice, SaveProjectButton } from "../components/shared";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, PageHeader, Select, cx, useToast } from "../components/ui";
import { del, errorMessage, get, post, upload } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtBytes, timeAgo } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type { Generation, StudioOptions, Upload } from "../lib/types";

/** Ready-made change requests for a finished advertisement (the user can also type their own). */
const EDIT_IDEAS = ["Make the background darker", "Put it on a wooden table", "Make the light warmer", "Add a little more space around the product", "Make it look more premium"];

function statusTone(s: Generation["status"]) {
  return s === "succeeded" ? "green" : s === "failed" ? "red" : "brand";
}

/** Draggable before/after comparison. */
function CompareSlider({ before, after, transparent }: { before: string; after: string; transparent: boolean }) {
  const { t } = useI18n();
  const [pos, setPos] = useState(50);
  return (
    <div className={cx("relative select-none overflow-hidden rounded-xl", transparent ? "checker" : "bg-slate-100 dark:bg-slate-800")}>
      <img src={after} alt={t("Generated image")} className="block w-full" draggable={false} />
      <img src={before} alt={t("Original image")} className="absolute inset-0 h-full w-full object-contain bg-slate-100 dark:bg-slate-800" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} draggable={false} />
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.2)]" style={{ left: `${pos}%` }}>
        <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-700 shadow-lg">⇆</span>
      </div>
      <span className="absolute left-3 top-3 rounded-md bg-slate-950/70 px-2 py-0.5 text-xs text-white">{t("Before")}</span>
      <span className="absolute right-3 top-3 rounded-md bg-brand-600 px-2 py-0.5 text-xs text-white">{t("After")}</span>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label={t("Compare before and after")}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" />
    </div>
  );
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{Math.max(0, Math.round((now - Date.parse(since)) / 1000))}s</>;
}

function ResultPanel({ id }: { id: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [change, setChange] = useState("");
  const q = useQuery({
    queryKey: ["generation", id],
    queryFn: () => get<{ generation: Generation }>(`/studio/generations/${id}`).then((r) => r.generation),
    refetchInterval: (query) => (query.state.data && ["queued", "processing"].includes(query.state.data.status) ? 2000 : false),
  });
  const g = q.data;
  const prevStatus = useRef<string | null>(null);
  useEffect(() => {
    if (g && prevStatus.current && prevStatus.current !== g.status && ["succeeded", "failed"].includes(g.status)) {
      qc.invalidateQueries({ queryKey: ["generations"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      // The image is counted (or given back) now: update the limit counters right away.
      qc.invalidateQueries({ queryKey: ["subscription"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast(g.status === "succeeded" ? "success" : "error", g.status === "succeeded" ? t("Advertisement ready") : t("Generation failed"));
    }
    prevStatus.current = g?.status ?? null;
  }, [g, qc, toast, t]);
  const retry = useMutation({
    mutationFn: () => post<{ generation: Generation }>(`/studio/generations/${id}/retry`),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["generations"] });
      setParams({ generation: d.generation.id });
    },
  });

  const edit = useMutation({
    mutationFn: () => post<{ generation: Generation }>(`/studio/generations/${id}/edit`, { instructions: change.trim() }),
    onSuccess: (d) => {
      setChange("");
      qc.invalidateQueries({ queryKey: ["generations"] });
      setParams({ generation: d.generation.id });
    },
  });

  if (q.isLoading) return <Card className="flex h-80 items-center justify-center p-6"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></Card>;
  if (q.error || !g) return <ErrorAlert error={q.error} />;
  const running = g.status === "queued" || g.status === "processing";

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">{g.productName}</h2>
          <p className="text-xs muted">{t(g.styleLabel)} · {t(g.category)} · {timeAgo(g.createdAt)}</p>
        </div>
        <Badge tone={statusTone(g.status)}>{t(g.status)}</Badge>
      </div>

      {running && (
        <div className="relative overflow-hidden rounded-xl">
          <img src={g.originalUrl} alt="" className="w-full opacity-40 blur-[2px]" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2.2, ease: "linear" }}
              className="rounded-full bg-gradient-to-tr from-brand-600 to-cyan-400 p-3 text-white shadow-xl"><Wand2 className="h-6 w-6" /></motion.div>
            <p className="font-semibold">{g.status === "queued" ? t("Waiting in queue…") : t("Generating your advertisement…")}</p>
            <p className="text-sm muted">{t("Elapsed")}: <Elapsed since={g.createdAt} /> · {t("You can leave this page; we will notify you.")}</p>
          </div>
        </div>
      )}

      {g.status === "failed" && (
        <div className="space-y-4">
          <img src={g.originalUrl} alt={t("Original image")} className="max-h-72 w-full rounded-xl object-contain bg-slate-100 dark:bg-slate-800" />
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
            <XCircle className="mt-0.5 h-4 w-4 flex-none" /><span>{g.error ?? t("Generation failed")}</span>
          </div>
          {retry.error && <ErrorAlert error={retry.error} />}
          <Button loading={retry.isPending} onClick={() => retry.mutate()} icon={<RefreshCw className="h-4 w-4" />}>{t("Retry")}</Button>
        </div>
      )}

      {g.status === "succeeded" && g.resultUrl && (
        <div className="space-y-4">
          <CompareSlider before={g.originalUrl} after={g.resultUrl} transparent={g.background === "transparent"} />
          <div className="grid grid-cols-2 gap-3">
            <figure><img src={g.originalUrl} alt={t("Original image")} className="aspect-square w-full rounded-xl object-contain bg-slate-100 dark:bg-slate-800" /><figcaption className="mt-1 text-center text-xs muted">{t("Original")}</figcaption></figure>
            <figure><img src={g.resultUrl} alt={t("Generated image")} className={cx("aspect-square w-full rounded-xl object-contain", g.background === "transparent" ? "checker" : "bg-slate-100 dark:bg-slate-800")} /><figcaption className="mt-1 text-center text-xs muted">{t("Generated")} · {g.model}</figcaption></figure>
          </div>
          {retry.error && <ErrorAlert error={retry.error} />}
          <div className="flex flex-wrap gap-2">
            <a href={`${g.resultUrl}?download=1`}><Button size="sm" icon={<Download className="h-4 w-4" />}>{t("Download")}</Button></a>
            <SaveProjectButton type="advertisement" refId={g.id} projectId={g.projectId} invalidate={["generation", id]} />
            <FavoriteButton itemType="advertisement" refId={g.id} favoriteId={g.favoriteId} invalidate={["generation", id]} />
            <Button size="sm" variant="secondary" icon={<PencilLine className="h-4 w-4" />} data-testid="open-in-editor"
              onClick={() => navigate(`/ads?tab=templates&tpl=photo-ad&photo=${encodeURIComponent(g.resultUrl!)}`)}>{t("Open in editor")}</Button>
            <Button size="sm" variant="secondary" loading={retry.isPending} onClick={() => retry.mutate()} icon={<RefreshCw className="h-4 w-4" />}>{t("Generate Again")}</Button>
          </div>
          <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800" data-testid="ai-edit">
            <div>
              <p className="flex items-center gap-1.5 font-semibold"><Wand2 className="h-4 w-4 text-brand-600" />{t("Change with AI")}</p>
              <p className="text-xs muted">{t("Write what to change in plain words. The AI keeps the product and changes only what you ask. Each change uses one AI image from your limit.")}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EDIT_IDEAS.map((idea) => (
                <button key={idea} type="button" onClick={() => setChange(t(idea))}
                  className="rounded-full border border-slate-200 px-2.5 py-1 text-xs hover:border-brand-400 hover:text-brand-600 dark:border-slate-700">{t(idea)}</button>
              ))}
            </div>
            <textarea className="input min-h-20" maxLength={500} value={change} onChange={(e) => setChange(e.target.value)}
              placeholder={t("e.g. make the background blue and add soft shadows")} data-testid="ai-edit-input" />
            {edit.error && <ErrorAlert error={edit.error} />}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs muted">{t("To add a price, headline or logo, open it in the editor.")}</span>
              <Button size="sm" disabled={change.trim().length < 3} loading={edit.isPending} onClick={() => edit.mutate()} icon={<Sparkles className="h-4 w-4" />} data-testid="ai-edit-apply">{t("Apply changes")}</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function Studio() {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const currentId = params.get("generation");

  const options = useQuery({ queryKey: ["studio-options"], queryFn: () => get<StudioOptions>("/studio/options") });
  const uploads = useQuery({ queryKey: ["uploads"], queryFn: () => get<{ uploads: Upload[] }>("/user/uploads").then((r) => r.uploads) });
  const history = useQuery({ queryKey: ["generations"], queryFn: () => get<{ items: Generation[]; total: number }>("/studio/generations?limit=24") });

  const [selected, setSelected] = useState<Upload | null>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [form, setForm] = useState({ productName: params.get("product")?.slice(0, 120) ?? "", size: "square" });
  const [deleteGen, setDeleteGen] = useState<Generation | null>(null);
  const [more, setMore] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const opts = options.data;
  const configured = opts?.configured ?? true;
  const ready = Boolean(opts && configured && user?.emailVerified);

  const up = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return upload<{ upload: Upload }>("/studio/uploads", fd);
    },
    onSuccess: (d) => {
      setSelected(d.upload);
      qc.invalidateQueries({ queryKey: ["uploads"] });
      // Nothing to fill in: the AI recognises the product and designs the advertisement right away.
      if (ready) generate.mutate(d.upload.id);
    },
    onError: (e) => setLocalError(errorMessage(e)),
  });

  async function handleFile(file: File | undefined) {
    setLocalError(null);
    if (!file || !opts) return;
    if (!opts.limits.formats.includes(file.type)) return setLocalError(t("Unsupported format. Use PNG, JPEG or WEBP."));
    if (file.size > opts.limits.maxBytes) return setLocalError(t("The file is larger than {size}.", { size: fmtBytes(opts.limits.maxBytes) }));
    const url = URL.createObjectURL(file);
    const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = url;
    });
    URL.revokeObjectURL(url);
    if (!dims) return setLocalError(t("The file could not be read as an image."));
    if (dims.w < opts.limits.minSide || dims.h < opts.limits.minSide) return setLocalError(t("The image is too small. Minimum {px}px on each side.", { px: opts.limits.minSide }));
    up.mutate(file);
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void handleFile(e.dataTransfer.files?.[0]);
  };

  const generate = useMutation({
    mutationFn: (uploadId: string) =>
      post<{ generation: Generation }>("/studio/generations", {
        uploadId,
        productName: form.productName.trim() || undefined,
        // Style, scene, light and colours are always chosen by the AI.
        style: "auto",
        background: "auto",
        settings: { size: form.size, quality: "medium", lighting: "soft" },
      }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["generations"] });
      setParams({ generation: d.generation.id });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  const removeGen = useMutation({
    mutationFn: (id: string) => del(`/studio/generations/${id}`),
    onSuccess: (_, id) => {
      setDeleteGen(null);
      qc.invalidateQueries({ queryKey: ["generations"] });
      if (currentId === id) setParams({});
      toast("success", t("Deleted"));
    },
    onError: (e) => toast("error", errorMessage(e)),
  });

  const canGenerate = Boolean(selected && ready);

  return (
    <div>
      <PageHeader icon={<Sparkles className="h-6 w-6" />} title={t("AI Product Studio")} subtitle={t("Turn ordinary product photos into professional advertising images.")} />
      {opts && !opts.configured && <div className="mb-6"><IntegrationNotice service="imageGeneration" /></div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">1. {t("Product image")}</h2>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
              className={cx("relative flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed p-4 text-center transition",
                dragging ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-slate-300 hover:border-brand-400 dark:border-slate-700")}
            >
              {up.isPending ? (
                <><Loader2 className="h-7 w-7 animate-spin text-brand-600" /><p className="text-sm">{t("Uploading securely…")}</p></>
              ) : selected ? (
                <>
                  <img src={selected.url} alt={selected.name ?? ""} className="max-h-56 rounded-lg object-contain" />
                  <p className="text-xs muted">{selected.name} · {selected.width}×{selected.height} · {fmtBytes(selected.size)}</p>
                  <p className="text-xs font-medium text-brand-600 dark:text-brand-400">{t("Click or drop to replace")}</p>
                </>
              ) : (
                <>
                  <UploadCloud className="h-9 w-9 text-brand-500" />
                  <p className="font-medium">{t("Drag & drop a product photo")}</p>
                  <p className="text-xs muted">{t("PNG, JPEG or WEBP · up to {mb} MB · at least 256×256", { mb: Math.round((opts?.limits.maxBytes ?? 10485760) / 1048576) })}</p>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            {localError && <p className="mt-2 text-sm text-rose-600">{localError}</p>}
            {(uploads.data?.length ?? 0) > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium muted">{t("Or choose a previous upload")}</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {uploads.data!.slice(0, 12).map((u) => (
                    <button key={u.id} onClick={() => setSelected(u)} title={u.name ?? ""}
                      className={cx("h-14 w-14 flex-none overflow-hidden rounded-lg border-2", selected?.id === u.id ? "border-brand-500" : "border-transparent")}>
                      <img src={u.url} alt={u.name ?? ""} className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="space-y-3 p-5">
            {generate.error && <ErrorAlert error={generate.error} />}
            <Button size="lg" className="w-full" disabled={!canGenerate} loading={generate.isPending} onClick={() => selected && generate.mutate(selected.id)} icon={<Wand2 className="h-5 w-5" />} data-testid="create-ad">
              {t("Create Advertisement")}
            </Button>
            <p className="text-center text-xs muted">{selected ? t("The AI recognises the product and chooses the style, background and light itself.") : t("Just upload a photo: the AI recognises the product and creates the advertisement by itself.")}</p>
            <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} data-testid="more-settings"
              className="flex w-full items-center justify-between rounded-lg px-1 py-1.5 text-sm font-medium muted hover:text-current">
              <span className="flex items-center gap-1.5"><SlidersHorizontal className="h-4 w-4" />{t("More settings (optional)")}</span>
              <ChevronDown className={cx("h-4 w-4 transition", more && "rotate-180")} />
            </button>
            {more && (
              <div className="space-y-4 border-t border-slate-200 pt-4 dark:border-slate-800">
                <p className="text-xs muted">{t("Leave anything empty and the AI decides it.")}</p>
                <Field label={t("Product name")}><Input value={form.productName} maxLength={120} onChange={(e) => setForm({ ...form, productName: e.target.value })} placeholder={t("e.g. Leather backpack")} /></Field>
                <Field label={t("Format")}><Select value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} options={(opts?.sizes ?? []).map((s) => ({ value: s.value, label: `${t(s.label)} (${s.pixels})` }))} /></Field>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-3">
          <AnimatePresence mode="wait">
            {currentId ? (
              <motion.div key={currentId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <ResultPanel id={currentId} />
              </motion.div>
            ) : (
              <Card className="p-6">
                <EmptyState icon={<ImagePlus className="h-6 w-6" />} title={t("Your advertisement will appear here")} text={t("Upload a product photo and the AI creates your advertisement. The original and generated images are shown side by side.")} />
              </Card>
            )}
          </AnimatePresence>

          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">{t("Generation history")}</h2>
              <span className="text-xs muted">{history.data?.total ?? 0} {t("total")}</span>
            </div>
            {history.data && history.data.items.length === 0 ? (
              <p className="py-6 text-center text-sm muted">{t("No generations yet.")}</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {history.data?.items.map((g) => (
                  <div key={g.id} className={cx("group relative overflow-hidden rounded-xl border-2", currentId === g.id ? "border-brand-500" : "border-transparent")}>
                    <button onClick={() => setParams({ generation: g.id })} className="block w-full text-left">
                      <img src={g.resultUrl ?? g.originalUrl} alt={g.productName} loading="lazy" className={cx("aspect-square w-full object-cover", !g.resultUrl && "opacity-60")} />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 to-transparent p-2 text-white">
                        <p className="truncate text-xs font-semibold">{g.productName}</p>
                        <p className="text-[11px] opacity-80">{timeAgo(g.createdAt)}</p>
                      </div>
                    </button>
                    <Badge tone={statusTone(g.status)} className="absolute left-2 top-2">{t(g.status)}</Badge>
                    {!["queued", "processing"].includes(g.status) && (
                      <button onClick={() => setDeleteGen(g)} aria-label={t("Delete")} className="absolute right-2 top-2 rounded-lg bg-slate-950/60 p-1.5 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog open={Boolean(deleteGen)} title={t("Delete generation?")} text={t("The generated image and its history entry will be permanently deleted.")}
        confirmLabel={t("Delete")} loading={removeGen.isPending} onClose={() => setDeleteGen(null)} onConfirm={() => deleteGen && removeGen.mutate(deleteGen.id)} />
    </div>
  );
}
