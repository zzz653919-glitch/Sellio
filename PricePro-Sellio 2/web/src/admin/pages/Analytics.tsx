import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SERIES_COLORS, useChartTheme } from "../../components/charts";
import { ErrorAlert } from "../../components/shared";
import { Badge, PageLoader } from "../../components/ui";
import { get } from "../../lib/api";
import { fmtNumber, timeAgo } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { DateRange, defaultRange, downloadUrl, Section, Stat, Table } from "../ui";
import { money, PROVIDER } from "./Dashboard";

type A = {
  daily: { date: string; signups: number; totalUsers: number; activeUsers: number; aiRequests: number; aiAds: number; templateBanners: number; forecasts: number; failedApiCalls: number }[];
  activity: { mau: number; avgDau: number };
  retention: { cohort: number; day7: number; day30: number; day30Eligible: number };
  aiByKind: { kind: string; n: number }[];
  topSearches: { q: string; n: number; users: number }[];
  forecastStatus: { status: string; n: number }[];
  conversion: { totalUsers: number; proUsers: number; ratePct: number; upgrades: { type: string; n: number }[] };
  revenue: { currency: string | null; amountCents: number; payments: number }[];
  api: { provider: string; total: number; failed: number; avgMs: number | null }[];
  apiErrors: { provider: string; error: string | null; count: number; last: string }[];
};

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");

export default function Analytics() {
  const { t } = useI18n();
  const ch = useChartTheme();
  const [range, setRange] = useState(defaultRange(30));
  const q = useQuery({ queryKey: ["admin-analytics", range], queryFn: () => get<A>(`/admin/analytics?from=${range.from}&to=${range.to}`), placeholderData: (p) => p });
  const csv = (report: string) => (
    <button type="button" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline" onClick={() => downloadUrl(`/admin/analytics/export?report=${report}&from=${range.from}&to=${range.to}`)}><Download className="h-3.5 w-3.5" />CSV</button>
  );
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const d = q.data!;
  const sum = (k: keyof A["daily"][number]) => d.daily.reduce((s, x) => s + (x[k] as number), 0);
  const axis = { tick: { fill: ch.axis, fontSize: 11 } };
  const xAxis = <XAxis dataKey="date" {...axis} tickFormatter={(v: string) => v.slice(5)} minTickGap={16} />;
  const upg = (type: string) => d.conversion.upgrades.find((u) => u.type === type)?.n ?? 0;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">{t("Analytics")}</h1><p className="text-sm muted">{t("Counted from Vendora's own records: sign-ups, activity, AI requests, analyses and logged API calls.")}</p></div>
        <DateRange from={range.from} to={range.to} onChange={setRange} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label={t("New users")} value={sum("signups")} tone="green" />
        <Stat label={t("Monthly active users")} value={d.activity.mau} hint={t("30 days before the end date")} />
        <Stat label={t("Average daily active")} value={d.activity.avgDau} />
        <Stat label={t("AI requests")} value={sum("aiRequests")} />
        <Stat label={t("Demand analyses")} value={sum("forecasts")} />
        <Stat label={t("Failed API calls")} value={sum("failedApiCalls")} tone={sum("failedApiCalls") ? "red" : "slate"} />
      </div>
      <Section title={t("Users")} actions={csv("daily")}>
        <div className="h-64"><ResponsiveContainer><LineChart data={d.daily}><CartesianGrid stroke={ch.grid} strokeDasharray="3 3" vertical={false} />{xAxis}<YAxis {...axis} allowDecimals={false} /><Tooltip {...ch.tooltip} /><Legend />
          <Line dataKey="signups" name={t("New users")} stroke={SERIES_COLORS[2]} dot={false} strokeWidth={2} />
          <Line dataKey="activeUsers" name={t("Active users")} stroke={SERIES_COLORS[0]} dot={false} strokeWidth={2} />
        </LineChart></ResponsiveContainer></div>
      </Section>
      <Section title={t("AI and service usage")}>
        <div className="h-64"><ResponsiveContainer><BarChart data={d.daily}><CartesianGrid stroke={ch.grid} strokeDasharray="3 3" vertical={false} />{xAxis}<YAxis {...axis} allowDecimals={false} /><Tooltip {...ch.tooltip} /><Legend />
          <Bar dataKey="aiRequests" stackId="a" name={t("AI text requests")} fill={SERIES_COLORS[0]} />
          <Bar dataKey="aiAds" stackId="a" name={t("AI ad images")} fill={SERIES_COLORS[4]} />
          <Bar dataKey="templateBanners" stackId="a" name={t("Template banners")} fill={SERIES_COLORS[1]} />
          <Bar dataKey="forecasts" stackId="a" name={t("Demand analyses")} fill={SERIES_COLORS[3]} />
        </BarChart></ResponsiveContainer></div>
      </Section>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Section title={t("Retention")}>
          <p className="text-xs muted">{t("Users who signed up in the period and came back later.")}</p>
          <Table head={[t("Measure"), t("Users"), "%"]}>
            <tr><td>{t("Signed up")}</td><td>{fmtNumber(d.retention.cohort)}</td><td>—</td></tr>
            <tr><td>{t("Returned on days 2–7")}</td><td>{fmtNumber(d.retention.day7)}</td><td>{pct(d.retention.day7, d.retention.cohort)}</td></tr>
            <tr><td>{t("Returned on days 8–30")}</td><td>{fmtNumber(d.retention.day30)}</td><td>{pct(d.retention.day30, d.retention.day30Eligible)}</td></tr>
          </Table>
          <p className="text-xs muted">{t("Day 8–30 percentage only counts users who signed up at least 30 days ago ({n}).", { n: d.retention.day30Eligible })}</p>
        </Section>
        <Section title={t("Conversion to Pro")}>
          <div className="grid grid-cols-2 gap-3"><Stat label={t("Pro users")} value={d.conversion.proUsers} tone="green" /><Stat label={t("Share of all users")} value={`${d.conversion.ratePct}%`} /></div>
          <Table head={[t("In the period"), t("Count")]}>
            <tr><td>{t("Upgraded by payment")}</td><td>{upg("upgraded")}</td></tr>
            <tr><td>{t("Assigned by admin")}</td><td>{upg("admin_assigned")}</td></tr>
          </Table>
        </Section>
        <Section title={t("Revenue")}>
          {d.revenue.length ? <Table head={[t("Revenue"), t("Payments")]}>{d.revenue.map((r) => <tr key={r.currency ?? "x"}><td>{money(r.amountCents, r.currency)}</td><td>{r.payments}</td></tr>)}</Table>
            : <p className="text-sm muted">{t("No confirmed payments in this period.")}</p>}
        </Section>
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title={t("Most searched products")} actions={csv("searches")}>
          <Table head={[t("Product"), t("Analyses"), t("Users")]} empty={!d.topSearches.length}>{d.topSearches.map((s) => <tr key={s.q}><td>{s.q}</td><td>{s.n}</td><td>{s.users}</td></tr>)}</Table>
          {d.forecastStatus.length > 0 && <p className="text-xs muted">{d.forecastStatus.map((f) => `${t(f.status)}: ${f.n}`).join(" · ")}</p>}
        </Section>
        <Section title={t("AI requests by type")} actions={csv("ai")}>
          <Table head={[t("Type"), t("Requests")]} empty={!d.aiByKind.length}>{d.aiByKind.map((k) => <tr key={k.kind}><td>{t(k.kind)}</td><td>{k.n}</td></tr>)}</Table>
        </Section>
      </div>
      <Section title={t("External API calls")} actions={csv("api")}>
        <Table head={[t("Service"), t("Calls"), t("Failed"), t("Average time")]} empty={!d.api.length}>
          {d.api.map((a) => <tr key={a.provider}><td>{PROVIDER[a.provider] ?? a.provider}</td><td>{fmtNumber(a.total)}</td><td>{a.failed ? <Badge tone="red">{a.failed} ({pct(a.failed, a.total)})</Badge> : 0}</td><td>{a.avgMs === null ? "—" : `${fmtNumber(a.avgMs)} ms`}</td></tr>)}
        </Table>
      </Section>
      <Section title={t("API errors")} actions={csv("api_errors")}>
        <Table head={[t("Service"), t("Error"), t("Count"), t("Last seen")]} empty={!d.apiErrors.length}>
          {d.apiErrors.map((e, i) => <tr key={i}><td>{PROVIDER[e.provider] ?? e.provider}</td><td className="max-w-[420px] text-xs text-rose-600">{e.error ?? "—"}</td><td>{e.count}</td><td>{timeAgo(e.last)}</td></tr>)}
        </Table>
      </Section>
    </div>
  );
}
