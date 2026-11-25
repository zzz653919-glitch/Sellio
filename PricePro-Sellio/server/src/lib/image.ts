import { badRequest } from "./errors.js";

export type ImageInfo = { mime: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number };

/**
 * Validate an image by its actual bytes (magic numbers + header dimensions),
 * never by the client-supplied filename or content type.
 */
export function inspectImage(buf: Buffer): ImageInfo {
  if (buf.length < 32) throw badRequest("The file is too small to be an image.");

  // PNG
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // JPEG: scan for a SOFn marker
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = buf.readUInt16BE(i + 2);
      const isSof =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return { mime: "image/jpeg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    throw badRequest("Could not read the JPEG image dimensions.");
  }

  // WEBP: RIFF....WEBP
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
      return { mime: "image/webp", width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
    if (chunk === "VP8 ") {
      return { mime: "image/webp", width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { mime: "image/webp", width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
    }
  }

  throw badRequest("Unsupported image format. Upload a PNG, JPEG or WEBP image.");
}

export const MIN_IMAGE_SIDE = 256;
export const MAX_IMAGE_SIDE = 8000;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function validateProductImage(buf: Buffer): ImageInfo {
  const info = inspectImage(buf);
  if (info.width < MIN_IMAGE_SIDE || info.height < MIN_IMAGE_SIDE) {
    throw badRequest(`The image is too small (${info.width}×${info.height}). Minimum is ${MIN_IMAGE_SIDE}px on each side.`);
  }
  if (info.width > MAX_IMAGE_SIDE || info.height > MAX_IMAGE_SIDE) {
    throw badRequest(`The image is too large (${info.width}×${info.height}). Maximum is ${MAX_IMAGE_SIDE}px on each side.`);
  }
  return info;
}
