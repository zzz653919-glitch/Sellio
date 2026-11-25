import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Circle, ExternalLink, ImageIcon, LineChart, MailOpen, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ErrorAlert } from "../components/shared";
import { Button, Card, EmptyState, PageHeader, PageLoader, Tabs, cx, useToast } from "../components/ui";
import { del, errorMessage, get, post } from "../lib/api";
import { fmtDateTime, timeAgo } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type { AppNotification } from "../lib/types";

const ICON: Record<string, typeof Bell> = { generation: ImageIcon, forecast: LineChart, account: ShieldCheck };

export default function Notifications() {
  const { t, tr } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [limit, setLimit] = useState(30);
  const q = useQuery({ queryKey: ["notifications", filter, limit], queryFn: () => get<{ items: AppNotification[]; unread: number; total: number }>(`/notifications?filter=${filter}&limit=${limit}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const act = useMutation({
    mutationFn: ({ path, method }: { path: string; method: "POST" | "DELETE" }) => (method === "POST" ? post(path) : del(path)),
    onSuccess: refresh,
    onError: (e) => toast("error", errorMessage(e)),
  });

  return (
    <div>
      <PageHeader icon={<Bell className="h-6 w-6" />} title={t("Notifications")} subtitle={t("Updates from your advertisements, demand analyses and account.")}
        actions={<>
          <Button variant="secondary" size="sm" disabled={!q.data?.unread} onClick={() => act.mutate({ path: "/notifications/read-all", method: "POST" })} icon={<CheckCheck className="h-4 w-4" />}>{t("Mark all as read")}</Button>
          <Button variant="ghost" size="sm" onClick={() => act.mutate({ path: "/notifications", method: "DELETE" })} icon={<Trash2 className="h-4 w-4" />}>{t("Clear read")}</Button>
        </>} />
      <div className="mb-4"><Tabs value={filter} onChange={setFilter} tabs={[{ value: "all", label: t("All") }, { value: "unread", label: t("Unread"), count: q.data?.unread }]} /></div>
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorAlert error={q.error} /> : q.data!.items.length === 0 ? (
        <EmptyState icon={<Bell className="h-6 w-6" />} title={filter === "unread" ? t("You're all caught up") : t("No notifications yet")} text={t("Notifications appear when your platform tasks finish.")} />
      ) : (
        <Card className="divide-y divide-slate-100 dark:divide-slate-800">
          {q.data!.items.map((n) => {
            const Icon = ICON[n.type] ?? Bell;
            return (
              <div key={n.id} className={cx("flex gap-4 p-4", !n.read && "bg-brand-50/40 dark:bg-brand-500/5")}>
                <span className="h-fit rounded-xl bg-slate-100 p-2.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Icon className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold">{!n.read && <Circle className="h-2 w-2 fill-brand-600 text-brand-600" />}{tr(n.title)}</p>
                  <p className="mt-0.5 text-sm muted">{tr(n.body)}</p>
                  <p className="mt-1 text-xs muted" title={fmtDateTime(n.createdAt)}>{timeAgo(n.createdAt)}</p>
                </div>
                <div className="flex flex-none items-start gap-1">
                  {n.link && (
                    <Link to={n.link} onClick={() => !n.read && act.mutate({ path: `/notifications/${n.id}/read`, method: "POST" })}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title={t("Open")} aria-label={t("Open")}><ExternalLink className="h-4 w-4" /></Link>
                  )}
                  <button onClick={() => act.mutate({ path: `/notifications/${n.id}/${n.read ? "unread" : "read"}`, method: "POST" })}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title={n.read ? t("Mark as unread") : t("Mark as read")} aria-label={n.read ? t("Mark as unread") : t("Mark as read")}>
                    {n.read ? <Circle className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
                  </button>
                  <button onClick={() => act.mutate({ path: `/notifications/${n.id}`, method: "DELETE" })} className="rounded-lg p-1.5 text-slate-500 hover:text-rose-600" title={t("Delete")} aria-label={t("Delete")}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            );
          })}
        </Card>
      )}
      {q.data && q.data.total > limit && <div className="mt-4 text-center"><Button variant="secondary" onClick={() => setLimit((l) => l + 30)}>{t("Load more")}</Button></div>}
    </div>
  );
}
