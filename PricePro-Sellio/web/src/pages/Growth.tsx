import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot, CheckCircle2, Compass, Megaphone, PenLine, Plus, Sparkles, Target, Trash2, TrendingUp,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ErrorAlert, IntegrationNotice } from "../components/shared";
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, PageHeader, Spinner, cx, useToast } from "../components/ui";
import { del, get, post } from "../lib/api";
import { fmtDate, fmtMonthName, fmtPct, timeAgo } from "../lib/format";
import { useMeta } from "../lib/hooks";
import { useI18n, type Lang } from "../lib/i18n";
import { useMsg, type Msg } from "../lib/msg";

// ------------------------------------------------------------------ API types
type Direction = { title: string; audience: string; message: string; channels: string[]; offer: string; why: string };
type Results = { impressions: number; clicks: number; conversions: number; spend: number; revenue: number | null; ctrPct: number | null; cpa: number | null; roas: number | null };
type Evidence =
  | { kind: "opportunity"; source: string; computedAt: string; label: string; nowVsAvgPct: number; yoyPct: number | null; next3Pct: number | null; peakMonths: number[]; nextRise: { date: string; months: number } | null; confidence: string | null; score: number | null; reasons: Msg[] }
  | { kind: "forecast"; source: string; computedAt: string; analysisId: string; areas: { area: string; geo: string; changePct: number | null; trend: string | null; peakMonths: number[]; yoyPct: number | null; confidence: string | null }[] }
  | null;
type Step = "opportunity" | "explain" | "direction" | "assets";
type Initiative = {
  id: string; product: string; query: string | null; source: "opportunity" | "forecast" | "manual"; evidence: Evidence;
  explanation: string | null; directions: Direction[]; direction: Direction | null;
  banners: { id: string; resultUrl: string | null; productName: string }[]; copies: { id: string; product: string; headline: string | null }[];
  campaign: { id: string; name: string; status: string; start_date: string; end_date: string; currency: string; budget: number | null; results: Results | null; itemsTotal: number; itemsDone: number } | null;
  steps: Record<Step, boolean>; nextStep: Step | null; done: number; total: number; updatedAt: string;
};
type Learnings = {
  currency: string | null; sample: { rows: number; clicks: number; conversions: number; reliable: boolean };
  overall: Results | null; byChannel: (Results & { channel: string })[]; topCreatives: (Results & { creative: string })[]; insights: Msg[];
};
type Opportunity = { query: string; label: string; score: number; mine: { initiativeId: string } | null };

const CHANNELS: Record<string, string> = { instagram: "Instagram", telegram: "Telegram", facebook: "Facebook", google: "Google Ads", tiktok: "TikTok", youtube: "YouTube", offline: "Offline", other: "Other" };
const STEP_LABEL: Record<Step, string> = { opportunity: "Opportunity", explain: "AI explanation", direction: "Marketing direction", assets: "Ads" };
const STEPS: Step[] = ["opportunity", "explain", "direction", "assets"];
const AD_PLATFORMS = ["instagram", "telegram", "facebook", "google"];

function Text({ children }: { children: string }) {
  return <div className="space-y-1 text-sm">{children.split("\n").filter((l) => l.trim()).map((l, i) => (/^\s*[-•]\s+/.test(l) ? <p key={i} className="flex gap-2"><span className="text-brand-500">•</span>{l.replace(/^\s*[-•]\s+/, "")}</p> : <p key={i}>{l}</p>))}</div>;
}

function StepCard({ n, step, done, active, title, children }: { n: number; step: Step | "learn"; done: boolean; active: boolean; title: string; children: ReactNode }) {
  return (
    <div className="relative flex gap-4" data-step={step}>
      <div className="flex flex-col items-center">
        <span className={cx("flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm font-bold", done ? "bg-emerald-500 text-white" : active ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-500 dark:bg-slate-700")}>{done ? <CheckCircle2 className="h-4 w-4" /> : n}</span>
        <span className="w-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>
      <Card className={cx("mb-4 flex-1 space-y-3 p-4", active && "ring-2 ring-brand-500/40")}>
        <h3 className="font-semibold">{title}</h3>
        {children}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ one plan
function PlanView({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const msg = useMsg();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const meta = useMeta();
  const textAi = meta.data?.integrations.textAi !== false;
  const q = useQuery({ queryKey: ["growth", id], queryFn: () => get<{ initiative: Initiative }>(`/growth/${id}`).then((r) => r.initiative) });
  const set = (i: Initiative) => { qc.setQueryData(["growth", id], i); void qc.invalidateQueries({ queryKey: ["growth"], exact: true }); };
  const explain = useMutation({ mutationFn: () => post<{ initiative: Initiative }>(`/growth/${id}/explain`), onSuccess: (d) => set(d.initiative) });
  const choose = useMutation({ mutationFn: (body: { index?: number; custom?: Direction }) => post<{ initiative: Initiative }>(`/growth/${id}/direction`, body), onSuccess: (d) => set(d.initiative) });
  const [custom, setCustom] = useState<Direction>({ title: "", audience: "", message: "", channels: ["instagram"], offer: "", why: "" });
  const [showCustom, setShowCustom] = useState(false);
  const copy = useMutation({
    mutationFn: (i: Initiative) => post("/ads/copy", {
      product: i.product, description: i.direction?.message || undefined, audience: i.direction?.audience || undefined, offer: i.direction?.offer || undefined,
      language: lang as Lang, platforms: (i.direction?.channels ?? []).filter((c) => AD_PLATFORMS.includes(c)).length ? (i.direction!.channels.filter((c) => AD_PLATFORMS.includes(c))) : ["instagram"], initiativeId: i.id,
    }),
    onSuccess: () => { void q.refetch(); void qc.invalidateQueries({ queryKey: ["growth"], exact: true }); void qc.invalidateQueries({ queryKey: ["ad-copies"] }); toast("success", t("Ad texts are ready. Open them in Ad Studio → Ad copy.")); },
  });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const i = q.data!;
  const e = i.evidence;
  const active = i.nextStep;
  const bannerLink = `/ads?tab=maker&initiative=${i.id}&product=${encodeURIComponent(i.product)}`;
  return (
    <div>
      <StepCard n={1} step="opportunity" done active={false} title={`${t(STEP_LABEL.opportunity)}: ${t(i.product)}`}>
        {e?.kind === "opportunity" ? (
          <>
            <p className="text-sm">{t("Last 12 months")}: <b>{fmtPct(e.yoyPct)}</b> · {t("Next 3 months")}: <b>{fmtPct(e.next3Pct)}</b> · {t("Now vs yearly average")}: <b>{fmtPct(e.nowVsAvgPct)}</b>{e.score !== null && <> · {t("Score")}: <b>{t("{n} points out of 100", { n: e.score })}</b></>}</p>
            {e.peakMonths.length > 0 && <p className="text-sm">{t("Season")}: {e.peakMonths.map((m) => fmtMonthName(m)).join(", ")}{e.nextRise && <> · {t("Next rise")}: {e.nextRise.months === 0 ? t("this month") : t("in {n} months", { n: e.nextRise.months })}</>}</p>}
            {e.reasons.map((r, k) => <p key={k} className="flex gap-2 text-sm"><span className="text-brand-500">•</span>{msg(r)}</p>)}
            <p className="text-xs muted">{t("Source")}: Google Trends · {t("Uzbekistan")} · {fmtDate(e.computedAt)}</p>
          </>
        ) : e?.kind === "forecast" ? (
          <>
            {e.areas.map((a) => <p key={a.geo} className="text-sm">{t(a.area)}: {t("Next period")} <b>{fmtPct(a.changePct)}</b>{a.yoyPct !== null && <> · {t("Last 12 months")}: <b>{fmtPct(a.yoyPct)}</b></>}{a.peakMonths.length > 0 && <> · {t("Season")}: {a.peakMonths.map((m) => fmtMonthName(m)).join(", ")}</>}</p>)}
            <Link to={`/forecast?market=${e.analysisId}`} className="text-xs text-brand-600 hover:underline dark:text-brand-400">{t("Open the demand analysis")} →</Link>
          </>
        ) : <p className="text-sm muted">{t("Your own idea (no market data attached). You can check it in Demand Forecast.")}</p>}
      </StepCard>

      <StepCard n={2} step="explain" done={i.steps.explain} active={active === "explain"} title={t("AI explanation")}>
        {i.explanation ? <Text>{i.explanation}</Text> : <p className="text-sm muted">{t("AI explains why this matters for your business, using the market data.")}</p>}
        {!textAi && <IntegrationNotice service="textAi" />}
        {explain.error && <ErrorAlert error={explain.error} />}
        <Button size="sm" variant={i.explanation ? "secondary" : "primary"} icon={<Bot className="h-4 w-4" />} loading={explain.isPending} disabled={!textAi} onClick={() => explain.mutate()}>{i.explanation ? t("Explain again") : t("Explain with AI")}</Button>
      </StepCard>

      <StepCard n={3} step="direction" done={i.steps.direction} active={active === "direction"} title={t("Marketing direction")}>
        {i.direction && (
          <div className="rounded-xl bg-emerald-50 p-3 text-sm dark:bg-emerald-500/10">
            <p className="font-semibold">✓ {i.direction.title}</p>
            {i.direction.message && <p>{i.direction.message}</p>}
            <p className="text-xs muted">{i.direction.audience}{i.direction.channels.length ? ` · ${i.direction.channels.map((c) => t(CHANNELS[c] ?? c)).join(", ")}` : ""}</p>
          </div>
        )}
        {i.directions.length > 0 && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {i.directions.map((d, k) => (
              <div key={k} className={cx("flex flex-col gap-1 rounded-xl border p-3 text-sm", i.direction?.title === d.title ? "border-emerald-400" : "border-slate-200 dark:border-slate-700")}>
                <p className="font-semibold">{d.title}</p>
                <p className="text-xs"><span className="muted">{t("Audience")}:</span> {d.audience}</p>
                <p className="text-xs"><span className="muted">{t("Message")}:</span> {d.message}</p>
                {d.offer && <p className="text-xs"><span className="muted">{t("Offer")}:</span> {d.offer}</p>}
                <p className="flex flex-wrap gap-1">{d.channels.map((c) => <Badge key={c} tone="cyan">{t(CHANNELS[c] ?? c)}</Badge>)}</p>
                {d.why && <p className="text-xs muted">{d.why}</p>}
                <Button size="sm" className="mt-auto" variant={i.direction?.title === d.title ? "secondary" : "primary"} loading={choose.isPending && choose.variables?.index === k} onClick={() => choose.mutate({ index: k })}>{i.direction?.title === d.title ? t("Chosen") : t("Choose")}</Button>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="text-xs text-brand-600 hover:underline dark:text-brand-400" onClick={() => setShowCustom((v) => !v)}>{t("Or write your own direction")}</button>
        {showCustom && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("Title")}><Input value={custom.title} onChange={(ev) => setCustom((c) => ({ ...c, title: ev.target.value }))} maxLength={120} /></Field>
            <Field label={t("Audience")}><Input value={custom.audience} onChange={(ev) => setCustom((c) => ({ ...c, audience: ev.target.value }))} maxLength={300} /></Field>
            <Field label={t("Message")}><Input value={custom.message} onChange={(ev) => setCustom((c) => ({ ...c, message: ev.target.value }))} maxLength={300} /></Field>
            <Field label={t("Offer")}><Input value={custom.offer} onChange={(ev) => setCustom((c) => ({ ...c, offer: ev.target.value }))} maxLength={200} /></Field>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              {Object.entries(CHANNELS).map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs dark:border-slate-700">
                  <input type="checkbox" className="accent-brand-600" checked={custom.channels.includes(v)} onChange={() => setCustom((c) => ({ ...c, channels: c.channels.includes(v) ? c.channels.filter((x) => x !== v) : [...c.channels, v].slice(0, 4) }))} />{t(l)}
                </label>
              ))}
            </div>
            <Button size="sm" disabled={!custom.title.trim() || !custom.channels.length} loading={choose.isPending && Boolean(choose.variables?.custom)} onClick={() => choose.mutate({ custom })}>{t("Use my direction")}</Button>
          </div>
        )}
        {choose.error && <ErrorAlert error={choose.error} />}
      </StepCard>

      <StepCard n={4} step="assets" done={i.steps.assets} active={active === "assets"} title={t("Ads")}>
        {!i.direction ? <p className="text-sm muted">{t("Choose a direction first: the texts and banners follow it.")}</p> : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={<PenLine className="h-4 w-4" />} loading={copy.isPending} disabled={!textAi} onClick={() => copy.mutate(i)}>{t("Write ad texts")}</Button>
              <Button size="sm" variant="secondary" icon={<Megaphone className="h-4 w-4" />} onClick={() => navigate(bannerLink)}>{t("Make a banner")}</Button>
            </div>
            {copy.error && <ErrorAlert error={copy.error} />}
          </>
        )}
        {i.copies.length > 0 && <div className="space-y-1">{i.copies.map((c) => <p key={c.id} className="text-sm">📝 {c.headline ?? c.product} <Link to="/ads?tab=copy" className="text-xs text-brand-600 hover:underline dark:text-brand-400">{t("Open")}</Link></p>)}</div>}
        {i.banners.length > 0 && <div className="flex flex-wrap gap-2">{i.banners.map((b) => b.resultUrl && <a key={b.id} href={b.resultUrl} target="_blank" rel="noreferrer"><img src={b.resultUrl} alt={b.productName} className="h-20 w-20 rounded-lg object-cover" /></a>)}</div>}
      </StepCard>
    </div>
  );
}

// ------------------------------------------------------------------ page
export default function Growth() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const id = params.get("id");
  const list = useQuery({ queryKey: ["growth"], queryFn: () => get<{ items: Initiative[]; learnings: Learnings }>("/growth") });
  const opps = useQuery({ queryKey: ["intel-opportunities"], queryFn: () => get<{ configured: boolean; items?: Opportunity[] }>("/intel/opportunities"), staleTime: 3600_000, retry: false });
  const [manual, setManual] = useState("");
  const [remove, setRemove] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (b: { source: "opportunity" | "manual"; product: string; query?: string }) => post<{ initiative: Initiative }>("/growth", b),
    onSuccess: (d) => { void qc.invalidateQueries({ queryKey: ["growth"] }); void qc.invalidateQueries({ queryKey: ["intel-opportunities"] }); setManual(""); setParams({ id: d.initiative.id }); },
  });
  const delMut = useMutation({ mutationFn: (x: string) => del(`/growth/${x}`), onSuccess: (_, x) => { setRemove(null); void qc.invalidateQueries({ queryKey: ["growth"] }); void qc.invalidateQueries({ queryKey: ["intel-opportunities"] }); if (x === id) setParams({}); } });
  const items = list.data?.items ?? [];
  const fresh = (opps.data?.items ?? []).filter((o) => !o.mine).slice(0, 4);
  return (
    <div className="space-y-6">
      <PageHeader title={t("Growth Hub")} subtitle={t("One path from a market opportunity to an AI explanation, a marketing direction and ready ads.")} icon={<Compass className="h-5 w-5" />} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-5">
          <Card className="space-y-3 p-5">
            <h3 className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" />{t("Start a new plan")}</h3>
            {opps.data?.configured === false ? <IntegrationNotice service="trends" /> : opps.isLoading ? <Spinner /> : fresh.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide muted">{t("From growing products")}</p>
                {fresh.map((o) => (
                  <div key={o.query} className="flex items-center gap-2 rounded-xl border border-slate-100 p-2.5 dark:border-slate-800">
                    <TrendingUp className="h-4 w-4 flex-none text-emerald-500" />
                    <p className="min-w-0 flex-1 truncate text-sm">{t(o.label)} <span className="text-xs muted">· {t("{n} points out of 100", { n: o.score })}</span></p>
                    <Button size="sm" loading={create.isPending && create.variables?.query === o.query} onClick={() => create.mutate({ source: "opportunity", product: t(o.label), query: o.query })}>{t("Begin")}</Button>
                  </div>
                ))}
              </div>
            )}
            <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); if (manual.trim()) create.mutate({ source: "manual", product: manual.trim() }); }}>
              <Input value={manual} onChange={(ev) => setManual(ev.target.value)} placeholder={t("Or your own product / idea")} maxLength={120} className="flex-1" />
              <Button type="submit" variant="secondary" disabled={!manual.trim()}>{t("Begin")}</Button>
            </form>
            {create.error && <ErrorAlert error={create.error} />}
          </Card>
          <Card className="divide-y divide-slate-100 dark:divide-slate-800">
            <p className="p-3 text-sm font-semibold">{t("My plans")}</p>
            {list.isLoading ? <div className="p-3"><Spinner /></div> : items.length === 0 ? <p className="p-3 text-sm muted">{t("No plans yet.")}</p> : items.map((x) => (
              <div key={x.id} className={cx("flex items-start gap-2 p-3", x.id === id && "bg-slate-50 dark:bg-slate-800/60")}>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setParams({ id: x.id })}>
                  <p className="truncate text-sm font-semibold">{t(x.product)}</p>
                  <div className="mt-1 flex gap-1">{STEPS.map((s) => <span key={s} title={t(STEP_LABEL[s])} className={cx("h-1.5 flex-1 rounded-full", x.steps[s] ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700")} />)}</div>
                  <p className="mt-1 text-xs muted">{x.nextStep ? <>{t("Next")}: {t(STEP_LABEL[x.nextStep])}</> : t("All steps done")} · {timeAgo(x.updatedAt)}</p>
                </button>
                <Button size="sm" variant="ghost" aria-label={t("Delete")} onClick={() => setRemove(x.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </Card>
        </div>
        <div className="xl:col-span-2">
          {id ? <PlanView key={id} id={id} /> : (
            <EmptyState icon={<Target className="h-6 w-6" />} title={t("Choose or start a plan")}
              text={t("Each plan follows one product: why it is an opportunity, how to advertise it and the ads.")}
              action={<Button variant="secondary" icon={<Sparkles className="h-4 w-4" />} onClick={() => navigate("/intelligence?tab=opportunities")}>{t("See opportunities")}</Button>} />
          )}
          {list.error && <ErrorAlert error={list.error} />}
        </div>
      </div>
      <Alert tone="info">{t("Market numbers come from Google Trends. AI only explains and suggests; it does not create numbers.")}</Alert>
      <ConfirmDialog open={Boolean(remove)} title={t("Delete this plan?")} text={t("The plan is deleted; its ads stay.")} confirmLabel={t("Delete")} loading={delMut.isPending} onConfirm={() => remove && delMut.mutate(remove)} onClose={() => setRemove(null)} />
    </div>
  );
}
