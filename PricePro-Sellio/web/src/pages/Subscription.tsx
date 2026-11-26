import { useQuery } from "@tanstack/react-query";
import { Check, CreditCard, Crown } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UsageMeter } from "../components/shared";
import { Alert, Badge, Button, Card, PageHeader, PageLoader, Tabs, cx } from "../components/ui";
import { get } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtDate, fmtDateTime, fmtMoney } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { planTone, type Usage } from "../lib/types";

type PlanKey = "free" | "pro" | "max";
type PlanInfo = { name: string; priceMonthlyUsd: number; priceYearlyUsd: number | null; limits: Record<string, number>; benefits: string[]; enabled: boolean };
type Interval = "month" | "year";
type SubData = {
  plan: PlanKey;
  subscription: { plan: string; status: string; provider: string | null; interval: Interval | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
  plans: Record<PlanKey, PlanInfo>;
  usage: Usage;
  history: { id: string; type: string; plan: string | null; amountCents: number | null; currency: string | null; createdAt: string }[];
};

const EVENT_LABEL: Record<string, string> = {
  plan_started: "Free plan started", upgraded: "Upgraded (payment confirmed)", admin_assigned: "Assigned by admin", payment_failed: "Payment failed", refund: "Refund",
  payment: "Payment received", subscription_updated: "Subscription updated", cancellation_scheduled: "Cancellation scheduled",
  canceled: "Subscription canceled", downgraded: "Downgraded to Free",
};

export default function Subscription() {
  const { t } = useI18n();
  const { refresh } = useAuth();
  const q = useQuery({ queryKey: ["subscription"], queryFn: () => get<SubData>("/subscription") });
  useEffect(() => {
    if (q.data && q.data.plan !== "free") refresh();
  }, [q.data?.plan, refresh]);
  const [interval, setBillingInterval] = useState<Interval>("month");

  const pay = useQuery({ queryKey: ["payment-config"], queryFn: () => get<{ enabled: boolean }>("/payments/config") });

  if (!q.data) return <PageLoader />;
  const d = q.data;
  const isPro = d.plan !== "free";

  return (
    <div>
      <PageHeader icon={<CreditCard className="h-6 w-6" />} title={t("Subscription")} subtitle={t("Your plan, usage limits and billing history.")} />
      {pay.data && !pay.data.enabled && <div className="mb-6"><Alert tone="warning">{t("Card payments are not available right now.")}</Alert></div>}

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-lg font-bold">{isPro && <Crown className="h-5 w-5 text-amber-500" />}{t("Your requests")}</h3>
          <div className="flex items-center gap-2">
            {d.subscription?.interval === "year" && <Badge tone={planTone(d.plan)}>{t("yearly")}</Badge>}
            {d.subscription?.currentPeriodEnd && <span className="text-sm muted">{d.subscription.cancelAtPeriodEnd ? t("ends") : t("renews")} {fmtDate(d.subscription.currentPeriodEnd)}</span>}
          </div>
        </div>
        <div className="mt-5"><UsageMeter usage={d.usage} /></div>
      </Card>

      <div className="mb-4 mt-8 flex flex-wrap items-center justify-between gap-3 px-1">
        <h2 className="text-lg font-bold">{t("Plans")}</h2>
        <Tabs value={interval} onChange={setBillingInterval} tabs={[{ value: "month", label: t("Monthly") }, { value: "year", label: t("Yearly") }]} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {(["free", "pro", "max"] as const).map((p) => {
          const plan = d.plans[p];
          if (!plan) return null;
          const current = d.plan === p;
          const yearly = interval === "year" && plan.priceYearlyUsd !== null && p !== "free";
          const available = p !== "free" && plan.enabled && Boolean(pay.data?.enabled);
          return (
            <Card key={p} className={cx("flex flex-col p-6", p === "max" && "ring-1 ring-[var(--v-sky)]")}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xl font-bold">{plan.name}</h3>
                {current ? <Badge tone="green">{t("Current")}</Badge> : p === "max" ? <Badge tone="brand">{t("Most limits")}</Badge> : p === "pro" && <Badge tone="violet">{t("Recommended")}</Badge>}
              </div>
              <p className="mt-2">
                <span className="text-4xl font-extrabold tracking-[-0.03em]">${yearly ? plan.priceYearlyUsd : plan.priceMonthlyUsd}</span>
                <span className="muted"> / {t(yearly ? "year" : "month")}</span>
              </p>
              <p className="mt-1 min-h-5 text-xs muted">
                {yearly && plan.priceYearlyUsd !== null
                  ? t("Instead of ${x} when paid monthly", { x: plan.priceMonthlyUsd * 12 })
                  : ""}
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {plan.benefits.map((b) => <li key={b} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 flex-none text-emerald-500" />{t(b)}</li>)}
              </ul>
              {p !== "free" && !current && (
                <>
                  {available
                    ? <Link to={`/payment?plan=${p}&interval=${yearly ? "year" : "month"}`} className="mt-6 block"><Button className="w-full" size="lg" icon={<Crown className="h-4 w-4" />}>{t("Switch to {plan}", { plan: plan.name })}</Button></Link>
                    : <Button className="mt-6 w-full" size="lg" disabled icon={<Crown className="h-4 w-4" />}>{t("Switch to {plan}", { plan: plan.name })}</Button>}
                  <p className="mt-2 text-center text-xs muted">{t("Pay by bank card and upload the receipt. Your plan is activated after an administrator confirms the payment.")}</p>
                </>
              )}
            </Card>
          );
        })}
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
                    <td>{h.plan ? (d.plans[h.plan as PlanKey]?.name ?? h.plan) : "—"}</td>
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
