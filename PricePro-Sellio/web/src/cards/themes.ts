/**
 * Theme presets for product cards: colours, fonts, decorations and the settings each theme suggests
 * (composition, background, light, angle). Choosing a theme applies all of them; every one can then be
 * changed by hand. The keys match the server's AI-photo themes (server/src/modules/cards/photos.ts).
 */
import type { Fill } from "../studio/types";

export type ThemeKey =
  | "brand" | "dark-luxury" | "light-minimal" | "flowers" | "premium-gold" | "black-white" | "modern-gradient" | "glass"
  | "neon" | "nature" | "pastel" | "marble" | "studio-3d" | "cinematic" | "pop" | "minimalist" | "beige" | "tech"
  | "abstract" | "seasonal" | "custom"
  // 20 more designs
  | "cyberpunk" | "royal" | "botanical" | "zen" | "swiss" | "glass-premium" | "black-gold" | "pastel-dream" | "concrete"
  | "floating" | "neon-gradient" | "fashion" | "earth" | "holo" | "medical" | "retro" | "motion" | "architect" | "marble-studio" | "geometry";
export type Deco = "goldLines" | "sparkles" | "flowers" | "leaves" | "marble" | "blobs" | "neon" | "grid" | "dots" | "podium" | "vignette" | "beam" | "pop" | "abstract" | "snow" | "bokeh"
  | "cyber" | "royal" | "botanical" | "zen" | "swiss" | "glassPanels" | "artdeco" | "clouds" | "concrete" | "floating" | "halo" | "fashion" | "earth" | "holo"
  | "medical" | "retro" | "motion" | "arches" | "marbleFloor" | "geometry";
export type ThemeCategory = "light" | "dark" | "luxury" | "colourful" | "nature" | "tech" | "seasonal" | "minimal" | "futuristic" | "creative" | "editorial" | "professional";

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

/** The five designs in each theme's folder (all in the same theme, different compositions). */
export const THEME_LAYOUTS: Record<ThemeKey, string[]> = {
  brand: ["hero", "bold", "split", "specs", "minimal"],
  "dark-luxury": ["poster", "dark", "editorial", "minimal", "halves"],
  "light-minimal": ["minimal", "hero", "halves", "specs", "editorial"],
  flowers: ["frame", "hero", "circle", "minimal", "lifestyle"],
  "premium-gold": ["editorial", "poster", "dark", "frame", "minimal"],
  "black-white": ["halves", "minimal", "specs", "editorial", "poster"],
  "modern-gradient": ["bold", "glass", "hero", "sale", "split"],
  glass: ["glass", "poster", "bold", "circle", "halves"],
  neon: ["dark", "poster", "glass", "split", "bold"],
  nature: ["circle", "frame", "lifestyle", "minimal", "editorial"],
  pastel: ["hero", "circle", "frame", "bold", "minimal"],
  marble: ["editorial", "minimal", "frame", "specs", "poster"],
  "studio-3d": ["minimal", "hero", "split", "specs", "beforeAfter"],
  cinematic: ["poster", "dark", "lifestyle", "halves", "editorial"],
  pop: ["sale", "bold", "diagonal", "hero", "circle"],
  minimalist: ["minimal", "halves", "editorial", "specs", "hero"],
  beige: ["frame", "editorial", "minimal", "circle", "halves"],
  tech: ["split", "specs", "dark", "multiAngle", "bold"],
  abstract: ["diagonal", "sale", "bold", "hero", "glass"],
  seasonal: ["hero", "frame", "circle", "sale", "minimal"],
  custom: ["hero", "halves", "bold", "split", "minimal"],
  cyberpunk: ["poster", "diagonal", "dark", "split", "bold"],
  royal: ["frame", "editorial", "circle", "poster", "halves"],
  botanical: ["circle", "lifestyle", "hero", "frame", "halves"],
  zen: ["minimal", "halves", "circle", "editorial", "specs"],
  swiss: ["specs", "split", "editorial", "multiAngle", "halves"],
  "glass-premium": ["glass", "circle", "poster", "bold", "halves"],
  "black-gold": ["poster", "frame", "dark", "minimal", "editorial"],
  "pastel-dream": ["circle", "hero", "bold", "frame", "minimal"],
  concrete: ["split", "halves", "bold", "specs", "diagonal"],
  floating: ["minimal", "hero", "circle", "poster", "glass"],
  "neon-gradient": ["bold", "sale", "glass", "poster", "diagonal"],
  fashion: ["editorial", "halves", "minimal", "lifestyle", "frame"],
  earth: ["circle", "frame", "halves", "minimal", "lifestyle"],
  holo: ["glass", "hero", "bold", "circle", "split"],
  medical: ["specs", "hero", "split", "multiAngle", "minimal"],
  retro: ["bold", "sale", "circle", "hero", "frame"],
  motion: ["diagonal", "sale", "bold", "split", "poster"],
  architect: ["minimal", "hero", "halves", "lifestyle", "editorial"],
  "marble-studio": ["minimal", "hero", "specs", "circle", "poster"],
  geometry: ["hero", "circle", "bold", "diagonal", "glass"],
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
  { key: "dark-luxury", name: "Dark Luxury", description: "Deep black, soft gold accents and dramatic light for premium goods.", categories: ["dark", "luxury", "editorial"],
    colors: { primary: "#C9A227", grad2: "#7A5F12", accent: "#E9C46A", paper: lin(180, "#0E0E11", "#1C1B20"), ink: "#F5F1E8", muted: "#B3ABA0", panel: "rgba(255,255,255,0.06)", soft: "rgba(201,162,39,0.12)", hero: lin(160, "#141317", "#2B2418"), onHero: "#F5F1E8", onPrimary: "#141108", onAccent: "#141108" },
    fonts: { head: "Playfair Display", body: "Inter" }, deco: ["goldLines", "bokeh"], suggest: { layout: "poster", background: "black", lighting: "dramatic", angle: "angle45" } },
  { key: "light-minimal", name: "Light Minimal", description: "Bright white space, thin type and nothing extra.", categories: ["light", "minimal"],
    colors: { primary: "#111827", grad2: "#374151", accent: "#111827", paper: "#FFFFFF", ink: "#111827", muted: "#6B7280", panel: "#F4F5F7", soft: "#F1F2F4", onAccent: "#FFFFFF" },
    fonts: { head: "Inter", body: "Inter" }, deco: [], suggest: { layout: "minimal", background: "white", lighting: "soft", angle: "front" } },
  { key: "flowers", name: "Flowers Style", description: "Petals and flowers around the product, romantic and soft.", categories: ["light", "nature"],
    colors: { primary: "#D9577F", grad2: "#A3325A", accent: "#F7B7C9", paper: lin(180, "#FFF6F8", "#FDE7EE"), ink: "#4A1D2F", muted: "#8E5A6E", panel: "#FFFFFF", soft: "#FCE4EC", onAccent: "#4A1D2F" },
    fonts: { head: "Cormorant Garamond", body: "Raleway" }, deco: ["flowers"], suggest: { layout: "frame", background: "flowers", lighting: "soft", angle: "angle45" } },
  { key: "premium-gold", name: "Premium Gold", description: "Black and champagne gold with sparkles: jewellery, perfume, gifts.", categories: ["dark", "luxury"],
    colors: { primary: "#D4AF37", grad2: "#9C7A1C", accent: "#F3D77A", paper: lin(180, "#15120E", "#28211A"), ink: "#F8EFD8", muted: "#C2B28C", panel: "rgba(255,215,140,0.08)", soft: "rgba(212,175,55,0.14)", hero: lin(160, "#1A1510", "#3D2E14"), onHero: "#F8EFD8", onPrimary: "#1A1408", onAccent: "#1A1408" },
    fonts: { head: "Playfair Display", body: "Montserrat" }, deco: ["goldLines", "sparkles"], suggest: { layout: "editorial", background: "black", lighting: "golden", angle: "three-quarter" } },
  { key: "black-white", name: "Black & White", description: "Strong monochrome graphic look; the product keeps its colours.", categories: ["light", "editorial", "minimal"],
    colors: { primary: "#000000", grad2: "#262626", accent: "#000000", paper: "#FFFFFF", ink: "#000000", muted: "#525252", panel: "#F2F2F2", soft: "#EDEDED", hero: "#000000", onHero: "#FFFFFF", onAccent: "#FFFFFF" },
    fonts: { head: "Oswald", body: "Inter" }, deco: [], suggest: { layout: "halves", background: "white", lighting: "studio", angle: "front" } },
  { key: "modern-gradient", name: "Modern Gradient", description: "Vivid violet-to-pink gradient, bold modern type.", categories: ["colourful"],
    colors: { primary: "#6366F1", grad2: "#EC4899", accent: "#F59E0B", paper: lin(180, "#EEF0FF", "#FDF0F7"), ink: "#1E1B4B", muted: "#5B5B82", panel: "#FFFFFF", soft: "#E8E9FF", hero: lin(135, "#6366F1", "#EC4899"), onHero: "#FFFFFF", onAccent: "#1E1B00" },
    fonts: { head: "Montserrat", body: "Inter" }, deco: ["blobs"], suggest: { layout: "bold", background: "gradient", lighting: "studio", angle: "angle45" } },
  { key: "glass", name: "Glassmorphism", description: "Frosted glass panels over soft coloured lights.", categories: ["dark", "tech", "colourful", "futuristic"],
    colors: { primary: "#818CF8", grad2: "#C084FC", accent: "#F472B6", paper: lin(135, "#1E1B4B", "#3B0764"), ink: "#FFFFFF", muted: "#C7D2FE", panel: "rgba(255,255,255,0.12)", soft: "rgba(255,255,255,0.10)", hero: lin(135, "#4F46E5", "#9333EA"), onHero: "#FFFFFF", onPrimary: "#14123A", onAccent: "#3A0A24" },
    fonts: { head: "Montserrat", body: "Inter" }, deco: ["blobs"], suggest: { layout: "glass", background: "gradient", lighting: "neon", angle: "angle45" } },
  { key: "neon", name: "Futuristic Neon", description: "Dark scene with glowing pink and cyan neon lines.", categories: ["dark", "tech", "futuristic"],
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
  { key: "studio-3d", name: "3D Studio", description: "Clean studio set with a podium and soft light.", categories: ["light", "tech", "professional"],
    colors: { primary: "#2563EB", grad2: "#1E40AF", accent: "#F59E0B", paper: rad("#FFFFFF", "#DDE1E7"), ink: "#111827", muted: "#6B7280", panel: "#FFFFFF", soft: "#E8EDF6", onAccent: "#1F1300" },
    fonts: { head: "Montserrat", body: "Inter" }, deco: ["podium"], suggest: { layout: "minimal", background: "studio", lighting: "studio", angle: "angle45" } },
  { key: "cinematic", name: "Cinematic", description: "Moody film light, deep shadows and warm highlights.", categories: ["dark"],
    colors: { primary: "#F59E0B", grad2: "#B45309", accent: "#F59E0B", paper: lin(180, "#0B0F14", "#1B2430"), ink: "#F1F5F9", muted: "#94A3B8", panel: "rgba(255,255,255,0.06)", soft: "rgba(245,158,11,0.12)", hero: lin(170, "#0B0F14", "#2A2117"), onHero: "#F1F5F9", onPrimary: "#140C00", onAccent: "#140C00" },
    fonts: { head: "Oswald", body: "Inter" }, deco: ["vignette", "beam"], suggest: { layout: "poster", background: "black", lighting: "dramatic", angle: "low" } },
  { key: "pop", name: "Colorful Pop", description: "Bright colour blocks and playful shapes that catch the eye.", categories: ["colourful", "creative"],
    colors: { primary: "#FF3D7F", grad2: "#7C3AED", accent: "#00C2FF", paper: "#FFE14D", ink: "#151515", muted: "#3B3B3B", panel: "#FFFFFF", soft: "#FFF3A6", hero: lin(135, "#FF3D7F", "#FF8A00"), onHero: "#FFFFFF", onAccent: "#04212C" },
    fonts: { head: "Rubik", body: "Rubik" }, deco: ["pop"], suggest: { layout: "sale", background: "auto", lighting: "studio", angle: "angle45" } },
  { key: "minimalist", name: "Minimalist", description: "One calm colour, one product, lots of space.", categories: ["light", "minimal"],
    colors: { primary: "#1A1A1A", grad2: "#444444", accent: "#1A1A1A", paper: "#F3F2EE", ink: "#1A1A1A", muted: "#777777", panel: "#FFFFFF", soft: "#E9E7E1", onAccent: "#FFFFFF" },
    fonts: { head: "Raleway", body: "Inter" }, deco: [], suggest: { layout: "minimal", background: "auto", lighting: "soft", angle: "front" } },
  { key: "beige", name: "Elegant Beige", description: "Warm beige and cream with refined serif type.", categories: ["light", "luxury"],
    colors: { primary: "#A47E5A", grad2: "#7C5B3E", accent: "#D9C3A5", paper: lin(180, "#F8F2E9", "#EEE3D2"), ink: "#3D2E22", muted: "#8A7461", panel: "#FFFDF9", soft: "#F1E6D6", onAccent: "#3D2E22" },
    fonts: { head: "Cormorant Garamond", body: "Raleway" }, deco: [], suggest: { layout: "frame", background: "beige", lighting: "natural", angle: "three-quarter" } },
  { key: "tech", name: "Tech Style", description: "Dark blue, precise lines and a grid for gadgets and electronics.", categories: ["dark", "tech", "futuristic", "professional"],
    colors: { primary: "#38BDF8", grad2: "#2563EB", accent: "#22D3EE", paper: lin(180, "#0B1220", "#111C33"), ink: "#E2E8F0", muted: "#94A3B8", panel: "rgba(56,189,248,0.08)", soft: "rgba(56,189,248,0.12)", hero: lin(160, "#0B1220", "#0F2A4A"), onHero: "#E2E8F0", onPrimary: "#04131F", onAccent: "#04131F" },
    fonts: { head: "Rubik", body: "Inter" }, deco: ["grid"], suggest: { layout: "split", background: "black", lighting: "studio", angle: "isometric" } },
  { key: "abstract", name: "Creative Abstract", description: "Bold abstract shapes in orange, pink and indigo.", categories: ["colourful", "creative"],
    colors: { primary: "#F97316", grad2: "#DB2777", accent: "#6366F1", paper: "#FFF7ED", ink: "#1E1B4B", muted: "#6B6B8A", panel: "#FFFFFF", soft: "#FFE8D2", hero: lin(135, "#F97316", "#DB2777"), onHero: "#FFFFFF", onAccent: "#FFFFFF" },
    fonts: { head: "Montserrat", body: "Inter" }, deco: ["abstract"], suggest: { layout: "diagonal", background: "auto", lighting: "studio", angle: "angle45" } },
  { key: "seasonal", name: "Seasonal Style", description: "Colours and decorations of the current season.", categories: ["seasonal", "colourful"],
    colors: null, fonts: { head: "Montserrat", body: "Raleway" }, deco: [], suggest: { layout: "hero", background: "auto", lighting: "natural", angle: "auto" } },
  { key: "custom", name: "Custom Style", description: "Your own colours, font and background.", categories: ["light"],
    colors: null, fonts: { head: "Montserrat", body: "Inter" }, deco: [], suggest: { layout: "", background: "auto", lighting: "soft", angle: "auto" } },
  // ---------------------------------------------------------------- 20 more designs
  { key: "cyberpunk", name: "Cyberpunk Neon", description: "Night city neon: glowing magenta and cyan lines, scan lines and sharp corners.", categories: ["futuristic", "dark"],
    colors: { primary: "#FF2BD6", grad2: "#00E5FF", accent: "#FFE600", paper: lin(165, "#07010F", "#1A0433"), ink: "#F5F3FF", muted: "#C4B5FD", panel: "rgba(255,43,214,0.08)", soft: "rgba(0,229,255,0.10)", hero: lin(160, "#0A0118", "#2B0650"), onHero: "#FFFFFF", onPrimary: "#0A0118", onAccent: "#0A0118" },
    fonts: { head: "Anton", body: "Rubik" }, deco: ["cyber"], suggest: { layout: "poster", background: "black", lighting: "neon", angle: "low" } },
  { key: "royal", name: "Luxury Royal", description: "Burgundy and gold, an ornamental double frame and classic serif type.", categories: ["luxury", "editorial"],
    colors: { primary: "#7A1F3D", grad2: "#3E0B1F", accent: "#C9A227", paper: lin(180, "#FBF6EE", "#F1E4CF"), ink: "#2B0A16", muted: "#7A5A63", panel: "#FFFDF8", soft: "#F3E7D7", hero: lin(160, "#4A0E24", "#1E040D"), onHero: "#F8E9C8", onPrimary: "#FFF6E0", onAccent: "#2B0A16" },
    fonts: { head: "Cormorant Garamond", body: "Raleway" }, deco: ["royal"], suggest: { layout: "frame", background: "beige", lighting: "golden", angle: "three-quarter" } },
  { key: "botanical", name: "Botanical Garden", description: "Lush leaves and blossoms around the product, a fresh garden mood.", categories: ["nature", "light"],
    colors: { primary: "#2F6B3A", grad2: "#1C4424", accent: "#F2A65A", paper: lin(180, "#F4FAEF", "#E4F1DA"), ink: "#17311C", muted: "#557159", panel: "#FFFFFF", soft: "#DDEED3", onAccent: "#3A2208" },
    fonts: { head: "DM Serif Display", body: "Nunito" }, deco: ["botanical"], suggest: { layout: "circle", background: "nature", lighting: "natural", angle: "angle45" } },
  { key: "zen", name: "Japanese Zen", description: "Washi paper, an ensō circle, a red sun and seal — quiet Japanese calm.", categories: ["minimal", "light"],
    colors: { primary: "#B4372B", grad2: "#7D2219", accent: "#B4372B", paper: lin(180, "#F6F2E9", "#ECE5D6"), ink: "#2A2622", muted: "#7D756B", panel: "#FBF8F2", soft: "#E9E2D4", onAccent: "#FFFFFF" },
    fonts: { head: "Cormorant Garamond", body: "Raleway" }, deco: ["zen"], suggest: { layout: "minimal", background: "beige", lighting: "soft", angle: "front" } },
  { key: "swiss", name: "Swiss Editorial", description: "Strict grid, bold sans type and a red block — the international typographic style.", categories: ["editorial", "minimal", "professional"],
    colors: { primary: "#E30613", grad2: "#A3000C", accent: "#111111", paper: "#FFFFFF", ink: "#111111", muted: "#555555", panel: "#F2F2F2", soft: "#EEEEEE", hero: "#E30613", onHero: "#FFFFFF", onPrimary: "#FFFFFF", onAccent: "#FFFFFF" },
    fonts: { head: "Archivo Black", body: "Inter" }, deco: ["swiss"], suggest: { layout: "specs", background: "white", lighting: "studio", angle: "front" } },
  { key: "glass-premium", name: "Glass Premium", description: "Clear glass panels with reflections and depth over a deep night blue.", categories: ["futuristic", "luxury", "dark"],
    colors: { primary: "#7DD3FC", grad2: "#6366F1", accent: "#E0F2FE", paper: lin(150, "#0B1324", "#1E1B4B", "#0C3B5E"), ink: "#F8FAFC", muted: "#BAE6FD", panel: "rgba(255,255,255,0.12)", soft: "rgba(125,211,252,0.12)", hero: lin(140, "#0B1324", "#1D2E6B"), onHero: "#FFFFFF", onPrimary: "#0B1324", onAccent: "#0B1324" },
    fonts: { head: "Poppins", body: "Inter" }, deco: ["glassPanels"], suggest: { layout: "glass", background: "gradient", lighting: "studio", angle: "angle45" } },
  { key: "black-gold", name: "Luxury Black Gold", description: "Jet black, art-deco gold ornaments and gold type under a spotlight.", categories: ["luxury", "dark"],
    colors: { primary: "#D4AF37", grad2: "#8C6D1F", accent: "#D4AF37", paper: lin(180, "#0A0A0A", "#15120C"), ink: "#F5E9C8", muted: "#BBA67A", panel: "rgba(212,175,55,0.08)", soft: "rgba(212,175,55,0.12)", hero: lin(180, "#000000", "#17130A"), onHero: "#F5E9C8", onPrimary: "#0A0A0A", onAccent: "#0A0A0A" },
    fonts: { head: "Bodoni Moda", body: "Montserrat" }, deco: ["artdeco"], suggest: { layout: "poster", background: "black", lighting: "golden", angle: "three-quarter" } },
  { key: "pastel-dream", name: "Pastel Dream", description: "A dreamy pastel sky with soft clouds and little stars.", categories: ["creative", "light"],
    colors: { primary: "#A78BFA", grad2: "#F9A8D4", accent: "#99F6E4", paper: lin(165, "#FDF2F8", "#F3EEFF", "#E8FBFF"), ink: "#4C1D95", muted: "#7C6A9A", panel: "#FFFFFF", soft: "#F3E8FF", hero: lin(135, "#E9D5FF", "#FBCFE8"), onHero: "#4C1D95", onPrimary: "#FFFFFF", onAccent: "#134E4A" },
    fonts: { head: "Nunito", body: "Nunito" }, deco: ["clouds"], suggest: { layout: "circle", background: "auto", lighting: "soft", angle: "front" } },
  { key: "concrete", name: "Concrete Industrial", description: "Raw concrete, a steel beam and safety-orange accents — urban industrial.", categories: ["professional", "creative"],
    colors: { primary: "#F97316", grad2: "#C2410C", accent: "#FACC15", paper: "#C9C7C3", ink: "#1C1C1C", muted: "#3F3F3F", panel: "rgba(255,255,255,0.8)", soft: "rgba(255,255,255,0.55)", hero: lin(180, "#3B3B3B", "#1E1E1E"), onHero: "#FFFFFF", onPrimary: "#1C1C1C", onAccent: "#1C1C1C" },
    fonts: { head: "Bebas Neue", body: "Inter" }, deco: ["concrete"], suggest: { layout: "split", background: "gray", lighting: "dramatic", angle: "angle45" } },
  { key: "floating", name: "Floating Product", description: "The product floats above a soft 3D floor with a distant shadow and floating spheres.", categories: ["creative", "futuristic", "light"],
    colors: { primary: "#2563EB", grad2: "#1E40AF", accent: "#F59E0B", paper: lin(180, "#E8F0FF", "#FFFFFF"), ink: "#0B1B3F", muted: "#4B5B7A", panel: "#FFFFFF", soft: "#E0EBFF", onAccent: "#1F1300" },
    fonts: { head: "Montserrat", body: "Inter" }, deco: ["floating"], suggest: { layout: "minimal", background: "studio", lighting: "studio", angle: "low" } },
  { key: "neon-gradient", name: "Neon Gradient", description: "Vibrant pink, violet and orange gradient with a glowing ring of light.", categories: ["creative", "futuristic", "colourful"],
    colors: { primary: "#FF3D81", grad2: "#7B2FF7", accent: "#00E5FF", paper: lin(140, "#FFF0F7", "#F3ECFF"), ink: "#2A0B4A", muted: "#6B4E8C", panel: "#FFFFFF", soft: "#FBE3F0", hero: lin(135, "#7B2FF7", "#FF3D81", "#FF9A3D"), onHero: "#FFFFFF", onPrimary: "#FFFFFF", onAccent: "#062A33" },
    fonts: { head: "Montserrat", body: "Poppins" }, deco: ["halo"], suggest: { layout: "bold", background: "gradient", lighting: "neon", angle: "angle45" } },
  { key: "fashion", name: "Luxury Fashion Editorial", description: "Fashion-magazine page: big serif headline, hairline rules and lots of white.", categories: ["editorial", "luxury"],
    colors: { primary: "#111111", grad2: "#3A3A3A", accent: "#C8102E", paper: "#FAF8F5", ink: "#111111", muted: "#6B6B6B", panel: "#FFFFFF", soft: "#EFECE7", hero: "#111111", onHero: "#FAF8F5", onPrimary: "#FFFFFF", onAccent: "#FFFFFF" },
    fonts: { head: "Bodoni Moda", body: "Raleway" }, deco: ["fashion"], suggest: { layout: "editorial", background: "white", lighting: "soft", angle: "three-quarter" } },
  { key: "earth", name: "Organic Earth", description: "Terracotta, clay and sand with an arch and pebbles — warm natural materials.", categories: ["nature"],
    colors: { primary: "#B5562E", grad2: "#7F3A1D", accent: "#8A9A5B", paper: lin(180, "#F5EADB", "#E8D5BD"), ink: "#3B2414", muted: "#80634D", panel: "#FBF4EA", soft: "#EBDCC8", onAccent: "#FFFFFF" },
    fonts: { head: "DM Serif Display", body: "Raleway" }, deco: ["earth"], suggest: { layout: "circle", background: "beige", lighting: "natural", angle: "angle45" } },
  { key: "holo", name: "Holographic Future", description: "Iridescent holographic foil, chrome light and futuristic surfaces.", categories: ["futuristic", "creative"],
    colors: { primary: "#8B5CF6", grad2: "#06B6D4", accent: "#F0ABFC", paper: "#EEF2FF", ink: "#1E1B4B", muted: "#5B5B8A", panel: "rgba(255,255,255,0.72)", soft: "rgba(255,255,255,0.55)", hero: lin(135, "#A78BFA", "#67E8F9", "#F0ABFC"), onHero: "#1E1B4B", onPrimary: "#FFFFFF", onAccent: "#3B0A45" },
    fonts: { head: "Rubik", body: "Inter" }, deco: ["holo"], suggest: { layout: "glass", background: "gradient", lighting: "studio", angle: "angle45" } },
  { key: "medical", name: "Clean Medical", description: "Bright white and calm blue with clear information panels — trust for health products.", categories: ["professional", "minimal", "light"],
    colors: { primary: "#0284C7", grad2: "#0369A1", accent: "#10B981", paper: lin(180, "#F5FBFF", "#FFFFFF"), ink: "#0C2A43", muted: "#4A6378", panel: "#FFFFFF", soft: "#E6F4FC", onAccent: "#FFFFFF" },
    fonts: { head: "Plus Jakarta Sans", body: "Inter" }, deco: ["medical"], suggest: { layout: "specs", background: "white", lighting: "studio", angle: "front" } },
  { key: "retro", name: "Retro Vintage", description: "Warm 70s colours, sun rays, halftone dots and chunky retro type.", categories: ["creative"],
    colors: { primary: "#D9480F", grad2: "#9C3608", accent: "#F2B33D", paper: "#F6E7C8", ink: "#3A2414", muted: "#7A5A3E", panel: "#FFF6E2", soft: "#EFD9AE", hero: lin(180, "#E8590C", "#C2410C"), onHero: "#FFF6E2", onPrimary: "#FFF6E2", onAccent: "#3A2414" },
    fonts: { head: "Archivo Black", body: "Nunito" }, deco: ["retro"], suggest: { layout: "bold", background: "beige", lighting: "natural", angle: "front" } },
  { key: "motion", name: "Dynamic Motion", description: "Speed lines, a slanted colour block and motion streaks — energy and movement.", categories: ["creative"],
    colors: { primary: "#FF4D00", grad2: "#B33600", accent: "#00D1FF", paper: lin(120, "#FFFFFF", "#F1F4F8"), ink: "#0F172A", muted: "#475569", panel: "#FFFFFF", soft: "#FFE4D6", hero: lin(120, "#FF4D00", "#FF8A00"), onHero: "#FFFFFF", onPrimary: "#FFFFFF", onAccent: "#00222B" },
    fonts: { head: "Anton", body: "Inter" }, deco: ["motion"], suggest: { layout: "diagonal", background: "white", lighting: "dramatic", angle: "angle45" } },
  { key: "architect", name: "Architectural Space", description: "The product in a calm room: an arched window, pilasters, wall and floor.", categories: ["editorial", "minimal"],
    colors: { primary: "#8B6F4E", grad2: "#5E4A33", accent: "#C9B79C", paper: lin(180, "#EFE9E1", "#E2D8CB"), ink: "#2E261E", muted: "#7A6B5B", panel: "#FAF7F2", soft: "#E6DDD0", onAccent: "#2E261E" },
    fonts: { head: "Raleway", body: "Inter" }, deco: ["arches"], suggest: { layout: "minimal", background: "interior", lighting: "natural", angle: "angle45" } },
  { key: "marble-studio", name: "Luxury Marble Studio", description: "A marble floor and pedestal, soft studio light and fine gold details.", categories: ["luxury", "light"],
    colors: { primary: "#2B2A28", grad2: "#4A4744", accent: "#B8935A", paper: lin(180, "#F7F5F2", "#E9E5DF"), ink: "#24221F", muted: "#7B746C", panel: "rgba(255,255,255,0.85)", soft: "rgba(255,255,255,0.7)", hero: lin(180, "#F4F1EC", "#E4DFD7"), onHero: "#24221F", onPrimary: "#FFFFFF", onAccent: "#FFFFFF" },
    fonts: { head: "Playfair Display", body: "Montserrat" }, deco: ["marbleFloor"], suggest: { layout: "minimal", background: "marble", lighting: "studio", angle: "three-quarter" } },
  { key: "geometry", name: "Creative 3D Geometry", description: "Floating 3D spheres, cubes and cones around the product — playful and artistic.", categories: ["creative", "colourful"],
    colors: { primary: "#6D28D9", grad2: "#4C1D95", accent: "#F97316", paper: lin(160, "#F5F3FF", "#FFF7ED"), ink: "#1E1B4B", muted: "#5B5784", panel: "#FFFFFF", soft: "#EDE9FE", hero: lin(135, "#6D28D9", "#DB2777"), onHero: "#FFFFFF", onPrimary: "#FFFFFF", onAccent: "#FFFFFF" },
    fonts: { head: "Rubik", body: "Rubik" }, deco: ["geometry"], suggest: { layout: "hero", background: "auto", lighting: "studio", angle: "isometric" } },
];
export const THEME_BY_KEY = Object.fromEntries(THEMES.map((t) => [t.key, t])) as Record<ThemeKey, ThemePreset>;
export const THEME_CATEGORIES: { key: ThemeCategory | "all"; label: string }[] = [
  { key: "all", label: "All" }, { key: "luxury", label: "Luxury" }, { key: "minimal", label: "Minimal" }, { key: "nature", label: "Nature" },
  { key: "futuristic", label: "Futuristic" }, { key: "creative", label: "Creative" }, { key: "editorial", label: "Editorial" }, { key: "professional", label: "Professional" },
  { key: "light", label: "Light" }, { key: "dark", label: "Dark" }, { key: "colourful", label: "Colourful" }, { key: "tech", label: "Tech" }, { key: "seasonal", label: "Seasonal" },
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
