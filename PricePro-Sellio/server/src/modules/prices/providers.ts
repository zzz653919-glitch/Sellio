import crypto from "node:crypto";
import { config } from "../../config.js";

export type Offer = {
  id: string;
  provider: string;
  storeName: string;
  title: string;
  price: number;
  currency: string | null;
  priceText: string;
  previousPrice: number | null;
  imageUrl: string | null;
  url: string;
  /** null = the provider did not state it (unverified). */
  condition: "new" | "used" | "refurbished" | null;
  availability: "in_stock" | "out_of_stock" | null;
  gtin: string | null;
  shipping: string | null;
};

export interface PriceProvider {
  readonly name: string;
  readonly label: string;
  search(query: string): Promise<Offer[]>;
}

type FetchFn = typeof fetch;

export class ProviderError extends Error {}

const offerId = (provider: string, url: string, title: string) =>
  crypto.createHash("sha256").update(`${provider}|${url}|${title}`).digest("hex").slice(0, 24);

const safeUrl = (u: unknown): string | null => {
  if (typeof u !== "string") return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const SYMBOLS: [RegExp, string][] = [
  [/US\$|\$/, "USD"], [/€/, "EUR"], [/£/, "GBP"], [/₽|руб/i, "RUB"], [/₸/, "KZT"], [/₺|TL\b/, "TRY"],
  [/so['ʻ‘’]?m|сўм|сум|UZS/i, "UZS"], [/¥|JPY/, "JPY"], [/₹|Rs\.?/, "INR"],
];

/** Infer the currency from a price string. "$" is only treated as USD for US results. */
export function currencyFromText(text: string, gl = "us"): string | null {
  const code = /\b([A-Z]{3})\b/.exec(text)?.[1];
  if (code) return code;
  for (const [re, c] of SYMBOLS) {
    if (re.test(text)) return c === "USD" && gl.toLowerCase() !== "us" && !text.includes("US$") ? null : c;
  }
  return null;
}

/** Google Shopping results via SerpApi (https://serpapi.com/google-shopping-api). */
export class SerpApiProvider implements PriceProvider {
  readonly name = "serpapi_google_shopping";
  readonly label = "Google Shopping";
  constructor(private apiKey: string, private gl: string, private hl: string, private fetchFn: FetchFn = fetch) {}

  async search(query: string): Promise<Offer[]> {
    const params = new URLSearchParams({ engine: "google_shopping", q: query, gl: this.gl, hl: this.hl, num: "40", api_key: this.apiKey });
    const res = await this.fetchFn(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(30_000) });
    const body = (await res.json().catch(() => null)) as { error?: string; shopping_results?: Record<string, unknown>[] } | null;
    if (!res.ok || !body) throw new ProviderError(body?.error ?? `Google Shopping returned HTTP ${res.status}`);
    if (body.error && !/hasn't returned any results/i.test(body.error)) throw new ProviderError(body.error);
    const offers: Offer[] = [];
    for (const r of body.shopping_results ?? []) {
      const price = typeof r.extracted_price === "number" ? r.extracted_price : null;
      const url = safeUrl(r.product_link) ?? safeUrl(r.link);
      const title = typeof r.title === "string" ? r.title : null;
      const store = typeof r.source === "string" ? r.source : null;
      if (price === null || !url || !title || !store) continue; // incomplete records are discarded, never filled in
      const priceText = typeof r.price === "string" ? r.price : String(price);
      const cond = typeof r.second_hand_condition === "string" ? r.second_hand_condition.toLowerCase() : "";
      offers.push({
        id: offerId(this.name, url, title),
        provider: this.name,
        storeName: store,
        title,
        price,
        currency: currencyFromText(priceText, this.gl),
        priceText,
        previousPrice: typeof r.extracted_old_price === "number" ? r.extracted_old_price : null,
        imageUrl: safeUrl(r.thumbnail),
        url,
        condition: cond.includes("refurb") ? "refurbished" : cond ? "used" : null,
        availability: null,
        gtin: null,
        shipping: typeof r.delivery === "string" ? r.delivery : null,
      });
    }
    return offers;
  }
}

/** eBay Browse API item search (https://developer.ebay.com/api-docs/buy/browse/). */
export class EbayProvider implements PriceProvider {
  readonly name = "ebay";
  readonly label = "eBay";
  private token: { value: string; expiresAt: number } | null = null;
  constructor(private clientId: string, private clientSecret: string, private marketplace: string, private fetchFn: FetchFn = fetch) {}

  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await this.fetchFn("https://api.ebay.com/identity/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials", scope: "https://api.ebay.com/oauth/api_scope" }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error_description?: string } | null;
    if (!res.ok || !body?.access_token) throw new ProviderError(`eBay authentication failed: ${body?.error_description ?? res.status}`);
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 7200) * 1000 };
    return this.token.value;
  }

  async search(query: string): Promise<Offer[]> {
    const token = await this.accessToken();
    const params = new URLSearchParams({ q: query, limit: "50" });
    const res = await this.fetchFn(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
      headers: { Authorization: `Bearer ${token}`, "X-EBAY-C-MARKETPLACE-ID": this.marketplace },
      signal: AbortSignal.timeout(30_000),
    });
    type Money = { value?: string; currency?: string };
    const body = (await res.json().catch(() => null)) as {
      itemSummaries?: {
        title?: string; price?: Money; itemWebUrl?: string; image?: { imageUrl?: string }; condition?: string;
        seller?: { username?: string }; marketingPrice?: { originalPrice?: Money }; epid?: string;
      }[];
      errors?: { message?: string }[];
    } | null;
    if (!res.ok || !body) throw new ProviderError(body?.errors?.[0]?.message ?? `eBay returned HTTP ${res.status}`);
    const offers: Offer[] = [];
    for (const it of body.itemSummaries ?? []) {
      const price = it.price?.value ? Number(it.price.value) : NaN;
      const url = safeUrl(it.itemWebUrl);
      if (!Number.isFinite(price) || !url || !it.title) continue;
      const cond = (it.condition ?? "").toLowerCase();
      const original = it.marketingPrice?.originalPrice?.value ? Number(it.marketingPrice.originalPrice.value) : null;
      offers.push({
        id: offerId(this.name, url, it.title),
        provider: this.name,
        storeName: it.seller?.username ? `eBay · ${it.seller.username}` : "eBay",
        title: it.title,
        price,
        currency: it.price?.currency ?? null,
        priceText: `${it.price?.value} ${it.price?.currency ?? ""}`.trim(),
        previousPrice: original !== null && Number.isFinite(original) ? original : null,
        imageUrl: safeUrl(it.image?.imageUrl),
        url,
        condition: cond.includes("refurb") ? "refurbished" : cond.includes("new") ? "new" : cond ? "used" : null,
        availability: null,
        gtin: null,
        shipping: null,
      });
    }
    return offers;
  }
}

let override: PriceProvider[] | null = null;
/** Test hook only. */
export function setPriceProvidersForTests(p: PriceProvider[] | null) {
  override = p;
}

export function configuredProviders(): PriceProvider[] {
  if (override) return override;
  const list: PriceProvider[] = [];
  if (config.SERPAPI_API_KEY) list.push(new SerpApiProvider(config.SERPAPI_API_KEY, config.SERPAPI_GL, config.SERPAPI_HL));
  if (config.EBAY_CLIENT_ID && config.EBAY_CLIENT_SECRET) {
    list.push(new EbayProvider(config.EBAY_CLIENT_ID, config.EBAY_CLIENT_SECRET, config.EBAY_MARKETPLACE_ID));
  }
  return list;
}
