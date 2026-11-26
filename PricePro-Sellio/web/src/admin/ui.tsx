import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, Field, Input, Modal, cx } from "../components/ui";
import { ErrorAlert } from "../components/shared";
import { get } from "../lib/api";
import { fmtNumber } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useQty } from "../lib/qty";

export type Role = "super_admin" | "admin" | "moderator";
export type AdminMe = { role: Role; permissions: string[]; mfa: { enabled: boolean; state: "ok" | "required" | "setup_required"; requiredBySettings: boolean }; superAdminFromEnv: boolean };

export const useAdminMe = () => useQuery({ queryKey: ["admin-me"], queryFn: () => get<AdminMe>("/admin/me"), retry: false, staleTime: 30_000 });
export function useCan() {
  const me = useAdminMe();
  return (p: string) => Boolean(me.data?.permissions.includes(p));
}

export const ROLE_LABEL: Record<Role, string> = { super_admin: "Super Admin", admin: "Admin", moderator: "Moderator" };

export function Stat({ label, value, hint, tone = "brand" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "brand" | "green" | "amber" | "red" | "slate" }) {
  const qty = useQty();
  const bar = { brand: "bg-brand-500", green: "bg-emerald-500", amber: "bg-amber-500", red: "bg-rose-500", slate: "bg-slate-400" }[tone];
  return (
    <div className="card relative overflow-hidden p-4">
      <span className={cx("absolute inset-y-0 left-0 w-1", bar)} />
      <p className="text-xs font-medium muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight">{typeof value === "number" ? qty(value, Number.isInteger(value) ? 0 : 1) : value}</p>
      {hint && <p className="mt-0.5 text-xs muted">{hint}</p>}
    </div>
  );
}

export function Section({ title, actions, children, className }: { title: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("card space-y-3 p-5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{title}</h2>{actions}</div>
      {children}
    </section>
  );
}

export function Pager({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex items-center justify-between gap-2 pt-2 text-sm">
      <span className="muted">{t("{n} records", { n: fmtNumber(total) })} · {t("page {p} of {n}", { p: page, n: pages })}</span>
      <div className="flex gap-1">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t("Previous page")}><ChevronLeft className="h-4 w-4" /></Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t("Next page")}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

/** A table with a horizontal scroll on small screens. */
export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr>{head.map((h, i) => <th key={i} className="whitespace-nowrap py-2 pr-3">{h}</th>)}</tr></thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-slate-100 dark:[&>tr]:border-slate-800 [&_td]:py-2 [&_td]:pr-3">{children}</tbody>
      </table>
      {empty && <p className="py-6 text-center text-sm muted">{t("Nothing found.")}</p>}
    </div>
  );
}

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (r: { from: string; to: string }) => void }) {
  const { t } = useI18n();
  const preset = (days: number) => {
    const end = new Date().toISOString().slice(0, 10);
    onChange({ from: new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10), to: end });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {[7, 30, 90, 365].map((d) => <Button key={d} size="sm" variant="ghost" onClick={() => preset(d)}>{t("{n} days", { n: d })}</Button>)}
      <Input type="date" value={from} max={to} onChange={(e) => onChange({ from: e.target.value, to })} className="w-auto" aria-label={t("From")} />
      <span className="muted">—</span>
      <Input type="date" value={to} min={from} onChange={(e) => onChange({ from, to: e.target.value })} className="w-auto" aria-label={t("To")} />
    </div>
  );
}

export const defaultRange = (days = 30) => ({ from: new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) });

/** Sensitive actions: ask for the admin's password (and optionally typed confirmation). */
export function ConfirmWithPassword({ open, title, text, confirmLabel, danger, typeToConfirm, error, loading, onConfirm, onClose, children }: {
  open: boolean; title: string; text?: string; confirmLabel: string; danger?: boolean; typeToConfirm?: string; error?: unknown; loading?: boolean;
  onConfirm: (password: string) => void; onClose: () => void; children?: ReactNode;
}) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const close = () => { setPassword(""); setTyped(""); onClose(); };
  return (
    <Modal open={open} onClose={close} title={title}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onConfirm(password); }}>
        {text && <p className="text-sm muted">{text}</p>}
        {children}
        {typeToConfirm && <Field label={t("Type {x} to confirm", { x: typeToConfirm })}><Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></Field>}
        <Field label={t("Your password")}><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
        {error ? <ErrorAlert error={error} /> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={close}>{t("Cancel")}</Button>
          <Button type="submit" variant={danger ? "danger" : "primary"} loading={loading} disabled={!password || Boolean(typeToConfirm && typed.trim().toLowerCase() !== typeToConfirm.toLowerCase())}>{confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}

export function useList<T>(key: unknown[], path: string, params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString();
  return useQuery({ queryKey: [...key, qs], queryFn: () => get<T>(`${path}?${qs}`), placeholderData: (prev) => prev });
}

/** Download a CSV export (same-origin cookie auth). */
export function downloadUrl(path: string) {
  const a = document.createElement("a");
  a.href = `/api${path}`;
  a.download = "";
  a.click();
}
