import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, CreditCard, Crown, ExternalLink, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorAlert, IntegrationNotice } from "../components/shared";
import { Alert, Badge, Button, Card, PageHeader, PageLoader, Progress, cx } from "../components/ui";
import { get, post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtDate, fmtDateTime, fmtMoney } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useQty } from "../lib/qty";
import type { Usage } from "../lib/types";

type PlanInfo = { name: string; priceMonthlyUsd: number; limits: Record<string, number>; benefits: string[] };
type SubData = {
  plan: "free" | "pro";
  subscription: { plan: string; status: string; provider: string | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; manageable: boolean } | null;
  plans: Record<"free" | "pro", PlanInfo>;
  usage: Usage;
  history: { id: string; type: string; plan: string | null; amountCents: number | null; currency: string | null; createdAt: string }[];
  paymentsConfigured: boolean;
};

const EVENT_LABEL: Record<string, string> = {
  plan_started: "Free plan started", checkout_started: "Checkout started (not paid yet)", upgraded: "Upgraded to Pro (payment confirmed)",
  payment: "Payment received", subscription_updated: "Subscription updated", cancellation_scheduled: "Cancellation scheduled",
  canceled: "Subscription canceled", downgraded: "Downgraded to Free",
};

export default function Subscription() {
  const { t } = useI18n();
  const qty = useQty();
  const { refresh } = useAuth();
  const [params] = useSearchParams();
  const checkoutState = params.get("checkout");
  const q = useQuery({
    queryKey: ["subscription"],
    queryFn: () => get<SubData>("/subscription"),
    // After returning from checkout, poll until the payment provider confirms via webhook.
    refetchInterval: (query) => (checkoutState === "success" && query.state.data?.plan !== "pro" ? 3000 : false),
  });
  useEffect(() => {
    if (q.data?.plan === "pro") refresh();
  }, [q.data?.plan, refresh]);

  const checkout = useMutation({
    mutationFn: () => post<{ url: string }>("/subscription/checkout"),
    onSuccess: (d) => { window.location.href = d.url; },
  });
  const portal = useMutation({
    mutationFn: () => post<{ url: string }>("/subscription/portal"),
    onSuccess: (d) => { window.location.href = d.url; },
  });

  if (!q.data) return <PageLoader />;
  const d = q.data;
  const isPro = d.plan === "pro";

  return (
    <div>
      <PageHeader icon={<CreditCard className="h-6 w-6" />} title={t("Subscription")} subtitle={t("Your plan, usage limits and billing history.")} />
      {checkoutState === "success" && !isPro && (
        <div className="mb-6"><Alert tone="info" title={t("Waiting for payment confirmation")}><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />{t("Your plan changes only after the payment provider confirms the payment. This page updates automatically.")}</span></Alert></div>
      )}
      {checkoutState === "success" && isPro && <div className="mb-6"><Alert tone="success" title={t("Payment confirmed")}>{t("Pro limits are now active.")}</Alert></div>}
      {checkoutState === "cancelled" && <div className="mb-6"><Alert tone="warning">{t("Checkout was cancelled. No payment was taken.")}</Alert></div>}
      {!d.paymentsConfigured && !isPro && <div className="mb-6"><IntegrationNotice service="payments" /></div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6">
          <h3 className="flex items-center gap-2 text-lg font-bold">{isPro && <Crown className="h-5 w-5 text-amber-500" />}{t("Usage this month")}</h3>
          {d.subscription?.currentPeriodEnd && <p className="mt-1 text-sm muted">{d.subscription.cancelAtPeriodEnd ? t("ends") : t("renews")} {fmtDate(d.subscription.currentPeriodEnd)}</p>}
          <div className="mt-6 space-y-4">
            {([["generations", "Ad generations"], ["forecasts", "Forecasts"], ["ai", "AI text requests"]] as const).map(([k, label]) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-sm"><span>{t(label)}</span><span className="muted">{d.usage.metrics[k].used} / {qty(d.usage.metrics[k].limit)}</span></div>
                <Progress value={d.usage.metrics[k].used} max={d.usage.metrics[k].limit} />
              </div>
            ))}
            <p className="text-xs muted">{t("Usage resets on the 1st of each month.")}</p>
          </div>
          {isPro && d.subscription?.manageable && (
            <Button variant="secondary" className="mt-6 w-full" loading={portal.isPending} onClick={() => portal.mutate()} icon={<ExternalLink className="h-4 w-4" />}>{t("Manage billing")}</Button>
          )}
          {portal.error && <div className="mt-3"><ErrorAlert error={portal.error} /></div>}
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
          {(["free", "pro"] as const).map((p) => {
            const plan = d.plans[p];
            const current = d.plan === p;
            return (
              <Card key={p} className={cx("flex flex-col p-6", p === "pro" && "border-brand-400 ring-4 ring-brand-500/10 dark:border-brand-500/50")}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  {current ? <Badge tone="green">{t("Current")}</Badge> : p === "pro" && <Badge tone="violet">{t("Recommended")}</Badge>}
                </div>
                <p className="mt-2"><span className="text-4xl font-extrabold">${plan.priceMonthlyUsd}</span><span className="muted"> / {t("month")}</span></p>
                <ul className="mt-5 flex-1 space-y-2 text-sm">
                  {plan.benefits.map((b) => <li key={b} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 flex-none text-emerald-500" />{t(b)}</li>)}
                </ul>
                {p === "pro" && !isPro && (
                  <>
                    {checkout.error && <div className="mt-4"><ErrorAlert error={checkout.error} /></div>}
                    <Button className="mt-6 w-full" size="lg" loading={checkout.isPending} disabled={!d.paymentsConfigured} onClick={() => checkout.mutate()} icon={<Crown className="h-4 w-4" />}>{t("Upgrade to Pro")}</Button>
                    <p className="mt-2 text-center text-xs muted">{d.paymentsConfigured ? t("Secure payment via Stripe. Your plan changes after payment is confirmed.") : t("Upgrades are unavailable until payments are configured.")}</p>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      </div>

      <Card className="mt-6 p-6">
        <h3 className="mb-4 font-semibold">{t("Subscription history")}</h3>
        {d.history.length === 0 ? <p className="text-sm muted">{t("No history yet.")}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs muted"><th className="py-2">{t("Date")}</th><th>{t("Event")}</th><th>{t("Plan")}</th><th className="text-right">{t("Amount")}</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {d.history.map((h) => (
                  <tr key={h.id}>
                    <td className="py-2.5 muted">{fmtDateTime(h.createdAt)}</td>
                    <td>{t(EVENT_LABEL[h.type] ?? h.type)}</td>
                    <td>{h.plan ? h.plan.toUpperCase() : "—"}</td>
                    <td className="text-right">{h.amountCents !== null ? fmtMoney(h.amountCents / 100, h.currency?.toUpperCase() ?? null) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
