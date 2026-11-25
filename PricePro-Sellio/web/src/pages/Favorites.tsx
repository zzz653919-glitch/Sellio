import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Heart, ImageIcon, LineChart, Search, ShoppingBag, Tag, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorAlert } from "../components/shared";
import { Badge, Button, Card, EmptyState, Input, PageHeader, PageLoader, Select, Tabs, useToast } from "../components/ui";
import { del, errorMessage, get } from "../lib/api";
import { fmtDate, fmtMoney } from "../lib/format";
import { useDebounced } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import type { Favorite, FavoriteType } from "../lib/types";

const META: Record<FavoriteType, { label: string; icon: typeof Heart }> = {
  product: { label: "Product", icon: ShoppingBag },
  price_comparison: { label: "Price comparison", icon: Tag },
  advertisement: { label: "Advertisement", icon: ImageIcon },
  forecast: { label: "Forecast", icon: LineChart },
};

export default function Favorites() {
  const { t, tr } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [type, setType] = useState<"" | FavoriteType>("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);

  const list = useQuery({
    queryKey: ["favorites", type, category, dq],
    queryFn: () => {
      const sp = new URLSearchParams();
      if (type) sp.set("type", type);
      if (category) sp.set("category", category);
      if (dq) sp.set("q", dq);
      return get<{ items: Favorite[]; categories: string[] }>(`/favorites?${sp}`);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/favorites/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["favorites"] });
      toast("success", t("Removed from Favorites"));
    },
    onError: (e) => toast("error", errorMessage(e)),
  });

  const open = (f: Favorite) => {
    if (f.itemType === "product") window.open(String(f.data.url), "_blank", "noopener,noreferrer");
    else if (f.itemType === "advertisement") nav(`/studio?generation=${f.refId}`);
    else if (f.itemType === "forecast") nav(`/forecast?market=${f.refId}`);
    else nav(`/prices?search=${f.refId}`);
  };

  return (
    <div>
      <PageHeader icon={<Heart className="h-6 w-6" />} title={t("Favorites")} subtitle={t("Products, price comparisons, advertisements and reports you saved.")} />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs<"" | FavoriteType> value={type} onChange={setType} tabs={[
          { value: "", label: t("All") },
          { value: "product", label: t("Products") },
          { value: "price_comparison", label: t("Price comparisons") },
          { value: "advertisement", label: t("Advertisements") },
          { value: "forecast", label: t("Analysis reports") },
        ]} />
        <div className="flex gap-2">
          <div className="relative flex-1 lg:w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder={t("Search favorites")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("Search favorites")} />
          </div>
          <Select aria-label={t("Category")} className="w-44" value={category} onChange={(e) => setCategory(e.target.value)}
            options={[{ value: "", label: t("All categories") }, ...(list.data?.categories ?? []).map((c) => ({ value: c, label: t(c) }))]} />
        </div>
      </div>

      {list.isLoading ? <PageLoader /> : list.error ? <ErrorAlert error={list.error} /> : list.data!.items.length === 0 ? (
        <EmptyState icon={<Heart className="h-6 w-6" />} title={t("No favorites yet")} text={t("Use the heart button on products, comparisons, advertisements and forecasts.")} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.data!.items.map((f) => {
            const M = META[f.itemType];
            const img = (f.data.imageUrl as string | null | undefined) ?? null;
            return (
              <Card key={f.id} className="flex gap-4 p-4">
                <div className="flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                  {img ? <img src={img} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" /> : <M.icon className="h-7 w-7 text-slate-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <Badge tone="brand"><M.icon className="h-3 w-3" />{t(M.label)}</Badge>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold">{tr(f.title)}</p>
                  {f.itemType === "product" && (
                    <p className="text-xs muted">
                      <b className="text-slate-800 dark:text-slate-200">{fmtMoney(Number(f.data.price), (f.data.currency as string) ?? null)}</b> · {String(f.data.storeName)}
                      <span className="block">{t("Price as of {date}", { date: fmtDate(String(f.data.priceCapturedAt)) })}</span>
                    </p>
                  )}
                  {f.itemType === "price_comparison" && f.data.best ? <p className="text-xs muted">{t("Best")}: {String(f.data.best)}</p> : null}
                  <p className="text-xs muted">{t("Saved")} {fmtDate(f.createdAt)}</p>
                  <div className="mt-2 flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => open(f)} icon={<ExternalLink className="h-3.5 w-3.5" />}>{t("Open")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove.mutate(f.id)} aria-label={t("Remove from Favorites")} icon={<Trash2 className="h-3.5 w-3.5" />} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
