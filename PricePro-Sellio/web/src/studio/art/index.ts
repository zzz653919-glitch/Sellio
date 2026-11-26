import type { Art, ArtOpts } from "./types";
import { ART as A } from "./a";
import { ART as B } from "./b";
import { ART as C } from "./c";

export const ARTS: Record<string, Art> = { ...A, ...B, ...C };

/** Complete SVG document for an art piece, or null when the key is unknown. */
export function artSvg(key: string, opts: ArtOpts = {}): string | null {
  const a = ARTS[key];
  if (!a) return null;
  try {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${a.vb[0]} ${a.vb[1]}" width="${a.vb[0] * 2}" height="${a.vb[1] * 2}">${a.draw({ ...a.defaults, ...opts })}</svg>`;
  } catch {
    return null;
  }
}

/** "art:key|opt=value" source string for templates. */
export const art = (key: string, opts: ArtOpts = {}) => ["art:" + key, ...Object.entries(opts).map(([k, v]) => `${k}=${v}`)].join("|");
