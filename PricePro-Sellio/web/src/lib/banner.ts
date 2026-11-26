/**
 * Banner templates drawn on a <canvas> in the browser: no AI and no limits. The product photo is
 * placed as it is (never redrawn), so the product always looks exactly like the real one.
 * Every template reports where it put text and the product, which the Creative Score measures.
 */
export type FormatKey = "post" | "portrait" | "story" | "landscape" | "telegram" | "marketplace";
export const FORMATS: Record<FormatKey, { label: string; w: number; h: number; platforms: string }> = {
  post: { label: "Square post", w: 1080, h: 1080, platforms: "Instagram, Facebook, Telegram" },
  portrait: { label: "Portrait post", w: 1080, h: 1350, platforms: "Instagram feed" },
  story: { label: "Story / Reels", w: 1080, h: 1920, platforms: "Instagram, Telegram, TikTok" },
  landscape: { label: "Link / feed banner", w: 1200, h: 628, platforms: "Facebook, Google" },
  telegram: { label: "Telegram post 16:9", w: 1280, h: 720, platforms: "Telegram, YouTube" },
  marketplace: { label: "Marketplace card", w: 900, h: 1200, platforms: "Uzum, Wildberries, OLX" },
};

export type Style = "minimal" | "modern" | "premium" | "luxury" | "promo" | "seasonal";
export type Palette = { primary: string; secondary: string; accent: string; bg: string; text: string };
export type Fonts = { heading: string; body: string };
export type Content = {
  headline: string; subline: string; price: string; oldPrice: string; badge: string; cta: string; brandName: string;
  product: HTMLImageElement | null; logo: HTMLImageElement | null;
};
export type Box = { x: number; y: number; w: number; h: number };
export type TextMark = { role: "headline" | "subline" | "price" | "badge" | "cta" | "brand"; box: Box; color: string; size: number; bg?: string };
export type Layout = { texts: TextMark[]; product: (Box & { scale: number }) | null; logo: Box | null };
type Ctx = CanvasRenderingContext2D;
type Draw = (ctx: Ctx, w: number, h: number, c: Content, p: Palette, f: Fonts) => Layout;
export type Template = { key: string; name: string; style: Style; tags: string[]; palette: Palette; fonts: Fonts; draw: Draw };

// ------------------------------------------------------------------ helpers
const shape = (w: number, h: number) => (h / w > 1.25 ? "tall" : w / h > 1.25 ? "wide" : "square");

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Product photo, "contain" fit inside the box (never cropped), optional card and shadow. */
function product(ctx: Ctx, img: HTMLImageElement | null, box: Box, opts: { card?: string; radius?: number; shadow?: boolean } = {}): Layout["product"] {
  if (!img) return null;
  const pad = opts.card ? Math.min(box.w, box.h) * 0.06 : 0;
  if (opts.card) {
    ctx.save();
    if (opts.shadow) { ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = box.w * 0.06; ctx.shadowOffsetY = box.w * 0.02; }
    ctx.fillStyle = opts.card;
    roundRect(ctx, box.x, box.y, box.w, box.h, opts.radius ?? box.w * 0.06);
    ctx.fill();
    ctx.restore();
  }
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const s = Math.min((box.w - pad * 2) / iw, (box.h - pad * 2) / ih);
  const dw = iw * s, dh = ih * s;
  const x = box.x + (box.w - dw) / 2, y = box.y + (box.h - dh) / 2;
  ctx.save();
  if (opts.card) { roundRect(ctx, box.x + pad / 2, box.y + pad / 2, box.w - pad, box.h - pad, (opts.radius ?? box.w * 0.06) * 0.7); ctx.clip(); }
  else if (opts.shadow) { ctx.shadowColor = "rgba(0,0,0,0.28)"; ctx.shadowBlur = dw * 0.08; ctx.shadowOffsetY = dw * 0.03; }
  ctx.drawImage(img, x, y, dw, dh);
  ctx.restore();
  return { x, y, w: dw, h: dh, scale: s };
}

function lines(ctx: Ctx, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${word}` : word;
      if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
    }
    if (line) out.push(line);
  }
  return out;
}

/** Text that shrinks until it fits `maxLines` lines in `maxW`. Returns the box it used. */
function text(ctx: Ctx, s: string, o: { x: number; y: number; maxW: number; size: number; font: string; weight?: number; color: string; align?: CanvasTextAlign; maxLines?: number; lh?: number; role: TextMark["role"]; marks: TextMark[]; bg?: string; upper?: boolean; minSize?: number }) {
  if (!s.trim()) return 0;
  const str = o.upper ? s.toUpperCase() : s;
  let size = o.size, ls: string[] = [];
  const min = o.minSize ?? o.size * 0.5;
  for (;;) {
    ctx.font = `${o.weight ?? 700} ${size}px "${o.font}", Inter, sans-serif`;
    ls = lines(ctx, str, o.maxW);
    if ((ls.length <= (o.maxLines ?? 3) && ls.every((l) => ctx.measureText(l).width <= o.maxW)) || size <= min) break;
    size *= 0.92;
  }
  ls = ls.slice(0, o.maxLines ?? 3);
  const lh = size * (o.lh ?? 1.15);
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align ?? "left";
  ctx.textBaseline = "top";
  let maxLine = 0;
  ls.forEach((l, i) => { ctx.fillText(l, o.x, o.y + i * lh); maxLine = Math.max(maxLine, ctx.measureText(l).width); });
  const bx = o.align === "center" ? o.x - maxLine / 2 : o.align === "right" ? o.x - maxLine : o.x;
  o.marks.push({ role: o.role, box: { x: bx, y: o.y, w: maxLine, h: ls.length * lh }, color: o.color, size, bg: o.bg });
  return ls.length * lh;
}

function pill(ctx: Ctx, s: string, o: { x: number; y: number; size: number; font: string; bg: string; color: string; align?: "left" | "center" | "right"; role: TextMark["role"]; marks: TextMark[]; radius?: number; upper?: boolean }) {
  if (!s.trim()) return { w: 0, h: 0 };
  const str = o.upper ? s.toUpperCase() : s;
  ctx.font = `700 ${o.size}px "${o.font}", Inter, sans-serif`;
  const tw = ctx.measureText(str).width, padX = o.size * 0.9, padY = o.size * 0.55;
  const w = tw + padX * 2, h = o.size + padY * 2;
  const x = o.align === "center" ? o.x - w / 2 : o.align === "right" ? o.x - w : o.x;
  ctx.fillStyle = o.bg;
  roundRect(ctx, x, o.y, w, h, o.radius ?? h / 2);
  ctx.fill();
  ctx.fillStyle = o.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(str, x + w / 2, o.y + h / 2 + o.size * 0.04);
  o.marks.push({ role: o.role, box: { x, y: o.y, w, h }, color: o.color, size: o.size, bg: o.bg });
  return { w, h };
}

function priceBlock(ctx: Ctx, c: Content, o: { x: number; y: number; size: number; font: string; color: string; oldColor: string; align?: CanvasTextAlign; marks: TextMark[] }) {
  if (!c.price.trim()) return 0;
  let h = 0;
  if (c.oldPrice.trim()) {
    ctx.font = `500 ${o.size * 0.45}px "${o.font}", Inter, sans-serif`;
    ctx.fillStyle = o.oldColor; ctx.textAlign = o.align ?? "left"; ctx.textBaseline = "top";
    ctx.fillText(c.oldPrice, o.x, o.y);
    const tw = ctx.measureText(c.oldPrice).width;
    const sx = o.align === "center" ? o.x - tw / 2 : o.align === "right" ? o.x - tw : o.x;
    ctx.strokeStyle = o.oldColor; ctx.lineWidth = Math.max(2, o.size * 0.04);
    ctx.beginPath(); ctx.moveTo(sx, o.y + o.size * 0.25); ctx.lineTo(sx + tw, o.y + o.size * 0.25); ctx.stroke();
    h = o.size * 0.6;
  }
  text(ctx, c.price, { x: o.x, y: o.y + h, maxW: 10_000, size: o.size, font: o.font, weight: 800, color: o.color, align: o.align, maxLines: 1, role: "price", marks: o.marks });
  return h + o.size * 1.15;
}

function logoOrName(ctx: Ctx, c: Content, o: { x: number; y: number; h: number; font: string; color: string; align?: CanvasTextAlign; marks: TextMark[] }): Box | null {
  if (c.logo) {
    const iw = c.logo.naturalWidth, ih = c.logo.naturalHeight;
    const lw = (iw / ih) * o.h;
    const x = o.align === "center" ? o.x - lw / 2 : o.align === "right" ? o.x - lw : o.x;
    ctx.drawImage(c.logo, x, o.y, lw, o.h);
    return { x, y: o.y, w: lw, h: o.h };
  }
  if (c.brandName.trim()) text(ctx, c.brandName, { x: o.x, y: o.y, maxW: 10_000, size: o.h * 0.6, font: o.font, weight: 700, color: o.color, align: o.align, maxLines: 1, role: "brand", marks: o.marks, upper: true });
  return null;
}

function lin(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function dots(ctx: Ctx, w: number, h: number, color: string, n: number, seed = 7, rMax = 0.006) {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(rnd() * w, rnd() * h, (0.3 + rnd()) * Math.min(w, h) * rMax, 0, Math.PI * 2); ctx.fill(); }
}

/** Standard arrangement used by most templates: product zone + text zone depending on the format. */
function zones(w: number, h: number, m: number) {
  const sh = shape(w, h);
  if (sh === "wide") return { sh, product: { x: w * 0.52, y: m, w: w * 0.48 - m, h: h - m * 2 }, text: { x: m, y: m * 2.2, w: w * 0.48 - m * 1.2, h: h - m * 3.2 } };
  if (sh === "tall") return { sh, product: { x: m, y: h * 0.16, w: w - m * 2, h: h * 0.44 }, text: { x: m, y: h * 0.62, w: w - m * 2, h: h * 0.38 - m } };
  return { sh, product: { x: w * 0.17, y: h * 0.12, w: w * 0.66, h: h * 0.4 }, text: { x: m, y: h * 0.555, w: w - m * 2, h: h * 0.445 - m } };
}

/** Text column used inside a zone (headline, subline, price, CTA). Shrinks until it fits the zone height. */
function textColumn(ctx: Ctx, c: Content, z: Box, o: { s: number; f: Fonts; color: string; sub: string; price: string; old: string; ctaBg: string; ctaColor: string; align: CanvasTextAlign; marks: TextMark[]; headScale?: number; upper?: boolean; weight?: number }) {
  const cx = o.align === "center" ? z.x + z.w / 2 : z.x;
  const column = (s: number, marks: TextMark[], top = z.y) => {
    let y = top;
    y += text(ctx, c.headline, { x: cx, y, maxW: z.w, size: s * (o.headScale ?? 1), font: o.f.heading, weight: o.weight ?? 800, color: o.color, align: o.align, maxLines: 3, role: "headline", marks, upper: o.upper });
    if (c.headline.trim()) y += s * 0.25;
    const sub = text(ctx, c.subline, { x: cx, y, maxW: z.w, size: s * 0.42, font: o.f.body, weight: 500, color: o.sub, align: o.align, maxLines: 2, role: "subline", marks, minSize: s * 0.3 });
    if (sub) y += sub + s * 0.3;
    const pr = priceBlock(ctx, c, { x: cx, y, size: s * 0.75, font: o.f.heading, color: o.price, oldColor: o.old, align: o.align, marks });
    if (pr) y += pr + s * 0.2;
    if (c.cta.trim()) y += pill(ctx, c.cta, { x: cx, y, size: s * 0.36, font: o.f.body, bg: o.ctaBg, color: o.ctaColor, align: o.align === "center" ? "center" : "left", role: "cta", marks }).h;
    return y - top;
  };
  // Measure invisibly first, then draw at the largest size that fits.
  // Start a bit larger than the base size so short texts fill the space.
  let s = o.s * 1.3, used = 0;
  for (let k = 0; k < 14; k++) {
    ctx.save(); ctx.globalAlpha = 0;
    used = column(s, []);
    ctx.restore();
    if (used <= z.h) break;
    s *= Math.max(0.75, Math.min(0.95, Math.sqrt(z.h / used)));
  }
  // A tall text area (side column of wide banners) is centred vertically.
  column(s, o.marks, z.h > z.w * 0.9 ? z.y + Math.max(0, (z.h - used) / 2) : z.y);
}

// ------------------------------------------------------------------ templates
const T: Template[] = [
  {
    key: "clean-studio", name: "Clean studio", style: "minimal", tags: ["all", "electronics", "beauty", "home"],
    palette: { primary: "#4f46e5", secondary: "#e0e7ff", accent: "#111827", bg: "#f8fafc", text: "#0f172a" }, fonts: { heading: "Inter", body: "Inter" },
    draw(ctx, w, h, c, p, f) {
      const m = Math.min(w, h) * 0.07, marks: TextMark[] = [];
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = p.secondary; ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.36, w * 0.42, Math.min(h * 0.3, w * 0.42), 0, 0, Math.PI * 2); ctx.fill();
      const z = zones(w, h, m);
      const prod = product(ctx, c.product, z.product, { shadow: true });
      const logo = logoOrName(ctx, c, { x: m, y: m * 0.7, h: Math.min(w, h) * 0.05, font: f.heading, color: p.text, marks });
      if (c.badge.trim()) pill(ctx, c.badge, { x: w - m, y: m * 0.6, size: Math.min(w, h) * 0.032, font: f.body, bg: p.primary, color: "#fff", align: "right", role: "badge", marks });
      textColumn(ctx, c, z.text, { s: Math.min(w, h) * 0.075, f, color: p.text, sub: "#475569", price: p.primary, old: "#94a3b8", ctaBg: p.accent, ctaColor: "#fff", align: z.sh === "wide" ? "left" : "center", marks });
      return { texts: marks, product: prod, logo };
    },
  },
  {
    key: "bold-sale", name: "Bold sale", style: "promo", tags: ["all", "fashion", "electronics", "sale"],
    palette: { primary: "#e11d48", secondary: "#fde047", accent: "#111827", bg: "#e11d48", text: "#ffffff" }, fonts: { heading: "Bebas Neue", body: "Inter" },
    draw(ctx, w, h, c, p, f) {
      const m = Math.min(w, h) * 0.06, marks: TextMark[] = [];
      ctx.fillStyle = p.primary; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      for (let i = -h; i < w; i += Math.min(w, h) * 0.09) { ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, 0); ctx.lineTo(i + h + Math.min(w, h) * 0.035, 0); ctx.lineTo(i + Math.min(w, h) * 0.035, h); ctx.fill(); }
      const z = zones(w, h, m);
      const prod = product(ctx, c.product, z.product, { card: "#ffffff", shadow: true, radius: Math.min(w, h) * 0.04 });
      const logo = logoOrName(ctx, c, { x: m, y: m * 0.6, h: Math.min(w, h) * 0.05, font: f.body, color: "#fff", marks });
      if (c.badge.trim()) {
        const r = Math.min(w, h) * 0.11, bx = z.sh === "wide" ? w * 0.52 : w - m - r, by = z.sh === "wide" ? m + r * 0.6 : z.product.y + r * 0.2;
        ctx.fillStyle = p.secondary; ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
        text(ctx, c.badge, { x: bx, y: by - r * 0.4, maxW: r * 1.6, size: r * 0.7, font: f.heading, weight: 700, color: p.accent, align: "center", maxLines: 1, role: "badge", marks, bg: p.secondary });
      }
      textColumn(ctx, c, z.text, { s: Math.min(w, h) * 0.11, f, color: p.text, sub: "rgba(255,255,255,0.88)", price: p.secondary, old: "rgba(255,255,255,0.7)", ctaBg: p.accent, ctaColor: "#fff", align: z.sh === "wide" ? "left" : "center", marks, upper: true, weight: 400 });
      return { texts: marks, product: prod, logo };
    },
  },
  {
    key: "dark-premium", name: "Dark premium", style: "premium", tags: ["all", "electronics", "beauty", "jewelry"],
    palette: { primary: "#d4af37", secondary: "#1f2937", accent: "#d4af37", bg: "#0b0f19", text: "#f8fafc" }, fonts: { heading: "Playfair Display", body: "Inter" },
    draw(ctx, w, h, c, p, f) {
      const m = Math.min(w, h) * 0.07, marks: TextMark[] = [];
      ctx.fillStyle = lin(ctx, 0, 0, w, h, [[0, p.bg], [1, p.secondary]]); ctx.fillRect(0, 0, w, h);
      const z = zones(w, h, m);
      const g = ctx.createRadialGradient(z.product.x + z.product.w / 2, z.product.y + z.product.h / 2, 0, z.product.x + z.product.w / 2, z.product.y + z.product.h / 2, z.product.w * 0.7);
      g.addColorStop(0, "rgba(212,175,55,0.28)"); g.addColorStop(1, "rgba(212,175,55,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const prod = product(ctx, c.product, z.product, { shadow: true });
      ctx.strokeStyle = p.primary; ctx.lineWidth = Math.max(2, w * 0.002); ctx.strokeRect(m * 0.5, m * 0.5, w - m, h - m);
      const logo = logoOrName(ctx, c, { x: w / 2, y: m * 0.85, h: Math.min(w, h) * 0.045, font: f.heading, color: p.primary, align: "center", marks });
      if (c.badge.trim()) pill(ctx, c.badge, { x: w - m, y: m * 0.85, size: Math.min(w, h) * 0.028, font: f.body, bg: p.primary, color: p.bg, align: "right", role: "badge", marks });
      textColumn(ctx, c, z.text, { s: Math.min(w, h) * 0.072, f, color: p.text, sub: "#cbd5e1", price: p.primary, old: "#94a3b8", ctaBg: p.primary, ctaColor: p.bg, align: z.sh === "wide" ? "left" : "center", marks, weight: 700 });
      return { texts: marks, product: prod, logo };
    },
  },
  {
    key: "split", name: "Split colour", style: "modern", tags: ["all", "fashion", "food", "home"],
    palette: { primary: "#0ea5e9", secondary: "#f1f5f9", accent: "#0f172a", bg: "#ffffff", text: "#ffffff" }, fonts: { heading: "Montserrat", body: "Inter" },
    draw(ctx, w, h, c, p, f) {
      const m = Math.min(w, h) * 0.065, marks: TextMark[] = [];
      const sh = shape(w, h);
      ctx.fillStyle = p.secondary; ctx.fillRect(0, 0, w, h);
      let tz: Box, pz: Box;
      if (sh === "wide") { ctx.fillStyle = p.primary; ctx.fillRect(0, 0, w * 0.5, h); tz = { x: m, y: m * 1.6, w: w * 0.5 - m * 2, h: h - m * 2 }; pz = { x: w * 0.53, y: m, w: w * 0.44, h: h - m * 2 }; }
      else { ctx.fillStyle = p.primary; ctx.fillRect(0, h * 0.56, w, h * 0.44); tz = { x: m, y: h * 0.6, w: w - m * 2, h: h * 0.38 }; pz = { x: m, y: m * 1.4, w: w - m * 2, h: h * 0.5 }; }
      const prod = product(ctx, c.product, pz, { shadow: true });
      const logo = logoOrName(ctx, c, { x: m, y: m * 0.5, h: Math.min(w, h) * 0.045, font: f.heading, color: sh === "wide" ? "#fff" : p.accent, marks });
      if (c.badge.trim()) pill(ctx, c.badge, { x: w - m, y: m * 0.5, size: Math.min(w, h) * 0.03, font: f.body, bg: p.accent, color: "#fff", align: "right", role: "badge", marks });
      textColumn(ctx, c, tz, { s: Math.min(w, h) * 0.07, f, color: p.text, sub: "rgba(255,255,255,0.9)", price: "#ffffff", old: "rgba(255,255,255,0.7)", ctaBg: p.accent, ctaColor: "#fff", align: "left", marks });
      return { texts: marks, product: prod, logo };
    },
  },
  {
    key: "marketplace-card", name: "Marketplace card", style: "minimal", tags: ["all", "marketplace", "electronics", "fashion"],
    palette: { primary: "#7c3aed", secondary: "#ede9fe", accent: "#16a34a", bg: "#ffffff", text: "#111827" }, fonts: { heading: "Inter", body: "Inter" },
    draw(ctx, w, h, c, p, f) {
      const m = Math.min(w, h) * 0.05, marks: TextMark[] = [];
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, w, h);
      const sh = shape(w, h);
      const pz = sh === "wide" ? { x: m, y: m, w: w * 0.55, h: h - m * 2 } : { x: m, y: m, w: w - m * 2, h: h * 0.62 };
      ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = Math.max(2, w * 0.002); roundRect(ctx, pz.x, pz.y, pz.w, pz.h, m * 0.6); ctx.stroke();
      const prod = product(ctx, c.product, { x: pz.x + m * 0.4, y: pz.y + m * 0.4, w: pz.w - m * 0.8, h: pz.h - m * 0.8 });
      if (c.badge.trim()) pill(ctx, c.badge, { x: pz.x + m * 0.5, y: pz.y + m * 0.5, size: Math.min(w, h) * 0.035, font: f.body, bg: p.primary, color: "#fff", role: "badge", marks, radius: m * 0.3 });
      const tz = sh === "wide" ? { x: w * 0.55 + m * 2, y: m * 1.5, w: w * 0.45 - m * 3, h: h - m * 3 } : { x: m, y: pz.y + pz.h + m * 0.8, w: w - m * 2, h: h - pz.h - m * 3 };
      let y = tz.y;
      y += priceBlock(ctx, c, { x: tz.x, y, size: Math.min(w, h) * 0.085, font: f.heading, color: p.accent, oldColor: "#9ca3af", marks }) + m * 0.2;
      y += text(ctx, c.headline, { x: tz.x, y, maxW: tz.w, size: Math.min(w, h) * 0.05, font: f.heading, weight: 700, color: p.text, maxLines: 2, role: "headline", marks }) + m * 0.2;
      y += text(ctx, c.subline, { x: tz.x, y, maxW: tz.w, size: Math.min(w, h) * 0.032, font: f.body, weight: 500, color: "#6b7280", maxLines: 2, role: "subline", marks }) + m * 0.3;
      if (c.cta.trim()) pill(ctx, c.cta, { x: tz.x, y, size: Math.min(w, h) * 0.032, font: f.body, bg: p.primary, color: "#fff", role: "cta", marks, radius: m * 0.3 });
      const logo = logoOrName(ctx, c, { x: w - m, y: h - m - Math.min(w, h) * 0.04, h: Math.min(w, h) * 0.04, font: f.heading, color: "#9ca3af", align: "right", marks });
      return { texts: marks, product: prod, logo };
    },
  },
  {
    key: "luxury-frame", name: "Luxury frame", style: "luxury", tags: ["all", "jewelry", "beauty", "fashion"],
    palette: { primary: "#a16207", secondary: "#f5efe6", accent: "#1c1917", bg: "#f5efe6", text: "#1c1917" }, fonts: { heading: "Playfair Display", body: "Nunito" },
    draw(ctx, w, h, c, p, f) {
      const m = Math.min(w, h) * 0.08, marks: TextMark[] = [];
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = p.primary; ctx.lineWidth = Math.max(2, w * 0.0025);
      ctx.strokeRect(m * 0.45, m * 0.45, w - m * 0.9, h - m * 0.9);
      ctx.lineWidth = Math.max(1, w * 0.001); ctx.strokeRect(m * 0.6, m * 0.6, w - m * 1.2, h - m * 1.2);
      const z = zones(w, h, m);
      const prod = product(ctx, c.product, z.product, { shadow: true });
      const logo = logoOrName(ctx, c, { x: w / 2, y: m * 0.85, h: Math.min(w, h) * 0.04, font: f.heading, color: p.primary, align: "center", marks });
      if (c.badge.trim()) text(ctx, c.badge, { x: w / 2, y: z.product.y + z.product.h + m * 0.05, maxW: w * 0.6, size: Math.min(w, h) * 0.028, font: f.body, weight: 700, color: p.primary, align: "center", maxLines: 1, role: "badge", marks, upper: true });
      textColumn(ctx, c, { ...z.text, y: z.text.y + (z.sh === "wide" ? 0 : m * 0.25) }, { s: Math.min(w, h) * 0.07, f, color: p.text, sub: "#57534e", price: p.primary, old: "#a8a29e", ctaBg: p.accent, ctaColor: p.bg, align: z.sh === "wide" ? "left" : "center", marks, weight: 700 });
      return { texts: marks, product: prod, logo };
    },
  },
  {
    key: "gradient-pop", name: "Gradient pop", style: "modern", tags: ["all", "beauty", "food", "kids"],
    palette: { primary: "#8b5cf6", secondary: "#ec4899", accent: "#ffffff", bg: "#8b5cf6", text: "#ffffff" }, fonts: { heading: "Poppins", body: "Poppins" },
    draw(ctx, w, h, c, p, f) {
      const m = Math.min(w, h) * 0.07, marks: TextMark[] = [];
      ctx.fillStyle = lin(ctx, 0, 0, w, h, [[0, p.primary], [1, p.secondary]]); ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath(); ctx.arc(w * 0.85, h * 0.12, Math.min(w, h) * 0.25, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(w * 0.1, h * 0.9, Math.min(w, h) * 0.2, 0, Math.PI * 2); ctx.fill();
      const z = zones(w, h, m);
      const prod = product(ctx, c.product, z.product, { card: "rgba(255,255,255,0.92)", shadow: true, radius: Math.min(w, h) * 0.05 });
      const logo = logoOrName(ctx, c, { x: m, y: m * 0.6, h: Math.min(w, h) * 0.045, font: f.heading, color: "#fff", marks });
      if (c.badge.trim()) pill(ctx, c.badge, { x: w - m, y: m * 0.6, size: Math.min(w, h) * 0.032, font: f.body, bg: "#fff", color: p.primary, align: "right", role: "badge", marks });
      textColumn(ctx, c, z.text, { s: Math.min(w, h) * 0.075, f, color: p.text, sub: "rgba(255,255,255,0.9)", price: "#fff", old: "rgba(255,255,255,0.7)", ctaBg: "#fff", ctaColor: p.primary, align: z.sh === "wide" ? "left" : "center", marks });
      return { texts: marks, product: prod, logo };
    },
  },
  {
    key: "new-year", name: "New Year", style: "seasonal", tags: ["new_year", "all", "gifts"],
    palette: { primary: "#b91c1c", secondary: "#0b3d2e", accent: "#facc15", bg: "#0b3d2e", text: "#ffffff" }, fonts: { heading: "Montserrat", body: "Inter" },
    draw(ctx, w, h, c, p, f) {
      const m = Math.min(w, h) * 0.07, marks: TextMark[] = [];
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, p.secondary], [1, "#06261c"]]); ctx.fillRect(0, 0, w, h);
      dots(ctx, w, h, "rgba(255,255,255,0.7)", 120, 11);
      ctx.fillStyle = p.primary; ctx.fillRect(0, 0, w * 0.04, h); ctx.fillRect(w * 0.96, 0, w * 0.04, h);
      const z = zones(w, h, m);
      const prod = product(ctx, c.product, z.product, { card: "#ffffff", shadow: true, radius: Math.min(w, h) * 0.04 });
      const logo = logoOrName(ctx, c, { x: w / 2, y: m * 0.5, h: Math.min(w, h) * 0.045, font: f.heading, color: p.accent, align: "center", marks });
      if (c.badge.trim()) pill(ctx, c.badge, { x: z.product.x + z.product.w, y: z.product.y - Math.min(w, h) * 0.02, size: Math.min(w, h) * 0.034, font: f.body, bg: p.primary, color: "#fff", align: "right", role: "badge", marks });
      textColumn(ctx, c, z.text, { s: Math.min(w, h) * 0.072, f, color: p.text, sub: "rgba(255,255,255,0.88)", price: p.accent, old: "rgba(255,255,255,0.6)", ctaBg: p.primary, ctaColor: "#fff", align: z.sh === "wide" ? "left" : "center", marks });
      return { texts: marks, product: prod, logo };
    },
  },
  {
    key: "navruz", name: "Navruz spring", style: "seasonal", tags: ["navruz", "march8", "all", "gifts"],
    palette: { primary: "#16a34a", secondary: "#fdf2f8", accent: "#db2777", bg: "#f0fdf4", text: "#14532d" }, fonts: { heading: "Poppins", body: "Nunito" },
    draw(ctx, w, h, c, p, f) {
      const m = Math.min(w, h) * 0.07, marks: TextMark[] = [];
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, w, h);
      const flower = (x: number, y: number, r: number, col: string) => {
        ctx.fillStyle = col;
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = "#facc15"; ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, Math.PI * 2); ctx.fill();
      };
      const r = Math.min(w, h) * 0.035;
      flower(w * 0.08, h * 0.08, r, "#f9a8d4"); flower(w * 0.93, h * 0.12, r * 0.8, "#86efac"); flower(w * 0.9, h * 0.92, r, "#f9a8d4"); flower(w * 0.06, h * 0.88, r * 0.7, "#86efac");
      const z = zones(w, h, m);
      const prod = product(ctx, c.product, z.product, { card: "#ffffff", shadow: true, radius: Math.min(w, h) * 0.05 });
      const logo = logoOrName(ctx, c, { x: w / 2, y: m * 0.55, h: Math.min(w, h) * 0.045, font: f.heading, color: p.primary, align: "center", marks });
      if (c.badge.trim()) pill(ctx, c.badge, { x: z.product.x + z.product.w, y: z.product.y - Math.min(w, h) * 0.02, size: Math.min(w, h) * 0.032, font: f.body, bg: p.accent, color: "#fff", align: "right", role: "badge", marks });
      textColumn(ctx, c, z.text, { s: Math.min(w, h) * 0.072, f, color: p.text, sub: "#166534", price: p.accent, old: "#86efac", ctaBg: p.primary, ctaColor: "#fff", align: z.sh === "wide" ? "left" : "center", marks });
      return { texts: marks, product: prod, logo };
    },
  },
  {
    key: "back-to-school", name: "Back to school", style: "seasonal", tags: ["school", "kids", "all"],
    palette: { primary: "#2563eb", secondary: "#fde68a", accent: "#dc2626", bg: "#fef9c3", text: "#1e3a8a" }, fonts: { heading: "Nunito", body: "Nunito" },
    draw(ctx, w, h, c, p, f) {
      const m = Math.min(w, h) * 0.07, marks: TextMark[] = [];
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(37,99,235,0.15)"; ctx.lineWidth = Math.max(1, h * 0.0015);
      for (let y = h * 0.05; y < h; y += h * 0.035) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      ctx.strokeStyle = "rgba(220,38,38,0.35)"; ctx.beginPath(); ctx.moveTo(w * 0.06, 0); ctx.lineTo(w * 0.06, h); ctx.stroke();
      const z = zones(w, h, m);
      const prod = product(ctx, c.product, z.product, { card: "#ffffff", shadow: true, radius: Math.min(w, h) * 0.03 });
      const logo = logoOrName(ctx, c, { x: w - m, y: m * 0.5, h: Math.min(w, h) * 0.045, font: f.heading, color: p.primary, align: "right", marks });
      if (c.badge.trim()) pill(ctx, c.badge, { x: m * 1.2, y: m * 0.5, size: Math.min(w, h) * 0.032, font: f.body, bg: p.accent, color: "#fff", role: "badge", marks });
      textColumn(ctx, c, z.text, { s: Math.min(w, h) * 0.075, f, color: p.text, sub: "#1e40af", price: p.accent, old: "#93c5fd", ctaBg: p.primary, ctaColor: "#fff", align: z.sh === "wide" ? "left" : "center", marks, weight: 900 });
      return { texts: marks, product: prod, logo };
    },
  },
  {
    key: "black-friday", name: "Black Friday", style: "promo", tags: ["black_friday", "sale", "all", "electronics"],
    palette: { primary: "#000000", secondary: "#111111", accent: "#facc15", bg: "#000000", text: "#ffffff" }, fonts: { heading: "Oswald", body: "Inter" },
    draw(ctx, w, h, c, p, f) {
      const m = Math.min(w, h) * 0.06, marks: TextMark[] = [];
      ctx.fillStyle = p.bg; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = p.accent; ctx.fillRect(0, h - h * 0.02, w, h * 0.02); ctx.fillRect(0, 0, w, h * 0.012);
      const z = zones(w, h, m);
      const prod = product(ctx, c.product, z.product, { shadow: true });
      const logo = logoOrName(ctx, c, { x: m, y: m * 0.6, h: Math.min(w, h) * 0.045, font: f.heading, color: "#fff", marks });
      if (c.badge.trim()) pill(ctx, c.badge, { x: w - m, y: m * 0.6, size: Math.min(w, h) * 0.04, font: f.heading, bg: p.accent, color: "#000", align: "right", role: "badge", marks, radius: 4, upper: true });
      textColumn(ctx, c, z.text, { s: Math.min(w, h) * 0.09, f, color: p.text, sub: "#d4d4d4", price: p.accent, old: "#737373", ctaBg: p.accent, ctaColor: "#000", align: z.sh === "wide" ? "left" : "center", marks, upper: true, weight: 700 });
      return { texts: marks, product: prod, logo };
    },
  },
  {
    key: "summer", name: "Summer", style: "seasonal", tags: ["summer", "all", "food", "leisure"],
    palette: { primary: "#0284c7", secondary: "#fef08a", accent: "#f97316", bg: "#e0f2fe", text: "#0c4a6e" }, fonts: { heading: "Poppins", body: "Inter" },
    draw(ctx, w, h, c, p, f) {
      const m = Math.min(w, h) * 0.07, marks: TextMark[] = [];
      ctx.fillStyle = lin(ctx, 0, 0, 0, h, [[0, "#7dd3fc"], [0.65, p.bg], [1, "#fde68a"]]); ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = p.secondary; ctx.beginPath(); ctx.arc(w * 0.88, h * 0.1, Math.min(w, h) * 0.12, 0, Math.PI * 2); ctx.fill();
      const z = zones(w, h, m);
      const prod = product(ctx, c.product, z.product, { shadow: true });
      const logo = logoOrName(ctx, c, { x: m, y: m * 0.55, h: Math.min(w, h) * 0.045, font: f.heading, color: p.text, marks });
      if (c.badge.trim()) pill(ctx, c.badge, { x: m, y: m * 0.55 + Math.min(w, h) * 0.07, size: Math.min(w, h) * 0.032, font: f.body, bg: p.accent, color: "#fff", role: "badge", marks });
      textColumn(ctx, c, z.text, { s: Math.min(w, h) * 0.075, f, color: p.text, sub: "#075985", price: p.accent, old: "#7dd3fc", ctaBg: p.primary, ctaColor: "#fff", align: z.sh === "wide" ? "left" : "center", marks });
      return { texts: marks, product: prod, logo };
    },
  },
];

export const TEMPLATES = T;
export const STYLES: Style[] = ["minimal", "modern", "premium", "luxury", "promo", "seasonal"];
export const OCCASIONS = ["new_year", "navruz", "march8", "school", "black_friday", "summer", "sale"] as const;
export const getTemplate = (key: string) => T.find((t) => t.key === key) ?? T[0];

/** Brand colours replace the template colours where a brand kit is saved. */
export function brandPalette(t: Template, brand: { primaryColor?: string | null; secondaryColor?: string | null; accentColor?: string | null } | null): Palette {
  if (!brand?.primaryColor) return t.palette;
  const p = { ...t.palette, primary: brand.primaryColor };
  if (brand.secondaryColor) p.secondary = brand.secondaryColor;
  if (brand.accentColor) p.accent = brand.accentColor;
  if (t.palette.bg === t.palette.primary) p.bg = brand.primaryColor;
  return p;
}

// ------------------------------------------------------------------ fonts and images
const loadedFonts = new Set<string>(["Inter"]);
/** Weights each Google font really has (asking for a missing weight makes Google reject the request). */
const FONT_WEIGHTS: Record<string, string> = { "Bebas Neue": "", Oswald: ":wght@400;500;700", "Playfair Display": ":wght@400;700;800;900" };
export async function ensureFonts(fonts: string[]) {
  const need = [...new Set(fonts)].filter((f) => !loadedFonts.has(f));
  await Promise.all(need.map((f) => new Promise<void>((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}${FONT_WEIGHTS[f] ?? ":wght@400;500;700;800;900"}&display=swap`;
    link.onload = () => resolve(); link.onerror = () => resolve();
    document.head.appendChild(link);
    loadedFonts.add(f);
  })));
  await Promise.all(fonts.flatMap((f) => [`400 40px "${f}"`, `700 40px "${f}"`].map((spec) => document.fonts.load(spec).catch(() => []))));
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image could not be loaded"));
    img.src = url;
  });
}

/** Draw a template on a canvas at full size (scale < 1 for previews). */
export function render(canvas: HTMLCanvasElement, t: Template, format: FormatKey, c: Content, p: Palette, f: Fonts, scale = 1): Layout {
  const { w, h } = FORMATS[format];
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return t.draw(ctx, w, h, c, p, f);
}

export function toBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), type, quality));
}
