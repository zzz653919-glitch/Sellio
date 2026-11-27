/**
 * Theme presets for product cards: colours, fonts, decorations and the settings each theme suggests
 * (composition, background, light, angle). Choosing a theme applies all of them; every one can then be
 * changed by hand. The keys match the server's AI-photo themes (server/src/modules/cards/photos.ts).
 */
import type { Fill } from "../studio/types";

export type ThemeKey =
  | "brand" | "dark-luxury" | "light-minimal" | "flowers" | "premium-gold" | "black-white" | "modern-gradient" | "glass"
  | "neon" | "nature" | "pastel" | "marble" | "studio-3d" | "cinematic" | "pop" | "minimalist" | "beige" | "tech"
  | "abstract" | "seasonal" | "custom";
export type Deco = "goldLines" | "sparkles" | "flowers" | "leaves" | "marble" | "blobs" | "neon" | "grid" | "dots" | "podium" | "vignette" | "beam" | "pop" | "abstract" | "snow" | "bokeh";
export type ThemeCategory = "light" | "dark" | "luxury" | "colourful" | "nature" | "tech" | "seasonal";

/** Colours a theme brings; the rest of the palette is worked out from them. */
export type ThemeColors = {
  primary: string; grad2: string; accent: string;
  paper: Fill; ink: string; muted: string; panel: string; soft: string;
  hero?: Fill; onHero?: string; onPrimary?: string; onAccent?: string;
};
export type ThemePreset = {
  key: ThemeKey; name: string; description: string; categories: ThemeCategory[];
  colors: ThemeColors | null; // null: from the marketplace (brand) or the user's colours (custom)
  fonts: { head: string; body: string };
  deco: Deco[];
  suggest: { layout: string; background: string; lighting: string; angle: string };
};

const lin = (angle: number, ...c: string[]): Fill => ({ type: "linear", angle, stops: c.map((x, i) => [c.length === 1 ? 0 : i / (c.length - 1), x]) });
const rad = (...c: string[]): Fill => ({ type: "radial", cx: 0.5, cy: 0.42, r: 0.75, stops: c.map((x, i) => [c.length === 1 ? 0 : i / (c.length - 1), x]) });

/** Season of the year (northern hemisphere) for the Seasonal theme. */
export function season(d = new Date()): "winter" | "spring" | "summer" | "autumn" {
  const m = d.getMonth();
  return m === 11 || m <= 1 ? "winter" : m <= 4 ? "spring" : m <= 7 ? "summer" : "autumn";
}
const SEASON_COLORS: Record<ReturnType<typeof season>, { colors: ThemeColors; deco: Deco[] }> = {
  winter: { colors: { primary: "#2563EB", grad2: "#1E3A8A", accent: "#E0F2FE", paper: lin(180, "#F0F7FF", "#DCEBFF"), ink: "#0F2350", muted: "#48608F", panel: "#FFFFFF", soft: "#E3EEFF", onAccent: "#0F2350" }, deco: ["snow"] },
  spring: { colors: { primary: "#16A34A", grad2: "#15803D", accent: "#F9A8D4", paper: lin(180, "#F2FBF3", "#FDF2F8"), ink: "#163B22", muted: "#4E6B57", panel: "#FFFFFF", soft: "#E3F6E7", onAccent: "#4A1D33" }, deco: ["flowers"] },
  summer: { colors: { primary: "#0EA5E9", grad2: "#0369A1", accent: "#FACC15", paper: lin(180, "#FFFBEA", "#E0F7FF"), ink: "#0B3045", muted: "#4B6878", panel: "#FFFFFF", soft: "#FFF3C4", onAccent: "#3A2C00" }, deco: ["bokeh"] },
  autumn: { colors: { primary: "#C2410C", grad2: "#7C2D12", accent: "#F59E0B", paper: lin(180, "#FFF7ED", "#FCE9D6"), ink: "#431A07", muted: "#8A5634", panel: "#FFFDF9", soft: "#FCE3CC", onAccent: "#3B1D02" }, deco: ["leaves"] },
};

export const THEMES: ThemePreset[] = [
  { key: "brand", name: "Marketplace colours", description: "Clean card in the colours of the chosen marketplace.", categories: ["light", "colourful"], colors: null,
    fonts: { head: "Montserrat", body: "Inter" }, deco: [], suggest: { layout: "", background: "auto", lighting: "soft", angle: "auto" } },
  { key: "dark-luxury", name: "Dark Luxury", description: "Deep black, soft gold accents and dramatic light for premium goods.", categories: ["dark", "luxury"],
    colors: { primary: "#C9A227", grad2: "#7A5F12", accent: "#E9C46A", paper: lin(180, "#0E0E11", "#1C1B20"), ink: "#F5F1E8", muted: "#B3ABA0", panel: "rgba(255,255,255,0.06)", soft: "rgba(201,162,39,0.12)", hero: lin(160, "#141317", "#2B2418"), onHero: "#F5F1E8", onPrimary: "#141108", onAccent: "#141108" },
    fonts: { head: "Playfair Display", body: "Inter" }, deco: ["goldLines", "bokeh"], suggest: { layout: "poster", background: "black", lighting: "dramatic", angle: "angle45" } },
  { key: "light-minimal", name: "Light Minimal", description: "Bright white space, thin type and nothing extra.", categories: ["light"],
    colors: { primary: "#111827", grad2: "#374151", accent: "#111827", paper: "#FFFFFF", ink: "#111827", muted: "#6B7280", panel: "#F4F5F7", soft: "#F1F2F4", onAccent: "#FFFFFF" },
    fonts: { head: "Inter", body: "Inter" }, deco: [], suggest: { layout: "minimal", background: "white", lighting: "soft", angle: "front" } },
  { key: "flowers", name: "Flowers Style", description: "Petals and flowers around the product, romantic and soft.", categories: ["light", "nature"],
    colors: { primary: "#D9577F", grad2: "#A3325A", accent: "#F7B7C9", paper: lin(180, "#FFF6F8", "#FDE7EE"), ink: "#4A1D2F", muted: "#8E5A6E", panel: "#FFFFFF", soft: "#FCE4EC", onAccent: "#4A1D2F" },
    fonts: { head: "Cormorant Garamond", body: "Raleway" }, deco: ["flowers"], suggest: { layout: "frame", background: "flowers", lighting: "soft", angle: "angle45" } },
  { key: "premium-gold", name: "Premium Gold", description: "Black and champagne gold with sparkles: jewellery, perfume, gifts.", categories: ["dark", "luxury"],
    colors: { primary: "#D4AF37", grad2: "#9C7A1C", accent: "#F3D77A", paper: lin(180, "#15120E", "#28211A"), ink: "#F8EFD8", muted: "#C2B28C", panel: "rgba(255,215,140,0.08)", soft: "rgba(212,175,55,0.14)", hero: lin(160, "#1A1510", "#3D2E14"), onHero: "#F8EFD8", onPrimary: "#1A1408", onAccent: "#1A1408" },
    fonts: { head: "Playfair Display", body: "Montserrat" }, deco: ["goldLines", "sparkles"], suggest: { layout: "editorial", background: "black", lighting: "golden", angle: "three-quarter" } },
  { key: "black-white", name: "Black & White", description: "Strong monochrome graphic look; the product keeps its colours.", categories: ["light"],
    colors: { primary: "#000000", grad2: "#262626", accent: "#000000", paper: "#FFFFFF", ink: "#000000", muted: "#525252", panel: "#F2F2F2", soft: "#EDEDED", hero: "#000000", onHero: "#FFFFFF", onAccent: "#FFFFFF" },
    fonts: { head: "Oswald", body: "Inter" }, deco: [], suggest: { layout: "halves", background: "white", lighting: "studio", angle: "front" } },
  { key: "modern-gradient", name: "Modern Gradient", description: "Vivid violet-to-pink gradient, bold modern type.", categories: ["colourful"],
    colors: { primary: "#6366F1", grad2: "#EC4899", accent: "#F59E0B", paper: lin(180, "#EEF0FF", "#FDF0F7"), ink: "#1E1B4B", muted: "#5B5B82", panel: "#FFFFFF", soft: "#E8E9FF", hero: lin(135, "#6366F1", "#EC4899"), onHero: "#FFFFFF", onAccent: "#1E1B00" },
    fonts: { head: "Montserrat", body: "Inter" }, deco: ["blobs"], suggest: { layout: "bold", background: "gradient", lighting: "studio", angle: "angle45" } },
  { key: "glass", name: "Glassmorphism", description: "Frosted glass panels over soft coloured lights.", categories: ["dark", "tech", "colourful"],
    colors: { primary: "#818CF8", grad2: "#C084FC", accent: "#F472B6", paper: lin(135, "#1E1B4B", "#3B0764"), ink: "#FFFFFF", muted: "#C7D2FE", panel: "rgba(255,255,255,0.12)", soft: "rgba(255,255,255,0.10)", hero: lin(135, "#4F46E5", "#9333EA"), onHero: "#FFFFFF", onPrimary: "#14123A", onAccent: "#3A0A24" },
    fonts: { head: "Montserrat", body: "Inter" }, deco: ["blobs"], suggest: { layout: "glass", background: "gradient", lighting: "neon", angle: "angle45" } },
  { key: "neon", name: "Futuristic Neon", description: "Dark scene with glowing pink and cyan neon lines.", categories: ["dark", "tech"],
    colors: { primary: "#22D3EE", grad2: "#A855F7", accent: "#F472B6", paper: lin(180, "#07070D", "#140A24"), ink: "#FFFFFF", muted: "#A5B4FC", panel: "rgba(255,255,255,0.06)", soft: "rgba(34,211,238,0.12)", hero: lin(160, "#0B0B1A", "#2A0B3E"), onHero: "#FFFFFF", onPrimary: "#04121A", onAccent: "#1F0614" },
    fonts: { head: "Oswald", body: "Inter" }, deco: ["neon", "grid"], suggest: { layout: "dark", background: "black", lighting: "neon", angle: "low" } },
  { key: "nature", name: "Nature & Organic", description: "Leaves, wood and warm daylight for natural and eco products.", categories: ["light", "nature"],
    colors: { primary: "#2F6B3F", grad2: "#1E4D2B", accent: "#C8A96A", paper: lin(180, "#F5F2E9", "#E6EEDD"), ink: "#1F3A2B", muted: "#5E7363", panel: "#FFFFFF", soft: "#E3ECDA", onAccent: "#1F3A2B" },
    fonts: { head: "Cormorant Garamond", body: "Raleway" }, deco: ["leaves"], suggest: { layout: "circle", background: "nature", lighting: "natural", angle: "angle45" } },
  { key: "pastel", name: "Pastel Soft", description: "Gentle pink, mint and lavender, friendly and light.", categories: ["light", "colourful"],
    colors: { primary: "#F472B6", grad2: "#818CF8", accent: "#FDE68A", paper: lin(160, "#FFF1F6", "#EEF4FF"), ink: "#3B3355", muted: "#7C7499", panel: "#FFFFFF", soft: "#FCE7F3", hero: lin(135, "#FBCFE8", "#C7D2FE"), onHero: "#3B3355", onPrimary: "#FFFFFF", onAccent: "#3B3355" },
    fonts: { head: "Nunito", body: "Nunito" }, deco: ["dots"], suggest: { layout: "hero", background: "auto", lighting: "soft", angle: "front" } },
  { key: "marble", name: "Luxury Marble", description: "White marble with fine veins and a touch of gold.", categories: ["light", "luxury"],
    colors: { primary: "#1C1917", grad2: "#44403C", accent: "#B08D57", paper: "#F4F3F1", ink: "#1C1917", muted: "#78716C", panel: "rgba(255,255,255,0.86)", soft: "rgba(255,255,255,0.7)", onAccent: "#FFFFFF" },
    fonts: { head: "Playfair Display", body: "Raleway" }, deco: ["marble", "goldLines"], suggest: { layout: "editorial", background: "marble", lighting: "soft", angle: "three-quarter" } },
  { key: "studio-3d", name: "3D Studio", description: "Clean studio set with a podium and soft light.", categories: ["light", "tech"],
    colors: { primary: "#2563EB", grad2: "#1E40AF", accent: "#F59E0B", paper: rad("#FFFFFF", "#DDE1E7"), ink: "#111827", muted: "#6B7280", panel: "#FFFFFF", soft: "#E8EDF6", onAccent: "#1F1300" },
    fonts: { head: "Montserrat", body: "Inter" }, deco: ["podium"], suggest: { layout: "minimal", background: "studio", lighting: "studio", angle: "angle45" } },
  { key: "cinematic", name: "Cinematic", description: "Moody film light, deep shadows and warm highlights.", categories: ["dark"],
    colors: { primary: "#F59E0B", grad2: "#B45309", accent: "#F59E0B", paper: lin(180, "#0B0F14", "#1B2430"), ink: "#F1F5F9", muted: "#94A3B8", panel: "rgba(255,255,255,0.06)", soft: "rgba(245,158,11,0.12)", hero: lin(170, "#0B0F14", "#2A2117"), onHero: "#F1F5F9", onPrimary: "#140C00", onAccent: "#140C00" },
    fonts: { head: "Oswald", body: "Inter" }, deco: ["vignette", "beam"], suggest: { layout: "poster", background: "black", lighting: "dramatic", angle: "low" } },
  { key: "pop", name: "Colorful Pop", description: "Bright colour blocks and playful shapes that catch the eye.", categories: ["colourful"],
    colors: { primary: "#FF3D7F", grad2: "#7C3AED", accent: "#00C2FF", paper: "#FFE14D", ink: "#151515", muted: "#3B3B3B", panel: "#FFFFFF", soft: "#FFF3A6", hero: lin(135, "#FF3D7F", "#FF8A00"), onHero: "#FFFFFF", onAccent: "#04212C" },
    fonts: { head: "Rubik", body: "Rubik" }, deco: ["pop"], suggest: { layout: "sale", background: "auto", lighting: "studio", angle: "angle45" } },
  { key: "minimalist", name: "Minimalist", description: "One calm colour, one product, lots of space.", categories: ["light"],
    colors: { primary: "#1A1A1A", grad2: "#444444", accent: "#1A1A1A", paper: "#F3F2EE", ink: "#1A1A1A", muted: "#777777", panel: "#FFFFFF", soft: "#E9E7E1", onAccent: "#FFFFFF" },
    fonts: { head: "Raleway", body: "Inter" }, deco: [], suggest: { layout: "minimal", background: "auto", lighting: "soft", angle: "front" } },
  { key: "beige", name: "Elegant Beige", description: "Warm beige and cream with refined serif type.", categories: ["light", "luxury"],
    colors: { primary: "#A47E5A", grad2: "#7C5B3E", accent: "#D9C3A5", paper: lin(180, "#F8F2E9", "#EEE3D2"), ink: "#3D2E22", muted: "#8A7461", panel: "#FFFDF9", soft: "#F1E6D6", onAccent: "#3D2E22" },
    fonts: { head: "Cormorant Garamond", body: "Raleway" }, deco: [], suggest: { layout: "frame", background: "beige", lighting: "natural", angle: "three-quarter" } },
  { key: "tech", name: "Tech Style", description: "Dark blue, precise lines and a grid for gadgets and electronics.", categories: ["dark", "tech"],
    colors: { primary: "#38BDF8", grad2: "#2563EB", accent: "#22D3EE", paper: lin(180, "#0B1220", "#111C33"), ink: "#E2E8F0", muted: "#94A3B8", panel: "rgba(56,189,248,0.08)", soft: "rgba(56,189,248,0.12)", hero: lin(160, "#0B1220", "#0F2A4A"), onHero: "#E2E8F0", onPrimary: "#04131F", onAccent: "#04131F" },
    fonts: { head: "Rubik", body: "Inter" }, deco: ["grid"], suggest: { layout: "split", background: "black", lighting: "studio", angle: "isometric" } },
  { key: "abstract", name: "Creative Abstract", description: "Bold abstract shapes in orange, pink and indigo.", categories: ["colourful"],
    colors: { primary: "#F97316", grad2: "#DB2777", accent: "#6366F1", paper: "#FFF7ED", ink: "#1E1B4B", muted: "#6B6B8A", panel: "#FFFFFF", soft: "#FFE8D2", hero: lin(135, "#F97316", "#DB2777"), onHero: "#FFFFFF", onAccent: "#FFFFFF" },
    fonts: { head: "Montserrat", body: "Inter" }, deco: ["abstract"], suggest: { layout: "diagonal", background: "auto", lighting: "studio", angle: "angle45" } },
  { key: "seasonal", name: "Seasonal Style", description: "Colours and decorations of the current season.", categories: ["seasonal", "colourful"],
    colors: null, fonts: { head: "Montserrat", body: "Raleway" }, deco: [], suggest: { layout: "hero", background: "auto", lighting: "natural", angle: "auto" } },
  { key: "custom", name: "Custom Style", description: "Your own colours, font and background.", categories: ["light"],
    colors: null, fonts: { head: "Montserrat", body: "Inter" }, deco: [], suggest: { layout: "", background: "auto", lighting: "soft", angle: "auto" } },
];
export const THEME_BY_KEY = Object.fromEntries(THEMES.map((t) => [t.key, t])) as Record<ThemeKey, ThemePreset>;
export const THEME_CATEGORIES: { key: ThemeCategory | "all"; label: string }[] = [
  { key: "all", label: "All" }, { key: "light", label: "Light" }, { key: "dark", label: "Dark" }, { key: "luxury", label: "Luxury" },
  { key: "colourful", label: "Colourful" }, { key: "nature", label: "Nature" }, { key: "tech", label: "Tech" }, { key: "seasonal", label: "Seasonal" },
];

/** Colours and decorations of the Seasonal theme right now. */
export const seasonalNow = () => SEASON_COLORS[season()];

export const FONT_PAIRS: Record<string, { label: string; head: string; body: string } | null> = {
  theme: null,
  modern: { label: "Modern (Montserrat)", head: "Montserrat", body: "Inter" },
  elegant: { label: "Elegant serif (Playfair)", head: "Playfair Display", body: "Inter" },
  classic: { label: "Classic (Cormorant)", head: "Cormorant Garamond", body: "Raleway" },
  bold: { label: "Bold condensed (Oswald)", head: "Oswald", body: "Inter" },
  friendly: { label: "Friendly rounded (Nunito)", head: "Nunito", body: "Nunito" },
  geometric: { label: "Geometric (Rubik)", head: "Rubik", body: "Rubik" },
  clean: { label: "Clean (Inter)", head: "Inter", body: "Inter" },
};
