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
 * Remove the background around a product: white, one colour, or a smooth gradient / vignette
 * (light corners turning dark behind the product, studio "sweeps").
 *
 * How: on a small, slightly blurred copy the background grows inwards from the picture's edges, pixel by
 * pixel, as long as each next pixel looks like its neighbour — so a gradient is followed all the way, and
 * the growth stops at the product's outline (a sharp edge). Small leftovers (a caption printed on the
 * background) are dropped, the mask is scaled up with soft edges and pulled in a little against halos.
 * Returns null when this does not look like a product on a background (a real scene, or no clear outline):
 * such photos are used as they are (framed), never cut badly.
 */
export const bgDebug: Record<string, number> = {};
export function removePlainBackground(src: HTMLCanvasElement, force = false): HTMLCanvasElement | null {
  const W = src.width, H = src.height;
  const k = Math.min(1, 640 / Math.max(W, H));
  const w = Math.max(8, Math.round(W * k)), h = Math.max(8, Math.round(H * k));
  const N = w * h;
  const small = canvasOf(w, h);
  const sx = small.getContext("2d", { willReadFrequently: true })!;
  sx.filter = "blur(1px)"; // smooths noise and JPEG blocks (ignored where unsupported)
  sx.drawImage(src, 0, 0, w, h);
  const d = sx.getImageData(0, 0, w, h).data;
  const diff = (p: number, q: number) => Math.abs(d[p * 4] - d[q * 4]) + Math.abs(d[p * 4 + 1] - d[q * 4 + 1]) + Math.abs(d[p * 4 + 2] - d[q * 4 + 2]);

  // background colour at the edges (median) — pixels close to it are background wherever they are
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
  // walking around the edge of a product photo the colour changes smoothly; a real scene has many jumps
  const ring: number[] = [];
  for (let x = 0; x < w; x++) ring.push(x);
  for (let y = 1; y < h; y++) ring.push(y * w + w - 1);
  for (let x = w - 2; x >= 0; x--) ring.push((h - 1) * w + x);
  for (let y = h - 2; y > 0; y--) ring.push(y * w);
  let jumps = 0;
  for (let i = 0; i < ring.length; i++) if (diff(ring[i], ring[(i + 3) % ring.length]) > 70) { jumps++; i += 3; }
  bgDebug.jumps = jumps;
  if (!force && jumps > 12) return null;
  const med = [0, 1, 2].map((c) => border.map((p) => d[p * 4 + c]).sort((a, b) => a - b)[border.length >> 1]);
  const toMed = (p: number) => Math.abs(d[p * 4] - med[0]) + Math.abs(d[p * 4 + 1] - med[1]) + Math.abs(d[p * 4 + 2] - med[2]);

  // One-colour background (the edge is nearly the same colour everywhere): a pixel is background when it is
  // close to that colour — precise enough for a white product on light grey. Otherwise (gradient, vignette)
  // the background is followed step by step.
  const spread = border.map(toMed).sort((a, b) => a - b)[Math.floor(border.length * 0.95)];
  const uniform = spread < 30;
  const UNI = Math.max(force ? 40 : 20, Math.min(force ? 70 : 42, spread * 3));
  bgDebug.spread = spread;
  // grow the background from the edges
  const STEP = force ? 24 : 16, NEAR = force ? 60 : 36, SEED = force ? 150 : 110;
  const bg = new Uint8Array(N);
  // each background pixel remembers the colour of the background it grew from (a slowly moving average), so
  // a smooth gradient is followed but a soft, low-contrast product edge is not crossed
  const ref = new Float32Array(N * 3);
  const TRAIL = force ? 60 : 32;
  const stack: number[] = [];
  for (const p of border) if (!bg[p] && (d[p * 4 + 3] < 128 || toMed(p) < SEED)) { bg[p] = 1; ref[p * 3] = d[p * 4]; ref[p * 3 + 1] = d[p * 4 + 1]; ref[p * 3 + 2] = d[p * 4 + 2]; stack.push(p); }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    if (x > 0) visit(p, p - 1);
    if (x < w - 1) visit(p, p + 1);
    if (p >= w) visit(p, p - w);
    if (p < N - w) visit(p, p + w);
  }
  function visit(p: number, q: number) {
    if (bg[q]) return;
    const r0 = ref[p * 3], r1 = ref[p * 3 + 1], r2 = ref[p * 3 + 2];
    const fromRef = Math.abs(d[q * 4] - r0) + Math.abs(d[q * 4 + 1] - r1) + Math.abs(d[q * 4 + 2] - r2);
    if (d[q * 4 + 3] < 128 || (uniform ? toMed(q) < UNI : (diff(p, q) <= STEP && fromRef <= TRAIL) || toMed(q) < NEAR)) {
      bg[q] = 1;
      ref[q * 3] = r0 * 0.9 + d[q * 4] * 0.1; ref[q * 3 + 1] = r1 * 0.9 + d[q * 4 + 1] * 0.1; ref[q * 3 + 2] = r2 * 0.9 + d[q * 4 + 2] * 0.1;
      stack.push(q);
    }
  }

  // keep only the product: the biggest piece(s) of what is left
  const label = new Int32Array(N).fill(-1);
  const sizes: number[] = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (bg[s0] || label[s0] >= 0) continue;
    const id = sizes.length; let n = 0;
    const st = [s0]; label[s0] = id;
    while (st.length) {
      const p = st.pop()!; n++;
      const x = p % w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < N - w ? p + w : -1];
      for (const q of nb) if (q >= 0 && !bg[q] && label[q] < 0) { label[q] = id; st.push(q); }
    }
    sizes.push(n);
  }
  if (!sizes.length) return null;
  const biggest = Math.max(...sizes);
  const keepId = sizes.map((n) => n >= biggest * 0.15 && n >= N * 0.002);
  let kept = 0;
  for (let p = 0; p < N; p++) { if (!bg[p] && !keepId[label[p]]) bg[p] = 1; if (!bg[p]) kept++; }
  const removedShare = 1 - kept / N;

  if (!force) {
    // a real background was found around the product …
    bgDebug.removedShare = removedShare;
    if (removedShare < 0.06 || removedShare > 0.96) return null;
    const borderBg = border.filter((p) => bg[p]).length / border.length;
    bgDebug.borderBg = borderBg;
    if (borderBg < 0.6) return null;
    // … and the cut follows a real outline (not a soft spot inside a photo)
    let sum = 0, cnt = 0;
    for (let p = 0; p < N; p += 1) {
      if (bg[p]) continue;
      const x = p % w;
      if (x > 1 && bg[p - 1]) { sum += diff(p, p - 2); cnt++; }
      if (x < w - 2 && bg[p + 1]) { sum += diff(p, p + 2); cnt++; }
      if (p >= 2 * w && bg[p - w]) { sum += diff(p, p - 2 * w); cnt++; }
      if (p < N - 2 * w && bg[p + w]) { sum += diff(p, p + 2 * w); cnt++; }
    }
    bgDebug.edge = cnt ? sum / cnt : 0;
    // a one-colour background is separated reliably by colour, so a softer outline is accepted there
    if (!cnt || sum / cnt < (uniform ? Math.max(12, spread * 2) : 28)) return null;
  } else if (!kept || removedShare < 0.01) return null;

  // full-size mask with soft edges, pulled in slightly so no background colour shows around the product
  const m = canvasOf(w, h);
  const mc = m.getContext("2d")!;
  const md = mc.createImageData(w, h);
  for (let p = 0; p < N; p++) { md.data[p * 4 + 3] = bg[p] ? 0 : 255; }
  mc.putImageData(md, 0, 0);
  const big = canvasOf(W, H);
  const bc = big.getContext("2d", { willReadFrequently: true })!;
  bc.imageSmoothingEnabled = true; bc.imageSmoothingQuality = "high";
  bc.drawImage(m, 0, 0, W, H);
  const mask = bc.getImageData(0, 0, W, H).data;
  const ctx = src.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, W, H);
  const o = img.data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const a = Math.max(0, Math.min(255, ((mask[i + 3] - 100) * 255) / 130));
      o[i + 3] = Math.round((o[i + 3] * a) / 255);
      if (o[i + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  if (x1 < 0) return null;
  // crop to the product with a small margin
  const mg = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
  x0 = Math.max(0, x0 - mg); y0 = Math.max(0, y0 - mg); x1 = Math.min(W - 1, x1 + mg); y1 = Math.min(H - 1, y1 + mg);
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
