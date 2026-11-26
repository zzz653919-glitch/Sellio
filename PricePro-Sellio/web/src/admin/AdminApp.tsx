import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, BarChart3, Bell, CreditCard, FileClock, FolderKanban, LayoutDashboard, LifeBuoy, LineChart, Menu, Settings, ShieldCheck, Sparkles, Users, Wallet, X,
} from "lucide-react";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { LanguageSwitch } from "../components/LanguageSwitch";
import { Logo } from "../components/Layout";
import { ErrorAlert } from "../components/shared";
import { Alert, Badge, Button, Card, Field, Input, PageLoader, cx } from "../components/ui";
import { ApiError, post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { ROLE_LABEL, useAdminMe, type AdminMe } from "./ui";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const UsersPage = lazy(() => import("./pages/Users"));
const UserDetail = lazy(() => import("./pages/UserDetail"));
const Content = lazy(() => import("./pages/Content"));
const Services = lazy(() => import("./pages/Services"));
const Billing = lazy(() => import("./pages/Billing"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Support = lazy(() => import("./pages/Support"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Security = lazy(() => import("./pages/Security"));
const SettingsPage = lazy(() => import("./pages/Settings"));

const MENU: { to: string; label: string; icon: typeof Users; perm: string; end?: boolean }[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view", end: true },
  { to: "/admin/users", label: "Users", icon: Users, perm: "users.view" },
  { to: "/admin/content", label: "Projects & content", icon: FolderKanban, perm: "content.view" },
  { to: "/admin/studio", label: "AI Product Studio", icon: Sparkles, perm: "studio.view" },
  { to: "/admin/forecast", label: "Demand Forecast", icon: LineChart, perm: "forecast.view" },
  { to: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard, perm: "subscriptions.view" },
  { to: "/admin/payments", label: "Payments", icon: Wallet, perm: "payments.view" },
  { to: "/admin/notifications", label: "Notifications", icon: Bell, perm: "notifications.manage" },
  { to: "/admin/support", label: "Support", icon: LifeBuoy, perm: "support.manage" },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart3, perm: "analytics.view" },
  { to: "/admin/security", label: "Admins & audit", icon: FileClock, perm: "audit.view" },
  { to: "/admin/settings", label: "Settings", icon: Settings, perm: "dashboard.view" },
];

/** 2FA gate: enter the code, or set up 2FA when the platform requires it. */
function TwoFactorGate({ me, children }: { me: AdminMe; children: ReactNode }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const verify = useMutation({ mutationFn: () => post("/admin/2fa/verify", { code }), onSuccess: () => qc.invalidateQueries() });
  if (me.mfa.state === "ok") return <>{children}</>;
  if (me.mfa.state === "setup_required") {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-10">
        <Alert tone="warning" title={t("Two-factor authentication is required")}>{t("The platform settings require every administrator to use an authenticator app. Set it up to continue.")}</Alert>
        <SettingsPage onlyTwoFactor />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-sm py-16">
      <Card className="space-y-4 p-6">
        <h1 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5 text-brand-600" />{t("Two-factor check")}</h1>
        <p className="text-sm muted">{t("Enter the 6-digit code from your authenticator app.")}</p>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); verify.mutate(); }}>
          <Field label={t("Code")}><Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus /></Field>
          {verify.error && <ErrorAlert error={verify.error} />}
          <Button type="submit" className="w-full" loading={verify.isPending} disabled={code.length !== 6}>{t("Continue")}</Button>
        </form>
      </Card>
    </div>
  );
}

function Sidebar({ me, onNavigate }: { me: AdminMe; onNavigate?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center gap-2 px-2"><Logo /><Badge tone="red">{t("Admin")}</Badge></div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto" aria-label={t("Admin menu")}>
        {MENU.filter((m) => me.permissions.includes(m.perm)).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate}
            className={({ isActive }) => cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition", isActive ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800")}>
            <Icon className="h-4 w-4" /><span>{t(label)}</span>
          </NavLink>
        ))}
      </nav>
      <Link to="/" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><ArrowLeft className="h-4 w-4" />{t("Back to Vendora")}</Link>
    </div>
  );
}

function Guard({ me, perm, children }: { me: AdminMe; perm: string; children: ReactNode }) {
  const { t } = useI18n();
  return me.permissions.includes(perm) ? <>{children}</> : <Alert tone="warning">{t("Your admin role does not allow this action.")}</Alert>;
}

export default function AdminApp() {
  const { t } = useI18n();
  const { user } = useAuth();
  const me = useAdminMe();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  if (me.isLoading) return <PageLoader />;
  if (me.error) {
    const notAdmin = me.error instanceof ApiError && (me.error.status === 403 || me.error.status === 401);
    return notAdmin ? <Navigate to="/" replace /> : <div className="p-6"><ErrorAlert error={me.error} /></div>;
  }
  const m = me.data!;
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block"><Sidebar me={m} /></aside>
      {open && (
        <div className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="relative h-full w-72 bg-white dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <button className="absolute right-3 top-3 rounded-lg p-2" onClick={() => setOpen(false)} aria-label={t("Close menu")}><X className="h-5 w-5" /></button>
            <Sidebar me={m} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/85 px-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85 sm:px-6">
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setOpen(true)} aria-label={t("Open menu")}><Menu className="h-5 w-5" /></button>
          <p className="font-semibold">{t("Admin panel")}</p>
          <div className="flex-1" />
          <LanguageSwitch />
          <span className="hidden text-sm sm:inline">{user?.firstName}</span>
          <Badge tone="violet">{t(ROLE_LABEL[m.role])}</Badge>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <TwoFactorGate me={m}>
            <ErrorBoundary resetKey={location.pathname}>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route index element={<Guard me={m} perm="dashboard.view"><Dashboard /></Guard>} />
                  <Route path="users" element={<Guard me={m} perm="users.view"><UsersPage /></Guard>} />
                  <Route path="users/:id" element={<Guard me={m} perm="users.view"><UserDetail /></Guard>} />
                  <Route path="content" element={<Guard me={m} perm="content.view"><Content /></Guard>} />
                  <Route path="studio" element={<Guard me={m} perm="studio.view"><Services which="studio" /></Guard>} />
                  <Route path="forecast" element={<Guard me={m} perm="forecast.view"><Services which="forecast" /></Guard>} />
                  <Route path="subscriptions" element={<Guard me={m} perm="subscriptions.view"><Billing which="subscriptions" /></Guard>} />
                  <Route path="payments" element={<Guard me={m} perm="payments.view"><Billing which="payments" /></Guard>} />
                  <Route path="notifications" element={<Guard me={m} perm="notifications.manage"><Notifications /></Guard>} />
                  <Route path="support" element={<Guard me={m} perm="support.manage"><Support /></Guard>} />
                  <Route path="analytics" element={<Guard me={m} perm="analytics.view"><Analytics /></Guard>} />
                  <Route path="security" element={<Guard me={m} perm="audit.view"><Security /></Guard>} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/admin" replace />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </TwoFactorGate>
        </main>
      </div>
    </div>
  );
}
