import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CalendarDays, CreditCard, Mail, MailWarning, Pencil, User as UserIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar } from "../components/Layout";
import { Badge, Button, Card, PageHeader, PageLoader, Progress } from "../components/ui";
import { get } from "../lib/api";
import { fmtDate } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type { Usage, User } from "../lib/types";

export default function Profile() {
  const { t } = useI18n();
  const q = useQuery({
    queryKey: ["profile"],
    queryFn: () => get<{ user: User; subscription: { plan: string; status: string; current_period_end: string | null } | null; usage: Usage }>("/user/profile"),
  });
  if (!q.data) return <PageLoader />;
  const { user, subscription, usage } = q.data;
  return (
    <div>
      <PageHeader icon={<UserIcon className="h-6 w-6" />} title={t("Profile")} actions={<Link to="/settings"><Button variant="secondary" icon={<Pencil className="h-4 w-4" />}>{t("Edit profile")}</Button></Link>} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 text-center">
          <div className="mx-auto w-fit"><Avatar url={user.avatarUrl} name={`${user.firstName} ${user.lastName}`} size={96} /></div>
          <h2 className="mt-4 text-xl font-bold">{user.firstName} {user.lastName}</h2>
          <p className="text-sm muted">{user.email}</p>
          <div className="mt-3 flex justify-center gap-2">
            <Badge tone={user.plan === "pro" ? "violet" : "slate"}>{user.plan === "pro" ? "Pro" : "Free"}</Badge>
            {user.emailVerified ? <Badge tone="green"><BadgeCheck className="h-3 w-3" />{t("Verified")}</Badge> : <Badge tone="amber"><MailWarning className="h-3 w-3" />{t("Not verified")}</Badge>}
          </div>
        </Card>
        <Card className="p-6 lg:col-span-2">
          <h3 className="mb-4 font-semibold">{t("Account information")}</h3>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              { icon: UserIcon, label: "First name", value: user.firstName },
              { icon: UserIcon, label: "Last name", value: user.lastName },
              { icon: Mail, label: "Email address", value: user.email },
              { icon: CalendarDays, label: "Account created", value: fmtDate(user.createdAt) },
              { icon: CreditCard, label: "Subscription status", value: `${user.plan === "pro" ? "Pro" : "Free"} · ${t(subscription?.status ?? "active")}` },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                <dt className="flex items-center gap-1.5 text-xs muted"><Icon className="h-3.5 w-3.5" />{t(label)}</dt>
                <dd className="mt-0.5 truncate font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <h3 className="mb-3 mt-6 font-semibold">{t("Usage this month")}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {([["generations", "Ad generations"], ["forecasts", "Forecasts"]] as const).map(([k, label]) => (
              <div key={k}>
                <div className="mb-1 flex justify-between text-sm"><span>{t(label)}</span><span className="muted">{usage.metrics[k].used} / {usage.metrics[k].limit}</span></div>
                <Progress value={usage.metrics[k].used} max={usage.metrics[k].limit} />
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/subscription"><Button variant="secondary" icon={<CreditCard className="h-4 w-4" />}>{t("Manage subscription")}</Button></Link>
            <Link to="/settings?tab=security"><Button variant="secondary">{t("Account security")}</Button></Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
