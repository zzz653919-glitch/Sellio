import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { ErrorAlert } from "../../components/shared";
import { Badge, Button, ConfirmDialog, Field, Input, Select, Toggle, useToast } from "../../components/ui";
import { del, post } from "../../lib/api";
import { fmtDateTime, fmtNumber } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { Pager, Section, Table, useList } from "../ui";

type Item = { id: string; title: string; body: string; link: string | null; audience: "all" | "selected"; selectedCount: number; publishAt: string; deliveredAt: string | null; recipients: number | null; read: number; createdBy: string | null; status: "sent" | "scheduled" };

const EMPTY = { title: "", body: "", link: "", audience: "all", emails: "", schedule: false, publishAt: "" };

export default function Notifications() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [confirmSend, setConfirmSend] = useState(false);
  const [remove, setRemove] = useState<Item | null>(null);
  const list = useList<{ items: Item[]; total: number; page: number; limit: number }>(["admin-announcements"], "/admin/announcements", { page });
  const emails = f.emails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
  const create = useMutation({
    mutationFn: () => post<{ recipients: number | null; status: string }>("/admin/announcements", {
      title: f.title, body: f.body, link: f.link, audience: f.audience, emails: f.audience === "selected" ? emails : [],
      publishAt: f.schedule && f.publishAt ? new Date(f.publishAt).toISOString() : undefined,
    }),
    onSuccess: (r) => {
      setConfirmSend(false); setF(EMPTY);
      toast("success", r.status === "sent" ? t("Sent to {n} users.", { n: fmtNumber(r.recipients ?? 0) }) : t("Scheduled."));
      void qc.invalidateQueries({ queryKey: ["admin-announcements"] });
    },
    onError: () => setConfirmSend(false),
  });
  const delMut = useMutation({
    mutationFn: () => del(`/admin/announcements/${remove!.id}`),
    onSuccess: () => { setRemove(null); toast("success", t("Deleted")); void qc.invalidateQueries({ queryKey: ["admin-announcements"] }); },
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const valid = f.title.trim().length >= 2 && f.body.trim().length >= 2 && (f.audience === "all" || emails.length > 0) && (!f.schedule || Boolean(f.publishAt));
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">{t("Notifications")}</h1><p className="text-sm muted">{t("Send announcements to users. They appear in the bell menu inside Vendora.")}</p></div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,420px)_1fr]">
        <Section title={t("New announcement")}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setConfirmSend(true); }}>
            <Field label={t("Title")}><Input value={f.title} onChange={set("title")} maxLength={120} required /></Field>
            <Field label={t("Message")}><textarea className="input min-h-28" value={f.body} onChange={set("body")} maxLength={1000} required /></Field>
            <Field label={t("Link inside the site (optional)")} hint={t("For example /ads or /pricing")}><Input value={f.link} onChange={set("link")} placeholder="/pricing" maxLength={200} /></Field>
            <Field label={t("Recipients")}><Select value={f.audience} onChange={set("audience")} options={[{ value: "all", label: t("All users") }, { value: "selected", label: t("Selected users") }]} /></Field>
            {f.audience === "selected" && <Field label={t("User emails")} hint={t("{n} emails", { n: emails.length })}><textarea className="input min-h-20" value={f.emails} onChange={set("emails")} placeholder="ali@example.com, vali@example.com" /></Field>}
            <Toggle checked={f.schedule} onChange={(v) => setF((s) => ({ ...s, schedule: v }))} label={t("Schedule for later")} />
            {f.schedule && <Field label={t("Publish at")}><Input type="datetime-local" value={f.publishAt} onChange={set("publishAt")} min={new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)} /></Field>}
            {create.error && <ErrorAlert error={create.error} />}
            <Button type="submit" icon={<Send className="h-4 w-4" />} disabled={!valid}>{f.schedule ? t("Schedule") : t("Send now")}</Button>
          </form>
        </Section>
        <Section title={t("History")}>
          {list.error && <ErrorAlert error={list.error} />}
          <Table head={[t("Announcement"), t("Recipients"), t("Status"), t("Read"), t("Date"), ""]} empty={list.data?.items.length === 0}>
            {(list.data?.items ?? []).map((a) => (
              <tr key={a.id}>
                <td className="max-w-[280px]"><p className="font-medium">{a.title}</p><p className="line-clamp-2 text-xs muted">{a.body}</p>{a.createdBy && <p className="text-xs muted">{a.createdBy}</p>}</td>
                <td>{a.audience === "all" ? t("All users") : t("{n} selected", { n: a.selectedCount })}{a.recipients !== null && <span className="block text-xs muted">{t("{n} delivered", { n: fmtNumber(a.recipients) })}</span>}</td>
                <td><Badge tone={a.status === "sent" ? "green" : "amber"}>{a.status === "sent" ? t("Sent") : t("Scheduled")}</Badge></td>
                <td>{a.recipients ? `${fmtNumber(a.read)} (${Math.round((a.read / a.recipients) * 100)}%)` : "—"}</td>
                <td>{fmtDateTime(a.deliveredAt ?? a.publishAt)}</td>
                <td><Button size="sm" variant="ghost" aria-label={t("Delete")} onClick={() => setRemove(a)}><Trash2 className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </Table>
          {list.data && <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />}
        </Section>
      </div>
      <ConfirmDialog open={confirmSend} onClose={() => setConfirmSend(false)} loading={create.isPending} onConfirm={() => create.mutate()}
        title={f.schedule ? t("Schedule this announcement?") : t("Send this announcement?")} confirmLabel={f.schedule ? t("Schedule") : t("Send now")}
        text={f.audience === "all" ? t("Every registered user will receive it.") : t("{n} selected users will receive it.", { n: emails.length })} />
      <ConfirmDialog open={Boolean(remove)} onClose={() => setRemove(null)} loading={delMut.isPending} onConfirm={() => delMut.mutate()}
        title={t("Delete announcement")} confirmLabel={t("Delete")} text={t("It will also be removed from the notifications of users who already received it.")} />
    </div>
  );
}
