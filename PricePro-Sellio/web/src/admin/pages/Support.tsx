import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Search, Send } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorAlert } from "../../components/shared";
import { Badge, Button, Input, PageLoader, Select, Tabs, cx, useToast } from "../../components/ui";
import { get, patch, post } from "../../lib/api";
import { fmtDateTime, timeAgo } from "../../lib/format";
import { useDebounced } from "../../lib/hooks";
import { useI18n } from "../../lib/i18n";
import { Pager, Section, Table, useList } from "../ui";

type Ticket = { id: string; subject: string; category: string; status: "open" | "pending" | "resolved"; user: { id: string; email: string; name: string; plan: string }; assignedTo: string | null; assignee: string | null; messages: number; createdAt: string; lastMessageAt: string };
const STATUS_TONE = { open: "red", pending: "amber", resolved: "green" } as const;
export const CATEGORY_LABEL: Record<string, string> = { account: "Account", billing: "Billing and plan", ai_studio: "AI Product Studio", forecast: "Demand forecast", ads: "Advertising", bug: "Something is broken", other: "Other" };
const STATUS_LABEL = { open: "Open", pending: "Waiting for user", resolved: "Resolved" };

function Thread({ id }: { id: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [, setParams] = useSearchParams();
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"open" | "pending" | "resolved">("pending");
  const q = useQuery({ queryKey: ["admin-ticket", id], queryFn: () => get<{ ticket: Ticket; messages: { id: string; role: "user" | "staff"; body: string; author: string; createdAt: string }[]; otherRequests: { id: string; subject: string; status: string; createdAt: string }[] }>(`/admin/support/${id}`) });
  const staff = useQuery({ queryKey: ["admin-staff"], queryFn: () => get<{ items: { id: string; name: string; email: string; role: string }[] }>("/admin/staff"), staleTime: 60_000 });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin-ticket", id] }); void qc.invalidateQueries({ queryKey: ["admin-support"] }); };
  const reply = useMutation({ mutationFn: () => post(`/admin/support/${id}/reply`, { body, status }), onSuccess: () => { setBody(""); toast("success", t("Reply sent. The user was notified.")); refresh(); } });
  const update = useMutation({ mutationFn: (b: { status?: string; assignedTo?: string | null }) => patch(`/admin/support/${id}`, b), onSuccess: () => { toast("success", t("Saved")); refresh(); } });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const { ticket, messages, otherRequests } = q.data!;
  return (
    <div className="space-y-4">
      <button type="button" className="inline-flex items-center gap-1 text-sm muted hover:underline" onClick={() => setParams({})}><ArrowLeft className="h-4 w-4" />{t("All requests")}</button>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
        <Section title={ticket.subject} actions={<Badge tone={STATUS_TONE[ticket.status]}>{t(STATUS_LABEL[ticket.status])}</Badge>}>
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={cx("max-w-[85%] rounded-2xl p-3 text-sm", m.role === "staff" ? "ml-auto bg-brand-50 dark:bg-brand-500/15" : "bg-slate-100 dark:bg-slate-800")}>
                <p className="mb-1 text-xs font-semibold">{m.role === "staff" ? `${m.author} · ${t("Support")}` : m.author} <span className="font-normal muted">· {fmtDateTime(m.createdAt)}</span></p>
                <p className="whitespace-pre-wrap">{m.body}</p>
              </div>
            ))}
          </div>
          <form className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800" onSubmit={(e) => { e.preventDefault(); reply.mutate(); }}>
            <textarea className="input min-h-24" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} placeholder={t("Write a reply to the user")} aria-label={t("Reply")} />
            <div className="flex flex-wrap items-center gap-2">
              <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-auto" aria-label={t("Status after reply")}
                options={[{ value: "pending", label: t("Reply and wait for user") }, { value: "resolved", label: t("Reply and mark resolved") }, { value: "open", label: t("Reply and keep open") }]} />
              <Button type="submit" icon={<Send className="h-4 w-4" />} loading={reply.isPending} disabled={!body.trim()}>{t("Send reply")}</Button>
            </div>
            {reply.error && <ErrorAlert error={reply.error} />}
          </form>
        </Section>
        <div className="space-y-4">
          <Section title={t("Details")}>
            <dl className="space-y-1.5 text-sm">
              <div><dt className="text-xs muted">{t("User")}</dt><dd><Link to={`/admin/users/${ticket.user.id}`} className="hover:underline">{ticket.user.name}</Link><span className="block text-xs muted">{ticket.user.email} · {ticket.user.plan}</span></dd></div>
              <div><dt className="text-xs muted">{t("Category")}</dt><dd>{t(CATEGORY_LABEL[ticket.category] ?? ticket.category)}</dd></div>
              <div><dt className="text-xs muted">{t("Created")}</dt><dd>{fmtDateTime(ticket.createdAt)}</dd></div>
            </dl>
            <label className="block text-xs muted">{t("Assigned to")}
              <Select className="mt-1" value={ticket.assignedTo ?? ""} disabled={update.isPending} onChange={(e) => update.mutate({ assignedTo: e.target.value || null })}
                options={[{ value: "", label: t("Nobody") }, ...(staff.data?.items ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.email})` }))]} />
            </label>
            <div className="flex flex-wrap gap-2">
              {ticket.status !== "resolved" && <Button size="sm" variant="secondary" loading={update.isPending} onClick={() => update.mutate({ status: "resolved" })}>{t("Mark resolved")}</Button>}
              {ticket.status !== "open" && <Button size="sm" variant="ghost" loading={update.isPending} onClick={() => update.mutate({ status: "open" })}>{t("Reopen")}</Button>}
            </div>
            {update.error && <ErrorAlert error={update.error} />}
          </Section>
          {otherRequests.length > 0 && (
            <Section title={t("Other requests from this user")}>
              <ul className="space-y-1.5 text-sm">{otherRequests.map((o) => <li key={o.id}><button type="button" className="text-left hover:underline" onClick={() => setParams({ ticket: o.id })}>{o.subject}</button><span className="block text-xs muted">{t(STATUS_LABEL[o.status as Ticket["status"]] ?? o.status)} · {timeAgo(o.createdAt)}</span></li>)}</ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Support() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const ticketId = params.get("ticket");
  const [status, setStatus] = useState<"open" | "pending" | "resolved" | "all">("open");
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const list = useList<{ items: Ticket[]; total: number; page: number; limit: number; counts: Record<string, number> }>(["admin-support"], "/admin/support", { status, q: dq, mine: mine ? "1" : undefined, page });
  if (ticketId) return <Thread key={ticketId} id={ticketId} />;
  const c = list.data?.counts ?? {};
  return (
    <div className="space-y-4">
      <div><h1 className="text-[26px] font-extrabold tracking-[-0.03em]">{t("Support")}</h1><p className="text-sm muted">{t("Requests users send from the Support page. Replies reach the user as a notification.")}</p></div>
      <div className="overflow-x-auto"><Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} tabs={[{ value: "open", label: t("Open"), count: c.open ?? 0 }, { value: "pending", label: t("Waiting for user"), count: c.pending ?? 0 }, { value: "resolved", label: t("Resolved"), count: c.resolved ?? 0 }, { value: "all", label: t("All") }]} /></div>
      <Section title={t("Requests")}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t("Subject, user email or request ID")} className="pl-9" /></div>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="accent-brand-600" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} />{t("Assigned to me")}</label>
        </div>
        {list.error && <ErrorAlert error={list.error} />}
        <Table head={[t("Subject"), t("User"), t("Category"), t("Status"), t("Assigned to"), t("Last message")]} empty={list.data?.items.length === 0}>
          {(list.data?.items ?? []).map((tk) => (
            <tr key={tk.id}>
              <td><button type="button" className="text-left font-medium hover:underline" onClick={() => setParams({ ticket: tk.id })}>{tk.subject}</button><span className="block text-xs muted">{t("{n} messages", { n: tk.messages })}</span></td>
              <td className="text-xs">{tk.user.email}</td>
              <td>{t(CATEGORY_LABEL[tk.category] ?? tk.category)}</td>
              <td><Badge tone={STATUS_TONE[tk.status]}>{t(STATUS_LABEL[tk.status])}</Badge></td>
              <td className="text-xs">{tk.assignee ?? "—"}</td>
              <td title={fmtDateTime(tk.lastMessageAt)}>{timeAgo(tk.lastMessageAt)}</td>
            </tr>
          ))}
        </Table>
        {list.data && <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />}
      </Section>
    </div>
  );
}
