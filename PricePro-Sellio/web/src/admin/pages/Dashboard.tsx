import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useChartTheme } from "../../components/charts";
import { ErrorAlert } from "../../components/shared";
import { Badge, PageLoader } from "../../components/ui";
import { get } from "../../lib/api";
import { fmtDateTime, fmtNumber, timeAgo } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { DateRange, defaultRange, Section, Stat, Table } from "../ui";
import { planTone } from "../../lib/types";

type Dash = {
  stats: Record<string, number>;
  chart: { date: string; signups: number; activeUsers: number; ads: number; forecasts: number; aiRequests: number }[];
  api: { provider: string; total: number; failed: number }[];
  recentUsers: { id: string; email: string; name: string; plan: string; createdAt: string }[];
  recentProjects: { id: string; type: string; title: string; owner: string; createdAt: string }[];
  recentTransactions: { id: string; type: string; amountCents: number | null; currency: string | null; user: string; createdAt: string }[];
  alerts: { kind: string; count: number; link: string }[];
};
type System = { database: { ok: boolean; driver: string }; storage: { ok: boolean; driver: string }; email: { ok: boolean }; maintenance: { enabled: boolean }; integrations: { name: string; configured: boolean; lastFailure: string | null; lastSuccess: string | null }[] };

const ALERT: Record<string, string> = {
  pending_payments: "Payments waiting for review",
  open_tickets: "Open support requests", flagged_users: "Users reported as suspicious", failed_generations_7d: "Failed AI generations (7 days)",
  failed_api_calls: "Failed external API calls", suspended_users: "Suspended accounts",
};
export const PROVIDER: Record<string, string> = { serpapi: "Google Trends (SerpApi)", gemini: "Gemini", openai_text: "OpenAI text", openai_image: "OpenAI images", world_bank: "World Bank", comtrade: "UN Comtrade" };
export const money = (cents: number | null, cur: string | null) => (cents === null ? "—" : `${(cents / 100).toFixed(2)} ${(cur ?? "").toUpperCase()}`);

export default function Dashboard() {
  const { t } = useI18n();
  const ch = useChartTheme();
  const [range, setRange] = useState(defaultRange());
  const q = useQuery({ queryKey: ["admin-dash", range], queryFn: () => get<Dash>(`/admin/dashboard?from=${range.from}&to=${range.to}`), refetchInterval: 60_000, placeholderData: (p) => p });
  const sys = useQuery({ queryKey: ["admin-system"], queryFn: () => get<System>("/admin/system"), refetchInterval: 60_000 });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const d = q.data!;
  const s = d.stats;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[26px] font-extrabold tracking-[-0.03em]">{t("Dashboard")}</h1><p className="text-sm muted">{t("All numbers are counted from database records. Refreshes every minute.")}</p></div>
        <DateRange from={range.from} to={range.to} onChange={setRange} />
      </div>
      {d.alerts.length > 0 && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {d.alerts.map((a) => (
            <Link key={a.kind} to={a.link} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-600" /><span className="flex-1">{t(ALERT[a.kind] ?? a.kind)}</span><b>{fmtNumber(a.count)}</b>
            </Link>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label={t("Total users")} value={s.totalUsers} />
        <Stat label={t("Active users (30 days)")} value={s.activeUsers30} hint={t("{n} in 7 days", { n: s.activeUsers7 })} tone="green" />
        <Stat label={t("New users")} value={s.newUsers} hint={t("in the selected period")} tone="green" />
        <Stat label={t("Free plan")} value={s.freeUsers} tone="slate" />
        <Stat label={t("Pro / Max plans")} value={`${s.proUsers} / ${s.maxUsers ?? 0}`} hint={t("{n} paid by card", { n: s.paidSubscriptions })} />
        <Stat label={t("Total projects")} value={s.totalProjects} tone="slate" />
        <Stat label={t("AI advertisements")} value={s.adsAi} hint={t("+{n} template banners", { n: s.adsTemplates })} />
        <Stat label={t("Demand forecasts")} value={s.forecasts} />
        <Stat label={t("AI text requests")} value={s.aiRequests} />
        <Stat label={t("External API calls")} value={s.apiCalls} hint={t("{n} failed", { n: s.apiFailed })} tone={s.apiFailed ? "amber" : "slate"} />
        <Stat label={t("Open support requests")} value={s.openTickets} tone={s.openTickets ? "amber" : "slate"} />
        <Stat label={t("Suspended accounts")} value={s.suspended} tone={s.suspended ? "red" : "slate"} />
      </div>
      <Section title={t("Platform activity")}>
        <div className="h-72">
          <ResponsiveContainer>
            <LineChart data={d.chart} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid stroke={ch.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: ch.axis, fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} minTickGap={16} />
              <YAxis tick={{ fill: ch.axis, fontSize: 11 }} allowDecimals={false} />
              <Tooltip {...ch.tooltip} />
              <Legend />
              <Line dataKey="signups" name={t("Sign-ups")} stroke="#10b981" strokeWidth={2} dot={false} />
              <Line dataKey="activeUsers" name={t("Active users")} stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line dataKey="ads" name={t("Ads")} stroke="#ec4899" strokeWidth={2} dot={false} />
              <Line dataKey="forecasts" name={t("Forecasts")} stroke="#06b6d4" strokeWidth={2} dot={false} />
              <Line dataKey="aiRequests" name={t("AI text requests")} stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section title={t("System status")}>
          {sys.data ? (
            <div className="space-y-2 text-sm">
              {[[t("Database"), sys.data.database.ok, sys.data.database.driver], [t("File storage"), sys.data.storage.ok, sys.data.storage.driver], [t("Email"), sys.data.email.ok, "SMTP"]].map(([name, ok, extra]) => (
                <p key={String(name)} className="flex items-center justify-between"><span>{name} <span className="text-xs muted">{String(extra)}</span></span><Badge tone={ok ? "green" : "red"}>{ok ? t("Working") : t("Problem")}</Badge></p>
              ))}
              {sys.data.maintenance.enabled && <p className="flex justify-between"><span>{t("Maintenance mode")}</span><Badge tone="amber">{t("On")}</Badge></p>}
              {sys.data.integrations.map((i) => (
                <p key={i.name} className="flex items-center justify-between gap-2"><span className="truncate">{i.name}</span>
                  <Badge tone={!i.configured ? "slate" : i.lastFailure && (!i.lastSuccess || i.lastFailure > i.lastSuccess) ? "amber" : "green"}>{!i.configured ? t("Not connected") : i.lastFailure && (!i.lastSuccess || i.lastFailure > i.lastSuccess) ? t("Last call failed") : t("Connected")}</Badge></p>
              ))}
            </div>
          ) : sys.error ? <ErrorAlert error={sys.error} /> : null}
        </Section>
        <Section title={t("API usage")}>
          <Table head={[t("Service"), t("Calls"), t("Failed")]} empty={!d.api.length}>
            {d.api.map((a) => <tr key={a.provider}><td>{PROVIDER[a.provider] ?? a.provider}</td><td>{fmtNumber(a.total)}</td><td className={a.failed ? "text-rose-600" : ""}>{fmtNumber(a.failed)}</td></tr>)}
          </Table>
        </Section>
        <Section title={t("Recent registrations")} actions={<Link to="/admin/users" className="text-sm text-brand-600 hover:underline">{t("All users →")}</Link>}>
          <Table head={[t("User"), t("Plan"), t("Registered")]} empty={!d.recentUsers.length}>
            {d.recentUsers.map((u) => <tr key={u.id}><td><Link to={`/admin/users/${u.id}`} className="font-medium hover:underline">{u.name}</Link><span className="block text-xs muted">{u.email}</span></td><td><Badge tone={planTone(u.plan)}>{u.plan}</Badge></td><td title={fmtDateTime(u.createdAt)}>{timeAgo(u.createdAt)}</td></tr>)}
          </Table>
        </Section>
        <Section title={t("Recent projects")}>
          <Table head={[t("Project"), t("Type"), t("Owner"), t("Created")]} empty={!d.recentProjects.length}>
            {d.recentProjects.map((p) => <tr key={p.id}><td className="max-w-[200px] truncate">{p.title}</td><td>{t(p.type)}</td><td className="text-xs">{p.owner}</td><td>{timeAgo(p.createdAt)}</td></tr>)}
          </Table>
        </Section>
        {d.recentTransactions.length > 0 && (
          <Section title={t("Recent transactions")} actions={<Link to="/admin/payments" className="text-sm text-brand-600 hover:underline">{t("Payments →")}</Link>}>
            <Table head={[t("Event"), t("User"), t("Amount"), t("Date")]}>
              {d.recentTransactions.map((x) => <tr key={x.id}><td>{t(x.type)}</td><td className="text-xs">{x.user}</td><td>{money(x.amountCents, x.currency)}</td><td>{timeAgo(x.createdAt)}</td></tr>)}
            </Table>
          </Section>
        )}
      </div>
    </div>
  );
}
