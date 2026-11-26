import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Pencil } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SERIES_COLORS, useChartTheme } from "../../components/charts";
import { ErrorAlert } from "../../components/shared";
import { Alert, Badge, Field, Input, PageLoader, Select, Tabs, Toggle, useToast } from "../../components/ui";
import { get, put } from "../../lib/api";
import { fmtDateTime, fmtInZone, fmtNumber, timeAgo } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { ConfirmWithPassword, DateRange, defaultRange, downloadUrl, Pager, Section, Stat, Table, useCan, useList } from "../ui";
import { money } from "./Dashboard";

type UMetric = { used: number; limit: number; remaining: number; period: "hours" | "day" | "month"; windowHours?: number | null; resetsAt: string };
type UsageSummary = { timezone: string; today: { byService: { service: string; n: number }[] }; month: { byService: { service: string; n: number }[]; byPlan: { plan: string; n: number }[] }; inProgress: number; daily: { date: string; generation: number; forecast: number }[] };
type Plan = { key: "free" | "pro" | "max"; name: string; priceMonthlyUsd: number; priceYearlyUsd: number | null; limits: { requests: number; forecasts?: number; ai: number }; requestPeriod: "hours" | "day" | "month"; periodHours?: number; dailyImageLimit: number | null; benefits: string[]; enabled: boolean; users: number };

function PlanEditor({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: plan.name, priceMonthlyUsd: String(plan.priceMonthlyUsd), priceYearlyUsd: plan.priceYearlyUsd === null ? "" : String(plan.priceYearlyUsd), requests: String(plan.limits.requests), forecasts: String(plan.limits.forecasts ?? plan.limits.requests), requestPeriod: plan.requestPeriod, periodHours: String(plan.periodHours ?? 5), dailyImageLimit: plan.dailyImageLimit === null ? "" : String(plan.dailyImageLimit), ai: String(plan.limits.ai), benefits: plan.benefits.join("\n"), enabled: plan.enabled });
  const save = useMutation({
    mutationFn: (password: string) => put(`/admin/plans/${plan.key}`, {
      name: f.name, priceMonthlyUsd: Number(f.priceMonthlyUsd), priceYearlyUsd: f.priceYearlyUsd === "" ? null : Number(f.priceYearlyUsd), limits: { requests: Number(f.requests), forecasts: Number(f.forecasts), ai: Number(f.ai) }, requestPeriod: f.requestPeriod, periodHours: Math.max(1, Math.min(168, Number(f.periodHours) || 1)), dailyImageLimit: f.dailyImageLimit === "" ? null : Number(f.dailyImageLimit),
      benefits: f.benefits.split("\n").map((b) => b.trim()).filter(Boolean), enabled: f.enabled, password,
    }),
    onSuccess: () => { toast("success", t("Saved")); void qc.invalidateQueries({ queryKey: ["admin-plans"] }); onClose(); },
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <ConfirmWithPassword open title={t("Edit plan: {x}", { x: plan.name })} confirmLabel={t("Save")} error={save.error} loading={save.isPending} onConfirm={(p) => save.mutate(p)} onClose={onClose}
      text={t("Limits and prices apply immediately. The card payment page charges these prices.")}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Name")}><Input value={f.name} onChange={set("name")} maxLength={40} /></Field>
        <Field label={t("Price per month (USD)")}><Input type="number" min={0} value={f.priceMonthlyUsd} onChange={set("priceMonthlyUsd")} /></Field>
        {plan.key !== "free" && <Field label={t("Price per year (USD)")} hint={t("Empty = no yearly payment")}><Input type="number" min={0} value={f.priceYearlyUsd} onChange={set("priceYearlyUsd")} /></Field>}
        <Field label={t("AI ad images")}><Input type="number" min={0} value={f.requests} onChange={set("requests")} /></Field>
        <Field label={t("Demand forecasts")}><Input type="number" min={0} value={f.forecasts} onChange={set("forecasts")} /></Field>
        <Field label={t("Reset schedule")}>
          <Select value={f.requestPeriod} onChange={(e) => setF((s) => ({ ...s, requestPeriod: e.target.value as "hours" | "day" | "month" }))}
            options={[{ value: "hours", label: t("Every few hours (rolling)") }, { value: "day", label: t("Every day at 00:00") }, { value: "month", label: t("1st of every month at 00:00") }]} />
        </Field>
        {f.requestPeriod === "hours" && <Field label={t("Hours")} hint={t("Each request is free again this many hours after it was used.")}><Input type="number" min={1} max={168} value={f.periodHours} onChange={set("periodHours")} /></Field>}
        <Field label={t("Extra daily cap on AI images")} hint={t("Empty = no extra daily limit")}><Input type="number" min={0} value={f.dailyImageLimit} onChange={set("dailyImageLimit")} /></Field>
        <Field label={t("AI text requests / month")}><Input type="number" min={0} value={f.ai} onChange={set("ai")} /></Field>
      </div>
      <Field label={t("Benefits (one per line)")}><textarea className="input min-h-24" value={f.benefits} onChange={set("benefits")} /></Field>
      {plan.key !== "free" && <Toggle checked={f.enabled} onChange={(v) => setF((s) => ({ ...s, enabled: v }))} label={t("Available for purchase")} />}
    </ConfirmWithPassword>
  );
}

function Subscriptions() {
  const { t } = useI18n();
  const ch = useChartTheme();
  const can = useCan();
  const [tab, setTab] = useState<"plans" | "subs" | "history" | "usage">("plans");
  const [status, setStatus] = useState("active");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Plan | null>(null);
  const plans = useQuery({ queryKey: ["admin-plans"], queryFn: () => get<{ plans: Plan[]; paymentsConnected: boolean }>("/admin/plans") });
  const subs = useList<{ items: { userId: string; email: string; plan: string; status: string; provider: string; periodEnd: string | null; cancelAtPeriodEnd: boolean; updatedAt: string }[]; total: number; page: number; limit: number; summary: { active: number; ended: number; admin: number } }>(["admin-subs"], "/admin/subscriptions", { status, q, page });
  const events = useList<{ items: { id: string; type: string; plan: string | null; amountCents: number | null; currency: string | null; user: string; createdAt: string }[]; total: number; page: number; limit: number }>(["admin-sub-events"], "/admin/subscriptions/events", { page });
  const usage = useQuery({ queryKey: ["admin-usage"], queryFn: () => get<{ items: { userId: string; email: string; plan: string; timezone: string; requests: UMetric; ai: UMetric; maxPct: number }[] }>("/admin/subscriptions/usage"), enabled: tab === "usage" });
  const summary = useQuery({ queryKey: ["admin-usage-summary"], queryFn: () => get<UsageSummary>("/admin/usage/summary"), enabled: tab === "usage" });
  return (
    <div className="space-y-4">
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em]">{t("Subscriptions")}</h1>
      {plans.data && !plans.data.paymentsConnected && <Alert tone="info">{t("Card payments are turned off in Settings, so users cannot buy a plan right now. Administrators can still assign plans.")}</Alert>}
      {subs.data && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><Stat label={t("Active paid / Pro")} value={subs.data.summary.active} tone="green" /><Stat label={t("Ended")} value={subs.data.summary.ended} tone="slate" /><Stat label={t("Assigned by admin")} value={subs.data.summary.admin} tone="amber" /></div>}
      <div className="overflow-x-auto"><Tabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} tabs={[{ value: "plans", label: t("Plans") }, { value: "subs", label: t("Subscriptions") }, { value: "history", label: t("History") }, { value: "usage", label: t("Usage") }]} /></div>
      {tab === "plans" && (plans.isLoading ? <PageLoader /> : plans.error ? <ErrorAlert error={plans.error} /> : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {plans.data!.plans.map((p) => (
            <Section key={p.key} title={`${p.name} · $${p.priceMonthlyUsd}/${t("month")}${p.priceYearlyUsd !== null ? ` · $${p.priceYearlyUsd}/${t("year")}` : ""}`} actions={can("plans.manage") ? <button type="button" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" />{t("Edit")}</button> : undefined}>
              <p className="text-sm">{t("{n} users", { n: fmtNumber(p.users) })} · <Badge tone={p.enabled ? "green" : "slate"}>{p.enabled ? t("Available") : t("Disabled")}</Badge></p>
              <Table head={[t("AI ad images"), t("Demand forecasts"), t("Reset schedule"), t("AI text requests")]}><tr><td>{p.limits.requests}</td><td>{p.limits.forecasts ?? p.limits.requests}</td><td>{p.requestPeriod === "hours" ? t("Every {h} hours (rolling)", { h: p.periodHours ?? 1 }) : t(p.requestPeriod === "day" ? "Every day at 00:00" : "1st of every month at 00:00")}</td><td>{p.limits.ai} / {t("month")}</td></tr></Table>
              <ul className="list-disc pl-5 text-sm muted">{p.benefits.map((b) => <li key={b}>{b}</li>)}</ul>
            </Section>
          ))}
        </div>
      ))}
      {tab === "subs" && (
        <Section title={t("Subscriptions")}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={t("User email")} className="flex-1" />
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={[{ value: "active", label: t("Active") }, { value: "ended", label: t("Ended / expired") }, { value: "admin", label: t("Assigned by admin") }, { value: "all", label: t("All") }]} className="sm:w-56" />
          </div>
          {subs.error && <ErrorAlert error={subs.error} />}
          <Table head={[t("User"), t("Plan"), t("Status"), t("Source"), t("Period ends"), t("Updated")]} empty={subs.data?.items.length === 0}>
            {(subs.data?.items ?? []).map((s) => <tr key={s.userId}><td><Link to={`/admin/users/${s.userId}`} className="hover:underline">{s.email}</Link></td><td>{s.plan}</td><td>{s.status}{s.cancelAtPeriodEnd && ` · ${t("cancels at period end")}`}</td><td>{s.provider}</td><td>{s.periodEnd ? fmtDateTime(s.periodEnd) : "—"}</td><td>{timeAgo(s.updatedAt)}</td></tr>)}
          </Table>
          {subs.data && <Pager page={subs.data.page} limit={subs.data.limit} total={subs.data.total} onPage={setPage} />}
        </Section>
      )}
      {tab === "history" && (
        <Section title={t("Subscription history")}>
          <Table head={[t("Event"), t("User"), t("Plan"), t("Amount"), t("Date")]} empty={events.data?.items.length === 0}>
            {(events.data?.items ?? []).map((e) => <tr key={e.id}><td>{t(e.type)}</td><td className="text-xs">{e.user}</td><td>{e.plan ?? "—"}</td><td>{money(e.amountCents, e.currency)}</td><td>{fmtDateTime(e.createdAt)}</td></tr>)}
          </Table>
          {events.data && <Pager page={events.data.page} limit={events.data.limit} total={events.data.total} onPage={setPage} />}
        </Section>
      )}
      {tab === "usage" && (
        <div className="space-y-4">
          {summary.data && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label={t("Requests today")} value={summary.data.today.byService.reduce((x, r) => x + r.n, 0)} hint={summary.data.timezone} />
              <Stat label={t("Requests this month")} value={summary.data.month.byService.reduce((x, r) => x + r.n, 0)} tone="green" />
              <Stat label={t("AI ads this month")} value={summary.data.month.byService.find((r) => r.service === "generation")?.n ?? 0} tone="slate" />
              <Stat label={t("Forecasts this month")} value={summary.data.month.byService.find((r) => r.service === "forecast")?.n ?? 0} tone="slate" />
            </div>
          )}
          {summary.data && (
            <Section title={t("Counted requests per day")}>
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={summary.data.daily}><CartesianGrid stroke={ch.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: ch.axis, fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} minTickGap={16} /><YAxis tick={{ fill: ch.axis, fontSize: 11 }} allowDecimals={false} /><Tooltip {...ch.tooltip} />
                    <Bar dataKey="generation" stackId="a" name={t("AI ads")} fill={SERIES_COLORS[1]} />
                    <Bar dataKey="forecast" stackId="a" name={t("Forecasts")} fill={SERIES_COLORS[0]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs muted">{t("By plan this month")}: {summary.data.month.byPlan.map((x) => `${x.plan}: ${x.n}`).join(" · ") || "—"}{summary.data.inProgress ? ` · ${t("in progress now")}: ${summary.data.inProgress}` : ""}</p>
            </Section>
          )}
          <Section title={t("Current usage per user (closest to the limit first)")}>
            {usage.error && <ErrorAlert error={usage.error} />}
            <Table head={[t("User"), t("Plan"), t("Requests"), t("Next reset"), t("AI text requests"), "%"]} empty={usage.data?.items.length === 0}>
              {(usage.data?.items ?? []).map((u) => (
                <tr key={u.userId}>
                  <td><Link to={`/admin/users/${u.userId}`} className="hover:underline">{u.email}</Link></td>
                  <td>{u.plan}</td>
                  <td>{u.requests.used}/{u.requests.limit} <span className="text-xs muted">({u.requests.period === "hours" ? t("per {h} hours", { h: u.requests.windowHours ?? 1 }) : t(u.requests.period === "day" ? "per day" : "per month")})</span></td>
                  <td className="text-xs">{fmtInZone(u.requests.resetsAt, u.timezone)} <span className="muted">{u.timezone}</span></td>
                  <td>{u.ai.used}/{u.ai.limit}</td>
                  <td><Badge tone={u.maxPct >= 100 ? "red" : u.maxPct >= 80 ? "amber" : "slate"}>{u.maxPct}%</Badge></td>
                </tr>
              ))}
            </Table>
          </Section>
        </div>
      )}
      {editing && <PlanEditor plan={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

type Payments = {
  connected: boolean; totals: { type: string; currency: string | null; count: number; amountCents: number }[]; allTimeRevenue: { currency: string | null; amountCents: number }[];
  chart: Record<string, number | string>[]; currencies: string[]; monthly: { month: string; currency: string | null; amountCents: number; payments: number }[];
  history: { id: string; type: string; amountCents: number | null; currency: string | null; reference: string | null; user: string; createdAt: string }[]; total: number; page: number; limit: number;
};

function PaymentsPage() {
  const { t } = useI18n();
  const ch = useChartTheme();
  const [range, setRange] = useState(defaultRange(90));
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ["admin-payments", range, page], queryFn: () => get<Payments>(`/admin/payments?from=${range.from}&to=${range.to}&page=${page}`), placeholderData: (p) => p });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const d = q.data!;
  const sumOf = (type: string) => d.totals.filter((x) => x.type === type);
  const fmt = (rows: { amountCents: number; currency: string | null }[]) => rows.length ? rows.map((r) => money(r.amountCents, r.currency)).join(" + ") : "0";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[26px] font-extrabold tracking-[-0.03em]">{t("Payments and revenue")}</h1><p className="text-sm muted">{t("Card payments approved by an administrator are shown here.")}</p></div>
        <div className="flex flex-wrap gap-2"><DateRange from={range.from} to={range.to} onChange={(r) => { setRange(r); setPage(1); }} /><button type="button" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline" onClick={() => downloadUrl(`/admin/payments/export?from=${range.from}&to=${range.to}`)}><Download className="h-4 w-4" />CSV</button></div>
      </div>
      {!d.connected && <Alert tone="warning">{t("Card payments are turned off in Settings.")}</Alert>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("Revenue in period")} value={fmt(sumOf("payment"))} tone="green" hint={t("{n} payments", { n: sumOf("payment").reduce((s, x) => s + x.count, 0) })} />
        <Stat label={t("Total revenue")} value={fmt(d.allTimeRevenue)} />
        <Stat label={t("Failed payments")} value={sumOf("payment_failed").reduce((s, x) => s + x.count, 0)} tone="red" />
        <Stat label={t("Refunds")} value={fmt(sumOf("refund"))} tone="amber" hint={t("{n} refunds", { n: sumOf("refund").reduce((s, x) => s + x.count, 0) })} />
      </div>
      {d.currencies.length > 0 && (
        <Section title={t("Daily revenue")}>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={d.chart}><CartesianGrid stroke={ch.grid} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="date" tick={{ fill: ch.axis, fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} minTickGap={16} /><YAxis tick={{ fill: ch.axis, fontSize: 11 }} /><Tooltip {...ch.tooltip} />
                {d.currencies.map((c, i) => <Bar key={c} dataKey={c} name={c.toUpperCase()} fill={SERIES_COLORS[i % SERIES_COLORS.length]} radius={[4, 4, 0, 0]} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}
      {d.monthly.length > 0 && <Section title={t("Monthly revenue")}><Table head={[t("Month"), t("Revenue"), t("Payments")]}>{d.monthly.map((m) => <tr key={`${m.month}${m.currency}`}><td>{m.month}</td><td>{money(m.amountCents, m.currency)}</td><td>{m.payments}</td></tr>)}</Table></Section>}
      <Section title={t("Payment history")}>
        <Table head={[t("Event"), t("User"), t("Amount"), t("Reference"), t("Date")]} empty={!d.history.length}>
          {d.history.map((h) => <tr key={h.id}><td><Badge tone={h.type === "payment" ? "green" : h.type === "payment_failed" ? "red" : h.type === "refund" ? "amber" : "slate"}>{t(h.type)}</Badge></td><td className="text-xs">{h.user}</td><td>{money(h.amountCents, h.currency)}</td><td className="text-xs">{h.reference ?? "—"}</td><td>{fmtDateTime(h.createdAt)}</td></tr>)}
        </Table>
        <Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />
      </Section>
    </div>
  );
}

export default function Billing({ which }: { which: "subscriptions" | "payments" }) {
  return which === "subscriptions" ? <Subscriptions /> : <PaymentsPage />;
}
