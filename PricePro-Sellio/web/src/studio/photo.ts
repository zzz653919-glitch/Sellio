/**
 * The user's own product photo in a template: reading the file, removing a plain background, and putting
 * the photo exactly where (and in the shape) the template's sample picture was.
 */
import type { Doc, ImageEl, ShapeEl } from "./types";

export type Photo = { src: string; cutout: boolean };

const MAX = 1600;

function canvasOf(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

function loadImg(url: string) {
  return new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("This image could not be opened.")); i.src = url; });
}

/** Share of transparent pixels (a cut-out product has many). */
function transparentShare(c: HTMLCanvasElement) {
  const t = canvasOf(48, 48); const tc = t.getContext("2d", { willReadFrequently: true })!;
  tc.drawImage(c, 0, 0, 48, 48);
  const a = tc.getImageData(0, 0, 48, 48).data;
  let clear = 0; for (let i = 3; i < a.length; i += 4) if (a[i] < 200) clear++;
  return clear / (48 * 48);
}

/**
 * Remove a plain background (white, grey or any single colour around the product).
 * Works from the edges inwards, so the product itself keeps its colours even if they are similar.
 * Returns null when the background is not plain (a real scene): such photos are framed instead.
 */
export function removePlainBackground(src: HTMLCanvasElement, force = false): HTMLCanvasElement | null {
  const w = src.width, h = src.height;
  const ctx = src.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  // Background colour = median of the border pixels.
  const border: number[] = [];
  const step = Math.max(1, Math.floor((w + h) / 400));
  for (let x = 0; x < w; x += step) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y += step) border.push(y * w, y * w + w - 1);
  const ch = (k: number) => border.map((p) => d[p * 4 + k]).sort((a, b) => a - b)[Math.floor(border.length / 2)];
  const bg = [ch(0), ch(1), ch(2)];
  const dist = (p: number) => Math.abs(d[p * 4] - bg[0]) + Math.abs(d[p * 4 + 1] - bg[1]) + Math.abs(d[p * 4 + 2] - bg[2]);
  const near = border.filter((p) => dist(p) < 60).length / border.length;
  if (!force && near < 0.8) return null; // not a plain background
  const tol = force ? 90 : 60;
  // Flood fill from every border pixel that looks like the background.
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (const p of border) if (dist(p) < tol && !seen[p]) { seen[p] = 1; stack.push(p); }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w, y = (p - x) / w;
    const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
    for (const q of nb) if (q >= 0 && !seen[q] && dist(q) < tol) { seen[q] = 1; stack.push(q); }
  }
  let removed = 0;
  for (let p = 0; p < w * h; p++) if (seen[p]) { d[p * 4 + 3] = 0; removed++; }
  if (!force && (removed < w * h * 0.08 || removed > w * h * 0.97)) return null; // nothing sensible to cut
  // Soft edge: pixels touching the removed background get partly transparent.
  for (let p = 0; p < w * h; p++) {
    if (seen[p]) continue;
    const x = p % w;
    const touching = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || (p >= w && seen[p - w]) || (p < w * (h - 1) && seen[p + w]);
    if (touching) d[p * 4 + 3] = Math.min(d[p * 4 + 3], 150);
  }
  // Crop to the product (with a little margin).
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const m = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
  ctx.putImageData(img, 0, 0);
  const out = canvasOf(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext("2d")!.drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** Read an uploaded picture (at most 1600 px). A plain background is removed automatically. */
export async function readPhoto(file: File): Promise<Photo> {
  if (!/^image\/(png|jpe?g|webp|gif|avif)$/i.test(file.type)) throw new Error("Choose a PNG, JPG or WebP image.");
  if (file.size > 15 * 1024 * 1024) throw new Error("The image is larger than 15 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const s = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = canvasOf(img.naturalWidth * s, img.naturalHeight * s);
    c.getContext("2d", { willReadFrequently: true })!.drawImage(img, 0, 0, c.width, c.height);
    if (transparentShare(c) > 0.04) return { src: c.toDataURL("image/png"), cutout: true };
    const cut = removePlainBackground(c);
    if (cut) return { src: cut.toDataURL("image/png"), cutout: true };
    return { src: c.toDataURL("image/jpeg", 0.92), cutout: false };
  } finally { URL.revokeObjectURL(url); }
}

/** Remove the background of a picture that is already in the design (the "Remove background" button). */
export async function cutOut(src: string): Promise<string | null> {
  const img = await loadImg(src);
  const c = canvasOf(img.naturalWidth, img.naturalHeight);
  c.getContext("2d", { willReadFrequently: true })!.drawImage(img, 0, 0);
  const cut = removePlainBackground(c, true);
  return cut ? cut.toDataURL("image/png") : null;
}

/**
 * Where an uploaded photo goes in a template. A cut-out product keeps the sample picture's place.
 * A normal (rectangular) photo takes the shape behind the sample picture — a circle stays a circle,
 * an arch stays an arch — so the design keeps its look; without such a shape it gets rounded corners.
 */
export function placePhoto(doc: Doc, el: ImageEl, cutout: boolean): Partial<ImageEl> {
  const base: Partial<ImageEl> = { zoom: 1, dx: 0, dy: 0, flip: false };
  if (el.w >= 0.9 && el.h >= 0.9) return { ...base, fit: "cover", mask: "none" }; // full background picture
  if (cutout) return { ...base, fit: "contain", mask: "none", shadow: true };
  const at = doc.els.findIndex((e) => e.id === el.id);
  const area = el.w * el.h;
  let best: { s: ShapeEl; score: number } | null = null;
  for (const e of doc.els.slice(0, at)) {
    if (e.type !== "shape" || !["circle", "ring", "arch", "blob", "rect", "halfcircle"].includes(e.shape)) continue;
    if ((e.w >= 0.95 && e.h >= 0.95) || e.h < 0.08 || e.w < 0.08 || (e.opacity ?? 1) < 0.05) continue;
    let { x, y, w, h } = e;
    if (e.keep) { const m = Math.min(w * doc.w, h * doc.h); x += (w - m / doc.w) / 2; y += (h - m / doc.h) / 2; w = m / doc.w; h = m / doc.h; }
    const ox = Math.max(0, Math.min(x + w, el.x + el.w) - Math.max(x, el.x)), oy = Math.max(0, Math.min(y + h, el.y + el.h) - Math.max(y, el.y));
    const score = (ox * oy) / Math.min(area, w * h);
    if (score > 0.45 && (!best || score > best.score)) best = { s: { ...e, x, y, w, h }, score };
  }
  if (!best) return { ...base, fit: "cover", mask: "rounded", radius: 36, shadow: true };
  const s = best.s;
  const inset = s.shape === "ring" ? 0.08 : 0;
  const box = { x: s.x + s.w * inset, y: s.y + s.h * inset, w: s.w * (1 - 2 * inset), h: s.h * (1 - 2 * inset) };
  const mask: ImageEl["mask"] = s.shape === "arch" ? "arch" : s.shape === "rect" || s.shape === "halfcircle" ? "rounded" : "circle";
  return { ...base, ...box, fit: "cover", mask, radius: s.shape === "rect" ? Math.max(12, s.radius ?? 24) : 36, shadow: false };
}

/** The template's main (sample) product picture. */
export const productOf = (doc: Doc) =>
  doc.els.find((e): e is ImageEl => e.type === "image" && e.name === "Product image") ?? doc.els.find((e): e is ImageEl => e.type === "image") ?? null;

/** A copy of the design with the user's photo in place of the sample picture. */
export function withPhoto(doc: Doc, photo: Photo | null): Doc {
  if (!photo) return doc;
  const p = productOf(doc);
  if (!p) return doc;
  // A photo replacing a full-size background scene would hide the design: only product pictures are replaced.
  if (p.w >= 0.9 && p.h >= 0.9 && photo.cutout) return doc;
  const patch = { src: photo.src, ...placePhoto(doc, p, photo.cutout) };
  return { ...doc, els: doc.els.map((e) => (e.id === p.id ? ({ ...e, ...patch } as ImageEl) : e)) };
}

// ------------------------------------------------------------------ the photo chosen in the gallery
let current: (Photo & { id: number }) | null = null;
let seq = 0;
const listeners = new Set<() => void>();
export const galleryPhoto = () => current;
export function setGalleryPhoto(p: Photo | null) {
  current = p ? { ...p, id: ++seq } : null;
  try { if (p) sessionStorage.setItem("vendora-gallery-photo", JSON.stringify(p)); else sessionStorage.removeItem("vendora-gallery-photo"); } catch { /* too large or blocked */ }
  listeners.forEach((f) => f());
}
export function onGalleryPhoto(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }
try {
  const saved = sessionStorage.getItem("vendora-gallery-photo");
  if (saved) current = { ...(JSON.parse(saved) as Photo), id: ++seq };
} catch { /* ignore */ }
