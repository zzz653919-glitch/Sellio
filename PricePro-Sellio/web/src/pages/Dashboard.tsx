import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity as ActivityIcon, ArrowRight, BarChart3, CheckCircle2, FolderKanban, ImageIcon, LineChart, Sparkles, TrendingDown,
  TrendingUp, XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { StatCard, UsageMeter } from "../components/shared";
import { Alert, Button, Card, EmptyState, PageLoader, cx } from "../components/ui";
import { get } from "../lib/api";
import { fmtPct, fmtToday, timeAgo } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useQty } from "../lib/qty";
import type { PaymentItem } from "./Payment";
import type { Activity, Generation, Usage, User } from "../lib/types";
import { PLAN_NAME } from "../lib/types";

type DashboardData = {
  user: User;
  stats: { totalProjects: number; adsCreated: number; productsAnalyzed: number; forecastsCompleted: number };
  generations: Generation[];
  analyses: { id: string; query: string; areas: number; createdAt: string; headline: { name: string; changePct: number | null; periodChangePct?: number | null; trend: string | null } | null }[];
  recentActivity: Activity[];
  usage: Usage;
};

const SERVICE_ICON: Record<string, ReactNode> = {
  studio: <Sparkles className="h-4 w-4" />,
  forecast: <LineChart className="h-4 w-4" />,
  projects: <FolderKanban className="h-4 w-4" />,
};

function ServicePanel({ icon, title, gradient, action, to, children }: { icon: ReactNode; title: string; gradient: string; action: string; to: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-5 pt-5">
        <span className={cx("tile", gradient)}>{icon}</span>
        <h2 className="text-[15px] font-bold">{title}</h2>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">{children}</div>
      <div className="border-t border-[var(--v-line-soft)] p-3">
        <Link to={to}><Button className="w-full" icon={<ArrowRight className="h-4 w-4" />}>{action}</Button></Link>
      </div>
    </Card>
  );
}

/** Current card payment: being checked, or rejected (with the reason). */
function PaymentBanner() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: ["payments"], queryFn: () => get<{ items: PaymentItem[]; open: PaymentItem | null }>("/payments"), refetchInterval: (s) => (s.state.data?.open?.submitted ? 30_000 : false) });
  const latest = q.data?.items[0];
  if (!latest) return null;
  if (latest.status === "pending" && latest.submitted)
    return <Alert tone="warning" title={t("Your payment is being checked. Wait for the administrator's confirmation.")}><Link to="/payment" className="font-semibold underline">{t("Payment page →")}</Link></Alert>;
  if (latest.status === "rejected")
    return <Alert tone="error" title={t("Your last payment was not confirmed")}>{t("Reason")}: {latest.rejectReason || t("not given")}. <Link to="/payment" className="font-semibold underline">{t("Send a new receipt")}</Link></Alert>;
  return null;
}

export default function Dashboard() {
  const { t, tr } = useI18n();
  const qty = useQty();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => get<DashboardData>("/dashboard") });
  if (q.isLoading || !q.data) return <PageLoader />;
  const d = q.data;
  const latest = d.generations.find((g) => g.status === "succeeded") ?? d.generations[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("Good morning") : hour < 18 ? t("Good afternoon") : t("Good evening");

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 px-1.5 pt-2.5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-1.5">{fmtToday()}</p>
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[30px]">{greeting}, {d.user.firstName}!</h1>
          <p className="mt-1.5 max-w-xl text-[14.5px] muted">
            {t("You are on the {plan} plan. Create advertisements and see where demand is growing — all in one place.", { plan: PLAN_NAME[d.user.plan] })}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link to="/analytics"><Button variant="secondary" icon={<BarChart3 className="h-4 w-4" />}>{t("Analytics")}</Button></Link>
          <Link to="/studio"><Button icon={<Sparkles className="h-4 w-4" />}>{t("Create Advertisement")}</Button></Link>
        </div>
      </motion.div>

      <PaymentBanner />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        <StatCard icon={<FolderKanban className="h-4 w-4" />} label={t("Total projects")} value={qty(d.stats.totalProjects)} />
        <StatCard icon={<ImageIcon className="h-4 w-4" />} label={t("Ads created")} value={qty(d.stats.adsCreated)} tone="violet" />
        <StatCard icon={<BarChart3 className="h-4 w-4" />} label={t("Products analyzed")} value={qty(d.stats.productsAnalyzed)} hint={t("{n} forecasts completed", { n: d.stats.forecastsCompleted })} tone="cyan" />
      </div>


      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ServicePanel icon={<Sparkles className="h-5 w-5" />} title={t("AI Product Studio")} gradient="t-lilac" action={t("Create Advertisement")} to="/studio">
          {latest ? (
            <Link to={`/studio?generation=${latest.id}`} className="group relative block overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
              <img src={latest.resultUrl ?? latest.originalUrl} alt={latest.productName} className="aspect-[4/3] w-full object-cover transition group-hover:scale-105" />
              <span className="absolute bottom-2 left-2 rounded-lg bg-slate-950/70 px-2 py-1 text-xs text-white">{latest.productName} · {t(latest.status)}</span>
            </Link>
          ) : (
            <EmptyState icon={<ImageIcon className="h-5 w-5" />} title={t("No advertisements yet")} text={t("Upload a product photo to create your first ad.")} />
          )}
          {d.generations.length > 0 && <Link to="/projects?type=advertisement" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">{t("Previous advertising projects →")}</Link>}
        </ServicePanel>

        <ServicePanel icon={<LineChart className="h-5 w-5" />} title={t("Demand Forecast")} gradient="" action={t("View Forecast")} to="/forecast">
          {d.analyses.length === 0 ? (
            <EmptyState icon={<LineChart className="h-5 w-5" />} title={t("No analyses yet.")} text={t("See where demand for a product is growing — worldwide and by country.")} />
          ) : (
            d.analyses.map((a) => {
              const h = a.headline;
              const pct = h ? (h.periodChangePct ?? h.changePct) : null;
              return (
                <Link key={a.id} to={`/forecast?market=${a.id}`} className="rounded-xl border border-slate-200 p-3 hover:border-brand-300 dark:border-slate-800">
                  <p className="truncate font-medium">{a.query}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm muted">
                    {!h ? t("Too little search data for this product here.") : <>
                      {pct !== null && pct < 0 ? <TrendingDown className="h-4 w-4 text-rose-500" /> : <TrendingUp className="h-4 w-4 text-emerald-500" />}
                      {h.name === "Worldwide" ? t("Worldwide") : t(h.name)} · {fmtPct(pct)} · {a.areas} {t("areas")}
                    </>}
                  </p>
                </Link>
              );
            })
          )}
        </ServicePanel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold"><ActivityIcon className="h-4 w-4" />{t("Recent activity")}</h2>
            <Link to="/analytics" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">{t("Analytics →")}</Link>
          </div>
          {d.recentActivity.length === 0 ? (
            <p className="py-8 text-center text-sm muted">{t("Your activity will appear here.")}</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {d.recentActivity.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <span className="tile h-8 w-8 rounded-[10px]">{SERVICE_ICON[a.service] ?? <ActivityIcon className="h-4 w-4" />}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{tr(a.title)}</span>
                  {a.success ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-rose-500" />}
                  <span className="w-20 text-right text-xs muted">{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-semibold">{t("Your requests")}</h2>
          <UsageMeter usage={d.usage} />
          {d.usage.plan === "free" && <Link to="/subscription"><Button variant="secondary" className="mt-5 w-full">{t("More requests: Pro or Max")}</Button></Link>}
        </Card>
      </div>
    </div>
  );
}
