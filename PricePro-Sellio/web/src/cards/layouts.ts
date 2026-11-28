/**
 * Product-card designs. A design is built from the card texts (written by the AI or by the seller), the
 * product photo(s), the price and the style settings (theme, background, colours, font, text placement,
 * product position, light and shadow). The result is an ordinary editor document, so everything on it can
 * be changed afterwards.
 *
 * Colours are semantic — paper (background), ink (text), panel (tiles), hero (colour areas) — so every
 * composition works with every theme and background.
 */
import { arch, burst, circle, diamond, dots, frame, glow, half, img, lin, pill, plus, rad, rect, ring, shape, sparkle, star, stripes, text, blob, tri, wave, type Part } from "../studio/templates/compose";
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
/**
 * Light behind the product on a dark scene. When the brand colour is as dark as the scene (black & white,
 * dark luxury…) a glow in that colour is invisible and a dark product melts into the background, so a
 * soft light in the text colour is used instead.
 */
const sceneGlow = (p: { primary: string; onHero: string }, scene: string, a: number) =>
  contrast(p.primary, scene) < 1.8 ? alpha(p.onHero, Math.min(0.32, a * 0.7)) : alpha(p.primary, a);
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
        glow(0.05, 0.22, 0.9, sceneGlow(p, typeof p.hero === "string" ? p.hero : "#000000", 0.45)),
        glow(0.25, 0.4, 0.5, alpha(p.onHero, 0.14)),
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
        glow(0.05, 0.18, 0.9, sceneGlow({ primary: p.primary, onHero: "#FFFFFF" }, typeof night === "string" ? night : "#0B0B12", 0.4)),
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
    // ---- the 20 newer designs
    if (d === "cyber") out.push(
      glow(-0.35, -0.25, 0.9, alpha(p.primary, 0.32)), glow(0.5, 0.5, 0.9, alpha(p.grad2, 0.28)),
      named(img(patternSrc("scanlines", "#FFFFFF"), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.05 }), "Scan lines"),
      named(rect(-0.2, 0.9, 1.4, 0.007, p.primary, 0, { rot: -9, blur: 1 }), "Neon slash"), named(rect(-0.2, 0.93, 1.4, 0.0035, p.grad2, 0, { rot: -9 }), "Neon slash"),
      named(rect(0.03, 0.022, 0.09, 0.004, p.grad2), "Corner"), named(rect(0.03, 0.022, 0.005, 0.07, p.grad2), "Corner"),
      named(rect(0.88, 0.974, 0.09, 0.004, p.primary), "Corner"), named(rect(0.965, 0.908, 0.005, 0.07, p.primary), "Corner"));
    if (d === "royal") out.push(
      named(frame(0.03, 0.022, 0.94, 0.956, p.accent, 3), "Gold frame"), named(frame(0.046, 0.034, 0.908, 0.932, alpha(p.accent, 0.55), 1), "Inner frame"),
      ...[[0.03, 0.022], [0.97, 0.022], [0.03, 0.978], [0.97, 0.978]].map(([x, y]) => named(diamond(x - 0.022, y - 0.016, 0.044, 0.032, p.accent), "Corner ornament")),
      named(diamond(0.47, 0.012, 0.06, 0.022, p.accent), "Crest"), named(rect(0.36, 0.022, 0.1, 0.0025, p.accent), "Crest line"), named(rect(0.54, 0.022, 0.1, 0.0025, p.accent), "Crest line"));
    if (d === "botanical") out.push(
      named(img(patternSrc("leaves", "#2F6B3A", "#7FB069"), -0.3, -0.17, 0.62, 0.34, { fit: "cover", shadow: false, opacity: 0.9, rot: -8 }), "Leaves"),
      named(img(patternSrc("leaves", "#4E8A4F", "#A3C585"), 0.6, 0.78, 0.66, 0.36, { fit: "cover", shadow: false, opacity: 0.95, rot: 10 }), "Leaves"),
      named(img(patternSrc("flowers", lighter(p.accent, 0.2), "#F7D6E0"), 0.74, -0.1, 0.4, 0.2, { fit: "cover", shadow: false, opacity: 0.9 }), "Blossoms"),
      named(img(patternSrc("flowers", "#F7D6E0", p.accent), -0.12, 0.84, 0.4, 0.22, { fit: "cover", shadow: false, opacity: 0.9 }), "Blossoms"));
    if (d === "zen") out.push(
      named(rect(0.06, 0.955, 0.4, 0.003, alpha(p.ink, 0.35)), "Brush line"),
      named(rect(0.885, 0.885, 0.07, 0.07, p.primary, 6), "Seal"), named(frame(0.893, 0.893, 0.054, 0.054, "#FFFFFF", 2, 3), "Seal"));
    if (d === "swiss") out.push(
      ...[0.25, 0.5, 0.75].map((x) => named(rect(x, 0, 0.0015, 1, alpha(p.ink, 0.07)), "Grid line")),
      named(rect(0, 0.33, 1, 0.0015, alpha(p.ink, 0.07)), "Grid line"), named(rect(0, 0.66, 1, 0.0015, alpha(p.ink, 0.07)), "Grid line"),
      named(rect(0.88, 0.0, 0.12, 0.09, p.primary), "Red block"), named(rect(0.06, 0.028, 0.12, 0.008, p.ink), "Rule"));
    if (d === "glassPanels") out.push(
      glow(-0.3, -0.15, 0.8, alpha(p.grad2, 0.4)), glow(0.55, 0.55, 0.8, alpha(p.primary, 0.3)),
      named(rect(0.58, 0.06, 0.52, 0.42, "rgba(255,255,255,0.07)", 40, { rot: 12, stroke: "rgba(255,255,255,0.28)", strokeW: 2 }), "Glass panel"),
      named(rect(-0.14, 0.58, 0.5, 0.4, "rgba(255,255,255,0.06)", 40, { rot: -10, stroke: "rgba(255,255,255,0.22)", strokeW: 2 }), "Glass panel"),
      named(rect(0.18, -0.25, 0.05, 1.5, lin(90, "rgba(255,255,255,0)", "rgba(255,255,255,0.14)", "rgba(255,255,255,0)"), 0, { rot: 22 }), "Reflection"));
    if (d === "artdeco") out.push(
      ...[0.34, 0.26, 0.18, 0.1].map((dd, k) => named(ring(-dd / 2, -dd / 2 * 0.75, dd, alpha(p.primary, 0.9 - k * 0.15), 2), "Art deco fan")),
      ...[0.34, 0.26, 0.18, 0.1].map((dd, k) => named(ring(1 - dd / 2, 1 - dd / 2 * 0.75, dd, alpha(p.primary, 0.9 - k * 0.15), 2), "Art deco fan")),
      named(frame(0.035, 0.026, 0.93, 0.948, alpha(p.primary, 0.7), 1), "Gold frame"),
      named(rect(0.42, -0.3, 0.16, 1.6, lin(90, "rgba(212,175,55,0)", "rgba(212,175,55,0.10)", "rgba(212,175,55,0)"), 0, { rot: 18 }), "Gold light"));
    if (d === "clouds") {
      for (const [x, y, dd] of [[-0.12, 0.84, 0.3], [0.1, 0.88, 0.26], [0.32, 0.9, 0.22], [0.62, 0.86, 0.3], [0.84, 0.82, 0.26], [-0.06, 0.06, 0.18], [0.08, 0.03, 0.14]] as const)
        out.push(named(circle(x, y, dd, "#FFFFFF", { opacity: 0.85, blur: 3 }), "Cloud"));
      out.push(star(0.86, 0.07, 0.05, p.accent), sparkle(0.12, 0.3, 0.035, p.primary, { opacity: 0.8 }), star(0.9, 0.42, 0.03, p.grad2), sparkle(0.78, 0.2, 0.025, p.grad2));
    }
    if (d === "concrete") out.push(
      named(img(patternSrc("concrete", "#C9C7C3", "#6E6C69"), 0, 0, 1, 1, { fit: "cover", shadow: false }), "Concrete"),
      named(rect(0, 0, 1, 0.022, lin(180, "#4A4A4A", "#2A2A2A")), "Steel beam"), named(rect(0, 0.022, 1, 0.004, "#1A1A1A"), "Steel beam"),
      named(stripes(0, 0.972, 1, 0.028, p.primary, 0.95), "Hazard tape"));
    if (d === "floating") out.push(
      named(rect(0, 0.66, 1, 0.34, lin(180, alpha(p.primary, 0), alpha(p.primary, 0.09))), "Floor"),
      named(rect(0.05, 0.66, 0.9, 0.002, alpha(p.primary, 0.15)), "Horizon"));
    if (d === "halo") out.push(glow(-0.25, -0.2, 0.8, alpha(p.grad2, 0.28)), glow(0.55, 0.6, 0.8, alpha(p.primary, 0.25)));
    if (d === "fashion") out.push(
      named(frame(0.04, 0.03, 0.92, 0.94, alpha(p.ink, 0.22), 1), "Hairline frame"),
      named(rect(0.04, 0.075, 0.92, 0.0015, alpha(p.ink, 0.5)), "Masthead rule"),
      named(circle(0.915, 0.042, 0.022, p.accent), "Red dot"));
    if (d === "earth") out.push(
      named(wave(0, 0.9, 1, 0.1, alpha(p.accent, 0.35)), "Sand dune"),
      ...[[0.08, 0.93, 0.05, "#9C7B5B"], [0.14, 0.95, 0.035, "#C2A383"], [0.84, 0.94, 0.045, "#7E6A55"], [0.9, 0.925, 0.03, "#B79573"]].map(([x, y, dd, c]) => named(shape("circle", x as number, y as number, (dd as number) * 1.4, dd as number, c as string), "Pebble")),
      named(circle(0.8, 0.06, 0.12, alpha(p.primary, 0.25)), "Sun"));
    if (d === "holo") out.push(
      named(img(patternSrc("holo", "#B9A6FF", "#9EF0FF"), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.6 }), "Holographic foil"),
      sparkle(0.84, 0.08, 0.05, "#FFFFFF"), sparkle(0.1, 0.55, 0.035, "#FFFFFF", { opacity: 0.9 }), named(ring(0.78, 0.7, 0.3, "rgba(255,255,255,0.6)", 2), "Chrome ring"));
    if (d === "medical") out.push(
      glow(0.55, -0.2, 0.7, alpha(p.primary, 0.12)),
      named(plus(0.87, 0.05, 0.06, alpha(p.primary, 0.18)), "Cross"), named(plus(0.05, 0.86, 0.045, alpha(p.accent, 0.22)), "Cross"),
      named(rect(0, 0, 1, 0.008, lin(90, p.primary, p.accent)), "Top line"));
    if (d === "retro") out.push(
      named(img(patternSrc("sunburst", "rgba(0,0,0,0)", alpha(p.accent, 0.22)), -0.25, -0.1, 1.5, 1.2, { fit: "cover", shadow: false }), "Sun rays"),
      named(img(patternSrc("halftone", alpha(p.primary, 0.5)), 0.6, 0.62, 0.4, 0.38, { fit: "cover", shadow: false, opacity: 0.6 }), "Halftone"),
      named(rect(0.05, 0.035, 0.16, 0.012, p.primary, 6), "Retro stripe"), named(rect(0.05, 0.053, 0.16, 0.012, p.accent, 6), "Retro stripe"), named(rect(0.05, 0.071, 0.16, 0.012, "#2F7F7A", 6), "Retro stripe"));
    if (d === "motion") out.push(
      named(rect(-0.25, 0.6, 1.5, 0.2, alpha(p.primary, 0.92), 0, { rot: -12 }), "Slanted block"),
      named(rect(-0.25, 0.83, 1.5, 0.018, alpha(p.accent, 0.9), 0, { rot: -12 }), "Streak"),
      ...[[0.02, 0.2, 0.22], [0.05, 0.24, 0.32], [0.01, 0.28, 0.16], [0.7, 0.12, 0.26], [0.76, 0.16, 0.2]].map(([x, y, w]) => named(rect(x, y, w, 0.006, alpha(p.ink, 0.18), 3, { rot: -12 }), "Speed line")));
    if (d === "arches") out.push(
      named(rect(0, 0.72, 1, 0.28, lin(180, darker(typeof p.soft === "string" && p.soft.startsWith("#") ? p.soft : "#E6DDD0", 0.94), darker(typeof p.soft === "string" && p.soft.startsWith("#") ? p.soft : "#E6DDD0", 0.84))), "Floor"),
      named(rect(0, 0.718, 1, 0.004, alpha(p.ink, 0.12)), "Skirting"),
      named(rect(0, 0, 0.035, 0.72, lin(90, alpha(p.ink, 0.10), alpha(p.ink, 0.02))), "Pilaster"), named(rect(0.965, 0, 0.035, 0.72, lin(90, alpha(p.ink, 0.02), alpha(p.ink, 0.10))), "Pilaster"));
    if (d === "marbleFloor") out.push(
      named(img(patternSrc("marble", "#F2F0EC", "#8E8A84"), 0, 0.68, 1, 0.32, { fit: "cover", shadow: false }), "Marble floor"),
      named(rect(0, 0.678, 1, 0.003, alpha(p.accent, 0.8)), "Gold line"));
    if (d === "geometry") out.push(glow(-0.2, -0.15, 0.6, alpha(p.primary, 0.12)), glow(0.6, 0.65, 0.6, alpha(p.accent, 0.12)));
    // ---- batch 3
    if (d === "chrome") out.push(
      glow(-0.3, -0.2, 0.8, "rgba(226,232,240,0.18)"), glow(0.55, 0.45, 0.8, alpha(p.accent, 0.12)),
      named(wave(-0.1, 0.8, 1.2, 0.2, lin(90, "#4B5563", "#E5E9EF", "#6B7280", "#F8FAFC", "#525A66")), "Liquid chrome"),
      named(wave(-0.05, 0.86, 1.1, 0.16, lin(90, "#9AA3AF", "#F1F5F9", "#4B5563", "#D1D5DB")), "Liquid chrome"),
      named(rect(0.25, -0.3, 0.06, 1.6, lin(90, "rgba(255,255,255,0)", "rgba(255,255,255,0.16)", "rgba(255,255,255,0)"), 0, { rot: 20 }), "Chrome sheen"));
    if (d === "desert") out.push(
      named(glow(0.45, -0.18, 0.75, "rgba(255,214,140,0.5)"), "Sun glow"),
      named(wave(-0.15, 0.74, 1.3, 0.26, lin(180, "#E9B872", "#C98B45")), "Dune"),
      named(wave(-0.05, 0.84, 1.15, 0.18, lin(180, "#F1C98A", "#D9A15C")), "Dune"));
    if (d === "underwater") out.push(
      named(img(patternSrc("caustics", "#BFF6FF"), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.16 }), "Light ripples"),
      ...[[0.18, 0.06], [0.5, 0.11], [0.72, 0.04]].map(([x, w]) => named(rect(x, -0.2, w, 1.3, lin(180, "rgba(191,246,255,0.22)", "rgba(191,246,255,0)"), 0, { rot: 10 }), "Light ray")),
      named(wave(0, 0.93, 1, 0.07, alpha(p.grad2, 0.6)), "Sea floor"));
    if (d === "velvet") out.push(
      named(img(patternSrc("velvet", "#3B030E", "#8A0E24"), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.95 }), "Red velvet"),
      named(tri(0.2, -0.05, 0.6, 0.75, lin(180, "rgba(255,240,220,0.20)", "rgba(255,240,220,0)")), "Spotlight"));
    if (d === "heaven") {
      out.push(...[[0.08, 0.14], [0.22, 0.08], [0.36, 0.05]].map(([x, w]) => named(rect(x, -0.25, w, 1.2, lin(180, "rgba(255,255,255,0.45)", "rgba(255,255,255,0)"), 0, { rot: -24 }), "Sun ray")));
      for (const [x, y, dd] of [[-0.2, 0.78, 0.45], [0.1, 0.84, 0.38], [0.38, 0.86, 0.36], [0.62, 0.8, 0.44], [0.86, 0.84, 0.36], [-0.08, 0.9, 0.3], [0.5, 0.92, 0.32], [0.75, -0.08, 0.28], [0.9, -0.04, 0.22]] as const)
        out.push(named(circle(x, y, dd, rad(0.5, 0.4, 0.6, "#FFFFFF", "#EAF4FF"), { opacity: 0.95, blur: 2 }), "Cloud"));
    }
    if (d === "crystal") out.push(
      named(img(patternSrc("facets", "#FFFFFF", "#A5B4FC"), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.55 }), "Crystal facets"),
      sparkle(0.85, 0.06, 0.06, "#FFFFFF"), sparkle(0.08, 0.5, 0.04, "#C7D2FE"), sparkle(0.9, 0.62, 0.035, "#FFFFFF"), sparkle(0.2, 0.9, 0.03, "#C7D2FE"));
    if (d === "film") out.push(
      named(tri(0.15, -0.05, 0.7, 0.95, lin(180, "rgba(255,236,190,0.16)", "rgba(255,236,190,0)")), "Spotlight cone"),
      named(rect(0, 0, 1, 0.05, "#000000"), "Letterbox"), named(rect(0, 0.95, 1, 0.05, "#000000"), "Letterbox"),
      named(rect(0, 0.05, 1, 0.002, alpha(p.primary, 0.5)), "Film line"), named(rect(0, 0.948, 1, 0.002, alpha(p.primary, 0.5)), "Film line"));
    if (d === "popart") out.push(
      named(img(patternSrc("halftone", alpha(p.primary, 0.55)), -0.05, -0.05, 0.6, 0.45, { fit: "cover", shadow: false, rot: 180 }), "Halftone"),
      named(img(patternSrc("halftone", alpha(p.grad2, 0.45)), 0.5, 0.62, 0.55, 0.42, { fit: "cover", shadow: false }), "Halftone"),
      ...[0, 1, 2, 3, 4, 5].map((k) => named(tri(0.02 + k * 0.05, 0.955, 0.05, 0.035, k % 2 ? p.grad2 : p.primary), "Zigzag")));
    if (d === "scandi") out.push(
      named(rect(0, 0.76, 1, 0.24, lin(180, "#E2C9A6", "#C9A97E")), "Oak floor"),
      named(stripes(0, 0.76, 1, 0.24, "#A88654", 0.12), "Floor boards"),
      named(rect(0, 0.758, 1, 0.006, "#FFFFFF"), "Skirting"),
      named(rect(0.66, 0.2, 0.3, 0.012, "#C9A97E", 3), "Shelf"), named(rect(0.7, 0.155, 0.04, 0.045, "#E7E2D8", 4), "Vase"), named(circle(0.8, 0.165, 0.035, "#5B7065"), "Bowl"),
      named(img(patternSrc("leaves", "#4F7A5C", "#86A989"), 0.86, 0.6, 0.16, 0.16, { fit: "cover", shadow: false, opacity: 0.95 }), "Plant"),
      named(rect(0.9, 0.73, 0.07, 0.06, lin(180, "#F2EEE7", "#D9D3C8"), 8), "Plant pot"));
    if (d === "hud") out.push(
      named(img(patternSrc("grid", p.primary), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.05 }), "Grid"),
      ...[[0.03, 0.025, 1, 1], [0.97, 0.025, -1, 1], [0.03, 0.975, 1, -1], [0.97, 0.975, -1, -1]].flatMap(([x, y, sx, sy]) => [
        named(rect(sx > 0 ? x : x - 0.08, sy > 0 ? y : y - 0.004, 0.08, 0.004, p.primary), "HUD bracket"),
        named(rect(sx > 0 ? x : x - 0.004, sy > 0 ? y : y - 0.06, 0.004, 0.06, p.primary), "HUD bracket")]),
      ...[0.3, 0.33, 0.36].map((y, k) => named(rect(0.9, y, 0.06 - k * 0.015, 0.004, alpha(p.grad2, 0.8), 2), "Data line")),
      glow(-0.3, 0.2, 0.7, alpha(p.primary, 0.14)), glow(0.6, -0.2, 0.7, alpha(p.grad2, 0.14)));
    if (d === "perfume") out.push(
      named(wave(-0.2, 0.62, 1.4, 0.22, lin(90, alpha(p.accent, 0.9), alpha(p.primary, 0.55), alpha(p.accent, 0.8))), "Silk"),
      named(wave(-0.1, 0.7, 1.3, 0.16, lin(90, "rgba(255,255,255,0.55)", alpha(p.accent, 0.5), "rgba(255,255,255,0.35)")), "Silk"),
      named(rect(0.38, -0.2, 0.24, 1.2, lin(90, "rgba(255,255,255,0)", "rgba(255,255,255,0.22)", "rgba(255,255,255,0)")), "Soft beam"));
    if (d === "sunset") out.push(
      named(rect(0, 0.62, 1, 0.38, lin(180, "rgba(124,58,237,0)", "rgba(76,29,149,0.35)")), "Dusk"),
      named(glow(0.15, 0.3, 0.7, "rgba(253,186,116,0.55)"), "Haze"));
    if (d === "galaxy") out.push(
      named(img(patternSrc("stars", "#FFFFFF"), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.9 }), "Stars"),
      named(glow(-0.3, 0.3, 0.9, alpha(p.primary, 0.3)), "Nebula"), named(glow(0.5, -0.2, 0.8, alpha(p.accent, 0.25)), "Nebula"),
      );
    if (d === "splash") out.push(glow(-0.25, -0.15, 0.7, alpha(p.primary, 0.14)), glow(0.55, 0.55, 0.7, alpha(p.grad2, 0.1)));
    if (d === "ice") out.push(
      named(img(patternSrc("frost", "#FFFFFF"), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.85 }), "Frost"),
      named(img(patternSrc("snow", "#FFFFFF"), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.5 }), "Snow"),
      named(frame(0.025, 0.02, 0.95, 0.96, "rgba(255,255,255,0.7)", 2, 18), "Ice frame"));
    if (d === "boutique") out.push(
      ...[0.18, 0.5, 0.82].map((x) => named(tri(x - 0.14, -0.02, 0.28, 0.62, lin(180, "rgba(255,248,230,0.55)", "rgba(255,248,230,0)")), "Spotlight")),
      ...[0.18, 0.5, 0.82].map((x) => named(rect(x - 0.025, 0, 0.05, 0.012, "#2B2B30", 3), "Lamp")),
      named(rect(0, 0.0, 1, 0.006, alpha(p.accent, 0.7)), "Gold trim"));
    if (d === "bauhaus") out.push(
      named(circle(0.55, 0.08, 0.62, lighter(p.accent, 0.25)), "Big circle"),
      named(rect(-0.02, 0.78, 0.34, 0.24, p.grad2), "Block"),
      named(half(0.7, 0.86, 0.26, 0.14, p.primary), "Half circle"),
      named(rect(-0.1, 0.72, 1.2, 0.006, p.ink, 0, { rot: -18 }), "Line"));
    if (d === "goldenHour") out.push(
      named(glow(-0.35, -0.35, 1.0, "rgba(255,196,92,0.6)"), "Sun flare"), named(circle(0.02, 0.03, 0.12, "rgba(255,244,214,0.95)", { blur: 4 }), "Sun"),
      ...[[0.1, 0.12], [0.3, 0.07], [0.45, 0.1]].map(([x, w]) => named(rect(x, -0.3, w, 1.6, lin(180, "rgba(255,214,140,0.28)", "rgba(255,214,140,0)"), 0, { rot: -32 }), "Light beam")),
      named(img(patternSrc("bokeh", "#FFD27A", "#FFFFFF"), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.6 }), "Bokeh"));
    if (d === "gallery") out.push(
      named(rect(0, 0.82, 1, 0.18, lin(180, "#E2DFD8", "#D3CFC6")), "Gallery floor"), named(rect(0, 0.818, 1, 0.004, "#FFFFFF"), "Skirting"));
    if (d === "macro") out.push(
      named(img(patternSrc("bokeh", "#FFFFFF", p.accent), -0.1, -0.1, 0.6, 0.5, { fit: "cover", shadow: false, opacity: 0.35 }), "Out-of-focus light"),
      named(img(patternSrc("bokeh", p.accent, "#FFFFFF"), 0.55, 0.6, 0.55, 0.5, { fit: "cover", shadow: false, opacity: 0.3 }), "Out-of-focus light"));
    // ---- batch 4
    if (d === "tropical") out.push(
      named(rect(0, 0.84, 1, 0.16, lin(180, "#FDF3D7", "#F2DDAA")), "Sand"),
      named(wave(-0.1, 0.8, 1.2, 0.1, lin(90, "#5EEAD4", "#14B8A6", "#67E8F9")), "Sea"),
      named(img(patternSrc("leaves", "#0F5D3A", "#2F9E5B"), -0.32, -0.2, 0.5, 0.28, { fit: "cover", shadow: false, rot: -14 }), "Palm leaves"),
      named(img(patternSrc("leaves", "#147A47", "#3DB36B"), 0.8, -0.18, 0.44, 0.26, { fit: "cover", shadow: false, rot: 16 }), "Palm leaves"));
    if (d === "watercolor") out.push(
      named(img(patternSrc("watercolor", lighter(p.primary, 0.55), lighter(p.accent, 0.35)), -0.1, -0.08, 1.2, 1.16, { fit: "cover", shadow: false, opacity: 0.55 }), "Watercolour"),
      named(img(patternSrc("kraft", "rgba(0,0,0,0)", "#B8A88E"), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.25 }), "Paper grain"));
    if (d === "brutal") out.push(
      named(frame(0.02, 0.015, 0.96, 0.97, "#111111", 10), "Thick border"),
      named(ring(-0.1, 0.8, 0.24, "#111111", 6), "Outline circle"), named(rect(0.955, 0.5, 0.08, 0.08, p.accent, 0, { stroke: "#111111", strokeW: 4 }), "Accent block"));
    if (d === "vapor") out.push(
      named(img(patternSrc("vgrid", p.primary), 0, 0.64, 1, 0.36, { fit: "cover", shadow: false, opacity: 0.85 }), "Grid floor"),
      named(rect(0, 0.635, 1, 0.006, p.accent, 0, { blur: 1 }), "Horizon"),
      glow(-0.3, -0.2, 0.8, alpha(p.grad2, 0.3)));
    if (d === "coffee") out.push(
      named(rect(0, 0.8, 1, 0.2, lin(180, "#8B5E3C", "#5C3A22")), "Wooden table"), named(stripes(0, 0.8, 1, 0.2, "#3E2614", 0.12), "Wood grain"),
      ...[[0.05, 0.86, 20], [0.1, 0.9, -30], [0.86, 0.87, 40], [0.92, 0.92, -10], [0.8, 0.93, 70]].map(([x, y, r]) => named(shape("circle", x, y, 0.045, 0.03, lin(90, "#5A3418", "#2E1A0C"), { rot: r }), "Coffee bean")));
    if (d === "sakura") out.push(
      named(img(patternSrc("petals", "#F9A8C7", "#FBCFE0"), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.85 }), "Falling petals"));
    if (d === "autumn") out.push(
      named(img(patternSrc("petals", "#E8742B", "#C2410C"), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.38 }), "Falling leaves"),
      named(img(patternSrc("leaves", "#C2410C", "#EA9A3B"), -0.2, 0.8, 0.6, 0.3, { fit: "cover", shadow: false }), "Leaves"),
      named(img(patternSrc("leaves", "#B45309", "#DC6B1F"), 0.66, -0.12, 0.5, 0.28, { fit: "cover", shadow: false, rot: 20 }), "Leaves"),
      named(wave(0, 0.93, 1, 0.07, lin(90, "#4D5B26", "#6B7A2E")), "Moss"));
    if (d === "mirror") out.push(glow(-0.2, -0.2, 0.7, "rgba(226,232,240,0.12)"), named(rect(0, 0.8, 1, 0.003, "rgba(226,232,240,0.35)"), "Mirror floor"));
    if (d === "paper") out.push(
      named(wave(-0.1, 0.8, 1.2, 0.22, "rgba(0,0,0,0.10)"), "Paper shadow"), named(wave(-0.1, 0.78, 1.2, 0.22, lighter(p.primary, 0.45)), "Paper layer"),
      named(wave(-0.1, 0.86, 1.2, 0.16, "rgba(0,0,0,0.10)"), "Paper shadow"), named(wave(-0.1, 0.845, 1.2, 0.16, lighter(p.grad2, 0.5)), "Paper layer"),
      named(wave(-0.1, 0.92, 1.2, 0.1, lighter(p.accent, 0.45)), "Paper layer"));
    if (d === "kitchen") out.push(
      named(img(patternSrc("tiles", "#FFFFFF", "#E3E8EC"), 0, 0, 1, 0.78, { fit: "cover", shadow: false }), "Metro tiles"),
      named(rect(0, 0.78, 1, 0.22, lin(180, "#E7E5E4", "#CFCBC7")), "Stone counter"), named(rect(0, 0.778, 1, 0.006, "#FFFFFF"), "Counter edge"),
      named(img(patternSrc("leaves", "#15803D", "#4ADE80"), 0.82, 0.62, 0.2, 0.18, { fit: "cover", shadow: false }), "Herbs"));
    if (d === "moon") out.push(
      named(img(patternSrc("stars", "#E2E8F0"), 0, 0, 1, 0.6, { fit: "cover", shadow: false, opacity: 0.6 }), "Stars"),
      named(frame(0.03, 0.022, 0.94, 0.956, alpha(p.primary, 0.5), 1), "Silver line"), named(frame(0.045, 0.033, 0.91, 0.934, alpha(p.primary, 0.25), 1), "Silver line"));
    if (d === "arcade") out.push(
      named(img(patternSrc("pixels", p.primary, p.grad2), -0.05, -0.05, 0.5, 0.35, { fit: "cover", shadow: false, opacity: 0.8 }), "Pixels"),
      named(img(patternSrc("pixels", p.accent, p.primary), 0.6, 0.72, 0.45, 0.32, { fit: "cover", shadow: false, opacity: 0.7 }), "Pixels"),
      named(img(patternSrc("scanlines", "#FFFFFF"), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.04 }), "Scan lines"));
    if (d === "stage") out.push(
      ...[[0.05, p.primary, 14], [0.4, p.accent, 0], [0.75, p.grad2, -14]].map(([x, c, r]) => named(tri(x as number - 0.1, -0.05, 0.4, 0.95, lin(180, alpha(c as string, 0.45), alpha(c as string, 0)), { rot: r as number }), "Stage beam")),
      named(rect(0, 0.86, 1, 0.14, lin(180, "#1A1626", "#0A0910")), "Stage floor"), named(rect(0, 0.858, 1, 0.004, alpha(p.accent, 0.6)), "Stage edge"),
      named(glow(0.1, 0.7, 0.8, "rgba(255,255,255,0.08)"), "Haze"));
    if (d === "kraft") out.push(
      named(img(patternSrc("kraft", "#D9B98C", "#8B6A3E"), 0, 0, 1, 1, { fit: "cover", shadow: false }), "Kraft paper"),
      named(rect(-0.1, 0.975, 1.2, 0.004, "#7A5A33", 2, { rot: -2 }), "Twine"),
      named(ring(0.8, 0.04, 0.15, alpha(p.primary, 0.75), 4), "Eco stamp"), named(ring(0.815, 0.055, 0.12, alpha(p.primary, 0.5), 2), "Eco stamp"),
      named(img(patternSrc("leaves", "#4D7C0F", "#65A30D"), 0.835, 0.075, 0.08, 0.06, { fit: "cover", shadow: false }), "Eco leaf"));
    if (d === "pearl") out.push(
      named(wave(-0.2, 0.7, 1.4, 0.22, lin(90, "#FFFFFF", "#F1E3D6", "#FFFFFF", "#EADBCB")), "Satin"),
      named(wave(-0.1, 0.78, 1.3, 0.18, lin(90, "#F6EDE4", "#FFFFFF", "#E8D8C8")), "Satin"),
      ...Array.from({ length: 11 }, (_, k) => named(circle(0.02 + k * 0.035, 0.9 - Math.sin(k / 3) * 0.04, 0.03, rad(0.35, 0.3, 0.8, "#FFFFFF", "#E7DCCF")), "Pearl")));
    if (d === "glitch") out.push(
      named(img(patternSrc("glitch", p.primary, p.grad2), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.28 }), "Glitch bars"),
      named(img(patternSrc("scanlines", "#FFFFFF"), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.05 }), "Scan lines"));
    if (d === "terrazzo") out.push(
      named(img(patternSrc("terrazzo", "#E07A5F", "#81B29A"), 0, 0, 1, 1, { fit: "cover", shadow: false, opacity: 0.55 }), "Terrazzo"),
      named(rect(-0.06, 0.9, 0.18, 0.12, lighter(p.primary, 0.5), 12), "Pastel block"));
    if (d === "neonSign") out.push(
      named(img(patternSrc("brick", "#5A2E2E", "#2A1515"), 0, 0, 1, 1, { fit: "cover", shadow: false }), "Brick wall"),
      named(rect(0, 0, 1, 1, lin(180, "rgba(12,7,9,0.15)", "rgba(12,7,9,0.65)")), "Shade"),
      );
    if (d === "iso") out.push(glow(-0.25, -0.2, 0.7, alpha(p.primary, 0.1)));
    if (d === "sport") out.push(
      named(rect(0, 0.8, 1, 0.2, lin(180, "#15803D", "#14532D")), "Field"), named(stripes(0, 0.8, 1, 0.2, "#0F5132", 0.2), "Turf"),
      ...[0.84, 0.9, 0.96].map((y) => named(rect(0, y, 1, 0.004, "rgba(255,255,255,0.8)"), "Lane line")),
      named(glow(-0.3, -0.3, 0.7, "rgba(255,255,255,0.3)"), "Floodlight"), named(glow(0.6, -0.3, 0.7, "rgba(255,255,255,0.3)"), "Floodlight"));
  }
  return out;
}

/** Decorations that sit around the product itself (behind it): ensō, arch, halo, pedestal, 3D shapes… */
function productDeco(deco: Deco[], prod: ImageEl, p: Palette): El[] {
  const out: El[] = [];
  const add = (x: Part, name: string) => out.push({ ...x, name, id: "" } as El);
  const cx = prod.x + prod.w / 2, cy = prod.y + prod.h / 2, size = Math.min(prod.w, prod.h);
  const clampX = (x: number, w: number) => Math.max(-0.05, Math.min(1.05 - w, x));
  if (deco.includes("zen")) add(circle(Math.min(0.98 - size * 0.5, cx + size * 0.08), Math.max(0.02, prod.y - size * 0.06), size * 0.5, alpha(p.primary, 0.88)), "Red sun");
  if (deco.includes("zen")) add(ring(cx - size * 0.52, cy - size * 0.52, size * 1.04, alpha(p.ink, 0.75), 9, { blur: 0.6, opacity: 0.85 }), "Ensō");
  if (deco.includes("halo")) {
    add(glow(cx - size * 0.7, cy - size * 0.7, size * 1.4, alpha(p.primary, 0.35)), "Halo glow");
    add(ring(cx - size * 0.5, cy - size * 0.5, size, p.primary, 10, { blur: 3 }), "Light ring");
    add(ring(cx - size * 0.5, cy - size * 0.5, size, "#FFFFFF", 3, { opacity: 0.9 }), "Light ring");
  }
  if (deco.includes("earth")) add(arch(cx - prod.w * 0.48, prod.y - prod.h * 0.04, prod.w * 0.96, prod.h * 1.04, alpha(p.primary, 0.82)), "Terracotta arch");
  if (deco.includes("arches")) {
    add(arch(cx - prod.w * 0.5, prod.y - prod.h * 0.1, prod.w, prod.h * 1.0, lin(180, "rgba(255,255,255,0.75)", "rgba(255,255,255,0.35)")), "Arched window");
    add({ ...arch(cx - prod.w * 0.5, prod.y - prod.h * 0.1, prod.w, prod.h * 1.0, "rgba(0,0,0,0)"), stroke: alpha(p.ink, 0.18), strokeW: 3 } as Part, "Window frame");
  }
  if (deco.includes("floating")) {
    add(shape("circle", cx - prod.w * 0.32, Math.min(0.95, prod.y + prod.h * 1.06), prod.w * 0.64, prod.h * 0.07, rad(0.5, 0.5, 0.5, "rgba(15,23,42,0.28)", "rgba(15,23,42,0)")), "Floating shadow");
    add(circle(clampX(prod.x - size * 0.12, size * 0.12), prod.y + prod.h * 0.12, size * 0.12, rad(0.35, 0.3, 0.75, "#FFFFFF", p.primary)), "Sphere");
    add(circle(clampX(prod.x + prod.w + size * 0.02, size * 0.07), prod.y + prod.h * 0.6, size * 0.07, rad(0.35, 0.3, 0.75, "#FFFFFF", p.accent)), "Sphere");
  }
  if (deco.includes("marbleFloor")) {
    add(shape("circle", cx - prod.w * 0.42, prod.y + prod.h * 0.88, prod.w * 0.84, prod.h * 0.1, lin(180, "#FFFFFF", "#E4E0DA")), "Pedestal top");
    add(rect(cx - prod.w * 0.42, prod.y + prod.h * 0.93, prod.w * 0.84, prod.h * 0.12, lin(180, "#EDEAE5", "#CFCAC2")), "Pedestal");
    add(rect(cx - prod.w * 0.42, prod.y + prod.h * 0.93, prod.w * 0.84, 0.003, alpha(p.accent, 0.9)), "Gold rim");
  }
  if (deco.includes("geometry")) {
    add(circle(clampX(prod.x - size * 0.14, size * 0.18), prod.y + prod.h * 0.05, size * 0.18, rad(0.35, 0.3, 0.8, lighter(p.primary, 0.5), p.primary)), "3D sphere");
    add(tri(clampX(prod.x + prod.w - size * 0.06, size * 0.16), prod.y - size * 0.04, size * 0.16, size * 0.18, lin(90, lighter(p.accent, 0.3), darker(p.accent, 0.75))), "3D cone");
    add(rect(clampX(prod.x + prod.w - size * 0.02, size * 0.11), prod.y + prod.h * 0.72, size * 0.11, size * 0.11, lin(135, lighter(p.grad2, 0.4), p.grad2), 6, { rot: 28 }), "3D cube");
    add(ring(clampX(prod.x - size * 0.06, size * 0.12), prod.y + prod.h * 0.78, size * 0.12, p.accent, 7), "3D torus");
  }
  // ---- batch 3
  const below = Math.min(0.97, prod.y + prod.h * 0.94);
  if (deco.includes("chrome")) add(shape("circle", cx - prod.w * 0.45, below - prod.h * 0.03, prod.w * 0.9, prod.h * 0.09, lin(90, "#6B7280", "#F1F5F9", "#9CA3AF", "#E5E7EB")), "Chrome puddle");
  if (deco.includes("desert")) add(circle(Math.min(0.98 - size * 0.42, cx + size * 0.12), Math.max(0.02, prod.y - size * 0.05), size * 0.42, lin(180, "#FFF1C9", "#F7C46C")), "Sun");
  if (deco.includes("desert")) add(shape("circle", cx - prod.w * 0.5, below - prod.h * 0.02, prod.w, prod.h * 0.1, rad(0.5, 0.5, 0.5, "rgba(120,72,24,0.35)", "rgba(120,72,24,0)")), "Sand shadow");
  if (deco.includes("underwater")) {
    for (const [dx, dy, dd] of [[-0.18, 0.2, 0.05], [-0.12, 0.05, 0.03], [-0.2, -0.05, 0.02], [1.08, 0.3, 0.045], [1.14, 0.12, 0.025], [1.05, -0.02, 0.035]] as const)
      add(ring(clampX(prod.x + prod.w * dx, size * dd), prod.y + prod.h * dy, size * dd, "rgba(236,254,255,0.75)", 2), "Bubble");
  }
  if (deco.includes("crystal")) {
    add(diamond(clampX(prod.x - size * 0.12, size * 0.16), below - size * 0.2, size * 0.16, size * 0.22, lin(135, "rgba(255,255,255,0.95)", "rgba(165,180,252,0.6)")), "Crystal");
    add(diamond(clampX(prod.x + prod.w - size * 0.04, size * 0.12), below - size * 0.16, size * 0.12, size * 0.17, lin(135, "rgba(255,255,255,0.9)", "rgba(147,197,253,0.6)")), "Crystal");
    add(diamond(clampX(prod.x + prod.w + size * 0.04, size * 0.07), below - size * 0.09, size * 0.07, size * 0.1, lin(135, "rgba(255,255,255,0.9)", "rgba(199,210,254,0.7)")), "Crystal");
  }
  if (deco.includes("popart")) add(burst(cx - size * 0.62, cy - size * 0.62, size * 1.24, p.accent, { stroke: "#111111", strokeW: 5 }), "Comic burst");
  if (deco.includes("hud")) {
    add(ring(cx - size * 0.56, cy - size * 0.56, size * 1.12, alpha(p.primary, 0.75), 2), "HUD ring");
    add(ring(cx - size * 0.64, cy - size * 0.64, size * 1.28, alpha(p.grad2, 0.4), 1), "HUD ring");
    const r0 = size * 0.6;
    add(rect(cx - 0.002, cy - r0 - size * 0.06, 0.004, size * 0.06, p.primary), "HUD tick");
    add(rect(cx - 0.002, cy + r0, 0.004, size * 0.06, p.primary), "HUD tick");
    add(rect(cx - r0 - size * 0.06, cy - 0.002, size * 0.06, 0.004, p.primary), "HUD tick");
    add(rect(cx + r0, cy - 0.002, size * 0.06, 0.004, p.primary), "HUD tick");
  }
  if (deco.includes("perfume")) add(shape("circle", cx - prod.w * 0.48, below - prod.h * 0.03, prod.w * 0.96, prod.h * 0.08, rad(0.5, 0.5, 0.5, "rgba(255,255,255,0.75)", "rgba(255,255,255,0)")), "Glossy floor");
  if (deco.includes("sunset")) add(circle(cx - size * 0.62, cy - size * 0.35, size * 1.24, lin(180, "#FFE7A3", "#FB923C", "#F43F5E")), "Setting sun");
  if (deco.includes("galaxy")) {
    const pd = size * 0.24, px = clampX(prod.x - pd * 0.55, pd), py = Math.max(0.02, prod.y + prod.h * 0.02);
    add(circle(px, py, pd, rad(0.35, 0.3, 0.8, "#FDE68A", "#C2410C")), "Planet");
    add(shape("ring", px - pd * 0.3, py + pd * 0.36, pd * 1.6, pd * 0.32, "rgba(253,230,138,0.85)", { strokeW: 3, rot: -18 }), "Planet ring");
  }
  if (deco.includes("galaxy")) add(glow(cx - size * 0.7, cy - size * 0.7, size * 1.4, alpha(p.primary, 0.35)), "Cosmic glow");
  if (deco.includes("splash")) {
    add(wave(cx - prod.w * 0.62, below - prod.h * 0.12, prod.w * 1.24, prod.h * 0.18, lin(180, "rgba(186,230,253,0.95)", alpha(p.primary, 0.75))), "Splash crown");
    for (const [dx, dy, dd] of [[-0.12, 0.55, 0.05], [-0.06, 0.35, 0.03], [1.05, 0.5, 0.045], [1.1, 0.3, 0.025], [0.2, -0.06, 0.03], [0.85, -0.04, 0.035]] as const)
      add(circle(clampX(prod.x + prod.w * dx, size * dd), prod.y + prod.h * dy, size * dd, rad(0.35, 0.3, 0.8, "#FFFFFF", alpha(p.primary, 0.85))), "Droplet");
  }
  if (deco.includes("ice")) add(rect(cx - prod.w * 0.46, below - prod.h * 0.06, prod.w * 0.92, prod.h * 0.12, lin(180, "rgba(255,255,255,0.85)", "rgba(191,219,254,0.7)"), 10), "Ice block");
  if (deco.includes("boutique")) {
    add(arch(cx - prod.w * 0.58, prod.y - prod.h * 0.12, prod.w * 1.16, prod.h * 1.1, lin(180, "#FFFFFF", "#EFE9DF")), "Display niche");
    add(rect(cx - prod.w * 0.62, below, prod.w * 1.24, 0.012, lin(180, "rgba(255,255,255,0.95)", "rgba(200,210,220,0.8)"), 3), "Glass shelf");
  }
  if (deco.includes("gallery")) {
    const pad = 0.03;
    add(frame(prod.x - pad, prod.y - pad * 0.6, prod.w + pad * 2, prod.h + pad * 1.2, "#1A1A1A", 9), "Picture frame");
    add(frame(prod.x - pad + 0.012, prod.y - pad * 0.6 + 0.009, prod.w + pad * 2 - 0.024, prod.h + pad * 1.2 - 0.018, "rgba(184,134,91,0.6)", 2), "Frame inlay");
    add(tri(cx - prod.w * 0.6, -0.02, prod.w * 1.2, prod.y + 0.05, lin(180, "rgba(255,250,235,0.6)", "rgba(255,250,235,0)")), "Gallery light");
    add(rect(Math.min(0.9, prod.x + prod.w + pad + 0.02), prod.y + prod.h * 0.75, 0.07, 0.04, "#FFFFFF", 2, { stroke: "rgba(0,0,0,0.15)", strokeW: 1 }), "Museum label");
  }
  // ---- batch 4
  if (deco.includes("sakura")) {
    const by = prod.y + prod.h * 0.04;
    add(rect(cx, by, 1.1 - cx, 0.011, "#5B3A2E", 6, { rot: -12 }), "Branch");
    add(rect(cx + (1 - cx) * 0.35, by - 0.03, 0.16, 0.007, "#5B3A2E", 4, { rot: 24 }), "Branch");
    for (const [t, dy, dd] of [[0.05, -0.02, 0.06], [0.25, -0.05, 0.055], [0.45, -0.03, 0.065], [0.62, -0.07, 0.05], [0.8, -0.05, 0.055]] as const)
      add(circle(cx + (1 - cx) * t - 0.02, by + dy, dd, rad(0.5, 0.5, 0.5, "#FFFFFF", "#F7A8C6")), "Blossom");
  }
  if (deco.includes("tropical")) add(shape("circle", cx - prod.w * 0.45, below - prod.h * 0.03, prod.w * 0.9, prod.h * 0.08, rad(0.5, 0.5, 0.5, "rgba(120,90,40,0.3)", "rgba(120,90,40,0)")), "Sand shadow");
  if (deco.includes("watercolor")) add(img(patternSrc("watercolor", lighter(p.grad2, 0.35), lighter(p.primary, 0.3)), cx - size * 0.75, cy - size * 0.7, size * 1.5, size * 1.4, { fit: "cover", shadow: false, opacity: 0.8, name: "Paint splash" }), "Paint splash");
  if (deco.includes("brutal")) {
    add(rect(prod.x + 0.02, prod.y + 0.02, prod.w, prod.h, "#111111"), "Hard shadow");
    add(rect(prod.x, prod.y, prod.w, prod.h, "#F5F4F1", 0, { stroke: "#111111", strokeW: 5 }), "Product box");
  }
  if (deco.includes("vapor")) {
    const sd = size * 1.1, sx = cx - sd / 2, sy = cy - sd * 0.62;
    add(circle(sx, sy, sd, lin(180, "#FDE047", "#FB7185", "#C026D3")), "Striped sun");
    for (let k = 0; k < 5; k++) add(rect(sx, sy + sd * (0.55 + k * 0.085), sd, sd * (0.015 + k * 0.007), "#3B0A55"), "Sun stripe");
  }
  if (deco.includes("mirror")) for (let k = 4; k >= 1; k--) {
    const sc = 1 + k * 0.16;
    add(frame(cx - prod.w * sc / 2, cy - prod.h * sc / 2 - k * 0.012, prod.w * sc, prod.h * sc, `rgba(226,232,240,${(0.55 - k * 0.1).toFixed(2)})`, 2, 6), "Mirror frame");
  }
  if (deco.includes("moon")) {
    const md = size * 0.42, mx = Math.min(0.98 - md, cx + size * 0.12), my = Math.max(0.03, prod.y - size * 0.08);
    add(circle(mx, my, md, rad(0.4, 0.35, 0.7, "#F8FAFC", "#CBD5E1")), "Moon");
    add(circle(mx + md * 0.28, my - md * 0.08, md, typeof p.paper === "string" ? p.paper : "#0B1530"), "Moon shade");
    add(glow(mx - md * 0.4, my - md * 0.4, md * 1.8, "rgba(226,232,240,0.18)"), "Moon glow");
  }
  if (deco.includes("arcade")) for (let k = 0; k < 7; k++) add(rect(cx - prod.w * 0.42 + k * prod.w * 0.12, below - 0.005 + (k % 2) * 0.01, prod.w * 0.12, 0.02, k % 2 ? p.grad2 : p.primary), "Pixel platform");
  if (deco.includes("stage")) add(shape("circle", cx - prod.w * 0.55, below - prod.h * 0.04, prod.w * 1.1, prod.h * 0.12, rad(0.5, 0.5, 0.5, "rgba(255,240,220,0.45)", "rgba(255,240,220,0)")), "Spotlight pool");
  if (deco.includes("pearl")) for (const [dx, dd] of [[-0.12, 0.05], [-0.04, 0.04], [1.0, 0.045], [1.08, 0.035]] as const)
    add(circle(clampX(prod.x + prod.w * dx, size * dd), below - size * dd, size * dd, rad(0.35, 0.3, 0.8, "#FFFFFF", "#E7DCCF")), "Pearl");
  if (deco.includes("glitch")) {
    add(glow(cx - size * 0.62, cy - size * 0.55, size * 1.1, alpha(p.primary, 0.35)), "Red channel");
    add(glow(cx - size * 0.42, cy - size * 0.55, size * 1.1, alpha(p.grad2, 0.35)), "Cyan channel");
  }
  if (deco.includes("terrazzo")) {
    add(arch(cx - prod.w * 0.45, prod.y - prod.h * 0.06, prod.w * 0.9, prod.h * 0.98, lighter(p.accent, 0.45)), "Pastel arch");
    add(rect(cx - prod.w * 0.4, below - prod.h * 0.05, prod.w * 0.8, Math.min(0.05, 1 - below), lin(180, lighter(p.primary, 0.35), lighter(p.primary, 0.15)), 8), "Plinth");
  }
  if (deco.includes("neonSign")) {
    const nd = size * 0.46, nx = clampX(cx - nd * 0.05, nd), ny = Math.max(0.03, prod.y + size * 0.02);
    add(ring(nx, ny, nd, p.primary, 12, { blur: 7 }), "Neon glow"); add(ring(nx, ny, nd, "#FFE4F3", 3), "Neon tube");
    add(rect(cx - prod.w * 0.55, ny + nd * 0.15, prod.w * 0.45, 0.014, p.accent, 7, { blur: 5 }), "Neon glow"); add(rect(cx - prod.w * 0.55, ny + nd * 0.15 + 0.004, prod.w * 0.45, 0.005, "#E6FFFF", 3), "Neon tube");
  }
  if (deco.includes("neonSign")) add(shape("circle", cx - prod.w * 0.5, below - prod.h * 0.03, prod.w, prod.h * 0.1, rad(0.5, 0.5, 0.5, alpha(p.primary, 0.4), alpha(p.primary, 0))), "Neon reflection");
  if (deco.includes("iso")) {
    const pw = prod.w * 1.05, ph = prod.h * 0.18, px = cx - pw / 2, py = below - ph * 0.7;
    add(rect(px, py + ph / 2, pw, ph * 0.32, lin(90, darker(p.primary, 0.8), p.primary)), "Platform side");
    add(diamond(px, py, pw, ph, lin(135, lighter(p.primary, 0.6), lighter(p.primary, 0.35))), "Platform top");
    for (const [dx, dy, dd] of [[-0.14, 0.15, 0.09], [1.04, 0.35, 0.07]] as const) {
      const bx = clampX(prod.x + prod.w * dx, size * dd), by = prod.y + prod.h * dy, bd = size * dd;
      add(diamond(bx, by, bd, bd * 0.55, lighter(p.accent, 0.4)), "Iso block");
      add(rect(bx, by + bd * 0.275, bd, bd * 0.5, lin(90, lighter(p.accent, 0.1), darker(p.accent, 0.8))), "Iso block");
    }
  }
  if (deco.includes("sport")) add(shape("circle", cx - prod.w * 0.45, below - prod.h * 0.03, prod.w * 0.9, prod.h * 0.08, rad(0.5, 0.5, 0.5, "rgba(0,0,0,0.45)", "rgba(0,0,0,0)")), "Shadow");
  if (deco.includes("macro")) for (const [x, y, sx, sy] of [[prod.x, prod.y, 1, 1], [prod.x + prod.w, prod.y, -1, 1], [prod.x, prod.y + prod.h, 1, -1], [prod.x + prod.w, prod.y + prod.h, -1, -1]] as const) {
    add(rect(sx > 0 ? x : x - 0.05, sy > 0 ? y : y - 0.003, 0.05, 0.003, alpha(p.ink, 0.6)), "Focus mark");
    add(rect(sx > 0 ? x : x - 0.003, sy > 0 ? y : y - 0.035, 0.003, 0.035, alpha(p.ink, 0.6)), "Focus mark");
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
    if (deco.includes("macro") && (prod.mask ?? "none") === "none") {
      // close-up: the product fills more of the frame
      const k = 1.2, nw = Math.min(1.04, prod.w * k), nh = prod.h * k;
      prod.x = Math.max(-0.02, Math.min(1.02 - nw, cx - nw / 2)); prod.y = Math.max(0, cy - nh / 2); prod.w = nw; prod.h = nh;
    }
    behind.push(...productDeco(deco, prod, p));
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
