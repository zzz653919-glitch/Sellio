/**
 * "When does it sell best?" — the seller types a product and gets the months of the year when
 * it is bought most and least, when to get stock ready, and what is happening right now.
 * Based on 5 years of Google searches (people search before they buy); not sales figures.
 */
import { CalendarCheck, CalendarClock, Info, Search, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { seasonsOf, weeksOf, yearsOf, type SeasonKey } from "./periods";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Alert, Button, Field, Input, Select, Tabs, cx } from "../components/ui";
import { fmtMonth, fmtMonthName, fmtNumber, fmtPct } from "../lib/format";
import { useI18n } from "../lib/i18n";
import { useTheme } from "../lib/theme";
import { EVENT_LABEL, type Seasonality } from "./SeasonInsights";

export type MonthRating = "best" | "good" | "normal" | "slow" | "worst";
export type WhenResult = {
  kind: "when"; fetchedAt: string; query: string; usedQuery: string; geo: string; geoName: string; requestedGeo: string; requestedGeoName?: string;
  tried: { query: string; geo: string }[]; seasonality: Seasonality | null;
  months: { month: number; effectPct: number; consistency: number; rating: MonthRating }[];
  bestMonths: number[]; worstMonths: number[]; prepare: { date: string; months: number } | null;
  weekly?: { date: string; units: number }[];
};

const WORLD = "WORLD";
export const RATING_LABEL: Record<MonthRating, string> = { best: "Best time", good: "Good", normal: "Ordinary", slow: "Quiet", worst: "Weakest" };
const RATING_STYLE: Record<MonthRating, string> = {
  best: "bg-emerald-500 text-white border-emerald-500",
  good: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30",
  normal: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700",
  slow: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/30",
  worst: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:border-rose-500/30",
};

export function WhenForm({ countries, disabled, loading, onRun, initial }: {
  countries: { code: string; name: string }[]; disabled: boolean; loading: boolean; onRun: (query: string, geo: string) => void; initial?: string;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState(initial ?? "");
  const [geo, setGeo] = useState("UZ");
  const ok = query.trim().length >= 2;
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ok && !disabled) onRun(query.trim(), geo); }}>
      <p className="text-sm muted">{t("Type a product and see in which months it sells most and least, and when to get stock ready.")}</p>
      <Field label={t("Product")} hint={t("Write it the way people search, e.g. \"kurtka\", \"konditsioner\", \"maktab sumkasi\", \"iPhone 15\".")}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Search className="h-4 w-4" /></span>
          <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="kurtka" data-testid="when-query" />
        </div>
      </Field>
      <Field label={t("Where do you sell?")}>
        <Select value={geo} onChange={(e) => setGeo(e.target.value)} options={[{ value: WORLD, label: t("Worldwide") }, ...countries.map((c) => ({ value: c.code, label: t(c.name) }))]} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!ok || disabled} icon={<CalendarCheck className="h-4 w-4" />} data-testid="when-run">{t("When does it sell best?")}</Button>
    </form>
  );
}

export function WhenView({ r }: { r: WhenResult }) {
  const { t } = useI18n();
  const { resolved } = useTheme();
  const s = r.seasonality;
  const list = (ms: number[]) => ms.map((m) => fmtMonthName(m)).join(", ");
  const curMonth = new Date().getMonth() + 1;
  const product = r.query;
  const chart = useMemo(() => (s?.monthly ?? []).map((m) => ({ month: m.month, value: m.value })), [s]);
  const grid = resolved === "dark" ? "#1e293b" : "#e2e8f0";
  const axis = resolved === "dark" ? "#94a3b8" : "#64748b";

  const sourceNotes = (
    <>
      {r.usedQuery.toLowerCase() !== r.query.toLowerCase() && (
        <Alert tone="info">{t("There was little data for \"{typed}\", so the answer uses the searches for \"{used}\" — this is how people usually search for it.", { typed: r.query, used: r.usedQuery })}</Alert>
      )}
      {r.geo !== r.requestedGeo && (
        <Alert tone="info">{t("There are too few searches for this product in {area}, so the answer is based on worldwide searches. Seasons can differ a little from country to country.", { area: t(r.requestedGeoName ?? r.requestedGeo) })}</Alert>
      )}
    </>
  );

  if (!s) {
    return (
      <div className="space-y-3" data-testid="when-result">
        <Alert tone="warning">{t("Google has too little search data for this product to tell its season. Try a more general name, or write it in Russian or English (e.g. \"куртка\", \"jacket\").")}</Alert>
      </div>
    );
  }

  const top = [...r.months].sort((a, b) => b.effectPct - a.effectPct)[0];
  const bottom = [...r.months].sort((a, b) => a.effectPct - b.effectPct)[0];
  const now = r.months.find((m) => m.month === curMonth);
  const seasonal = s.level !== "none" && r.bestMonths.length > 0;
  const years = Math.max(1, Math.round(s.years));

  return (
    <div className="space-y-5" data-testid="when-result">
      {sourceNotes}

      <div className={cx("rounded-2xl border p-4 sm:p-5", seasonal ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900")} data-testid="when-answer">
        {seasonal ? (
          <>
            <p className="text-sm font-semibold muted">{t("Sells best")}</p>
            <p className="mt-0.5 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{list(r.bestMonths)}</p>
            <p className="mt-2 text-sm">{t("In {month} people look for it {pct}% more than usual.", { month: fmtMonthName(top.month), pct: fmtNumber(top.effectPct, 0) })}</p>
            {r.worstMonths.length > 0 && (
              <p className="mt-1 text-sm">{t("Sells least: {months} ({pct}% below usual).", { months: list(r.worstMonths), pct: fmtNumber(Math.abs(bottom.effectPct), 0) })}</p>
            )}
            {s.events.length > 0 && <p className="mt-1 text-sm">{t("This matches: {events}.", { events: s.events.map((e) => t(EVENT_LABEL[e])).join(", ") })}</p>}
            <p className="mt-1 text-xs muted">{t("The pattern repeated in {n} of {total} years.", { n: Math.round(top.consistency * years), total: years })}</p>
          </>
        ) : (
          <>
            <p className="text-lg font-bold">{t("{product} sells about the same all year", { product })}</p>
            <p className="mt-1 text-sm">{t("There is no clear season: no month stands out in 5 years of searches. Keep a steady stock all year.")}</p>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {now && (
          <div className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold muted"><CalendarClock className="h-3.5 w-3.5" />{t("Now")} · {fmtMonthName(now.month)}</p>
            <b>{t(RATING_LABEL[now.rating])}</b>
            <span className="block text-xs muted">{now.effectPct >= 0 ? t("{pct}% above the usual level", { pct: fmtNumber(now.effectPct, 0) }) : t("{pct}% below the usual level", { pct: fmtNumber(Math.abs(now.effectPct), 0) })}</span>
          </div>
        )}
        {r.prepare && seasonal && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3 text-sm dark:border-brand-500/30 dark:bg-brand-500/10" data-testid="when-prepare">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-brand-700 dark:text-brand-300"><Sparkles className="h-3.5 w-3.5" />{t("Get ready")}</p>
            <b>{fmtMonth(r.prepare.date)}</b>
            <span className="block text-xs muted">{r.prepare.months === 0 ? t("Start now: buy stock and launch advertising before demand climbs.") : t("In {n} months. Buy stock and prepare advertising by then: demand starts to climb the month after.", { n: r.prepare.months })}</span>
          </div>
        )}
      </div>

      {s.direction !== "stable" && s.yoyPct !== null && (
        s.direction === "declining" ? (
          <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm dark:border-rose-500/30 dark:bg-rose-500/10">
            <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <span>{t("Careful: overall interest is falling year after year ({pct} over the last 12 months). Even in its best months it may sell less than last year — do not buy a big stock.", { pct: fmtPct(s.yoyPct) })}</span>
          </div>
        ) : (
          <div className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>{t("Good sign: overall interest is also growing ({pct} over the last 12 months).", { pct: fmtPct(s.yoyPct) })}</span>
          </div>
        )
      )}

      <PeriodViews r={r} curMonth={curMonth} />


      {chart.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold">{t("5 years of searches: the season repeats")}</h3>
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={chart} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: axis, fontSize: 11 }} tickFormatter={(m: string) => `${fmtMonthName(Number(m.slice(5, 7)), true)} ${m.slice(2, 4)}`} minTickGap={24} />
                <YAxis domain={[0, 100]} tick={{ fill: axis, fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip contentStyle={{ background: resolved === "dark" ? "#0f172a" : "#fff", border: `1px solid ${grid}`, borderRadius: 12 }} labelFormatter={(m) => fmtMonth(`${m}-01`)} formatter={(v: unknown) => [`${fmtNumber(Number(v), 1)}%`, t("Search interest")]} />
                <Line dataKey="value" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <p className="flex gap-2 text-xs muted"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("Based on 5 years of Google searches in {area}: people search for a product shortly before they buy it, so the months with the most searches are usually the months with the most sales. These are not sales figures.", { area: t(r.geo === WORLD ? "Worldwide" : r.geoName) })}</p>
    </div>
  );
}

// ------------------------------------------------------------------ by period: weeks / months / seasons / years
const SEASON_LABEL: Record<SeasonKey, string> = { winter: "Winter", spring: "Spring", summer: "Summer", autumn: "Autumn" };
type Period = "weeks" | "months" | "seasons" | "years";

const signed = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v)}%`);
const tone = (v: number | null | undefined) => (v == null ? "" : v > 3 ? "text-emerald-600 dark:text-emerald-400" : v < -3 ? "text-rose-600 dark:text-rose-400" : "");
/** "23 noyabr" — day and month name, no year (a week of the year repeats every year). */
const dayMonth = (date: string) => `${Number(date.slice(8, 10))} ${fmtMonthName(Number(date.slice(5, 7)))}`;

function PeriodViews({ r, curMonth }: { r: WhenResult; curMonth: number }) {
  const { t } = useI18n();
  const { resolved } = useTheme();
  const [period, setPeriod] = useState<Period>("months");
  const s = r.seasonality!;
  const weekly = r.weekly ?? [];
  const weeks = useMemo(() => (weekly.length >= 60 ? weeksOf(weekly) : null), [weekly]);
  const seasons = useMemo(() => seasonsOf(r.months, s.level !== "none" && r.bestMonths.length > 0), [r, s]);
  const years = useMemo(() => yearsOf(s.monthly).filter((y) => y.months.length >= 3), [s]);
  const grid = resolved === "dark" ? "#1e293b" : "#e2e8f0";
  const axis = resolved === "dark" ? "#94a3b8" : "#64748b";
  const tip = { background: resolved === "dark" ? "#0f172a" : "#fff", border: `1px solid ${grid}`, borderRadius: 12 };
  const curSeason = seasons.find((x) => x.months.includes(curMonth))?.key;
  const range = (ms: number[]) => (ms.length >= 12 ? t("full year") : `${fmtMonthName(ms[0], true)}–${fmtMonthName(ms[ms.length - 1], true)}`);

  return (
    <div className="space-y-3" data-testid="when-periods">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{t("By period")}</h3>
        <Tabs value={period} onChange={setPeriod} tabs={[
          { value: "weeks", label: t("Weekly") }, { value: "months", label: t("Monthly") },
          { value: "seasons", label: t("Seasons") }, { value: "years", label: t("Yearly") },
        ]} />
      </div>

      {period === "months" && (
        <div data-testid="period-months">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" data-testid="when-calendar">
            {r.months.map((m) => (
              <div key={m.month} data-month={m.month} data-rating={m.rating}
                className={cx("rounded-xl border p-2.5 text-center", RATING_STYLE[m.rating], m.month === curMonth && "ring-2 ring-brand-500 ring-offset-2 ring-offset-[var(--v-bg,white)] dark:ring-offset-slate-900")}>
                <p className="text-sm font-bold capitalize">{fmtMonthName(m.month)}</p>
                <p className="text-[11px] font-semibold">{t(RATING_LABEL[m.rating])}</p>
                <p className="text-[11px] opacity-80">{signed(m.effectPct)}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs muted">{t("% — how much more or less people look for the product in that month than usual. The outlined month is the current one.")}</p>
        </div>
      )}

      {period === "seasons" && (
        <div data-testid="period-seasons">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {seasons.map((x) => (
              <div key={x.key} data-season={x.key} data-rating={x.rating}
                className={cx("rounded-xl border p-3", RATING_STYLE[x.rating], x.key === curSeason && "ring-2 ring-brand-500 ring-offset-2 ring-offset-[var(--v-bg,white)] dark:ring-offset-slate-900")}>
                <p className="font-bold">{t(SEASON_LABEL[x.key])}</p>
                <p className="text-[11px] opacity-80">{x.months.map((m) => fmtMonthName(m, true)).join(", ")}</p>
                <p className="mt-1 text-lg font-bold">{signed(x.effectPct)}</p>
                <p className="text-[11px] font-semibold">{t(RATING_LABEL[x.rating])}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs muted">{t("% — how much more or less people look for the product in that season than in an average month. The outlined season is the current one.")}</p>
        </div>
      )}

      {period === "years" && (
        <div className="space-y-3" data-testid="period-years">
          {years.length === 0 ? <p className="text-sm muted">{t("Not enough data")}</p> : (
            <>
              <div className="h-48">
                <ResponsiveContainer>
                  <BarChart data={years.map((y) => ({ year: y.partial ? `${y.year}*` : String(y.year), avg: y.avg, change: y.changePct }))} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                    <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="year" tick={{ fill: axis, fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: axis, fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                    <Tooltip contentStyle={tip} formatter={(v: unknown) => [`${fmtNumber(Number(v), 1)}%`, t("Average search interest")]} />
                    <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                      {years.map((y) => <Cell key={y.year} fill={y.changePct == null ? "#94a3b8" : y.changePct >= 0 ? "#10b981" : "#f43f5e"} fillOpacity={y.partial ? 0.45 : 1} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs muted dark:bg-slate-900">
                    <tr><th className="px-3 py-2 font-medium">{t("Year")}</th><th className="px-3 py-2 font-medium">{t("Average search interest")}</th><th className="px-3 py-2 font-medium">{t("Versus the year before")}</th><th className="px-3 py-2 font-medium">{t("Strongest month")}</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {[...years].reverse().map((y) => (
                      <tr key={y.year} data-year={y.year}>
                        <td className="px-3 py-2 font-semibold">{y.year}{y.partial && <span className="block text-[11px] font-normal muted">{range(y.months)}</span>}</td>
                        <td className="px-3 py-2">{fmtNumber(y.avg, 0)}%</td>
                        <td className={cx("px-3 py-2 font-semibold", tone(y.changePct))}>{signed(y.changePct)}</td>
                        <td className="px-3 py-2 capitalize">{fmtMonthName(y.peakMonth)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs muted">{t("* part of the year. Each year is compared with the same months of the year before, so part years are compared fairly.")}</p>
            </>
          )}
        </div>
      )}

      {period === "weeks" && (
        <div className="space-y-3" data-testid="period-weeks">
          {!weeks ? <p className="text-sm muted">{t("Weekly data is not saved in this older analysis. Press \"Update\" to get it.")}</p> : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <p className="text-xs font-semibold muted">{t("Last 4 weeks")}</p>
                  <b className="text-lg">{fmtNumber(weeks.last4, 0)}%</b>
                  <span className="block text-xs muted">{t("search interest (100% = the 5-year peak)")}</span>
                </div>
                <div className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <p className="text-xs font-semibold muted">{t("Versus the 4 weeks before")}</p>
                  <b className={cx("text-lg", tone(weeks.last4VsPrevPct))}>{signed(weeks.last4VsPrevPct)}</b>
                </div>
                <div className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <p className="text-xs font-semibold muted">{t("Versus the same weeks a year ago")}</p>
                  <b className={cx("text-lg", tone(weeks.last4VsYearAgoPct))}>{signed(weeks.last4VsYearAgoPct)}</b>
                </div>
              </div>
              <div>
                <p className="mb-1 text-sm font-semibold">{t("Last 12 weeks")}</p>
                <div className="h-40">
                  <ResponsiveContainer>
                    <BarChart data={weeks.recent.map((p) => ({ date: p.date, v: p.units }))} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                      <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: axis, fontSize: 10 }} tickFormatter={(d: string) => dayMonth(d)} minTickGap={10} />
                      <YAxis domain={[0, 100]} tick={{ fill: axis, fontSize: 11 }} tickFormatter={(v: number) => `${v}%`} />
                      <Tooltip contentStyle={tip} labelFormatter={(d) => t("Week of {date}", { date: dayMonth(String(d)) })} formatter={(v: unknown) => [`${fmtNumber(Number(v), 0)}%`, t("Search interest")]} />
                      <Bar dataKey="v" fill="#6366f1" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
                  <p className="mb-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">{t("Strongest weeks of the year")}</p>
                  {weeks.top.length === 0 ? <p className="muted">{t("No week stands out.")}</p> : (
                    <ul className="space-y-0.5">{weeks.top.map((w) => <li key={w.week} data-week={w.week}>{dayMonth(w.start)} – {dayMonth(w.end)}: <b>{signed(w.effectPct)}</b></li>)}</ul>
                  )}
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-sm dark:border-rose-500/30 dark:bg-rose-500/10">
                  <p className="mb-1 text-xs font-semibold text-rose-700 dark:text-rose-300">{t("Weakest weeks of the year")}</p>
                  {weeks.bottom.length === 0 ? <p className="muted">{t("No week stands out.")}</p> : (
                    <ul className="space-y-0.5">{weeks.bottom.map((w) => <li key={w.week} data-week={w.week}>{dayMonth(w.start)} – {dayMonth(w.end)}: <b>{signed(w.effectPct)}</b></li>)}</ul>
                  )}
                </div>
              </div>
              <p className="text-xs muted">{t("Weeks of the year: each week versus the average of the year around it, averaged over 5 years. Weekly Google data is noisier than monthly, so treat single weeks as a hint.")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
