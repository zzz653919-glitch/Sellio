import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, BarChart3, Bell, ChevronDown, ChevronRight, Compass, Megaphone, Radar, CreditCard, FolderKanban, Heart, LayoutDashboard, LifeBuoy, LineChart, LogOut, Menu, Moon, Settings,
  ShieldCheck, Sparkles, Sun, User as UserIcon, Wallet, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { get } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/theme";
import { ErrorBoundary } from "./ErrorBoundary";
import { LanguageSwitch } from "./LanguageSwitch";
import { VerifyEmailBanner } from "./shared";
import { Badge, cx } from "./ui";
import { PLAN_NAME, planTone } from "../lib/types";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean };
export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/growth", label: "Growth Hub", icon: Compass },
      { to: "/studio", label: "AI Product Studio", icon: Sparkles },
      { to: "/ads", label: "Ad Studio", icon: Megaphone },
      { to: "/intelligence", label: "Market Intelligence", icon: Radar },
      { to: "/forecast", label: "Demand Forecast", icon: LineChart },
    ],
  },
  {
    label: "Library",
    items: [
      { to: "/projects", label: "My Projects", icon: FolderKanban },
      { to: "/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/favorites", label: "Favorites", icon: Heart },
      { to: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/subscription", label: "Subscription", icon: CreditCard },
      { to: "/payment", label: "Payment", icon: Wallet },
      { to: "/support", label: "Support", icon: LifeBuoy },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];
export const NAV = NAV_SECTIONS.flatMap((s) => s.items);
const DOCK: NavItem[] = [NAV[0], NAV[1], NAV[3], NAV[5]];

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cx("flex items-center gap-2.5", className)}>
      <img src="/favicon.svg" alt="" className="h-8 w-8" />
      <span className="text-[19px] font-extrabold tracking-[-0.03em]">Vendora</span>
    </Link>
  );
}

export function Avatar({ url, name, size = 36 }: { url: string | null; name: string; size?: number }) {
  return url ? (
    <img src={url} alt="" className="rounded-full object-cover shadow-[0_0_0_2px_var(--v-line)]" style={{ width: size, height: size }} />
  ) : (
    <span className="flex items-center justify-center rounded-full bg-[#c4b5fd] font-extrabold text-[#0a0f1f] shadow-[inset_0_1px_0_rgba(255,255,255,.6),0_0_0_2px_var(--v-line)]" style={{ width: size, height: size, fontSize: size / 2.8 }}>
      {name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
    </span>
  );
}

type SubSummary = { plan: "free" | "pro" | "max"; usage: { metrics: Record<string, { used: number; limit: number; period: "day" | "month" }> }; subscription: { currentPeriodEnd: string | null } | null };

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const unread = useUnread();
  const sub = useQuery({ queryKey: ["subscription"], queryFn: () => get<SubSummary>("/subscription"), enabled: Boolean(user), staleTime: 60_000 });
  const gen = sub.data?.usage.metrics.requests;
  return (
    <div className="flex h-full flex-col px-3 pb-3 pt-4">
      <Logo className="px-2 pb-3.5" />
      <nav className="-mx-1 flex flex-1 flex-col gap-0.5 overflow-y-auto px-1" aria-label="Main">
        {NAV_SECTIONS.map((sec) => (
          <div key={sec.label} className="flex flex-col gap-0.5">
            <p className="nav-cap">{t(sec.label)}</p>
            {sec.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} onClick={onNavigate} className={({ isActive }) => cx("nav-item", isActive && "is-active")}>
                <Icon className="h-[19px] w-[19px] flex-none" />
                <span className="truncate">{t(label)}</span>
                {to === "/notifications" && unread > 0 && <span className="nav-badge">{unread > 99 ? "99+" : unread}</span>}
              </NavLink>
            ))}
          </div>
        ))}
        {user?.adminRole && (
          <div className="flex flex-col gap-0.5">
            <p className="nav-cap">{t("Admin")}</p>
            <Link to="/admin" onClick={onNavigate} className="nav-item"><ShieldCheck className="h-[19px] w-[19px] text-[var(--v-sky)]" />{t("Admin panel")}</Link>
          </div>
        )}
      </nav>
      {user && gen && (
        <Link to="/subscription" onClick={onNavigate} className="mb-2.5 mt-3 block rounded-[14px] border border-[var(--v-line-soft)] bg-[var(--v-glass-2)] p-3.5 shadow-[inset_0_1px_0_var(--v-hi)]">
          <div className="mb-2 flex justify-between text-[12.5px] muted"><span>{t(gen.period === "day" ? "Requests today" : "Requests this month")}</span><b className="font-bold text-[var(--v-text)]">{gen.used} / {gen.limit}</b></div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--v-track)]"><span className="block h-full rounded-full bg-[var(--v-sky)]" style={{ width: `${Math.min(100, (gen.used / Math.max(1, gen.limit)) * 100)}%` }} /></div>
          <div className="mt-2 flex justify-between text-[12.5px]"><span className="muted">{PLAN_NAME[user.plan]}</span><span className="font-semibold text-[var(--v-sky)]">{user.plan === "pro" ? t("Manage") : t("Upgrade")}</span></div>
        </Link>
      )}
      {user && (
        <Link to="/profile" onClick={onNavigate} className="flex items-center gap-2.5 rounded-[14px] border border-transparent p-2 hover:border-[var(--v-line-soft)] hover:bg-[var(--v-glass-2)]">
          <Avatar url={user.avatarUrl} name={`${user.firstName} ${user.lastName}`} />
          <span className="min-w-0 flex-1"><b className="block truncate text-[13.5px] font-bold">{user.firstName} {user.lastName}</b><small className="block truncate text-xs muted">{PLAN_NAME[user.plan]} · {user.email}</small></span>
        </Link>
      )}
    </div>
  );
}

function useUnread() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => get<{ unread: number }>("/notifications/unread-count"),
    enabled: Boolean(user),
    refetchInterval: 30_000,
  });
  return q.data?.unread ?? 0;
}

function UserMenu() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  if (!user) return null;
  const items = [
    { to: "/profile", label: "Profile", icon: UserIcon },
    { to: "/subscription", label: "Subscription", icon: CreditCard },
    { to: "/settings", label: "Settings", icon: Settings },
    { to: "/support", label: "Support", icon: LifeBuoy },
    ...(user.adminRole ? [{ to: "/admin", label: "Admin panel", icon: ShieldCheck }] : []),
  ];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 rounded-full p-1 hover:bg-[var(--v-glass-2)]" aria-haspopup="menu" aria-expanded={open} aria-label={t("Account menu")}>
        <Avatar url={user.avatarUrl} name={`${user.firstName} ${user.lastName}`} size={36} />
        <ChevronDown className="mr-1 hidden h-4 w-4 muted sm:block" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 z-40 mt-2.5 w-64 rounded-[18px] border border-[var(--v-line)] bg-[var(--v-pop)] p-1.5 shadow-[inset_0_1px_0_var(--v-hi),var(--v-drop)] backdrop-blur-2xl">
            <div className="border-b border-[var(--v-line-soft)] px-3 pb-2.5 pt-2">
              <p className="truncate text-sm font-semibold">{user.firstName} {user.lastName}</p>
              <p className="truncate text-xs muted">{user.email}</p>
              <Badge tone={planTone(user.plan)} className="mt-1.5">{PLAN_NAME[user.plan]}</Badge>
            </div>
            {items.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} role="menuitem" onClick={() => setOpen(false)} className="mt-0.5 flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-medium hover:bg-[var(--v-glass-3)]">
                <Icon className="h-4 w-4" /> {t(label)}
              </Link>
            ))}
            <button role="menuitem" onClick={async () => { await logout(); nav("/login"); }}
              className="mt-0.5 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] font-medium text-[var(--v-bad)] hover:bg-[var(--v-bad-soft)]">
              <LogOut className="h-4 w-4" /> {t("Log out")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { resolved, setTheme } = useTheme();
  const { t } = useI18n();
  const unread = useUnread();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);
  // Back: to the previous page of this site, or to the dashboard when the page was opened directly.
  const canGoBack = location.pathname !== "/dashboard";
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1); else navigate("/dashboard");
  };
  const section = NAV_SECTIONS.find((s) => s.items.some((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to))));
  const page = NAV.find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)));
  const iconBtn = "relative grid h-10 w-10 place-items-center rounded-xl text-[var(--v-muted)] hover:bg-[var(--v-glass-2)] hover:text-[var(--v-text)]";

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-4 lg:p-4">
      <aside className="glass sticky top-4 z-30 hidden h-[calc(100vh-32px)] rounded-[22px] lg:block">
        <Sidebar />
      </aside>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="fixed inset-0 z-50 bg-[#030612]/55 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)}>
            <motion.aside initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: "spring", damping: 26, stiffness: 260 }}
              className="absolute inset-y-3 left-3 w-[280px] rounded-[22px] border border-[var(--v-line)] bg-[var(--v-pop)] shadow-[var(--v-drop)] backdrop-blur-2xl" onClick={(e) => e.stopPropagation()}>
              <button className="absolute right-3 top-3 z-10 rounded-lg p-2" onClick={() => setMobileOpen(false)} aria-label={t("Close menu")}><X className="h-5 w-5" /></button>
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-col gap-4 px-3 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-3 lg:px-0 lg:pb-6 lg:pt-0">
        <header className="glass sticky top-3 z-20 flex min-h-[58px] items-center gap-1.5 rounded-[20px] py-2 pl-3 pr-2 sm:gap-2 lg:top-4 lg:min-h-16 lg:rounded-[22px] lg:pl-5">
          {canGoBack && (
            <button type="button" onClick={goBack} data-testid="back" aria-label={t("Back")} title={t("Back")}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[13.5px] font-semibold text-[var(--v-muted)] hover:bg-[var(--v-glass-2)] hover:text-[var(--v-text)] lg:mr-2 lg:border lg:border-[var(--v-line)]">
              <ArrowLeft className="h-5 w-5" /><span className="hidden sm:inline">{t("Back")}</span>
            </button>
          )}
          <div className="lg:hidden"><Logo className="[&>span]:hidden sm:[&>span]:inline" /></div>
          <div className="hidden min-w-0 flex-1 items-center gap-1.5 text-[13.5px] muted lg:flex">
            {section && <><span>{t(section.label)}</span><ChevronRight className="h-4 w-4" /></>}
            <b className="truncate text-[15px] font-bold text-[var(--v-text)]">{t(page?.label ?? "Vendora")}</b>
          </div>
          <div className="flex-1 lg:hidden" />
          <LanguageSwitch className="shrink-0" />
          <button onClick={() => setTheme(resolved === "dark" ? "light" : "dark")} className={iconBtn} aria-label={t("Toggle theme")} title={t("Toggle theme")}>
            {resolved === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <Link to="/notifications" className={iconBtn} aria-label={t("Notifications")}>
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute right-0.5 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[var(--v-badge-bg)] px-1 text-[10.5px] font-extrabold text-[var(--v-badge-fg)] shadow-[0_0_0_2px_var(--v-bg)]">{unread > 99 ? "99+" : unread}</span>}
          </Link>
          <UserMenu />
        </header>
        <main className="mx-auto w-full max-w-[1400px]">
          <VerifyEmailBanner />
          <ErrorBoundary resetKey={location.pathname}>
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              <Outlet />
            </motion.div>
          </ErrorBoundary>
        </main>
      </div>

      {/* Phone and tablet: glass dock with the main sections and the full menu. */}
      <nav className="glass safe-bottom fixed inset-x-3 z-40 flex gap-1 rounded-[26px] p-1.5 lg:hidden" aria-label={t("Quick menu")}>
        {DOCK.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cx("flex min-h-[54px] flex-1 flex-col items-center justify-center gap-[3px] rounded-[20px] px-1 text-center text-[10.5px] font-bold leading-tight text-[var(--v-muted)]", isActive && "bg-[var(--v-seg-on)] text-[var(--v-text)] shadow-[inset_0_1px_0_var(--v-hi)] [&>svg]:text-[var(--v-sky)]")}>
            <Icon className="h-[21px] w-[21px]" /><span className="line-clamp-1">{t(label)}</span>
          </NavLink>
        ))}
        <button type="button" onClick={() => setMobileOpen(true)} className="relative flex min-h-[54px] flex-1 flex-col items-center justify-center gap-[3px] rounded-[20px] text-[10.5px] font-bold text-[var(--v-muted)]" aria-label={t("Open menu")}>
          <Menu className="h-[21px] w-[21px]" /><span>{t("Menu")}</span>
          {unread > 0 && <span className="absolute right-[calc(50%-20px)] top-1 h-2.5 w-2.5 rounded-full bg-[var(--v-badge-bg)]" />}
        </button>
      </nav>
    </div>
  );
}
