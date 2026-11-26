import type { CategoryKey, Doc, FormatKey, TemplateDef } from "../types";
import { FORMATS } from "../types";
import { build, img, lin, pill, rect, text } from "./compose";
import { BEAUTY, ELECTRONICS, FASHION, FOOD } from "./list1";
import { FURNITURE, SALE, SPORTS, TRAVEL } from "./list2";
import { AUTO, BUSINESS, EDUCATION, GIFTS } from "./list3";

export const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: "fashion", label: "Fashion & Clothing" },
  { key: "electronics", label: "Electronics & Technology" },
  { key: "beauty", label: "Beauty & Cosmetics" },
  { key: "food", label: "Food & Restaurants" },
  { key: "sale", label: "Discounts & Special Offers" },
  { key: "furniture", label: "Furniture & Interior" },
  { key: "sports", label: "Sports & Fitness" },
  { key: "travel", label: "Travel & Tourism" },
  { key: "auto", label: "Automotive" },
  { key: "business", label: "Business & Services" },
  { key: "education", label: "Education & Courses" },
  { key: "gifts", label: "Gifts & Special Events" },
];

export const TEMPLATES: TemplateDef[] = [FASHION, ELECTRONICS, BEAUTY, FOOD, SALE, FURNITURE, SPORTS, TRAVEL, AUTO, BUSINESS, EDUCATION, GIFTS].flat().map(build);
/**
 * Not in the gallery: an AI Product Studio image opened in the editor. The picture fills the canvas;
 * a headline, a short line and a button sit on a soft dark band at the bottom.
 */
export const PHOTO_AD_ID = "photo-ad";
const PHOTO_AD: TemplateDef = {
  id: PHOTO_AD_ID, name: "AI advertisement", category: "sale", tags: [], bg: "#0f172a",
  els: [
    img("", 0, 0, 1, 1, { fit: "cover", shadow: false }),
    rect(0, 0.55, 1, 0.45, lin(180, "rgba(15,23,42,0)", "rgba(15,23,42,0.78)")),
    text("Your headline", 0.07, 0.66, 0.86, 0.11, { role: "headline", name: "Headline", font: "Montserrat", weight: 800, size: 86, color: "#ffffff", shadow: true }),
    text("A short line about the offer", 0.07, 0.78, 0.86, 0.05, { role: "subline", name: "Description", size: 34, weight: 500, color: "#e2e8f0" }),
    text("Order now →", 0.07, 0.86, 0.6, 0.075, { role: "cta", name: "Button", size: 30, weight: 700, color: "#0f172a", valign: "middle", bg: pill("#ffffff", 30, 14) }),
  ].map((p, i) => ({ ...p, id: `${PHOTO_AD_ID}-${i}` }) as TemplateDef["els"][number]),
};
const byId = new Map([...TEMPLATES, PHOTO_AD].map((t) => [t.id, t]));
export const getTemplateDef = (id: string) => byId.get(id) ?? null;

/** A fresh editable document from a template, in the chosen format. */
export function docFromTemplate(t: TemplateDef, format: FormatKey = "ig_square", custom?: { w: number; h: number }): Doc {
  const size = format === "custom" ? custom ?? { w: 1080, h: 1080 } : FORMATS[format];
  return { v: 1, templateId: t.id, format, w: size.w, h: size.h, bg: structuredClone(t.bg), els: structuredClone(t.els) };
}
