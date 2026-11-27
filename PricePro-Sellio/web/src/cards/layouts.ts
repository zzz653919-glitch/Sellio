/**
 * Product-card designs for marketplaces. A design is built from the card texts (written by the AI or by
 * the seller), the product photo and the price, in the marketplace's own colours; the result is an ordinary
 * editor document, so everything on it can be changed afterwards.
 */
import { arch, circle, dots, frame, glow, img, lin, pill, rad, rect, ring, stripes, text, type Part } from "../studio/templates/compose";
import { iconSrc } from "../studio/icons";
import type { Doc, El } from "../studio/types";

export type MarketplaceKey = "uzum" | "wildberries" | "ozon" | "yandex" | "other";
export type LayoutKey = "bold" | "hero" | "split" | "specs" | "minimal" | "dark" | "diagonal" | "frame" | "sale" | "circle" | "editorial" | "glass";

export type CardCopy = {
  title: string; subtitle: string; badge: string;
  benefits: { title: string; text: string; icon: string }[];
  specs: { label: string; value: string }[];
  marketplaceTitle: string; description: string; bullets: string[]; adTexts: string[]; keywords: string[];
};
export type CardInput = { name: string; features: string[]; benefits: string[]; price?: string; oldPrice?: string; marketplace: MarketplaceKey; language: "uz" | "ru" | "en" };
export type CardPhoto = { src: string; cutout: boolean };

type Palette = { primary: string; deep: string; /** second gradient colour (light enough for the text colour on it) */ grad2: string; soft: string; accent: string; ink: string; onPrimary: string; onAccent: string };
/** Each marketplace's own colours (no marketplace logos are put on cards: marketplaces do not allow them). */
export const PALETTES: Record<MarketplaceKey, Palette> = {
  uzum: { primary: "#7000FF", deep: "#3D0099", grad2: "#3D0099", soft: "#F2EAFF", accent: "#FFD23F", ink: "#1B1033", onPrimary: "#FFFFFF", onAccent: "#1B1033" },
  wildberries: { primary: "#CB11AB", deep: "#481173", grad2: "#481173", soft: "#FCEAF7", accent: "#FF5CA8", ink: "#2A0E2E", onPrimary: "#FFFFFF", onAccent: "#FFFFFF" },
  ozon: { primary: "#005BFF", deep: "#0033A0", grad2: "#0033A0", soft: "#E8F0FF", accent: "#F91155", ink: "#0B1B3F", onPrimary: "#FFFFFF", onAccent: "#FFFFFF" },
  yandex: { primary: "#FFCC00", deep: "#1A1A1A", grad2: "#FF9F1A", soft: "#FFF8D6", accent: "#FF5226", ink: "#111111", onPrimary: "#111111", onAccent: "#FFFFFF" },
  other: { primary: "#0F766E", deep: "#0B3B38", grad2: "#0B3B38", soft: "#E3F6F3", accent: "#F59E0B", ink: "#0F172A", onPrimary: "#FFFFFF", onAccent: "#111111" },
};

/** The four designs offered for each marketplace (in order). */
export const MARKETPLACE_LAYOUTS: Record<MarketplaceKey, LayoutKey[]> = {
  uzum: ["bold", "hero", "split", "specs"],
  wildberries: ["hero", "split", "dark", "minimal"],
  ozon: ["split", "specs", "minimal", "bold"],
  yandex: ["bold", "hero", "specs", "dark"],
  other: ["minimal", "hero", "dark", "split"],
};
export const LAYOUT_LABEL: Record<LayoutKey, string> = {
  bold: "Bright", hero: "Product in focus", split: "Infographic callouts", specs: "Characteristics", minimal: "Minimal", dark: "Dark premium",
  diagonal: "Diagonal", frame: "Frame", sale: "Sale", circle: "Circle", editorial: "Editorial", glass: "Glass gradient",
};
/** Every design; the marketplace's four recommended ones come first. */
export const ALL_LAYOUTS: LayoutKey[] = ["bold", "hero", "split", "specs", "minimal", "dark", "diagonal", "frame", "sale", "circle", "editorial", "glass"];
export const layoutsFor = (mp: MarketplaceKey): LayoutKey[] => [...MARKETPLACE_LAYOUTS[mp], ...ALL_LAYOUTS.filter((l) => !MARKETPLACE_LAYOUTS[mp].includes(l))];

const HEAD = "Montserrat";
const BODY = "Inter";

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

type Ctx = { copy: CardCopy; input: CardInput; photo: CardPhoto | null; p: Palette };

const product = (c: Ctx, x: number, y: number, w: number, h: number): Part =>
  img(c.photo?.src ?? "", x, y, w, h, c.photo && !c.photo.cutout ? { fit: "cover", mask: "rounded", radius: 40, shadow: false } : { fit: "contain", shadow: true });
const icon = (name: string, color: string, cx: number, cy: number, s = 0.042): Part =>
  ({ ...img(iconSrc(name, color), cx - s / 2, cy - (s * 0.75) / 2, s, s * 0.75, { fit: "contain", shadow: false }), name: "Icon" } as Part);
const benefitsOf = (c: Ctx, n: number) => c.copy.benefits.slice(0, n);
/** Price (and the old price, crossed out) — only when the seller gave one. */
function price(c: Ctx, x: number, y: number, w: number, o: { color: string; bg?: string; size?: number; align?: "left" | "center" | "right"; oldColor?: string; inline?: boolean }): Part[] {
  const out: Part[] = [];
  if (!c.input.price) return out;
  if (c.input.oldPrice && o.inline) {
    // old price on the same line, to the left of the price
    out.push(text(c.input.oldPrice, x, y, w * 0.36, 0.07, { role: "oldPrice", font: BODY, size: 26, weight: 500, color: o.oldColor ?? o.color, strike: true, align: "right", valign: "middle", opacity: 0.75 }));
    out.push(text(c.input.price, x + w * 0.38, y, w * 0.62, 0.07, { role: "price", font: HEAD, size: o.size ?? 56, weight: 800, color: o.color, align: "left", valign: "middle", ...(o.bg ? { bg: pill(o.bg, 28, 12) } : {}) }));
    return out;
  }
  if (c.input.oldPrice) out.push(text(c.input.oldPrice, x, y - 0.04, w, 0.035, { role: "oldPrice", font: BODY, size: 30, weight: 500, color: o.oldColor ?? o.color, strike: true, align: o.align ?? "left", opacity: 0.75 }));
  out.push(text(c.input.price, x, y, w, 0.07, { role: "price", font: HEAD, size: o.size ?? 56, weight: 800, color: o.color, align: o.align ?? "left", valign: "middle", ...(o.bg ? { bg: pill(o.bg, 28, 12) } : {}) }));
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
/** Text colour that reads on the marketplace colour (black on Yandex yellow). */
const onP = (p: Palette) => p.onPrimary;

const badgeOf = (c: Ctx, x: number, y: number, bg: string, color: string): Part[] =>
  c.copy.badge ? [text(c.copy.badge, x, y, 0.34, 0.045, { role: "label", name: "Badge", font: HEAD, size: 28, weight: 800, upper: true, spacing: 0.04, color, valign: "middle", bg: pill(bg, 24, 10) })] : [];

// ------------------------------------------------------------------ layouts
const LAYOUTS: Record<LayoutKey, (c: Ctx) => { bg: Doc["bg"]; parts: Part[] }> = {
  /** Gradient in the marketplace colour, big title, product, white panel with a 2×2 infographic. */
  bold: (c) => {
    const { p } = c;
    const b = benefitsOf(c, 4);
    const cells = b.flatMap((x, i) => {
      const cx = i % 2 ? 0.52 : 0.09, cy = i < 2 ? 0.75 : 0.85;
      return [
        circle(cx, cy, 0.075, p.soft),
        icon(x.icon, p.primary, cx + 0.0375, cy + 0.0375),
        text(x.title, cx + 0.09, cy - 0.002, 0.3, 0.04, { font: HEAD, size: 30, weight: 800, color: p.ink, valign: "middle" }),
        ...(x.text ? [text(x.text, cx + 0.09, cy + 0.038, 0.3, 0.045, { font: BODY, size: 22, weight: 500, color: "#5B6472", lineHeight: 1.15 })] : []),
      ];
    });
    return {
      bg: lin(160, p.primary, p.grad2),
      parts: [
        glow(0.55, -0.12, 0.7, "rgba(255,255,255,0.28)"),
        dots(0.72, 0.04, 0.24, 0.12, p.onPrimary, 0.25),
        ...badgeOf(c, 0.07, 0.045, p.accent, p.onAccent),
        text(c.copy.title, 0.07, c.copy.badge ? 0.1 : 0.06, 0.86, 0.13, { role: "headline", font: HEAD, size: 84, weight: 800, color: p.onPrimary, lineHeight: 1.02 }),
        ...(c.copy.subtitle ? [text(c.copy.subtitle, 0.07, c.copy.badge ? 0.235 : 0.195, 0.8, 0.05, { role: "subline", font: BODY, size: 34, weight: 500, color: p.onPrimary, opacity: 0.88 })] : []),
        glow(0.15, 0.3, 0.7, "rgba(255,255,255,0.22)"),
        product(c, 0.12, 0.28, 0.76, 0.42),
        ...price(c, 0.56, 0.62, 0.38, { color: p.onAccent, bg: p.accent, align: "right", oldColor: p.onPrimary }),
        rect(0.05, 0.72, 0.9, 0.245, "#FFFFFF", 44),
        ...cells,
      ],
    };
  },

  /** Light background, product large in the middle, three benefit tiles at the bottom. */
  hero: (c) => {
    const { p } = c;
    const b = benefitsOf(c, 3);
    const tw = b.length ? (0.9 - (b.length - 1) * 0.025) / b.length : 0;
    const tiles = b.flatMap((x, i) => {
      const tx = 0.05 + i * (tw + 0.025);
      return [
        rect(tx, 0.775, tw, 0.18, "#FFFFFF", 32),
        circle(tx + tw / 2 - 0.04, 0.79, 0.08, p.primary),
        icon(x.icon, p.onPrimary, tx + tw / 2, 0.83),
        text(x.title, tx + 0.015, 0.865, tw - 0.03, 0.04, { font: HEAD, size: 28, weight: 800, color: p.ink, align: "center", valign: "middle" }),
        ...(x.text ? [text(x.text, tx + 0.015, 0.905, tw - 0.03, 0.04, { font: BODY, size: 20, weight: 500, color: "#5B6472", align: "center", lineHeight: 1.1 })] : []),
      ];
    });
    return {
      bg: lin(180, p.soft, "#FFFFFF"),
      parts: [
        circle(0.13, 0.2, 0.74, p.primary, { opacity: 0.12 }),
        circle(0.2, 0.25, 0.6, p.primary, { opacity: 0.12 }),
        ...badgeOf(c, 0.06, 0.04, p.primary, p.onPrimary),
        text(c.copy.title, 0.06, c.copy.badge ? 0.095 : 0.05, 0.88, 0.11, { role: "headline", font: HEAD, size: 76, weight: 800, color: p.ink, lineHeight: 1.04 }),
        ...(c.copy.subtitle ? [text(c.copy.subtitle, 0.06, c.copy.badge ? 0.205 : 0.165, 0.85, 0.045, { role: "subline", font: BODY, size: 32, weight: 500, color: "#4B5563" })] : []),
        product(c, 0.1, 0.25, 0.8, 0.5),
        ...price(c, 0.06, 0.68, 0.5, { color: p.onPrimary, bg: p.primary, oldColor: p.ink }),
        ...tiles,
      ],
    };
  },

  /** Product on the left, benefit callouts with icons on the right, colour bar at the bottom. */
  split: (c) => {
    const { p } = c;
    const b = benefitsOf(c, 4);
    const step = b.length ? Math.min(0.15, 0.6 / b.length) : 0;
    const callouts = b.flatMap((x, i) => {
      const y = 0.22 + i * step;
      return [
        circle(0.6, y, 0.085, p.primary),
        icon(x.icon, p.onPrimary, 0.6425, y + 0.0425, 0.045),
        text(x.title, 0.71, y, 0.26, 0.045, { font: HEAD, size: 30, weight: 800, color: p.ink, valign: "middle" }),
        ...(x.text ? [text(x.text, 0.71, y + 0.045, 0.26, 0.06, { font: BODY, size: 22, weight: 500, color: "#5B6472", lineHeight: 1.15 })] : []),
      ];
    });
    return {
      bg: "#FFFFFF",
      parts: [
        rect(0, 0, 0.56, 0.86, lin(180, p.soft, "#FFFFFF")),
        circle(0.04, 0.3, 0.5, p.primary, { opacity: 0.1 }),
        text(c.copy.title, 0.06, 0.045, 0.88, 0.12, { role: "headline", font: HEAD, size: 76, weight: 800, color: p.ink, lineHeight: 1.04 }),
        ...badgeOf(c, 0.06, 0.17, p.accent, p.onAccent),
        product(c, 0.02, 0.22, 0.55, 0.6),
        ...callouts,
        rect(0, 0.86, 1, 0.14, lin(90, p.primary, p.grad2)),
        ...(c.copy.subtitle ? [text(c.copy.subtitle, 0.06, 0.875, c.input.price ? 0.37 : 0.88, 0.11, { role: "subline", font: BODY, size: 30, weight: 600, color: p.onPrimary, valign: "middle" })] : []),
        ...price(c, 0.43, 0.895, 0.53, { color: p.onAccent, bg: p.accent, oldColor: p.onPrimary, inline: true, align: "right" }),
      ],
    };
  },

  /** Colour header with the title, product, then a table of characteristics. */
  specs: (c) => {
    const { p } = c;
    const rows = (c.copy.specs.length ? c.copy.specs : c.copy.benefits.map((x) => ({ label: x.title, value: x.text }))).slice(0, 5);
    const rh = 0.052;
    const table = rows.flatMap((r, i) => {
      const y = 0.665 + i * rh;
      return [
        ...(i % 2 === 0 ? [rect(0.06, y, 0.88, rh, p.soft, 14)] : []),
        text(r.label, 0.09, y, 0.42, rh, { font: BODY, size: 26, weight: 500, color: "#5B6472", valign: "middle" }),
        text(r.value, 0.5, y, 0.41, rh, { font: HEAD, size: 26, weight: 700, color: p.ink, align: "right", valign: "middle" }),
      ];
    });
    return {
      bg: "#FFFFFF",
      parts: [
        rect(0, 0, 1, 0.2, lin(120, p.primary, p.grad2)),
        dots(0.78, 0.03, 0.2, 0.14, p.onPrimary, 0.2),
        text(c.copy.title, 0.06, 0.03, 0.88, 0.11, { role: "headline", font: HEAD, size: 72, weight: 800, color: p.onPrimary, lineHeight: 1.04, valign: "middle" }),
        ...(c.copy.subtitle ? [text(c.copy.subtitle, 0.06, 0.14, 0.88, 0.045, { role: "subline", font: BODY, size: 30, weight: 500, color: p.onPrimary, opacity: 0.9 })] : []),
        glow(0.2, 0.22, 0.6, `${p.primary}22`),
        product(c, 0.14, 0.22, 0.72, 0.42),
        ...badgeOf(c, 0.06, 0.225, p.accent, p.onAccent),
        ...table,
        ...price(c, 0.4, Math.min(0.92, 0.665 + rows.length * rh + 0.025), 0.54, { color: p.onAccent, bg: p.accent, oldColor: p.ink, inline: true, align: "right" }),
      ],
    };
  },

  /** Clean white card: big product, centred title, short benefit list with check marks. */
  minimal: (c) => {
    const { p } = c;
    const b = benefitsOf(c, 3);
    const list = b.flatMap((x, i) => {
      const y = 0.79 + i * 0.055;
      return [
        icon(x.icon, p.primary, 0.2, y + 0.022, 0.04),
        text(x.text ? `${x.title} — ${x.text}` : x.title, 0.245, y, 0.62, 0.045, { font: BODY, size: 28, weight: 600, color: p.ink, valign: "middle" }),
      ];
    });
    return {
      bg: rad(0.5, 0.35, 0.7, "#FFFFFF", p.soft),
      parts: [
        ...badgeOf(c, 0.06, 0.04, p.ink, "#FFFFFF"),
        product(c, 0.1, 0.08, 0.8, 0.5),
        text(c.copy.title, 0.08, 0.6, 0.84, 0.09, { role: "headline", font: HEAD, size: 66, weight: 700, color: p.ink, align: "center", lineHeight: 1.05 }),
        ...(c.copy.subtitle ? [text(c.copy.subtitle, 0.1, 0.69, 0.8, 0.04, { role: "subline", font: BODY, size: 28, weight: 500, color: "#6B7280", align: "center" })] : []),
        ...price(c, 0.18, 0.725, 0.64, { color: p.primary === "#FFCC00" ? p.ink : p.primary, size: 54, oldColor: "#6B7280", inline: true, align: "center" }),
        ...list,
      ],
    };
  },

  /** Dark premium: glow in the marketplace colour behind the product, benefits in three columns. */
  dark: (c) => {
    const { p } = c;
    const b = benefitsOf(c, 3);
    const cw = b.length ? 0.88 / b.length : 0;
    const cols = b.flatMap((x, i) => {
      const cx = 0.06 + i * cw;
      return [
        icon(x.icon, p.primary === "#FFCC00" ? p.primary : p.accent, cx + cw / 2, 0.805, 0.055),
        text(x.title, cx + 0.01, 0.835, cw - 0.02, 0.045, { font: HEAD, size: 28, weight: 800, color: "#FFFFFF", align: "center", valign: "middle" }),
        ...(x.text ? [text(x.text, cx + 0.01, 0.88, cw - 0.02, 0.06, { font: BODY, size: 21, weight: 500, color: "#A3A9B6", align: "center", lineHeight: 1.15 })] : []),
      ];
    });
    return {
      bg: lin(180, "#0B0B12", "#15131F"),
      parts: [
        glow(0.05, 0.18, 0.9, `${p.primary}66`),
        text(c.copy.title, 0.06, 0.05, 0.88, 0.12, { role: "headline", font: HEAD, size: 80, weight: 800, color: "#FFFFFF", lineHeight: 1.02, align: "center" }),
        ...(c.copy.subtitle ? [text(c.copy.subtitle, 0.1, 0.17, 0.8, 0.045, { role: "subline", font: BODY, size: 30, weight: 500, color: "#C9CDD6", align: "center" })] : []),
        ...badgeOf(c, 0.33, 0.225, p.primary, p.onPrimary),
        product(c, 0.1, 0.24, 0.8, 0.48),
        ...price(c, 0.25, 0.71, 0.5, { color: p.onAccent, bg: p.primary === "#FFCC00" ? p.primary : p.accent, align: "center", oldColor: "#FFFFFF" }),
        rect(0.06, 0.785, 0.88, 0.002, "rgba(255,255,255,0.15)"),
        ...cols,
      ],
    };
  },

  /** White card cut by a diagonal band in the marketplace colour; benefits as chips; price in a round badge. */
  diagonal: (c) => {
    const { p } = c;
    const b = benefitsOf(c, 3);
    const chips = b.flatMap((x, i) => {
      const y = 0.745 + i * 0.07;
      return [
        text(x.title, 0.06, y, 0.56, 0.055, { font: BODY, size: 26, weight: 700, color: p.ink, valign: "middle", bg: pill("#FFFFFF", 66, 12) }),
        icon(x.icon, p.primary === "#FFCC00" ? p.ink : p.primary, 0.098, y + 0.0275, 0.038),
      ];
    });
    const has = Boolean(c.input.price);
    return {
      bg: "#FFFFFF",
      parts: [
        rect(-0.3, 0.46, 1.6, 0.8, lin(90, p.primary, p.grad2), 0, { rot: -14 }),
        rect(-0.3, 0.435, 1.6, 0.014, p.accent, 0, { rot: -14 }),
        dots(0.74, 0.03, 0.22, 0.12, p.primary, 0.25),
        ...badgeOf(c, 0.06, 0.045, p.ink, "#FFFFFF"),
        text(c.copy.title, 0.06, c.copy.badge ? 0.1 : 0.055, 0.84, 0.13, { role: "headline", font: HEAD, size: 80, weight: 800, color: p.ink, lineHeight: 1.03 }),
        ...(c.copy.subtitle ? [text(c.copy.subtitle, 0.06, c.copy.badge ? 0.23 : 0.185, 0.8, 0.045, { role: "subline", font: BODY, size: 30, weight: 500, color: "#4B5563" })] : []),
        product(c, 0.2, 0.25, 0.74, 0.47),
        ...chips,
        ...(has && c.input.oldPrice ? [text(c.input.oldPrice, 0.66, 0.705, 0.28, 0.035, { role: "oldPrice", font: BODY, size: 26, weight: 500, color: onP(p), strike: true, align: "center", opacity: 0.85 })] : []),
        ...(has ? [text(c.input.price!, 0.665, 0.745, 0.27, 0.2, { role: "price", font: HEAD, size: 44, weight: 800, color: p.onAccent, align: "center", valign: "middle", lineHeight: 1.05, bg: { fill: p.accent, shape: "circle", padX: 16, padY: 16 } })] : []),
      ],
    };
  },

  /** Soft background in a coloured frame, product under an arch, elegant serif title. */
  frame: (c) => {
    const { p } = c;
    const b = benefitsOf(c, 3);
    const cw = b.length ? 0.8 / b.length : 0;
    const cols = b.flatMap((x, i) => {
      const cx = 0.1 + i * cw + cw / 2;
      return [
        icon(x.icon, p.primary === "#FFCC00" ? p.ink : p.primary, cx, 0.785, 0.05),
        text(x.title, cx - cw / 2 + 0.01, 0.81, cw - 0.02, 0.04, { font: BODY, size: 22, weight: 700, color: p.ink, align: "center", valign: "middle" }),
      ];
    });
    return {
      bg: lin(180, p.soft, "#FFFFFF"),
      parts: [
        frame(0.035, 0.026, 0.93, 0.948, p.primary === "#FFCC00" ? p.ink : p.primary, 8, 36),
        arch(0.18, 0.07, 0.64, 0.56, "#FFFFFF"),
        product(c, 0.21, 0.11, 0.58, 0.48),
        ...badgeOf(c, 0.08, 0.055, p.primary, p.onPrimary),
        text(c.copy.title, 0.08, 0.635, 0.84, 0.08, { role: "headline", font: "Playfair Display", size: 62, weight: 700, color: p.ink, align: "center", lineHeight: 1.05 }),
        ...(c.copy.subtitle ? [text(c.copy.subtitle, 0.1, 0.715, 0.8, 0.04, { role: "subline", font: BODY, size: 26, weight: 500, color: "#6B7280", align: "center" })] : []),
        ...cols,
        ...price(c, 0.22, 0.865, 0.56, { color: p.onPrimary, bg: p.primary, oldColor: p.ink, inline: true, align: "center" }),
      ],
    };
  },

  /** Bright sale card: stripes, a big discount star (from the two prices), price on a white band. */
  sale: (c) => {
    const { p } = c;
    const pct = discountPct(c);
    const star = pct ? `−${pct}%` : c.copy.badge;
    const b = benefitsOf(c, 3);
    const rows = b.flatMap((x, i) => {
      const y = 0.805 + i * 0.055;
      return [
        icon(x.icon, p.primary === "#FFCC00" ? p.ink : p.primary, 0.64, y + 0.022, 0.034),
        text(x.title, 0.67, y, 0.3, 0.045, { font: BODY, size: 22, weight: 700, color: p.ink, valign: "middle" }),
      ];
    });
    return {
      bg: lin(160, p.primary, p.grad2),
      parts: [
        stripes(0, 0, 1, 0.78, onP(p), 0.07),
        ...(star ? [text(star, 0.62, 0.04, 0.33, 0.33 * 0.75, { role: "discount", font: HEAD, size: pct ? 70 : 40, weight: 900, color: p.onAccent, align: "center", valign: "middle", lineHeight: 1, bg: { fill: p.accent, shape: "burst", padX: 20, padY: 20 } })] : []),
        text(c.copy.title, 0.06, 0.06, star ? 0.54 : 0.88, 0.17, { role: "headline", font: HEAD, size: 76, weight: 900, color: onP(p), lineHeight: 1.02, upper: true }),
        ...(c.copy.subtitle ? [text(c.copy.subtitle, 0.06, 0.235, star ? 0.54 : 0.88, 0.05, { role: "subline", font: BODY, size: 28, weight: 500, color: onP(p), opacity: 0.9 })] : []),
        glow(0.1, 0.25, 0.8, "rgba(255,255,255,0.35)"),
        product(c, 0.1, 0.3, 0.8, 0.46),
        rect(0, 0.78, 1, 0.22, "#FFFFFF"),
        ...price(c, 0.06, 0.845, 0.54, { color: p.primary === "#FFCC00" ? p.ink : p.primary, size: 72, oldColor: "#6B7280" }),
        ...rows,
      ],
    };
  },

  /** Product in a big circle, four benefits around it. */
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
        text(x.title, x0, y0 + 0.085, 0.22, 0.04, { font: HEAD, size: 24, weight: 800, color: p.ink, align: "center", valign: "middle" }),
        ...(x.text ? [text(x.text, x0, y0 + 0.125, 0.22, 0.05, { font: BODY, size: 18, weight: 500, color: "#5B6472", align: "center", lineHeight: 1.15 })] : []),
      ];
    });
    return {
      bg: rad(0.5, 0.48, 0.75, "#FFFFFF", p.soft),
      parts: [
        text(c.copy.title, 0.06, 0.04, 0.88, 0.1, { role: "headline", font: HEAD, size: 70, weight: 800, color: p.ink, align: "center", lineHeight: 1.03 }),
        ...(c.copy.subtitle ? [text(c.copy.subtitle, 0.1, 0.14, 0.8, 0.04, { role: "subline", font: BODY, size: 28, weight: 500, color: "#4B5563", align: "center" })] : []),
        ...badgeOf(c, 0.33, 0.19, p.accent, p.onAccent),
        circle(0.25, 0.25, 0.5, p.primary, { opacity: 0.14 }),
        ring(0.22, 0.23, 0.56, p.primary === "#FFCC00" ? p.ink : p.primary, 3, { opacity: 0.5 }),
        product(c, 0.27, 0.3, 0.46, 0.4),
        ...around,
        ...price(c, 0.2, 0.86, 0.6, { color: p.onPrimary, bg: p.primary, oldColor: p.ink, inline: true, align: "center" }),
      ],
    };
  },

  /** Magazine style: serif headline, a thin rule, numbered benefits beside a large product. */
  editorial: (c) => {
    const { p } = c;
    const b = benefitsOf(c, 3);
    const accent = p.primary === "#FFCC00" ? "#B88A00" : p.primary;
    const list = b.flatMap((x, i) => {
      const y = 0.37 + i * 0.16;
      return [
        text(`0${i + 1}`, 0.06, y, 0.2, 0.05, { font: HEAD, size: 44, weight: 800, color: accent }),
        text(x.title, 0.06, y + 0.055, 0.28, 0.04, { font: BODY, size: 24, weight: 700, color: p.ink }),
        ...(x.text ? [text(x.text, 0.06, y + 0.095, 0.28, 0.05, { font: BODY, size: 18, weight: 500, color: "#6B7280", lineHeight: 1.2 })] : []),
      ];
    });
    return {
      bg: "#F7F4EF",
      parts: [
        ...(c.copy.subtitle ? [text(c.copy.subtitle, 0.06, 0.045, 0.88, 0.035, { role: "subline", font: BODY, size: 22, weight: 600, color: accent, upper: true, spacing: 0.12 })] : []),
        text(c.copy.title, 0.06, 0.085, 0.88, 0.17, { role: "headline", font: "Playfair Display", size: 90, weight: 700, color: p.ink, lineHeight: 1.0 }),
        rect(0.06, 0.29, 0.88, 0.003, p.ink),
        ...badgeOf(c, 0.06, 0.305, p.ink, "#FFFFFF"),
        product(c, 0.34, 0.31, 0.62, 0.53),
        ...list,
        rect(0, 0.87, 1, 0.13, p.ink),
        ...price(c, 0.06, 0.9, 0.6, { color: p.accent === "#FFD23F" || p.primary === "#FFCC00" ? "#FFD23F" : "#FFFFFF", oldColor: "#9CA3AF", inline: true }),
      ],
    };
  },

  /** Colour gradient with soft lights and a frosted-glass panel for the benefits. */
  glass: (c) => {
    const { p } = c;
    const b = benefitsOf(c, 3);
    const cw = b.length ? 0.84 / b.length : 0;
    const cols = b.flatMap((x, i) => {
      const cx = 0.08 + i * cw + cw / 2;
      return [
        icon(x.icon, onP(p), cx, 0.735, 0.048),
        text(x.title, cx - cw / 2 + 0.01, 0.765, cw - 0.02, 0.04, { font: HEAD, size: 24, weight: 800, color: onP(p), align: "center", valign: "middle" }),
        ...(x.text ? [text(x.text, cx - cw / 2 + 0.01, 0.805, cw - 0.02, 0.045, { font: BODY, size: 18, weight: 500, color: onP(p), align: "center", opacity: 0.85, lineHeight: 1.15 })] : []),
      ];
    });
    return {
      bg: lin(135, p.primary, p.grad2),
      parts: [
        glow(-0.25, -0.15, 0.9, `${p.accent}99`),
        glow(0.45, 0.35, 0.9, "rgba(255,255,255,0.28)"),
        ...badgeOf(c, 0.06, 0.04, "#FFFFFF", p.primary === "#FFCC00" ? p.ink : p.primary),
        text(c.copy.title, 0.06, c.copy.badge ? 0.095 : 0.05, 0.88, 0.12, { role: "headline", font: HEAD, size: 78, weight: 800, color: onP(p), lineHeight: 1.03 }),
        ...(c.copy.subtitle ? [text(c.copy.subtitle, 0.06, c.copy.badge ? 0.215 : 0.17, 0.85, 0.045, { role: "subline", font: BODY, size: 30, weight: 500, color: onP(p), opacity: 0.9 })] : []),
        product(c, 0.14, 0.23, 0.72, 0.45),
        rect(0.06, 0.7, 0.88, 0.17, "rgba(255,255,255,0.16)", 36, { stroke: "rgba(255,255,255,0.4)", strokeW: 2 }),
        ...cols,
        ...price(c, 0.22, 0.895, 0.56, { color: p.primary === "#FFCC00" ? p.ink : p.primary, bg: "#FFFFFF", oldColor: onP(p), inline: true, align: "center" }),
      ],
    };
  },
};

/** One finished card design. */
export function buildCard(layout: LayoutKey, data: { copy: CardCopy; input: CardInput; photo: CardPhoto | null }, size: { w: number; h: number }): Doc {
  const p = PALETTES[data.input.marketplace];
  const { bg, parts } = LAYOUTS[layout]({ ...data, p });
  const id = `card-${data.input.marketplace}-${layout}`;
  const els = parts.map((x, i) => ({ ...x, id: `${id}-${i}` }) as El);
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
