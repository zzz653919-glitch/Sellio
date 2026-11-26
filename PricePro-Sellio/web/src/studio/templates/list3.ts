import { art, badge, blob, circle, dots, glow, heart, lin, line, plus, podium, rad, rect, ring, shape, sparkle, star, stripes, type Spec } from "./compose";

const SHOP = "Shop Now →";

// ------------------------------------------------------------------ Automotive (7)
export const AUTO: Spec[] = [
  {
    id: "auto-drive-better", name: "Drive Better", cat: "auto", tags: ["car", "sedan", "light blue"],
    bg: lin(180, "#eff6ff", "#dbeafe"), pos: "tl",
    h: "Drive\nBetter", s: "Feel the Power.", cta: SHOP, font: "Montserrat", weight: 900, size: 100, ink: "#0f172a", subInk: "#334155",
    ctaBg: "#1d4ed8",
    product: art("car", { body: "#475569", kind: "sedan" }), pbox: [0.24, 0.44, 0.78, 0.48],
    under: [rect(0, 0.84, 1, 0.16, "#cbd5e1"), line(0.06, 0.915, 0.18, 0.008, "#ffffff"), line(0.4, 0.915, 0.18, 0.008, "#ffffff"), line(0.74, 0.915, 0.18, 0.008, "#ffffff")],
  },
  {
    id: "auto-dream-car", name: "Dream Car", cat: "auto", tags: ["sports car", "red", "dark"],
    bg: lin(160, "#134e4a", "#0f172a"), pos: "tl",
    h: "Dream\nCar", s: "Drive Your Dream.", cta: SHOP, font: "Oswald", weight: 700, size: 112, ink: "#ffffff", subInk: "#99f6e4", upper: true,
    ctaBg: "#dc2626",
    product: art("car", { body: "#dc2626", kind: "sport" }), pbox: [0.2, 0.46, 0.82, 0.46],
    under: [glow(0.3, 0.56, 0.7, "rgba(220,38,38,0.4)"), stripes(0.46, 0.06, 0.5, 0.3, "#ffffff", 0.06)],
  },
  {
    id: "auto-auto-trend", name: "Auto Trend", cat: "auto", tags: ["suv", "grey", "premium"],
    bg: rad(0.6, 0.65, 0.8, "#52525b", "#18181b"), pos: "tl",
    h: "Auto\nTrend", s: "Drive Stylish.", cta: SHOP, font: "Montserrat", weight: 800, size: 100, ink: "#ffffff", subInk: "#d4d4d8",
    ctaStyle: "outline", ctaBg: "#ffffff",
    product: art("car", { body: "#f4f4f5", kind: "suv" }), pbox: [0.22, 0.42, 0.8, 0.5],
    under: [podium(0.24, 0.84, 0.76, 0.08, "rgba(255,255,255,0.08)")],
  },
  {
    id: "auto-car-sale", name: "Car Sale", cat: "auto", tags: ["car", "sale", "red", "light"],
    bg: lin(180, "#f8fafc", "#e2e8f0"), pos: "tl",
    h: "Car Sale", s: "Drive Your Dream.", price: "189 000 000 so'm", cta: SHOP, font: "Poppins", weight: 800, size: 96, ink: "#0f172a", subInk: "#475569",
    ctaBg: "#ef4444", priceInk: "#ef4444",
    product: art("car", { body: "#ef4444", kind: "sport" }), pbox: [0.22, 0.5, 0.8, 0.44],
    over: [badge("-15%", 0.76, 0.06, 0.18, "#ef4444", "#ffffff", { shape: "burst", size: 46 })],
  },
  {
    id: "auto-electric-drive", name: "Electric Drive", cat: "auto", tags: ["electric car", "gradient", "purple"],
    bg: lin(135, "#1d4ed8", "#7c3aed"), pos: "tl",
    h: "Electric\nDrive", s: "Silent. Clean. Fast.", cta: "Test Drive →", font: "Montserrat", weight: 900, size: 96, ink: "#ffffff", subInk: "#e0e7ff",
    ctaBg: "#ffffff", ctaInk: "#5b21b6",
    product: art("car", { body: "#f8fafc", kind: "sedan" }), pbox: [0.24, 0.46, 0.78, 0.46],
    under: [glow(0.4, 0.4, 0.6, "rgba(167,139,250,0.55)"), ring(0.6, 0.06, 0.3, "#ffffff", 2, { opacity: 0.25 })],
  },
  {
    id: "auto-car-care", name: "Car Care", cat: "auto", tags: ["car care", "polish", "dark blue"],
    bg: lin(160, "#0f172a", "#1e3a8a"), pos: "tl",
    h: "Car\nCare", s: "Shine Like New.", price: "249 000 so'm", cta: SHOP, font: "Rubik", weight: 800, size: 104, ink: "#ffffff", subInk: "#bfdbfe",
    ctaBg: "#38bdf8", ctaInk: "#0f172a", priceInk: "#38bdf8",
    product: art("carcare", { c: "#38bdf8" }), pbox: [0.46, 0.22, 0.5, 0.7],
    over: [sparkle(0.9, 0.18, 0.06, "#e0f2fe"), sparkle(0.48, 0.26, 0.04, "#e0f2fe"), sparkle(0.84, 0.8, 0.035, "#e0f2fe")],
  },
  {
    id: "auto-road-ready", name: "Road Ready", cat: "auto", tags: ["tires", "blue", "service"],
    bg: lin(160, "#2563eb", "#1e40af"), pos: "tl",
    h: "Road\nReady", s: "Premium Tires.", cta: SHOP, font: "Anton", weight: 400, size: 120, ink: "#ffffff", subInk: "#dbeafe", upper: true,
    ctaBg: "#facc15", ctaInk: "#111111",
    product: art("tire"), pbox: [0.46, 0.24, 0.5, 0.66],
    under: [stripes(0, 0.86, 1, 0.14, "#facc15", 0.6)],
  },
];

// ------------------------------------------------------------------ Business & Services (7)
export const BUSINESS: Spec[] = [
  {
    id: "biz-smart-finance", name: "Smart Finance", cat: "business", tags: ["finance", "coins", "navy"],
    bg: lin(160, "#0f172a", "#1e3a8a"), pos: "tl",
    h: "Smart\nFinance", s: "Grow Your Money.", cta: "Learn More →", font: "Montserrat", weight: 800, size: 96, ink: "#ffffff", subInk: "#bfdbfe",
    ctaBg: "#f59e0b", ctaInk: "#0f172a",
    product: art("coins", { coin: "#fbbf24", arrow: "#f59e0b" }), pbox: [0.44, 0.24, 0.54, 0.68],
    under: [dots(0.06, 0.66, 0.3, 0.28, "#60a5fa", 0.3), glow(0.42, 0.24, 0.6, "rgba(251,191,36,0.25)")],
  },
  {
    id: "biz-business-solutions", name: "Business Solutions", cat: "business", tags: ["chart", "growth", "white", "blue"],
    bg: lin(180, "#f8fafc", "#dbeafe"), pos: "tl",
    h: "Business\nSolutions", s: "Grow Faster.", cta: "Learn More →", font: "Inter", weight: 800, size: 90, ink: "#1e3a8a", subInk: "#1d4ed8",
    ctaStyle: "box", ctaBg: "#1d4ed8",
    product: art("chart", { bars: "#2563eb", arrow: "#22c55e" }), pbox: [0.44, 0.26, 0.54, 0.66],
    under: [dots(0.46, 0.08, 0.48, 0.84, "#93c5fd", 0.35)],
  },
  {
    id: "biz-work-smarter", name: "Work Smarter", cat: "business", tags: ["laptop", "productivity", "blue"],
    bg: lin(150, "#1e40af", "#3b82f6"), pos: "tl",
    h: "Work\nSmarter", s: "Be Productive.", cta: "Learn More →", font: "Poppins", weight: 800, size: 96, ink: "#ffffff", subInk: "#dbeafe",
    ctaBg: "#ffffff", ctaInk: "#1e40af",
    product: art("laptop", { body: "#e2e8f0", s1: "#0ea5e9", s2: "#22d3ee" }), pbox: [0.34, 0.38, 0.66, 0.52],
    under: [circle(0.6, 0.06, 0.34, "rgba(255,255,255,0.1)"), circle(0.82, 0.3, 0.18, "rgba(255,255,255,0.08)")],
  },
  {
    id: "biz-your-success", name: "Your Success", cat: "business", tags: ["trophy", "navy", "gold"],
    bg: lin(160, "#0b1b3f", "#1e3a8a"), pos: "tl",
    h: "Your\nSuccess", s: "Our Priority.", cta: "Learn More →", font: "Montserrat", weight: 900, size: 100, ink: "#ffffff", ink2: "#fbbf24", subInk: "#cbd5e1",
    ctaBg: "#fbbf24", ctaInk: "#0b1b3f",
    product: art("trophy", { gold: "#fbbf24" }), pbox: [0.5, 0.18, 0.44, 0.76],
    under: [glow(0.42, 0.14, 0.62, "rgba(251,191,36,0.35)")], over: [star(0.44, 0.2, 0.04, "#fde68a"), star(0.9, 0.36, 0.035, "#fde68a")],
  },
  {
    id: "biz-modern-apartments", name: "Modern Apartments", cat: "business", tags: ["real estate", "buildings", "light blue"],
    bg: lin(180, "#e0f2fe", "#f8fafc"), pos: "tl",
    h: "Modern\nApartments", s: "Live Better.", cta: "Learn More →", font: "Montserrat", weight: 800, size: 84, ink: "#0c4a6e", subInk: "#0369a1",
    ctaStyle: "box", ctaBg: "#0369a1",
    product: art("buildings", { glass: "#93c5fd", frame: "#e2e8f0" }), pbox: [0.4, 0.12, 0.62, 0.9], pshadow: false,
  },
  {
    id: "biz-happy-pets", name: "Happy Pets", cat: "business", tags: ["pets", "dog", "green", "pet shop"],
    bg: lin(160, "#bbf7d0", "#86efac"), pos: "tl",
    h: "Happy\nPets", s: "Love More.", cta: SHOP, font: "Rubik", weight: 800, size: 100, ink: "#14532d", subInk: "#166534",
    ctaBg: "#15803d",
    product: art("dog", { fur: "#e0a458" }), pbox: [0.42, 0.2, 0.56, 0.76],
    under: [circle(0.46, 0.22, 0.5, "rgba(255,255,255,0.5)")], over: [heart(0.12, 0.76, 0.06, "#16a34a", { opacity: 0.6 }), heart(0.24, 0.86, 0.04, "#16a34a", { opacity: 0.45 })],
  },
  {
    id: "biz-smart-home", name: "Smart Home", cat: "business", tags: ["smart home", "installation", "light"],
    bg: lin(180, "#f8fafc", "#e2e8f0"), pos: "tl",
    h: "Smart\nHome", s: "Live Smarter.", cta: "Learn More →", font: "Inter", weight: 800, size: 100, ink: "#0f172a", subInk: "#334155",
    ctaBg: "#0ea5e9",
    product: art("speaker", { body: "#e5e7eb", ring: "#38bdf8" }), pbox: [0.46, 0.24, 0.5, 0.68],
    under: [ring(0.42, 0.2, 0.6, "#38bdf8", 2, { opacity: 0.35 }), ring(0.36, 0.14, 0.72, "#38bdf8", 2, { opacity: 0.2 })],
  },
];

// ------------------------------------------------------------------ Education & Courses (7)
export const EDUCATION: Spec[] = [
  {
    id: "edu-learn-anything", name: "Learn Anything", cat: "education", tags: ["courses", "graduation", "white"],
    bg: lin(180, "#ffffff", "#f1f5f9"), pos: "tl",
    h: "Learn\nAnything", s: "Build Your Skills.", cta: "Start Now →", font: "Montserrat", weight: 900, size: 96, ink: "#0f172a", subInk: "#334155",
    ctaBg: "#2563eb",
    product: art("gradcap", { cap: "#111827", tassel: "#fbbf24", books: "#2563eb" }), pbox: [0.44, 0.24, 0.54, 0.7],
    under: [circle(0.5, 0.22, 0.46, "#fef3c7"), dots(0.06, 0.7, 0.26, 0.24, "#94a3b8", 0.4)],
  },
  {
    id: "edu-tech-future", name: "Tech Future", cat: "education", tags: ["coding", "it courses", "dark blue"],
    bg: lin(160, "#0b1120", "#1e3a8a"), pos: "tl",
    h: "Tech\nFuture", s: "Learn to Code Today.", cta: "Start Now →", font: "Rubik", weight: 800, size: 104, ink: "#ffffff", subInk: "#93c5fd",
    ctaBg: "#22d3ee", ctaInk: "#0b1120",
    product: art("laptop", { body: "#94a3b8", s1: "#22d3ee", s2: "#3b82f6" }), pbox: [0.34, 0.38, 0.66, 0.52],
    under: [glow(0.44, 0.32, 0.56, "rgba(34,211,238,0.35)"), plus(0.86, 0.12, 0.04, "#22d3ee", { opacity: 0.6 }), plus(0.6, 0.2, 0.03, "#22d3ee", { opacity: 0.4 })],
  },
  {
    id: "edu-music-life", name: "Music Life", cat: "education", tags: ["music school", "guitar", "purple"],
    bg: lin(150, "#4c1d95", "#1d4ed8"), pos: "tl",
    h: "Music\nLife", s: "Feel the Beat.\nLessons for all ages.", cta: "Join Now →", font: "Poppins", weight: 800, size: 100, ink: "#ffffff", subInk: "#ddd6fe", subSize: 30,
    ctaBg: "#ffffff", ctaInk: "#4c1d95",
    product: art("guitar", { body: "#d97706" }), pbox: [0.44, 0.04, 0.56, 0.94], prot: 18,
    under: [ring(0.42, 0.2, 0.62, "#c4b5fd", 3, { opacity: 0.35 }), ring(0.5, 0.28, 0.46, "#c4b5fd", 2, { opacity: 0.25 })],
  },
  {
    id: "edu-next-gen-skills", name: "Next Gen Skills", cat: "education", tags: ["vr", "technology", "blue"],
    bg: lin(150, "#1e40af", "#38bdf8"), pos: "tl",
    h: "Next Gen\nSkills", s: "Learn in VR.", cta: "Start Now →", font: "Montserrat", weight: 900, size: 92, ink: "#ffffff", subInk: "#e0f2fe",
    ctaBg: "#ffffff", ctaInk: "#1e40af",
    product: art("vr", { body: "#f8fafc", visor: "#1e293b" }), pbox: [0.4, 0.32, 0.58, 0.56],
    under: [stripes(0.5, 0.0, 0.5, 1, "#ffffff", 0.07), glow(0.44, 0.24, 0.6, "rgba(255,255,255,0.3)")],
  },
  {
    id: "edu-level-up", name: "Level Up", cat: "education", tags: ["books", "neon", "purple"],
    bg: lin(150, "#1e1b4b", "#6d28d9"), pos: "tl",
    h: "Level Up", s: "Learn More.", cta: "Start Now →", font: "Archivo Black", weight: 400, size: 96, ink: "#ffffff", subInk: "#f0abfc",
    ctaBg: "#f472b6", ctaInk: "#1e1b4b",
    product: art("books", { c1: "#ef4444", c2: "#3b82f6", c3: "#f59e0b" }), pbox: [0.44, 0.24, 0.54, 0.68],
    under: [ring(0.42, 0.2, 0.6, "#f472b6", 4, { opacity: 0.6 }), glow(0.36, 0.14, 0.72, "rgba(244,114,182,0.35)")],
  },
  {
    id: "edu-cooking-class", name: "Cooking Class", cat: "education", tags: ["cooking", "class", "cream"],
    bg: lin(180, "#fefce8", "#fef3c7"), pos: "tl",
    h: "Cooking\nClass", s: "Cook Better.", cta: "Join Now →", font: "DM Serif Display", weight: 400, size: 104, ink: "#422006", subInk: "#713f12",
    ctaBg: "#b45309",
    product: art("pot", { body: "#111827" }), pbox: [0.42, 0.3, 0.56, 0.6],
    under: [circle(0.46, 0.26, 0.5, "#fde68a")],
  },
  {
    id: "edu-grow-smarter", name: "Grow Smarter", cat: "education", tags: ["growth", "plant", "green", "cream"],
    bg: lin(160, "#f7f4ea", "#ecfccb"), pos: "tl",
    h: "Grow\nSmarter", s: "Learn Every Day.", cta: "Start Now →", font: "Poppins", weight: 800, size: 100, ink: "#14532d", subInk: "#3f6212",
    ctaBg: "#15803d",
    product: art("plant", { pot: "#e7e5e4", leaves: "#16a34a", kind: "snake" }), pbox: [0.5, 0.14, 0.44, 0.8],
    under: [shape("arch", 0.52, 0.12, 0.4, 0.82, "#e2ecc9")],
  },
];

// ------------------------------------------------------------------ Gifts & Special Events (7)
export const GIFTS: Spec[] = [
  {
    id: "gift-perfect-gift", name: "Perfect Gift", cat: "gifts", tags: ["gift", "pink", "birthday"],
    bg: lin(160, "#fce7f3", "#fbcfe8"), pos: "tl",
    h: "Perfect\nGift", s: "Make Them Happy.", cta: SHOP, font: "Poppins", weight: 800, size: 100, ink: "#9d174d", subInk: "#be185d",
    ctaBg: "#db2777",
    product: art("gift", { box: "#ef4444", ribbon: "#fbbf24" }), pbox: [0.44, 0.26, 0.54, 0.66],
    over: [heart(0.86, 0.1, 0.07, "#f472b6"), heart(0.42, 0.24, 0.04, "#f9a8d4"), rect(0.14, 0.76, 0.03, 0.012, "#fbbf24", 3, { rot: 30 }), rect(0.3, 0.86, 0.03, 0.012, "#f472b6", 3, { rot: -30 })],
  },
  {
    id: "gift-fresh-flowers", name: "Fresh Flowers", cat: "gifts", tags: ["flowers", "bouquet", "pink"],
    bg: lin(180, "#fff1f2", "#ffe4e6"), pos: "tl",
    h: "Fresh\nFlowers", s: "Say it with Flowers.", cta: "Order Now →", font: "Playfair Display", weight: 700, size: 100, ink: "#9f1239", subInk: "#be123c",
    ctaBg: "#e11d48",
    product: art("bouquet", { petals: "#f472b6", wrap: "#fdf2f8", leaves: "#22c55e" }), pbox: [0.44, 0.16, 0.54, 0.8],
    under: [blob(0.46, 0.18, 0.5, 0.7, "#fecdd3", { opacity: 0.7 })],
  },
  {
    id: "gift-elegant-choice", name: "Elegant Choice", cat: "gifts", tags: ["perfume", "gift", "beige"],
    bg: lin(180, "#f5efe6", "#e8dccb"), pos: "tl",
    h: "Elegant\nChoice", s: "Be Different.", cta: "Learn More →", font: "Cormorant Garamond", weight: 700, size: 108, ink: "#3b2a1a", subInk: "#6b5440",
    ctaStyle: "outline", ctaBg: "#3b2a1a",
    product: art("perfume", { glass: "#f5d0a9", liquid: "#d97706", cap: "#1c1917", kind: "tall" }), pbox: [0.52, 0.14, 0.42, 0.8],
    under: [podium(0.5, 0.84, 0.46, 0.08, "#dccab2"), circle(0.5, 0.18, 0.44, "#fbf7f1")],
  },
  {
    id: "gift-pure-elegance", name: "Pure Elegance", cat: "gifts", tags: ["perfume", "gift", "beige", "luxury"],
    bg: lin(180, "#efe7dc", "#dccdb8"), pos: "mr",
    h: "Pure\nElegance", s: "Gift Something Special.", cta: SHOP, font: "Bodoni Moda", weight: 700, size: 92, ink: "#292524", subInk: "#57534e",
    ctaBg: "#292524",
    product: art("perfume", { glass: "#e7c9a9", liquid: "#b45309", cap: "#d4af37", kind: "square" }), pbox: [0.04, 0.2, 0.44, 0.7],
    under: [shape("arch", 0.06, 0.12, 0.4, 0.82, "#f7f1e8")],
  },
  {
    id: "gift-luxury-time", name: "Luxury Time", cat: "gifts", tags: ["watch", "gift", "black", "gold"],
    bg: rad(0.5, 0.32, 0.7, "#292524", "#0a0a0a"), pos: "bc",
    h: "Luxury Time", s: "Own the Time.", cta: SHOP, font: "Playfair Display", weight: 700, size: 92, ink: "#f5e6cc", subInk: "#d4af37",
    ctaBg: "#d4af37", ctaInk: "#0a0a0a",
    product: art("watch", { case: "#e5e7eb", dial: "#0f172a", strap: "#d1d5db", kind: "bracelet" }), pbox: [0.24, 0.04, 0.52, 0.54],
    under: [glow(0.2, 0.0, 0.6, "rgba(212,175,55,0.3)")], over: [line(0.4, 0.58, 0.2, 0.003, "#d4af37")],
  },
  {
    id: "gift-garden-style", name: "Garden Style", cat: "gifts", tags: ["plant", "gift", "green"],
    bg: lin(160, "#dcfce7", "#86efac"), pos: "tl",
    h: "Garden\nStyle", s: "Gift a Plant.", cta: SHOP, font: "Montserrat", weight: 800, size: 96, ink: "#14532d", subInk: "#166534",
    ctaBg: "#15803d",
    product: art("plant", { pot: "#f5f5f4", leaves: "#15803d", kind: "monstera" }), pbox: [0.46, 0.14, 0.5, 0.82],
    under: [circle(0.5, 0.2, 0.44, "rgba(255,255,255,0.5)")],
  },
  {
    id: "gift-nature-life", name: "Nature Life", cat: "gifts", tags: ["eco", "leaves", "green"],
    bg: lin(160, "#166534", "#15803d"), pos: "ml",
    h: "Nature\nLife", s: "Live Green.", cta: SHOP, font: "Raleway", weight: 800, size: 104, ink: "#ffffff", subInk: "#dcfce7",
    ctaBg: "#ffffff", ctaInk: "#166534",
    product: art("leaves", { c1: "#14532d", c2: "#4ade80" }), pbox: [0.46, 0.0, 0.58, 1], pshadow: false,
  },
];

