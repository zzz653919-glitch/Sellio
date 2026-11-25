import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CreditCard, Languages, Laptop, Moon, Palette, Settings as SettingsIcon, Shield, Sun, Trash2, Upload as UploadIcon, User as UserIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Avatar } from "../components/Layout";
import { ErrorAlert } from "../components/shared";
import { Alert, Badge, Button, Card, Field, Input, Modal, PageHeader, PageLoader, Toggle, cx, useToast } from "../components/ui";
import { del, errorMessage, get, patch, post, upload } from "../lib/api";
import { useAuth } from "../lib/auth";
import { timeAgo } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/theme";
import type { Settings, User } from "../lib/types";

type Tab = "personal" | "security" | "notifications" | "preferences" | "subscription";

function PersonalTab() {
  const { t } = useI18n();
  const { user, setUser } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ firstName: user!.firstName, lastName: user!.lastName });
  const save = useMutation({
    mutationFn: () => patch<{ user: User }>("/user/profile", form),
    onSuccess: (d) => { setUser(d.user); toast("success", t("Profile updated")); },
  });
  const avatar = useMutation({
    mutationFn: (file: File) => { const fd = new FormData(); fd.append("file", file); return upload<{ user: User }>("/user/avatar", fd); },
    onSuccess: (d) => { setUser(d.user); toast("success", t("Profile photo updated")); },
    onError: (e) => toast("error", errorMessage(e)),
  });
  const removeAvatar = useMutation({
    mutationFn: () => del<{ user: User }>("/user/avatar"),
    onSuccess: (d) => setUser(d.user),
  });
  return (
    <Card className="space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar url={user!.avatarUrl} name={`${user!.firstName} ${user!.lastName}`} size={72} />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" loading={avatar.isPending} onClick={() => fileRef.current?.click()} icon={<UploadIcon className="h-4 w-4" />}>{t("Change photo")}</Button>
          {user!.avatarUrl && <Button variant="ghost" size="sm" loading={removeAvatar.isPending} onClick={() => removeAvatar.mutate()}>{t("Remove")}</Button>}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) avatar.mutate(f); e.target.value = ""; }} />
        </div>
      </div>
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Field label={t("First name")}><Input required maxLength={60} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
        <Field label={t("Last name")}><Input required maxLength={60} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
        <Field label={t("Email address")} hint={t("Email cannot be changed here.")}><Input value={user!.email} disabled /></Field>
        <div className="flex items-end">{user!.emailVerified ? <Badge tone="green">{t("Verified")}</Badge> : <Badge tone="amber">{t("Not verified")}</Badge>}</div>
        {save.error && <div className="sm:col-span-2"><ErrorAlert error={save.error} /></div>}
        <div className="sm:col-span-2"><Button type="submit" loading={save.isPending}>{t("Save changes")}</Button></div>
      </form>
    </Card>
  );
}

function SecurityTab() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => get<{ sessions: { id: string; createdAt: string; lastSeenAt: string; userAgent: string | null; ip: string | null; current: boolean }[] }>("/user/sessions") });
  const change = useMutation({
    mutationFn: () => post("/user/password", { currentPassword: pw.currentPassword, newPassword: pw.newPassword }),
    onSuccess: () => { setPw({ currentPassword: "", newPassword: "", confirm: "" }); toast("success", t("Password changed. Other sessions were signed out.")); qc.invalidateQueries({ queryKey: ["sessions"] }); },
  });
  const revoke = useMutation({ mutationFn: (id: string) => del(`/user/sessions/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }) });
  const deleteAccount = useMutation({
    mutationFn: () => del("/user/account", { password: deletePw }),
    onSuccess: () => { qc.clear(); setUser(null); nav("/signup"); },
  });
  const mismatch = pw.confirm.length > 0 && pw.confirm !== pw.newPassword;
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="mb-4 font-semibold">{t("Change password")}</h3>
        <form className="grid max-w-lg gap-4" onSubmit={(e) => { e.preventDefault(); if (!mismatch) change.mutate(); }}>
          <Field label={t("Current password")}><Input type="password" required autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <Field label={t("New password")} hint={t("At least 8 characters with a letter and a number.")}><Input type="password" required autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          <Field label={t("Confirm password")} error={mismatch ? t("Passwords do not match") : undefined}><Input type="password" required autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
          {change.error && <ErrorAlert error={change.error} />}
          <div><Button type="submit" loading={change.isPending} disabled={mismatch}>{t("Update password")}</Button></div>
        </form>
      </Card>
      <Card className="p-6">
        <h3 className="mb-4 font-semibold">{t("Active sessions")}</h3>
        {!sessions.data ? <PageLoader /> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {sessions.data.sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <Laptop className="h-5 w-5 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.userAgent ?? t("Unknown device")}</p>
                  <p className="text-xs muted">{s.ip ?? ""} · {t("last active")} {timeAgo(s.lastSeenAt)}</p>
                </div>
                {s.current ? <Badge tone="green">{t("This device")}</Badge> : <Button size="sm" variant="secondary" loading={revoke.isPending} onClick={() => revoke.mutate(s.id)}>{t("Sign out")}</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="border-rose-200 p-6 dark:border-rose-500/30">
        <h3 className="font-semibold text-rose-600">{t("Delete account")}</h3>
        <p className="mt-1 text-sm muted">{t("Permanently deletes your account, projects, uploads, forecasts and all other data.")}</p>
        <Button className="mt-4" variant="danger" onClick={() => setDeleteOpen(true)} icon={<Trash2 className="h-4 w-4" />}>{t("Delete account")}</Button>
      </Card>
      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t("Delete account permanently?")}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); deleteAccount.mutate(); }}>
          <Alert tone="error">{t("This cannot be undone.")}</Alert>
          <Field label={t("Enter your password to confirm")}><Input type="password" required value={deletePw} onChange={(e) => setDeletePw(e.target.value)} /></Field>
          {deleteAccount.error && <ErrorAlert error={deleteAccount.error} />}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setDeleteOpen(false)}>{t("Cancel")}</Button><Button type="submit" variant="danger" loading={deleteAccount.isPending}>{t("Delete account")}</Button></div>
        </form>
      </Modal>
    </div>
  );
}

function useSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => get<{ settings: Settings }>("/user/settings").then((r) => r.settings) });
  const m = useMutation({
    mutationFn: (p: Partial<Settings> | { notifications: Partial<Settings["notifications"]> }) => patch<{ settings: Settings }>("/user/settings", p),
    onSuccess: (d) => { qc.setQueryData(["settings"], d.settings); toast("success", t("Preferences saved")); },
    onError: (e) => toast("error", errorMessage(e)),
  });
  return { settings: q.data, save: m.mutate };
}

function NotificationsTab() {
  const { t } = useI18n();
  const { settings, save } = useSettings();
  if (!settings) return <PageLoader />;
  const n = settings.notifications;
  const set = (k: keyof Settings["notifications"]) => (v: boolean) => save({ notifications: { [k]: v } });
  return (
    <Card className="divide-y divide-slate-100 px-6 dark:divide-slate-800">
      <Toggle checked={n.inApp} onChange={set("inApp")} label={t("In-app notifications")} description={t("Show notifications inside PricePro.")} />
      <Toggle checked={n.email} onChange={set("email")} label={t("Email notifications")} description={t("Email important account updates.")} />
      <Toggle checked={n.generation} disabled={!n.inApp} onChange={set("generation")} label={t("Advertisement generation")} description={t("When an advertisement is ready or fails.")} />
      <Toggle checked={n.forecast} disabled={!n.inApp} onChange={set("forecast")} label={t("Demand analysis")} description={t("When a forecast is completed.")} />
      <Toggle checked={n.account} onChange={set("account")} label={t("Account updates")} description={t("Security, password and plan changes.")} />
    </Card>
  );
}

function PreferencesTab() {
  const { t, setLang } = useI18n();
  const { setTheme } = useTheme();
  const { settings, save } = useSettings();
  if (!settings) return <PageLoader />;
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="mb-4 flex items-center gap-2 font-semibold"><Languages className="h-4 w-4" />{t("Language")}</h3>
        <div className="grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-3">
          {([["uz", "O‘zbekcha"], ["ru", "Русский"], ["en", "English"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => { setLang(v); save({ language: v }); }}
              className={cx("rounded-xl border-2 p-4 text-left font-semibold transition", settings.language === v ? "border-brand-500 bg-brand-50/50 dark:bg-brand-500/10" : "border-slate-200 dark:border-slate-800")}>{label}</button>
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <h3 className="mb-4 flex items-center gap-2 font-semibold"><Palette className="h-4 w-4" />{t("Appearance")}</h3>
        <div className="grid max-w-lg grid-cols-3 gap-3">
          {([["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "System", Laptop]] as const).map(([v, label, Icon]) => (
            <button key={v} onClick={() => { setTheme(v); save({ theme: v }); }}
              className={cx("flex flex-col items-center gap-2 rounded-xl border-2 p-4 font-semibold transition", settings.theme === v ? "border-brand-500 bg-brand-50/50 dark:bg-brand-500/10" : "border-slate-200 dark:border-slate-800")}>
              <Icon className="h-5 w-5" />{t(label)}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "personal";
  const tabs: { value: Tab; label: string; icon: typeof UserIcon }[] = [
    { value: "personal", label: "Personal information", icon: UserIcon },
    { value: "security", label: "Account security", icon: Shield },
    { value: "notifications", label: "Notification preferences", icon: Bell },
    { value: "preferences", label: "Language & appearance", icon: Palette },
    { value: "subscription", label: "Subscription", icon: CreditCard },
  ];
  if (!user) return <PageLoader />;
  return (
    <div>
      <PageHeader icon={<SettingsIcon className="h-6 w-6" />} title={t("Settings")} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label={t("Settings")}>
          {tabs.map(({ value, label, icon: Icon }) => (
            <button key={value} onClick={() => setParams({ tab: value })}
              className={cx("flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-medium transition", tab === value ? "bg-white shadow-sm dark:bg-slate-900" : "text-slate-500 hover:bg-white/60 dark:hover:bg-slate-900/60")}>
              <Icon className="h-4 w-4" />{t(label)}
            </button>
          ))}
        </nav>
        <div className="lg:col-span-3">
          {tab === "personal" && <PersonalTab />}
          {tab === "security" && <SecurityTab />}
          {tab === "notifications" && <NotificationsTab />}
          {tab === "preferences" && <PreferencesTab />}
          {tab === "subscription" && (
            <Card className="p-6">
              <p className="text-sm muted">{t("Current plan")}</p>
              <p className="text-2xl font-bold">{user.plan === "pro" ? "Pro" : "Free"}</p>
              <Link to="/subscription"><Button className="mt-4" icon={<CreditCard className="h-4 w-4" />}>{t("Manage subscription")}</Button></Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
