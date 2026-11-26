/**
 * Creative Score: measured checks of a banner or an uploaded ad image. Nothing here is guessed:
 * contrast, sizes, areas, margins, sharpness and colours are computed from the pixels and the
 * layout. Things that cannot be measured without "seeing" the image are left to the AI review.
 */
import type { Msg } from "./msg";
import { FORMATS, type FormatKey, type Layout } from "./banner";

export type Check = { key: "visualQuality" | "readability" | "composition" | "productVisibility" | "brandConsistency"; score: number | null; tips: Msg[]; facts: Msg[] };
export type ScoreResult = { overall: number | null; checks: Check[] };

type RGB = [number, number, number];

export function parseColor(c: string): RGB {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c.trim());
  if (short) return [parseInt(short[1] + short[1], 16), parseInt(short[2] + short[2], 16), parseInt(short[3] + short[3], 16)];
  if (c.trim() === "white") return [255, 255, 255];
  const m = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  const r = /rgba?\(([^)]+)\)/.exec(c);
  if (r) { const [a, b, d] = r[1].split(",").map((x) => parseFloat(x)); return [a, b, d]; }
  return [0, 0, 0];
}
const lum = ([r, g, b]: RGB) => {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
/** WCAG contrast ratio (1–21). */
export const contrast = (a: RGB, b: RGB) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

function avgColor(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): RGB {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y)), x1 = Math.min(W, Math.ceil(x + w)), y1 = Math.min(H, Math.ceil(y + h));
  if (x1 <= x0 || y1 <= y0) return [255, 255, 255];
  const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  return [r / n, g / n, b / n];
}

/** Variance of the Laplacian on a small grey copy: higher = sharper. */
export function sharpness(img: CanvasImageSource, w: number, h: number) {
  const s = Math.min(1, 400 / Math.max(w, h));
  if (!w || !h) return 0;
  const cw = Math.max(8, Math.round(w * s)), ch = Math.max(8, Math.round(h * s));
  const c = document.createElement("canvas"); c.width = cw; c.height = ch;
  const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0, cw, ch);
  const d = ctx.getImageData(0, 0, cw, ch).data;
  const g = new Float32Array(cw * ch);
  for (let i = 0; i < cw * ch; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < ch - 1; y++) for (let x = 1; x < cw - 1; x++) {
    const i = y * cw + x;
    const l = g[i - 1] + g[i + 1] + g[i - cw] + g[i + cw] - 4 * g[i];
    sum += l; sum2 += l * l; n++;
  }
  return n ? sum2 / n - (sum / n) ** 2 : 0;
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
const r1 = (v: number) => Math.round(v * 10) / 10;
const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const WEIGHTS: Record<Check["key"], number> = { readability: 0.3, productVisibility: 0.25, composition: 0.2, visualQuality: 0.15, brandConsistency: 0.1 };
export function overall(checks: Check[]) {
  const used = checks.filter((c) => c.score !== null);
  const w = used.reduce((s, c) => s + WEIGHTS[c.key], 0);
  return w ? clamp(used.reduce((s, c) => s + c.score! * WEIGHTS[c.key], 0) / w) : null;
}

/**
 * Score a banner made in the template studio. `bg` is the same banner rendered without text,
 * used to measure the real colour behind every text.
 */
export function scoreBanner(layout: Layout, bg: HTMLCanvasElement, format: FormatKey, opts: { productImg: HTMLImageElement | null; palette: string[]; brandColors: string[]; hasLogo: boolean; brandName: boolean; headline: string }): ScoreResult {
  const { w, h } = FORMATS[format];
  const ctx = bg.getContext("2d", { willReadFrequently: true })!;
  const sx = bg.width / w;
  const minSide = Math.min(w, h);
  const checks: Check[] = [];

  // Readability: contrast of every text against what is really behind it, and text size.
  {
    const tips: Msg[] = [], facts: Msg[] = [];
    let worst = 21, score = 100;
    for (const t of layout.texts) {
      const behind = t.bg ? parseColor(t.bg) : avgColor(ctx, t.box.x * sx, t.box.y * sx, t.box.w * sx, t.box.h * sx);
      const cr = contrast(parseColor(t.color), behind);
      worst = Math.min(worst, cr);
      const need = t.size / minSide >= 0.05 ? 3 : 4.5; // large text needs less contrast (WCAG)
      if (cr < need) { score -= t.role === "headline" || t.role === "price" ? 30 : 15; tips.push({ key: "Text \"{role}\" has low contrast ({cr}:1). Use a darker or lighter colour or a plain background behind it.", vars: { role: t.role, cr: r1(cr) } }); }
      if (t.size / minSide < 0.022 && t.role !== "brand") { score -= 10; tips.push({ key: "Text \"{role}\" is very small and hard to read on a phone.", vars: { role: t.role } }); }
    }
    const words = opts.headline.trim().split(/\s+/).filter(Boolean).length;
    if (words > 8) { score -= 10; tips.push({ key: "The headline has {n} words. Up to 6–8 words read best in a feed.", vars: { n: words } }); }
    if (!layout.texts.some((t) => t.role === "headline")) { score -= 20; tips.push({ key: "Add a short headline." }); }
    if (layout.texts.length) facts.push({ key: "Lowest text contrast: {cr}:1 (4.5:1 or more is recommended).", vars: { cr: r1(worst) } });
    checks.push({ key: "readability", score: clamp(score), tips, facts });
  }

  // Product visibility: share of the banner taken by the product.
  {
    const tips: Msg[] = [], facts: Msg[] = [];
    let score: number;
    if (!layout.product) { score = 30; tips.push({ key: "Add a product photo: ads with the product visible usually work better." }); }
    else {
      const share = (layout.product.w * layout.product.h) / (w * h) * 100;
      facts.push({ key: "The product takes {pct}% of the banner.", vars: { pct: r1(share) } });
      score = share >= 18 && share <= 60 ? 100 : share < 18 ? 40 + share * 3 : 100 - (share - 60) * 2;
      if (share < 18) tips.push({ key: "The product is small. Use a photo with less empty space around the product or a template with a bigger product area." });
      const covered = layout.texts.reduce((s, t) => s + overlap(t.box, layout.product!), 0) / (layout.product.w * layout.product.h) * 100;
      if (covered > 8) { score -= 20; tips.push({ key: "Text covers {pct}% of the product.", vars: { pct: r1(covered) } }); }
    }
    checks.push({ key: "productVisibility", score: clamp(score), tips, facts });
  }

  // Composition: safe margins, number of elements, overlaps between texts.
  {
    const tips: Msg[] = [], facts: Msg[] = [];
    let score = 100;
    const safe = minSide * 0.035;
    const out = layout.texts.filter((t) => t.box.x < safe || t.box.y < safe || t.box.x + t.box.w > w - safe || t.box.y + t.box.h > h - safe);
    if (out.length) { score -= 15 * out.length; tips.push({ key: "{n} element(s) are too close to the edge and may be cut off by the app.", vars: { n: out.length } }); }
    const n = layout.texts.length + (layout.logo ? 1 : 0);
    facts.push({ key: "{n} text and logo elements.", vars: { n } });
    if (n > 6) { score -= (n - 6) * 8; tips.push({ key: "Too many elements. Remove the least important text." }); }
    let clash = 0;
    for (let i = 0; i < layout.texts.length; i++) for (let j = i + 1; j < layout.texts.length; j++) if (overlap(layout.texts[i].box, layout.texts[j].box) > 4) clash++;
    if (clash) { score -= 20 * clash; tips.push({ key: "Some texts overlap each other. Shorten the texts." }); }
    if (format === "story") {
      const inUi = layout.texts.filter((t) => t.box.y < h * 0.12 || t.box.y + t.box.h > h * 0.86).filter((t) => t.role !== "brand");
      if (inUi.length) { score -= 10; tips.push({ key: "In stories the top and bottom 13% are covered by the app's buttons. Keep text out of these areas." }); }
    }
    checks.push({ key: "composition", score: clamp(score), tips, facts });
  }

  // Visual quality: is the photo stretched beyond its real resolution, and is it sharp?
  {
    const tips: Msg[] = [], facts: Msg[] = [];
    let score: number | null = null;
    if (layout.product && opts.productImg) {
      const up = layout.product.scale;
      const sharp = sharpness(opts.productImg, opts.productImg.naturalWidth, opts.productImg.naturalHeight);
      facts.push({ key: "Photo is shown at {pct}% of its real size.", vars: { pct: Math.round(up * 100) } });
      score = up <= 1 ? 100 : up <= 1.5 ? 80 : up <= 2.5 ? 55 : 30;
      if (up > 1.5) tips.push({ key: "The product photo is enlarged {x}× and may look blurry. Upload a larger photo.", vars: { x: r1(up) } });
      if (sharp < 60) { score -= 20; tips.push({ key: "The product photo looks blurry. Use a sharper photo." }); }
    } else tips.push({ key: "Add a product photo to check its quality." });
    checks.push({ key: "visualQuality", score: score === null ? null : clamp(score), tips, facts });
  }

  // Brand consistency: brand colours and logo / name.
  {
    const tips: Msg[] = [], facts: Msg[] = [];
    let score: number | null = null;
    if (opts.brandColors.length) {
      const used = opts.brandColors.filter((b) => opts.palette.some((p) => p.toLowerCase() === b.toLowerCase())).length;
      score = 40 + (used / opts.brandColors.length) * 40 + (opts.hasLogo ? 20 : opts.brandName ? 10 : 0);
      facts.push({ key: "{n} of {m} brand colours used.", vars: { n: used, m: opts.brandColors.length } });
      if (used < opts.brandColors.length) tips.push({ key: "Turn on \"Use brand colours\" to keep all ads recognisable." });
      if (!opts.hasLogo) tips.push({ key: "Add your logo in the Brand kit." });
    } else tips.push({ key: "Save your brand colours and logo in the Brand kit to check brand consistency." });
    checks.push({ key: "brandConsistency", score: score === null ? null : clamp(score), tips, facts });
  }
  return { overall: overall(checks), checks };
}

/** Score any uploaded ad image: only what can be measured from pixels. */
export function scoreImage(img: HTMLImageElement, format: FormatKey, brandColors: string[]): ScoreResult | null {
  const W = img.naturalWidth, H = img.naturalHeight;
  if (!W || !H) return null; // e.g. an SVG without a size
  const target = FORMATS[format];
  const s = Math.min(1, 300 / Math.max(W, H));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(W * s)); c.height = Math.max(1, Math.round(H * s));
  const ctx = c.getContext("2d", { willReadFrequently: true })!; ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let sum = 0, sum2 = 0, rg = 0, rg2 = 0, yb = 0, yb2 = 0;
  const n = d.length / 4;
  const brand = brandColors.map(parseColor);
  let brandPx = 0;
  for (let i = 0; i < d.length; i += 4) {
    const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    sum += L; sum2 += L * L;
    const a = d[i] - d[i + 1], b = 0.5 * (d[i] + d[i + 1]) - d[i + 2];
    rg += a; rg2 += a * a; yb += b; yb2 += b * b;
    if (brand.some((bc) => Math.abs(bc[0] - d[i]) + Math.abs(bc[1] - d[i + 1]) + Math.abs(bc[2] - d[i + 2]) < 60)) brandPx++;
  }
  const mean = sum / n, sd = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  const colorful = Math.sqrt(Math.max(0, rg2 / n - (rg / n) ** 2) + Math.max(0, yb2 / n - (yb / n) ** 2)) + 0.3 * Math.sqrt((rg / n) ** 2 + (yb / n) ** 2);
  const sharp = sharpness(img, W, H);
  const checks: Check[] = [];
  {
    const tips: Msg[] = [], facts: Msg[] = [];
    let score = 100;
    facts.push({ key: "Size {w}×{h} px; recommended for this format: {tw}×{th} px.", vars: { w: W, h: H, tw: target.w, th: target.h } });
    if (W < target.w * 0.75) { score -= 30; tips.push({ key: "The image is smaller than recommended and may look blurry on the platform." }); }
    const ar = W / H, tar = target.w / target.h;
    if (Math.abs(ar - tar) / tar > 0.05) { score -= 20; tips.push({ key: "The proportions do not match the chosen format; the platform will crop the image." }); }
    if (sharp < 60) { score -= 20; tips.push({ key: "The image looks blurry." }); }
    if (mean < 45) { score -= 10; tips.push({ key: "The image is very dark." }); }
    if (mean > 235) { score -= 10; tips.push({ key: "The image is very bright and may look washed out." }); }
    if (sd < 30) { score -= 15; tips.push({ key: "Low contrast: the ad may not stand out in a feed." }); }
    facts.push({ key: "Brightness {b}/255, contrast {c}, colourfulness {col}.", vars: { b: Math.round(mean), c: Math.round(sd), col: Math.round(colorful) } });
    checks.push({ key: "visualQuality", score: clamp(score), tips, facts });
  }
  checks.push({ key: "readability", score: null, tips: [{ key: "Text readability needs the AI review (the image has to be \"read\")." }], facts: [] });
  checks.push({ key: "composition", score: null, tips: [{ key: "Composition needs the AI review." }], facts: [] });
  checks.push({ key: "productVisibility", score: null, tips: [{ key: "Product visibility needs the AI review." }], facts: [] });
  if (brand.length) {
    const share = (brandPx / n) * 100;
    checks.push({ key: "brandConsistency", score: clamp(share >= 8 ? 100 : 40 + share * 7.5), tips: share < 8 ? [{ key: "Brand colours are barely used in this image." }] : [], facts: [{ key: "Brand colours cover {pct}% of the image.", vars: { pct: r1(share) } }] });
  } else checks.push({ key: "brandConsistency", score: null, tips: [{ key: "Save your brand colours and logo in the Brand kit to check brand consistency." }], facts: [] });
  return { overall: overall(checks), checks };
}
