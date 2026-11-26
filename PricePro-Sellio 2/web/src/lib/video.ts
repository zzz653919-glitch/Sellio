/**
 * Short promo videos made in the browser from the user's own photos and banners: slides with a
 * slow zoom, captions (subtitles burned into the video), price and call to action.
 * Recorded with MediaRecorder; no AI and no server involved.
 */
import { roundRect } from "./banner";

export type VideoFormat = "vertical" | "square" | "horizontal";
export const VIDEO_FORMATS: Record<VideoFormat, { label: string; w: number; h: number }> = {
  vertical: { label: "Vertical 9:16 (Reels, Stories, TikTok)", w: 720, h: 1280 },
  square: { label: "Square 1:1 (feed)", w: 720, h: 720 },
  horizontal: { label: "Horizontal 16:9 (YouTube, Telegram)", w: 1280, h: 720 },
};
export type VideoStyle = "zoom" | "slide" | "fade";
export type VideoInput = {
  images: HTMLImageElement[];
  captions: string[]; // one per slide (subtitles)
  title: string;
  price: string;
  cta: string;
  brandName: string;
  color: string;
  font: string;
  secondsPerSlide: number;
  style: VideoStyle;
  format: VideoFormat;
};

export function supportedType(): { mime: string; ext: "mp4" | "webm" } | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const [mime, ext] of [["video/mp4;codecs=avc1", "mp4"], ["video/mp4", "mp4"], ["video/webm;codecs=vp9", "webm"], ["video/webm;codecs=vp8", "webm"], ["video/webm", "webm"]] as const) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}

const ease = (t: number) => t * t * (3 - 2 * t);

function wrap(ctx: CanvasRenderingContext2D, s: string, maxW: number) {
  const out: string[] = [];
  let line = "";
  for (const w of s.split(/\s+/).filter(Boolean)) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out.slice(0, 3);
}

/** Draw one frame at time t (seconds). Exported so a preview can show the same frames. */
export function drawFrame(ctx: CanvasRenderingContext2D, v: VideoInput, t: number) {
  const { w, h } = VIDEO_FORMATS[v.format];
  const n = Math.max(1, v.images.length);
  const total = n * v.secondsPerSlide + 2; // + end card
  ctx.fillStyle = "#0b0f19"; ctx.fillRect(0, 0, w, h);
  const m = Math.min(w, h) * 0.06;
  if (t >= n * v.secondsPerSlide || !v.images.length) {
    // End card: price and call to action.
    const k = ease(Math.min(1, (t - n * v.secondsPerSlide) / 0.6));
    ctx.fillStyle = v.color; ctx.globalAlpha = k; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `800 ${Math.min(w, h) * 0.085}px "${v.font}", Inter, sans-serif`;
    wrap(ctx, v.title, w - m * 2).forEach((l, i, a) => ctx.fillText(l, w / 2, h * 0.36 + (i - (a.length - 1) / 2) * Math.min(w, h) * 0.1));
    if (v.price) { ctx.font = `800 ${Math.min(w, h) * 0.11}px "${v.font}", Inter, sans-serif`; ctx.fillText(v.price, w / 2, h * 0.55); }
    if (v.cta) {
      ctx.font = `700 ${Math.min(w, h) * 0.05}px "${v.font}", Inter, sans-serif`;
      const tw = ctx.measureText(v.cta).width + m * 2, bh = Math.min(w, h) * 0.1;
      ctx.fillStyle = "#fff"; roundRect(ctx, w / 2 - tw / 2, h * 0.68, tw, bh, bh / 2); ctx.fill();
      ctx.fillStyle = v.color; ctx.fillText(v.cta, w / 2, h * 0.68 + bh / 2);
    }
    if (v.brandName) { ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = `700 ${Math.min(w, h) * 0.04}px "${v.font}", Inter, sans-serif`; ctx.fillText(v.brandName.toUpperCase(), w / 2, h - m * 1.5); }
    return total;
  }
  const i = Math.min(n - 1, Math.floor(t / v.secondsPerSlide));
  const local = (t - i * v.secondsPerSlide) / v.secondsPerSlide; // 0..1
  const img = v.images[i];
  const iw = img.naturalWidth, ih = img.naturalHeight;
  // Blurred cover background + the whole photo on top ("contain"), so nothing is cut off.
  const cover = Math.max(w / iw, h / ih);
  ctx.save(); ctx.filter = "blur(24px) brightness(0.55)"; ctx.drawImage(img, (w - iw * cover) / 2, (h - ih * cover) / 2, iw * cover, ih * cover); ctx.restore();
  const contain = Math.min((w - m * 2) / iw, (h * 0.7) / ih);
  const zoom = v.style === "zoom" ? 1 + 0.08 * local : 1;
  const dx = v.style === "slide" ? (1 - ease(Math.min(1, local * 3))) * w * 0.3 : 0;
  const dw = iw * contain * zoom, dh = ih * contain * zoom;
  ctx.globalAlpha = v.style === "fade" ? Math.min(1, local * 4, (1 - local) * 4) : Math.min(1, local * 6);
  ctx.drawImage(img, (w - dw) / 2 + dx, h * 0.42 - dh / 2, dw, dh);
  ctx.globalAlpha = 1;
  // Subtitles.
  const cap = v.captions[i] || (i === 0 ? v.title : "");
  if (cap) {
    ctx.font = `700 ${Math.min(w, h) * 0.055}px "${v.font}", Inter, sans-serif`;
    const ls = wrap(ctx, cap, w - m * 3);
    const lh = Math.min(w, h) * 0.07, bh = ls.length * lh + m;
    ctx.fillStyle = "rgba(0,0,0,0.6)"; roundRect(ctx, m, h - m * 1.5 - bh, w - m * 2, bh, m * 0.5); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ls.forEach((l, k) => ctx.fillText(l, w / 2, h - m * 1.5 - bh + m / 2 + k * lh));
  }
  if (v.brandName) { ctx.fillStyle = v.color; ctx.font = `800 ${Math.min(w, h) * 0.04}px "${v.font}", Inter, sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText(v.brandName.toUpperCase(), m, m); }
  // Progress bar.
  ctx.fillStyle = "rgba(255,255,255,0.25)"; ctx.fillRect(0, 0, w, 6);
  ctx.fillStyle = v.color; ctx.fillRect(0, 0, (w * t) / total, 6);
  return total;
}

export const durationOf = (v: VideoInput) => Math.max(1, v.images.length) * v.secondsPerSlide + 2;

/** Record the video in real time and return the file. */
export async function recordVideo(v: VideoInput, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<{ blob: Blob; ext: "mp4" | "webm" }> {
  const type = supportedType();
  if (!type) throw new Error("This browser cannot record video. Use a recent Chrome, Edge or Firefox.");
  const { w, h } = VIDEO_FORMATS[v.format];
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  drawFrame(ctx, v, 0);
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: 5_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  let failed: Error | null = null;
  const done = new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
    rec.onerror = () => { failed = new Error("The browser stopped recording the video."); resolve(); };
  });
  const total = durationOf(v);
  rec.start(250);
  const start = performance.now();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      drawFrame(ctx, v, Math.min(t, total));
      onProgress?.(Math.min(1, t / total));
      if (t >= total || signal?.aborted || failed) resolve(); else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  if (rec.state !== "inactive") rec.stop();
  await done;
  stream.getTracks().forEach((tr) => tr.stop());
  if (signal?.aborted) throw new DOMException("Recording cancelled", "AbortError");
  if (failed) throw failed;
  return { blob: new Blob(chunks, { type: type.mime.split(";")[0] }), ext: type.ext };
}
