/**
 * Minimal PNG decode / encode (8-bit RGB or RGBA, not interlaced) and a white-background cut-out,
 * using only node:zlib. Used when the AI image model cannot return a transparent background itself:
 * the image is made on plain white and the white that touches the edges is turned transparent.
 */
import zlib from "node:zlib";

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type Rgba = { width: number; height: number; data: Buffer }; // data: width*height*4

/** Decodes an 8-bit RGB / RGBA non-interlaced PNG; null for anything else. */
export function decodePng(buf: Buffer): Rgba | null {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(SIG)) return null;
  let pos = 8, width = 0, height = 0, depth = 0, color = 0, interlace = 0;
  const idat: Buffer[] = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; color = body[9]; interlace = body[12]; }
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (!width || !height || depth !== 8 || interlace !== 0 || (color !== 2 && color !== 6)) return null;
  const bpp = color === 6 ? 4 : 3;
  let raw: Buffer;
  try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch { return null; }
  const stride = width * bpp;
  if (raw.length < (stride + 1) * height) return null;
  const out = Buffer.alloc(width * height * 4);
  const prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    raw.copy(cur, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = cur[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = cur[x * bpp]; out[o + 1] = cur[x * bpp + 1]; out[o + 2] = cur[x * bpp + 2]; out[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    cur.copy(prev);
  }
  return { width, height, data: out };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(b: Buffer) { let c = 0xffffffff; for (const x of b) c = CRC_TABLE[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type: string, body: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, "latin1"), body]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
}

/** Encodes RGBA as a PNG (filter 0 rows, deflate). */
export function encodePng(img: Rgba): Buffer {
  const { width, height, data } = img;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
}

/**
 * Makes the plain light background transparent: everything near-white that is connected to the
 * image edges becomes clear, with a soft one-pixel edge and the white fringe removed from it.
 * Returns null when the edges are not mostly near-white (then the image is left as it is).
 */
export function cutOutWhite(img: Rgba, opts: { solid?: number; soft?: number } = {}): Rgba | null {
  const { width: w, height: h, data } = img;
  const solid = opts.solid ?? 22, soft = opts.soft ?? 60;
  // How far a pixel is from white (max of the three channel distances).
  const dist = (i: number) => 255 - Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  let edge = 0, white = 0;
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { edge++; if (dist(y * w + x) < solid) white++; }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { edge++; if (dist(y * w + x) < solid) white++; }
  if (white < edge * 0.7) return null;
  const bg = new Uint8Array(w * h); // 1 = background
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const push = (i: number) => { if (!bg[i] && dist(i) < solid) { bg[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (head < tail) {
    const i = queue[head++], x = i % w, y = (i - x) / w;
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w);
  }
  const out = Buffer.from(data);
  for (let i = 0; i < w * h; i++) {
    if (bg[i]) { out[i * 4 + 3] = 0; continue; }
    // Soft edge: light pixels right next to the background get partial alpha.
    const x = i % w, y = (i - x) / w;
    const nearBg = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w]);
    const d = dist(i);
    if (nearBg && d < soft) {
      const a = Math.max(0.05, (d - solid) / (soft - solid));
      out[i * 4 + 3] = Math.round(a * 255);
      // Remove the white mixed into the edge colour.
      for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.max(0, Math.min(255, Math.round((data[i * 4 + c] - 255 * (1 - a)) / a)));
    }
  }
  return { width: w, height: h, data: out };
}
