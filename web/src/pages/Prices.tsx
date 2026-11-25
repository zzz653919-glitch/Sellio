import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgePercent, Download, ExternalLink, History, Radio, Search, ShoppingBag, Store, Tag, Trash2, TrendingDown } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorAlert, FavoriteButton, IntegrationNotice, SaveProjectButton } from "../components/shared";
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, Select, Spinner, cx, useToast } from "../components/ui";
import { del, errorMessage, get, post } from "../lib/api";
import { fmtDateTime, fmtMoney, timeAgo } from "../lib/format";
import { useDebounced } from "../lib/hooks";
import { useI18n } from "../lib/i18n";
import type { Offer, OfferGroup, PriceSearch } from "../lib/types";

type Filters = { sort: "low" | "high"; store: string; condition: string; availability: string };

function OfferRow({ o, cheapest, search }: { o: Offer; cheapest: Offer; search: PriceSearch }) {
  const { t } = useI18n();
  const diff = o.price - cheapest.price;
  const isBest = o.id === cheapest.id;
  return (
    <div className={cx("flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center", isBest ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/5" : "border-slate-200 dark:border-slate-800")}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {o.imageUrl ? <img src={o.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-14 w-14 flex-none rounded-lg bg-white object-contain" /> : <div className="flex h-14 w-14 flex-none items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800"><ShoppingBag className="h-5 w-5 text-slate-400" /></div>}
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-medium">{o.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs muted">
            <Store className="h-3.5 w-3.5" />{o.storeName}
            <Badge tone="slate">{o.condition ? t(o.condition) : t("condition not stated")}</Badge>
            <Badge tone={o.availability === "in_stock" ? "green" : o.availability === "out_of_stock" ? "red" : "slate"}>
              {o.availability === "in_stock" ? t("In stock (verified)") : o.availability === "out_of_stock" ? t("Out of stock") : t("Availability not verified")}
            </Badge>
            {o.shipping && <span>{o.shipping}</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 sm:justify-end">
        <div className="text-right">
          <p className={cx("text-lg font-bold", isBest && "text-emerald-600 dark:text-emerald-400")}>{fmtMoney(o.price, o.currency)}</p>
          {o.previousPrice !== null && o.previousPrice > o.price && <p className="text-xs muted line-through">{fmtMoney(o.previousPrice, o.currency)}</p>}
          <p className="text-xs muted">{isBest ? t("Cheapest") : `+${fmtMoney(diff, o.currency)}`}</p>
        </div>
        <div className="flex items-center gap-1">
          <FavoriteButton compact itemType="product" refId={o.id} favoriteId={null} searchId={search.id} offerId={o.id} />
          <a href={o.url} target="_blank" rel="noopener noreferrer nofollow"><Button size="sm" variant="secondary" icon={<ExternalLink className="h-3.5 w-3.5" />}>{t("Store")}</Button></a>
        </div>
      </div>
    </div>
  );
}

function Results({ search }: { search: PriceSearch }) {
  const { t } = useI18n();
  const groups = search.result?.groups ?? [];
  const [groupId, setGroupId] = useState(search.result?.bestGroupId ?? groups[0]?.id ?? "");
  const [f, setF] = useState<Filters>({ sort: "low", store: "", condition: "", availability: "" });
  const group: OfferGroup | undefined = groups.find((g) => g.id === groupId) ?? groups[0];
  const stores = useMemo(() => [...new Set(group?.offers.map((o) => o.storeName) ?? [])].sort(), [group]);
  const offers = useMemo(() => {
    if (!group) return [];
    return group.offers
      .filter((o) => !f.store || o.storeName === f.store)
      .filter((o) => !f.condition || (f.condition === "unknown" ? o.condition === null : o.condition === f.condition))
      .filter((o) => !f.availability || (f.availability === "verified" ? o.availability === "in_stock" : o.availability === null))
      .sort((a, b) => (f.sort === "low" ? a.price - b.price : b.price - a.price));
  }, [group, f]);
  const failed = search.providers.filter((p) => p.status === "error");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs muted">
        <Badge tone="green"><Radio className="h-3 w-3" />{t("Live data")}</Badge>
        <span>{t("Fetched")} {fmtDateTime(search.result?.fetchedAt ?? search.createdAt)}</span>
        <span>· {t("Sources")}: {search.providers.map((p) => `${p.label} (${p.status === "ok" ? p.count : t("error")})`).join(", ")}</span>
      </div>
      {failed.length > 0 && (
        <Alert tone="warning" title={search.status === "failed" ? t("All price sources failed") : t("Some price sources failed")}>
          {failed.map((p) => `${p.label}: ${p.error}`).join(" · ")}
        </Alert>
      )}

      {!group ? (
        <EmptyState icon={<Search className="h-6 w-6" />} title={t("No matching offers found")} text={t("Try a more specific or a shorter product name.")} />
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-5 p-5 sm:flex-row">
              {group.imageUrl ? <img src={group.imageUrl} alt="" referrerPolicy="no-referrer" className="h-36 w-36 flex-none self-center rounded-xl bg-white object-contain" /> : null}
              <div className="min-w-0 flex-1">
                <Badge tone="brand">{t("Best match")}</Badge>
                <h2 className="mt-2 line-clamp-2 text-lg font-semibold">{group.title}</h2>
                <p className="mt-1 text-sm muted">{t("{n} offers from {s} stores matched as the same product", { n: group.offers.length, s: group.storesCount })}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-500/10">
                    <p className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300"><TrendingDown className="h-3.5 w-3.5" />{t("Cheapest")}</p>
                    <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{fmtMoney(group.cheapest.price, group.cheapest.currency)}</p>
                    <p className="truncate text-xs muted">{group.cheapest.storeName}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                    <p className="text-xs font-medium muted">{t("Highest")}</p>
                    <p className="text-xl font-bold">{fmtMoney(group.highest.price, group.highest.currency)}</p>
                    <p className="truncate text-xs muted">{group.highest.storeName}</p>
                  </div>
                  <div className="rounded-xl bg-brand-50 p-3 dark:bg-brand-500/10">
                    <p className="flex items-center gap-1 text-xs font-medium text-brand-700 dark:text-brand-300"><BadgePercent className="h-3.5 w-3.5" />{t("Potential savings")}</p>
                    <p className="text-xl font-bold text-brand-700 dark:text-brand-300">{group.potentialSavings === null ? "—" : fmtMoney(group.potentialSavings, group.currency)}</p>
                    <p className="text-xs muted">{t("vs most expensive offer")}</p>
                  </div>
                </div>
                <a href={group.cheapest.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-4 inline-block"><Button icon={<ExternalLink className="h-4 w-4" />}>{t("Go to cheapest offer")}</Button></a>
              </div>
            </div>
          </Card>

          {groups.length > 1 && (
            <div>
              <p className="mb-2 text-xs font-medium muted">{t("Other matched products")}</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {groups.slice(0, 10).map((g) => (
                  <button key={g.id} onClick={() => setGroupId(g.id)}
                    className={cx("w-52 flex-none rounded-xl border p-2.5 text-left text-xs transition", g.id === group.id ? "border-brand-500 bg-brand-50/60 dark:bg-brand-500/10" : "border-slate-200 hover:border-slate-300 dark:border-slate-800")}>
                    <p className="line-clamp-2 font-medium">{g.title}</p>
                    <p className="mt-1 muted">{g.offers.length} {t("offers")} · {t("from")} {fmtMoney(g.cheapest.price, g.cheapest.currency)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <Card className="p-5">
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Select aria-label={t("Sort")} value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value as Filters["sort"] })} options={[{ value: "low", label: t("Lowest price") }, { value: "high", label: t("Highest price") }]} />
              <Select aria-label={t("Store")} value={f.store} onChange={(e) => setF({ ...f, store: e.target.value })} options={[{ value: "", label: t("All stores") }, ...stores.map((s) => ({ value: s, label: s }))]} />
              <Select aria-label={t("Condition")} value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })} options={[{ value: "", label: t("Any condition") }, { value: "new", label: t("new") }, { value: "used", label: t("used") }, { value: "refurbished", label: t("refurbished") }, { value: "unknown", label: t("condition not stated") }]} />
              <Select aria-label={t("Availability")} value={f.availability} onChange={(e) => setF({ ...f, availability: e.target.value })} options={[{ value: "", label: t("Any availability") }, { value: "verified", label: t("In stock (verified)") }, { value: "unverified", label: t("Availability not verified") }]} />
            </div>
            <div className="space-y-2">
              {offers.length === 0 ? <p className="py-6 text-center text-sm muted">{t("No offers match these filters.")}</p> : offers.map((o) => <OfferRow key={o.id} o={o} cheapest={group.cheapest} search={search} />)}
            </div>
          </Card>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <SaveProjectButton type="price_comparison" refId={search.id} projectId={search.projectId} invalidate={["price-search", search.id]} />
        <FavoriteButton itemType="price_comparison" refId={search.id} favoriteId={search.favoriteId} invalidate={["price-search", search.id]} />
        <a href={`/api/prices/searches/${search.id}/export.csv`}><Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />}>{t("Export CSV")}</Button></a>
      </div>
    </div>
  );
}

export default function Prices() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const currentId = params.get("search");
  const [query, setQuery] = useState("");
  const [showSugg, setShowSugg] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounced(query, 200);

  const options = useQuery({ queryKey: ["price-options"], queryFn: () => get<{ providers: { name: string; label: string }[] }>("/prices/options") });
  const popular = useQuery({ queryKey: ["price-popular"], queryFn: () => get<{ popular: { query: string; users: number }[] }>("/prices/popular") });
  const suggestions = useQuery({
    queryKey: ["price-suggest", debounced],
    queryFn: () => get<{ suggestions: string[] }>(`/prices/suggestions?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.trim().length >= 1,
  });
  const history = useQuery({ queryKey: ["price-history"], queryFn: () => get<{ items: PriceSearch[]; total: number }>("/prices/history?limit=20") });
  const current = useQuery({
    queryKey: ["price-search", currentId],
    queryFn: () => get<{ search: PriceSearch }>(`/prices/searches/${currentId}`).then((r) => r.search),
    enabled: Boolean(currentId),
  });

  const search = useMutation({
    mutationFn: (q: string) => post<{ search: PriceSearch }>("/prices/search", { query: q }),
    onSuccess: (d) => {
      qc.setQueryData(["price-search", d.search.id], d.search);
      qc.invalidateQueries({ queryKey: ["price-history"] });
      setParams({ search: d.search.id });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/prices/searches/${id}`),
    onSuccess: (_, id) => {
      setDeleteId(null);
      qc.invalidateQueries({ queryKey: ["price-history"] });
      if (currentId === id) setParams({});
    },
    onError: (e) => toast("error", errorMessage(e)),
  });

  const submit = (e?: FormEvent, value?: string) => {
    e?.preventDefault();
    const q = (value ?? query).trim();
    if (q.length < 2) return;
    setQuery(q);
    setShowSugg(false);
    search.mutate(q);
  };

  const noProviders = options.data && options.data.providers.length === 0;

  return (
    <div>
      <PageHeader icon={<Tag className="h-6 w-6" />} title={t("Smart Price Finder")} subtitle={t("Compare live prices across stores and find the cheapest offer.")} />
      {noProviders && <div className="mb-6"><IntegrationNotice service="prices" /></div>}

      <Card className="mb-6 p-5">
        <form onSubmit={submit} className="relative flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input ref={inputRef} className="input py-3 pl-11 text-base" placeholder={t("Search a product, e.g. iPhone 15 128GB")} value={query} maxLength={150}
              onChange={(e) => { setQuery(e.target.value); setShowSugg(true); }} onFocus={() => setShowSugg(true)} onBlur={() => setTimeout(() => setShowSugg(false), 150)}
              aria-label={t("Product search")} role="combobox" aria-expanded={showSugg} aria-autocomplete="list" />
            {showSugg && (suggestions.data?.suggestions.length ?? 0) > 0 && (
              <ul className="card absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden p-1" role="listbox">
                {suggestions.data!.suggestions.map((s) => (
                  <li key={s}><button type="button" role="option" aria-selected="false" onMouseDown={() => submit(undefined, s)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"><History className="h-4 w-4 text-slate-400" />{s}</button></li>
                ))}
              </ul>
            )}
          </div>
          <Button type="submit" size="lg" loading={search.isPending} disabled={query.trim().length < 2 || noProviders} icon={<Search className="h-4 w-4" />}>{t("Find Best Price")}</Button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="muted">{t("Popular searches")}:</span>
          {(popular.data?.popular.length ?? 0) === 0 ? <span className="muted">{t("none yet")}</span>
            : popular.data!.popular.map((p) => <button key={p.query} onClick={() => submit(undefined, p.query)} className="rounded-full bg-slate-100 px-2.5 py-1 font-medium hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700">{p.query}</button>)}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="lg:col-span-3">
          {search.isPending ? (
            <Card className="flex flex-col items-center justify-center gap-3 p-12"><Spinner className="h-8 w-8" /><p className="font-medium">{t("Checking stores…")}</p></Card>
          ) : search.error ? (
            <ErrorAlert error={search.error} />
          ) : currentId && current.data ? (
            <Results key={current.data.id} search={current.data} />
          ) : currentId && current.error ? (
            <ErrorAlert error={current.error} />
          ) : (
            <Card className="p-6"><EmptyState icon={<Tag className="h-6 w-6" />} title={t("Search for a product")} text={t("We query connected store and marketplace sources live. Prices, stores, availability and links are shown exactly as the sources report them.")} /></Card>
          )}
        </div>
        <Card className="h-fit p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><History className="h-4 w-4" />{t("Search history")}</h2>
          {history.data?.items.length === 0 ? <p className="py-4 text-center text-xs muted">{t("No searches yet.")}</p> : (
            <ul className="space-y-1">
              {history.data?.items.map((s) => (
                <li key={s.id} className={cx("group flex items-center gap-2 rounded-lg px-2 py-1.5", currentId === s.id ? "bg-brand-50 dark:bg-brand-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-800/60")}>
                  <button className="min-w-0 flex-1 text-left" onClick={() => setParams({ search: s.id })}>
                    <span className="block truncate text-sm font-medium">{s.query}</span>
                    <span className="text-xs muted">{s.bestOffer ? fmtMoney(s.bestOffer.price, s.bestOffer.currency) : s.status === "failed" ? t("failed") : t("no offers")} · {timeAgo(s.createdAt)}</span>
                  </button>
                  <button onClick={() => setDeleteId(s.id)} className="rounded p-1 text-slate-400 opacity-0 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100" aria-label={t("Delete")}><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <ConfirmDialog open={Boolean(deleteId)} title={t("Delete price comparison?")} text={t("This search will be removed from your history.")}
        confirmLabel={t("Delete")} loading={remove.isPending} onClose={() => setDeleteId(null)} onConfirm={() => deleteId && remove.mutate(deleteId)} />
    </div>
  );
}
