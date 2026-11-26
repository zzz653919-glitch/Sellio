import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookmarkCheck, BookmarkPlus, Heart, MailWarning, PlugZap } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ApiError, del, errorMessage, post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { fmtInZone } from "../lib/format";
import { useQty } from "../lib/qty";
import { PLAN_NAME, planTone, type FavoriteType, type ProjectType, type Usage } from "../lib/types";
import { CodeForm, type CodeChallenge } from "./CodeForm";
import { Alert, Badge, Button, Progress, cx, useToast } from "./ui";

const SERVICE_TEXT: Record<string, string> = {
  imageGeneration: "AI image generation is not connected on this server, so advertisements cannot be generated yet. An administrator must configure an AI image provider (OPENAI_API_KEY).",
  payments: "Online payments are not configured on this server yet, so upgrades are unavailable. No payment will be taken or simulated.",
  textAi: "Text AI is not connected on this server. An administrator must add GEMINI_API_KEY (free tier at aistudio.google.com) or OPENAI_API_KEY.",
  comtrade: "Import and export by product group needs UN Comtrade. An administrator must add COMTRADE_API_KEY (free key from comtradedeveloper.un.org).",
  worldBank: "Economic statistics are turned off on this server (WORLD_BANK_ENABLED=false).",
  trends: "World demand data is not connected on this server. An administrator must configure SerpApi (SERPAPI_API_KEY), which provides Google Trends data.",
};

export function IntegrationNotice({ service }: { service: keyof typeof SERVICE_TEXT }) {
  const { t } = useI18n();
  return (
    <Alert tone="warning" title={t("Integration not connected")}>
      <span className="inline-flex items-start gap-1.5"><PlugZap className="mt-0.5 h-3.5 w-3.5 flex-none" />{t(SERVICE_TEXT[service])}</span>
    </Alert>
  );
}

/** Shown only to sessions created before sign-in codes were required. */
export function VerifyEmailBanner() {
  const { user, setUser } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [challenge, setChallenge] = useState<CodeChallenge | null>(null);
  const send = useMutation({
    mutationFn: () => post<CodeChallenge & { alreadyVerified?: boolean }>("/auth/resend-verification"),
    onSuccess: (d) => (d.alreadyVerified ? user && setUser({ ...user, emailVerified: true }) : setChallenge(d)),
    onError: (e) => toast("error", t(errorMessage(e))),
  });
  if (!user || user.emailVerified) return null;
  return (
    <div className="mb-6">
      <Alert
        tone="warning"
        title={t("Verify your email address")}
        action={!challenge && <Button size="sm" variant="secondary" loading={send.isPending} onClick={() => send.mutate()}>{t("Send code")}</Button>}
      >
        {challenge ? (
          <div className="mt-2 max-w-sm">
            <CodeForm compact start={challenge} onVerified={(u) => { setUser(u); toast("success", t("Email verified")); }} />
          </div>
        ) : (
          <span className="inline-flex items-start gap-1.5"><MailWarning className="mt-0.5 h-3.5 w-3.5 flex-none" />{t("We will send a 6-digit code to {email}. Services unlock after verification.", { email: user.email })}</span>
        )}
      </Alert>
    </div>
  );
}

export function ErrorAlert({ error }: { error: unknown }) {
  const { t } = useI18n();
  if (!error) return null;
  const limit = error instanceof ApiError && error.code === "LIMIT_REACHED";
  const notVerified = error instanceof ApiError && error.code === "EMAIL_NOT_VERIFIED";
  return (
    <Alert tone={limit ? "warning" : "error"} title={limit ? t("Plan limit reached") : notVerified ? t("Email not verified") : t("Something went wrong")}>
      {t(errorMessage(error))}
      {limit && <> <Link to="/subscription" className="font-semibold underline">{t("View plans")}</Link></>}
    </Alert>
  );
}

export function StatCard({ icon, label, value, hint, tone = "brand" }: { icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode; tone?: "brand" | "cyan" | "violet" | "emerald" | "amber" }) {
  const tile = { brand: "", cyan: "", violet: "t-lilac", emerald: "t-ok", amber: "t-warn" }[tone];
  return (
    <div className="card min-w-0 px-[18px] pb-[18px] pt-4">
      <span className={cx("tile mb-3.5", tile)}>{icon}</span>
      <p className="text-[27px] font-extrabold leading-tight tracking-[-0.03em]">{value}</p>
      <p className="mt-1.5 min-w-0 break-words text-[13px] muted">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-[var(--v-faint)]">{hint}</p>}
    </div>
  );
}

export function FavoriteButton({ itemType, refId, favoriteId, invalidate, compact }: {
  itemType: FavoriteType; refId: string; favoriteId: string | null; invalidate?: unknown[]; compact?: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [favId, setFavId] = useState<string | null>(favoriteId);
  const m = useMutation({
    mutationFn: async () => {
      if (favId) {
        await del(`/favorites/${favId}`);
        return null;
      }
      return (await post<{ favorite: { id: string } }>("/favorites", { itemType, refId })).favorite.id;
    },
    onSuccess: (id) => {
      setFavId(id);
      toast("success", id ? t("Added to Favorites") : t("Removed from Favorites"));
      qc.invalidateQueries({ queryKey: ["favorites"] });
      if (invalidate) qc.invalidateQueries({ queryKey: invalidate });
    },
    onError: (e) => toast("error", errorMessage(e)),
  });
  const label = favId ? t("Remove from Favorites") : t("Add to Favorites");
  if (compact) {
    return (
      <button onClick={() => m.mutate()} disabled={m.isPending} title={label} aria-label={label}
        className={cx("rounded-lg p-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800", favId ? "text-rose-500" : "text-slate-400")}>
        <Heart className={cx("h-4 w-4", favId && "fill-current")} />
      </button>
    );
  }
  return (
    <Button variant="secondary" size="sm" loading={m.isPending} onClick={() => m.mutate()} icon={<Heart className={cx("h-4 w-4", favId && "fill-rose-500 text-rose-500")} />}>
      {label}
    </Button>
  );
}

export function SaveProjectButton({ type, refId, projectId, invalidate }: { type: ProjectType; refId: string; projectId: string | null; invalidate?: unknown[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(Boolean(projectId));
  const m = useMutation({
    mutationFn: () => post("/projects", { type, refId }),
    onSuccess: () => {
      setSaved(true);
      toast("success", t("Saved to My Projects"));
      qc.invalidateQueries({ queryKey: ["projects"] });
      if (invalidate) qc.invalidateQueries({ queryKey: invalidate });
    },
    onError: (e) => toast("error", errorMessage(e)),
  });
  if (saved) {
    return (
      <Link to="/projects"><Button variant="secondary" size="sm" icon={<BookmarkCheck className="h-4 w-4 text-emerald-500" />}>{t("Saved in My Projects")}</Button></Link>
    );
  }
  return <Button variant="secondary" size="sm" loading={m.isPending} onClick={() => m.mutate()} icon={<BookmarkPlus className="h-4 w-4" />}>{t("Save to My Projects")}</Button>;
}

/** Request allowance: plan, used, remaining, total and the next reset (in the user's time zone). */
export function UsageMeter({ usage, compact }: { usage: Usage; compact?: boolean }) {
  const { t } = useI18n();
  const qty = useQty();
  const r = usage.metrics.requests;
  const fc = usage.metrics.forecasts;
  const ai = usage.metrics.ai;
  const reset = (iso: string) => fmtInZone(iso, usage.timezone);
  const block = (label: string, m: { used: number; limit: number; remaining: number }) => (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="muted">{t("{used}/{limit} used, {left} remaining", { used: m.used, limit: m.limit, left: qty(m.remaining) })}</span>
      </div>
      <Progress value={m.used} max={m.limit} />
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={planTone(usage.plan)}>{PLAN_NAME[usage.plan]}</Badge>
        <span className="text-sm muted">{r.period === "hours" ? t("Limits for every {h} hours", { h: r.windowHours ?? 1 }) : t(r.period === "day" ? "Daily limits" : "Monthly limits")}</span>
      </div>
      {block(t("AI advertisement images"), r)}
      {r.imagesToday && (
        <p className="text-sm">{t("AI images today")}: <b>{r.imagesToday.used}/{r.imagesToday.limit}</b> <span className="text-xs muted">({t("{n} remaining", { n: qty(r.imagesToday.remaining) })})</span></p>
      )}
      {fc && block(t("Demand forecasts"), fc)}
      <p className="text-xs muted">{t("AI ads and demand forecasts have separate limits. Failed operations are not counted.")}</p>
      {r.period === "hours" ? (
        <p className="text-xs muted">
          {t("Each request is available again {h} hours after it was used.", { h: r.windowHours ?? 1 })}
          {r.used > 0 && <> {t("Next free AI image")}: <b className="text-[var(--v-text)]">{reset(r.resetsAt)}</b>.</>}
          {fc && fc.used > 0 && <> {t("Next free forecast")}: <b className="text-[var(--v-text)]">{reset(fc.resetsAt)}</b>.</>}
        </p>
      ) : (
        <p className="text-xs muted">{t("Next reset")}: <b className="text-[var(--v-text)]">{reset(r.resetsAt)}</b> ({usage.timezone})</p>
      )}
      {!compact && (
        <div>
          <div className="mb-1 flex justify-between text-sm"><span>{t("AI text requests")}</span><span className="muted">{ai.used} / {qty(ai.limit)}</span></div>
          <Progress value={ai.used} max={ai.limit} />
          <p className="mt-1 text-xs muted">{t("Next reset")}: {reset(ai.resetsAt)}</p>
        </div>
      )}
    </div>
  );
}
