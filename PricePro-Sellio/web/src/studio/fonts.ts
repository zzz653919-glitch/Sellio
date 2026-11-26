/** Fonts available in the template editor (Google Fonts, loaded on demand). */
export const FONTS: { family: string; weights: number[]; label?: string }[] = [
  { family: "Plus Jakarta Sans", weights: [400, 500, 600, 700, 800] },
  { family: "Montserrat", weights: [400, 500, 600, 700, 800, 900] },
  { family: "Poppins", weights: [400, 500, 600, 700, 800, 900] },
  { family: "Inter", weights: [400, 500, 600, 700, 800, 900] },
  { family: "Oswald", weights: [400, 500, 600, 700] },
  { family: "Bebas Neue", weights: [400] },
  { family: "Anton", weights: [400] },
  { family: "Archivo Black", weights: [400] },
  { family: "Playfair Display", weights: [400, 500, 600, 700, 800, 900] },
  { family: "DM Serif Display", weights: [400] },
  { family: "Cormorant Garamond", weights: [400, 500, 600, 700] },
  { family: "Bodoni Moda", weights: [400, 500, 600, 700, 800, 900] },
  { family: "Raleway", weights: [400, 500, 600, 700, 800, 900] },
  { family: "Nunito", weights: [400, 600, 700, 800, 900] },
  { family: "Rubik", weights: [400, 500, 600, 700, 800, 900] },
  { family: "Great Vibes", weights: [400] },
  { family: "Pacifico", weights: [400] },
];
const byFamily = new Map(FONTS.map((f) => [f.family, f]));

let sheet: Promise<void> | null = null;
/** One stylesheet request for all editor fonts (the font files themselves download only when used). */
function loadSheet() {
  sheet ??= new Promise<void>((resolve) => {
    const families = FONTS.filter((f) => f.family !== "Plus Jakarta Sans")
      .map((f) => `family=${f.family.replace(/ /g, "+")}${f.weights.length > 1 || f.weights[0] !== 400 ? `:wght@${f.weights.join(";")}` : ""}`).join("&");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
  return sheet;
}

/** Nearest weight the family really has. */
export const fontWeight = (family: string, weight: number) => {
  const ws = byFamily.get(family)?.weights ?? [400, 700];
  return ws.reduce((a, b) => (Math.abs(b - weight) < Math.abs(a - weight) ? b : a), ws[0]);
};

const ready = new Set<string>();
/** Wait until these font faces can be drawn on a canvas. */
export async function ensureFonts(specs: { font: string; weight: number; italic?: boolean }[]) {
  const need = specs.map((s) => `${s.italic ? "italic " : ""}${s.weight} 40px "${s.font}"`).filter((k) => !ready.has(k));
  if (!need.length) return;
  await loadSheet();
  await Promise.all([...new Set(need)].map((k) => document.fonts.load(k).then(() => ready.add(k)).catch(() => ready.add(k))));
}
