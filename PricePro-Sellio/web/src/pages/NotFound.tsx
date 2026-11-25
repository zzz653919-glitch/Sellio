import { Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, EmptyState } from "../components/ui";
import { useI18n } from "../lib/i18n";

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={<Compass className="h-6 w-6" />}
      title={t("Page not found")}
      text={t("The page you are looking for does not exist.")}
      action={<Link to="/"><Button>{t("Go to Dashboard")}</Button></Link>}
    />
  );
}
