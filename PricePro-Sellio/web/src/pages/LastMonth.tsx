/**
 * "Last month": which of the watched products people in Uzbekistan searched for most and least in
 * the last complete calendar month, on one shared scale, with the change against the month before.
 */
import { ArrowDownRight, ArrowUpRight, ChevronRight, Trophy } from "lucide-react";
import { useState } from "react";
import { Modal, cx } from "../components/ui";
import { HAS_MODELS, ModelsPanel } from "./Models";
import { fmtMonth } from "../lib/format";
import { useI18n } from "../lib/i18n";

export type LastMonthItem = { query: string; label: string; index: number; changePct: number | null };
export type LastMonthData =
  | { configured: true; geo: string; computedAt: string; month: string; comparable: boolean; checked: number; best: LastMonthItem[]; worst: LastMonthItem[]; items: LastMonthItem[] }
  | { configured: false };

function Row({ it, rank, good, comparable, onAnalyse, onModels }: { it: LastMonthItem; rank: number; good: boolean; comparable: boolean; onAnalyse: (q: string) => void; onModels: (it: LastMonthItem) => void }) {
  const { t } = useI18n();
  const c = it.changePct;
  return (
    <li data-query={it.query} className="flex items-center gap-1">
      <button type="button" onClick={() => onAnalyse(it.query)} title={t("When does it sell best?")}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60">
        <span className={cx("grid h-8 w-8 flex-none place-items-center rounded-lg text-sm font-bold text-white", good ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gradient-to-br from-rose-500 to-pink-600")}>{rank}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{t(it.label)} <span className="text-xs font-normal muted">«{it.query}»</span></span>
          {comparable && (
            <span className="mt-1 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <span className={cx("block h-full rounded-full", good ? "bg-emerald-500" : "bg-rose-400")} style={{ width: `${Math.max(2, it.index)}%` }} />
              </span>
              <span className="w-8 text-right text-xs font-semibold">{it.index}</span>
            </span>
          )}
        </span>
        <span className="w-16 flex-none text-right">
          <b className={cx("block text-sm", c === null ? "" : c > 3 ? "text-emerald-600 dark:text-emerald-400" : c < -3 ? "text-rose-600 dark:text-rose-400" : "")}>{c === null ? "—" : `${c > 0 ? "+" : ""}${Math.round(c)}%`}</b>
          <ChevronRight className="ml-auto h-4 w-4 text-slate-400" />
        </span>
      </button>
      {HAS_MODELS.has(it.query) && (
        <button type="button" onClick={() => onModels(it)} data-testid="models-open"
          className="flex-none rounded-lg border border-brand-200 px-2 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50 dark:border-brand-500/30 dark:text-brand-300 dark:hover:bg-brand-500/10">{t("Models")}</button>
      )}
    </li>
  );
}

export function LastMonthTop({ data, loading, onAnalyse }: { data: LastMonthData | undefined; loading: boolean; onAnalyse: (query: string) => void }) {
  const { t } = useI18n();
  const [models, setModels] = useState<LastMonthItem | null>(null);
  if (loading) {
    return (
      <div className="space-y-3">
        <p className="text-sm muted">{t("Checking last month's searches on Google…")}</p>
        <div className="grid gap-3 md:grid-cols-2">{[0, 1].map((i) => <div key={i} className="h-48 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />)}</div>
      </div>
    );
  }
  if (!data || !data.configured || data.best.length === 0) return null;
  const month = fmtMonth(`${data.month}-01`);
  return (
    <div className="space-y-3" data-testid="last-month">
      <h3 className="flex items-center gap-2 font-semibold"><Trophy className="h-4 w-4 text-amber-500" />{t("Last month · {month} · Uzbekistan", { month })}</h3>
      <div className="grid gap-3 2xl:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 p-4 dark:border-emerald-500/30" data-testid="last-month-best">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><ArrowUpRight className="h-4 w-4" />{t(data.comparable ? "Sold best" : "Grew the most")}</p>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.best.map((it, k) => <Row key={it.query} it={it} rank={k + 1} good comparable={data.comparable} onAnalyse={onAnalyse} onModels={setModels} />)}
          </ul>
        </div>
        <div className="rounded-2xl border border-rose-200 p-4 dark:border-rose-500/30" data-testid="last-month-worst">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-rose-700 dark:text-rose-300"><ArrowDownRight className="h-4 w-4" />{t(data.comparable ? "Sold least" : "Fell the most")}</p>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.worst.map((it, k) => <Row key={it.query} it={it} rank={k + 1} good={false} comparable={data.comparable} onAnalyse={onAnalyse} onModels={setModels} />)}
          </ul>
        </div>
      </div>
      {models && (
        <Modal open onClose={() => setModels(null)} title={`${t(models.label)} «${models.query}» · ${month}`} wide>
          <ModelsPanel query={models.query} period="month" />
        </Modal>
      )}
      <p className="text-xs muted">{t("Right: change against the month before. Click a product to see in which months it sells best.")}</p>
      <p className="text-xs muted">
        {data.comparable
          ? t("Among {n} popular products Vendora watches, by Google searches in {month}, all on one scale: 100 = the most searched product of the month. People search shortly before they buy, so this shows demand, not the number of items sold. Updated daily.", { n: data.checked, month })
          : t("Among {n} popular products Vendora watches: the biggest change of Google searches in {month} versus the month before. It shows demand, not the number of items sold. Updated daily.", { n: data.checked, month })}
      </p>
    </div>
  );
}
