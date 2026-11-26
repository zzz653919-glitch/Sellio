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
  plans: { key: "pro" | "max"; name: string; enabled: boolean; month: Price; year: Price; requests: number; requestPeriod: "day" | "month"; ai: number }[];
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

  const start = useMutation({
    mutationFn: (b: { plan: "pro" | "max"; interval: Interval }) => post<{ payment: PaymentItem }>("/payments", b),
    onSuccess: () => { setPreview(null); refreshAll(); },
  });
  const sendReceipt = useMutation({
    mutationFn: (f: File) => { const form = new FormData(); form.append("file", f); return upload<{ payment: PaymentItem }>(`/payments/${open!.id}/receipt`, form); },
    onSuccess: () => refreshAll(),
    onError: () => setPreview(null),
  });
  const submit = useMutation({
    mutationFn: () => post<{ payment: PaymentItem }>(`/payments/${open!.id}/submit`),
    onSuccess: () => { toast("success", t("Your payment is being checked. Wait for the administrator's confirmation.")); refreshAll(); },
  });
  const cancel = useMutation({ mutationFn: () => del(`/payments/${open!.id}`), onSuccess: () => { setPreview(null); refreshAll(); } });

  const c = cfg.data;
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

  const summary = open ?? null;
  const price = selected ? (interval === "year" ? selected.year : selected.month) : null;
  const mode = open ? (open.submitted ? "review" : "pay") : "choose";

  return (
    <div className="space-y-6">
      <PageHeader icon={<Wallet className="h-6 w-6" />} title={t("Payment")} subtitle={t("Pay by bank card and upload the receipt. Your plan is activated after an administrator confirms the payment.")} />

      {user && user.plan !== "free" && mode === "choose" && (
        <Alert tone="success" title={t("Your {plan} plan is active", { plan: PLAN_NAME[user.plan] })}>
          <Link to="/subscription" className="font-semibold underline">{t("See limits and history")}</Link>
        </Alert>
      )}
      {mode === "choose" && latest?.status === "rejected" && (
        <Alert tone="error" title={t("Your last payment was not confirmed")}>
          {t("Reason")}: {latest.rejectReason || t("not given")}. {t("You can pay again or upload the correct receipt.")}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* ---------- left: plan and payment summary ---------- */}
        <div className="space-y-6">
          {mode === "choose" && (
            <Card className="space-y-4 p-5 sm:p-6">
              <h2 className="text-lg font-bold">{t("1. Choose a plan")}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {c.plans.filter((p) => p.enabled).map((p) => (
                  <button key={p.key} type="button" onClick={() => { setPlan(p.key); if (!p.year) setBillingInterval("month"); setParams({ plan: p.key }); }}
                    className={cx("rounded-[16px] border p-4 text-left transition", plan === p.key ? "border-[var(--v-sky)] bg-[var(--v-sky-soft)] shadow-[0_0_0_1px_var(--v-sky)]" : "border-[var(--v-line)] bg-[var(--v-glass-2)] hover:bg-[var(--v-glass-3)]")}>
                    <span className="flex items-center justify-between"><b className="text-lg">{p.name}</b>{plan === p.key && <Check className="h-5 w-5 text-[var(--v-sky)]" />}</span>
                    <span className="mt-1 block text-sm muted">{t(p.requestPeriod === "day" ? "{n} requests per day" : "{n} requests per month", { n: p.requests })}</span>
                    <span className="mt-2 block font-bold">{p.month ? som(p.month.uzs) : "—"} <span className="text-xs font-normal muted">/ {t("month")}</span></span>
                  </button>
                ))}
              </div>
              {selected?.year && (
                <Tabs value={interval} onChange={setBillingInterval} tabs={[{ value: "month", label: t("1 month") }, { value: "year", label: t("1 year") }]} />
              )}
              {start.error && <ErrorAlert error={start.error} />}
              <Button size="lg" className="w-full" disabled={!price || user?.plan === plan} loading={start.isPending} onClick={() => start.mutate({ plan, interval })}>
                {user?.plan === plan ? t("This plan is already active") : t("Continue to payment")}
              </Button>
            </Card>
          )}

          <Card className="p-5 sm:p-6">
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
            {selected && <p className="mt-3 text-xs muted">{t("After confirmation")}: {t(selected.requestPeriod === "day" ? "{n} requests per day" : "{n} requests per month", { n: selected.requests })} · {t("{n} AI text requests per month", { n: selected.ai })}</p>}
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="mb-2 text-lg font-bold">{t("Payment history")}</h2>
            <PaymentHistory items={list.data?.items ?? []} />
          </Card>
        </div>

        {/* ---------- right: card, instructions, receipt ---------- */}
        <div className="space-y-6">
          {mode === "choose" ? (
            <Card className="p-6"><EmptyState icon={<Wallet className="h-6 w-6" />} title={t("Choose a plan to see the payment details")} text={t("The card number and the exact amount appear here.")} /></Card>
          ) : mode === "review" ? (
            <Card className="space-y-4 p-6 text-center">
              <span className="tile mx-auto h-14 w-14 rounded-2xl t-warn"><Clock className="h-7 w-7" /></span>
              <h2 className="text-xl font-extrabold">{t("Your payment is being checked. Wait for the administrator's confirmation.")}</h2>
              <p className="text-sm muted">{t("Sent")}: {fmtDateTime(open!.submittedAt!)} · {som(open!.amountUzs)}</p>
              <p className="text-sm muted">{t("Your plan changes only after the administrator confirms the payment. This page updates by itself; you will also get a notification.")}</p>
              <a href={`/api/payments/${open!.id}/receipt`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1 text-sm font-semibold text-[var(--v-sky)] hover:underline"><FileText className="h-4 w-4" />{t("View the receipt you sent")}</a>
            </Card>
          ) : (
            <>
              <Card className="space-y-4 p-5 sm:p-6">
                <h2 className="text-lg font-bold">{t("2. Transfer the money to this card")}</h2>
                <BankCard card={open!.card} amount={open!.amountUzs} />
                <ol className="space-y-2 text-sm">
                  {[
                    t("Open your bank app (Payme, Click, Uzum, your bank's app) and choose a transfer to a card."),
                    t("Paste the card number and send exactly {sum}.", { sum: som(open!.amountUzs) }),
                    t("Take a screenshot of the successful payment or download the receipt (PDF)."),
                    t("Upload the receipt below and press \"{btn}\".", { btn: t("Confirm payment") }),
                  ].map((s, i) => (
                    <li key={i} className="flex gap-3"><span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-[var(--v-sky-soft)] text-xs font-bold text-[var(--v-sky)]">{i + 1}</span><span>{s}</span></li>
                  ))}
                </ol>
              </Card>

              <Card className="space-y-4 p-5 sm:p-6">
                <h2 className="text-lg font-bold">{t("3. Upload the receipt")}</h2>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
                <button type="button" onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
                  className="flex w-full flex-col items-center gap-2 rounded-[16px] border border-dashed border-[var(--v-line)] p-6 text-center hover:bg-[var(--v-glass-2)]">
                  {preview?.url ? <img src={preview.url} alt="" className="max-h-64 rounded-xl object-contain" />
                    : open!.receipt ? <><FileText className="h-8 w-8 text-[var(--v-sky)]" /><span className="text-sm font-semibold">{preview?.name ?? open!.receipt.name}</span></>
                    : <><UploadIcon className="h-8 w-8 text-[var(--v-sky)]" /><span className="text-sm font-semibold">{t("Choose or drop the receipt here")}</span></>}
                  <span className="text-xs muted">{t("JPG, PNG, WEBP or PDF · up to 4 MB")}</span>
                </button>
                {sendReceipt.isPending && <p className="text-sm muted">{t("Uploading…")}</p>}
                {sendReceipt.error && <ErrorAlert error={sendReceipt.error} />}
                {open!.receipt && !sendReceipt.isPending && <p className="flex items-center gap-1.5 text-sm text-[var(--v-ok)]"><CheckCircle2 className="h-4 w-4" />{t("Receipt uploaded")}</p>}
                {submit.error && <ErrorAlert error={submit.error} />}
                <Button size="lg" className="w-full" icon={<CheckCircle2 className="h-5 w-5" />} disabled={!open!.receipt || sendReceipt.isPending} loading={submit.isPending} onClick={() => submit.mutate()}>
                  {t("Confirm payment")}
                </Button>
                <p className="text-center text-xs muted">{t("Your plan is not changed by this button. It is activated only after an administrator checks the receipt.")}</p>
                <Button variant="ghost" className="w-full" loading={cancel.isPending} onClick={() => cancel.mutate()}>{t("Change plan or cancel")}</Button>
              </Card>
            </>
          )}
          {latest?.status === "approved" && mode === "choose" && (
            <Alert tone="success" title={t("Payment confirmed")}>{t("{plan} plan is active until {date}.", { plan: PLAN_NAME[latest.plan], date: latest.periodEnd?.slice(0, 10) ?? "" })}</Alert>
          )}
        </div>
      </div>
    </div>
  );
}
