import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, Clock, Copy, FileText, Landmark, Upload as UploadIcon, Wallet, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorAlert } from "../components/shared";
import { Alert, Badge, Button, Card, EmptyState, PageHeader, PageLoader, Tabs, cx, useToast } from "../components/ui";
import { del, get, post, upload } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtDateTime, fmtNumber } from "../lib/format";
import { useI18n } from "../lib/i18n";

type Interval = "month" | "year";
type Price = { usd: number; uzs: number } | null;
type Config = {
  enabled: boolean; card: { number: string; holder: string; bank: string; type: string }; uzsPerUsd: number;
  plans: { key: "pro" | "max"; name: string; enabled: boolean; month: Price; year: Price; requests: number; forecasts?: number; requestPeriod: "hours" | "day" | "month"; periodHours?: number; ai: number }[];
};
export type PaymentItem = {
  id: string; plan: "pro" | "max"; interval: Interval; amountUsd: number; amountUzs: number; card: { number: string; holder: string; bank: string; type: string };
  status: "pending" | "approved" | "rejected" | "cancelled"; submitted: boolean; submittedAt: string | null;
  receipt: { name: string | null; mime: string | null; size: number | null } | null; reviewedAt: string | null; rejectReason: string | null; periodEnd: string | null; createdAt: string;
};

export const som = (n: number) => `${fmtNumber(n)} so'm`;
const groups = (n: string) => n.replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim();
const PLAN_NAME = { pro: "Pro", max: "Max" } as const;

export function PaymentStatusBadge({ p }: { p: PaymentItem }) {
  const { t } = useI18n();
  if (p.status === "approved") return <Badge tone="green"><CheckCircle2 className="h-3.5 w-3.5" />{t("Approved")}</Badge>;
  if (p.status === "rejected") return <Badge tone="red"><XCircle className="h-3.5 w-3.5" />{t("Rejected")}</Badge>;
  if (p.status === "cancelled") return <Badge tone="slate">{t("Cancelled")}</Badge>;
  return p.submitted ? <Badge tone="amber"><Clock className="h-3.5 w-3.5" />{t("Being checked")}</Badge> : <Badge tone="slate">{t("Waiting for receipt")}</Badge>;
}

/** Payment history (amount, plan, date, receipt, status, rejection reason). */
export function PaymentHistory({ items }: { items: PaymentItem[] }) {
  const { t } = useI18n();
  if (!items.length) return <p className="text-sm muted">{t("No payments yet.")}</p>;
  return (
    <ul className="divide-y divide-[var(--v-line-soft)]">
      {items.map((p) => (
        <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-semibold">{PLAN_NAME[p.plan]} · {t(p.interval === "year" ? "1 year" : "1 month")} · {som(p.amountUzs)}</p>
            <p className="text-xs muted">{fmtDateTime(p.submittedAt ?? p.createdAt)}{p.status === "approved" && p.periodEnd && ` · ${t("active until {date}", { date: p.periodEnd.slice(0, 10) })}`}</p>
            {p.status === "rejected" && <p className="mt-1 text-xs text-[var(--v-bad)]">{t("Reason")}: {p.rejectReason || t("not given")}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {p.receipt && <a href={`/api/payments/${p.id}/receipt`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--v-sky)] hover:underline"><FileText className="h-3.5 w-3.5" />{t("Receipt")}</a>}
            <PaymentStatusBadge p={p} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function BankCard({ card, amount }: { card: Config["card"]; amount: number }) {
  const { t } = useI18n();
  const toast = useToast();
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast("success", t("{x} copied", { x: what })); } catch { toast("error", t("Could not copy. Select the number and copy it by hand.")); }
  };
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-[#0b3b7a] via-[#0d5aa7] to-[#0ea5e9] p-5 text-white shadow-[var(--v-drop)] sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-bold"><Landmark className="h-4 w-4" />{card.bank}</span>
          <span className="rounded-md bg-white px-2 py-0.5 text-sm font-black italic tracking-tight text-[#1a1f71]">{card.type.toUpperCase()}</span>
        </div>
        <p className="relative mt-7 select-all font-mono text-[22px] font-bold tracking-[0.12em] sm:text-[27px]" aria-label={t("Card number")}>{groups(card.number)}</p>
        <div className="relative mt-5 flex items-end justify-between gap-3">
          <div><p className="text-[11px] uppercase tracking-wider opacity-75">{t("Cardholder")}</p><p className="font-semibold">{card.holder}</p></div>
          <div className="text-right"><p className="text-[11px] uppercase tracking-wider opacity-75">{t("Amount")}</p><p className="font-bold">{som(amount)}</p></div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => copy(card.number, t("Card number"))}>{t("Copy card number")}</Button>
        <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => copy(String(amount), t("Amount"))}>{t("Copy amount")}</Button>
      </div>
    </div>
  );
}

export default function Payment() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { user, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const [plan, setPlan] = useState<"pro" | "max">(params.get("plan") === "max" ? "max" : "pro");
  const [interval, setBillingInterval] = useState<Interval>(params.get("interval") === "year" ? "year" : "month");
  const [preview, setPreview] = useState<{ url: string | null; name: string } | null>(null);
  const cfg = useQuery({ queryKey: ["payment-config"], queryFn: () => get<Config>("/payments/config") });
  const list = useQuery({
    queryKey: ["payments"], queryFn: () => get<{ items: PaymentItem[]; open: PaymentItem | null }>("/payments"),
    // While the receipt is being checked, look for the administrator's decision every 15 seconds.
    refetchInterval: (q) => (q.state.data?.open?.submitted ? 15_000 : false),
  });
  const open = list.data?.open ?? null;
  const latest = list.data?.items[0] ?? null;
  const refreshAll = () => { void qc.invalidateQueries({ queryKey: ["payments"] }); };

  // When an approval arrives: refresh the account, limits and dashboard automatically.
  const approvedId = latest?.status === "approved" ? latest.id : null;
  useEffect(() => {
    if (!approvedId) return;
    refresh();
    void qc.invalidateQueries({ queryKey: ["subscription"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  }, [approvedId, refresh, qc]);
  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  // An open (not yet sent) request is created or updated only when the receipt is uploaded,
  // so choosing a plan never needs an extra "continue" step.
  const matches = (p: PaymentItem | null) => Boolean(p && p.plan === plan && p.interval === interval);
  const sendReceipt = useMutation({
    mutationFn: async (f: File) => {
      let target = open;
      if (!matches(target)) target = (await post<{ payment: PaymentItem }>("/payments", { plan, interval })).payment;
      const form = new FormData(); form.append("file", f);
      return upload<{ payment: PaymentItem }>(`/payments/${target!.id}/receipt`, form);
    },
    onSuccess: () => refreshAll(),
    onError: () => setPreview(null),
  });
  // Coming back with a started payment: show the plan it was started for.
  const openKey = open && !open.submitted ? `${open.id}:${open.plan}:${open.interval}` : null;
  useEffect(() => {
    if (!openKey) return;
    const [, p, i] = openKey.split(":");
    setPlan(p as "pro" | "max"); setBillingInterval(i as Interval);
  }, [openKey]);
  const submit = useMutation({
    mutationFn: () => post<{ payment: PaymentItem }>(`/payments/${open!.id}/submit`),
    onSuccess: () => { toast("success", t("Your payment is being checked. Wait for the administrator's confirmation.")); refreshAll(); },
  });
  const cancel = useMutation({ mutationFn: () => del(`/payments/${open!.id}`), onSuccess: () => { setPreview(null); refreshAll(); } });

  const c = cfg.data;
  const limitText = (p: Config["plans"][number]) => p.requestPeriod === "hours"
    ? t("{n} AI ad images + {m} forecasts every {h} hours", { n: p.requests, m: p.forecasts ?? p.requests, h: p.periodHours ?? 1 })
    : t(p.requestPeriod === "day" ? "{n} AI ad images + {m} forecasts per day" : "{n} AI ad images + {m} forecasts per month", { n: p.requests, m: p.forecasts ?? p.requests });
  const selected = useMemo(() => c?.plans.find((p) => p.key === (open?.plan ?? plan)), [c, open, plan]);
  if (cfg.isLoading || list.isLoading) return <PageLoader />;
  if (cfg.error) return <ErrorAlert error={cfg.error} />;
  if (!c || !c.enabled) return <Alert tone="warning">{t("Card payments are not available right now.")}</Alert>;

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type)) { toast("error", t("Upload the receipt as an image (JPG, PNG, WEBP) or a PDF file.")); return; }
    if (file.size > 4 * 1024 * 1024) { toast("error", t("The file is too large (maximum 4 MB).")); return; }
    setPreview({ url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null, name: file.name });
    sendReceipt.mutate(file);
  };

  const summary = open?.submitted ? open : null;
  const price = selected ? (interval === "year" ? selected.year : selected.month) : null;
  const mode = open?.submitted ? "review" : "pay";
  const ready = matches(open) && Boolean(open?.receipt);
  const already = user?.plan === plan;
  const choose = (key: "pro" | "max", i: Interval) => { setPlan(key); setBillingInterval(i); setPreview(null); setParams({ plan: key, interval: i }); };

  return (
    <div className="space-y-6">
      <PageHeader icon={<Wallet className="h-6 w-6" />} title={t("Payment")} subtitle={t("Pay by bank card and upload the receipt. Your plan is activated after an administrator confirms the payment.")} />

      {user && user.plan !== "free" && mode === "pay" && (
        <Alert tone="success" title={t("Your {plan} plan is active", { plan: PLAN_NAME[user.plan] })}>
          <Link to="/subscription" className="font-semibold underline">{t("See limits and history")}</Link>
        </Alert>
      )}
      {mode === "pay" && latest?.status === "rejected" && (
        <Alert tone="error" title={t("Your last payment was not confirmed")}>
          {t("Reason")}: {latest.rejectReason || t("not given")}. {t("You can pay again or upload the correct receipt.")}
        </Alert>
      )}

      {/* Plan and summary on the left, the card on the right, the receipt across the full width below.
          On a phone: plan → summary → card → receipt. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* Both columns stretch to the same height, so the summary and the card end on one line. */}
        <div className="flex flex-col gap-6 lg:col-start-1">
          {mode === "pay" && (
            <Card className="space-y-4 p-5 sm:p-6">
              <h2 className="text-lg font-bold">{t("1. Choose a plan and period")}</h2>
              <Tabs value={interval} onChange={(v) => choose(plan, v)} tabs={[{ value: "month", label: t("Monthly") }, { value: "year", label: t("Yearly") }]} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {c.plans.filter((p) => p.enabled).map((p) => {
                  const pr = interval === "year" ? p.year : p.month;
                  const save = interval === "year" && p.year && p.month ? p.month.usd * 12 - p.year.usd : 0;
                  return (
                    <button key={p.key} type="button" disabled={!pr} onClick={() => choose(p.key, interval)} data-plan={p.key}
                      className={cx("rounded-[16px] border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50", plan === p.key ? "border-[var(--v-sky)] bg-[var(--v-sky-soft)] shadow-[0_0_0_1px_var(--v-sky)]" : "border-[var(--v-line)] bg-[var(--v-glass-2)] hover:bg-[var(--v-glass-3)]")}>
                      <span className="flex items-center justify-between"><b className="text-lg">{p.name}</b>{plan === p.key && <Check className="h-5 w-5 text-[var(--v-sky)]" />}</span>
                      <span className="mt-1 block text-sm muted">{limitText(p)}</span>
                      <span className="mt-2 block font-bold">{pr ? som(pr.uzs) : t("Monthly only")} {pr && <span className="text-xs font-normal muted">/ {t(interval === "year" ? "year" : "month")}</span>}</span>
                      {save > 0 && <span className="mt-1 block text-xs font-semibold text-[var(--v-ok)]">{t("You save ${n}", { n: save })}</span>}
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          <Card className="flex-1 p-5 sm:p-6">
            <h2 className="text-lg font-bold">{t("Payment summary")}</h2>
            <p className="mt-1 text-sm font-semibold">{t("Due today")}</p>
            <div className="mt-3 overflow-hidden rounded-[14px] border border-[var(--v-line-soft)]">
              <div className="flex justify-between bg-[var(--v-th)] px-4 py-2 text-xs font-bold muted"><span>{t("Description")}</span><span>{t("Amount")}</span></div>
              <div className="flex justify-between gap-3 px-4 py-3 text-sm">
                <span>{t("{plan} plan", { plan: PLAN_NAME[(summary?.plan ?? plan)] })} · {t((summary?.interval ?? interval) === "year" ? "1 year" : "1 month")}</span>
                <span className="font-semibold">${summary ? summary.amountUsd : price?.usd ?? "—"}</span>
              </div>
            </div>
            <div className="mt-3 space-y-1.5 px-1 text-sm">
              <div className="flex justify-between muted"><span>{t("Exchange rate")}</span><span>1 $ = {fmtNumber(c.uzsPerUsd)} so'm</span></div>
              <div className="flex justify-between text-base font-extrabold"><span>{t("To pay")}</span><span>{summary ? som(summary.amountUzs) : price ? som(price.uzs) : "—"}</span></div>
            </div>
            {selected && <p className="mt-3 text-xs muted">{t("After confirmation")}: {limitText(selected)} · {t("{n} AI text requests per month", { n: selected.ai })}</p>}
          </Card>
        </div>
        <div className="flex flex-col gap-6 [&>*:first-child]:flex-1">
          {mode === "pay" && already ? (
            <Card className="p-6"><EmptyState icon={<CheckCircle2 className="h-6 w-6" />} title={t("This plan is already active")} text={t("Choose another plan to pay for it.")} /></Card>
          ) : mode === "review" ? (
            <Card className="space-y-4 p-6 text-center">
              <span className="tile mx-auto h-14 w-14 rounded-2xl t-warn"><Clock className="h-7 w-7" /></span>
              <h2 className="text-xl font-extrabold">{t("Your payment is being checked. Wait for the administrator's confirmation.")}</h2>
              <p className="text-sm muted">{t("Sent")}: {fmtDateTime(open!.submittedAt!)} · {som(open!.amountUzs)}</p>
              <p className="text-sm muted">{t("Your plan changes only after the administrator confirms the payment. This page updates by itself; you will also get a notification.")}</p>
              <a href={`/api/payments/${open!.id}/receipt`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1 text-sm font-semibold text-[var(--v-sky)] hover:underline"><FileText className="h-4 w-4" />{t("View the receipt you sent")}</a>
            </Card>
          ) : (
            <Card className="space-y-4 p-5 sm:p-6">
              <h2 className="text-lg font-bold">{t("2. Transfer the money to this card")}</h2>
              <BankCard card={c.card} amount={price?.uzs ?? 0} />
              <ol className="space-y-2 text-sm">
                {[
                  t("Open your bank app (Payme, Click, Uzum, your bank's app) and choose a transfer to a card."),
                  t("Paste the card number and send exactly {sum}.", { sum: som(price?.uzs ?? 0) }),
                  t("Take a screenshot of the successful payment or download the receipt (PDF)."),
                  t("Upload the receipt below and press \"{btn}\".", { btn: t("Confirm payment") }),
                ].map((s, i) => (
                  <li key={i} className="flex gap-3"><span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[var(--v-sky-soft)] text-xs font-bold text-[var(--v-sky)]">{i + 1}</span><span>{s}</span></li>
                ))}
              </ol>
            </Card>
          )}
          {latest?.status === "approved" && mode === "pay" && (
            <Alert tone="success" title={t("Payment confirmed")}>{t("{plan} plan is active until {date}.", { plan: PLAN_NAME[latest.plan], date: latest.periodEnd?.slice(0, 10) ?? "" })}</Alert>
          )}
        </div>
        {mode === "pay" && !already && (
          <div className="lg:col-span-2">
              <Card className="space-y-4 p-5 sm:p-6">
                <h2 className="text-lg font-bold">{t("3. Upload the receipt")}</h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                <div className="space-y-3">
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
                <button type="button" onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
                  className="flex w-full items-center gap-4 rounded-[16px] border border-dashed border-[var(--v-line)] p-3 text-left hover:bg-[var(--v-glass-2)] sm:p-4">
                  <span className="grid h-20 w-20 flex-none place-items-center overflow-hidden rounded-xl bg-[var(--v-sky-soft)]">
                    {preview?.url ? <img src={preview.url} alt="" className="h-full w-full object-cover" />
                      : ready ? <FileText className="h-8 w-8 text-[var(--v-sky)]" />
                      : <UploadIcon className="h-8 w-8 text-[var(--v-sky)]" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{preview?.name ?? (ready ? open!.receipt!.name : t("Choose or drop the receipt here"))}</span>
                    <span className="mt-0.5 block text-xs muted">{t("JPG, PNG, WEBP or PDF · up to 4 MB")}</span>
                    {(preview || ready) && <span className="mt-1 block text-xs font-semibold text-[var(--v-sky)]">{t("Replace")}</span>}
                  </span>
                </button>
                {sendReceipt.isPending && <p className="text-sm muted">{t("Uploading…")}</p>}
                {sendReceipt.error && <ErrorAlert error={sendReceipt.error} />}
                {ready && !sendReceipt.isPending && <p className="flex items-center gap-1.5 text-sm text-[var(--v-ok)]"><CheckCircle2 className="h-4 w-4" />{t("Receipt uploaded")}</p>}
                </div>
                <div className="space-y-3">
                {submit.error && <ErrorAlert error={submit.error} />}
                <Button size="lg" className="w-full" icon={<CheckCircle2 className="h-5 w-5" />} disabled={!ready || sendReceipt.isPending} loading={submit.isPending} onClick={() => submit.mutate()}>
                  {t("Confirm payment")}
                </Button>
                <p className="text-center text-xs muted">{t("Your plan is not changed by this button. It is activated only after an administrator checks the receipt.")}</p>
                {open && !open.submitted && <Button variant="ghost" className="w-full" loading={cancel.isPending} onClick={() => cancel.mutate()}>{t("Cancel payment")}</Button>}
                </div>
                </div>
              </Card>
          </div>
        )}
      </div>
    </div>
  );
}
