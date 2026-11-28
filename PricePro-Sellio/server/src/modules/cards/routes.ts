/**
 * AI Product Studio → Product cards: marketplace product-card designs (Uzum Market, Wildberries, Ozon,
 * Yandex Market…). The AI writes the card texts (title, benefits for the infographic, marketplace title,
 * description, ad texts); the designs are drawn in the browser and kept here so they can be edited again.
 */
import { Router } from "express";
import { z } from "zod";
import { features } from "../../config.js";
import { all, get, run } from "../../db/index.js";
import { badRequest, notConfigured, notFound } from "../../lib/errors.js";
import { newId, nowIso, safeJson } from "../../lib/util.js";
import { param, parseBody } from "../../lib/validate.js";
import { currentUser, requireAuth, requireVerified } from "../../middleware/auth.js";
import { serviceLimiter } from "../../middleware/rateLimit.js";
import { logActivity } from "../../services/activity.js";
import { completeJson, LANGUAGE_NAME } from "../../services/llm.js";
import { assertWithinLimit, recordAiRequest } from "../../services/plans.js";
import { getOwnedUpload, readUpload } from "../../services/storage.js";
import { createGeneration, understandEditRequest } from "../studio/service.js";
import { ANGLES, BACKGROUNDS, buildCardPhotoPrompt, LIGHTS, MULTI_ANGLES, THEMES, type AngleKey } from "./photos.js";

export const cardsRouter = Router();
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1F5BE0");
cardsRouter.use(requireAuth);

/**
 * Platforms and the image sizes they ask for. `ratio` is the recommended shape; `base` is the short side
 * used when the user picks another ratio.
 */
export const MARKETPLACES = {
  uzum: { label: "Uzum Market", ratio: "3:4", base: 1080, sizes: [{ w: 1080, h: 1440 }] },
  wildberries: { label: "Wildberries", ratio: "3:4", base: 900, sizes: [{ w: 900, h: 1200 }, { w: 1200, h: 1600 }] },
  ozon: { label: "Ozon", ratio: "3:4", base: 900, sizes: [{ w: 900, h: 1200 }, { w: 1200, h: 1600 }, { w: 1200, h: 1200 }] },
  yandex: { label: "Yandex Market", ratio: "3:4", base: 900, sizes: [{ w: 900, h: 1200 }, { w: 1000, h: 1000 }] },
  amazon: { label: "Amazon", ratio: "1:1", base: 2000, sizes: [{ w: 2000, h: 2000 }, { w: 1600, h: 1600 }] },
  alibaba: { label: "Alibaba", ratio: "1:1", base: 1000, sizes: [{ w: 1000, h: 1000 }, { w: 800, h: 800 }] },
  etsy: { label: "Etsy", ratio: "4:5", base: 2000, sizes: [{ w: 2000, h: 1600 }, { w: 2000, h: 2000 }, { w: 1600, h: 2000 }] },
  shopify: { label: "Shopify", ratio: "1:1", base: 2048, sizes: [{ w: 2048, h: 2048 }, { w: 1600, h: 2000 }] },
  instagram: { label: "Instagram", ratio: "4:5", base: 1080, sizes: [{ w: 1080, h: 1350 }, { w: 1080, h: 1080 }, { w: 1080, h: 1920 }] },
  tiktok: { label: "TikTok Shop", ratio: "1:1", base: 1080, sizes: [{ w: 1080, h: 1080 }, { w: 1080, h: 1920 }] },
  universal: { label: "Universal product design", ratio: "1:1", base: 1080, sizes: [{ w: 1080, h: 1080 }, { w: 1080, h: 1350 }, { w: 1080, h: 1440 }, { w: 1920, h: 1080 }, { w: 1080, h: 1920 }] },
  other: { label: "Other marketplaces", ratio: "3:4", base: 1080, sizes: [{ w: 1080, h: 1440 }, { w: 1080, h: 1080 }, { w: 1200, h: 1600 }] },
} as const;
export type Marketplace = keyof typeof MARKETPLACES;
const MP_KEYS = Object.keys(MARKETPLACES) as [Marketplace, ...Marketplace[]];

/** Icons the AI may choose for the infographic (the web draws them). */
export const CARD_ICONS = [
  "check", "shield-check", "truck", "zap", "battery-full", "droplet", "leaf", "star", "heart", "gift", "clock", "sparkles", "award",
  "thermometer", "ruler", "weight", "package", "feather", "sun", "snowflake", "wifi", "bluetooth", "volume-2", "camera", "smartphone",
  "shirt", "baby", "paw-print", "house", "wrench", "lock", "recycle", "smile", "flame", "wind", "gem", "badge-check", "rotate-ccw", "hand",
  "maximize", "layers", "cpu", "headphones", "dumbbell", "coffee", "utensils", "scissors", "palette", "tag", "percent", "circle-check",
  "medal", "thumbs-up", "sprout", "waves", "bath", "sofa", "lamp", "car", "monitor", "keyboard", "mouse", "watch", "footprints", "glasses", "umbrella",
] as const;

export type CardCopy = {
  title: string; subtitle: string; badge: string;
  benefits: { title: string; text: string; icon: string }[];
  specs: { label: string; value: string }[];
  marketplaceTitle: string; description: string; bullets: string[]; adTexts: string[]; keywords: string[];
};

cardsRouter.get("/options", (_req, res) => {
  res.json({ textAi: features.llm, imageAi: features.imageGeneration, marketplaces: MARKETPLACES, icons: CARD_ICONS });
});

// ---------- AI texts for a card ----------

const lines = z.array(z.string().trim().min(1).max(160)).max(12).default([]);
const inputSchema = z.object({
  name: z.string().trim().min(2, "Enter the product name").max(120),
  features: lines,
  benefits: lines,
  price: z.string().trim().max(40).optional(),
  oldPrice: z.string().trim().max(40).optional(),
  marketplace: z.enum(MP_KEYS),
  language: z.enum(["uz", "ru", "en"]).default("uz"),
  uploadId: z.uuid().optional(),
});
export type CardInput = z.infer<typeof inputSchema>;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const strs = (v: unknown, max: number, n: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);

/** Keep only what fits on a card; nothing the model returns outside the expected shape is used. */
export function cleanCardCopy(raw: Record<string, unknown>, input: CardInput): CardCopy {
  const icons = new Set<string>(CARD_ICONS);
  const benefits = (Array.isArray(raw.benefits) ? raw.benefits : []).map((b) => {
    const o = (b ?? {}) as Record<string, unknown>;
    const icon = str(o.icon, 30);
    return { title: str(o.title, 32), text: str(o.text, 70), icon: icons.has(icon) ? icon : "check" };
  }).filter((b) => b.title).slice(0, 6);
  const specs = (Array.isArray(raw.specs) ? raw.specs : []).map((s) => {
    const o = (s ?? {}) as Record<string, unknown>;
    return { label: str(o.label, 30), value: str(o.value, 40) };
  }).filter((s) => s.label && s.value).slice(0, 6);
  return {
    title: str(raw.title, 60) || input.name.slice(0, 60),
    subtitle: str(raw.subtitle, 90),
    badge: str(raw.badge, 20),
    benefits,
    specs,
    marketplaceTitle: str(raw.marketplaceTitle, 160) || input.name,
    description: typeof raw.description === "string" ? raw.description.trim().slice(0, 3000) : "",
    bullets: strs(raw.bullets, 160, 8),
    adTexts: strs(raw.adTexts, 220, 5),
    keywords: strs(raw.keywords, 40, 15),
  };
}

cardsRouter.post("/copy", requireVerified, serviceLimiter, async (req, res) => {
  const user = currentUser(req);
  const b = parseBody(req, inputSchema);
  if (!features.llm) throw notConfigured("llm", "AI text generation is not configured on this server. An administrator must set GEMINI_API_KEY or OPENAI_API_KEY.");
  await assertWithinLimit(user.id, "ai");
  // The AI also looks at the photo (what the product is, colour, material), when there is one.
  let images: { mime: string; data: Buffer }[] | undefined;
  if (b.uploadId) {
    const up = await getOwnedUpload(user.id, b.uploadId);
    images = [{ mime: up.mime, data: await readUpload(up) }];
  }
  const mp = MARKETPLACES[b.marketplace].label;
  const raw = await completeJson<Record<string, unknown>>({
    system: `You write product cards for ${mp} sellers. Write every text in ${LANGUAGE_NAME[b.language]}.
Rules: use only the facts the seller gives and what is clearly visible in the photo. Never invent specifications, materials, sizes, guarantees, certificates, awards, ratings, discounts or prices.
Card texts must be short: they are printed on the picture. Benefits are for an infographic: a 1–3 word title and a short line.
For each benefit choose the most fitting icon from this list: ${CARD_ICONS.join(", ")}.
"specs": only characteristics the seller gave (label + value). "badge": a 1–2 word label only if it follows from the facts (e.g. "New", "Handmade"), otherwise "".
"marketplaceTitle": a search-friendly product title for ${mp} (type + brand/model + key property), max 120 characters.
"description": a selling description for the product page, 3–5 short paragraphs, no emoji.
Return JSON: {"title": "max 40 characters", "subtitle": "max 70 characters", "badge": "", "benefits": [{"title": "", "text": "", "icon": ""}] (3–5 items),
"specs": [{"label": "", "value": ""}], "marketplaceTitle": "", "description": "", "bullets": [5 short selling points], "adTexts": [3 short ad texts for social media], "keywords": [up to 10 search keywords]}`,
    messages: [{
      role: "user",
      content: JSON.stringify({ product: b.name, features: b.features, benefits: b.benefits, price: b.price, oldPrice: b.oldPrice }),
      images,
    }],
    maxTokens: 3000,
  });
  const copy = cleanCardCopy(raw, b);
  if (!copy.benefits.length && !copy.description) throw badRequest("The AI service returned no usable text. Try again.");
  await recordAiRequest(user.id, "card");
  res.json({ copy });
});

// ---------- saved cards ----------

const ALLOWED_SRC = /^(art:|icon:|pattern:[a-z]+(\|[a-z]=(#[0-9a-fA-F]{3,8}|rgba?\([0-9., ]+\)))*$|\/api\/files\/[0-9a-f-]{36}$)/;
const docSchema = z.object({
  v: z.literal(1),
  templateId: z.string().max(80),
  format: z.string().max(30),
  w: z.number().int().min(200).max(4000),
  h: z.number().int().min(200).max(4000),
  bg: z.unknown(),
  els: z.array(z.record(z.string(), z.unknown())).max(200),
}).passthrough().superRefine((d, ctx) => {
  for (const e of d.els) {
    if (e.type === "image" && (typeof e.src !== "string" || !ALLOWED_SRC.test(e.src))) {
      ctx.addIssue({ code: "custom", message: "Pictures must be uploaded files." });
      return;
    }
  }
  if (JSON.stringify(d).length > 400_000) ctx.addIssue({ code: "custom", message: "The design is too large." });
});
const thumbSchema = z.string().max(250_000).regex(/^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/, "Invalid preview image");
const copySchema = z.record(z.string(), z.unknown());

type CardRow = {
  id: string; user_id: string; group_id: string; name: string; marketplace: string; layout: string; photo_upload_id: string | null;
  input_json: string; copy_json: string; doc_json: string; thumb: string | null; created_at: string; updated_at: string;
};

/** Preview images are served as files (cached by the browser), not inside the JSON. */
const thumbUrl = (id: string, updatedAt: string, has: boolean) => (has ? `/api/cards/${id}/thumb?v=${encodeURIComponent(updatedAt)}` : null);
type ListRow = Pick<CardRow, "id" | "group_id" | "name" | "marketplace" | "layout" | "created_at" | "updated_at"> & { w: number | null; h: number | null; has_thumb: number; product?: string | null; theme?: string | null };
const summary = (r: ListRow) => ({
  id: r.id, groupId: r.group_id, name: r.name, product: r.product ?? null, theme: r.theme ?? null, marketplace: r.marketplace, layout: r.layout,
  w: r.w == null ? null : Number(r.w), h: r.h == null ? null : Number(r.h), thumb: thumbUrl(r.id, r.updated_at, Boolean(r.has_thumb)), createdAt: r.created_at, updatedAt: r.updated_at,
});
const full = (r: CardRow) => {
  const doc = safeJson<{ w?: number; h?: number } | null>(r.doc_json, null);
  return {
    ...summary({ ...r, w: doc?.w ?? null, h: doc?.h ?? null, has_thumb: r.thumb ? 1 : 0 }), photoUploadId: r.photo_upload_id,
    input: safeJson(r.input_json, {}), copy: safeJson(r.copy_json, {}), doc,
  };
};

async function owned(userId: string, id: string) {
  const r = await get<CardRow>("SELECT * FROM product_cards WHERE id = ? AND user_id = ?", id, userId);
  if (!r) throw notFound("Card not found");
  return r;
}

cardsRouter.get("/", async (req, res) => {
  // only what the list shows: the design itself and the preview image are not sent
  const rows = await all<ListRow>(
    `SELECT id, group_id, name, marketplace, layout, created_at, updated_at,
            json_extract(doc_json, '$.w') AS w, json_extract(doc_json, '$.h') AS h, (thumb IS NOT NULL) AS has_thumb,
            json_extract(input_json, '$.name') AS product, json_extract(input_json, '$.config.style.theme') AS theme
       FROM product_cards WHERE user_id = ? ORDER BY updated_at DESC LIMIT 300`,
    currentUser(req).id,
  );
  res.json({ items: rows.map(summary) });
});

cardsRouter.get("/:id/thumb", async (req, res) => {
  const r = await get<{ thumb: string | null }>("SELECT thumb FROM product_cards WHERE id = ? AND user_id = ?", param(req, "id"), currentUser(req).id);
  const m = r?.thumb ? /^data:(image\/(?:jpeg|webp|png));base64,(.+)$/.exec(r.thumb) : null;
  if (!m) throw notFound("Preview not found");
  res.setHeader("Content-Type", m[1]);
  res.setHeader("X-Content-Type-Options", "nosniff");
  // the URL carries the card's version (?v=updatedAt), so the browser may keep it
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.send(Buffer.from(m[2], "base64"));
});

cardsRouter.get("/:id", async (req, res) => {
  res.json({ card: full(await owned(currentUser(req).id, param(req, "id"))) });
});

const newCardSchema = z.object({
  name: z.string().trim().min(1).max(120),
  marketplace: z.enum(MP_KEYS),
  layout: z.string().trim().min(1).max(40),
  photoUploadId: z.uuid().nullable().optional(),
  input: z.record(z.string(), z.unknown()).default({}),
  copy: copySchema.default({}),
  doc: docSchema,
  thumb: thumbSchema.optional(),
});

/** Save the design variants made for one product (all at once, so they belong together). */
cardsRouter.post("/", requireVerified, async (req, res) => {
  const user = currentUser(req);
  // groupId: add more cards to a set saved a moment ago (big sets are sent in parts).
  const b = parseBody(req, z.object({ cards: z.array(newCardSchema).min(1).max(12), groupId: z.uuid().optional() }));
  if (b.groupId && !(await get("SELECT 1 FROM product_cards WHERE user_id = ? AND group_id = ? LIMIT 1", user.id, b.groupId))) throw notFound("Card set not found");
  const photos = new Set(b.cards.map((c) => c.photoUploadId).filter((x): x is string => Boolean(x)));
  for (const p of photos) await getOwnedUpload(user.id, p);
  const count = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM product_cards WHERE user_id = ?", user.id))?.n ?? 0;
  if (count + b.cards.length > 500) throw badRequest("You can keep up to 500 cards. Delete some old ones first.");
  const group = b.groupId ?? newId();
  const now = nowIso();
  const ids: string[] = [];
  for (const c of b.cards) {
    const id = newId();
    ids.push(id);
    await run(
      `INSERT INTO product_cards (id,user_id,group_id,name,marketplace,layout,photo_upload_id,input_json,copy_json,doc_json,thumb,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, user.id, group, c.name, c.marketplace, c.layout, c.photoUploadId ?? null, JSON.stringify(c.input), JSON.stringify(c.copy), JSON.stringify(c.doc), c.thumb ?? null, now, now,
    );
  }
  if (!b.groupId) {
    await logActivity(user.id, "cards_created", "studio", `Product cards created: ${b.cards[0].name}`, { refId: group });
    // the session (with its settings) is kept in My Projects, to open and reuse later
    const product = typeof b.cards[0].input.name === "string" && b.cards[0].input.name ? b.cards[0].input.name : b.cards[0].name;
    await run("INSERT INTO projects (id,user_id,type,ref_id,title,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
      newId(), user.id, "card_session", group, `Cards — ${String(product).slice(0, 100)}`, now, now);
  }
  const rows = await all<CardRow>(`SELECT * FROM product_cards WHERE user_id = ? AND group_id = ? ORDER BY created_at, rowid`, user.id, group);
  res.status(201).json({ cards: rows.map(full) });
});

/** Rename, autosave the design, or update the texts. */
cardsRouter.patch("/:id", async (req, res) => {
  const user = currentUser(req);
  const r = await owned(user.id, param(req, "id"));
  const b = parseBody(req, z.object({ name: z.string().trim().min(1).max(120).optional(), layout: z.string().trim().min(1).max(40).optional(), doc: docSchema.optional(), thumb: thumbSchema.optional(), copy: copySchema.optional() }));
  await run(
    "UPDATE product_cards SET name = ?, layout = ?, doc_json = ?, thumb = ?, copy_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    b.name ?? r.name, b.layout ?? r.layout, b.doc ? JSON.stringify(b.doc) : r.doc_json, b.thumb ?? r.thumb, b.copy ? JSON.stringify(b.copy) : r.copy_json, nowIso(), r.id, user.id,
  );
  res.json({ card: full(await owned(user.id, r.id)) });
});

cardsRouter.post("/:id/duplicate", async (req, res) => {
  const user = currentUser(req);
  const r = await owned(user.id, param(req, "id"));
  const id = newId();
  const now = nowIso();
  const name = `${r.name.slice(0, 110)} (copy)`;
  await run(
    `INSERT INTO product_cards (id,user_id,group_id,name,marketplace,layout,photo_upload_id,input_json,copy_json,doc_json,thumb,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, user.id, r.group_id, name, r.marketplace, r.layout, r.photo_upload_id, r.input_json, r.copy_json, r.doc_json, r.thumb, now, now,
  );
  res.status(201).json({ card: full(await owned(user.id, id)) });
});

/** Delete one creation session: every design made for that product together. */
cardsRouter.delete("/groups/:groupId", async (req, res) => {
  const user = currentUser(req);
  const r = await run("DELETE FROM product_cards WHERE group_id = ? AND user_id = ?", param(req, "groupId"), user.id);
  if (!r.changes) throw notFound("Cards not found");
  await run("DELETE FROM projects WHERE user_id = ? AND type = 'card_session' AND ref_id = ?", user.id, param(req, "groupId"));
  res.json({ ok: true, deleted: r.changes });
});

cardsRouter.delete("/:id", async (req, res) => {
  const user = currentUser(req);
  const r = await run("DELETE FROM product_cards WHERE id = ? AND user_id = ?", param(req, "id"), user.id);
  if (!r.changes) throw notFound("Card not found");
  res.json({ ok: true });
});

/**
 * AI product photos in the chosen theme, camera angle, background and light (one AI image each). The
 * browser follows the generations like any AI Product Studio generation and builds the cards from them.
 */
const photoSchema = z.object({
  uploadId: z.uuid(),
  productName: z.string().trim().max(120).optional(),
  platform: z.enum(MP_KEYS),
  theme: z.enum(Object.keys(THEMES) as [keyof typeof THEMES, ...(keyof typeof THEMES)[]]),
  angle: z.enum([...Object.keys(ANGLES), "multiple"] as unknown as [AngleKey, ...AngleKey[]]).default("auto"),
  background: z.enum(Object.keys(BACKGROUNDS) as [keyof typeof BACKGROUNDS, ...(keyof typeof BACKGROUNDS)[]]).default("auto"),
  lighting: z.enum(Object.keys(LIGHTS) as [keyof typeof LIGHTS, ...(keyof typeof LIGHTS)[]]).default("soft"),
  shadow: z.number().int().min(0).max(100).default(40),
  ratio: z.enum(["1:1", "4:5", "3:4", "16:9", "9:16"]).default("1:1"),
  count: z.number().int().min(1).max(4).default(1),
  transparent: z.boolean().default(false),
  colors: z.object({ main: hexColor.optional(), second: hexColor.optional() }).optional(),
  referenceUploadId: z.uuid().optional(),
});

cardsRouter.post("/photos", requireVerified, serviceLimiter, async (req, res) => {
  const user = currentUser(req);
  const b = parseBody(req, photoSchema);
  const up = await getOwnedUpload(user.id, b.uploadId);
  // the look of a reference picture, put into words by the text AI (when it is available)
  let referenceStyle: string | undefined;
  if (b.referenceUploadId) {
    const ref = await getOwnedUpload(user.id, b.referenceUploadId);
    if (features.llm) {
      try {
        await assertWithinLimit(user.id, "ai");
        const r = await completeJson<{ style?: unknown }>({
          system: "Describe the visual style of this product photo or advertisement so a photographer can copy it: colours, background, surfaces, props, lighting, mood and composition. Do not describe the product itself. At most 50 words. Answer only with JSON: {\"style\": \"...\"}",
          messages: [{ role: "user", content: "Describe the style.", images: [{ mime: ref.mime, data: await readUpload(ref) }] }],
          maxTokens: 300,
        });
        if (typeof r.style === "string" && r.style.trim()) { referenceStyle = r.style.trim().slice(0, 400); await recordAiRequest(user.id, "card_reference"); }
      } catch { /* the photos are made without it */ }
    }
  }
  const size = b.ratio === "1:1" ? "square" : b.ratio === "16:9" ? "landscape" : "portrait";
  const platform = MARKETPLACES[b.platform].label;
  const generations = [];
  let limitMessage: string | null = null;
  let limitResetsAt: string | null = null;
  for (let i = 0; i < b.count; i++) {
    const angle = b.angle === "multiple" ? MULTI_ANGLES[i % MULTI_ANGLES.length] : b.angle;
    const prompt = buildCardPhotoPrompt({ platform, theme: b.theme, angle, background: b.background, lighting: b.lighting, shadow: b.shadow, transparent: b.transparent, colors: b.colors, referenceStyle, productName: b.productName });
    try {
      generations.push(await createGeneration(user.id, {
        uploadId: up.id, productName: b.productName || (up.original_name ?? "Product").replace(/\.[a-z0-9]+$/i, "").slice(0, 120) || "Product", category: "Other",
        style: "auto", background: b.transparent ? "transparent" : "auto",
        settings: { size, quality: "medium", lighting: "soft", customPrompt: prompt, instructions: `${b.theme} · ${angle} · ${b.background}` },
      }));
    } catch (err) {
      // the plan's limit ends part way: keep what was started and say so
      if (generations.length && err instanceof Error && "status" in err && (err as { status: number }).status === 429) {
        limitMessage = err.message;
        const d = (err as { details?: { resetsAt?: unknown } }).details;
        limitResetsAt = typeof d?.resetsAt === "string" ? d.resetsAt : null;
        break;
      }
      throw err;
    }
  }
  res.status(202).json({ generations, referenceStyle: referenceStyle ?? null, limitMessage, limitResetsAt });
});

/**
 * Change a picture used on a card with AI — for example the words printed in it ("remove the OVERSIZED FIT
 * text", "change the text to NEW"). Runs as an AI image request (counted in the plan's AI image limit); the
 * browser follows it like any AI Product Studio generation and puts the result on the card.
 */
cardsRouter.post("/edit-image", requireVerified, serviceLimiter, async (req, res) => {
  const user = currentUser(req);
  const b = parseBody(req, z.object({ uploadId: z.uuid(), instructions: z.string().trim().min(3, "Describe the change").max(500), transparent: z.boolean().default(false) }));
  const up = await getOwnedUpload(user.id, b.uploadId);
  const ratio = (up.width ?? 1) / Math.max(1, up.height ?? 1);
  const size = ratio > 1.2 ? "landscape" : ratio < 0.83 ? "portrait" : "square";
  const understood = await understandEditRequest(b.instructions);
  const generation = await createGeneration(user.id, {
    uploadId: up.id, productName: (up.original_name ?? "Card picture").replace(/\.[a-z0-9]+$/i, "").slice(0, 120) || "Card picture", category: "Other",
    style: "auto", background: b.transparent ? "transparent" : "auto",
    settings: { size, quality: "medium", lighting: "soft", instructions: b.instructions, edit: true, ...understood },
  });
  res.status(202).json({ generation });
});

/** How many saved cards use an uploaded picture (so it is not deleted by accident). */
export async function cardsUsingUpload(userId: string, uploadId: string) {
  return (await get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM product_cards WHERE user_id = ? AND (photo_upload_id = ? OR doc_json LIKE ?)",
    userId, uploadId, `%/api/files/${uploadId}%`,
  ))?.n ?? 0;
}
