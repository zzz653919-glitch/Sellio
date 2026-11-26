import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3, Bell, Bot, Briefcase, Compass, Megaphone, Radar, CreditCard, FolderKanban, Heart, LayoutDashboard, LifeBuoy, LineChart, LogOut, Menu, Moon, Settings,
  ShieldCheck, Sparkles, Sun, User as UserIcon, X,
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

export const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/growth", label: "Growth Hub", icon: Compass },
  { to: "/studio", label: "AI Product Studio", icon: Sparkles },
  { to: "/ads", label: "Ad Studio", icon: Megaphone },
  { to: "/intelligence", label: "Market Intelligence", icon: Radar },
  { to: "/forecast", label: "Demand Forecast", icon: LineChart },
  { to: "/business", label: "My Business", icon: Briefcase },
  { to: "/advisor", label: "AI Advisor", icon: Bot },
  { to: "/projects", label: "My Projects", icon: FolderKanban },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/favorites", label: "Favorites", icon: Heart },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/support", label: "Support", icon: LifeBuoy },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cx("flex items-center gap-2.5", className)}>
      <img src="/favicon.svg" alt="" className="h-9 w-9" />
      <span className="text-lg font-extrabold tracking-tight">Vend<span className="text-brand-600 dark:text-brand-400">ora</span></span>
    </Link>
  );
}

export function Avatar({ url, name, size = 36 }: { url: string | null; name: string; size?: number }) {
  return url ? (
    <img src={url} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="flex items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-cyan-500 font-bold text-white" style={{ width: size, height: size, fontSize: size / 2.6 }}>
      {name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
    </span>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const unread = useUnread();
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Logo className="px-2 pt-1" />
      <nav className="-mx-1 flex flex-1 flex-col gap-1 overflow-y-auto px-1" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate}
            className={({ isActive }) => cx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
              isActive ? "bg-brand-600 text-white shadow-md shadow-brand-600/25" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
            )}>
            <Icon className="h-[18px] w-[18px]" />
            <span className="flex-1">{t(label)}</span>
            {to === "/notifications" && unread > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">{unread}</span>}
          </NavLink>
        ))}
      </nav>
      {user?.adminRole && (
        <Link to="/admin" onClick={onNavigate} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
          <ShieldCheck className="h-[18px] w-[18px] text-brand-600" />{t("Admin panel")}
        </Link>
      )}
      {user && (
        <Link to="/subscription" onClick={onNavigate} className="rounded-2xl bg-gradient-to-br from-brand-600 to-cyan-600 p-4 text-white">
          <p className="text-xs uppercase tracking-wider opacity-80">{t("Current plan")}</p>
          <p className="text-lg font-bold">{user.plan === "pro" ? "Pro" : "Free"}</p>
          <p className="mt-1 text-xs opacity-90">{user.plan === "pro" ? t("Manage subscription") : t("Upgrade for higher limits →")}</p>
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
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-haspopup="menu" aria-expanded={open}>
        <Avatar url={user.avatarUrl} name={`${user.firstName} ${user.lastName}`} size={32} />
        <span className="hidden text-sm font-semibold sm:block">{user.firstName}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="card absolute right-0 z-40 mt-2 w-60 p-2">
            <div className="border-b border-slate-200 px-3 pb-2 pt-1 dark:border-slate-800">
              <p className="truncate text-sm font-semibold">{user.firstName} {user.lastName}</p>
              <p className="truncate text-xs muted">{user.email}</p>
              <Badge tone={user.plan === "pro" ? "violet" : "slate"} className="mt-1.5">{user.plan === "pro" ? "Pro" : "Free"}</Badge>
            </div>
            {items.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} role="menuitem" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">
                <Icon className="h-4 w-4" /> {t(label)}
              </Link>
            ))}
            <button role="menuitem" onClick={async () => { await logout(); nav("/login"); }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10">
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
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:block">
        <Sidebar />
      </aside>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)}>
            <motion.aside initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: "spring", damping: 26, stiffness: 260 }}
              className="h-full w-72 bg-white dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
              <button className="absolute right-3 top-3 rounded-lg p-2" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-1.5 border-b border-slate-200 bg-white/80 px-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 sm:gap-3 sm:px-6">
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          {/* On phones only the logo mark is shown, so the language switch fits. */}
          <div className="lg:hidden"><Logo className="[&>span]:hidden sm:[&>span]:inline" /></div>
          <div className="flex-1" />
          <LanguageSwitch />
          <button onClick={() => setTheme(resolved === "dark" ? "light" : "dark")} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label={t("Toggle theme")} title={t("Toggle theme")}>
            {resolved === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <Link to="/notifications" className="relative rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t("Notifications")}>
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
          </Link>
          <UserMenu />
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <VerifyEmailBanner />
          <ErrorBoundary resetKey={location.pathname}>
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
              <Outlet />
            </motion.div>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
