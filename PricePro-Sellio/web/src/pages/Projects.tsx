import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, ExternalLink, FolderKanban, ImageIcon, LayoutGrid, LineChart, Pencil, Search, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ErrorAlert, FavoriteButton } from "../components/shared";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, PageHeader, PageLoader, Select, Tabs, useToast } from "../components/ui";
import { ApiError, del, errorMessage, get, patch } from "../lib/api";
import { fmtBytes, fmtDate } from "../lib/format";
import { useDebounced } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import type { Project, ProjectType, Upload } from "../lib/types";

type Tab = "all" | ProjectType | "uploads";
const TYPE_META: Record<ProjectType, { label: string; icon: typeof ImageIcon; route: (refId: string) => string }> = {
  advertisement: { label: "Advertisement", icon: ImageIcon, route: (id) => `/studio?generation=${id}` },
  forecast: { label: "Forecast", icon: LineChart, route: (id) => `/forecast?market=${id}` },
  card_session: { label: "Product cards", icon: LayoutGrid, route: (id) => `/studio?tab=cards&group=${id}` },
};

function ProjectCard({ p, onDelete }: { p: Project; onDelete: (p: Project) => void }) {
  const { t, tr } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(p.title);
  const rename = useMutation({
    mutationFn: () => patch(`/projects/${p.id}`, { title }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e) => toast("error", errorMessage(e)),
  });
  const meta = TYPE_META[p.type];
  const Icon = meta.icon;
  const missing = p.status === "missing";
  return (
    <Card className="flex flex-col overflow-hidden">
      <button onClick={() => !missing && nav(meta.route(p.refId))} className="relative block aspect-[16/10] bg-slate-100 dark:bg-slate-800" disabled={missing}>
        {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
          : <span className="flex h-full items-center justify-center text-slate-400"><Icon className="h-10 w-10" /></span>}
        <Badge tone="brand" className="absolute left-2 top-2"><Icon className="h-3 w-3" />{t(meta.label)}</Badge>
      </button>
      <div className="flex flex-1 flex-col gap-1 p-4">
        {editing ? (
          <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); rename.mutate(); }}>
            <Input autoFocus value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} className="py-1.5" aria-label={t("Project title")} />
            <Button size="sm" type="submit" loading={rename.isPending} aria-label={t("Save")}><Check className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => { setEditing(false); setTitle(p.title); }} aria-label={t("Cancel")}><X className="h-4 w-4" /></Button>
          </form>
        ) : (
          <p className="line-clamp-1 font-semibold" title={p.title}>{tr(p.title)}</p>
        )}
        <p className="line-clamp-2 text-xs muted">{p.subtitle}</p>
        <p className="text-xs muted">{fmtDate(p.createdAt)}</p>
        <div className="mt-auto flex items-center gap-1 pt-3">
          {!missing && <Button size="sm" variant="secondary" onClick={() => nav(meta.route(p.refId))} icon={<ExternalLink className="h-3.5 w-3.5" />}>{t("Open")}</Button>}
          <div className="flex-1" />
          {p.downloadUrl && <a href={p.downloadUrl} title={t("Download")} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Download className="h-4 w-4" /></a>}
          <button onClick={() => setEditing(true)} title={t("Rename")} aria-label={t("Rename")} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><Pencil className="h-4 w-4" /></button>
          {!missing && p.type !== "card_session" && <FavoriteButton compact itemType={p.type} refId={p.refId} favoriteId={p.favoriteId} invalidate={["projects"]} />}
          <button onClick={() => onDelete(p)} title={t("Delete")} aria-label={t("Delete")} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    </Card>
  );
}

function UploadsGrid() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [target, setTarget] = useState<{ upload: Upload; used?: number } | null>(null);
  const q = useQuery({ queryKey: ["uploads"], queryFn: () => get<{ uploads: Upload[] }>("/user/uploads").then((r) => r.uploads) });
  const remove = useMutation({
    mutationFn: ({ id, force }: { id: string; force: boolean }) => del(`/files/${id}${force ? "?force=1" : ""}`),
    onSuccess: () => {
      setTarget(null);
      qc.invalidateQueries({ queryKey: ["uploads"] });
      qc.invalidateQueries({ queryKey: ["generations"] });
      toast("success", t("Deleted"));
    },
    onError: (e, vars) => {
      if (e instanceof ApiError && e.code === "BAD_REQUEST" && (e.details as { generations?: number })?.generations && !vars.force) {
        setTarget((tg) => (tg ? { ...tg, used: (e.details as { generations: number }).generations } : tg));
      } else toast("error", errorMessage(e));
    },
  });
  if (q.isLoading) return <PageLoader />;
  if (!q.data?.length) return <EmptyState icon={<ImageIcon className="h-6 w-6" />} title={t("No uploaded images")} action={<Link to="/studio"><Button>{t("Upload in AI Product Studio")}</Button></Link>} />;
  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {q.data.map((u) => (
          <Card key={u.id} className="overflow-hidden">
            <img src={u.url} alt={u.name ?? ""} loading="lazy" className="aspect-square w-full object-cover" />
            <div className="p-3">
              <p className="truncate text-xs font-medium">{u.name ?? t("Image")}</p>
              <p className="text-[11px] muted">{u.width}×{u.height} · {fmtBytes(u.size)}</p>
              <div className="mt-2 flex gap-1">
                <a href={`${u.url}?download=1`} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t("Download")}><Download className="h-4 w-4" /></a>
                <button onClick={() => setTarget({ upload: u })} className="rounded-lg p-1.5 text-slate-500 hover:text-rose-600" aria-label={t("Delete")}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <ConfirmDialog open={Boolean(target)} title={t("Delete image?")}
        text={target?.used ? t("This image is used by {n} advertisement generation(s). Deleting it also deletes them.", { n: target.used }) : t("The uploaded image will be permanently deleted.")}
        confirmLabel={t("Delete")} loading={remove.isPending} onClose={() => setTarget(null)} onConfirm={() => target && remove.mutate({ id: target.upload.id, force: Boolean(target.used) })} />
    </>
  );
}

export default function Projects() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("type") as Tab) || "all";
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [toDelete, setToDelete] = useState<Project | null>(null);
  const dq = useDebounced(q, 250);

  const list = useQuery({
    queryKey: ["projects", tab, dq, sort],
    queryFn: () => {
      const sp = new URLSearchParams({ sort, limit: "100" });
      if (tab !== "all" && tab !== "uploads") sp.set("type", tab);
      if (dq) sp.set("q", dq);
      return get<{ items: Project[]; total: number; counts: Record<string, number> }>(`/projects?${sp}`);
    },
    enabled: tab !== "uploads",
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/projects/${id}`),
    onSuccess: () => {
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast("success", t("Removed from My Projects"));
    },
    onError: (e) => toast("error", errorMessage(e)),
  });
  const counts = list.data?.counts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div>
      <PageHeader icon={<FolderKanban className="h-6 w-6" />} title={t("My Projects")} subtitle={t("Your saved advertisements, demand analyses and uploads.")} />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs<Tab> value={tab} onChange={(v) => setParams(v === "all" ? {} : { type: v })} tabs={[
          { value: "all", label: t("All"), count: total },
          { value: "advertisement", label: t("Advertisements"), count: counts.advertisement ?? 0 },
          { value: "forecast", label: t("Forecasts"), count: counts.forecast ?? 0 },
          { value: "card_session", label: t("Product cards"), count: counts.card_session ?? 0 },
          { value: "uploads", label: t("Uploaded images") },
        ]} />
        {tab !== "uploads" && (
          <div className="flex gap-2">
            <div className="relative flex-1 lg:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-9" placeholder={t("Search projects")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("Search projects")} />
            </div>
            <Select aria-label={t("Sort")} className="w-40" value={sort} onChange={(e) => setSort(e.target.value)} options={[{ value: "newest", label: t("Newest first") }, { value: "oldest", label: t("Oldest first") }, { value: "title", label: t("Title A–Z") }]} />
          </div>
        )}
      </div>

      {tab === "uploads" ? <UploadsGrid /> : list.isLoading ? <PageLoader /> : list.error ? <ErrorAlert error={list.error} /> : list.data!.items.length === 0 ? (
        <EmptyState icon={<FolderKanban className="h-6 w-6" />} title={dq ? t("No projects match your search") : t("No saved projects yet")}
          text={t("Use “Save to My Projects” on an advertisement or a demand analysis.")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.data!.items.map((p) => <ProjectCard key={p.id} p={p} onDelete={setToDelete} />)}
        </div>
      )}

      <ConfirmDialog open={Boolean(toDelete)} title={t("Delete project?")} text={t("The project is removed from My Projects. The original item stays in its service history.")}
        confirmLabel={t("Delete")} loading={remove.isPending} onClose={() => setToDelete(null)} onConfirm={() => toDelete && remove.mutate(toDelete.id)} />
    </div>
  );
}
