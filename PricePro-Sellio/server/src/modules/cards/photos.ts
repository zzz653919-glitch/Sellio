/**
 * AI product photos for product cards: the user's own product photo re-shot by the image model in the
 * chosen theme, camera angle, background, lighting and shadow. The product itself must not change.
 * Only keys are accepted from the browser; every word of the prompt is written here.
 */

export const THEMES = {
  brand: "clean commercial look in the marketplace's brand colours",
  "dark-luxury": "dark luxury: deep black and charcoal tones, rich contrast, subtle gold reflections, exclusive premium mood",
  "light-minimal": "light minimal: airy bright whites and soft greys, lots of empty space, calm and clean",
  flowers: "floral: fresh flowers and petals arranged around the product, romantic soft mood",
  "premium-gold": "premium gold: warm golden highlights, champagne and black tones, elegant luxury",
  "black-white": "black and white set: a clean bright white or light-grey studio with crisp black graphic accents and high contrast. Only the set is monochrome: the product itself must stay in full original colour (never turn the product grey or black-and-white), and a dark product must stand out clearly against a light area",
  "modern-gradient": "modern gradient: smooth vivid colour gradient backdrop, contemporary and bold",
  glass: "glassmorphism: frosted translucent glass panels, soft blurred colour lights, modern tech feel",
  neon: "futuristic neon: dark scene with glowing neon light lines in pink, cyan and violet, cyberpunk mood",
  nature: "nature and organic: natural materials — wood, stone, green leaves, linen — warm daylight, eco mood",
  pastel: "pastel soft: gentle pastel colours (pink, mint, lavender, peach), soft and friendly",
  marble: "luxury marble: polished white and grey marble surfaces with fine veins, elegant and expensive",
  "studio-3d": "3D studio: clean rendered studio set with geometric podiums and pedestals, soft studio light",
  cinematic: "cinematic: moody film-like lighting, dramatic shadows and rim light, rich colour grading",
  pop: "colourful pop: bright saturated colour blocks, playful and energetic, bold graphic shapes",
  minimalist: "minimalist: one neutral colour, a single simple surface, nothing else in the scene",
  beige: "elegant beige: warm beige, cream and sand tones, soft natural textures, refined and calm",
  tech: "tech style: sleek dark blue and graphite surfaces, precise lines, cool light, high-tech mood",
  abstract: "creative abstract: abstract sculptural shapes and bold colour forms around the product, artistic",
  seasonal: "seasonal: a festive seasonal setting that suits the current season, tasteful decorations",
  custom: "styled to the user's chosen colours",
  cyberpunk: "cyberpunk neon: a dark rainy night-city set with glowing magenta and cyan neon tubes, reflections on wet surfaces, futuristic and edgy",
  royal: "luxury royal: a regal set with deep burgundy velvet, ornate gold details and classic elegance, rich warm light",
  botanical: "botanical garden: the product among lush green leaves, ferns and fresh blossoms, soft garden daylight",
  zen: "japanese zen: a calm minimal set with washi paper, smooth stones, bamboo or a bonsai branch and a soft red accent, lots of empty space",
  swiss: "swiss editorial: a clean studio with strict geometric order, flat white and light grey planes and one bold red accent, crisp even light",
  "glass-premium": "glass premium: transparent glass blocks and panels with clear reflections and refractions around the product, deep blue backdrop, high-end",
  "black-gold": "luxury black and gold: a jet-black set with polished gold accents and art-deco details, a focused warm spotlight, very premium",
  "pastel-dream": "pastel dream: a soft dreamy set in pastel lilac, pink and mint with fluffy clouds and gentle light",
  concrete: "concrete industrial: raw concrete surfaces, steel and an urban loft feel, hard directional light with defined shadows",
  floating: "floating product: the product levitating in the air above a soft seamless floor with a distant soft shadow below it and small floating spheres, clean 3D look",
  "neon-gradient": "neon gradient: a vibrant violet-pink-orange gradient backdrop with a glowing ring of light behind the product, modern and bold",
  fashion: "luxury fashion editorial: a high-fashion magazine photo, refined minimal set, elegant soft light, sophisticated styling",
  earth: "organic earth: terracotta and clay surfaces, sand, pebbles and dried plants in warm earthy tones, natural warm light",
  holo: "holographic future: iridescent holographic and chrome surfaces with rainbow reflections, futuristic clean light",
  medical: "clean medical: a bright, spotless white and light-blue clinical set, very clean and trustworthy, even soft light",
  retro: "retro vintage: a 1970s-inspired set with warm orange, mustard and teal colours, vintage props and film-like warm light",
  motion: "dynamic motion: an energetic set with motion blur streaks, flying particles and a dynamic diagonal composition suggesting speed",
  architect: "architectural space: the product placed in a calm minimalist architectural interior with arches, columns, plaster walls and natural window light",
  "marble-studio": "luxury marble studio: the product on a polished marble pedestal on a marble floor, soft studio light and fine gold details",
  geometry: "creative 3D geometry: artistic 3D geometric shapes — spheres, cubes, cones and rings — arranged around the product in harmonious colours",
} as const;
export type ThemeKey = keyof typeof THEMES;

export const ANGLES = {
  auto: "choose the camera angle that shows this particular product best",
  front: "straight front view, camera at the product's height",
  side: "side view (profile)",
  angle45: "45-degree view from the front-left, showing the front and one side",
  top: "top view, camera directly above (flat lay)",
  bottom: "low view from below, looking up at the product's underside",
  back: "back view",
  macro: "close-up macro shot of the product's most attractive part, very shallow depth of field",
  detail: "detail view highlighting texture, material and craftsmanship",
  isometric: "isometric view from above at 30 degrees, no perspective distortion",
  "three-quarter": "3/4 perspective view",
  low: "low-angle shot, camera below the product looking up, heroic look",
  high: "high-angle shot, camera above looking down at about 60 degrees",
} as const;
export type AngleKey = keyof typeof ANGLES | "multiple";
/** Angles used one after another when "Multiple angles" is chosen. */
export const MULTI_ANGLES: (keyof typeof ANGLES)[] = ["front", "angle45", "side", "detail"];

export const BACKGROUNDS = {
  auto: "a background that matches the theme",
  white: "pure white seamless background",
  black: "deep black background",
  gray: "light grey seamless studio background",
  beige: "warm beige background",
  gradient: "smooth colour gradient background",
  flowers: "flowers and petals around the product",
  nature: "natural outdoor setting with plants, wood or stone",
  marble: "polished marble surface and backdrop",
  studio: "professional photo studio set with a soft backdrop and a pedestal",
  interior: "luxury interior: elegant room, soft blurred furniture and warm lamps",
  custom: "a background in the user's chosen colours",
} as const;
export type BackgroundKey = keyof typeof BACKGROUNDS;

export const LIGHTS = {
  soft: "soft diffused light",
  studio: "professional three-point studio lighting",
  dramatic: "dramatic directional light with deep shadows",
  natural: "natural daylight from a window",
  neon: "coloured neon accent lights",
  golden: "warm golden-hour light",
} as const;
export type LightKey = keyof typeof LIGHTS;

export type PhotoOptions = {
  platform: string;
  theme: ThemeKey;
  angle: keyof typeof ANGLES;
  background: BackgroundKey;
  lighting: LightKey;
  /** 0 = no shadow … 100 = strong shadow */
  shadow: number;
  transparent: boolean;
  colors?: { main?: string; second?: string };
  referenceStyle?: string;
  productName?: string;
};

export function buildCardPhotoPrompt(o: PhotoOptions) {
  const shadow = o.shadow <= 5 ? "no visible shadow" : o.shadow < 35 ? "a very soft, light shadow" : o.shadow < 70 ? "a natural soft shadow under the product" : "a strong, defined shadow";
  const colors = o.colors?.main ? `Use ${o.colors.main}${o.colors.second ? ` and ${o.colors.second}` : ""} as the colours of the scene and background (never recolour the product).` : "";
  return [
    `Create a professional product photograph for a ${o.platform} product card${o.productName ? ` of "${o.productName}"` : ""}, using the product in the input photo.`,
    "THE PRODUCT MUST STAY EXACTLY THE SAME as in the input photo: same shape, proportions, colours, materials, textures, logos, printed text and every small detail. Do not redesign, replace, distort, simplify or add parts to the product.",
    `Camera: ${ANGLES[o.angle]}. If this angle shows sides that are not visible in the input photo, keep them consistent with the visible design and do not invent new logos, text or features.`,
    `Visual theme: ${THEMES[o.theme]}.`,
    `Background: ${o.transparent ? "fully transparent background, the product isolated as a clean cut-out" : BACKGROUNDS[o.background]}.`,
    `Lighting: ${LIGHTS[o.lighting]}. Shadow: ${o.transparent ? "a subtle contact shadow only" : shadow}.`,
    colors,
    o.referenceStyle ? `Match the look of the user's reference image: ${o.referenceStyle}` : "",
    "Composition: the product is the clear hero, sharp and well lit, with calm space around it for texts that will be added later. Photorealistic, high-end commercial quality. No text, captions, prices, watermarks or logos other than those already on the product.",
  ].filter(Boolean).join("\n");
}
