import { ensureFonts } from "./fonts";
import { withPhoto, type Photo } from "./photo";
import { loadDocImages, renderTo } from "./render";
import { docFromTemplate } from "./templates";
import type { Doc, TemplateDef, TextEl } from "./types";

/** Fonts a document needs (for ensureFonts). */
export const docFonts = (doc: Doc) => doc.els.filter((e): e is TextEl => e.type === "text").map((e) => ({ font: e.font, weight: e.weight, italic: e.italic }));

const cache = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();

/** Gallery preview of a template, with the user's photo when one is chosen (rendered one at a time so scrolling stays smooth). */
export function thumbnail(t: TemplateDef, width = 360, photo: (Photo & { id: number }) | null = null): Promise<string> {
  const key = `${t.id}@${width}#${photo?.id ?? 0}`;
  const have = cache.get(key);
  if (have) return Promise.resolve(have);
  const job = queue.then(async () => {
    const again = cache.get(key);
    if (again) return again;
    const doc = withPhoto(docFromTemplate(t), photo);
    await Promise.all([ensureFonts(docFonts(doc)), loadDocImages(doc)]);
    const canvas = document.createElement("canvas");
    renderTo(canvas, doc, width);
    const url = canvas.toDataURL("image/jpeg", 0.86);
    cache.set(key, url);
    await new Promise((r) => setTimeout(r, 0));
    return url;
  });
  queue = job.catch(() => undefined);
  return job;
}
