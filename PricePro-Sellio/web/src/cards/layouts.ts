/**
 * Product-card designs. A design is built from the card texts (written by the AI or by the seller), the
 * product photo(s), the price and the style settings (theme, background, colours, font, text placement,
 * product position, light and shadow). The result is an ordinary editor document, so everything on it can
 * be changed afterwards.
 *
 * Colours are semantic — paper (background), ink (text), panel (tiles), hero (colour areas) — so every
 * composition works with every theme and background.
 */
import { arch, circle, dots, frame, glow, img, lin, pill, rad, rect, ring, sparkle, stripes, text, blob, tri, type Part } from "../studio/templates/compose";
import { iconSrc } from "../studio/icons";
import { patternSrc } from "../studio/patterns";
import type { Doc, El, Fill, ImageEl, TextEl } from "../studio/types";
import { FONT_PAIRS, seasonalNow, THEME_BY_KEY, type Deco, type ThemeColors, type ThemeKey } from "./themes";

export type MarketplaceKey = "uzum" | "wildberries" | "ozon" | "yandex" | "amazon" | "alibaba" | "etsy" | "shopify" | "instagram" | "tiktok" | "universal" | "other";
export type LayoutKey =
  | "hero" | "halves" | "minimal" | "bold" | "specs" | "circle" | "beforeAfter" | "multiAngle" | "editorial" | "split" | "lifestyle" | "poster"
  | "dark" | "diagonal" | "frame" | "sale" | "glass";

export type CardCopy = {
  title: string; subtitle: string; badge: string;
  benefits: { title: string; text: string; icon: string }[];
  specs: { label: string; value: string }[];
  marketplaceTitle: string; description: string; bullets: string[]; adTexts: string[]; keywords: string[];
};
export type CardInput = { name: string; features: string[]; benefits: string[]; price?: string; oldPrice?: string; marketplace: MarketplaceKey; language: "uz" | "ru" | "en" };
export type CardPhoto = { src: string; cutout: boolean };
/** Extra pictures some compositions use: the original photo (Before & After) and more angles. */
export type CardPhotos = { before?: CardPhoto | null; extra?: CardPhoto[] };

export type BackgroundKey = "auto" | "white" | "black" | "gray" | "beige" | "gradient" | "flowers" | "nature" | "marble" | "studio" | "interior" | "custom";
export type LightKey = "soft" | "studio" | "dramatic" | "natural" | "neon" | "golden";
/** Everything about the look that the user can choose. */
export type StyleConfig = {
  theme: ThemeKey;
  background: BackgroundKey;
  bgColor?: string;
  colors?: { main?: string; second?: string };
  font: string;
  textAlign: "auto" | "left" | "center" | "right";
  productPos: "auto" | "left" | "center" | "right";
  /** 0 … 100 */
  shadow: number;
  lighting: LightKey;
};
export const BRAND_THEMED: MarketplaceKey[] = ["uzum", "wildberries", "ozon", "yandex", "other"];
export const defaultStyle = (mp: MarketplaceKey): StyleConfig => ({
  theme: BRAND_THEMED.includes(mp) ? "brand" : "light-minimal", background: "auto", font: "theme", textAlign: "auto", productPos: "auto", shadow: 40, lighting: "soft",
});

// ------------------------------------------------------------------ colour helpers
const hexRgb = (c: string): [number, number, number] | null => {
  let m = /^#([0-9a-f]{6})$/i.exec(c);
  if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16)) as [number, number, number];
  const r = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
  return r ? [Number(r[1]), Number(r[2]), Number(r[3])] : null;
};
const lum = (c: string) => {
  const rgb = hexRgb(c);
  if (!rgb) return 0.5;
  const [r, g, b] = rgb.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
/** The colour a fill mostly looks like. */
const fillColor = (f: Fill): string => (typeof f === "string" ? f : f.stops[Math.floor(f.stops.length / 2)]?.[1] ?? f.stops[0][1]);
const readable = (bg: string, dark = "#111111", light = "#FFFFFF") => (contrast(bg, dark) >= contrast(bg, light) ? dark : light);
const darker = (c: string, k = 0.7) => { const rgb = hexRgb(c); return rgb ? `#${rgb.map((v) => Math.round(v * k).toString(16).padStart(2, "0")).join("")}` : c; };
const lighter = (c: string, k = 0.88) => { const rgb = hexRgb(c); return rgb ? `#${rgb.map((v) => Math.round(v + (255 - v) * k).toString(16).padStart(2, "0")).join("")}` : c; };
const alpha = (c: string, a: number) => { const rgb = hexRgb(c); return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})` : c; };

// ------------------------------------------------------------------ marketplace colours (theme "Marketplace colours")
type Brand = { primary: string; grad2: string; soft: string; accent: string; ink: string };
/** Each marketplace's own colours (no marketplace logos are put on cards: marketplaces do not allow them). */
const BRANDS: Record<MarketplaceKey, Brand> = {
  uzum: { primary: "#7000FF", grad2: "#3D0099", soft: "#F2EAFF", accent: "#FFD23F", ink: "#1B1033" },
  wildberries: { primary: "#CB11AB", grad2: "#481173", soft: "#FCEAF7", accent: "#FF5CA8", ink: "#2A0E2E" },
  ozon: { primary: "#005BFF", grad2: "#0033A0", soft: "#E8F0FF", accent: "#F91155", ink: "#0B1B3F" },
  yandex: { primary: "#FFCC00", grad2: "#FF9F1A", soft: "#FFF8D6", accent: "#FF5226", ink: "#111111" },
  amazon: { primary: "#FF9900", grad2: "#E47911", soft: "#FFF4E0", accent: "#232F3E", ink: "#0F1111" },
  alibaba: { primary: "#FF6A00", grad2: "#D94E00", soft: "#FFF0E5", accent: "#FFB800", ink: "#222222" },
  etsy: { primary: "#F1641E", grad2: "#B5470F", soft: "#FDEEE6", accent: "#222222", ink: "#222222" },
  shopify: { primary: "#5E8E3E", grad2: "#3D6B26", soft: "#EEF5E6", accent: "#95BF47", ink: "#1A2E10" },
  instagram: { primary: "#DD2A7B", grad2: "#8134AF", soft: "#FCE8F1", accent: "#F58529", ink: "#26112E" },
  tiktok: { primary: "#FE2C55", grad2: "#161616", soft: "#FFE8EE", accent: "#25F4EE", ink: "#111111" },
  universal: { primary: "#2563EB", grad2: "#1E40AF", soft: "#E8F0FE", accent: "#F59E0B", ink: "#0F172A" },
  other: { primary: "#0F766E", grad2: "#0B3B38", soft: "#E3F6F3", accent: "#F59E0B", ink: "#0F172A" },
};
/** Swatch colours of a marketplace (for the selector). */
export const brandOf = (mp: MarketplaceKey) => BRANDS[mp] ?? BRANDS.universal;
// kept for older imports
export const PALETTES = Object.fromEntries(Object.entries(BRANDS).map(([k, b]) => [k, { ...b, deep: b.grad2 }])) as Record<MarketplaceKey, Brand & { deep: string }>;

export type Palette = {
  primary: string; grad2: string; accent: string; soft: string;
  paper: Fill; ink: string; muted: string; panel: string;
  hero: Fill; onHero: string; onPrimary: string; onAccent: string;
  /** the primary colour, or the text colour when the primary does not read on the paper (yellow on white) */
  strong: string;
  dark: boolean;
};

const LIGHT_TEXT = { ink: "#111827", muted: "#6B7280", panel: "#FFFFFF" };
const DARK_TEXT = { ink: "#F5F5F5", muted: "#A1A1AA", panel: "rgba(255,255,255,0.07)" };

function themeColors(mp: MarketplaceKey, s: StyleConfig): { colors: ThemeColors; deco: Deco[] } {
  const th = THEME_BY_KEY[s.theme] ?? THEME_BY_KEY.brand;
  if (th.key === "seasonal") return seasonalNow();
  if (th.colors) return { colors: th.colors, deco: th.deco };
  if (th.key === "custom") {
    const main = s.colors?.main ?? "#2563EB", second = s.colors?.second ?? "#F59E0B";
    return { colors: { primary: main, grad2: darker(main, 0.65), accent: second, paper: lin(180, lighter(main, 0.94), "#FFFFFF"), ink: "#111827", muted: "#6B7280", panel: "#FFFFFF", soft: lighter(main, 0.88) }, deco: [] };
  }
  const b = brandOf(mp);
  return { colors: { primary: b.primary, grad2: b.grad2, accent: b.accent, paper: lin(180, b.soft, "#FFFFFF"), ink: b.ink, muted: "#5B6472", panel: "#FFFFFF", soft: b.soft }, deco: [] };
}

/** The final palette, fonts and decorations from the theme and the user's choices. */
export function resolveStyle(mp: MarketplaceKey, s: StyleConfig) {
  const th = THEME_BY_KEY[s.theme] ?? THEME_BY_KEY.brand;
  const { colors: tc, deco: baseDeco } = themeColors(mp, s);
  const c = { ...tc };
  if (s.colors?.main && s.theme !== "custom") { c.primary = s.colors.main; c.grad2 = darker(s.colors.main, 0.65); c.hero = undefined; }
  if (s.colors?.second) c.accent = s.colors.second;
  const deco = new Set<Deco>(baseDeco);
  // a chosen background replaces the theme's (text colours follow it)
  const bgFill: Record<Exclude<BackgroundKey, "auto">, () => Fill> = {
    white: () => "#FFFFFF", black: () => lin(180, "#0B0B0F", "#17171D"), gray: () => "#EDEFF2", beige: () => lin(180, "#F8F2E9", "#EEE3D2"),
    gradient: () => lin(135, c.primary, c.grad2), flowers: () => lin(180, "#FFF6F8", "#FDE7EE"), nature: () => lin(180, "#F2F5EC", "#DFE9D5"),
    marble: () => "#F4F3F1", studio: () => rad(0.5, 0.42, 0.75, "#FFFFFF", "#D9DCE1"), interior: () => lin(160, "#2A211B", "#4A3A2E"),
    custom: () => s.bgColor ?? s.colors?.main ?? "#FFFFFF",
  };
  if (s.background !== "auto") {
    const paper = bgFill[s.background]();
    const isDark = lum(fillColor(paper)) < 0.3;
    const themeDark = lum(fillColor(c.paper)) < 0.3;
    c.paper = paper;
    c.hero = paper;
    if (isDark !== themeDark) Object.assign(c, isDark ? DARK_TEXT : LIGHT_TEXT);
    if (s.background === "beige" && !isDark) Object.assign(c, { ink: "#3D2E22", muted: "#8A7461", panel: "#FFFDF9" });
    if (s.background === "gray") c.panel = isDark ? c.panel : "#FFFFFF";
    c.onHero = undefined;
    const extra: Partial<Record<BackgroundKey, Deco[]>> = { flowers: ["flowers"], nature: ["leaves"], marble: ["marble"], studio: ["podium"], interior: ["bokeh", "beam"] };
    for (const d of extra[s.background] ?? []) deco.add(d);
    if (["white", "black", "gray", "beige", "custom", "gradient"].includes(s.background)) { deco.delete("marble"); deco.delete("flowers"); deco.delete("leaves"); }
  }
  const paperColor = fillColor(c.paper);
  const dark = lum(paperColor) < 0.3;
  const hero = c.hero ?? lin(160, c.primary, c.grad2);
  const p: Palette = {
    primary: c.primary, grad2: c.grad2, accent: c.accent, soft: c.soft,
    paper: c.paper, ink: c.ink, muted: c.muted, panel: c.panel,
    hero, onHero: c.onHero ?? readable(fillColor(hero)),
    onPrimary: c.onPrimary ?? readable(c.primary), onAccent: c.onAccent ?? readable(c.accent),
    strong: contrast(c.primary, paperColor) >= 2.2 ? c.primary : c.ink,
    dark,
  };
  const pair = FONT_PAIRS[s.font] ?? null;
  const fonts = pair ? { head: pair.head, body: pair.body } : th.fonts;
  return { p, fonts, deco: [...deco] };
}

// ------------------------------------------------------------------ texts when there is no AI
/** Card texts made from what the seller typed (used when the text AI is not available). */
export function manualCopy(input: CardInput): CardCopy {
  const specs: CardCopy["specs"] = [], plain: string[] = [];
  for (const f of input.features) {
    const m = f.match(/^([^:–—-]{2,30})\s*[:–—-]\s*(.{1,40})$/);
    if (m) specs.push({ label: m[1].trim(), value: m[2].trim() }); else plain.push(f);
  }
  const benefits = [...input.benefits, ...plain].slice(0, 5).map((b) => ({ title: b.slice(0, 32), text: "", icon: "circle-check" }));
  return {
    title: input.name.slice(0, 60), subtitle: "", badge: "", benefits, specs: specs.slice(0, 6),
    marketplaceTitle: input.name, description: [...input.benefits, ...input.features].join(". "), bullets: [...input.benefits].slice(0, 5), adTexts: [], keywords: [],
  };
}

// ------------------------------------------------------------------ building blocks
type Ctx = { copy: CardCopy; input: CardInput; photo: CardPhoto | null; photos: CardPhotos; p: Palette; f: { head: string; body: string } };

const product = (c: Ctx, x: number, y: number, w: number, h: number, ph: CardPhoto | null = c.photo): Part =>
  img(ph?.src ?? "", x, y, w, h, ph && !ph.cutout ? { fit: "cover", mask: "rounded", radius: 40, shadow: false } : { fit: "contain", shadow: true });
/** Width ÷ height of the card being built (set by buildCard): keeps icons square in every format. */
let AR = 0.75;
const icon = (name: string, color: string, cx: number, cy: number, s = 0.042): Part =>
  ({ ...img(iconSrc(name, color), cx - s / 2, cy - (s * AR) / 2, s, s * AR, { fit: "contain", shadow: false }), name: "Icon" } as Part);
const benefitsOf = (c: Ctx, n: number) => c.copy.benefits.slice(0, n);
const sub = (c: Ctx, x: number, y: number, w: number, h: number, o: Partial<TextEl> = {}): Part[] =>
  c.copy.subtitle ? [text(c.copy.subtitle, x, y, w, h, { role: "subline", font: c.f.body, size: 30, weight: 500, color: c.p.muted, ...o })] : [];
const title = (c: Ctx, x: number, y: number, w: number, h: number, o: Partial<TextEl> = {}): Part =>
  text(c.copy.title, x, y, w, h, { role: "headline", font: c.f.head, size: 78, weight: 800, color: c.p.ink, lineHeight: 1.04, ...o });
/** Price (and the old price, crossed out) — only when the seller gave one. */
function price(c: Ctx, x: number, y: number, w: number, o: { color: string; bg?: string; size?: number; align?: "left" | "center" | "right"; oldColor?: string; inline?: boolean }): Part[] {
  const out: Part[] = [];
  if (!c.input.price) return out;
  if (c.input.oldPrice && o.inline) {
    out.push(text(c.input.oldPrice, x, y, w * 0.36, 0.07, { role: "oldPrice", font: c.f.body, size: 26, weight: 500, color: o.oldColor ?? o.color, strike: true, align: "right", valign: "middle", opacity: 0.75 }));
    out.push(text(c.input.price, x + w * 0.38, y, w * 0.62, 0.07, { role: "price", font: c.f.head, size: o.size ?? 56, weight: 800, color: o.color, align: "left", valign: "middle", ...(o.bg ? { bg: pill(o.bg, 28, 12) } : {}) }));
    return out;
  }
  if (c.input.oldPrice) out.push(text(c.input.oldPrice, x, y - 0.04, w, 0.035, { role: "oldPrice", font: c.f.body, size: 30, weight: 500, color: o.oldColor ?? o.color, strike: true, align: o.align ?? "left", opacity: 0.75 }));
  out.push(text(c.input.price, x, y, w, 0.07, { role: "price", font: c.f.head, size: o.size ?? 56, weight: 800, color: o.color, align: o.align ?? "left", valign: "middle", ...(o.bg ? { bg: pill(o.bg, 28, 12) } : {}) }));
  return out;
}
/** Discount in per cent from the two prices (only when both are numbers and the old one is higher). */
function discountPct(c: Ctx): number | null {
  const num = (s?: string) => { const d = (s ?? "").replace(/[^\d]/g, ""); return d ? Number(d) : NaN; };
  const p = num(c.input.price), o = num(c.input.oldPrice);
  if (!(p > 0 && o > p)) return null;
  const pct = Math.round((1 - p / o) * 100);
  return pct >= 1 && pct <= 95 ? pct : null;
}
const badgeOf = (c: Ctx, x: number, y: number, bg: string, color: string): Part[] =>
  c.copy.badge ? [text(c.copy.badge, x, y, 0.34, 0.045, { role: "label", name: "Badge", font: c.f.head, size: 28, weight: 800, upper: true, spacing: 0.04, color, valign: "middle", bg: pill(bg, 24, 10) })] : [];

/** "Before" / "After" in the card's language. */
const BA: Record<string, [string, string]> = { uz: ["Oldin", "Keyin"], ru: ["До", "После"], en: ["Before", "After"] };

// ------------------------------------------------------------------ compositions (portrait; positions are fractions)
type Layout = (c: Ctx) => { bg: Fill; parts: Part[] };
const LAYOUTS: Record<LayoutKey, Layout> = {
  /** Classic: product large in the middle, three benefit tiles at the bottom. */
  hero: (c) => {
    const { p } = c;
    const b = benefitsOf(c, 3);
    const tw = b.length ? (0.9 - (b.length - 1) * 0.025) / b.length : 0;
    const tiles = b.flatMap((x, i) => {
      const tx = 0.05 + i * (tw + 0.025);
      return [
        rect(tx, 0.775, tw, 0.18, p.panel, 32),
        circle(tx + tw / 2 - 0.04, 0.79, 0.08, p.primary),
        icon(x.icon, p.onPrimary, tx + tw / 2, 0.83),
        text(x.title, tx + 0.015, 0.865, tw - 0.03, 0.04, { font: c.f.head, size: 28, weight: 800, color: p.ink, align: "center", valign: "middle" }),
        ...(x.text ? [text(x.text, tx + 0.015, 0.905, tw - 0.03, 0.04, { font: c.f.body, size: 20, weight: 500, color: p.muted, align: "center", lineHeight: 1.1 })] : []),
      ];
    });
    return {
      bg: p.paper,
      parts: [
        circle(0.13, 0.2, 0.74, p.primary, { opacity: 0.1 }),
        circle(0.2, 0.25, 0.6, p.primary, { opacity: 0.1 }),
        ...badgeOf(c, 0.06, 0.04, p.primary, p.onPrimary),
        title(c, 0.06, c.copy.badge ? 0.095 : 0.05, 0.88, 0.11, { size: 76 }),
        ...sub(c, 0.06, c.copy.badge ? 0.205 : 0.165, 0.85, 0.045, { size: 32 }),
        product(c, 0.1, 0.25, 0.8, 0.5),
        ...price(c, 0.06, 0.68, 0.5, { color: p.onPrimary, bg: p.primary, oldColor: p.ink }),
        ...tiles,
      ],
    };
  },

  /** Split: a colour half with the texts, the product on the other half. */
  halves: (c) => {
    const { p } = c;
    const b = benefitsOf(c, 4);
    const list = b.flatMap((x, i) => {
      const y = 0.47 + i * 0.075;
      return [
        icon(x.icon, p.onHero, 0.075, y + 0.022, 0.038),
        text(x.title, 0.11, y, 0.33, 0.045, { font: c.f.body, size: 24, weight: 700, color: p.onHero, valign: "middle" }),
      ];
    });
    return {
      bg: p.paper,
      parts: [
        rect(0, 0, 0.47, 1, p.hero),
        ...badgeOf(c, 0.05, 0.05, p.accent, p.onAccent),
        title(c, 0.05, c.copy.badge ? 0.11 : 0.06, 0.39, 0.22, { size: 72, color: p.onHero, lineHeight: 1.02 }),
        ...sub(c, 0.05, c.copy.badge ? 0.34 : 0.29, 0.38, 0.09, { size: 26, color: p.onHero, opacity: 0.85, lineHeight: 1.2 }),
        ...list,
        ...price(c, 0.05, 0.86, 0.4, { color: p.onAccent, bg: p.accent, oldColor: p.onHero }),
        product(c, 0.5, 0.18, 0.47, 0.64),
      ],
    };
  },

  /** Full product focus: big product, centred title, short benefit list. */
  minimal: (c) => {
    const { p } = c;
    const b = benefitsOf(c, 3);
    const list = b.flatMap((x, i) => {
      const y = 0.79 + i * 0.055;
      return [
        icon(x.icon, p.strong, 0.2, y + 0.022, 0.04),
        text(x.text ? `${x.title} — ${x.text}` : x.title, 0.245, y, 0.62, 0.045, { font: c.f.body, size: 28, weight: 600, color: p.ink, valign: "middle" }),
      ];
    });
    return {
      bg: p.paper,
      parts: [
        ...badgeOf(c, 0.06, 0.04, p.ink, readable(p.ink)),
        product(c, 0.1, 0.08, 0.8, 0.5),
        title(c, 0.08, 0.6, 0.84, 0.09, { size: 66, weight: 700, align: "center", lineHeight: 1.05 }),
        ...sub(c, 0.1, 0.69, 0.8, 0.04, { size: 28, align: "center" }),
        ...price(c, 0.18, 0.725, 0.64, { color: p.strong, size: 54, oldColor: p.muted, inline: true, align: "center" }),
        ...list,
      ],
    };
  },

  /** Feature icons: colour background, big title, panel with a 2×2 icon infographic. */
  bold: (c) => {
    const { p } = c;
    const b = benefitsOf(c, 4);
    const inkOnPanel = p.dark ? p.ink : "#111827";
    const cells = b.flatMap((x, i) => {
      const cx = i % 2 ? 0.52 : 0.09, cy = i < 2 ? 0.75 : 0.85;
      return [
        circle(cx, cy, 0.075, p.dark ? alpha(p.primary, 0.18) : p.soft),
        icon(x.icon, p.dark ? p.primary : p.strong, cx + 0.0375, cy + 0.0375),
        text(x.title, cx + 0.09, cy - 0.002, 0.3, 0.04, { font: c.f.head, size: 30, weight: 800, color: inkOnPanel, valign: "middle" }),
        ...(x.text ? [text(x.text, cx + 0.09, cy + 0.038, 0.3, 0.045, { font: c.f.body, size: 22, weight: 500, color: p.muted, lineHeight: 1.15 })] : []),
      ];
    });
    return {
      bg: p.hero,
      parts: [
        glow(0.55, -0.12, 0.7, alpha(p.onHero, 0.18)),
        dots(0.72, 0.04, 0.24, 0.12, p.onHero, 0.25),
        ...badgeOf(c, 0.07, 0.045, p.accent, p.onAccent),
        title(c, 0.07, c.copy.badge ? 0.1 : 0.06, 0.86, 0.13, { size: 84, color: p.onHero, lineHeight: 1.02 }),
        ...sub(c, 0.07, c.copy.badge ? 0.235 : 0.195, 0.8, 0.05, { size: 34, color: p.onHero, opacity: 0.88 }),
        glow(0.15, 0.3, 0.7, alpha(p.onHero, 0.16)),
        product(c, 0.12, 0.28, 0.76, 0.42),
        ...price(c, 0.56, 0.62, 0.38, { color: p.onAccent, bg: p.accent, align: "right", oldColor: p.onHero }),
        rect(0.05, 0.72, 0.9, 0.245, p.dark ? p.panel : "#FFFFFF", 44),
        ...cells,
      ],
    };
  },

  /** Specifications: colour header, product, a table of characteristics. */
  specs: (c) => {
    const { p } = c;
    const rows = (c.copy.specs.length ? c.copy.specs : c.copy.benefits.map((x) => ({ label: x.title, value: x.text }))).slice(0, 5);
    const rh = 0.052;
    const table = rows.flatMap((r, i) => {
      const y = 0.665 + i * rh;
      return [
        ...(i % 2 === 0 ? [rect(0.06, y, 0.88, rh, p.dark ? p.panel : p.soft, 14)] : []),
        text(r.label, 0.09, y, 0.42, rh, { font: c.f.body, size: 26, weight: 500, color: p.muted, valign: "middle" }),
        text(r.value, 0.5, y, 0.41, rh, { font: c.f.head, size: 26, weight: 700, color: p.ink, align: "right", valign: "middle" }),
      ];
    });
    return {
      bg: p.paper,
      parts: [
        rect(0, 0, 1, 0.2, p.hero),
        dots(0.78, 0.03, 0.2, 0.14, p.onHero, 0.2),
        title(c, 0.06, 0.03, 0.88, 0.11, { size: 72, color: p.onHero, valign: "middle" }),
        ...sub(c, 0.06, 0.14, 0.88, 0.045, { color: p.onHero, opacity: 0.9 }),
        glow(0.2, 0.22, 0.6, alpha(p.primary, 0.14)),
        product(c, 0.14, 0.22, 0.72, 0.42),
        ...badgeOf(c, 0.06, 0.225, p.accent, p.onAccent),
        ...table,
        ...price(c, 0.4, Math.min(0.92, 0.665 + rows.length * rh + 0.025), 0.54, { color: p.onAccent, bg: p.accent, oldColor: p.ink, inline: true, align: "right" }),
      ],
    };
  },

  /** Benefits: product in a big circle, four benefits around it. */
  circle: (c) => {
    const { p } = c;
    const b = benefitsOf(c, 4);
    const spots = [[0.02, 0.3], [0.76, 0.3], [0.02, 0.56], [0.76, 0.56]];
    const around = b.flatMap((x, i) => {
      const [x0, y0] = spots[i];
      const cx = x0 + 0.11;
      return [
        circle(cx - 0.04, y0, 0.08, p.primary),
        icon(x.icon, p.onPrimary, cx, y0 + 0.04, 0.044),
        text(x.title, x0, y0 + 0.085, 0.22, 0.04, { font: c.f.head, size: 24, weight: 800, color: p.ink, align: "center", valign: "middle" }),
        ...(x.text ? [text(x.text, x0, y0 + 0.125, 0.22, 0.05, { font: c.f.body, size: 18, weight: 500, color: p.muted, align: "center", lineHeight: 1.15 })] : []),
      ];
    });
    return {
      bg: p.paper,
      parts: [
        title(c, 0.06, 0.04, 0.88, 0.1, { size: 70, align: "center", lineHeight: 1.03 }),
        ...sub(c, 0.1, 0.14, 0.8, 0.04, { size: 28, align: "center" }),
        ...badgeOf(c, 0.33, 0.19, p.accent, p.onAccent),
        circle(0.25, 0.25, 0.5, p.primary, { opacity: 0.14 }),
        ring(0.22, 0.23, 0.56, p.strong, 3, { opacity: 0.5 }),
        product(c, 0.27, 0.3, 0.46, 0.4),
        ...around,
        ...price(c, 0.2, 0.86, 0.6, { color: p.onPrimary, bg: p.primary, oldColor: p.ink, inline: true, align: "center" }),
      ],
    };
  },

  /** Before & After: two panels side by side (the original photo and the new one). */
  beforeAfter: (c) => {
    const { p } = c;
    const before = c.photos.before ?? c.photo;
    const b = benefitsOf(c, 3);
    const cw = b.length ? 0.88 / b.length : 0;
    const cols = b.flatMap((x, i) => {
      const cx = 0.06 + i * cw + cw / 2;
      return [
        icon(x.icon, p.strong, cx, 0.79, 0.045),
        text(x.title, cx - cw / 2 + 0.01, 0.815, cw - 0.02, 0.04, { font: c.f.body, size: 22, weight: 700, color: p.ink, align: "center", valign: "middle" }),
      ];
    });
    return {
      bg: p.paper,
      parts: [
        title(c, 0.06, 0.04, 0.88, 0.1, { size: 68, align: "center" }),
        ...sub(c, 0.1, 0.14, 0.8, 0.04, { size: 26, align: "center" }),
        rect(0.05, 0.2, 0.43, 0.54, p.dark ? p.panel : p.soft, 32),
        rect(0.52, 0.2, 0.43, 0.54, p.dark ? alpha(p.primary, 0.16) : lighter(p.primary, 0.82), 32),
        { ...product(c, 0.07, 0.25, 0.39, 0.46, before), name: "Before picture" } as Part,
        product(c, 0.54, 0.25, 0.39, 0.46),
        text(BA[c.input.language]?.[0] ?? "Before", 0.07, 0.215, 0.18, 0.04, { role: "label", font: c.f.head, size: 24, weight: 800, upper: true, color: p.ink, valign: "middle", bg: pill(p.dark ? "rgba(255,255,255,0.12)" : "#FFFFFF", 22, 8) }),
        text(BA[c.input.language]?.[1] ?? "After", 0.54, 0.215, 0.18, 0.04, { role: "label", font: c.f.head, size: 24, weight: 800, upper: true, color: p.onPrimary, valign: "middle", bg: pill(p.primary, 22, 8) }),
        ...cols,
        ...price(c, 0.2, 0.875, 0.6, { color: p.onPrimary, bg: p.primary, oldColor: p.muted, inline: true, align: "center" }),
      ],
    };
  },

  /** Multi-angle: the main picture with three more views beside it. */
  multiAngle: (c) => {
    const { p } = c;
    const extra = c.photos.extra ?? [];
    // without other angles the photo is shown closer (details), so the composition still works
    const views = [0, 1, 2].map((i) => extra[i] ?? null);
    const thumbs = views.flatMap((ph, i) => {
      const y = 0.21 + i * 0.195;
      const im = product(c, 0.725, y + 0.01, 0.225, 0.165, ph ?? c.photo) as ImageEl;
      const detail = ph ? {} : { zoom: 1.5 + i * 0.35, dx: [0, -0.18, 0.18][i], dy: [0.05, -0.12, 0.12][i], fit: "cover" as const, mask: "rounded" as const, radius: 24, shadow: false };
      return [rect(0.715, y, 0.245, 0.185, p.panel, 24, { stroke: alpha(p.ink, 0.1), strokeW: 2 }), { ...im, ...detail, name: `View ${i + 2}` } as Part];
    });
    const b = benefitsOf(c, 3);
    const chips = b.flatMap((x, i) => {
      const y = 0.81 + i * 0.055;
      return [icon(x.icon, p.strong, 0.08, y + 0.022, 0.036), text(x.title, 0.115, y, 0.5, 0.045, { font: c.f.body, size: 24, weight: 600, color: p.ink, valign: "middle" })];
    });
    return {
      bg: p.paper,
      parts: [
        ...badgeOf(c, 0.05, 0.04, p.primary, p.onPrimary),
        title(c, 0.05, c.copy.badge ? 0.09 : 0.045, 0.9, 0.1, { size: 68 }),
        rect(0.04, 0.2, 0.655, 0.585, p.dark ? p.panel : p.soft, 36),
        product(c, 0.07, 0.23, 0.6, 0.53),
        ...thumbs,
        ...chips,
        ...price(c, 0.6, 0.86, 0.36, { color: p.onAccent, bg: p.accent, oldColor: p.muted, align: "right" }),
      ],
    };
  },

  /** Editorial magazine: serif headline, a thin rule, numbered benefits beside a large product. */
  editorial: (c) => {
    const { p } = c;
    const b = benefitsOf(c, 3);
    const accent = p.strong;
    const list = b.flatMap((x, i) => {
      const y = 0.37 + i * 0.16;
      return [
        text(`0${i + 1}`, 0.06, y, 0.2, 0.05, { font: c.f.head, size: 44, weight: 800, color: accent }),
        text(x.title, 0.06, y + 0.055, 0.28, 0.04, { font: c.f.body, size: 24, weight: 700, color: p.ink }),
        ...(x.text ? [text(x.text, 0.06, y + 0.095, 0.28, 0.05, { font: c.f.body, size: 18, weight: 500, color: p.muted, lineHeight: 1.2 })] : []),
      ];
    });
    const barText = readable(p.ink);
    return {
      bg: p.paper,
      parts: [
        ...sub(c, 0.06, 0.045, 0.88, 0.035, { size: 22, weight: 600, color: accent, upper: true, spacing: 0.12 }),
        title(c, 0.06, 0.085, 0.88, 0.17, { font: c.f.head === "Montserrat" ? "Playfair Display" : c.f.head, size: 90, weight: 700, lineHeight: 1.0 }),
        rect(0.06, 0.29, 0.88, 0.003, p.ink),
        ...badgeOf(c, 0.06, 0.305, p.ink, barText),
        product(c, 0.34, 0.31, 0.62, 0.53),
        ...list,
        rect(0, 0.87, 1, 0.13, p.ink),
        ...price(c, 0.06, 0.9, 0.6, { color: contrast(p.accent, p.ink) > 3 ? p.accent : barText, oldColor: alpha(barText, 0.6), inline: true }),
      ],
    };
  },

  /** Infographic: product on one side, benefit callouts with icons on the other, colour bar at the bottom. */
  split: (c) => {
    const { p } = c;
    const b = benefitsOf(c, 4);
    const step = b.length ? Math.min(0.15, 0.6 / b.length) : 0;
    const callouts = b.flatMap((x, i) => {
      const y = 0.22 + i * step;
      return [
        circle(0.6, y, 0.085, p.primary),
        icon(x.icon, p.onPrimary, 0.6425, y + 0.0425, 0.045),
        text(x.title, 0.71, y, 0.26, 0.045, { font: c.f.head, size: 30, weight: 800, color: p.ink, valign: "middle" }),
        ...(x.text ? [text(x.text, 0.71, y + 0.045, 0.26, 0.06, { font: c.f.body, size: 22, weight: 500, color: p.muted, lineHeight: 1.15 })] : []),
      ];
    });
    return {
      bg: p.paper,
      parts: [
        rect(0, 0, 0.56, 0.86, p.dark ? alpha(p.primary, 0.08) : lin(180, p.soft, alpha(p.soft, 0))),
        circle(0.04, 0.3, 0.5, p.primary, { opacity: 0.1 }),
        title(c, 0.06, 0.045, 0.88, 0.12, { size: 76 }),
        ...badgeOf(c, 0.06, 0.17, p.accent, p.onAccent),
        product(c, 0.02, 0.22, 0.55, 0.6),
        ...callouts,
        rect(0, 0.86, 1, 0.14, p.hero),
        ...sub(c, 0.06, 0.875, c.input.price ? 0.37 : 0.88, 0.11, { weight: 600, color: p.onHero, valign: "middle" }),
        ...price(c, 0.43, 0.895, 0.53, { color: p.onAccent, bg: p.accent, oldColor: p.onHero, inline: true, align: "right" }),
      ],
    };
  },

  /** Lifestyle scene: the photo fills the card (best with an AI scene photo), texts over a soft shade. */
  lifestyle: (c) => {
    const { p } = c;
    const ph = c.photo;
    const scene = Boolean(ph && !ph.cutout);
    const b = benefitsOf(c, 3);
    const chips = b.map((x, i) => text(x.title, 0.06 + i * 0.3, 0.715, 0.28, 0.045, { font: c.f.body, size: 22, weight: 700, color: "#111111", align: "center", valign: "middle", bg: pill("rgba(255,255,255,0.92)", 18, 10, { full: true }) }));
    return {
      bg: p.paper,
      parts: [
        scene ? img(ph!.src, 0, 0, 1, 1, { fit: "cover", shadow: false }) : product(c, 0.08, 0.08, 0.84, 0.62),
        rect(0, 0.5, 1, 0.5, lin(180, "rgba(0,0,0,0)", "rgba(0,0,0,0.72)")),
        ...badgeOf(c, 0.06, 0.05, p.accent, p.onAccent),
        ...chips,
        title(c, 0.06, 0.775, 0.88, 0.1, { size: 72, color: "#FFFFFF", shadow: true }),
        ...sub(c, 0.06, 0.875, c.input.price ? 0.42 : 0.88, 0.05, { size: 28, color: "#F1F5F9" }),
        ...price(c, 0.5, 0.875, 0.46, { color: p.onAccent, bg: p.accent, oldColor: "#E5E7EB", inline: true }),
      ],
    };
  },

  /** Premium advertising poster: dramatic light, huge headline, the product as a hero. */
  poster: (c) => {
    const { p } = c;
    return {
      bg: p.hero,
      parts: [
        glow(0.05, 0.22, 0.9, alpha(p.primary, 0.45)),
        glow(0.3, 0.45, 0.4, alpha(p.onHero, 0.12)),
        ...badgeOf(c, 0.62, 0.045, p.accent, p.onAccent),
        title(c, 0.06, 0.08, 0.88, 0.17, { size: 104, weight: 900, color: p.onHero, align: "center", upper: true, lineHeight: 0.98, spacing: 0.02 }),
        product(c, 0.1, 0.27, 0.8, 0.5),
        rect(0.35, 0.795, 0.3, 0.003, alpha(p.onHero, 0.6)),
        ...sub(c, 0.1, 0.81, 0.8, 0.045, { size: 28, color: p.onHero, opacity: 0.85, align: "center", spacing: 0.06, upper: true }),
        ...price(c, 0.2, 0.875, 0.6, { color: p.onAccent, bg: p.accent, oldColor: p.onHero, inline: true, align: "center" }),
      ],
    };
  },

  /** Dark premium: glow behind the product, benefits in three columns. */
  dark: (c) => {
    const { p } = c;
    const night = p.dark ? p.paper : lin(180, "#0B0B12", "#15131F");
    const b = benefitsOf(c, 3);
    const cw = b.length ? 0.88 / b.length : 0;
    const iconColor = contrast(p.primary, "#0B0B12") > 3 ? p.primary : p.accent;
    const cols = b.flatMap((x, i) => {
      const cx = 0.06 + i * cw;
      return [
        icon(x.icon, iconColor, cx + cw / 2, 0.805, 0.055),
        text(x.title, cx + 0.01, 0.835, cw - 0.02, 0.045, { font: c.f.head, size: 28, weight: 800, color: "#FFFFFF", align: "center", valign: "middle" }),
        ...(x.text ? [text(x.text, cx + 0.01, 0.88, cw - 0.02, 0.06, { font: c.f.body, size: 21, weight: 500, color: "#A3A9B6", align: "center", lineHeight: 1.15 })] : []),
      ];
    });
    return {
      bg: night,
      parts: [
        glow(0.05, 0.18, 0.9, alpha(p.primary, 0.4)),
        title(c, 0.06, 0.05, 0.88, 0.12, { size: 80, color: "#FFFFFF", lineHeight: 1.02, align: "center" }),
        ...sub(c, 0.1, 0.17, 0.8, 0.045, { color: "#C9CDD6", align: "center" }),
        ...badgeOf(c, 0.33, 0.225, p.primary, p.onPrimary),
        product(c, 0.1, 0.24, 0.8, 0.48),
        ...price(c, 0.25, 0.71, 0.5, { color: readable(iconColor), bg: iconColor, align: "center", oldColor: "#FFFFFF" }),
        rect(0.06, 0.785, 0.88, 0.002, "rgba(255,255,255,0.15)"),
        ...cols,
      ],
    };
  },

  /** Diagonal colour band; benefits as chips; price in a round badge. */
  diagonal: (c) => {
    const { p } = c;
    const b = benefitsOf(c, 3);
    const chips = b.flatMap((x, i) => {
      const y = 0.745 + i * 0.07;
      return [
        text(x.title, 0.06, y, 0.56, 0.055, { font: c.f.body, size: 26, weight: 700, color: "#111827", valign: "middle", bg: pill("#FFFFFF", 66, 12) }),
        icon(x.icon, contrast(p.primary, "#FFFFFF") > 2.2 ? p.primary : "#111827", 0.098, y + 0.0275, 0.038),
      ];
    });
    const has = Boolean(c.input.price);
    return {
      bg: p.paper,
      parts: [
        rect(-0.3, 0.46, 1.6, 0.8, lin(90, p.primary, p.grad2), 0, { rot: -14 }),
        rect(-0.3, 0.435, 1.6, 0.014, p.accent, 0, { rot: -14 }),
        dots(0.74, 0.03, 0.22, 0.12, p.strong, 0.25),
        ...badgeOf(c, 0.06, 0.045, p.ink, readable(p.ink)),
        title(c, 0.06, c.copy.badge ? 0.1 : 0.055, 0.84, 0.13, { size: 80, lineHeight: 1.03 }),
        ...sub(c, 0.06, c.copy.badge ? 0.23 : 0.185, 0.8, 0.045),
        product(c, 0.2, 0.25, 0.74, 0.47),
        ...chips,
        ...(has && c.input.oldPrice ? [text(c.input.oldPrice, 0.66, 0.705, 0.28, 0.035, { role: "oldPrice", font: c.f.body, size: 26, weight: 500, color: p.onPrimary, strike: true, align: "center", opacity: 0.85 })] : []),
        ...(has ? [text(c.input.price!, 0.665, 0.745, 0.27, 0.2, { role: "price", font: c.f.head, size: 44, weight: 800, color: p.onAccent, align: "center", valign: "middle", lineHeight: 1.05, bg: { fill: p.accent, shape: "circle", padX: 16, padY: 16 } })] : []),
      ],
    };
  },

  /** Frame: soft background in a coloured frame, product under an arch, elegant title. */
  frame: (c) => {
    const { p } = c;
    const b = benefitsOf(c, 3);
    const cw = b.length ? 0.8 / b.length : 0;
    const cols = b.flatMap((x, i) => {
      const cx = 0.1 + i * cw + cw / 2;
      return [
        icon(x.icon, p.strong, cx, 0.785, 0.05),
        text(x.title, cx - cw / 2 + 0.01, 0.81, cw - 0.02, 0.04, { font: c.f.body, size: 22, weight: 700, color: p.ink, align: "center", valign: "middle" }),
      ];
    });
    return {
      bg: p.paper,
      parts: [
        frame(0.035, 0.026, 0.93, 0.948, p.strong, 8, 36),
        arch(0.18, 0.07, 0.64, 0.56, p.dark ? alpha("#FFFFFF", 0.06) : "#FFFFFF"),
        product(c, 0.21, 0.11, 0.58, 0.48),
        ...badgeOf(c, 0.08, 0.055, p.primary, p.onPrimary),
        title(c, 0.08, 0.635, 0.84, 0.08, { font: c.f.head === "Montserrat" ? "Playfair Display" : c.f.head, size: 62, weight: 700, align: "center", lineHeight: 1.05 }),
        ...sub(c, 0.1, 0.715, 0.8, 0.04, { size: 26, align: "center" }),
        ...cols,
        ...price(c, 0.22, 0.865, 0.56, { color: p.onPrimary, bg: p.primary, oldColor: p.ink, inline: true, align: "center" }),
      ],
    };
  },

  /** Sale: stripes, a big discount star (from the two prices), price on a light band. */
  sale: (c) => {
    const { p } = c;
    const pct = discountPct(c);
    const star = pct ? `−${pct}%` : c.copy.badge;
    const b = benefitsOf(c, 3);
    const band = p.dark ? "#111114" : "#FFFFFF";
    const bandInk = readable(band);
    const rows = b.flatMap((x, i) => {
      const y = 0.805 + i * 0.055;
      return [
        icon(x.icon, contrast(p.primary, band) > 2.2 ? p.primary : bandInk, 0.64, y + 0.022, 0.034),
        text(x.title, 0.67, y, 0.3, 0.045, { font: c.f.body, size: 22, weight: 700, color: bandInk, valign: "middle" }),
      ];
    });
    return {
      bg: p.hero,
      parts: [
        stripes(0, 0, 1, 0.78, p.onHero, 0.07),
        ...(star ? [text(star, 0.62, 0.04, 0.33, 0.33 * 0.75, { role: "discount", font: c.f.head, size: pct ? 70 : 40, weight: 900, color: p.onAccent, align: "center", valign: "middle", lineHeight: 1, bg: { fill: p.accent, shape: "burst", padX: 20, padY: 20 } })] : []),
        title(c, 0.06, 0.06, star ? 0.54 : 0.88, 0.17, { size: 76, weight: 900, color: p.onHero, lineHeight: 1.02, upper: true }),
        ...sub(c, 0.06, 0.235, star ? 0.54 : 0.88, 0.05, { size: 28, color: p.onHero, opacity: 0.9 }),
        glow(0.1, 0.25, 0.8, alpha(p.onHero, 0.25)),
        product(c, 0.1, 0.3, 0.8, 0.46),
        rect(0, 0.78, 1, 0.22, band),
        ...price(c, 0.06, 0.845, 0.54, { color: contrast(p.primary, band) > 2.2 ? p.primary : bandInk, size: 72, oldColor: alpha(bandInk, 0.55) }),
        ...rows,
      ],
    };
  },

  /** Glass: colour gradient with soft lights and a frosted panel for the benefits. */
  glass: (c) => {
    const { p } = c;
    const on = p.onHero;
    const b = benefitsOf(c, 3);
    const cw = b.length ? 0.84 / b.length : 0;
    const cols = b.flatMap((x, i) => {
      const cx = 0.08 + i * cw + cw / 2;
      return [
        icon(x.icon, on, cx, 0.735, 0.048),
        text(x.title, cx - cw / 2 + 0.01, 0.765, cw - 0.02, 0.04, { font: c.f.head, size: 24, weight: 800, color: on, align: "center", valign: "middle" }),
        ...(x.text ? [text(x.text, cx - cw / 2 + 0.01, 0.805, cw - 0.02, 0.045, { font: c.f.body, size: 18, weight: 500, color: on, align: "center", opacity: 0.85, lineHeight: 1.15 })] : []),
      ];
    });
    return {
      bg: p.hero,
      parts: [
        glow(-0.25, -0.15, 0.9, alpha(p.accent, 0.6)),
        glow(0.45, 0.35, 0.9, alpha(on, 0.2)),
        ...badgeOf(c, 0.06, 0.04, "#FFFFFF", contrast(p.primary, "#FFFFFF") > 2.2 ? p.primary : "#111111"),
        title(c, 0.06, c.copy.badge ? 0.095 : 0.05, 0.88, 0.12, { color: on }),
        ...sub(c, 0.06, c.copy.badge ? 0.215 : 0.17, 0.85, 0.045, { color: on, opacity: 0.9 }),
        product(c, 0.14, 0.23, 0.72, 0.45),
        rect(0.06, 0.7, 0.88, 0.17, alpha(on === "#FFFFFF" ? "#FFFFFF" : "#000000", 0.14), 36, { stroke: alpha(on === "#FFFFFF" ? "#FFFFFF" : "#000000", 0.3), strokeW: 2 }),
        ...cols,
        ...price(c, 0.22, 0.895, 0.56, { color: contrast(p.primary, "#FFFFFF") > 2.2 ? p.primary : "#111111", bg: "#FFFFFF", oldColor: on, inline: true, align: "center" }),
      ],
    };
  },
};

/** Wide formats (16:9): product on the left, texts on the right — used by every composition. */
function landscape(c: Ctx, layout: LayoutKey): { bg: Fill; parts: Part[] } {
  const { p } = c;
  const colourful = ["bold", "sale", "glass", "poster", "halves"].includes(layout);
  const bg = colourful ? p.hero : p.paper;
  const ink = colourful ? p.onHero : p.ink, muted = colourful ? alpha(p.onHero, 0.8) : p.muted;
  const scene = layout === "lifestyle" && c.photo && !c.photo.cutout;
  const b = benefitsOf(c, 4);
  const list = b.flatMap((x, i) => {
    const y = 0.5 + i * 0.095;
    return [
      circle(0.52, y, 0.065, colourful ? alpha(p.onHero, 0.15) : p.primary),
      icon(x.icon, colourful ? p.onHero : p.onPrimary, 0.52 + 0.0325, y + 0.0325, 0.022),
      text(x.title, 0.585, y, 0.37, 0.065, { font: c.f.body, size: 30, weight: 700, color: ink, valign: "middle" }),
    ];
  });
  return {
    bg,
    parts: [
      ...(scene ? [img(c.photo!.src, 0, 0, 0.48, 1, { fit: "cover", shadow: false })] : [rect(0.03, 0.06, 0.43, 0.88, colourful ? alpha(p.onHero, 0.1) : p.dark ? p.panel : p.soft, 40), product(c, 0.05, 0.1, 0.39, 0.8)]),
      ...badgeOf(c, 0.52, 0.07, p.accent, p.onAccent),
      title(c, 0.52, c.copy.badge ? 0.15 : 0.08, 0.44, 0.2, { size: 84, color: ink, lineHeight: 1.02 }),
      ...sub(c, 0.52, c.copy.badge ? 0.36 : 0.3, 0.44, 0.1, { size: 32, color: muted, lineHeight: 1.2 }),
      ...list,
      ...price(c, 0.52, 0.88, 0.44, { color: p.onAccent, bg: p.accent, oldColor: muted, inline: true }),
    ],
  };
}

// ------------------------------------------------------------------ decorations, light, positions
function decoParts(deco: Deco[], p: Palette): Part[] {
  const out: Part[] = [];
  const named = (x: Part, name: string) => ({ ...x, name } as Part);
  for (const d of deco) {
    if (d === "marble") out.push(named(img(patternSrc("marble", "#F4F3F1", "#8C8C8C"), 0, 0, 1, 1, { fit: "cover", shadow: false }), "Marble"));
    if (d === "flowers") {
      out.push(named(img(patternSrc("flowers", lighter(p.primary, 0.35), p.accent), -0.18, -0.08, 0.62, 0.36, { fit: "cover", shadow: false, opacity: 0.9 }), "Flowers"));
      out.push(named(img(patternSrc("flowers", p.accent, lighter(p.primary, 0.35)), 0.58, 0.8, 0.62, 0.32, { fit: "cover", shadow: false, opacity: 0.9 }), "Flowers"));
    }
    if (d === "leaves") {
      out.push(named(img(patternSrc("leaves", "#4E8A4F", "#86B97F"), -0.2, -0.1, 0.6, 0.34, { fit: "cover", shadow: false, opacity: 0.85 }), "Leaves"));
      out.push(named(img(patternSrc("leaves", "#86B97F", "#3F7A45"), 0.62, 0.82, 0.6, 0.3, { fit: "cover", shadow: false, opacity: 0.85 }), "Leaves"));
    }
    if (d === "grid") out.push(named(img(patternSrc("grid", p.dark ? "#FFFFFF" : "#000000"), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.07 }), "Grid"));
    if (d === "snow") out.push(named(img(patternSrc("snow", p.dark ? "#FFFFFF" : "#93C5FD"), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.9 }), "Snow"));
    if (d === "bokeh") out.push(named(img(patternSrc("bokeh", p.primary, p.accent), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.8 }), "Lights"));
    if (d === "goldLines") out.push(named(frame(0.025, 0.02, 0.95, 0.96, p.primary, 2, 0), "Gold frame"), named(rect(0.06, 0.012, 0.88, 0.002, alpha(p.primary, 0.7)), "Gold line"));
    if (d === "sparkles") out.push(sparkle(0.86, 0.05, 0.05, p.accent), sparkle(0.07, 0.62, 0.035, p.accent, { opacity: 0.8 }), sparkle(0.9, 0.55, 0.03, p.primary, { opacity: 0.8 }));
    if (d === "blobs") out.push(glow(-0.25, -0.1, 0.7, alpha(p.primary, 0.35)), glow(0.6, 0.6, 0.7, alpha(p.accent, 0.3)));
    if (d === "neon") out.push(named(rect(0.025, 0.018, 0.95, 0.004, p.primary, 2), "Neon line"), named(rect(0.025, 0.978, 0.95, 0.004, p.accent, 2), "Neon line"), named(rect(0.018, 0.04, 0.003, 0.92, p.primary, 2, { opacity: 0.6 }), "Neon line"), glow(-0.2, 0.1, 0.6, alpha(p.primary, 0.3)), glow(0.6, 0.55, 0.6, alpha(p.accent, 0.3)));
    if (d === "dots") out.push(dots(0.04, 0.82, 0.26, 0.14, p.primary, 0.3), dots(0.72, 0.03, 0.24, 0.12, p.grad2, 0.25));
    if (d === "vignette") out.push(named(rect(0, 0, 1, 1, rad(0.5, 0.45, 0.75, "rgba(0,0,0,0)", "rgba(0,0,0,0.55)")), "Vignette"));
    if (d === "beam") out.push(named(rect(0.3, -0.3, 0.35, 1.6, lin(90, "rgba(255,255,255,0)", "rgba(255,255,255,0.10)", "rgba(255,255,255,0)"), 0, { rot: 24 }), "Light beam"));
    if (d === "pop") out.push(circle(-0.08, 0.78, 0.3, p.accent, { opacity: 0.9 }), tri(0.82, 0.04, 0.16, 0.12, p.primary, { opacity: 0.9, rot: 15 }), circle(0.85, 0.62, 0.1, p.grad2, { opacity: 0.9 }));
    if (d === "abstract") out.push(blob(-0.15, -0.08, 0.5, 0.3, p.primary, { opacity: 0.9 }), blob(0.7, 0.75, 0.45, 0.3, p.grad2, { opacity: 0.85 }), circle(0.82, 0.06, 0.12, p.accent, { opacity: 0.9 }));
  }
  return out;
}

const isProduct = (e: El): e is ImageEl => e.type === "image" && e.name === "Product image";

/** Light, shadow, podium, product position and text placement applied to a finished composition. */
function finish(els: El[], s: StyleConfig, p: Palette, deco: Deco[]): El[] {
  let out = [...els];
  const prod = out.find(isProduct);
  if (prod) {
    // shadow strength
    const k = s.shadow / 40;
    for (const e of out) if (isProduct(e) && (e.mask ?? "none") === "none") Object.assign(e, { shadow: s.shadow > 3, shadowK: Math.min(2, k) });
    const cx = prod.x + prod.w / 2, cy = prod.y + prod.h / 2;
    const behind: El[] = [];
    const lightGlow: Partial<Record<LightKey, string>> = { studio: "rgba(255,255,255,0.55)", natural: "rgba(255,226,170,0.45)", golden: "rgba(246,194,91,0.5)", neon: alpha(p.primary, 0.5) };
    if (lightGlow[s.lighting]) behind.push({ ...glow(cx - prod.w * 0.55, cy - prod.w * 0.55, prod.w * 1.1, lightGlow[s.lighting]!), id: "" } as El);
    if (s.lighting === "neon") behind.push({ ...glow(cx - prod.w * 0.2, cy - prod.w * 0.1, prod.w * 0.8, alpha(p.accent, 0.4)), id: "" } as El);
    if (deco.includes("podium") && (prod.mask ?? "none") === "none") {
      behind.push({ ...rect(prod.x + prod.w * 0.08, prod.y + prod.h * 0.86, prod.w * 0.84, prod.h * 0.14, p.dark ? lin(180, "#2A2A30", "#141418") : lin(180, "#FFFFFF", "#D9DCE1"), 999), name: "Podium", id: "" } as El);
    }
    const i = out.indexOf(prod);
    out.splice(i, 0, ...behind);
    if (s.lighting === "dramatic") out.splice(0, 0, { ...rect(0, 0, 1, 1, rad(0.5, 0.45, 0.8, "rgba(0,0,0,0)", "rgba(0,0,0,0.5)")), name: "Shade", id: "" } as El);
    // product position
    if (s.productPos !== "auto") {
      const side = cx < 0.42 ? "left" : cx > 0.58 ? "right" : "center";
      if (s.productPos === "center" && side !== "center") prod.x = 0.5 - prod.w / 2;
      else if (s.productPos !== "center" && side !== "center" && side !== s.productPos) out = out.map((e) => mirror(e));
      else if (s.productPos !== "center" && side === "center") prod.x = s.productPos === "left" ? Math.max(0.03, 0.06) : Math.min(0.97 - prod.w, 0.94 - prod.w);
    }
  }
  // text placement
  if (s.textAlign !== "auto") for (const e of out) if (e.type === "text" && (e.role === "headline" || e.role === "subline")) e.align = s.textAlign;
  return out;
}
/** Mirror an element left↔right (the photo itself is not flipped, so its print stays readable). */
function mirror(e: El): El {
  const m = { ...e, x: 1 - e.x - e.w, rot: e.rot ? -e.rot : e.rot } as El;
  if (m.type === "text") m.align = m.align === "left" ? "right" : m.align === "right" ? "left" : m.align;
  return m;
}

// ------------------------------------------------------------------ public
/** Spec names of the compositions, in the order the selector shows them; the last five are extra styles. */
export const ALL_LAYOUTS: LayoutKey[] = ["hero", "halves", "minimal", "bold", "specs", "circle", "beforeAfter", "multiAngle", "editorial", "split", "lifestyle", "poster", "dark", "diagonal", "frame", "sale", "glass"];
export const LAYOUT_LABEL: Record<LayoutKey, string> = {
  hero: "Classic product card", halves: "Split layout", minimal: "Full product focus", bold: "Product with feature icons", specs: "Product with specifications",
  circle: "Product with benefits", beforeAfter: "Before & After", multiAngle: "Multi-angle showcase", editorial: "Editorial magazine", split: "Infographic style",
  lifestyle: "Lifestyle scene", poster: "Premium advertising poster", dark: "Dark premium", diagonal: "Diagonal", frame: "Frame", sale: "Sale", glass: "Glass gradient",
};
/** Four suggested compositions for each platform (picked by default). */
export const MARKETPLACE_LAYOUTS: Record<MarketplaceKey, LayoutKey[]> = {
  uzum: ["bold", "hero", "split", "specs"], wildberries: ["hero", "split", "dark", "minimal"], ozon: ["split", "specs", "minimal", "bold"], yandex: ["bold", "hero", "specs", "dark"],
  amazon: ["minimal", "split", "specs", "multiAngle"], alibaba: ["split", "specs", "hero", "multiAngle"], etsy: ["lifestyle", "editorial", "frame", "minimal"],
  shopify: ["minimal", "halves", "lifestyle", "editorial"], instagram: ["poster", "lifestyle", "halves", "glass"], tiktok: ["poster", "sale", "bold", "lifestyle"],
  universal: ["hero", "halves", "poster", "editorial"], other: ["minimal", "hero", "dark", "split"],
};
export const layoutsFor = (mp: MarketplaceKey): LayoutKey[] => {
  const rec = MARKETPLACE_LAYOUTS[mp] ?? MARKETPLACE_LAYOUTS.universal;
  return [...rec, ...ALL_LAYOUTS.filter((l) => !rec.includes(l))];
};

export type BuildData = { copy: CardCopy; input: CardInput; photo: CardPhoto | null; photos?: CardPhotos; style?: StyleConfig };

/** One finished card design. */
export function buildCard(layout: LayoutKey, data: BuildData, size: { w: number; h: number }): Doc {
  const mp = (BRANDS[data.input.marketplace] ? data.input.marketplace : "universal") as MarketplaceKey;
  const style = data.style ?? defaultStyle(mp);
  const { p, fonts, deco } = resolveStyle(mp, style);
  const c: Ctx = { copy: data.copy, input: data.input, photo: data.photo, photos: data.photos ?? {}, p, f: fonts };
  const key = (LAYOUTS[layout] ? layout : "hero") as LayoutKey;
  const wide = size.w / size.h > 1.2;
  AR = size.w / size.h;
  const { bg, parts } = wide ? landscape(c, key) : LAYOUTS[key](c);
  const id = `card-${mp}-${key}`;
  // the decorations sit behind the composition (a full photo scene keeps its own background)
  const scene = key === "lifestyle" && data.photo && !data.photo.cutout;
  const all = [...(scene ? [] : decoParts(deco.filter((d) => d !== "podium"), p)), ...parts];
  const els = finish(all.map((x) => ({ ...x }) as El), style, p, deco).map((x, i) => ({ ...x, id: `${id}-${i}` }) as El);
  return { v: 1, templateId: id, format: "custom", w: size.w, h: size.h, bg, els };
}

/** Sample texts for the design previews before anything is generated. */
export const SAMPLE_COPY: CardCopy = {
  title: "Your product title", subtitle: "A short line about the product", badge: "New",
  benefits: [
    { title: "Quality", text: "Made to last", icon: "badge-check" },
    { title: "Fast delivery", text: "In 1–2 days", icon: "truck" },
    { title: "Warranty", text: "From the seller", icon: "shield-check" },
    { title: "Gift ready", text: "Nice packaging", icon: "gift" },
  ],
  specs: [{ label: "Material", value: "Leather" }, { label: "Size", value: "30 × 20 cm" }, { label: "Colour", value: "Brown" }],
  marketplaceTitle: "", description: "", bullets: [], adTexts: [], keywords: [],
};
