/**
 * Ad design documents. Every position and size is a fraction of the canvas (0..1), so one design
 * works in every format; text sizes are in "units" (1 unit = 1/1000 of the shorter canvas side).
 */
export type Stop = [offset: number, color: string];
export type Fill =
  | string
  | { type: "linear"; angle: number; stops: Stop[] }
  | { type: "radial"; cx: number; cy: number; r: number; stops: Stop[] };

type Base = {
  id: string;
  x: number; y: number; w: number; h: number;
  /** Rotation in degrees around the centre. */
  rot?: number;
  opacity?: number;
  /** Shown in the layer list. */
  name?: string;
};

export type TextRole = "headline" | "subline" | "desc" | "price" | "oldPrice" | "discount" | "cta" | "brand" | "label";
export type TextBg = {
  fill: Fill;
  shape: "box" | "pill" | "circle" | "burst";
  /** Corner radius in units (box only). */
  radius?: number;
  /** Padding in units. */
  padX: number; padY: number;
  stroke?: string; strokeW?: number;
  /** Stretch the background to the whole element box instead of hugging the text. */
  full?: boolean;
};
export type TextEl = Base & {
  type: "text";
  role?: TextRole;
  text: string;
  font: string;
  size: number;
  weight: number;
  italic?: boolean;
  color: string;
  align: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
  lineHeight?: number;
  /** Letter spacing in em. */
  spacing?: number;
  upper?: boolean;
  strike?: boolean;
  shadow?: boolean;
  /** Second colour for the lines after the first (two-tone headlines). */
  color2?: string;
  bg?: TextBg;
};

export type ImageEl = Base & {
  type: "image";
  /** "art:<key>|opt=value|..." for built-in illustrations, or a data:/blob:/https URL. */
  src: string;
  fit: "contain" | "cover";
  mask?: "none" | "circle" | "rounded" | "arch";
  /** Corner radius in units for the "rounded" mask. */
  radius?: number;
  /** Zoom (1 = fit) and offset (fraction of the box) to adjust what part of the image is shown. */
  zoom?: number; dx?: number; dy?: number;
  flip?: boolean;
  shadow?: boolean;
  /** Border in units around masked images. */
  border?: { color: string; width: number };
};

export type ShapeKind =
  | "rect" | "circle" | "ring" | "triangle" | "star" | "burst" | "diamond" | "arch" | "blob"
  | "line" | "dots" | "stripes" | "wave" | "sparkle" | "heart" | "halfcircle" | "plus" | "arrow";
export type ShapeEl = Base & {
  type: "shape";
  shape: ShapeKind;
  fill: Fill;
  stroke?: string;
  /** Stroke width in units. */
  strokeW?: number;
  /** Corner radius in units (rect). */
  radius?: number;
  /** Keep a 1:1 aspect (circles, stars) inside the box in every format. */
  keep?: boolean;
  blur?: number;
};

export type El = TextEl | ImageEl | ShapeEl;

export type Doc = {
  v: 1;
  templateId: string;
  format: FormatKey;
  w: number; h: number;
  bg: Fill;
  els: El[];
};

export type FormatKey = "ig_square" | "ig_portrait" | "ig_story" | "fb_post" | "fb_landscape" | "custom";
export const FORMATS: Record<Exclude<FormatKey, "custom">, { label: string; w: number; h: number }> = {
  ig_square: { label: "Instagram square post", w: 1080, h: 1080 },
  ig_portrait: { label: "Instagram portrait post", w: 1080, h: 1350 },
  ig_story: { label: "Instagram story", w: 1080, h: 1920 },
  fb_post: { label: "Facebook post", w: 1200, h: 1200 },
  fb_landscape: { label: "Facebook landscape", w: 1200, h: 628 },
};

export type CategoryKey =
  | "fashion" | "electronics" | "beauty" | "food" | "sale" | "furniture"
  | "sports" | "travel" | "auto" | "business" | "education" | "gifts";

export type TemplateDef = {
  id: string;
  name: string;
  category: CategoryKey;
  tags: string[];
  /** Design for a square canvas; other formats reuse it (positions are fractions). */
  bg: Fill;
  els: El[];
};
