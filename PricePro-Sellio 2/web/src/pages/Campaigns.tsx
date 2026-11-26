import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, CalendarDays, CheckCircle2, Circle, Megaphone, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SourceNote, useChartTheme } from "../components/charts";
import { ErrorAlert, IntegrationNotice, StatCard } from "../components/shared";
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Progress, Select, Spinner, Tabs, cx, useToast } from "../components/ui";
import { del, errorMessage, get, patch, post, put } from "../lib/api";
import { fmtAmount, fmtDate, fmtNumber } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useMeta } from "../lib/hooks";

type Totals = { impressions: number; clicks: number; conversions: number; spend: number; revenue: number | null; ctrPct: number | null; conversionRatePct: number | null; cpc: number | null; cpa: number | null; roas: number | null };
type Item = { id: string; date: string; channel: string; title: string; content: string | null; status: "planned" | "done"; source: "manual" | "ai" };
type Stat = { id: string; date: string; creative: string; channel: string | null; impressions: number; clicks: number; conversions: number; spend: number; revenue: number | null };
type Plan = { summary: string; objectives: string[]; audience: string[]; kpis: string[]; budgetSplit: { channel: string; pct: number; amount: number | null; reason: string }[]; generatedAt: string };
type Campaign = {
  id: string; name: string; objective: string; product: string | null; audience: string | null; budget: number | null; currency: string;
  startDate: string; endDate: string; channels: string[]; status: "draft" | "active" | "finished"; plan: Plan | null;
  progress: { itemsDone: number; itemsTotal: number; spent: number; budgetUsedPct: number | null }; totals: Totals;
  items?: Item[]; stats?: Stat[]; byCreative?: (Totals & { creative: string })[];
};

const OBJECTIVES: Record<string, string> = { awareness: "Brand awareness", traffic: "Visits / messages", sales: "Sales", leads: "Leads (requests)", launch: "New product launch", seasonal: "Seasonal promotion" };
const CHANNELS: Record<string, string> = { instagram: "Instagram", telegram: "Telegram", facebook: "Facebook", google: "Google Ads", tiktok: "TikTok", youtube: "YouTube", offline: "Offline", other: "Other" };
const STATUS: Record<string, string> = { draft: "Draft", active: "Active", finished: "Finished" };
/** Today in the user's own time zone (not UTC). */
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type Form = { name: string; objective: string; product: string; audience: string; budget: string; currency: string; startDate: string; endDate: string; channels: string[]; status: string };
const emptyForm = (): Form => ({ name: "", objective: "sales", product: "", audience: "", budget: "", currency: "UZS", startDate: today(), endDate: plusDays(today(), 27), channels: ["instagram", "telegram"], status: "active" });

function CampaignForm({ initial, onSaved, onCancel, id }: { initial: Form; onSaved: (c: Campaign) => void; onCancel: () => void; id?: string }) {
  const { t } = useI18n();
  const [f, setF] = useState(initial);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...f, budget: f.budget === "" ? null : Number(f.budget), product: f.product || undefined, audience: f.audience || undefined };
      return id ? put<{ campaign: Campaign }>(`/campaigns/${id}`, body) : post<{ campaign: Campaign }>("/campaigns", body);
    },
    onSuccess: (d) => onSaved(d.campaign),
  });
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <Field label={t("Name")}><Input value={f.name} onChange={set("name")} required maxLength={120} placeholder={t("e.g. Navruz sale")} /></Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t("Goal")}><Select value={f.objective} onChange={set("objective")} options={Object.entries(OBJECTIVES).map(([v, l]) => ({ value: v, label: t(l) }))} /></Field>
        <Field label={t("Product or service")}><Input value={f.product} onChange={set("product")} maxLength={120} /></Field>
        <Field label={t("Start")}><Input type="date" value={f.startDate} onChange={set("startDate")} required /></Field>
        <Field label={t("End")}><Input type="date" value={f.endDate} onChange={set("endDate")} required /></Field>
        <Field label={t("Budget")}><Input type="number" min={0} value={f.budget} onChange={set("budget")} /></Field>
        <Field label={t("Currency")}><Select value={f.currency} onChange={set("currency")} options={["UZS", "USD", "EUR", "RUB", "KZT"].map((c) => ({ value: c, label: c }))} /></Field>
      </div>
      <Field label={t("Audience")}><Input value={f.audience} onChange={set("audience")} maxLength={300} placeholder={t("e.g. women 25–40 in Tashkent")} /></Field>
      <Field label={t("Channels")}>
        <div className="flex flex-wrap gap-2">
          {Object.entries(CHANNELS).map(([v, l]) => (
            <label key={v} className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs dark:border-slate-700">
              <input type="checkbox" className="accent-brand-600" checked={f.channels.includes(v)} onChange={() => setF((s) => ({ ...s, channels: s.channels.includes(v) ? s.channels.filter((x) => x !== v) : [...s.channels, v] }))} />{t(l)}
            </label>
          ))}
        </div>
      </Field>
      {id && <Field label={t("Status")}><Select value={f.status} onChange={set("status")} options={Object.entries(STATUS).map(([v, l]) => ({ value: v, label: t(l) }))} /></Field>}
      {save.error && <ErrorAlert error={save.error} />}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>{t("Cancel")}</Button><Button type="submit" loading={save.isPending} disabled={!f.channels.length}>{t("Save")}</Button></div>
    </form>
  );
}

// ------------------------------------------------------------------ plan
function PlanTab({ c, setC }: { c: Campaign; setC: (c: Campaign) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const meta = useMeta();
  const [item, setItem] = useState({ date: c.startDate, channel: c.channels[0] ?? "instagram", title: "", content: "" });
  const ai = useMutation({ mutationFn: () => post<{ campaign: Campaign; added: number }>(`/campaigns/${c.id}/plan`, { replace: true }), onSuccess: (d) => { setC(d.campaign); toast("success", t("Plan ready: {n} ideas added to the calendar.", { n: d.added })); } });
  const add = useMutation({ mutationFn: () => post<{ campaign: Campaign }>(`/campaigns/${c.id}/items`, { ...item, content: item.content || undefined }), onSuccess: (d) => { setC(d.campaign); setItem((s) => ({ ...s, title: "", content: "" })); } });
  const toggle = useMutation({ mutationFn: (i: Item) => patch<{ campaign: Campaign }>(`/campaigns/${c.id}/items/${i.id}`, { status: i.status === "done" ? "planned" : "done" }), onSuccess: (d) => setC(d.campaign), onError: (e) => toast("error", errorMessage(e)) });
  const remove = useMutation({ mutationFn: (id: string) => del<{ campaign: Campaign }>(`/campaigns/${c.id}/items/${id}`), onSuccess: (d) => setC(d.campaign) });
  const weeks = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of c.items ?? []) {
      const d = new Date(`${i.date}T00:00:00Z`);
      const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
      m.set(monday, [...(m.get(monday) ?? []), i]);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [c.items]);
  const textAi = meta.data?.integrations.textAi;
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
      <div className="space-y-5 xl:col-span-3">
        <Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-semibold"><CalendarDays className="h-4 w-4" />{t("Marketing calendar")}</h3>
            <Button size="sm" icon={<Sparkles className="h-4 w-4" />} loading={ai.isPending} disabled={textAi === false} onClick={() => ai.mutate()}>{c.plan ? t("Re-plan with AI") : t("Plan with AI")}</Button>
          </div>
          {textAi === false && <IntegrationNotice service="textAi" />}
          {ai.error && <ErrorAlert error={ai.error} />}
          {weeks.length === 0 ? <p className="text-sm muted">{t("No posts or ads planned yet. Add them below or let the AI make a plan.")}</p> : weeks.map(([monday, items]) => (
            <div key={monday} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide muted">{t("Week of {date}", { date: fmtDate(monday) })}</p>
              {items.map((i) => (
                <div key={i.id} className="flex items-start gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                  <button type="button" aria-label={t("Mark as done")} onClick={() => toggle.mutate(i)} className="mt-0.5">{i.status === "done" ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-slate-300" />}</button>
                  <div className="min-w-0 flex-1">
                    <p className={cx("text-sm font-medium", i.status === "done" && "line-through opacity-60")}>{i.title}</p>
                    {i.content && <p className="text-xs muted">{i.content}</p>}
                    <p className="mt-1 flex flex-wrap gap-1.5 text-xs"><Badge>{fmtDate(i.date)}</Badge><Badge tone="cyan">{t(CHANNELS[i.channel] ?? i.channel)}</Badge>{i.source === "ai" && <Badge tone="violet">AI</Badge>}</p>
                  </div>
                  <Button size="sm" variant="ghost" aria-label={t("Delete")} onClick={() => remove.mutate(i.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          ))}
        </Card>
        <Card className="space-y-3 p-5">
          <h3 className="font-semibold">{t("Add a post or ad")}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t("Date")}><Input type="date" min={c.startDate} max={c.endDate} value={item.date} onChange={(e) => setItem((s) => ({ ...s, date: e.target.value }))} /></Field>
            <Field label={t("Channel")}><Select value={item.channel} onChange={(e) => setItem((s) => ({ ...s, channel: e.target.value }))} options={c.channels.map((x) => ({ value: x, label: t(CHANNELS[x] ?? x) }))} /></Field>
            <Field label={t("Title")}><Input value={item.title} onChange={(e) => setItem((s) => ({ ...s, title: e.target.value }))} maxLength={200} /></Field>
          </div>
          <Field label={t("What to publish")}><Input value={item.content} onChange={(e) => setItem((s) => ({ ...s, content: e.target.value }))} maxLength={2000} /></Field>
          {add.error && <ErrorAlert error={add.error} />}
          <Button size="sm" icon={<Plus className="h-4 w-4" />} loading={add.isPending} disabled={!item.title.trim()} onClick={() => add.mutate()}>{t("Add")}</Button>
        </Card>
      </div>
      <div className="space-y-5 xl:col-span-2">
        <Card className="space-y-3 p-5">
          <h3 className="font-semibold">{t("Progress")}</h3>
          <div><div className="mb-1 flex justify-between text-sm"><span>{t("Posts and ads done")}</span><span className="muted">{c.progress.itemsDone} / {c.progress.itemsTotal}</span></div><Progress value={c.progress.itemsDone} max={Math.max(1, c.progress.itemsTotal)} /></div>
          {c.budget ? <div><div className="mb-1 flex justify-between text-sm"><span>{t("Budget spent")}</span><span className="muted">{fmtAmount(c.progress.spent, c.currency)} / {fmtAmount(c.budget, c.currency)}</span></div><Progress value={c.progress.spent} max={c.budget} /></div> : <p className="text-xs muted">{t("Add a budget to track spending.")}</p>}
        </Card>
        {c.plan ? (
          <Card className="space-y-3 p-5">
            <h3 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-violet-500" />{t("AI plan")}</h3>
            {c.plan.summary && <p className="text-sm">{c.plan.summary}</p>}
            {c.plan.objectives.length > 0 && <div><p className="text-xs font-semibold uppercase muted">{t("Goals to track")}</p><ul className="text-sm">{c.plan.objectives.map((x, i) => <li key={i}>• {x}</li>)}</ul></div>}
            {c.plan.audience.length > 0 && <div><p className="text-xs font-semibold uppercase muted">{t("Audience")}</p><ul className="text-sm">{c.plan.audience.map((x, i) => <li key={i}>• {x}</li>)}</ul></div>}
            {c.plan.budgetSplit.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase muted">{t("Suggested budget split")}</p>
                {c.plan.budgetSplit.map((b) => (
                  <div key={b.channel} className="text-sm">
                    <div className="flex justify-between"><span>{t(CHANNELS[b.channel] ?? b.channel)}</span><span className="font-semibold">{b.pct}%{b.amount !== null && <span className="font-normal muted"> · {fmtAmount(b.amount, c.currency)}</span>}</span></div>
                    {b.reason && <p className="text-xs muted">{b.reason}</p>}
                  </div>
                ))}
              </div>
            )}
            {c.plan.kpis.length > 0 && <div><p className="text-xs font-semibold uppercase muted">{t("What to measure")}</p><p className="text-sm">{c.plan.kpis.join(" · ")}</p></div>}
            <SourceNote>{t("This is an AI suggestion based on your campaign, brand kit and Google Trends data. It does not predict results.")}</SourceNote>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ results
function ResultsTab({ c, setC }: { c: Campaign; setC: (c: Campaign) => void }) {
  const { t } = useI18n();
  const ch = useChartTheme();
  const [r, setR] = useState({ date: today() < c.endDate ? today() : c.endDate, creative: "", channel: c.channels[0] ?? "", impressions: "", clicks: "", conversions: "", spend: "", revenue: "" });
  const add = useMutation({
    mutationFn: () => post<{ campaign: Campaign }>(`/campaigns/${c.id}/stats`, {
      date: r.date, creative: r.creative, channel: r.channel || undefined, impressions: Number(r.impressions || 0), clicks: Number(r.clicks || 0),
      conversions: Number(r.conversions || 0), spend: Number(r.spend || 0), revenue: r.revenue === "" ? null : Number(r.revenue),
    }),
    onSuccess: (d) => { setC(d.campaign); setR((s) => ({ ...s, impressions: "", clicks: "", conversions: "", spend: "", revenue: "" })); },
  });
  const remove = useMutation({ mutationFn: (id: string) => del<{ campaign: Campaign }>(`/campaigns/${c.id}/stats/${id}`), onSuccess: (d) => setC(d.campaign) });
  const T = c.totals;
  const money = (v: number | null) => (v === null ? "—" : fmtAmount(v, c.currency));
  const set = (k: keyof typeof r) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setR((s) => ({ ...s, [k]: e.target.value }));
  return (
    <div className="space-y-5">
      <Alert tone="info">{t("These are results you enter from your ad accounts (Instagram, Telegram, Google…). PricePro does not estimate or invent them. Automatic import needs a connection to the ad platform, which is not set up.")}</Alert>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-5">
        <StatCard icon={<BarChart3 className="h-4 w-4" />} label={t("Spend")} value={money(T.spend)} hint={<Badge>{t("Entered by you")}</Badge>} />
        <StatCard icon={<BarChart3 className="h-4 w-4" />} label="CTR" value={T.ctrPct === null ? "—" : `${T.ctrPct}%`} hint={t("{n} clicks", { n: fmtNumber(T.clicks) })} tone="cyan" />
        <StatCard icon={<BarChart3 className="h-4 w-4" />} label={t("Cost per click")} value={money(T.cpc)} tone="violet" />
        <StatCard icon={<BarChart3 className="h-4 w-4" />} label={t("Cost per sale (CPA)")} value={money(T.cpa)} hint={t("{n} conversions", { n: fmtNumber(T.conversions) })} tone="amber" />
        <StatCard icon={<BarChart3 className="h-4 w-4" />} label="ROAS" value={T.roas === null ? "—" : `${T.roas}×`} hint={T.revenue !== null ? money(T.revenue) : t("Add revenue to see it")} tone="emerald" />
      </div>
      {(c.byCreative ?? []).length > 1 && (
        <Card className="space-y-3 p-5">
          <h3 className="font-semibold">{t("Compare creatives")}</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={c.byCreative} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={ch.grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="creative" tick={{ fill: ch.axis, fontSize: 11 }} />
                <YAxis yAxisId="l" tick={{ fill: ch.axis, fontSize: 11 }} />
                <YAxis yAxisId="r" orientation="right" tick={{ fill: ch.axis, fontSize: 11 }} />
                <Tooltip {...ch.tooltip} />
                <Legend />
                <Bar yAxisId="l" dataKey="ctrPct" name="CTR %" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                <Bar yAxisId="r" dataKey="roas" name="ROAS" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2">{t("Creative")}</th><th>{t("Impressions")}</th><th>CTR</th><th>{t("Conversions")}</th><th>{t("Spend")}</th><th>CPA</th><th>ROAS</th></tr></thead>
              <tbody>
                {[...(c.byCreative ?? [])].sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity)).map((x, i) => (
                  <tr key={x.creative} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2 font-medium">{x.creative} {i === 0 && x.cpa !== null && <Badge tone="green">{t("Best CPA")}</Badge>}</td>
                    <td>{fmtNumber(x.impressions)}</td><td>{x.ctrPct ?? "—"}%</td><td>{fmtNumber(x.conversions)}</td><td>{money(x.spend)}</td><td>{money(x.cpa)}</td><td>{x.roas ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Card className="space-y-3 p-5">
        <h3 className="font-semibold">{t("Add results")}</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label={t("Date")}><Input type="date" value={r.date} onChange={set("date")} /></Field>
          <Field label={t("Creative / ad variant")}><Input value={r.creative} onChange={set("creative")} maxLength={100} placeholder={t("e.g. Banner A")} /></Field>
          <Field label={t("Channel")}><Select value={r.channel} onChange={set("channel")} options={c.channels.map((x) => ({ value: x, label: t(CHANNELS[x] ?? x) }))} /></Field>
          <Field label={t("Impressions")}><Input type="number" min={0} value={r.impressions} onChange={set("impressions")} /></Field>
          <Field label={t("Clicks")}><Input type="number" min={0} value={r.clicks} onChange={set("clicks")} /></Field>
          <Field label={t("Conversions")}><Input type="number" min={0} value={r.conversions} onChange={set("conversions")} /></Field>
          <Field label={`${t("Spend")} (${c.currency})`}><Input type="number" min={0} value={r.spend} onChange={set("spend")} /></Field>
          <Field label={`${t("Revenue")} (${c.currency})`}><Input type="number" min={0} value={r.revenue} onChange={set("revenue")} placeholder={t("optional")} /></Field>
        </div>
        {add.error && <ErrorAlert error={add.error} />}
        <Button size="sm" icon={<Plus className="h-4 w-4" />} loading={add.isPending} disabled={!r.creative.trim()} onClick={() => add.mutate()}>{t("Add")}</Button>
      </Card>
      {(c.stats ?? []).length > 0 && (
        <Card className="overflow-x-auto p-5">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-2">{t("Date")}</th><th>{t("Creative")}</th><th>{t("Channel")}</th><th>{t("Impressions")}</th><th>{t("Clicks")}</th><th>{t("Conversions")}</th><th>{t("Spend")}</th><th>{t("Revenue")}</th><th /></tr></thead>
            <tbody>
              {c.stats!.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2">{fmtDate(s.date)}</td><td>{s.creative}</td><td>{s.channel ? t(CHANNELS[s.channel] ?? s.channel) : "—"}</td><td>{fmtNumber(s.impressions)}</td><td>{fmtNumber(s.clicks)}</td><td>{fmtNumber(s.conversions)}</td><td>{money(s.spend)}</td><td>{money(s.revenue)}</td>
                  <td><Button size="sm" variant="ghost" aria-label={t("Delete")} onClick={() => remove.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function Campaigns() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const id = params.get("id");
  const tab = (params.get("tab") as "plan" | "results") || "plan";
  const list = useQuery({ queryKey: ["campaigns"], queryFn: () => get<{ items: Campaign[] }>("/campaigns").then((r) => r.items) });
  const current = useQuery({ queryKey: ["campaigns", id], queryFn: () => get<{ campaign: Campaign }>(`/campaigns/${id}`).then((r) => r.campaign), enabled: Boolean(id) });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [remove, setRemove] = useState(false);
  const setC = (c: Campaign) => { qc.setQueryData(["campaigns", c.id], c); void qc.invalidateQueries({ queryKey: ["campaigns"], exact: true }); };
  const delMut = useMutation({ mutationFn: () => del(`/campaigns/${id}`), onSuccess: () => { setRemove(false); setParams({}); void qc.invalidateQueries({ queryKey: ["campaigns"] }); } });
  const c = current.data;
  return (
    <div className="space-y-6">
      <PageHeader title={t("Campaigns")} subtitle={t("Plan posts and ads on a calendar, split the budget and track the results you get.")} icon={<Megaphone className="h-5 w-5" />}
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>{t("New campaign")}</Button>} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <Card className="h-fit divide-y divide-slate-100 dark:divide-slate-800">
          {list.isLoading ? <div className="p-4"><Spinner /></div> : (list.data ?? []).length === 0 ? <p className="p-4 text-sm muted">{t("No campaigns yet.")}</p> : list.data!.map((x) => (
            <button key={x.id} type="button" onClick={() => setParams({ id: x.id })} className={cx("block w-full p-3 text-left", x.id === id ? "bg-slate-50 dark:bg-slate-800/60" : "hover:bg-slate-50 dark:hover:bg-slate-800/40")}>
              <p className="truncate text-sm font-semibold">{x.name}</p>
              <p className="text-xs muted">{fmtDate(x.startDate)} — {fmtDate(x.endDate)}</p>
              <p className="mt-1 flex gap-1.5"><Badge tone={x.status === "active" ? "green" : "slate"}>{t(STATUS[x.status])}</Badge><Badge>{x.progress.itemsDone}/{x.progress.itemsTotal}</Badge></p>
            </button>
          ))}
        </Card>
        <div className="lg:col-span-3">
          {!id ? (
            <EmptyState icon={<Megaphone className="h-6 w-6" />} title={t("Choose or create a campaign")} text={t("A campaign has a goal, dates, channels and a budget. The AI can fill the calendar with post and ad ideas.")}
              action={<div className="flex flex-wrap justify-center gap-2"><Button onClick={() => setCreating(true)}>{t("New campaign")}</Button><Button variant="secondary" onClick={() => navigate("/ads?tab=maker")}>{t("Make a banner")}</Button></div>} />
          ) : current.isLoading ? <Spinner /> : current.error ? <ErrorAlert error={current.error} /> : c && (
            <div className="space-y-5">
              <Card className="flex flex-wrap items-start justify-between gap-3 p-5">
                <div>
                  <h2 className="text-lg font-semibold">{c.name}</h2>
                  <p className="text-sm muted">{t(OBJECTIVES[c.objective] ?? c.objective)}{c.product ? ` · ${c.product}` : ""} · {fmtDate(c.startDate)} — {fmtDate(c.endDate)}{c.budget ? ` · ${fmtAmount(c.budget, c.currency)}` : ""}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5">{c.channels.map((x) => <Badge key={x} tone="cyan">{t(CHANNELS[x] ?? x)}</Badge>)}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>{t("Edit")}</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setRemove(true)}>{t("Delete")}</Button>
                </div>
              </Card>
              <Tabs value={tab} onChange={(v) => setParams({ id: c.id, tab: v })} tabs={[{ value: "plan", label: t("Plan") }, { value: "results", label: t("Results") }]} />
              {tab === "plan" ? <PlanTab key={c.id} c={c} setC={setC} /> : <ResultsTab key={c.id} c={c} setC={setC} />}
            </div>
          )}
        </div>
      </div>
      <Modal open={creating} onClose={() => setCreating(false)} title={t("New campaign")} wide>
        {creating && <CampaignForm initial={emptyForm()} onCancel={() => setCreating(false)} onSaved={(x) => { setCreating(false); setC(x); setParams({ id: x.id }); }} />}
      </Modal>
      <Modal open={editing} onClose={() => setEditing(false)} title={t("Edit campaign")} wide>
        {editing && c && <CampaignForm id={c.id} initial={{ name: c.name, objective: c.objective, product: c.product ?? "", audience: c.audience ?? "", budget: c.budget === null ? "" : String(c.budget), currency: c.currency, startDate: c.startDate, endDate: c.endDate, channels: c.channels, status: c.status }} onCancel={() => setEditing(false)} onSaved={(x) => { setEditing(false); setC(x); }} />}
      </Modal>
      <ConfirmDialog open={remove} title={t("Delete campaign?")} text={t("The calendar and results of this campaign will be deleted.")} confirmLabel={t("Delete")} loading={delMut.isPending} onConfirm={() => delMut.mutate()} onClose={() => setRemove(false)} />
    </div>
  );
}
