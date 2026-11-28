/**
 * Brands and models inside a watched product (e.g. phones → iPhone, Samsung, Redmi → "iPhone 16 Pro Max").
 *
 * Model names are not a fixed list: they come from Google Trends' related queries for each brand in
 * Uzbekistan for the chosen period (what people actually typed), so new models appear by themselves.
 * Brands are compared on one shared scale; the leading models of the top brands are then measured
 * together on one scale too. Search interest, not units sold. Shared by all users and cached.
 */
import { cached, DAY_MS } from "../intel/cache.js";
import { nowIso } from "../../lib/util.js";
import { calendarWindows, type Period } from "./topPeriods.js";
import { trendsProvider, type CustomRange, type RelatedQuery } from "./trends.js";

type Group = { brands: { q: string; label: string }[]; needDigit: boolean };

/** Products from the watchlist that have brands / models worth showing. Brand search terms as people type them in Uzbekistan. */
export const MODEL_GROUPS: Record<string, Group> = {
  "телефон": { needDigit: true, brands: [{ q: "iphone", label: "iPhone" }, { q: "samsung", label: "Samsung" }, { q: "redmi", label: "Redmi" }, { q: "honor", label: "Honor" }, { q: "tecno", label: "Tecno" }] },
  "ноутбук": { needDigit: true, brands: [{ q: "macbook", label: "MacBook" }, { q: "lenovo", label: "Lenovo" }, { q: "hp", label: "HP" }, { q: "asus", label: "Asus" }, { q: "acer", label: "Acer" }] },
  "телевизор": { needDigit: true, brands: [{ q: "телевизор samsung", label: "Samsung" }, { q: "телевизор lg", label: "LG" }, { q: "телевизор artel", label: "Artel" }, { q: "телевизор tcl", label: "TCL" }, { q: "телевизор xiaomi", label: "Xiaomi" }] },
  "холодильник": { needDigit: true, brands: [{ q: "холодильник artel", label: "Artel" }, { q: "холодильник samsung", label: "Samsung" }, { q: "холодильник lg", label: "LG" }, { q: "холодильник beko", label: "Beko" }, { q: "холодильник haier", label: "Haier" }] },
  "кондиционер": { needDigit: true, brands: [{ q: "кондиционер artel", label: "Artel" }, { q: "кондиционер samsung", label: "Samsung" }, { q: "кондиционер lg", label: "LG" }, { q: "кондиционер midea", label: "Midea" }, { q: "кондиционер gree", label: "Gree" }] },
  "кроссовки": { needDigit: false, brands: [{ q: "nike", label: "Nike" }, { q: "adidas", label: "Adidas" }, { q: "new balance", label: "New Balance" }, { q: "puma", label: "Puma" }, { q: "asics", label: "Asics" }] },
};

// Words that say how people searched (price, buy, shop, city…), not which model.
const NOISE_WORDS = "цена|цены|купить|куплю|продам|продажа|narxi|narx|narhi|sotib|olish|olx|uzum|kredit|кредит|рассрочка|nasiya|в|на|для|ташкенте|ташкент|toshkent|tashkent|price|prices|buy|бу|б/у|новый|новые|характеристики|обзор|отзывы|магазин|market|uz|узбекистан|uzbekistan|телефон|телефоны|смартфон|ноутбук|ноутбуки|телевизор|телевизоры|холодильник|холодильники|кондиционер|кондиционеры|кроссовки|krossovka|krossovkalar|дюймов|дюйма|дюйм|inch|original|оригинал|мужские|женские|детские|erkaklar|ayollar|bolalar";
// \b does not work with Cyrillic, so words are matched between spaces (the text is padded with spaces).
const NOISE = new RegExp(`(?<=\\s)(${NOISE_WORDS})(?=\\s)`, "giu");
const PRETTY: Record<string, string> = { iphone: "iPhone", macbook: "MacBook", hp: "HP", lg: "LG", tcl: "TCL", ipad: "iPad", se: "SE" };

/** "iphone 15 pro max цена" → "iPhone 15 Pro Max"; null when nothing model-like is left. */
export function modelName(raw: string, brand: { q: string; label: string }, needDigit: boolean): string | null {
  let s = ` ${raw.toLowerCase()} `.replace(NOISE, " ");
  s = s.replace(/[^\p{L}\p{N}+ ]/gu, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const brandWords = brand.label.toLowerCase().split(" ");
  const words = s.split(" ");
  const extra = words.filter((w) => !brandWords.includes(w));
  if (extra.length === 0) return null;
  if (needDigit && !/\d/.test(s)) return null;
  // Start with the brand when people left it out ("15 pro max" → "iPhone 15 Pro Max").
  const withBrand = words.some((w) => brandWords.includes(w)) ? words : [...brandWords, ...words];
  return withBrand.map((w) => PRETTY[w] ?? (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (v: number) => Math.round(v * 10) / 10;

export type ModelsResult = {
  query: string; period: Period; from: string; to: string; computedAt: string;
  brands: { label: string; query: string; sharePct: number }[];
  /** The leading models measured on one scale: 100 = the most searched of them. `measured` false = estimated from brand share × related value. */
  models: { name: string; brand: string; index: number }[];
  measured: boolean;
  byBrand: { brand: string; models: { name: string; value: number }[] }[];
  rising: { name: string; brand: string; growthPct: number }[];
};

export async function topModels(query: string, period: Period, geo = "UZ"): Promise<ModelsResult | null | "unavailable"> {
  const group = MODEL_GROUPS[query];
  const provider = trendsProvider();
  if (!provider) return null;
  if (!group || !provider.relatedQueries || !provider.interestOverTimeMulti) return "unavailable";
  const yesterday = Date.now() - 86_400_000;
  const { cur } = calendarWindows(period, Date.UTC(new Date(yesterday).getUTCFullYear(), new Date(yesterday).getUTCMonth(), new Date(yesterday).getUTCDate()));
  const from = new Date(cur[0]).toISOString().slice(0, 10), to = new Date(cur[1]).toISOString().slice(0, 10);
  const range = `${from} ${to}` as CustomRange;
  return cached(`models:${geo}:${query}:${period}:${from}`, period === "week" || period === "month" ? DAY_MS : 7 * DAY_MS, async () => {
    // 1. Brands on one scale.
    const series = await provider.interestOverTimeMulti!(group.brands.map((b) => b.q), geo, range);
    const brandAvg = group.brands.map((b) => ({ b, v: avg((series[b.q] ?? []).map((p) => p.units)) }));
    const total = brandAvg.reduce((s, x) => s + x.v, 0);
    const brands = brandAvg
      .map((x) => ({ label: x.b.label, query: x.b.q, sharePct: total > 0 ? r1((x.v / total) * 100) : 0 }))
      .sort((a, b) => b.sharePct - a.sharePct);

    // 2. Models of the top 3 brands from their related queries.
    const topBrands = brands.filter((b) => b.sharePct > 0).slice(0, 3).map((b) => group.brands.find((x) => x.q === b.query)!);
    const byBrand: ModelsResult["byBrand"] = [];
    const rising: ModelsResult["rising"] = [];
    await Promise.all(topBrands.map(async (brand) => {
      const rel = await provider.relatedQueries!(brand.q, geo, range).catch(() => ({ top: [] as RelatedQuery[], rising: [] as RelatedQuery[] }));
      const merged = new Map<string, number>();
      for (const r of rel.top) {
        const name = modelName(r.query, brand, group.needDigit);
        if (name) merged.set(name, Math.max(merged.get(name) ?? 0, r.value));
      }
      const models = [...merged.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
      byBrand.push({ brand: brand.label, models });
      for (const r of rel.rising) {
        const name = modelName(r.query, brand, group.needDigit);
        if (name && !rising.some((x) => x.name === name)) rising.push({ name, brand: brand.label, growthPct: r.value });
      }
    }));
    byBrand.sort((a, b) => brands.findIndex((x) => x.label === a.brand) - brands.findIndex((x) => x.label === b.brand));
    rising.sort((a, b) => b.growthPct - a.growthPct);

    // 3. The leading models measured together (at most 5 per request).
    const share = new Map(brands.map((b) => [b.label, b.sharePct]));
    const candidates = byBrand.flatMap((g) => g.models.slice(0, 3).map((m) => ({ name: m.name, brand: g.brand, est: (share.get(g.brand) ?? 0) * m.value / 100 })))
      .sort((a, b) => b.est - a.est).slice(0, 5);
    let models: ModelsResult["models"] = [];
    let measured = false;
    if (candidates.length > 0) {
      const got = await provider.interestOverTimeMulti!(candidates.map((c) => c.name.toLowerCase()), geo, range).catch(() => null);
      const vals = got ? candidates.map((c) => avg((got[c.name.toLowerCase()] ?? []).map((p) => p.units))) : [];
      const top = Math.max(0, ...vals);
      if (got && top > 0) {
        measured = true;
        models = candidates.map((c, i) => ({ name: c.name, brand: c.brand, index: Math.round((vals[i] / top) * 100) })).sort((a, b) => b.index - a.index);
      } else {
        const topEst = Math.max(...candidates.map((c) => c.est), 1e-9);
        models = candidates.map((c) => ({ name: c.name, brand: c.brand, index: Math.round((c.est / topEst) * 100) }));
      }
    }
    return { query, period, from, to, computedAt: nowIso(), brands, models, measured, byBrand, rising: rising.slice(0, 5) } satisfies ModelsResult;
  }, (r) => r.brands.some((b) => b.sharePct > 0));
}
