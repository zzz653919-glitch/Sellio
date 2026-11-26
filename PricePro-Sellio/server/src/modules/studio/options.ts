export const CATEGORIES = [
  "Electronics", "Fashion & Apparel", "Beauty & Cosmetics", "Home & Kitchen", "Food & Beverage",
  "Sports & Outdoors", "Toys & Games", "Jewelry & Accessories", "Furniture", "Automotive",
  "Health & Wellness", "Books & Stationery", "Other",
] as const;

export const STYLES = {
  auto: {
    label: "AI chooses",
    prompt: "the advertising style that sells this exact product best — decide it yourself, like a top art director would for an Instagram ad in Uzbekistan",
  },
  premium_luxury: {
    label: "Premium Luxury",
    prompt: "premium luxury advertising: elegant, rich materials, refined reflections, sophisticated mood, high-end brand campaign look",
  },
  minimal_studio: {
    label: "Minimal Studio",
    prompt: "minimal studio product photography: clean composition, generous negative space, soft even studio lighting, subtle shadow",
  },
  modern_commercial: {
    label: "Modern Commercial",
    prompt: "modern commercial advertisement: bold, vibrant, dynamic composition, crisp contrast, contemporary brand look",
  },
  ecommerce_product: {
    label: "E-commerce Product",
    prompt: "e-commerce catalogue product photo: product fully visible, accurate colours, neutral even lighting, marketplace-ready",
  },
  lifestyle: {
    label: "Lifestyle Photography",
    prompt: "lifestyle photography: the product shown in a realistic everyday setting where it is naturally used, natural light, authentic mood",
  },
  social_media: {
    label: "Social Media Advertisement",
    prompt: "social media advertisement: eye-catching, scroll-stopping, colourful and modern, composed for a feed post",
  },
} as const;

export const BACKGROUNDS = {
  auto: { label: "AI chooses", prompt: "the scene, surface, props and colours that suit this product best — decide them yourself" },
  studio_white: { label: "Studio white", prompt: "seamless pure white studio background" },
  soft_gradient: { label: "Soft gradient", prompt: "smooth soft colour-gradient backdrop" },
  solid_color: { label: "Solid colour (brand colour)", prompt: "solid single-colour backdrop" },
  marble: { label: "Marble surface", prompt: "polished marble surface with a softly blurred background" },
  wooden: { label: "Wooden table", prompt: "natural wooden table surface with a softly blurred background" },
  outdoor: { label: "Outdoor nature", prompt: "natural outdoor scene, softly blurred, daylight" },
  contextual: { label: "Contextual scene", prompt: "a realistic scene that fits the product's category and use" },
  transparent: { label: "Transparent (PNG)", prompt: "no background — isolated product cut-out" },
} as const;

export const SIZES = {
  square: { label: "Square 1:1", value: "1024x1024" },
  landscape: { label: "Landscape 3:2", value: "1536x1024" },
  portrait: { label: "Portrait 2:3", value: "1024x1536" },
} as const;

export const QUALITIES = ["low", "medium", "high"] as const;
export const LIGHTING = { soft: "soft diffused lighting", dramatic: "dramatic directional lighting with deep shadows", natural: "natural daylight" } as const;

export type StyleKey = keyof typeof STYLES;
export type BackgroundKey = keyof typeof BACKGROUNDS;
export type SizeKey = keyof typeof SIZES;
export type LightingKey = keyof typeof LIGHTING;

export function buildPrompt(input: {
  productName: string;
  category: string;
  style: StyleKey;
  background: BackgroundKey;
  lighting: LightingKey;
  brandColor?: string;
  instructions?: string;
}) {
  const bg =
    input.background === "solid_color" && input.brandColor
      ? `solid ${input.brandColor} backdrop`
      : BACKGROUNDS[input.background].prompt;
  if (input.style === "auto" && input.background === "auto") {
    // Fully automatic: the model looks at the photo and makes every creative decision itself.
    return [
      input.productName
        ? `Create a professional advertising image of the product shown in the input photo ("${input.productName}").`
        : "Create a professional advertising image of the product shown in the input photo. First recognise what the product is.",
      "Keep the product exactly as it is in the photo — same shape, proportions, colours, materials, logos and printed text. Do not add, remove or alter product details.",
      "You are the art director: choose the advertising style, background scene, surface, props, colour palette, lighting and camera angle that make this particular product look most attractive and premium, ready for an Instagram / Telegram ad in Uzbekistan.",
      "Composition: the product is the clear hero, sharp focus, photorealistic, high-end commercial quality, leave some calm space around it for a headline. No added text, captions, watermarks or logos other than those on the product.",
      input.brandColor ? `Use ${input.brandColor} as an accent colour.` : "",
      input.instructions ? `Additional instructions: ${input.instructions}` : "",
    ].filter(Boolean).join("\n");
  }
  return [
    `Create a professional advertising image of the product shown in the input photo: "${input.productName || "the product"}" (category: ${input.category}).`,
    "Keep the product exactly as it is in the photo — same shape, proportions, colours, materials, logos and printed text. Do not add, remove or alter product details.",
    `Style: ${STYLES[input.style].prompt}.`,
    `Background: ${bg}.`,
    `Lighting: ${LIGHTING[input.lighting]}.`,
    input.brandColor && input.background !== "solid_color" ? `Use ${input.brandColor} as an accent colour in the scene.` : "",
    "Composition: product is the clear hero, sharp focus, photorealistic, high-end commercial quality. No added text, captions, watermarks or logos other than those on the product.",
    input.instructions ? `Additional instructions: ${input.instructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Change a finished advertisement as the user asked (the generated image is the input). */
export function buildEditPrompt(instructions: string) {
  return [
    "Edit this advertising image as requested below. Change only what is asked; keep everything else as it is.",
    "Keep the product exactly as it is — same shape, proportions, colours, materials, logos and printed text.",
    "Photorealistic, high-end commercial quality. No added text, captions or watermarks unless the request asks for them.",
    `Request: ${instructions}`,
  ].join("\n");
}
