import { Router } from "express";
import { z } from "zod";
import { features } from "../../config.js";
import { all, get, run } from "../../db/index.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { inspectImage } from "../../lib/image.js";
import { imageUpload } from "../../lib/upload.js";
import { newId, nowIso, safeJson, startOfMonthIso } from "../../lib/util.js";
import { param, parseBody } from "../../lib/validate.js";
import { currentUser, requireAuth, requireVerified } from "../../middleware/auth.js";
import { serviceLimiter } from "../../middleware/rateLimit.js";
import { logActivity } from "../../services/activity.js";
import { completeJson, LANGUAGE_NAME, llmProvider } from "../../services/llm.js";
import { assertWithinLimit, recordAiRequest } from "../../services/plans.js";
import { getOwnedUpload, saveImage } from "../../services/storage.js";
import { CATEGORIES } from "../studio/options.js";
import { getGeneration } from "../studio/service.js";
import { getBrand } from "./brand.js";

export { getBrand };
import { attachAsset, ownedInitiative } from "../growth/routes.js";

/** Advertising & Design Studio: brand kit, AI copy, AI reviews, competitor ads and saved banners. */
export const adsRouter = Router();
adsRouter.use(requireAuth);

export const PLATFORMS = ["instagram", "telegram", "facebook", "google"] as const;
export const FONTS = ["Inter", "Montserrat", "Poppins", "Playfair Display", "Oswald", "Roboto Slab", "Nunito", "Bebas Neue"] as const;
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1F5BE0");

adsRouter.get("/options", (_req, res) => {
  res.json({ textAi: features.llm, textAiProvider: llmProvider()?.name ?? null, imageGeneration: features.imageGeneration, platforms: PLATFORMS, fonts: FONTS, categories: CATEGORIES });
});

// ---------- Brand kit ----------

const brandSchema = z.object({
  businessName: z.string().trim().max(100).optional(),
  slogan: z.string().trim().max(150).optional(),
  logoUploadId: z.uuid().nullable().optional(),
  primaryColor: hex.optional(),
  secondaryColor: hex.optional(),
  accentColor: hex.optional(),
  headingFont: z.enum(FONTS).optional(),
  bodyFont: z.enum(FONTS).optional(),
  tone: z.string().trim().max(200).optional(),
  styles: z.array(z.string().max(40)).max(6).optional(),
});

adsRouter.get("/brand", async (req, res) => {
  res.json({ brand: await getBrand(currentUser(req).id) });
});

adsRouter.put("/brand", async (req, res) => {
  const user = currentUser(req);
  const b = parseBody(req, brandSchema);
  if (b.logoUploadId) await getOwnedUpload(user.id, b.logoUploadId);
  await run(
    `INSERT INTO brand_profiles (user_id,business_name,slogan,logo_upload_id,primary_color,secondary_color,accent_color,heading_font,body_font,tone,styles_json,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET business_name=excluded.business_name, slogan=excluded.slogan, logo_upload_id=excluded.logo_upload_id,
       primary_color=excluded.primary_color, secondary_color=excluded.secondary_color, accent_color=excluded.accent_color,
       heading_font=excluded.heading_font, body_font=excluded.body_font, tone=excluded.tone, styles_json=excluded.styles_json, updated_at=excluded.updated_at`,
    user.id, b.businessName || null, b.slogan || null, b.logoUploadId ?? null, b.primaryColor ?? null, b.secondaryColor ?? null, b.accentColor ?? null,
    b.headingFont ?? null, b.bodyFont ?? null, b.tone || null, JSON.stringify(b.styles ?? []), nowIso(),
  );
  res.json({ brand: await getBrand(user.id) });
});

async function language(userId: string, wanted?: string) {
  return wanted ?? (await get<{ language: string }>("SELECT language FROM user_settings WHERE user_id = ?", userId))?.language ?? "en";
}

const brandLine = (b: Awaited<ReturnType<typeof getBrand>>) =>
  b ? JSON.stringify({ businessName: b.businessName, slogan: b.slogan, tone: b.tone, preferredStyles: b.styles }) : "No brand kit saved.";

// ---------- AI ad copywriter ----------

const copySchema = z.object({
  product: z.string().trim().min(2, "Enter the product").max(120),
  description: z.string().trim().max(800).optional(),
  audience: z.string().trim().max(200).optional(),
  offer: z.string().trim().max(200).optional(),
  price: z.string().trim().max(60).optional(),
  tone: z.string().trim().max(100).optional(),
  language: z.enum(["uz", "ru", "en"]),
  platforms: z.array(z.enum(PLATFORMS)).min(1).max(4),
  initiativeId: z.uuid().optional(),
});

export type AdCopy = {
  headlines: string[];
  descriptions: string[];
  promos: string[];
  ctas: string[];
  instagram?: { caption: string; hashtags: string[] };
  telegram?: { post: string };
  facebook?: { primaryText: string; headline: string };
  google?: { headlines: string[]; descriptions: string[] };
  notes?: string[];
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strs = (v: unknown, max: number, n: number) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean).slice(0, n) : []);

/** Keep only well-formed fields; Google Ads limits (30 / 90 characters) are enforced, not trusted. */
export function cleanCopy(raw: Record<string, unknown>, platforms: readonly string[]): AdCopy {
  const o = (k: string) => (raw[k] && typeof raw[k] === "object" ? (raw[k] as Record<string, unknown>) : {});
  const out: AdCopy = {
    headlines: strs(raw.headlines, 120, 6),
    descriptions: strs(raw.descriptions, 600, 3),
    promos: strs(raw.promos, 300, 4),
    ctas: strs(raw.ctas, 40, 6),
  };
  if (platforms.includes("instagram")) out.instagram = { caption: str(o("instagram").caption, 2200), hashtags: strs(o("instagram").hashtags, 40, 15).map((h) => (h.startsWith("#") ? h : `#${h}`)) };
  if (platforms.includes("telegram")) out.telegram = { post: str(o("telegram").post, 1500) };
  if (platforms.includes("facebook")) out.facebook = { primaryText: str(o("facebook").primaryText, 1000), headline: str(o("facebook").headline, 60) };
  if (platforms.includes("google")) out.google = { headlines: strs(o("google").headlines, 200, 10).filter((h) => h.length <= 30).slice(0, 5), descriptions: strs(o("google").descriptions, 300, 6).filter((d) => d.length <= 90).slice(0, 2) };
  return out;
}

adsRouter.post("/copy", requireVerified, serviceLimiter, async (req, res) => {
  const user = currentUser(req);
  const b = parseBody(req, copySchema);
  await ownedInitiative(user.id, b.initiativeId); // 404 before any AI call
  await assertWithinLimit(user.id, "ai");
  const brand = await getBrand(user.id);
  const raw = await completeJson<Record<string, unknown>>({
    system: `You are an advertising copywriter for small businesses in Uzbekistan. Write in ${LANGUAGE_NAME[b.language]}.
Rules: use only facts given by the user (product, description, price, offer). Never invent discounts, prices, guarantees, awards, statistics or reviews.
If no price or offer is given, do not mention one. Respect the brand tone. Keep it natural for local customers.
Return JSON: {"headlines": [5 short headlines], "descriptions": [2 product descriptions, 2–3 sentences], "promos": [3 promotional messages], "ctas": [5 calls to action, max 4 words],
${b.platforms.includes("instagram") ? '"instagram": {"caption": "...", "hashtags": ["#..."]},' : ""}
${b.platforms.includes("telegram") ? '"telegram": {"post": "a Telegram channel post with emoji and line breaks"},' : ""}
${b.platforms.includes("facebook") ? '"facebook": {"primaryText": "...", "headline": "max 40 characters"},' : ""}
${b.platforms.includes("google") ? '"google": {"headlines": [5 headlines, EACH at most 30 characters], "descriptions": [2 descriptions, EACH at most 90 characters]},' : ""}
"notes": []}
Brand: ${brandLine(brand)}`,
    messages: [{ role: "user", content: JSON.stringify({ product: b.product, description: b.description, audience: b.audience, offer: b.offer, price: b.price, tone: b.tone ?? brand?.tone }) }],
    maxTokens: 3000,
  });
  const result = cleanCopy(raw, b.platforms);
  if (!result.headlines.length && !result.descriptions.length) throw badRequest("The AI service returned no usable text. Try again.");
  const id = newId();
  await run("INSERT INTO ad_copies (id,user_id,product,language,input_json,result_json,created_at) VALUES (?,?,?,?,?,?,?)", id, user.id, b.product, b.language, JSON.stringify(b), JSON.stringify(result), nowIso());
  await recordAiRequest(user.id, "copy");
  await attachAsset(user.id, b.initiativeId, "copy", id);
  res.status(201).json({ copy: { id, product: b.product, language: b.language, input: b, result, createdAt: nowIso() } });
});

adsRouter.get("/copy", async (req, res) => {
  const rows = await all<{ id: string; product: string; language: string; input_json: string; result_json: string; created_at: string }>(
    "SELECT * FROM ad_copies WHERE user_id = ? ORDER BY created_at DESC LIMIT 30", currentUser(req).id,
  );
  res.json({ items: rows.map((r) => ({ id: r.id, product: r.product, language: r.language, input: safeJson(r.input_json, {}), result: safeJson(r.result_json, null), createdAt: r.created_at })) });
});

adsRouter.delete("/copy/:id", async (req, res) => {
  const r = await run("DELETE FROM ad_copies WHERE id = ? AND user_id = ?", param(req, "id"), currentUser(req).id);
  if (!r.changes) throw notFound("Not found");
  res.json({ ok: true });
});

// ---------- AI creative review (vision) ----------

type Review = { summary: string; scores: Record<string, number>; strengths: string[]; improvements: string[] };
const SCORE_KEYS = ["visualQuality", "readability", "composition", "productVisibility", "brandConsistency"] as const;

adsRouter.post("/review", requireVerified, serviceLimiter, imageUpload.single("file"), async (req, res) => {
  const user = currentUser(req);
  if (!req.file) throw badRequest("Choose an image to upload.");
  const info = (() => { try { return inspectImage(req.file!.buffer); } catch { throw badRequest("The file is not a PNG, JPEG or WebP image."); } })();
  await assertWithinLimit(user.id, "ai");
  const lang = await language(user.id, typeof req.body?.language === "string" ? req.body.language : undefined);
  const platform = typeof req.body?.platform === "string" ? req.body.platform.slice(0, 40) : "social media";
  const brand = await getBrand(user.id);
  const raw = await completeJson<Record<string, unknown>>({
    system: `You review advertising creatives for small businesses. Answer in ${LANGUAGE_NAME[lang] ?? "English"}.
Judge only what is visible in the image. Return JSON: {"summary": "2 sentences", "scores": {${SCORE_KEYS.map((k) => `"${k}": 0-100`).join(", ")}}, "strengths": [up to 4], "improvements": [up to 5 concrete fixes]}.
brandConsistency: compare with the brand kit if given, otherwise judge internal consistency. Target platform: ${platform}.
Brand kit: ${brand ? JSON.stringify({ name: brand.businessName, colors: [brand.primaryColor, brand.secondaryColor, brand.accentColor].filter(Boolean), tone: brand.tone }) : "none"}`,
    messages: [{ role: "user", content: "Review this advertisement.", images: [{ mime: info.mime, data: req.file.buffer }] }],
    maxTokens: 1500,
  });
  const scoresRaw = (raw.scores ?? {}) as Record<string, unknown>;
  const review: Review = {
    summary: str(raw.summary, 600),
    scores: Object.fromEntries(SCORE_KEYS.map((k) => [k, Math.max(0, Math.min(100, Math.round(Number(scoresRaw[k]) || 0)))])),
    strengths: strs(raw.strengths, 300, 4),
    improvements: strs(raw.improvements, 300, 5),
  };
  await recordAiRequest(user.id, "review");
  res.json({ review, model: llmProvider()?.name ?? null });
});

// ---------- Competitor ad intelligence ----------

const compAdSchema = z.object({
  competitorName: z.string().trim().min(1, "Enter the competitor").max(100),
  adText: z.string().trim().max(3000).optional(),
  language: z.enum(["uz", "ru", "en"]).optional(),
});

adsRouter.post("/competitor-ads", requireVerified, serviceLimiter, imageUpload.single("file"), async (req, res) => {
  const user = currentUser(req);
  const b = parseBody(req, compAdSchema);
  if (!b.adText && !req.file) throw badRequest("Paste the ad text or upload a screenshot of the ad.");
  let image: { mime: string; data: Buffer } | undefined;
  if (req.file) {
    try { image = { mime: inspectImage(req.file.buffer).mime, data: req.file.buffer }; } catch { throw badRequest("The file is not a PNG, JPEG or WebP image."); }
  }
  await assertWithinLimit(user.id, "ai");
  const lang = await language(user.id, b.language);
  const brand = await getBrand(user.id);
  const raw = await completeJson<Record<string, unknown>>({
    system: `You analyse a competitor's public advertisement for a small business owner. Answer in ${LANGUAGE_NAME[lang] ?? "English"}.
Use only what is in the ad text / image. Do not guess sales, budgets or results. Return JSON:
{"style": "visual and writing style", "messages": [key messages], "offers": [offers or prices shown, only if visible], "tone": "...", "audience": "who it targets", "positioning": "how they position themselves",
"strengths": [...], "weaknesses": [...], "differentiation": [3–5 concrete ways the user can stand out]}
The user's brand: ${brandLine(brand)}`,
    messages: [{ role: "user", content: `Competitor: ${b.competitorName}\nAd text: ${b.adText ?? "(see image)"}`, images: image ? [image] : undefined }],
    maxTokens: 2000,
  });
  const analysis = {
    style: str(raw.style, 400), tone: str(raw.tone, 200), audience: str(raw.audience, 300), positioning: str(raw.positioning, 400),
    messages: strs(raw.messages, 300, 6), offers: strs(raw.offers, 200, 6), strengths: strs(raw.strengths, 300, 5), weaknesses: strs(raw.weaknesses, 300, 5), differentiation: strs(raw.differentiation, 400, 6),
  };
  const id = newId(), now = nowIso();
  // The screenshot is analysed and not stored.
  await run("INSERT INTO competitor_ads (id,user_id,competitor_name,ad_text,had_image,analysis_json,created_at) VALUES (?,?,?,?,?,?,?)", id, user.id, b.competitorName, b.adText ?? null, image ? 1 : 0, JSON.stringify(analysis), now);
  await recordAiRequest(user.id, "competitor_ad");
  res.status(201).json({ item: { id, competitorName: b.competitorName, adText: b.adText ?? null, hadImage: Boolean(image), analysis, createdAt: now } });
});

adsRouter.get("/competitor-ads", async (req, res) => {
  const rows = await all<{ id: string; competitor_name: string; ad_text: string | null; had_image: number; analysis_json: string; created_at: string }>(
    "SELECT * FROM competitor_ads WHERE user_id = ? ORDER BY created_at DESC LIMIT 30", currentUser(req).id,
  );
  res.json({ items: rows.map((r) => ({ id: r.id, competitorName: r.competitor_name, adText: r.ad_text, hadImage: r.had_image === 1, analysis: safeJson(r.analysis_json, null), createdAt: r.created_at })) });
});

adsRouter.delete("/competitor-ads/:id", async (req, res) => {
  const r = await run("DELETE FROM competitor_ads WHERE id = ? AND user_id = ?", param(req, "id"), currentUser(req).id);
  if (!r.changes) throw notFound("Not found");
  res.json({ ok: true });
});

// ---------- Banners made from templates (rendered in the browser) ----------

const bannerSchema = z.object({
  productName: z.string().trim().min(1, "Enter the product name").max(120),
  category: z.enum(CATEGORIES).default("Other"),
  template: z.string().trim().min(1).max(60),
  format: z.string().trim().min(1).max(40),
  productUploadId: z.uuid().optional(),
  initiativeId: z.uuid().optional(),
});

export const BANNERS_PER_MONTH = 300;

adsRouter.post("/banners", requireVerified, serviceLimiter, imageUpload.single("file"), async (req, res) => {
  const user = currentUser(req);
  const used = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM generations WHERE user_id = ? AND provider = 'vendora-templates' AND created_at >= ?", user.id, startOfMonthIso()))?.n ?? 0;
  if (used >= BANNERS_PER_MONTH) throw badRequest(`You can save up to ${BANNERS_PER_MONTH} template banners per month. Download them as PNG instead.`);
  const b = parseBody(req, bannerSchema);
  if (!req.file) throw badRequest("The banner image is missing.");
  let info;
  try { info = inspectImage(req.file.buffer); } catch { throw badRequest("The banner must be a PNG, JPEG or WebP image."); }
  if (info.width < 200 || info.height < 50 || info.width > 4000 || info.height > 4000) throw badRequest("Unexpected banner size.");
  const product = b.productUploadId ? await getOwnedUpload(user.id, b.productUploadId) : null;
  await ownedInitiative(user.id, b.initiativeId);
  const saved = await saveImage(user.id, "generated", req.file.buffer, info, `${b.productName}.png`);
  const id = newId(), now = nowIso();
  await run(
    `INSERT INTO generations (id,user_id,upload_id,result_upload_id,product_name,category,style,background,settings_json,prompt,status,provider,model,created_at,updated_at,completed_at)
     VALUES (?,?,?,?,?,?,?,?,?,?, 'succeeded', 'vendora-templates', ?, ?,?,?)`,
    id, user.id, product?.id ?? saved.id, saved.id, b.productName, b.category, `template:${b.template}`, "template",
    JSON.stringify({ format: b.format, width: info.width, height: info.height }), "Banner made from a template in the browser (no AI image generation).",
    b.template, now, now, now,
  );
  await logActivity(user.id, "ad_created", "studio", `Advertisement created: ${b.productName}`, { refId: id });
  await attachAsset(user.id, b.initiativeId, "banner", id);
  res.status(201).json({ generation: await getGeneration(user.id, id) });
});
