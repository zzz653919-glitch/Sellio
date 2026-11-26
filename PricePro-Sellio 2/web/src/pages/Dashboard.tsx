import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity as ActivityIcon, ArrowRight, BarChart3, CheckCircle2, Compass, FolderKanban, ImageIcon, LineChart, Sparkles, TrendingDown,
  TrendingUp, XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { StatCard } from "../components/shared";
import { Badge, Button, Card, EmptyState, PageLoader, Progress, cx } from "../components/ui";
import { get } from "../lib/api";
import { fmtNumber, fmtPct, fmtToday, timeAgo } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useMsg, type Msg } from "../lib/msg";
import type { Activity, Generation, Usage, User } from "../lib/types";

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
      <div className={cx("flex items-center justify-between bg-gradient-to-r p-4 text-white", gradient)}>
        <div className="flex items-center gap-2 font-semibold">{icon}{title}</div>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">{children}</div>
      <div className="border-t border-slate-100 p-3 dark:border-slate-800">
        <Link to={to}><Button className="w-full" icon={<ArrowRight className="h-4 w-4" />}>{action}</Button></Link>
      </div>
    </Card>
  );
}

type GrowthPlan = { id: string; product: string; nextStep: string | null; done: number; total: number };
const NEXT_LABEL: Record<string, string> = { explain: "AI explanation", direction: "Marketing direction", assets: "Ads", campaign: "Campaign", results: "Results" };

/** The connected workflow on the dashboard: open plans and their next step. */
function GrowthCard() {
  const { t } = useI18n();
  const msg = useMsg();
  const q = useQuery({ queryKey: ["growth"], queryFn: () => get<{ items: GrowthPlan[]; learnings: { insights: Msg[] } }>("/growth") });
  const plans = (q.data?.items ?? []).filter((p) => p.nextStep).slice(0, 3);
  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold"><Compass className="h-4 w-4 text-brand-600" />{t("Growth Hub")}</h2>
        <Link to="/growth" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">{t("Open →")}</Link>
      </div>
      {plans.length === 0 ? (
        <p className="text-sm muted">{t("Pick a growing product, let the AI explain it, make ads, run a campaign and enter the results — step by step.")} <Link to="/intelligence?tab=opportunities" className="font-medium text-brand-600 hover:underline dark:text-brand-400">{t("See opportunities")}</Link></p>
      ) : plans.map((p) => (
        <Link key={p.id} to={`/growth?id=${p.id}`} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{t(p.product)}</p>
            <p className="text-xs muted">{t("Next")}: {t(NEXT_LABEL[p.nextStep!] ?? p.nextStep!)}</p>
          </div>
          <div className="w-24"><Progress value={p.done} max={p.total} /></div>
        </Link>
      ))}
      {q.data?.learnings.insights[0] && <p className="text-xs muted">💡 {msg(q.data.learnings.insights[0])}</p>}
    </Card>
  );
}

export default function Dashboard() {
  const { t, tr } = useI18n();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => get<DashboardData>("/dashboard") });
  if (q.isLoading || !q.data) return <PageLoader />;
  const d = q.data;
  const latest = d.generations.find((g) => g.status === "succeeded") ?? d.generations[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("Good morning") : hour < 18 ? t("Good afternoon") : t("Good evening");

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-cyan-600 p-6 text-white sm:p-8">
        <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-6">
          <div>
            <p className="text-sm opacity-85">{fmtToday()}</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{greeting}, {d.user.firstName}!</h1>
            <p className="mt-2 max-w-xl text-sm opacity-90">
              {t("You are on the {plan} plan. Create advertisements and see where demand is growing — all in one place.", { plan: d.user.plan === "pro" ? "Pro" : "Free" })}
            </p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={<FolderKanban className="h-4 w-4" />} label={t("Total projects")} value={fmtNumber(d.stats.totalProjects)} />
        <StatCard icon={<ImageIcon className="h-4 w-4" />} label={t("Ads created")} value={fmtNumber(d.stats.adsCreated)} tone="violet" />
        <StatCard icon={<BarChart3 className="h-4 w-4" />} label={t("Products analyzed")} value={fmtNumber(d.stats.productsAnalyzed)} hint={t("{n} forecasts completed", { n: d.stats.forecastsCompleted })} tone="cyan" />
      </div>

      <GrowthCard />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ServicePanel icon={<Sparkles className="h-5 w-5" />} title={t("AI Product Studio")} gradient="from-violet-600 to-brand-600" action={t("Create Advertisement")} to="/studio">
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

        <ServicePanel icon={<LineChart className="h-5 w-5" />} title={t("Demand Forecast")} gradient="from-cyan-600 to-sky-600" action={t("View Forecast")} to="/forecast">
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
                  <span className="rounded-lg bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{SERVICE_ICON[a.service] ?? <ActivityIcon className="h-4 w-4" />}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{tr(a.title)}</span>
                  {a.success ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-rose-500" />}
                  <span className="w-20 text-right text-xs muted">{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">{t("Monthly usage")}</h2>
            <Badge tone={d.usage.plan === "pro" ? "violet" : "slate"}>{d.usage.plan === "pro" ? "Pro" : "Free"}</Badge>
          </div>
          <div className="space-y-4">
            {([
              ["generations", "Ad generations"],
              ["forecasts", "Forecasts"],
              ["ai", "AI text requests"],
            ] as const).map(([k, label]) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-sm"><span>{t(label)}</span><span className="muted">{d.usage.metrics[k].used} / {d.usage.metrics[k].limit}</span></div>
                <Progress value={d.usage.metrics[k].used} max={d.usage.metrics[k].limit} />
              </div>
            ))}
          </div>
          {d.usage.plan === "free" && <Link to="/subscription"><Button variant="secondary" className="mt-5 w-full">{t("Upgrade to Pro")}</Button></Link>}
        </Card>
      </div>
    </div>
  );
}
