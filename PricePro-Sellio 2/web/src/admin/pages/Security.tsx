import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, ShieldAlert, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorAlert } from "../../components/shared";
import { Alert, Badge, Button, Field, Input, Select, Tabs, useToast } from "../../components/ui";
import { get, put } from "../../lib/api";
import { fmtDateTime, timeAgo } from "../../lib/format";
import { useDebounced } from "../../lib/hooks";
import { useI18n } from "../../lib/i18n";
import { ConfirmWithPassword, Pager, ROLE_LABEL, Section, Table, useCan, useList, type Role } from "../ui";

type Admins = { items: { userId: string; email: string; name: string; role: Role; fromEnv: boolean; twoFactor: boolean; since: string }[]; envSuperAdmins: string[]; roles: Record<Role, string[]>; permissions: string[] };

function AdminsTab() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-admins"], queryFn: () => get<Admins>("/admin/admins") });
  const [change, setChange] = useState<{ email: string; role: Role | null } | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("moderator");
  const save = useMutation({
    mutationFn: (password: string) => put("/admin/admins", { ...change!, password }),
    onSuccess: () => { setChange(null); setEmail(""); toast("success", t("Saved")); void qc.invalidateQueries({ queryKey: ["admin-admins"] }); },
  });
  if (q.error) return <ErrorAlert error={q.error} />;
  const d = q.data;
  return (
    <div className="space-y-5">
      <Section title={t("Add an administrator")}>
        <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); setChange({ email: email.trim(), role }); }}>
          <div className="flex-1"><Field label={t("Email of a registered user")}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field></div>
          <Field label={t("Role")}><Select value={role} onChange={(e) => setRole(e.target.value as Role)} options={(["moderator", "admin", "super_admin"] as Role[]).map((r) => ({ value: r, label: t(ROLE_LABEL[r]) }))} /></Field>
          <Button type="submit" icon={<UserPlus className="h-4 w-4" />}>{t("Give role")}</Button>
        </form>
      </Section>
      <Section title={t("Administrators")}>
        <Table head={[t("Person"), t("Role"), t("Two-factor"), t("Since"), ""]} empty={d?.items.length === 0 && !d.envSuperAdmins.length}>
          {(d?.items ?? []).map((a) => (
            <tr key={a.userId}>
              <td><Link to={`/admin/users/${a.userId}`} className="font-medium hover:underline">{a.name}</Link><span className="block text-xs muted">{a.email}</span></td>
              <td><Badge tone="violet">{t(ROLE_LABEL[a.role])}</Badge>{a.fromEnv && <span className="block text-xs muted">SUPER_ADMIN_EMAILS</span>}</td>
              <td>{a.twoFactor ? <Badge tone="green">{t("On")}</Badge> : <Badge tone="amber">{t("Off")}</Badge>}</td>
              <td>{fmtDateTime(a.since)}</td>
              <td>{!a.fromEnv && (
                <div className="flex gap-1">
                  <Select className="w-auto py-1 text-xs" value={a.role} aria-label={t("Change role")} onChange={(e) => setChange({ email: a.email, role: e.target.value as Role })} options={(["moderator", "admin", "super_admin"] as Role[]).map((r) => ({ value: r, label: t(ROLE_LABEL[r]) }))} />
                  <Button size="sm" variant="ghost" onClick={() => setChange({ email: a.email, role: null })}>{t("Remove role")}</Button>
                </div>
              )}</td>
            </tr>
          ))}
          {(d?.envSuperAdmins ?? []).map((e) => <tr key={e}><td className="text-xs">{e}<span className="block muted">{t("Not registered yet")}</span></td><td><Badge tone="violet">{t("Super Admin")}</Badge><span className="block text-xs muted">SUPER_ADMIN_EMAILS</span></td><td>—</td><td>—</td><td /></tr>)}
        </Table>
      </Section>
      {d && (
        <Section title={t("What each role can do")}>
          <Table head={[t("Permission"), ...(["super_admin", "admin", "moderator"] as Role[]).map((r) => t(ROLE_LABEL[r]))]}>
            {d.permissions.map((p) => <tr key={p}><td className="font-mono text-xs">{p}</td>{(["super_admin", "admin", "moderator"] as Role[]).map((r) => <td key={r}>{d.roles[r].includes(p) ? "✓" : <span className="muted">—</span>}</td>)}</tr>)}
          </Table>
        </Section>
      )}
      {change && (
        <ConfirmWithPassword open title={change.role ? t("Give role") : t("Remove role")} confirmLabel={t("Confirm")} danger={!change.role || change.role === "super_admin"}
          text={change.role ? t("{email} will become {role}.", { email: change.email, role: t(ROLE_LABEL[change.role]) }) : t("{email} will lose admin access.", { email: change.email })}
          error={save.error} loading={save.isPending} onConfirm={(p) => save.mutate(p)} onClose={() => { setChange(null); save.reset(); }} />
      )}
    </div>
  );
}

function AuditTab() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const list = useList<{ items: { id: string; admin: string; action: string; targetType: string | null; targetId: string | null; summary: string; details: string | null; ip: string | null; createdAt: string }[]; total: number; page: number; limit: number }>(["admin-audit"], "/admin/audit", { q: dq, page });
  return (
    <Section title={t("Audit log")}>
      <p className="text-xs muted">{t("Every administrative action is recorded here and cannot be edited.")}</p>
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t("Admin email, text or object ID")} className="pl-9" /></div>
      {list.error && <ErrorAlert error={list.error} />}
      <Table head={[t("When"), t("Admin"), t("Action"), t("Summary"), "IP"]} empty={list.data?.items.length === 0}>
        {(list.data?.items ?? []).flatMap((a) => [
          <tr key={a.id} className="cursor-pointer" onClick={() => setOpen(open === a.id ? null : a.id)}>
            <td title={fmtDateTime(a.createdAt)}>{timeAgo(a.createdAt)}</td><td className="text-xs">{a.admin}</td><td className="font-mono text-xs">{a.action}</td><td className="max-w-[360px]">{a.summary}</td><td className="text-xs">{a.ip ?? "—"}</td>
          </tr>,
          open === a.id && a.details ? <tr key={`${a.id}-d`}><td colSpan={5}><pre className="max-h-64 overflow-auto rounded-lg bg-slate-100 p-2 text-xs dark:bg-slate-800">{(() => { try { return JSON.stringify(JSON.parse(a.details), null, 2); } catch { return a.details; } })()}</pre></td></tr> : null,
        ])}
      </Table>
      {list.data && <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />}
    </Section>
  );
}

function LoginsTab() {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const [result, setResult] = useState("all");
  const [page, setPage] = useState(1);
  const list = useList<{ items: { id: string; email: string; userId: string | null; success: boolean; reason: string | null; ip: string | null; device: string | null; createdAt: string }[]; total: number; page: number; limit: number; suspicious: { byIp: { ip: string | null; failures: number }[]; byEmail: { email: string; failures: number }[] } }>(["admin-logins"], "/admin/logins", { q: dq, result, page });
  const s = list.data?.suspicious;
  return (
    <div className="space-y-4">
      {s && (s.byIp.length > 0 || s.byEmail.length > 0) && (
        <Alert tone="warning" title={t("Many failed logins in the last 24 hours")}>
          <div className="mt-1 flex flex-wrap gap-2">
            {s.byIp.map((x) => <button key={x.ip ?? "?"} type="button" onClick={() => { setQ(x.ip ?? ""); setResult("failed"); }}><Badge tone="red"><ShieldAlert className="h-3 w-3" />IP {x.ip ?? "?"} · {x.failures}</Badge></button>)}
            {s.byEmail.map((x) => <button key={x.email} type="button" onClick={() => { setQ(x.email); setResult("failed"); }}><Badge tone="amber">{x.email} · {x.failures}</Badge></button>)}
          </div>
        </Alert>
      )}
      <Section title={t("Login history")}>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t("Email or IP address")} className="flex-1" />
          <Select value={result} onChange={(e) => { setResult(e.target.value); setPage(1); }} className="sm:w-48" options={[{ value: "all", label: t("All") }, { value: "failed", label: t("Failed") }, { value: "success", label: t("Successful") }]} />
        </div>
        {list.error && <ErrorAlert error={list.error} />}
        <Table head={[t("When"), t("Email"), t("Result"), "IP", t("Device")]} empty={list.data?.items.length === 0}>
          {(list.data?.items ?? []).map((l) => (
            <tr key={l.id}>
              <td title={fmtDateTime(l.createdAt)}>{timeAgo(l.createdAt)}</td>
              <td className="text-xs">{l.userId ? <Link to={`/admin/users/${l.userId}`} className="hover:underline">{l.email}</Link> : l.email}</td>
              <td>{l.success ? <Badge tone="green">{t("Success")}</Badge> : <Badge tone="red">{t(l.reason ?? "Failed")}</Badge>}</td>
              <td className="text-xs">{l.ip ?? "—"}</td>
              <td className="max-w-[260px] truncate text-xs muted" title={l.device ?? ""}>{l.device ?? "—"}</td>
            </tr>
          ))}
        </Table>
        {list.data && <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={setPage} />}
      </Section>
    </div>
  );
}

export default function Security() {
  const { t } = useI18n();
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as "admins" | "audit" | "logins") || (can("admins.manage") ? "admins" : "audit");
  const tabs = [...(can("admins.manage") ? [{ value: "admins" as const, label: t("Administrators") }] : []), { value: "audit" as const, label: t("Audit log") }, { value: "logins" as const, label: t("Login history") }];
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">{t("Admins & audit")}</h1><p className="text-sm muted">{t("Roles, the record of administrative actions and login monitoring.")}</p></div>
      <div className="overflow-x-auto"><Tabs value={tab} onChange={(v) => setParams({ tab: v })} tabs={tabs} /></div>
      {tab === "admins" && can("admins.manage") ? <AdminsTab /> : tab === "logins" ? <LoginsTab /> : <AuditTab />}
    </div>
  );
}
