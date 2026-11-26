import { useQuery } from "@tanstack/react-query";
import { BarChart3, CheckCircle2, Download, FolderKanban, Heart, ImageIcon, LineChart, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ErrorAlert, StatCard } from "../components/shared";
import { Badge, Button, Card, Input, PageHeader, PageLoader, Select, Tabs } from "../components/ui";
import { get } from "../lib/api";
import { downloadCsv, fmtAxis, fmtDateTime, fmtNumber } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/theme";
import type { Activity } from "../lib/types";

type Summary = {
  range: { from: string; to: string };
  totals: { adsGenerated: number; adsFailed: number; forecastsCompleted: number; productsAnalyzed: number; projectsSaved: number; favoritesAdded: number };
  timeline: { date: string; studio: number; forecast: number; projects: number }[];
  performance: { service: string; total: number; successRate: number | null; avgDurationMs: number | null }[];
  usageByService: { service: string; n: number }[];
};

const COLORS: Record<string, string> = { studio: "#8b5cf6", forecast: "#06b6d4", projects: "#6366f1", account: "#94a3b8" };
const SERVICE_LABEL: Record<string, string> = { studio: "AI Product Studio", forecast: "Demand Forecast", projects: "Projects", account: "Account" };
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function Analytics() {
  const { t, tr } = useI18n();
  const { resolved } = useTheme();
  const [preset, setPreset] = useState<"7" | "30" | "90" | "custom">("30");
  const [custom, setCustom] = useState({ from: iso(new Date(Date.now() - 29 * 86_400_000)), to: iso(new Date()) });
  const [service, setService] = useState("");
  const [page, setPage] = useState(0);

  const range = useMemo(() => {
    if (preset === "custom") return custom;
    const to = new Date();
    return { from: iso(new Date(to.getTime() - (Number(preset) - 1) * 86_400_000)), to: iso(to) };
  }, [preset, custom]);

  const summary = useQuery({ queryKey: ["analytics", range], queryFn: () => get<Summary>(`/analytics/summary?from=${range.from}&to=${range.to}`) });
  const activity = useQuery({
    queryKey: ["activity", range, service, page],
    queryFn: () => get<{ items: Activity[]; total: number }>(`/analytics/activity?from=${range.from}&to=${range.to}&limit=15&offset=${page * 15}${service ? `&service=${service}` : ""}`),
  });

  const grid = resolved === "dark" ? "#1e293b" : "#e2e8f0";
  const axis = resolved === "dark" ? "#94a3b8" : "#64748b";
  const s = summary.data;

  const exportReport = () => {
    if (!s) return;
    downloadCsv(`vendora-usage-${range.from}-to-${range.to}.csv`, [
      ["Vendora usage report", `${range.from} to ${range.to}`],
      [],
      ["metric", "value"],
      ...Object.entries(s.totals).map(([k, v]) => [k, v]),
      [],
      ["date", "studio", "forecast", "projects"],
      ...s.timeline.map((d) => [d.date, d.studio, d.forecast, d.projects]),
      [],
      ["service", "operations", "success_rate_pct", "avg_duration_ms"],
      ...s.performance.map((p) => [p.service, p.total, p.successRate, p.avgDurationMs]),
    ]);
  };

  return (
    <div>
      <PageHeader icon={<BarChart3 className="h-6 w-6" />} title={t("Analytics")} subtitle={t("Calculated from your actual activity on Vendora.")}
        actions={<Button variant="secondary" disabled={!s} onClick={exportReport} icon={<Download className="h-4 w-4" />}>{t("Usage report (CSV)")}</Button>} />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Tabs value={preset} onChange={(v) => { setPreset(v); setPage(0); }} tabs={[
          { value: "7", label: t("7 days") }, { value: "30", label: t("30 days") }, { value: "90", label: t("90 days") }, { value: "custom", label: t("Custom") },
        ]} />
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label={t("From")} />
            <span className="muted">–</span>
            <Input type="date" value={custom.to} min={custom.from} max={iso(new Date())} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label={t("To")} />
          </div>
        )}
      </div>

      {summary.error && <ErrorAlert error={summary.error} />}
      {!s ? <PageLoader /> : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard icon={<ImageIcon className="h-4 w-4" />} label={t("Ads generated")} value={fmtNumber(s.totals.adsGenerated)} hint={s.totals.adsFailed ? t("{n} failed", { n: s.totals.adsFailed }) : undefined} tone="violet" />
            <StatCard icon={<LineChart className="h-4 w-4" />} label={t("Products analyzed")} value={fmtNumber(s.totals.productsAnalyzed)} hint={t("{n} forecasts completed", { n: s.totals.forecastsCompleted })} tone="cyan" />
            <StatCard icon={<FolderKanban className="h-4 w-4" />} label={t("Projects saved")} value={fmtNumber(s.totals.projectsSaved)} />
            <StatCard icon={<Heart className="h-4 w-4" />} label={t("Favorites added")} value={fmtNumber(s.totals.favoritesAdded)} tone="amber" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <h2 className="mb-4 font-semibold">{t("Activity over time")}</h2>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={s.timeline} margin={{ left: -16 }}>
                    <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: axis, fontSize: 11 }} tickFormatter={(d: string) => fmtAxis(d, "day")} minTickGap={16} />
                    <YAxis allowDecimals={false} tick={{ fill: axis, fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: resolved === "dark" ? "#0f172a" : "#fff", border: `1px solid ${grid}`, borderRadius: 12 }} />
                    <Legend />
                    {(["studio", "forecast", "projects"] as const).map((k) => (
                      <Bar key={k} dataKey={k} stackId="a" name={t(SERVICE_LABEL[k])} fill={COLORS[k]} radius={k === "projects" ? [4, 4, 0, 0] : 0} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="p-5">
              <h2 className="mb-4 font-semibold">{t("Service usage")}</h2>
              {s.usageByService.length === 0 ? <p className="py-16 text-center text-sm muted">{t("No activity in this period.")}</p> : (
                <div className="h-72">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={s.usageByService.map((u) => ({ name: t(SERVICE_LABEL[u.service] ?? u.service), value: u.n, key: u.service }))} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                        {s.usageByService.map((u) => <Cell key={u.service} fill={COLORS[u.service] ?? "#94a3b8"} />)}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <Card className="p-5">
            <h2 className="mb-4 font-semibold">{t("Service performance")}</h2>
            {s.performance.length === 0 ? <p className="py-6 text-center text-sm muted">{t("No service operations in this period.")}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs muted"><th className="py-2">{t("Service")}</th><th>{t("Operations")}</th><th>{t("Success rate")}</th><th>{t("Avg. duration")}</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {s.performance.map((p) => (
                      <tr key={p.service}>
                        <td className="py-2.5 font-medium">{t(SERVICE_LABEL[p.service] ?? p.service)}</td>
                        <td>{p.total}</td>
                        <td><Badge tone={p.successRate === null ? "slate" : p.successRate >= 90 ? "green" : p.successRate >= 60 ? "amber" : "red"}>{p.successRate === null ? "—" : `${p.successRate}%`}</Badge></td>
                        <td>{p.avgDurationMs === null ? "—" : p.avgDurationMs > 1000 ? `${(p.avgDurationMs / 1000).toFixed(1)} s` : `${p.avgDurationMs} ms`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      <Card className="mt-6 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">{t("Activity history")}</h2>
          <Select className="w-52" aria-label={t("Service")} value={service} onChange={(e) => { setService(e.target.value); setPage(0); }}
            options={[{ value: "", label: t("All services") }, ...Object.keys(SERVICE_LABEL).map((k) => ({ value: k, label: t(SERVICE_LABEL[k]) }))]} />
        </div>
        {activity.data?.items.length === 0 ? <p className="py-6 text-center text-sm muted">{t("No activity in this period.")}</p> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {activity.data?.items.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                {a.success ? <CheckCircle2 className="h-4 w-4 flex-none text-emerald-500" /> : <XCircle className="h-4 w-4 flex-none text-rose-500" />}
                <span className="min-w-0 flex-1 truncate">{tr(a.title)}</span>
                <Badge tone="slate">{t(SERVICE_LABEL[a.service] ?? a.service)}</Badge>
                <span className="hidden w-40 text-right text-xs muted sm:block">{fmtDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
        {activity.data && activity.data.total > 15 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="muted">{t("Page {p} of {n}", { p: page + 1, n: Math.ceil(activity.data.total / 15) })}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>{t("Previous")}</Button>
              <Button size="sm" variant="secondary" disabled={(page + 1) * 15 >= activity.data.total} onClick={() => setPage((p) => p + 1)}>{t("Next")}</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
