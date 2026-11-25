import type { Offer } from "./providers.js";

const STOP = new Set([
  "the", "a", "an", "and", "or", "for", "with", "of", "in", "on", "by", "to", "new", "brand", "original", "genuine",
  "free", "shipping", "sale", "best", "official", "edition", "version", "pack", "set", "item", "product", "w",
]);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\d)\s+(gb|tb|mb|mm|cm|ml|l|kg|g|w|mah|hz|inch|in)\b/g, "$1$2")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export function normalizeQuery(q: string) {
  return tokens(q).join(" ");
}

const isModelToken = (t: string) => /[a-z]/.test(t) && /\d/.test(t);
const SPEC = /^(\d+)(gb|tb|mb|mm|cm|ml|l|kg|g|w|mah|hz|inch|in)$/;

/** Similarity of two product titles in [0, 1]. Conflicting specs (128gb vs 256gb) separate them. */
export function similarity(a: string[], b: string[]) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  let score = inter / (A.size + B.size - inter);
  const modelsA = a.filter(isModelToken);
  const modelsB = b.filter(isModelToken);
  if (modelsA.some((t) => B.has(t))) score += 0.25;
  const specsA = new Map(a.flatMap((t) => { const m = SPEC.exec(t); return m ? [[m[2], m[1]] as const] : []; }));
  for (const t of b) {
    const m = SPEC.exec(t);
    if (m && specsA.has(m[2]) && specsA.get(m[2]) !== m[1]) score -= 0.5;
  }
  if (modelsA.length && modelsB.length && !modelsA.some((t) => B.has(t))) score -= 0.15;
  return Math.max(0, Math.min(1, score));
}

export function relevance(queryTokens: string[], titleTokens: string[]) {
  if (!queryTokens.length) return 0;
  const T = new Set(titleTokens);
  return queryTokens.filter((t) => T.has(t)).length / queryTokens.length;
}

export type OfferGroup = {
  id: string;
  title: string;
  imageUrl: string | null;
  relevance: number;
  currency: string | null;
  offers: Offer[];
  cheapest: Offer;
  highest: Offer;
  storesCount: number;
  potentialSavings: number | null;
};

/**
 * Group offers that are the same product across stores (greedy clustering on title
 * similarity, with GTIN as an exact match when providers supply it).
 */
export function groupOffers(query: string, offers: Offer[], threshold = 0.55): OfferGroup[] {
  const q = tokens(query);
  const items = offers
    .map((o) => ({ o, t: tokens(o.title), rel: relevance(q, tokens(o.title)) }))
    .filter((x) => x.rel > 0)
    .sort((a, b) => b.rel - a.rel);

  const clusters: { rep: string[]; gtin: string | null; members: typeof items }[] = [];
  for (const it of items) {
    let target = clusters.find((c) => it.o.gtin && c.gtin && it.o.gtin === c.gtin);
    if (!target) {
      let best = 0;
      for (const c of clusters) {
        const s = similarity(c.rep, it.t);
        if (s >= threshold && s > best) { best = s; target = c; }
      }
    }
    if (target) target.members.push(it);
    else clusters.push({ rep: it.t, gtin: it.o.gtin, members: [it] });
  }

  return clusters
    .map((c, i) => {
      // Compare prices only within the dominant currency of the group.
      const byCurrency = new Map<string, Offer[]>();
      for (const m of c.members) {
        const key = m.o.currency ?? "?";
        byCurrency.set(key, [...(byCurrency.get(key) ?? []), m.o]);
      }
      const [currency, list] = [...byCurrency.entries()].sort((a, b) => b[1].length - a[1].length)[0];
      const sorted = [...list].sort((a, b) => a.price - b.price);
      const all = [...sorted, ...c.members.map((m) => m.o).filter((o) => !sorted.includes(o))];
      const cheapest = sorted[0];
      const highest = sorted[sorted.length - 1];
      return {
        id: `g${i + 1}`,
        title: c.members[0].o.title,
        imageUrl: c.members.find((m) => m.o.imageUrl)?.o.imageUrl ?? null,
        relevance: Math.max(...c.members.map((m) => m.rel)),
        currency: currency === "?" ? null : currency,
        offers: all,
        cheapest,
        highest,
        storesCount: new Set(all.map((o) => o.storeName)).size,
        potentialSavings: sorted.length > 1 ? Math.round((highest.price - cheapest.price) * 100) / 100 : null,
      };
    })
    .sort((a, b) => b.relevance * Math.log2(b.offers.length + 1) - a.relevance * Math.log2(a.offers.length + 1));
}
