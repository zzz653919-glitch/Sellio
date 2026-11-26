import { Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { usePlatformStatus } from "../lib/status";
import { LanguageSwitch } from "./LanguageSwitch";
import { Logo } from "./Layout";
import { Button, PageLoader } from "./ui";

/** While maintenance mode is on, normal users see this page; administrators keep using the site. */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const status = usePlatformStatus();
  if (status.isLoading && !user?.adminRole) return <PageLoader />;
  if (!status.data?.maintenance || user?.adminRole) return <>{children}</>;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 p-6 text-center dark:bg-slate-950">
      <div className="flex items-center gap-3"><Logo /><LanguageSwitch /></div>
      <div className="card max-w-md space-y-3 p-8">
        <Wrench className="mx-auto h-10 w-10 text-brand-600" />
        <h1 className="text-xl font-bold">{t("Vendora is under maintenance")}</h1>
        <p className="text-sm muted">{status.data.message || t("We are improving Vendora. Please come back in a few minutes.")}</p>
        <div className="flex justify-center gap-2 pt-2">
          <Button variant="secondary" onClick={() => void status.refetch()} loading={status.isFetching}>{t("Check again")}</Button>
          {user && <Button variant="ghost" onClick={async () => { await logout(); nav("/login"); }}>{t("Log out")}</Button>}
        </div>
      </div>
    </div>
  );
}
