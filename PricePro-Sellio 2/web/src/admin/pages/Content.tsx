import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorAlert } from "../../components/shared";
import { Badge, Button, Field, Input, Modal, Select, Tabs, useToast } from "../../components/ui";
import { del, get } from "../../lib/api";
import { fmtBytes, fmtDateTime, timeAgo } from "../../lib/format";
import { useDebounced } from "../../lib/hooks";
import { useI18n } from "../../lib/i18n";
import { Pager, Section, Table, useCan, useList } from "../ui";

type Item = { id: string; title: string; kind: string; status?: string; owner: string; ownerId: string; createdAt: string; imageUrl?: string | null; model?: string; error?: string | null; size?: number; width?: number; height?: number; areas?: string[] };
type Tab = "ads" | "images" | "forecasts" | "saved" | "failed";
const STATUS_OPTIONS: Record<Exclude<Tab, "failed">, { value: string; label: string }[]> = {
  ads: [{ value: "", label: "All" }, { value: "succeeded", label: "Succeeded" }, { value: "failed", label: "Failed" }, { value: "queued", label: "Queued" }, { value: "processing", label: "Processing" }, { value: "templates", label: "Template banners" }],
  images: [{ value: "", label: "All" }, { value: "product", label: "Product photos" }, { value: "generated", label: "Generated images" }],
  forecasts: [{ value: "", label: "All" }, { value: "completed", label: "Completed" }, { value: "no_data", label: "No data" }],
  saved: [{ value: "", label: "All" }, { value: "advertisement", label: "advertisement" }, { value: "forecast", label: "forecast" }],
};

function Failed() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ["admin-failed"], queryFn: () => get<{ generations: { id: string; title: string; error: string | null; model: string; owner: string; createdAt: string }[]; analyses: { id: string; title: string; owner: string; createdAt: string }[] }>("/admin/content/failed") });
  if (q.error) return <ErrorAlert error={q.error} />;
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Section title={t("Failed AI generations")}>
        <Table head={[t("Product"), t("Error"), t("Owner"), t("When")]} empty={q.data?.generations.length === 0}>
          {(q.data?.generations ?? []).map((g) => <tr key={g.id}><td>{g.title}<span className="block text-xs muted">{g.model}</span></td><td className="max-w-[260px] text-xs text-rose-600">{g.error ?? "—"}</td><td className="text-xs">{g.owner}</td><td>{timeAgo(g.createdAt)}</td></tr>)}
        </Table>
      </Section>
      <Section title={t("Analyses without data")}>
        <Table head={[t("Product"), t("Owner"), t("When")]} empty={q.data?.analyses.length === 0}>
          {(q.data?.analyses ?? []).map((a) => <tr key={a.id}><td>{a.title}</td><td className="text-xs">{a.owner}</td><td>{timeAgo(a.createdAt)}</td></tr>)}
        </Table>
      </Section>
    </div>
  );
}

export default function Content() {
  const { t } = useI18n();
  const can = useCan();
  const toast = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "ads";
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [remove, setRemove] = useState<Item | null>(null);
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const list = useList<{ items: Item[]; total: number; page: number; limit: number }>(["admin-content"], "/admin/content", tab === "failed" ? { type: "ads" } : { type: tab, q: dq, status, page });
  const delMut = useMutation({
    mutationFn: () => del(`/admin/content/${tab}/${remove!.id}`, { reason }),
    onSuccess: () => { setRemove(null); setReason(""); toast("success", t("Removed. The owner was notified.")); void qc.invalidateQueries({ queryKey: ["admin-content"] }); },
  });
  const switchTab = (v: Tab) => { setParams({ tab: v }); setStatus(""); setPage(1); };
  return (
    <div className="space-y-4">
      <div><h1 className="text-[26px] font-extrabold tracking-[-0.03em]">{t("Projects & content")}</h1><p className="text-sm muted">{t("Review user content and remove what is inappropriate or invalid. Owners are told the reason. Sales data and private chats are not shown.")}</p></div>
      <div className="overflow-x-auto"><Tabs value={tab} onChange={switchTab} tabs={[{ value: "ads", label: t("Advertisements") }, { value: "images", label: t("Uploaded images") }, { value: "forecasts", label: t("Demand forecasts") }, { value: "saved", label: t("Saved projects") }, { value: "failed", label: t("Failed tasks") }]} /></div>
      {tab === "failed" ? <Failed /> : (
        <Section title={t("Content")}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t("Title or owner email")} className="pl-9" /></div>
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={STATUS_OPTIONS[tab].map((o) => ({ value: o.value, label: t(o.label) }))} className="sm:w-56" />
          </div>
          {list.error && <ErrorAlert error={list.error} />}
          <Table head={["", t("Title"), t("Type"), t("Status"), t("Owner"), t("Created"), ""]} empty={list.data?.items.length === 0}>
            {(list.data?.items ?? []).map((i) => (
              <tr key={i.id}>
                <td className="w-14">{i.imageUrl ? <button type="button" onClick={() => setPreview(i.imageUrl!)}><img src={i.imageUrl} alt="" loading="lazy" className="h-10 w-10 rounded-lg object-cover" /></button> : null}</td>
                <td className="max-w-[240px]"><p className="truncate font-medium">{i.title}</p>{i.error && <p className="truncate text-xs text-rose-600">{i.error}</p>}{i.size !== undefined && <p className="text-xs muted">{fmtBytes(i.size)} · {i.width}×{i.height}</p>}{i.areas && <p className="text-xs muted">{i.areas.join(", ")}</p>}</td>
                <td>{t(i.kind)}</td>
                <td>{i.status && <Badge tone={i.status === "failed" || i.status === "no_data" ? "red" : i.status === "succeeded" || i.status === "completed" ? "green" : "slate"}>{t(i.status)}</Badge>}</td>
                <td className="text-xs">{i.owner}</td>
                <td title={fmtDateTime(i.createdAt)}>{timeAgo(i.createdAt)}</td>
                <td>{can("content.moderate") && <Button size="sm" variant="ghost" aria-label={t("Remove")} onClick={() => setRemove(i)}><Trash2 className="h-4 w-4" /></Button>}</td>
              </tr>
            ))}
          </Table>
          {list.data && <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />}
        </Section>
      )}
      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title={t("Preview")} wide>{preview && <img src={preview} alt="" className="mx-auto max-h-[70vh] rounded-xl" />}</Modal>
      <Modal open={Boolean(remove)} onClose={() => { setRemove(null); delMut.reset(); }} title={t("Remove content")}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); delMut.mutate(); }}>
          <p className="text-sm">«{remove?.title}» · {remove?.owner}</p>
          <Field label={t("Reason (the owner is told)")}><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required /></Field>
          {delMut.error && <ErrorAlert error={delMut.error} />}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setRemove(null)}>{t("Cancel")}</Button><Button type="submit" variant="danger" loading={delMut.isPending} disabled={reason.trim().length < 3}>{t("Remove")}</Button></div>
        </form>
      </Modal>
    </div>
  );
}
