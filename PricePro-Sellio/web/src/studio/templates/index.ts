import type { CategoryKey, Doc, FormatKey, TemplateDef } from "../types";
import { FORMATS } from "../types";
import { build } from "./compose";
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
const byId = new Map(TEMPLATES.map((t) => [t.id, t]));
export const getTemplateDef = (id: string) => byId.get(id) ?? null;

/** A fresh editable document from a template, in the chosen format. */
export function docFromTemplate(t: TemplateDef, format: FormatKey = "ig_square", custom?: { w: number; h: number }): Doc {
  const size = format === "custom" ? custom ?? { w: 1080, h: 1080 } : FORMATS[format];
  return { v: 1, templateId: t.id, format, w: size.w, h: size.h, bg: structuredClone(t.bg), els: structuredClone(t.els) };
}
