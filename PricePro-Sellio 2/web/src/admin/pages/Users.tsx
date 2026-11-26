import { Download, Search } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorAlert } from "../../components/shared";
import { Badge, Button, Input, Select } from "../../components/ui";
import { fmtDateTime, timeAgo } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { useDebounced } from "../../lib/hooks";
import { downloadUrl, Pager, ROLE_LABEL, Section, Table, useCan, useList, type Role } from "../ui";

type Row = { id: string; email: string; name: string; plan: string; status: string; verified: boolean; createdAt: string; role: Role | null; lastActive: string | null; openFlags: number };

export default function UsersPage() {
  const { t } = useI18n();
  const can = useCan();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const dq = useDebounced(q, 300);
  const f = { plan: params.get("plan") ?? "", status: params.get("status") ?? "", role: params.get("role") ?? "", flagged: params.get("flagged") ?? "", verified: params.get("verified") ?? "", sort: params.get("sort") ?? "newest" };
  const page = Number(params.get("page") ?? 1);
  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); if (k !== "page") n.delete("page"); setParams(n); };
  const list = useList<{ items: Row[]; total: number; page: number; limit: number }>(["admin-users"], "/admin/users", { q: dq, ...f, page });
  const qs = new URLSearchParams(Object.entries({ q: dq, ...f }).filter(([, v]) => v)).toString();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">{t("Users")}</h1><p className="text-sm muted">{t("Search by name, email or ID. Passwords and secrets are never shown.")}</p></div>
        {can("users.manage") && <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => downloadUrl(`/admin/users/export?${qs}`)}>{t("Export CSV")}</Button>}
      </div>
      <Section title={t("Filters")}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <div className="relative lg:col-span-2"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={q} onChange={(e) => { setQ(e.target.value); set("page", ""); }} placeholder={t("Name, email or ID")} className="pl-9" /></div>
          <Select value={f.plan} onChange={(e) => set("plan", e.target.value)} options={[{ value: "", label: t("All plans") }, { value: "free", label: "Free" }, { value: "pro", label: "Pro" }]} />
          <Select value={f.status} onChange={(e) => set("status", e.target.value)} options={[{ value: "", label: t("All statuses") }, { value: "active", label: t("Active") }, { value: "suspended", label: t("Suspended") }]} />
          <Select value={f.role} onChange={(e) => set("role", e.target.value)} options={[{ value: "", label: t("All roles") }, { value: "none", label: t("Normal users") }, { value: "super_admin", label: t("Super Admin") }, { value: "admin", label: t("Admin") }, { value: "moderator", label: t("Moderator") }]} />
          <Select value={f.sort} onChange={(e) => set("sort", e.target.value)} options={[{ value: "newest", label: t("Newest first") }, { value: "oldest", label: t("Oldest first") }, { value: "last_active", label: t("Recently active") }, { value: "name", label: t("Name") }]} />
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <label className="flex items-center gap-1.5"><input type="checkbox" className="accent-brand-600" checked={f.flagged === "1"} onChange={(e) => set("flagged", e.target.checked ? "1" : "")} />{t("Only reported as suspicious")}</label>
          <Select value={f.verified} onChange={(e) => set("verified", e.target.value)} options={[{ value: "", label: t("Any email status") }, { value: "yes", label: t("Email verified") }, { value: "no", label: t("Email not verified") }]} className="w-auto" />
        </div>
      </Section>
      <Section title={t("Registered users")}>
        {list.error && <ErrorAlert error={list.error} />}
        <Table head={[t("User"), t("Plan"), t("Status"), t("Role"), t("Registered"), t("Last active")]} empty={list.data?.items.length === 0}>
          {(list.data?.items ?? []).map((u) => (
            <tr key={u.id}>
              <td><Link to={`/admin/users/${u.id}`} className="font-medium hover:underline">{u.name}</Link><span className="block text-xs muted">{u.email}{!u.verified && ` · ${t("not verified")}`}</span></td>
              <td><Badge tone={u.plan === "pro" ? "violet" : "slate"}>{u.plan}</Badge></td>
              <td><Badge tone={u.status === "active" ? "green" : "red"}>{t(u.status === "active" ? "Active" : "Suspended")}</Badge>{u.openFlags > 0 && <Badge tone="amber" className="ml-1">⚑ {u.openFlags}</Badge>}</td>
              <td>{u.role ? <Badge tone="brand">{t(ROLE_LABEL[u.role])}</Badge> : <span className="muted">—</span>}</td>
              <td title={fmtDateTime(u.createdAt)}>{new Date(u.createdAt).toLocaleDateString()}</td>
              <td>{u.lastActive ? timeAgo(u.lastActive) : <span className="muted">—</span>}</td>
            </tr>
          ))}
        </Table>
        {list.data && <Pager page={list.data.page} limit={list.data.limit} total={list.data.total} onPage={(p) => set("page", String(p))} />}
      </Section>
    </div>
  );
}
