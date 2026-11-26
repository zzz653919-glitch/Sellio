import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ErrorAlert } from "../../components/shared";
import { Alert, Badge, Button, PageLoader, useToast } from "../../components/ui";
import { get, post } from "../../lib/api";
import { fmtDateTime, fmtNumber, timeAgo } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { DateRange, defaultRange, Section, Stat, Table, useCan } from "../ui";
import { PROVIDER } from "./Dashboard";

type Studio = {
  counts: { kind: string; status: string; n: number }[];
  queue: { id: string; title: string; status: string; owner: string; createdAt: string }[];
  provider: { image: { configured: boolean; model: string; keySet: boolean }; text: { configured: boolean; provider: string | null; model: string | null; geminiKeySet: boolean; openaiKeySet: boolean } };
  apiUsage: { images: { total: number; failed: number; avgMs: number | null }; text: { total: number; failed: number; avgMs: number | null } };
  history: { id: string; title: string; status: string; model: string; kind: string; owner: string; createdAt: string }[];
  errors: { provider: string; operation: string; status: number | null; error: string | null; createdAt: string }[];
  limits: Record<string, Record<string, number>>;
};
type Forecast = {
  byStatus: { status: string; kind: string; n: number }[]; areaErrors: number;
  history: { id: string; query: string; status: string; kind: string; owner: string; createdAt: string }[];
  models: { name: string; n: number }[];
  sources: { key: string; name: string; configured: boolean; kind: string; calls: number; failed: number; lastSuccess: string | null; lastFailure: string | null }[];
  dataUpdates: Record<string, { entries: number; newest: string | null; oldest: string | null }>;
  markets: { code: string; name: string }[];
  watchlist: { query: string; label: string; category: string }[];
  configuration: { history: string; minMonthsForSeasons: number; candidateModels: string[]; modelSelection: string; horizonsDays: number[]; radarRefresh: string };
};

const sum = (rows: { n: number }[]) => rows.reduce((s, r) => s + r.n, 0);

function StudioAdmin({ range }: { range: { from: string; to: string } }) {
  const { t } = useI18n();
  const can = useCan();
  const q = useQuery({ queryKey: ["admin-studio", range], queryFn: () => get<Studio>(`/admin/studio?from=${range.from}&to=${range.to}`), refetchInterval: 30_000, placeholderData: (p) => p });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const d = q.data!;
  const ai = d.counts.filter((c) => c.kind === "ai");
  const by = (s: string) => ai.filter((c) => c.status === s).reduce((x, c) => x + c.n, 0);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label={t("AI generations")} value={sum(ai)} />
        <Stat label={t("Succeeded")} value={by("succeeded")} tone="green" />
        <Stat label={t("Failed")} value={by("failed")} tone={by("failed") ? "red" : "slate"} />
        <Stat label={t("In queue")} value={d.queue.length} tone={d.queue.length ? "amber" : "slate"} />
        <Stat label={t("Template banners")} value={sum(d.counts.filter((c) => c.kind === "template"))} tone="slate" hint={t("no AI cost")} />
        <Stat label={t("Image API calls")} value={d.apiUsage.images.total} hint={d.apiUsage.images.avgMs ? t("avg {n} s", { n: (d.apiUsage.images.avgMs / 1000).toFixed(1) }) : undefined} tone="slate" />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section title={t("AI providers")}>
          <div className="space-y-2 text-sm">
            <p className="flex items-center justify-between"><span>{t("Image generation")} · <code>{d.provider.image.model}</code></span><Badge tone={d.provider.image.configured ? "green" : "slate"}>{d.provider.image.configured ? t("Connected") : t("Not connected")}</Badge></p>
            <p className="flex items-center justify-between"><span>{t("Text AI")} · <code>{d.provider.text.provider ?? "—"} {d.provider.text.model ?? ""}</code></span><Badge tone={d.provider.text.configured ? "green" : "slate"}>{d.provider.text.configured ? t("Connected") : t("Not connected")}</Badge></p>
            <p className="text-xs muted">{t("API keys are kept in the server environment and are never shown. Models can be changed in Settings.")} {can("settings.manage") && <Link to="/admin/settings" className="text-brand-600 hover:underline">{t("Settings →")}</Link>}</p>
            <p>{t("Text AI calls")}: <b>{fmtNumber(d.apiUsage.text.total)}</b> · {t("failed")}: <b className={d.apiUsage.text.failed ? "text-rose-600" : ""}>{fmtNumber(d.apiUsage.text.failed)}</b></p>
          </div>
        </Section>
        <Section title={t("Generation limits per plan")} actions={can("plans.manage") ? <Link to="/admin/subscriptions" className="text-sm text-brand-600 hover:underline">{t("Edit →")}</Link> : undefined}>
          <Table head={[t("Plan"), t("Ad generations"), t("Forecasts"), t("AI text requests")]}>
            {Object.entries(d.limits).map(([p, l]) => <tr key={p}><td className="font-medium">{p}</td><td>{l.generations}</td><td>{l.forecasts}</td><td>{l.ai}</td></tr>)}
          </Table>
        </Section>
        <Section title={t("Processing queue")}>
          <Table head={[t("Product"), t("Status"), t("Owner"), t("Waiting since")]} empty={!d.queue.length}>
            {d.queue.map((x) => <tr key={x.id}><td>{x.title}</td><td><Badge tone="amber">{t(x.status)}</Badge></td><td className="text-xs">{x.owner}</td><td>{timeAgo(x.createdAt)}</td></tr>)}
          </Table>
        </Section>
        <Section title={t("Error log")}>
          <Table head={[t("Service"), t("Error"), t("When")]} empty={!d.errors.length}>
            {d.errors.map((e, i) => <tr key={i}><td>{PROVIDER[e.provider] ?? e.provider}<span className="block text-xs muted">{e.operation}{e.status ? ` · HTTP ${e.status}` : ""}</span></td><td className="max-w-[280px] text-xs text-rose-600">{e.error}</td><td>{timeAgo(e.createdAt)}</td></tr>)}
          </Table>
        </Section>
      </div>
      <Section title={t("Generation history")}>
        <Table head={[t("Product"), t("Type"), t("Status"), t("Model"), t("Owner"), t("Created")]} empty={!d.history.length}>
          {d.history.map((h) => <tr key={h.id}><td>{h.title}</td><td>{t(h.kind === "ai" ? "AI" : "Template")}</td><td><Badge tone={h.status === "succeeded" ? "green" : h.status === "failed" ? "red" : "amber"}>{t(h.status)}</Badge></td><td className="text-xs">{h.model}</td><td className="text-xs">{h.owner}</td><td title={fmtDateTime(h.createdAt)}>{timeAgo(h.createdAt)}</td></tr>)}
        </Table>
      </Section>
    </div>
  );
}

function ForecastAdmin({ range }: { range: { from: string; to: string } }) {
  const { t } = useI18n();
  const can = useCan();
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-forecast", range], queryFn: () => get<Forecast>(`/admin/forecast?from=${range.from}&to=${range.to}`), placeholderData: (p) => p });
  const refresh = useMutation({
    mutationFn: () => post<{ items: number }>("/admin/forecast/refresh-radar", {}),
    onSuccess: (d) => { toast("success", t("Market Radar refreshed: {n} products with data.", { n: d.items })); void qc.invalidateQueries({ queryKey: ["admin-forecast"] }); },
  });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorAlert error={q.error} />;
  const d = q.data!;
  const n = (status: string) => d.byStatus.filter((s) => s.status === status).reduce((x, s) => x + s.n, 0);
  const label: Record<string, string> = { radar: "Market Radar (Google Trends)", worldBank: "World Bank statistics", comtrade: "UN Comtrade trade data", regions: "Regions of Uzbekistan" };
  return (
    <div className="space-y-5">
      <Alert tone="info">{t("Measured data: Google Trends search interest and official statistics (World Bank, UN Comtrade). Estimated: forecasts made by the statistical models from that data — they are predictions, not facts.")}</Alert>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("Analyses")} value={sum(d.byStatus)} />
        <Stat label={t("Completed")} value={n("completed")} tone="green" />
        <Stat label={t("Without data")} value={n("no_data")} tone={n("no_data") ? "amber" : "slate"} />
        <Stat label={t("Areas with errors")} value={d.areaErrors} tone={d.areaErrors ? "red" : "slate"} hint={t("in the last 60 analyses")} />
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section title={t("Data sources")}>
          <Table head={[t("Source"), t("Type"), t("Status"), t("Calls"), t("Last success")]}>
            {d.sources.map((s) => <tr key={s.key}><td>{s.name}</td><td>{t(s.kind === "measured" ? "Measured" : "Official statistics")}</td><td><Badge tone={!s.configured ? "slate" : s.lastFailure && (!s.lastSuccess || s.lastFailure > s.lastSuccess) ? "amber" : "green"}>{s.configured ? t("Connected") : t("Not connected")}</Badge></td><td>{s.calls}{s.failed ? <span className="text-rose-600"> ({s.failed} {t("failed")})</span> : null}</td><td>{s.lastSuccess ? timeAgo(s.lastSuccess) : "—"}</td></tr>)}
          </Table>
        </Section>
        <Section title={t("Data updates")} actions={can("forecast.manage") ? <Button size="sm" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={refresh.isPending} onClick={() => refresh.mutate()}>{t("Refresh Market Radar")}</Button> : undefined}>
          {refresh.error && <ErrorAlert error={refresh.error} />}
          <Table head={[t("Data"), t("Cached entries"), t("Newest")]}>
            {Object.entries(d.dataUpdates).map(([k, v]) => <tr key={k}><td>{t(label[k] ?? k)}</td><td>{v.entries}</td><td>{v.newest ? fmtDateTime(v.newest) : "—"}</td></tr>)}
          </Table>
        </Section>
        <Section title={t("Prediction models")}>
          <p className="text-sm">{t(d.configuration.modelSelection)}</p>
          <Table head={[t("Model"), t("Chosen in recent analyses")]} empty={!d.models.length}>
            {d.models.map((m) => <tr key={m.name}><td>{m.name}</td><td>{m.n}</td></tr>)}
          </Table>
          <p className="text-xs muted">{t("History")}: {t(d.configuration.history)} · {t("Seasons need at least {n} months", { n: d.configuration.minMonthsForSeasons })} · {t("Horizons")}: {d.configuration.horizonsDays.join(" / ")} {t("days")} · {t(d.configuration.radarRefresh)}</p>
        </Section>
        <Section title={t("Supported markets and regions")}>
          <p className="text-sm">{d.markets.map((m) => t(m.name)).join(", ")}</p>
          <p className="text-sm muted">{t("Regions: inside Uzbekistan (Google Trends interest by region).")}</p>
          <p className="text-sm font-medium">{t("Market Radar watchlist")}</p>
          <p className="text-sm muted">{d.watchlist.map((w) => `${t(w.label)} («${w.query}»)`).join(", ")}</p>
        </Section>
      </div>
      <Section title={t("Forecast history")}>
        <Table head={[t("Product"), t("Type"), t("Status"), t("Owner"), t("Created")]} empty={!d.history.length}>
          {d.history.map((h) => <tr key={h.id}><td>{h.query}</td><td>{t(h.kind === "compare" ? "comparison" : "analysis")}</td><td><Badge tone={h.status === "completed" ? "green" : "amber"}>{t(h.status)}</Badge></td><td className="text-xs">{h.owner}</td><td>{timeAgo(h.createdAt)}</td></tr>)}
        </Table>
      </Section>
    </div>
  );
}

export default function Services({ which }: { which: "studio" | "forecast" }) {
  const { t } = useI18n();
  const [range, setRange] = useState(defaultRange());
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">{t(which === "studio" ? "AI Product Studio" : "Demand Forecast")}</h1>
        <DateRange from={range.from} to={range.to} onChange={setRange} />
      </div>
      {which === "studio" ? <StudioAdmin range={range} /> : <ForecastAdmin range={range} />}
    </div>
  );
}
