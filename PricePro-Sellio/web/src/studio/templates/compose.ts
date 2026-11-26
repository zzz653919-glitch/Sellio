/**
 * Small helpers that turn a short template spec into editable elements. Every template picks its own
 * text position, product placement, decorations, fonts and colours, so no two look the same.
 */
import { art } from "../art/key";
import type { CategoryKey, El, Fill, ImageEl, ShapeEl, ShapeKind, TemplateDef, TextBg, TextEl } from "../types";

type NoId<T> = T extends unknown ? Omit<T, "id"> : never;
export type Part = NoId<El>;

// ------------------------------------------------------------------ fills
export const lin = (angle: number, ...colors: string[]): Fill => ({ type: "linear", angle, stops: colors.map((c, i) => [colors.length === 1 ? 0 : i / (colors.length - 1), c]) });
export const rad = (cx: number, cy: number, r: number, ...colors: string[]): Fill => ({ type: "radial", cx, cy, r, stops: colors.map((c, i) => [colors.length === 1 ? 0 : i / (colors.length - 1), c]) });

// ------------------------------------------------------------------ decorations
type SO = Partial<Omit<ShapeEl, "id" | "type" | "shape" | "x" | "y" | "w" | "h" | "fill">>;
export const shape = (kind: ShapeKind, x: number, y: number, w: number, h: number, fill: Fill, o: SO = {}): Part => ({ type: "shape", shape: kind, x, y, w, h, fill, ...o });
export const circle = (x: number, y: number, d: number, fill: Fill, o: SO = {}) => shape("circle", x, y, d, d, fill, { keep: true, ...o });
export const ring = (x: number, y: number, d: number, color: string, width = 4, o: SO = {}) => shape("ring", x, y, d, d, color, { keep: true, strokeW: width, ...o });
export const blob = (x: number, y: number, w: number, h: number, fill: Fill, o: SO = {}) => shape("blob", x, y, w, h, fill, o);
export const rect = (x: number, y: number, w: number, h: number, fill: Fill, radius = 0, o: SO = {}) => shape("rect", x, y, w, h, fill, { radius, ...o });
export const dots = (x: number, y: number, w: number, h: number, color: string, opacity = 0.35) => shape("dots", x, y, w, h, color, { opacity });
export const stripes = (x: number, y: number, w: number, h: number, color: string, opacity = 0.18) => shape("stripes", x, y, w, h, color, { opacity });
export const burst = (x: number, y: number, d: number, fill: Fill, o: SO = {}) => shape("burst", x, y, d, d, fill, { keep: true, ...o });
export const sparkle = (x: number, y: number, d: number, fill: Fill, o: SO = {}) => shape("sparkle", x, y, d, d, fill, { keep: true, ...o });
export const star = (x: number, y: number, d: number, fill: Fill, o: SO = {}) => shape("star", x, y, d, d, fill, { keep: true, ...o });
export const heart = (x: number, y: number, d: number, fill: Fill, o: SO = {}) => shape("heart", x, y, d, d, fill, { keep: true, ...o });
export const glow = (x: number, y: number, d: number, color: string, o: SO = {}) => circle(x, y, d, rad(0.5, 0.5, 0.5, color, "rgba(255,255,255,0)"), o);
export const arch = (x: number, y: number, w: number, h: number, fill: Fill, o: SO = {}) => shape("arch", x, y, w, h, fill, o);
export const podium = (x: number, y: number, w: number, h: number, fill: Fill, o: SO = {}) => shape("circle", x, y, w, h, fill, o);
export const wave = (x: number, y: number, w: number, h: number, fill: Fill, o: SO = {}) => shape("wave", x, y, w, h, fill, o);
export const half = (x: number, y: number, w: number, h: number, fill: Fill, o: SO = {}) => shape("halfcircle", x, y, w, h, fill, o);
export const line = (x: number, y: number, w: number, h: number, fill: Fill, o: SO = {}) => shape("line", x, y, w, h, fill, o);
export const tri = (x: number, y: number, w: number, h: number, fill: Fill, o: SO = {}) => shape("triangle", x, y, w, h, fill, o);
export const diamond = (x: number, y: number, w: number, h: number, fill: Fill, o: SO = {}) => shape("diamond", x, y, w, h, fill, o);
export const plus = (x: number, y: number, d: number, fill: Fill, o: SO = {}) => shape("plus", x, y, d, d, fill, { keep: true, ...o });
export const frame = (x: number, y: number, w: number, h: number, color: string, width = 3, radius = 0) => shape("rect", x, y, w, h, "rgba(0,0,0,0)", { stroke: color, strokeW: width, radius });

// ------------------------------------------------------------------ text
type TO = Partial<Omit<TextEl, "id" | "type" | "text" | "x" | "y" | "w" | "h">>;
export const text = (t: string, x: number, y: number, w: number, h: number, o: TO = {}): Part => ({
  type: "text", text: t, x, y, w, h, font: "Plus Jakarta Sans", size: 40, weight: 600, color: "#111111", align: "left", ...o,
});
export const pill = (fill: Fill, padX = 26, padY = 12, o: Partial<TextBg> = {}): TextBg => ({ fill, shape: "pill", padX, padY, ...o });
export const box = (fill: Fill, radius = 8, padX = 24, padY = 12, o: Partial<TextBg> = {}): TextBg => ({ fill, shape: "box", radius, padX, padY, ...o });
/** Round or star-burst discount badge. */
export const badge = (t: string, x: number, y: number, d: number, fill: Fill, color: string, o: TO & { shape?: TextBg["shape"] } = {}) => {
  const { shape: s = "circle", ...rest } = o;
  return text(t, x, y, d, d, { role: "discount", align: "center", valign: "middle", font: "Montserrat", weight: 800, size: 44, color, lineHeight: 1, bg: { fill, shape: s, padX: 18, padY: 18 }, ...rest });
};

// ------------------------------------------------------------------ product image
type IO = Partial<Omit<ImageEl, "id" | "type" | "src" | "x" | "y" | "w" | "h">>;
export const img = (src: string, x: number, y: number, w: number, h: number, o: IO = {}): Part => ({ type: "image", src, x, y, w, h, fit: "contain", shadow: true, name: "Product image", ...o });
export { art };

// ------------------------------------------------------------------ template spec
type CtaStyle = "pill" | "outline" | "box" | "link" | "square";
export type Spec = {
  id: string; name: string; cat: CategoryKey; tags?: string[];
  bg: Fill;
  /** Text block position: top-left, middle-left, bottom-left, top-centre, bottom-centre, top-right, middle-right. */
  pos: "tl" | "ml" | "bl" | "tc" | "bc" | "tr" | "mr";
  h: string; s?: string; cta?: string;
  font: string; weight?: number; size?: number; ink: string; ink2?: string; upper?: boolean; spacing?: number; italic?: boolean; lh?: number;
  subFont?: string; subInk?: string; subSize?: number; subWeight?: number;
  ctaStyle?: CtaStyle; ctaBg?: Fill; ctaInk?: string; ctaFont?: string;
  /** Product art: art source + box (fractions of the square design). */
  product: string; pbox?: [number, number, number, number]; pfit?: "contain" | "cover"; pmask?: ImageEl["mask"]; pshadow?: boolean; pflip?: boolean; prot?: number; pborder?: ImageEl["border"];
  /** Decorations behind and in front of the product. */
  under?: Part[]; over?: Part[];
  /** Price line under the subline. */
  price?: string; oldPrice?: string; priceInk?: string; priceSize?: number; priceFont?: string;
  /** Small brand mark above the headline. */
  brand?: string; brandInk?: string;
  /** Extra space between headline, subline and button (fractions). */
  gap?: number;
};

const AREA: Record<Spec["pos"], { x: number; y: number; w: number; align: "left" | "center" | "right" }> = {
  tl: { x: 0.07, y: 0.09, w: 0.52, align: "left" },
  ml: { x: 0.07, y: 0.27, w: 0.5, align: "left" },
  bl: { x: 0.07, y: 0.5, w: 0.56, align: "left" },
  tc: { x: 0.08, y: 0.07, w: 0.84, align: "center" },
  bc: { x: 0.08, y: 0.6, w: 0.84, align: "center" },
  tr: { x: 0.45, y: 0.09, w: 0.48, align: "right" },
  mr: { x: 0.47, y: 0.27, w: 0.46, align: "left" },
};
const PRODUCT: Record<Spec["pos"], [number, number, number, number]> = {
  tl: [0.42, 0.14, 0.58, 0.82], ml: [0.44, 0.1, 0.56, 0.86], bl: [0.36, 0.04, 0.62, 0.6],
  tc: [0.16, 0.36, 0.68, 0.62], bc: [0.16, 0.04, 0.68, 0.56], tr: [0.0, 0.14, 0.56, 0.82], mr: [0.0, 0.1, 0.5, 0.86],
};

export function build(sp: Spec): TemplateDef {
  const parts: Part[] = [];
  parts.push(...(sp.under ?? []));
  const [px, py, pw, ph] = sp.pbox ?? PRODUCT[sp.pos];
  parts.push(img(sp.product, px, py, pw, ph, { fit: sp.pfit ?? "contain", mask: sp.pmask, shadow: sp.pshadow ?? sp.pfit !== "cover", flip: sp.pflip, rot: sp.prot, border: sp.pborder }));
  parts.push(...(sp.over ?? []));

  const a = AREA[sp.pos];
  const size = sp.size ?? 92, lh = sp.lh ?? 1.04;
  const lines = sp.h.split("\n").length;
  let y = a.y;
  const gap = sp.gap ?? 0.022;
  if (sp.brand) {
    parts.push(text(sp.brand, a.x, y, a.w, 0.04, { role: "brand", align: a.align, font: "Montserrat", weight: 700, size: 22, spacing: 0.18, color: sp.brandInk ?? sp.subInk ?? sp.ink, upper: true, opacity: 0.85 }));
    y += 0.055;
  }
  const hh = (lines * size * lh) / 1000 + 0.012;
  parts.push(text(sp.h, a.x, y, a.w, hh, { role: "headline", name: "Headline", align: a.align, font: sp.font, weight: sp.weight ?? 800, size, color: sp.ink, color2: sp.ink2, upper: sp.upper, spacing: sp.spacing ?? -0.01, italic: sp.italic, lineHeight: lh }));
  y += hh + gap * 0.6;
  if (sp.s) {
    const ss = sp.subSize ?? 34;
    const sh = (sp.s.split("\n").length * ss * 1.25) / 1000 + 0.01;
    parts.push(text(sp.s, a.x, y, a.w, sh, { role: "subline", name: "Description", align: a.align, font: sp.subFont ?? "Plus Jakarta Sans", weight: sp.subWeight ?? 500, size: ss, color: sp.subInk ?? sp.ink, lineHeight: 1.25, opacity: sp.subInk ? 1 : 0.85 }));
    y += sh + gap;
  }
  if (sp.price) {
    const pw2 = sp.oldPrice ? a.w * 0.62 : a.w;
    const ps = sp.priceSize ?? 52, ph = (ps * 1.1) / 1000 + 0.01;
    parts.push(text(sp.price, a.x, y, pw2, ph, { role: "price", name: "Price", align: sp.oldPrice && a.align === "center" ? "right" : a.align, font: sp.priceFont ?? "Montserrat", weight: sp.priceFont ? 400 : 800, size: ps, color: sp.priceInk ?? sp.ink, lineHeight: 1.05 }));
    if (sp.oldPrice) parts.push(text(sp.oldPrice, a.x + pw2 + 0.02, y + 0.018, a.w - pw2 - 0.02, 0.04, { role: "oldPrice", name: "Old price", align: "left", font: "Montserrat", weight: 600, size: 30, color: sp.subInk ?? sp.ink, strike: true, opacity: 0.6 }));
    y += ph + gap;
  }
  if (sp.cta) {
    const style = sp.ctaStyle ?? "pill";
    const bg = sp.ctaBg ?? sp.ink;
    const ink = sp.ctaInk ?? "#ffffff";
    const base = { role: "cta" as const, name: "Button", align: a.align, font: sp.ctaFont ?? "Plus Jakarta Sans", weight: 700, size: 28, color: style === "outline" || style === "link" ? (typeof bg === "string" ? bg : sp.ink) : ink, valign: "middle" as const };
    const ctaBg: TextBg | undefined =
      style === "pill" ? pill(bg, 30, 14)
      : style === "outline" ? pill("rgba(0,0,0,0)", 30, 13, { stroke: typeof bg === "string" ? bg : sp.ink, strokeW: 3 })
      : style === "box" ? box(bg, 10, 30, 15)
      : style === "square" ? box(bg, 0, 32, 16)
      : undefined;
    parts.push(text(sp.cta, a.x, y + 0.008, a.w, 0.075, { ...base, bg: ctaBg, upper: style === "square", spacing: style === "square" ? 0.08 : 0, size: style === "link" ? 30 : 28 }));
  }

  return {
    id: sp.id, name: sp.name, category: sp.cat, tags: sp.tags ?? [],
    bg: sp.bg,
    els: parts.map((p, i) => ({ ...p, id: `${sp.id}-${i}` }) as El),
  };
}
