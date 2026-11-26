import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, LifeBuoy, Plus, Send } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorAlert } from "../components/shared";
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, PageLoader, Select, cx, useToast } from "../components/ui";
import { get, post } from "../lib/api";
import { fmtDateTime, timeAgo } from "../lib/format";
import { useI18n } from "../lib/i18n";

type Ticket = { id: string; subject: string; category: string; status: "open" | "pending" | "resolved"; createdAt: string; lastMessageAt: string; staffReplies: number };
const CATEGORY: Record<string, string> = { account: "Account", billing: "Billing and plan", ai_studio: "AI Product Studio", forecast: "Demand forecast", ads: "Advertising", bug: "Something is broken", other: "Other" };
const STATUS: Record<Ticket["status"], { label: string; tone: "amber" | "brand" | "green" }> = {
  open: { label: "Waiting for support", tone: "amber" }, pending: { label: "Support replied", tone: "brand" }, resolved: { label: "Resolved", tone: "green" },
};

function NewTicket({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const [f, setF] = useState({ subject: "", category: "other", body: "" });
  const create = useMutation({ mutationFn: () => post<{ id: string }>("/support", f), onSuccess: (r) => { setF({ subject: "", category: "other", body: "" }); onCreated(r.id); } });
  return (
    <Modal open={open} onClose={onClose} title={t("New support request")}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <Field label={t("Subject")}><Input value={f.subject} onChange={(e) => setF((s) => ({ ...s, subject: e.target.value }))} maxLength={150} required /></Field>
        <Field label={t("Topic")}><Select value={f.category} onChange={(e) => setF((s) => ({ ...s, category: e.target.value }))} options={Object.entries(CATEGORY).map(([value, label]) => ({ value, label: t(label) }))} /></Field>
        <Field label={t("Describe the problem")} hint={t("What did you do, what happened and what did you expect?")}><textarea className="input min-h-32" value={f.body} onChange={(e) => setF((s) => ({ ...s, body: e.target.value }))} maxLength={4000} required /></Field>
        {create.error && <ErrorAlert error={create.error} />}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>{t("Cancel")}</Button><Button type="submit" icon={<Send className="h-4 w-4" />} loading={create.isPending} disabled={f.subject.trim().length < 3 || f.body.trim().length < 5}>{t("Send")}</Button></div>
      </form>
    </Modal>
  );
}

function Thread({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const q = useQuery({ queryKey: ["support", id], queryFn: () => get<{ ticket: Ticket; messages: { id: string; role: "user" | "staff"; body: string; author: string | null; createdAt: string }[] }>(`/support/${id}`), refetchInterval: 30_000 });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["support"] }); };
  const reply = useMutation({ mutationFn: () => post(`/support/${id}/reply`, { body }), onSuccess: () => { setBody(""); refresh(); } });
  const close = useMutation({ mutationFn: () => post(`/support/${id}/close`), onSuccess: () => { toast("success", t("Request closed")); refresh(); } });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const { ticket, messages } = q.data!;
  return (
    <div className="space-y-4">
      <button type="button" className="inline-flex items-center gap-1 text-sm muted hover:underline" onClick={onBack}><ArrowLeft className="h-4 w-4" />{t("All requests")}</button>
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-semibold">{ticket.subject}</h2><p className="text-xs muted">{t(CATEGORY[ticket.category] ?? ticket.category)} · {fmtDateTime(ticket.createdAt)}</p></div>
          <Badge tone={STATUS[ticket.status].tone}>{t(STATUS[ticket.status].label)}</Badge>
        </div>
        <div className="space-y-3">
          {messages.map((m) => (
            <div key={m.id} className={cx("max-w-[85%] rounded-2xl p-3 text-sm", m.role === "user" ? "ml-auto bg-brand-50 dark:bg-brand-500/15" : "bg-slate-100 dark:bg-slate-800")}>
              <p className="mb-1 text-xs font-semibold">{m.role === "user" ? t("You") : `${m.author ?? ""} · ${t("Vendora support")}`} <span className="font-normal muted">· {fmtDateTime(m.createdAt)}</span></p>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          ))}
        </div>
        <form className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800" onSubmit={(e) => { e.preventDefault(); reply.mutate(); }}>
          <textarea className="input min-h-24" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} placeholder={ticket.status === "resolved" ? t("Write here to open the request again") : t("Write a message")} aria-label={t("Message")} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" icon={<Send className="h-4 w-4" />} loading={reply.isPending} disabled={!body.trim()}>{t("Send")}</Button>
            {ticket.status !== "resolved" && <Button type="button" variant="ghost" loading={close.isPending} onClick={() => close.mutate()}>{t("My problem is solved")}</Button>}
          </div>
          {(reply.error || close.error) && <ErrorAlert error={reply.error ?? close.error} />}
        </form>
      </Card>
    </div>
  );
}

export default function Support() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const ticketId = params.get("ticket");
  const q = useQuery({ queryKey: ["support"], queryFn: () => get<{ items: Ticket[] }>("/support") });
  return (
    <div>
      <PageHeader icon={<LifeBuoy className="h-6 w-6" />} title={t("Support")} subtitle={t("Ask the Vendora team for help. You will get a notification when we reply.")}
        actions={!ticketId && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>{t("New request")}</Button>} />
      {ticketId ? <Thread key={ticketId} id={ticketId} onBack={() => setParams({})} /> : q.isLoading ? <PageLoader /> : q.error ? <ErrorAlert error={q.error} /> : q.data!.items.length === 0 ? (
        <EmptyState icon={<LifeBuoy className="h-6 w-6" />} title={t("No requests yet")} text={t("If something does not work or you have a question, write to us.")} action={<Button onClick={() => setCreating(true)}>{t("New request")}</Button>} />
      ) : (
        <Card className="divide-y divide-slate-100 dark:divide-slate-800">
          {q.data!.items.map((tk) => (
            <button key={tk.id} type="button" onClick={() => setParams({ ticket: tk.id })} className="flex w-full flex-wrap items-center gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{tk.subject}</p><p className="text-xs muted">{t(CATEGORY[tk.category] ?? tk.category)} · {timeAgo(tk.lastMessageAt)}</p></div>
              <Badge tone={STATUS[tk.status].tone}>{t(STATUS[tk.status].label)}</Badge>
            </button>
          ))}
        </Card>
      )}
      <NewTicket open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setParams({ ticket: id }); void q.refetch(); }} />
    </div>
  );
}
