import { LineChart as LineIcon } from "lucide-react";
import { PageHeader } from "../components/ui";
import { useI18n } from "../lib/i18n";
import MarketDemand from "./MarketDemand";

/** Demand Forecast: world and country demand from real Google search data. */
export default function ForecastPage() {
  const { t } = useI18n();
  return (
    <div>
      <PageHeader icon={<LineIcon className="h-6 w-6" />} title={t("Demand Forecast")} subtitle={t("Demand worldwide and by country, from real Google search data.")} />
      <MarketDemand />
    </div>
  );
}
