import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookmarkCheck, BookmarkPlus, Heart, MailWarning, PlugZap } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ApiError, del, errorMessage, post } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import type { FavoriteType, ProjectType } from "../lib/types";
import { CodeForm, type CodeChallenge } from "./CodeForm";
import { Alert, Button, cx, useToast } from "./ui";

const SERVICE_TEXT: Record<string, string> = {
  imageGeneration: "AI image generation is not connected on this server, so advertisements cannot be generated yet. An administrator must configure an AI image provider (OPENAI_API_KEY).",
  prices: "No price data providers are connected on this server, so live prices cannot be fetched yet. An administrator must configure SerpApi (Google Shopping) and/or eBay API credentials.",
  payments: "Online payments are not configured on this server yet, so upgrades are unavailable. No payment will be taken or simulated.",
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
      {errorMessage(error)}
      {limit && <> <Link to="/subscription" className="font-semibold underline">{t("View plans")}</Link></>}
    </Alert>
  );
}

export function StatCard({ icon, label, value, hint, tone = "brand" }: { icon: ReactNode; label: string; value: ReactNode; hint?: ReactNode; tone?: "brand" | "cyan" | "violet" | "emerald" | "amber" }) {
  const bg = { brand: "from-brand-500 to-brand-600", cyan: "from-cyan-500 to-sky-600", violet: "from-violet-500 to-fuchsia-600", emerald: "from-emerald-500 to-teal-600", amber: "from-amber-500 to-orange-600" }[tone];
  return (
    <div className="card min-w-0 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-words text-sm font-medium muted">{label}</p>
        <span className={cx("shrink-0 rounded-xl bg-gradient-to-br p-2 text-white", bg)}>{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs muted">{hint}</p>}
    </div>
  );
}

export function FavoriteButton({ itemType, refId, favoriteId, searchId, offerId, invalidate, compact }: {
  itemType: FavoriteType; refId: string; favoriteId: string | null; searchId?: string; offerId?: string; invalidate?: unknown[]; compact?: boolean;
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
      const body = itemType === "product" ? { itemType, searchId, offerId } : { itemType, refId };
      return (await post<{ favorite: { id: string } }>("/favorites", body)).favorite.id;
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
