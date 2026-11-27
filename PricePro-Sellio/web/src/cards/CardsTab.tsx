/**
 * AI Product Studio → "Product cards": product cards for marketplaces and social platforms. The seller
 * uploads a photo and types the facts; the AI writes the texts (and can re-shoot the photo in a theme,
 * angle and background); designs are drawn; every card is kept on the server, can be edited, renamed,
 * duplicated, deleted, compared and downloaded, and its settings reused.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckSquare, Columns3, Copy, Download, LayoutGrid, Loader2, PencilLine, Plus, RefreshCw, Settings2, Sparkles, Square, Trash2, Wand2, ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ErrorAlert } from "../components/shared";
import { Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, Select, cx, useToast } from "../components/ui";
import { del, errorMessage, get, patch, post } from "../lib/api";
import { timeAgo } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type { Generation } from "../lib/types";
import Editor from "../studio/Editor";
import type { Doc, ImageEl } from "../studio/types";
import { cardData, CopyPanel, DocPreview, downloadZip, MP_ORDER, slug, storeImage, thumbOf, useCards, useOptions, type Full, type Summary } from "./common";
import { CreateCard } from "./CreateCard";
import { brandOf, buildCard, LAYOUT_LABEL, layoutsFor, MARKETPLACE_LAYOUTS, type LayoutKey, type MarketplaceKey } from "./layouts";
import type { ExportType } from "../studio/render";

const PALETTES = new Proxy({} as Record<MarketplaceKey, { primary: string }>, { get: (_t, k: string) => brandOf(k as MarketplaceKey) });

// ------------------------------------------------------------------ list + actions
function RenameDialog({ card, onClose }: { card: Summary | null; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  useEffect(() => { if (card) setName(card.name); }, [card]);
  const m = useMutation({
    mutationFn: () => patch(`/cards/${card!.id}`, { name: name.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cards"] }); qc.invalidateQueries({ queryKey: ["card", card!.id] }); onClose(); },
  });
  return (
    <Modal open={Boolean(card)} onClose={onClose} title={t("Rename card")}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) m.mutate(); }}>
        <Field label={t("Name")}><Input value={name} maxLength={120} autoFocus onChange={(e) => setName(e.target.value)} data-testid="rename-input" /></Field>
        {m.error && <ErrorAlert error={m.error} />}
        <div className="flex justify-end gap-2"><Button variant="ghost" type="button" onClick={onClose}>{t("Cancel")}</Button><Button type="submit" loading={m.isPending} disabled={!name.trim()}>{t("Save")}</Button></div>
      </form>
    </Modal>
  );
}

function useCardActions() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const duplicate = useMutation({
    mutationFn: (id: string) => post<{ card: Full }>(`/cards/${id}/duplicate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cards"] }); toast("success", t("Card duplicated")); },
    onError: (e) => toast("error", errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/cards/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cards"] }); toast("success", t("Deleted")); },
    onError: (e) => toast("error", errorMessage(e)),
  });
  const [zipping, setZipping] = useState<string | null>(null);
  const zip = async (ids: string[], type: ExportType) => {
    if (!ids.length) return;
    setZipping(`0/${ids.length}`);
    try { await downloadZip(ids, type, (n) => setZipping(`${n}/${ids.length}`)); toast("success", t("Downloaded {n} cards (ZIP).", { n: ids.length })); }
    catch (e) { toast("error", e instanceof Error && e.message === "WEBP_UNSUPPORTED" ? t("This browser cannot save {type}. Use PNG or JPG, or another browser (Chrome, Edge, Firefox).", { type: "WEBP" }) : t("The file could not be created. Try again.")); }
    finally { setZipping(null); }
  };
  return { duplicate, remove, zip, zipping };
}

function ZipButton({ ids, actions, label }: { ids: string[]; actions: ReturnType<typeof useCardActions>; label: string }) {
  const { t } = useI18n();
  const [type, setType] = useState<ExportType>("image/png");
  return (
    <div className="flex items-center gap-1.5">
      <Select value={type} onChange={(e) => setType(e.target.value as ExportType)} aria-label={t("File type")} className="!w-24" options={[{ value: "image/png", label: "PNG" }, { value: "image/jpeg", label: "JPG" }, { value: "image/webp", label: "WEBP" }]} />
      <Button size="sm" disabled={!ids.length || actions.zipping !== null} loading={actions.zipping !== null} icon={<Download className="h-4 w-4" />} onClick={() => void actions.zip(ids, type)} data-testid="zip-download">
        {actions.zipping ? `${t("Preparing")} ${actions.zipping}` : label}
      </Button>
    </div>
  );
}

function CardTile({ c, selected, onSelect, onOpen, onRename, onDelete, actions, mpLabel }: {
  c: Summary; selected?: boolean; onSelect?: () => void; onOpen: () => void; onRename: () => void; onDelete: () => void; actions: ReturnType<typeof useCardActions>; mpLabel: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cx("card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg", selected && "ring-2 ring-brand-500")} data-card={c.id}>
      <div className="relative">
        <button type="button" className="block w-full bg-slate-100 dark:bg-slate-800" onClick={onOpen} aria-label={`${t("Edit")}: ${c.name}`}>
          {c.thumb ? <img src={c.thumb} alt={c.name} className="aspect-[3/4] w-full object-contain" loading="lazy" decoding="async" /> : <div className="grid aspect-[3/4] place-items-center"><LayoutGrid className="h-6 w-6 muted" /></div>}
        </button>
        {onSelect && (
          <button type="button" onClick={onSelect} aria-pressed={selected} aria-label={t("Select")} className={cx("absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-lg shadow", selected ? "bg-brand-600 text-white" : "bg-white/90 text-slate-700")}>
            {selected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </button>
        )}
        <span className="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white shadow" style={{ background: PALETTES[c.marketplace]?.primary === "#FFCC00" ? "#1A1A1A" : PALETTES[c.marketplace]?.primary }}>{mpLabel}</span>
      </div>
      <div className="space-y-2 p-2.5 sm:p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold" title={c.name}>{c.name}</p>
          <p className="truncate text-[11px] muted">{c.w}×{c.h} · {timeAgo(c.updatedAt)}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" className="flex-1" icon={<PencilLine className="h-3.5 w-3.5" />} onClick={onOpen}>{t("Edit")}</Button>
          <button type="button" title={t("Rename")} aria-label={t("Rename")} onClick={onRename} className="rounded-lg p-2 muted hover:bg-[var(--v-th)] hover:text-current" data-testid="card-rename"><PencilLine className="h-4 w-4" /></button>
          <button type="button" title={t("Duplicate")} aria-label={t("Duplicate")} onClick={() => actions.duplicate.mutate(c.id)} className="rounded-lg p-2 muted hover:bg-[var(--v-th)] hover:text-current" data-testid="card-duplicate"><Copy className="h-4 w-4" /></button>
          <button type="button" title={t("Delete")} aria-label={t("Delete")} onClick={onDelete} className="rounded-lg p-2 muted hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" data-testid="card-delete"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}

/** One creation = one session: the designs made for one product together. */
type Session = { id: string; product: string; marketplace: MarketplaceKey; cards: Summary[]; updatedAt: string; w: number | null; h: number | null };
function sessionsOf(cards: Summary[]): Session[] {
  const by = new Map<string, Summary[]>();
  for (const c of cards) { const g = by.get(c.groupId); if (g) g.push(c); else by.set(c.groupId, [c]); }
  return [...by.entries()].map(([id, list]) => {
    const sorted = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const first = sorted[0];
    return {
      id, cards: sorted, marketplace: first.marketplace, w: first.w, h: first.h,
      product: first.product || first.name.replace(/ · [^·]+$/, ""),
      updatedAt: sorted.reduce((m, c) => (c.updatedAt > m ? c.updatedAt : m), first.updatedAt),
    };
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function SessionTile({ s, mpLabel, onOpen, onDelete }: { s: Session; mpLabel: string; onOpen: () => void; onDelete: () => void }) {
  const { t } = useI18n();
  const covers = s.cards.slice(0, 3);
  return (
    <div className="card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg" data-session={s.id}>
      <button type="button" onClick={onOpen} className="relative block w-full bg-slate-100 p-3 dark:bg-slate-800/60" aria-label={`${t("Open")}: ${s.product}`}>
        {/* the session's designs, fanned out */}
        <div className="relative mx-auto aspect-[4/2.9] w-full">
          {covers.map((c, i) => {
            const pos = covers.length === 1 ? ["left-[22%] w-[56%] z-[3]"] : covers.length === 2 ? ["left-[8%] w-[48%] z-[3]", "left-[44%] w-[48%] z-[2] rotate-3"] : ["left-[26%] w-[48%] z-[3]", "left-[2%] w-[42%] top-[6%] z-[2] -rotate-6", "right-[2%] w-[42%] top-[6%] z-[1] rotate-6"];
            return c.thumb
              ? <img key={c.id} src={c.thumb} alt="" loading="lazy" decoding="async" className={cx("absolute top-0 rounded-lg shadow-md ring-1 ring-black/5 transition group-hover:shadow-lg", pos[i])} />
              : <div key={c.id} className={cx("absolute top-0 grid aspect-[3/4] place-items-center rounded-lg bg-white shadow-md dark:bg-slate-700", pos[i])}><LayoutGrid className="h-5 w-5 muted" /></div>;
          })}
        </div>
        <span className="absolute right-2 top-2 z-10 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white shadow" style={{ background: PALETTES[s.marketplace]?.primary === "#FFCC00" ? "#1A1A1A" : PALETTES[s.marketplace]?.primary }}>{mpLabel}</span>
      </button>
      <div className="flex items-center gap-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold" title={s.product}>{s.product}</p>
          <p className="truncate text-[11px] muted">{t("{n} designs", { n: s.cards.length })}{s.w ? ` · ${s.w}×${s.h}` : ""} · {timeAgo(s.updatedAt)}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={onOpen}>{t("Open")}</Button>
        <button type="button" title={t("Delete")} aria-label={t("Delete")} onClick={onDelete} className="rounded-lg p-2 muted hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" data-testid="session-delete"><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function CardList({ onNew, openGroup }: { onNew: () => void; openGroup: (g: string) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const opts = useOptions();
  const cards = useCards();
  const [mp, setMp] = useState<"all" | MarketplaceKey>("all");
  const [toDelete, setToDelete] = useState<Session | null>(null);
  const sessions = useMemo(() => sessionsOf(cards.data ?? []), [cards.data]);
  const shown = sessions.filter((x) => mp === "all" || x.marketplace === mp);
  const label = (k: MarketplaceKey) => t(opts.data?.marketplaces[k]?.label ?? k);
  const counts = useMemo(() => { const m: Record<string, number> = {}; for (const x of sessions) m[x.marketplace] = (m[x.marketplace] ?? 0) + 1; return m; }, [sessions]);
  const removeSession = useMutation({
    mutationFn: (id: string) => del(`/cards/groups/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cards"] }); setToDelete(null); toast("success", t("Deleted")); },
    onError: (e) => toast("error", errorMessage(e)),
  });

  if (cards.isLoading) return <Card className="grid h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></Card>;
  if (cards.error) return <ErrorAlert error={cards.error} />;
  return (
    <div className="space-y-4" data-testid="card-list">
      <Card className="relative overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-violet-500/25 via-fuchsia-500/20 to-sky-400/20 blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <h2 className="text-lg font-bold">{t("Product cards for marketplaces")}</h2>
            <p className="mt-1 text-sm muted">{t("Upload a product photo and its details: the AI writes the texts and makes several card designs for Uzum Market, Wildberries, Ozon, Yandex Market and others. Edit and download them in the right sizes.")}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {MP_ORDER.slice(0, 4).map((k) => <span key={k} className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `${PALETTES[k].primary}1f`, color: k === "yandex" ? "#8a6d00" : PALETTES[k].primary }}>{label(k)}</span>)}
            </div>
          </div>
          <Button size="lg" icon={<Plus className="h-5 w-5" />} onClick={onNew} data-testid="card-new">{t("New card")}</Button>
        </div>
      </Card>

      {sessions.length === 0 ? (
        <Card className="p-6"><EmptyState icon={<LayoutGrid className="h-6 w-6" />} title={t("No product cards yet")} text={t("Create your first card: it takes about a minute.")} action={<Button icon={<Sparkles className="h-4 w-4" />} onClick={onNew}>{t("Create a card")}</Button>} /></Card>
      ) : (
        <>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
            {(["all", ...MP_ORDER] as const).map((k) => (
              <button key={k} type="button" onClick={() => setMp(k)} className={cx("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition", mp === k ? "border-transparent bg-[var(--v-btn)] text-[var(--v-btn-text)]" : "border-[var(--v-line)] hover:bg-[var(--v-th)]")}>
                {k === "all" ? t("All") : label(k)}<span className="opacity-60">{k === "all" ? sessions.length : counts[k] ?? 0}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 ? <p className="py-10 text-center text-sm muted">{t("No cards found")}</p> : (
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4">
              {shown.map((x) => <SessionTile key={x.id} s={x} mpLabel={label(x.marketplace)} onOpen={() => openGroup(x.id)} onDelete={() => setToDelete(x)} />)}
            </div>
          )}
        </>
      )}
      <ConfirmDialog open={Boolean(toDelete)} title={t("Delete these cards?")} text={toDelete ? t("All {n} designs made for \"{x}\" will be permanently deleted.", { n: toDelete.cards.length, x: toDelete.product }) : ""}
        confirmLabel={t("Delete")} loading={removeSession.isPending} onClose={() => setToDelete(null)} onConfirm={() => toDelete && removeSession.mutate(toDelete.id)} />
    </div>
  );
}

// ------------------------------------------------------------------ result of one creation (the variants)
/** Several designs side by side, large, to choose the final one. */
function CompareView({ items, onKeep, onOpen, keeping }: { items: Summary[]; onKeep: (c: Summary) => void; onOpen: (c: Summary) => void; keeping: boolean }) {
  const { t } = useI18n();
  return (
    <div className={cx("grid gap-4", items.length >= 3 ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2")} data-testid="compare-view">
      {items.map((c) => (
        <div key={c.id} className="card space-y-2 p-3">
          <div className="overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">{c.thumb ? <img src={c.thumb} alt={c.name} className="mx-auto max-h-[520px] w-full object-contain" /> : null}</div>
          <p className="truncate text-sm font-semibold">{c.name}</p>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" loading={keeping} onClick={() => onKeep(c)} icon={<Check className="h-4 w-4" />} data-testid="keep-this">{t("Choose this one")}</Button>
            <Button size="sm" variant="secondary" onClick={() => onOpen(c)}>{t("Edit")}</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function GroupView({ groupId, open, onBack, onNew, onReuse }: { groupId: string; open: (id: string) => void; onBack: () => void; onNew: () => void; onReuse: (regenerate: boolean) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [comparing, setComparing] = useState(false);
  const [keep, setKeep] = useState<Summary | null>(null);
  const keepOne = useMutation({
    mutationFn: async (c: Summary) => { for (const x of items) if (x.id !== c.id) await del(`/cards/${x.id}`); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cards"] }); setKeep(null); setComparing(false); toast("success", t("The other variations were deleted.")); },
    onError: (e) => toast("error", errorMessage(e)),
  });
  const opts = useOptions();
  const cards = useCards();
  const actions = useCardActions();
  const [rename, setRename] = useState<Summary | null>(null);
  const [toDelete, setToDelete] = useState<Summary | null>(null);
  const items = (cards.data ?? []).filter((c) => c.groupId === groupId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const first = items[0];
  const detail = useQuery({ queryKey: ["card", first?.id], queryFn: () => get<{ card: Full }>(`/cards/${first!.id}`).then((r) => r.card), enabled: Boolean(first) });
  if (cards.isLoading) return <Card className="grid h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></Card>;
  if (!first) return <Card className="p-6"><EmptyState icon={<LayoutGrid className="h-6 w-6" />} title={t("These cards were deleted")} action={<Button onClick={onBack}>{t("My cards")}</Button>} /></Card>;
  const mpLabel = t(opts.data?.marketplaces[first.marketplace]?.label ?? first.marketplace);
  return (
    <div className="space-y-5" data-testid="card-group">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBack}>{t("My cards")}</Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold">{detail.data?.input?.name ?? first.name}</h2>
          <p className="text-xs muted">{mpLabel} · {t("{n} designs", { n: items.length })} · {first.w}×{first.h}</p>
        </div>
        <ZipButton ids={items.map((c) => c.id)} actions={actions} label={t("Download all (ZIP)")} />
        <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={onNew}>{t("New card")}</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.length > 1 && <Button size="sm" variant={comparing ? "primary" : "secondary"} icon={<Columns3 className="h-4 w-4" />} onClick={() => setComparing((v) => !v)} data-testid="compare-toggle">{comparing ? t("Back to the grid") : t("Compare variations")}</Button>}
        <Button size="sm" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={() => onReuse(true)} data-testid="regenerate">{t("Regenerate")}</Button>
        <Button size="sm" variant="secondary" icon={<Settings2 className="h-4 w-4" />} onClick={() => onReuse(false)} data-testid="reuse-settings">{t("Use these settings")}</Button>
      </div>
      <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
        <Check className="mt-0.5 h-4 w-4 flex-none" /><span>{t("Your cards are ready and saved. Open a design to change texts, colours, pictures and icons.")}</span>
      </div>
      {comparing ? <CompareView items={items} keeping={keepOne.isPending} onOpen={(c) => open(c.id)} onKeep={(c) => setKeep(c)} /> : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {items.map((c) => <CardTile key={c.id} c={c} actions={actions} mpLabel={mpLabel} onOpen={() => open(c.id)} onRename={() => setRename(c)} onDelete={() => setToDelete(c)} />)}
        </div>
      )}
      <ConfirmDialog open={Boolean(keep)} title={t("Keep only this design?")} text={t("The other {n} variations of this product will be deleted.", { n: items.length - 1 })} confirmLabel={t("Keep this one")}
        loading={keepOne.isPending} onClose={() => setKeep(null)} onConfirm={() => keep && keepOne.mutate(keep)} />
      <Card className="p-5">
        <h3 className="mb-1 flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-brand-600" />{t("Texts for the marketplace")}</h3>
        <p className="mb-4 text-xs muted">{t("Paste them into the product page on the marketplace and into your ads.")}</p>
        {detail.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-brand-600" /> : <CopyPanel copy={detail.data?.copy ?? {}} />}
      </Card>
      <RenameDialog card={rename} onClose={() => setRename(null)} />
      <ConfirmDialog open={Boolean(toDelete)} title={t("Delete card?")} text={t("The card design will be permanently deleted.")} confirmLabel={t("Delete")} loading={actions.remove.isPending}
        onClose={() => setToDelete(null)} onConfirm={() => toDelete && actions.remove.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })} />
    </div>
  );
}

// ------------------------------------------------------------------ edit one card
/** Choose another design for a card (the texts and photo stay). */
function DesignPicker({ c, current, size, onPick, busy }: { c: Full; current: string; size: { w: number; h: number }; onPick: (l: LayoutKey) => void; busy: boolean }) {
  const { t } = useI18n();
  const data = useMemo(() => cardData(c), [c]);
  return (
    <div className="space-y-2" data-testid="design-picker">
      <p className="text-xs font-bold uppercase tracking-wide muted">{t("Change the design")}</p>
      <div className="grid grid-cols-3 gap-2">
        {layoutsFor(c.marketplace).map((l) => (
          <button key={l} type="button" disabled={busy} onClick={() => l !== current && onPick(l)} data-design={l} title={t(LAYOUT_LABEL[l])}
            className={cx("overflow-hidden rounded-lg border-2 text-left transition disabled:opacity-60", l === current ? "border-brand-500 ring-2 ring-brand-500/20" : "border-slate-200 hover:border-brand-300 dark:border-slate-700")}>
            <DocPreview doc={buildCard(l, data, size)} width={150} />
            <span className="block truncate px-1.5 py-1 text-[10px] font-semibold">{t(LAYOUT_LABEL[l])}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] muted">{t("The texts, price and photo stay; your manual changes on this card are replaced by the new design.")}</p>
    </div>
  );
}

const PICTURE_IDEAS = ["Remove all words from the picture", "Change the words in the picture to \"NEW\"", "Remove the logo from the picture", "Make the words in the picture bigger and clearer"];

/**
 * Change the words inside a picture (they are part of the photo, not editable text) with the AI image
 * editor. One AI image from the plan's limit; the new picture replaces the old one on the card.
 */
function AiPictureEdit({ el, apply }: { el: ImageEl; apply: (src: string) => Promise<void> }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const uploadId = /^\/api\/files\/([0-9a-f-]{36})/.exec(el.src)?.[1];
  const run = async () => {
    if (!uploadId) return;
    setError(null); setBusy(t("Sending to the AI…"));
    try {
      // a cut-out product (no frame) is edited with a transparent background, so it stays cut out
      const transparent = el.fit === "contain" && (el.mask ?? "none") === "none";
      const r = await post<{ generation: Generation }>("/cards/edit-image", { uploadId, instructions: text.trim(), transparent });
      setBusy(t("The AI is changing the picture… (up to a minute)"));
      let g = r.generation;
      const until = Date.now() + 4 * 60_000;
      while (g.status !== "succeeded" && g.status !== "failed") {
        if (Date.now() > until) throw new Error(t("The AI is taking too long. The result will appear in the AI Product Studio history."));
        await new Promise((ok) => setTimeout(ok, 2000));
        g = (await get<{ generation: Generation }>(`/studio/generations/${g.id}`)).generation;
      }
      qc.invalidateQueries({ queryKey: ["subscription"] });
      qc.invalidateQueries({ queryKey: ["generations"] });
      if (g.status === "failed" || !g.resultUrl) throw new Error(g.error ?? t("Generation failed"));
      await apply(g.resultUrl);
      setText("");
      toast("success", t("The picture was changed."));
    } catch (e) { setError(e); } finally { setBusy(null); }
  };
  return (
    <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-500/30 dark:bg-brand-500/5" data-testid="ai-picture">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><Wand2 className="h-4 w-4 text-brand-600" />{t("Change the words in the picture with AI")}</p>
      <p className="text-[11px] muted">{t("Words that are part of the photo (printed on the product or on the background) cannot be typed over. Write what to do with them, the AI redraws the picture. Uses one AI image from your limit.")}</p>
      {!uploadId ? <p className="text-xs muted">{t("Upload your product photo first.")}</p> : (
        <>
          <div className="flex flex-wrap gap-1">
            {PICTURE_IDEAS.map((x) => <button key={x} type="button" onClick={() => setText(t(x))} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] hover:border-brand-400 dark:border-slate-700 dark:bg-slate-900">{t(x)}</button>)}
          </div>
          <textarea className="input min-h-16 text-sm" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("e.g. remove the words OVERSIZED FIT")} data-testid="ai-picture-input" />
          {error != null && <ErrorAlert error={error} />}
          <Button size="sm" className="w-full" disabled={text.trim().length < 3 || busy !== null} loading={busy !== null} onClick={() => void run()} icon={<Sparkles className="h-4 w-4" />} data-testid="ai-picture-apply">
            {busy ?? t("Change the picture")}
          </Button>
        </>
      )}
    </div>
  );
}

function CardEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const opts = useOptions();
  const q = useQuery({ queryKey: ["card", id], queryFn: () => get<{ card: Full }>(`/cards/${id}`).then((r) => r.card), staleTime: Infinity, gcTime: 0 });
  const [status, setStatus] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const pending = useRef<Doc | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDoc = useRef<Doc | null>(null);
  const [ver, setVer] = useState(0);
  const [switching, setSwitching] = useState<LayoutKey | null>(null);
  const [confirmLayout, setConfirmLayout] = useState<LayoutKey | null>(null);
  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const doc = pending.current;
    if (!doc) return;
    pending.current = null;
    setStatus("saving");
    try {
      const thumb = await thumbOf(doc);
      await patch(`/cards/${id}`, { doc, thumb });
      if (!pending.current) setStatus("saved");
      qc.invalidateQueries({ queryKey: ["cards"] });
    } catch (e) {
      pending.current ??= doc;
      setStatus("error");
      toast("error", errorMessage(e));
    }
  }, [id, qc, toast]);
  const onChange = useCallback((doc: Doc) => {
    pending.current = doc;
    lastDoc.current = doc;
    setStatus("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1200);
  }, [flush]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (pending.current) { e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); void flush(); };
  }, [flush]);
  const c = q.data;
  const original = useMemo(() => {
    if (!c) return null;
    return MARKETPLACE_LAYOUTS[c.marketplace] && LAYOUT_LABEL[c.layout] ? buildCard(c.layout, cardData(c), { w: c.doc.w, h: c.doc.h }) : c.doc;
  }, [c]);
  /** Put another design on the card (saved at once; the editor starts again from it). */
  const switchDesign = async (layout: LayoutKey) => {
    if (!c) return;
    setSwitching(layout);
    try {
      await flush();
      const cur = lastDoc.current ?? c.doc;
      const doc = buildCard(layout, cardData(c), { w: cur.w, h: cur.h });
      const thumb = await thumbOf(doc);
      // "Bag · Bright" becomes "Bag · Frame" (a name the user typed is kept)
      const oldSuffix = ` · ${t(LAYOUT_LABEL[c.layout as LayoutKey] ?? c.layout)}`;
      const name = c.name.endsWith(oldSuffix) ? `${c.name.slice(0, -oldSuffix.length)} · ${t(LAYOUT_LABEL[layout])}`.slice(0, 120) : undefined;
      const r = await patch<{ card: Full }>(`/cards/${id}`, { layout, doc, thumb, ...(name ? { name } : {}) });
      lastDoc.current = null;
      qc.setQueryData(["card", id], r.card);
      qc.invalidateQueries({ queryKey: ["cards"] });
      setVer((v) => v + 1);
      toast("success", t("Design changed"));
    } catch (e) { toast("error", errorMessage(e)); } finally { setSwitching(null); }
  };
  if (q.isLoading) return <Card className="grid h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></Card>;
  if (q.error || !c || !original) return <div className="space-y-3"><ErrorAlert error={q.error} /><Button variant="ghost" onClick={onBack}>{t("My cards")}</Button></div>;
  const mpLabel = t(opts.data?.marketplaces[c.marketplace]?.label ?? c.marketplace);
  const statusEl = (
    <span className={cx("hidden items-center gap-1 text-xs sm:inline-flex", status === "error" ? "text-rose-600" : "muted")} data-testid="save-status" data-status={status}>
      {status === "saving" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("Saving…")}</> : status === "pending" ? t("Unsaved changes") : status === "error" ? t("Not saved") : <><Check className="h-3.5 w-3.5 text-emerald-600" />{t("Saved")}</>}
    </span>
  );
  return (
    <>
    <Editor
      key={`${c.layout}:${ver}`}
      onBack={() => { void flush().then(onBack); }}
      card={{
        doc: c.doc, original, title: c.name, subtitle: `${mpLabel} · ${t(LAYOUT_LABEL[c.layout] ?? c.layout)}`, backLabel: t("My cards"),
        sizes: opts.data?.marketplaces[c.marketplace]?.sizes ?? [{ w: c.doc.w, h: c.doc.h }],
        onChange, storeImage: (u) => storeImage(u), fileName: slug(c.name), status: statusEl,
        extra: {
          label: t("Design and texts"),
          content: (
            <div className="space-y-5">
              <DesignPicker c={c} current={c.layout} size={{ w: (lastDoc.current ?? c.doc).w, h: (lastDoc.current ?? c.doc).h }} onPick={setConfirmLayout} busy={switching !== null} />
              <div className="space-y-2"><p className="text-xs font-bold uppercase tracking-wide muted">{t("AI texts")}</p><CopyPanel copy={c.copy} compact /></div>
            </div>
          ),
        },
        imageTool: (el, apply) => <AiPictureEdit key={el.id} el={el} apply={apply} />,
      }}
    />
    <ConfirmDialog open={Boolean(confirmLayout)} title={t("Change the design?")} text={t("The card gets the new design with the same texts, price and photo. Changes you made by hand on this card are replaced.")}
      confirmLabel={t("Change")} loading={switching !== null} onClose={() => setConfirmLayout(null)}
      onConfirm={() => { const l = confirmLayout; setConfirmLayout(null); if (l) void switchDesign(l); }} />
    </>
  );
}

// ------------------------------------------------------------------ tab
export default function CardsTab() {
  const [params, setParams] = useSearchParams();
  const go = (p: Record<string, string>) => { setParams({ tab: "cards", ...p }); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cardId = params.get("card"), group = params.get("group"), isNew = params.get("new") === "1";
  if (cardId) return <CardEditor key={cardId} id={cardId} onBack={() => (group ? go({ group }) : go({}))} />;
  if (isNew) return <CreateCard key={`${params.get("from") ?? ""}:${params.get("regen") ?? ""}`} from={params.get("from")} regen={params.get("regen") === "1"} onDone={(g) => go({ group: g })} onCancel={() => go({})} />;
  if (group) return <GroupView groupId={group} open={(id) => go({ group, card: id })} onBack={() => go({})} onNew={() => go({ new: "1" })} onReuse={(regen) => go({ new: "1", from: group, ...(regen ? { regen: "1" } : {}) })} />;
  return <CardList onNew={() => go({ new: "1" })} openGroup={(g) => go({ group: g })} />;
}

