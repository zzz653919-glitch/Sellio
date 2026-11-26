import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, CheckCircle2, Flag, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorAlert, UsageMeter } from "../../components/shared";
import { Alert, Badge, Button, Field, Input, Modal, PageLoader, Select, useToast } from "../../components/ui";
import { del, get, post } from "../../lib/api";
import { fmtDateTime, timeAgo } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { money } from "./Dashboard";
import { ConfirmWithPassword, ROLE_LABEL, Section, Stat, Table, useCan, type Role } from "../ui";
import { planTone, type Usage } from "../../lib/types";

type Detail = {
  user: { id: string; email: string; name: string; plan: string; status: string; verified: boolean; createdAt: string; role: Role | null; lastActive: string | null; suspendedReason: string | null; planSource: string | null; language: string | null };
  counts: Record<string, number>;
  usage: Usage;
  usageHistory: { id: string; service: string; refId: string | null; status: string; plan: string; period: string; createdAt: string }[];
  subscription: { plan: string; status: string; provider: string | null; periodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
  subscriptionEvents: { id: string; type: string; plan: string | null; amountCents: number | null; currency: string | null; createdAt: string }[];
  activity: { id: string; type: string; service: string; title: string; success: boolean; createdAt: string }[];
  projects: { id: string; type: string; title: string; createdAt: string }[];
  logins: { success: boolean; reason: string | null; ip: string | null; device: string | null; createdAt: string }[];
  sessions: { active: number; lastSeen: string | null };
  flags: { id: string; reason: string; createdAt: string; resolvedAt: string | null; flaggedBy: string | null }[];
};

export default function UserDetail() {
  const { t, tr } = useI18n();
  const { id } = useParams();
  const can = useCan();
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-user", id], queryFn: () => get<Detail>(`/admin/users/${id}`) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin-user", id] }); void qc.invalidateQueries({ queryKey: ["admin-users"] }); };
  const [modal, setModal] = useState<null | "plan" | "suspend" | "delete" | "flag">(null);
  const [plan, setPlan] = useState("pro");
  const [reason, setReason] = useState("");
  const act = useMutation({
    mutationFn: async ({ kind, password }: { kind: string; password?: string }) => {
      if (kind === "plan") return post<{ warning: string | null }>(`/admin/users/${id}/plan`, { plan, password });
      if (kind === "suspend") return post(`/admin/users/${id}/suspend`, { reason });
      if (kind === "reactivate") return post(`/admin/users/${id}/reactivate`, {});
      if (kind === "flag") return post(`/admin/users/${id}/flag`, { reason });
      return del(`/admin/users/${id}`, { password, confirmEmail: q.data?.user.email });
    },
    onSuccess: (r, v) => {
      setModal(null); setReason("");
      if (v.kind === "delete") { toast("success", t("The account was deleted.")); nav("/admin/users"); return; }
      const w = (r as { warning?: string | null } | undefined)?.warning;
      toast(w ? "info" : "success", w ? t(w) : t("Saved"));
      refresh();
    },
    onError: () => {},
  });
  const resolve = useMutation({ mutationFn: (flagId: string) => post(`/admin/flags/${flagId}/resolve`, {}), onSuccess: refresh });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const d = q.data!;
  const u = d.user;
  return (
    <div className="space-y-5">
      <Link to="/admin/users" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"><ArrowLeft className="h-4 w-4" />{t("Users")}</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em]">{u.name}</h1>
          <p className="text-sm muted">{u.email} · ID {u.id}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={planTone(u.plan)}>{u.plan}{u.planSource === "admin" && ` · ${t("assigned by admin")}`}</Badge>
            <Badge tone={u.status === "active" ? "green" : "red"}>{t(u.status === "active" ? "Active" : "Suspended")}</Badge>
            <Badge tone={u.verified ? "green" : "amber"}>{t(u.verified ? "Email verified" : "Email not verified")}</Badge>
            {u.role && <Badge tone="brand">{t(ROLE_LABEL[u.role])}</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can("users.manage") && <Button size="sm" variant="secondary" onClick={() => { setPlan(u.plan === "free" ? "pro" : "free"); setModal("plan"); }}>{t("Change plan")}</Button>}
          {can("users.manage") && (u.status === "active"
            ? <Button size="sm" variant="secondary" icon={<Ban className="h-4 w-4" />} onClick={() => setModal("suspend")}>{t("Suspend")}</Button>
            : <Button size="sm" variant="secondary" icon={<Undo2 className="h-4 w-4" />} loading={act.isPending} onClick={() => act.mutate({ kind: "reactivate" })}>{t("Reactivate")}</Button>)}
          {can("users.flag") && <Button size="sm" variant="secondary" icon={<Flag className="h-4 w-4" />} onClick={() => setModal("flag")}>{t("Report")}</Button>}
          {can("users.delete") && <Button size="sm" variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setModal("delete")}>{t("Delete")}</Button>}
        </div>
      </div>
      {u.status === "suspended" && <Alert tone="error" title={t("Suspended")}>{u.suspendedReason}</Alert>}
      {act.error && !modal && <ErrorAlert error={act.error} />}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label={t("Projects")} value={d.counts.projects} tone="slate" />
        <Stat label={t("Ads")} value={d.counts.generations} tone="slate" />
        <Stat label={t("Forecasts")} value={d.counts.analyses} tone="slate" />
        <Stat label={t("Campaigns")} value={d.counts.campaigns} tone="slate" />
        <Stat label={t("Support requests")} value={d.counts.tickets} tone="slate" />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section title={t("Account")}>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="muted">{t("Registered")}</dt><dd>{fmtDateTime(u.createdAt)}</dd>
            <dt className="muted">{t("Last active")}</dt><dd>{u.lastActive ? fmtDateTime(u.lastActive) : "—"}</dd>
            <dt className="muted">{t("Active sessions")}</dt><dd>{d.sessions.active}</dd>
            <dt className="muted">{t("Language")}</dt><dd>{u.language ?? "—"}</dd>
          </dl>
        </Section>
        <Section title={t("Subscription and usage this month")}>
          {d.subscription && <p className="text-sm">{t("Plan")}: <b>{d.subscription.plan}</b> · {t("Status")}: {d.subscription.status} · {t("Source")}: {d.subscription.provider ?? "—"}{d.subscription.periodEnd && <> · {t("Period ends")}: {fmtDateTime(d.subscription.periodEnd)}</>}</p>}
          <UsageMeter usage={d.usage} />
        </Section>
        <Section title={t("Request history")}>
          <Table head={[t("When"), t("Service"), t("Status"), t("Plan")]} empty={!d.usageHistory.length}>
            {d.usageHistory.map((e) => (
              <tr key={e.id}>
                <td>{fmtDateTime(e.createdAt)}</td>
                <td>{t(e.service === "generation" ? "AI ad" : "Demand forecast")}</td>
                <td><Badge tone={e.status === "consumed" ? "green" : "amber"}>{t(e.status === "consumed" ? "Counted" : "In progress")}</Badge></td>
                <td>{e.plan} · {t(e.period === "hours" ? "rolling hours" : e.period === "day" ? "per day" : "per month")}</td>
              </tr>
            ))}
          </Table>
        </Section>
        <Section title={t("Activity")}>
          <Table head={[t("Action"), t("Service"), t("When")]} empty={!d.activity.length}>
            {d.activity.map((a) => <tr key={a.id}><td>{a.success ? "" : "⚠ "}{tr(a.title)}</td><td>{a.service}</td><td>{timeAgo(a.createdAt)}</td></tr>)}
          </Table>
        </Section>
        <Section title={t("Project history")}>
          <Table head={[t("Project"), t("Type"), t("Created")]} empty={!d.projects.length}>
            {d.projects.map((p) => <tr key={p.id}><td className="max-w-[220px] truncate">{p.title}</td><td>{t(p.type)}</td><td>{timeAgo(p.createdAt)}</td></tr>)}
          </Table>
        </Section>
        <Section title={t("Subscription history")}>
          <Table head={[t("Event"), t("Plan"), t("Amount"), t("Date")]} empty={!d.subscriptionEvents.length}>
            {d.subscriptionEvents.map((e) => <tr key={e.id}><td>{t(e.type)}</td><td>{e.plan ?? "—"}</td><td>{money(e.amountCents, e.currency)}</td><td>{fmtDateTime(e.createdAt)}</td></tr>)}
          </Table>
        </Section>
        <Section title={t("Sign-in history")}>
          <Table head={[t("Result"), "IP", t("Device"), t("When")]} empty={!d.logins.length}>
            {d.logins.map((l, i) => <tr key={i}><td><Badge tone={l.success ? "green" : "red"}>{l.success ? t("Success") : t(l.reason ?? "Failed")}</Badge></td><td className="text-xs">{l.ip ?? "—"}</td><td className="max-w-[200px] truncate text-xs">{l.device ?? "—"}</td><td>{timeAgo(l.createdAt)}</td></tr>)}
          </Table>
        </Section>
        {d.flags.length > 0 && (
          <Section title={t("Suspicious-activity reports")}>
            {d.flags.map((f) => (
              <div key={f.id} className="flex items-start gap-2 rounded-lg border border-slate-100 p-2 text-sm dark:border-slate-800">
                <Flag className="mt-0.5 h-4 w-4 text-amber-500" />
                <div className="flex-1"><p>{f.reason}</p><p className="text-xs muted">{f.flaggedBy ?? "—"} · {fmtDateTime(f.createdAt)}{f.resolvedAt && ` · ${t("resolved")}`}</p></div>
                {!f.resolvedAt && can("users.manage") && <Button size="sm" variant="ghost" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => resolve.mutate(f.id)}>{t("Resolve")}</Button>}
              </div>
            ))}
          </Section>
        )}
      </div>

      <ConfirmWithPassword open={modal === "plan"} title={t("Change plan")} text={t("No payment is created. The change is marked as assigned by an administrator and written to the audit log.")} confirmLabel={t("Save")} error={act.error} loading={act.isPending}
        onConfirm={(password) => act.mutate({ kind: "plan", password })} onClose={() => { setModal(null); act.reset(); }}>
        <Field label={t("New plan")}><Select value={plan} onChange={(e) => setPlan(e.target.value)} options={[{ value: "free", label: "Free" }, { value: "pro", label: "Pro" }, { value: "max", label: "Max" }]} /></Field>
      </ConfirmWithPassword>
      <ConfirmWithPassword open={modal === "delete"} title={t("Delete account?")} text={t("All of this user's data is deleted permanently. This cannot be undone.")} confirmLabel={t("Delete")} danger typeToConfirm={u.email} error={act.error} loading={act.isPending}
        onConfirm={(password) => act.mutate({ kind: "delete", password })} onClose={() => { setModal(null); act.reset(); }} />
      <Modal open={modal === "suspend" || modal === "flag"} onClose={() => { setModal(null); act.reset(); }} title={modal === "flag" ? t("Report suspicious activity") : t("Suspend account")}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); act.mutate({ kind: modal! }); }}>
          <p className="text-sm muted">{modal === "flag" ? t("Administrators will see this report on the dashboard.") : t("The user is signed out everywhere and cannot sign in until the account is reactivated.")}</p>
          <Field label={t("Reason")}><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required /></Field>
          {act.error && <ErrorAlert error={act.error} />}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setModal(null)}>{t("Cancel")}</Button><Button type="submit" variant={modal === "suspend" ? "danger" : "primary"} loading={act.isPending} disabled={reason.trim().length < 3}>{modal === "flag" ? t("Report") : t("Suspend")}</Button></div>
        </form>
      </Modal>
    </div>
  );
}
