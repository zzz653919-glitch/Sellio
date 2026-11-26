/**
 * Draws a design document on a canvas. The same function draws the editor preview, the gallery
 * thumbnails and the exported file, so what you see is exactly what you download.
 */
import { artSvg } from "./art";
import type { Doc, El, Fill, ImageEl, ShapeEl, TextEl } from "./types";

type Ctx = CanvasRenderingContext2D;

// ------------------------------------------------------------------ images
const images = new Map<string, HTMLImageElement | "loading" | "error">();
const waiters = new Map<string, Promise<void>>();

/** URL an image source loads from (built-in art becomes an SVG data URL). */
export function sourceUrl(src: string): string | null {
  if (src.startsWith("art:")) {
    const [key, ...opts] = src.slice(4).split("|");
    const o: Record<string, string> = {};
    for (const p of opts) { const i = p.indexOf("="); if (i > 0) o[p.slice(0, i)] = p.slice(i + 1); }
    const svg = artSvg(key, o);
    return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
  }
  return src;
}

export function loadSource(src: string): Promise<void> {
  const have = images.get(src);
  if (have && have !== "loading") return Promise.resolve();
  const w = waiters.get(src);
  if (w) return w;
  const url = sourceUrl(src);
  if (!url) { images.set(src, "error"); return Promise.resolve(); }
  images.set(src, "loading");
  const p = new Promise<void>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    if (/^https?:/.test(url)) img.crossOrigin = "anonymous";
    img.onload = () => { images.set(src, img); resolve(); };
    img.onerror = () => { images.set(src, "error"); resolve(); };
    img.src = url;
  });
  waiters.set(src, p);
  return p.finally(() => waiters.delete(src));
}

/** Load every image a document uses (call before drawing for export). */
export async function loadDocImages(doc: Doc) {
  await Promise.all(doc.els.filter((e): e is ImageEl => e.type === "image").map((e) => loadSource(e.src)));
}

const imageOf = (src: string) => { const i = images.get(src); return i instanceof HTMLImageElement ? i : null; };

// ------------------------------------------------------------------ helpers
function paint(ctx: Ctx, fill: Fill, x: number, y: number, w: number, h: number): string | CanvasGradient {
  if (typeof fill === "string") return fill;
  if (fill.type === "linear") {
    const a = ((fill.angle - 90) * Math.PI) / 180;
    const cx = x + w / 2, cy = y + h / 2;
    const half = (Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) / 2;
    const g = ctx.createLinearGradient(cx - Math.cos(a) * half, cy - Math.sin(a) * half, cx + Math.cos(a) * half, cy + Math.sin(a) * half);
    for (const [o, c] of fill.stops) g.addColorStop(Math.min(1, Math.max(0, o)), c);
    return g;
  }
  const r = fill.r * Math.max(w, h);
  const g = ctx.createRadialGradient(x + fill.cx * w, y + fill.cy * h, 0, x + fill.cx * w, y + fill.cy * h, Math.max(1, r));
  for (const [o, c] of fill.stops) g.addColorStop(Math.min(1, Math.max(0, o)), c);
  return g;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function starPath(ctx: Ctx, cx: number, cy: number, outer: number, inner: number, points: number, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = rot + (i * Math.PI) / points;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

/** Box of an element in pixels. Elements marked `keep` stay square, centred in their box. */
function pxBox(e: El, W: number, H: number) {
  let x = e.x * W, y = e.y * H, w = e.w * W, h = e.h * H;
  if (e.type === "shape" && e.keep) {
    const s = Math.min(w, h);
    x += (w - s) / 2; y += (h - s) / 2; w = s; h = s;
  }
  return { x, y, w, h };
}

// ------------------------------------------------------------------ shapes
function drawShape(ctx: Ctx, e: ShapeEl, b: { x: number; y: number; w: number; h: number }, u: number) {
  const { x, y, w, h } = b;
  const fill = paint(ctx, e.fill, x, y, w, h);
  ctx.fillStyle = fill;
  ctx.strokeStyle = e.stroke ?? "transparent";
  ctx.lineWidth = (e.strokeW ?? 0) * u;
  if (e.blur) ctx.filter = `blur(${e.blur * u * ctx.getTransform().a}px)`;
  const cx = x + w / 2, cy = y + h / 2;
  const doFill = () => { ctx.fill(); if (e.stroke && e.strokeW) ctx.stroke(); };
  switch (e.shape) {
    case "rect": roundRect(ctx, x, y, w, h, (e.radius ?? 0) * u); doFill(); break;
    case "circle": ctx.beginPath(); ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2); doFill(); break;
    case "halfcircle": ctx.beginPath(); ctx.ellipse(cx, y + h, w / 2, h, 0, Math.PI, Math.PI * 2); ctx.closePath(); doFill(); break;
    case "ring": {
      ctx.beginPath(); ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.strokeStyle = typeof e.fill === "string" ? e.fill : fill; ctx.lineWidth = (e.strokeW ?? 6) * u; ctx.stroke(); break;
    }
    case "triangle": ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); doFill(); break;
    case "diamond": ctx.beginPath(); ctx.moveTo(cx, y); ctx.lineTo(x + w, cy); ctx.lineTo(cx, y + h); ctx.lineTo(x, cy); ctx.closePath(); doFill(); break;
    case "star": starPath(ctx, cx, cy, Math.min(w, h) / 2, Math.min(w, h) / 4.6, 5); doFill(); break;
    case "burst": starPath(ctx, cx, cy, Math.min(w, h) / 2, Math.min(w, h) / 2.35, 18); doFill(); break;
    case "sparkle": {
      const r = Math.min(w, h) / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - r); ctx.quadraticCurveTo(cx, cy, cx + r, cy); ctx.quadraticCurveTo(cx, cy, cx, cy + r);
      ctx.quadraticCurveTo(cx, cy, cx - r, cy); ctx.quadraticCurveTo(cx, cy, cx, cy - r); ctx.closePath(); doFill(); break;
    }
    case "plus": { const t = Math.min(w, h) / 3.2; roundRect(ctx, cx - t / 2, y, t, h, t / 3); doFill(); roundRect(ctx, x, cy - t / 2, w, t, t / 3); doFill(); break; }
    case "arch": {
      ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + w / 2); ctx.arc(cx, y + w / 2, w / 2, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); doFill(); break;
    }
    case "heart": {
      const s = Math.min(w, h);
      ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.38);
      ctx.bezierCurveTo(cx - s * 0.6, cy - s * 0.05, cx - s * 0.32, cy - s * 0.55, cx, cy - s * 0.22);
      ctx.bezierCurveTo(cx + s * 0.32, cy - s * 0.55, cx + s * 0.6, cy - s * 0.05, cx, cy + s * 0.38);
      ctx.closePath(); doFill(); break;
    }
    case "blob": {
      const pts = 8, rx = w / 2, ry = h / 2;
      const wob = [1, 0.86, 1.04, 0.9, 1.02, 0.84, 0.98, 0.92];
      const p = Array.from({ length: pts }, (_, i) => { const a = (i / pts) * Math.PI * 2; return [cx + Math.cos(a) * rx * wob[i], cy + Math.sin(a) * ry * wob[i]]; });
      ctx.beginPath();
      for (let i = 0; i < pts; i++) {
        const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % pts];
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        if (i === 0) ctx.moveTo(mx, my); else ctx.quadraticCurveTo(x1, y1, mx, my);
      }
      const [x0, y0] = p[0], [x1, y1] = p[1];
      ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      ctx.closePath(); doFill(); break;
    }
    case "line": roundRect(ctx, x, y, w, Math.max(h, 1), Math.min(h, w) / 2); doFill(); break;
    case "dots": {
      const step = Math.max(8, 26 * u), r = Math.max(1.5, 4 * u);
      for (let yy = y + r; yy <= y + h - r; yy += step) for (let xx = x + r; xx <= x + w - r; xx += step) { ctx.beginPath(); ctx.arc(xx, yy, r, 0, Math.PI * 2); ctx.fill(); }
      break;
    }
    case "stripes": {
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      const step = Math.max(10, 34 * u), t = step * 0.42;
      for (let k = -h; k < w + h; k += step) { ctx.beginPath(); ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + t, y + h); ctx.lineTo(x + k + t + h, y); ctx.lineTo(x + k + h, y); ctx.closePath(); ctx.fill(); }
      ctx.restore(); break;
    }
    case "wave": {
      ctx.beginPath(); ctx.moveTo(x, y + h * 0.45);
      const n = 3;
      for (let i = 0; i < n; i++) {
        const sx = x + (w / n) * i, ex = x + (w / n) * (i + 1);
        ctx.bezierCurveTo(sx + w / n / 3, y, ex - w / n / 3, y + h * 0.9, ex, y + h * 0.45);
      }
      ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); ctx.closePath(); doFill(); break;
    }
    case "arrow": {
      const t = h * 0.34;
      ctx.beginPath(); ctx.moveTo(x, cy - t / 2); ctx.lineTo(x + w - h * 0.6, cy - t / 2); ctx.lineTo(x + w - h * 0.6, y);
      ctx.lineTo(x + w, cy); ctx.lineTo(x + w - h * 0.6, y + h); ctx.lineTo(x + w - h * 0.6, cy + t / 2); ctx.lineTo(x, cy + t / 2); ctx.closePath(); doFill(); break;
    }
  }
  ctx.filter = "none";
}

// ------------------------------------------------------------------ text
const fontSpec = (e: TextEl, px: number) => `${e.italic ? "italic " : ""}${e.weight} ${px}px "${e.font}", "Plus Jakarta Sans", system-ui, sans-serif`;

function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (line && ctx.measureText(next).width > maxW) { out.push(line); line = w; } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** Text lines and their size after shrinking to fit the box. Exported for the editor (auto-height hints). */
export function layoutText(ctx: Ctx, e: TextEl, W: number, H: number) {
  const u = Math.min(W, H) / 1000;
  const boxW = e.w * W, boxH = e.h * H;
  const padX = e.bg && !e.bg.full ? e.bg.padX * u : 0, padY = e.bg && !e.bg.full ? e.bg.padY * u : 0;
  const text = e.upper ? e.text.toUpperCase() : e.text;
  let px = e.size * u;
  let lines: string[] = [];
  let lh = 0;
  for (let i = 0; i < 24; i++) {
    ctx.font = fontSpec(e, px);
    try { (ctx as Ctx & { letterSpacing?: string }).letterSpacing = `${(e.spacing ?? 0) * px}px`; } catch { /* old browsers */ }
    lines = wrap(ctx, text, Math.max(10, boxW - padX * 2));
    lh = px * (e.lineHeight ?? 1.1);
    const widest = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
    if ((lines.length * lh + padY * 2 <= boxH * 1.02 && widest <= boxW - padX * 2 + 1) || px < e.size * u * 0.35) break;
    px *= 0.93;
  }
  const widths = lines.map((l) => ctx.measureText(l).width);
  return { px, lines, lh, widths, padX, padY, u };
}

function drawText(ctx: Ctx, e: TextEl, b: { x: number; y: number; w: number; h: number }, W: number, H: number) {
  const { px, lines, lh, widths, padX, padY, u } = layoutText(ctx, e, W, H);
  const textW = Math.max(0, ...widths), textH = lines.length * lh;
  const blockW = textW + padX * 2, blockH = textH + padY * 2;
  let bx = e.align === "left" ? b.x : e.align === "right" ? b.x + b.w - blockW : b.x + (b.w - blockW) / 2;
  const va = e.valign ?? (e.bg ? "middle" : "top");
  let by = va === "top" ? b.y : va === "bottom" ? b.y + b.h - blockH : b.y + (b.h - blockH) / 2;
  if (e.bg) {
    const bg = e.bg;
    let rx = bx, ry = by, rw = blockW, rh = blockH;
    if (bg.full) { rx = b.x; ry = b.y; rw = b.w; rh = b.h; by = b.y + (b.h - textH) / 2; bx = e.align === "left" ? b.x + bg.padX * u : bx; }
    ctx.fillStyle = paint(ctx, bg.fill, rx, ry, rw, rh);
    ctx.strokeStyle = bg.stroke ?? "transparent";
    ctx.lineWidth = (bg.strokeW ?? 0) * u;
    if (bg.shape === "circle" || bg.shape === "burst") {
      const d = Math.max(rw, rh, Math.min(b.w, b.h)), cx = rx + rw / 2, cy = ry + rh / 2;
      if (bg.shape === "circle") { ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); }
      else starPath(ctx, cx, cy, d / 2 * 1.08, d / 2 * 0.9, 16);
    } else roundRect(ctx, rx, ry, rw, rh, bg.shape === "pill" ? rh / 2 : (bg.radius ?? 0) * u);
    ctx.fill();
    if (bg.stroke && bg.strokeW) ctx.stroke();
  }
  ctx.font = fontSpec(e, px);
  try { (ctx as Ctx & { letterSpacing?: string }).letterSpacing = `${(e.spacing ?? 0) * px}px`; } catch { /* ignore */ }
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  if (e.shadow) { const k = ctx.getTransform().a; ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = px * 0.25 * k; ctx.shadowOffsetY = px * 0.06 * k; }
  lines.forEach((line, i) => {
    const lw = widths[i];
    const inner = e.bg && !e.bg.full ? bx + padX : e.bg?.full ? b.x + e.bg.padX * u : b.x;
    const innerW = e.bg?.full ? b.w - e.bg.padX * u * 2 : e.bg ? textW : b.w;
    const lx = e.align === "left" ? inner : e.align === "right" ? inner + innerW - lw : inner + (innerW - lw) / 2;
    const ly = by + padY + lh * i + lh / 2 + px * 0.04;
    ctx.fillStyle = i > 0 && e.color2 ? e.color2 : e.color;
    ctx.fillText(line, lx, ly);
    if (e.strike) {
      ctx.fillRect(lx, ly - px * 0.02, lw, Math.max(1, px * 0.07));
    }
  });
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
}

// ------------------------------------------------------------------ images
function drawImage(ctx: Ctx, e: ImageEl, b: { x: number; y: number; w: number; h: number }, u: number) {
  const img = imageOf(e.src);
  ctx.save();
  // mask
  const mask = e.mask ?? "none";
  if (mask !== "none") {
    ctx.beginPath();
    if (mask === "circle") { const r = Math.min(b.w, b.h) / 2; ctx.arc(b.x + b.w / 2, b.y + b.h / 2, r, 0, Math.PI * 2); }
    else if (mask === "rounded") roundRect(ctx, b.x, b.y, b.w, b.h, (e.radius ?? 40) * u);
    else { const r = b.w / 2; ctx.moveTo(b.x, b.y + b.h); ctx.lineTo(b.x, b.y + r); ctx.arc(b.x + r, b.y + r, r, Math.PI, 0); ctx.lineTo(b.x + b.w, b.y + b.h); ctx.closePath(); }
    ctx.save();
    ctx.clip();
  }
  if (!img) {
    ctx.fillStyle = "rgba(148,163,184,0.25)";
    ctx.fillRect(b.x, b.y, b.w, b.h);
  } else {
    const iw = img.naturalWidth || img.width || 1, ih = img.naturalHeight || img.height || 1;
    const s = (e.fit === "cover" ? Math.max(b.w / iw, b.h / ih) : Math.min(b.w / iw, b.h / ih)) * (e.zoom ?? 1);
    const dw = iw * s, dh = ih * s;
    const dx = b.x + (b.w - dw) / 2 + (e.dx ?? 0) * b.w, dy = b.y + (b.h - dh) / 2 + (e.dy ?? 0) * b.h;
    if (e.shadow && mask === "none") { const k = ctx.getTransform().a; ctx.shadowColor = "rgba(15,23,42,0.28)"; ctx.shadowBlur = 36 * u * k; ctx.shadowOffsetY = 16 * u * k; }
    if (e.flip) { ctx.translate(dx + dw / 2, 0); ctx.scale(-1, 1); ctx.translate(-(dx + dw / 2), 0); }
    ctx.drawImage(img, dx, dy, dw, dh);
  }
  if (mask !== "none") {
    ctx.restore();
    if (e.border && e.border.width > 0) { ctx.strokeStyle = e.border.color; ctx.lineWidth = e.border.width * u; ctx.stroke(); }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ document
export function drawDoc(ctx: Ctx, doc: Doc, W: number, H: number, opts: { hide?: string } = {}) {
  const u = Math.min(W, H) / 1000;
  ctx.save();
  ctx.fillStyle = paint(ctx, doc.bg, 0, 0, W, H);
  ctx.fillRect(0, 0, W, H);
  for (const e of doc.els) {
    if (e.id === opts.hide) continue;
    const b = pxBox(e, W, H);
    ctx.save();
    ctx.globalAlpha = e.opacity ?? 1;
    if (e.rot) { ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.rotate((e.rot * Math.PI) / 180); ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2)); }
    if (e.type === "shape") drawShape(ctx, e, b, u);
    else if (e.type === "text") drawText(ctx, e, b, W, H);
    else drawImage(ctx, e, b, u);
    ctx.restore();
  }
  ctx.restore();
}

/** Draw into a canvas at a given pixel width (preview) — the canvas keeps the document aspect. */
export function renderTo(canvas: HTMLCanvasElement, doc: Doc, pixelW: number) {
  const scale = pixelW / doc.w;
  canvas.width = Math.max(1, Math.round(doc.w * scale));
  canvas.height = Math.max(1, Math.round(doc.h * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, doc.w, doc.h);
  drawDoc(ctx, doc, doc.w, doc.h);
}

/** Full-size file (PNG or JPG). */
export async function exportDoc(doc: Doc, type: "image/png" | "image/jpeg"): Promise<Blob> {
  await loadDocImages(doc);
  const canvas = document.createElement("canvas");
  renderTo(canvas, doc, doc.w);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), type, type === "image/jpeg" ? 0.95 : undefined));
}
