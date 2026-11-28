/**
 * Multi-Angle Generator: one product photo → AI photos of the same product from other camera angles.
 *
 * Every image is an ordinary AI Product Studio generation (the same queue, provider and plan limits:
 * each image is one AI image, a failed one is not counted). A session keeps the original photo, the
 * settings and the generated images; it is saved in My Projects and can be reopened. The product must
 * stay the same in every view; angles that a single front photo cannot show reliably (back, sides, top,
 * bottom…) are marked so the user checks them against the real product.
 */
import { Router } from "express";
import { z } from "zod";
import { all, get, run } from "../../db/index.js";
import { notFound } from "../../lib/errors.js";
import { newId, nowIso, safeJson } from "../../lib/util.js";
import { param, parseBody } from "../../lib/validate.js";
import { currentUser, requireAuth, requireVerified } from "../../middleware/auth.js";
import { serviceLimiter } from "../../middleware/rateLimit.js";
import { getOwnedUpload } from "../../services/storage.js";
import { features } from "../../config.js";
import { createGeneration, getGeneration } from "../studio/service.js";

export const anglesRouter = Router();
anglesRouter.use(requireAuth);

/** Camera angles. `check`: a single (usually front) photo cannot show this side, so the AI has to reconstruct it. */
export const ANGLES = {
  front: { label: "Front view", prompt: "straight front view, camera at the product's height, centred", check: false },
  back: { label: "Back view", prompt: "back view (the camera behind the product)", check: true },
  left: { label: "Left side", prompt: "left side view (profile from the left)", check: true },
  right: { label: "Right side", prompt: "right side view (profile from the right)", check: true },
  angle45: { label: "45-degree view", prompt: "45-degree view from the front-left, showing the front and the left side", check: false },
  angle90: { label: "90-degree view", prompt: "90-degree side view, exactly perpendicular to the front", check: true },
  top: { label: "Top view", prompt: "top view, camera directly above looking down (flat lay)", check: true },
  bottom: { label: "Bottom view", prompt: "view from below showing the underside of the product", check: true },
  closeup: { label: "Close-up", prompt: "close-up shot filling most of the frame with the product's most important part", check: false },
  macro: { label: "Macro detail", prompt: "macro detail shot of the material, texture and fine craftsmanship, very shallow depth of field", check: false },
  isometric: { label: "Isometric view", prompt: "isometric view from above at about 30 degrees, no perspective distortion", check: true },
  low: { label: "Low angle", prompt: "low-angle shot from slightly below the product looking up, heroic look", check: false },
  high: { label: "High angle", prompt: "high-angle shot from above looking down at about 60 degrees", check: false },
  "three-quarter": { label: "Three-quarter view", prompt: "three-quarter (3/4) perspective view from the front-right", check: false },
  auto: { label: "AI auto angle", prompt: "the camera angle that shows this particular product best; for each variation choose a clearly different angle", check: false },
} as const;
export type AngleKey = keyof typeof ANGLES;

export const BACKGROUNDS = {
  white: "a pure white seamless background",
  black: "a deep black seamless background",
  studio: "a light grey seamless studio backdrop with a soft floor shadow",
  nature: "a realistic natural outdoor setting (wood, stone, plants) that suits the product, softly out of focus",
  luxury: "a luxurious setting: dark polished surfaces, marble or velvet and subtle gold accents",
  gradient: "a smooth soft colour-gradient backdrop",
  ai: "an AI-chosen realistic setting that suits this product best (decide the scene, surface and props yourself, keep it tasteful)",
  custom: "a seamless backdrop in the colour",
} as const;
export const LIGHTS = {
  soft: "soft diffused light, gentle shadows",
  studio: "clean professional studio lighting with softboxes",
  cinematic: "cinematic lighting with rim light and rich contrast",
  natural: "natural daylight",
  dramatic: "dramatic directional light with deep shadows",
} as const;
const RATIOS = { "1:1": "square", "2:3": "portrait", "3:2": "landscape" } as const;
const COUNTS = [2, 4, 6, 8, 12] as const;

/** The prompt for one view. Only keys come from the browser; every word is written here. */
export function buildAnglePrompt(o: { angle: AngleKey; background: keyof typeof BACKGROUNDS; color?: string; lighting: keyof typeof LIGHTS; productName?: string; variant: number; variants: number }) {
  const a = ANGLES[o.angle];
  const bg = o.background === "custom" ? `${BACKGROUNDS.custom} ${o.color ?? "#F2F2F2"}` : BACKGROUNDS[o.background];
  return [
    `Professional e-commerce product photograph of the product shown in the reference image${o.productName ? ` ("${o.productName}")` : ""}.`,
    `CAMERA: ${a.prompt}.`,
    `BACKGROUND: ${bg}.`,
    `LIGHTING: ${LIGHTS[o.lighting]}.`,
    "THE PRODUCT MUST STAY EXACTLY THE SAME as in the reference photo: the same shape, proportions, colours, materials, logos, labels, printed text and details. Do not redesign, recolour, simplify or add anything to the product.",
    "Do not invent features that are not visible in the reference. For sides that the reference does not show, keep them plain and consistent with the visible design — no new logos, buttons, pockets, text or patterns.",
    "Keep the product consistent with the other views of the same product. Photorealistic, sharp focus, high detail, accurate scale, one product only, no text, no watermark.",
    o.variants > 1 ? `Variation ${o.variant + 1} of ${o.variants}: a slightly different composition and framing.` : "",
  ].filter(Boolean).join("\n");
}

type SessionRow = { id: string; user_id: string; name: string; upload_id: string; settings_json: string; created_at: string; updated_at: string };
type ItemRow = { id: string; session_id: string; user_id: string; generation_id: string; angle: string; needs_check: number; settings_json: string; created_at: string };
type GenSettings = { background: keyof typeof BACKGROUNDS; color?: string; lighting: keyof typeof LIGHTS; quality: "low" | "medium" | "high"; ratio: keyof typeof RATIOS; variant: number; variants: number };

async function ownedSession(userId: string, id: string) {
  const s = await get<SessionRow>("SELECT * FROM angle_sessions WHERE id = ? AND user_id = ?", id, userId);
  if (!s) throw notFound("Project not found");
  return s;
}

async function serializeItem(userId: string, i: ItemRow) {
  let gen: { status: string; resultUrl: string | null; resultUploadId: string | null; error: string | null } = { status: "failed", resultUrl: null, resultUploadId: null, error: "The image was deleted" };
  try {
    const g = await getGeneration(userId, i.generation_id);
    gen = { status: g.status, resultUrl: g.resultUrl, resultUploadId: g.resultUploadId, error: g.error };
  } catch { /* the generation was removed from the history */ }
  const a = ANGLES[i.angle as AngleKey];
  return { id: i.id, angle: i.angle, angleLabel: a?.label ?? i.angle, needsCheck: Boolean(i.needs_check), generationId: i.generation_id, settings: safeJson<GenSettings | null>(i.settings_json, null), createdAt: i.created_at, ...gen };
}

async function serializeSession(userId: string, s: SessionRow, withItems = true) {
  const items = withItems ? await all<ItemRow>("SELECT * FROM angle_items WHERE session_id = ? AND user_id = ? ORDER BY created_at, rowid", s.id, userId) : [];
  const count = withItems ? items.length : ((await get<{ n: number }>("SELECT COUNT(*) AS n FROM angle_items WHERE session_id = ?", s.id))?.n ?? 0);
  return {
    id: s.id, name: s.name, uploadId: s.upload_id, originalUrl: `/api/files/${s.upload_id}`,
    settings: safeJson<Record<string, unknown>>(s.settings_json, {}), createdAt: s.created_at, updatedAt: s.updated_at, imageCount: count,
    items: withItems ? await Promise.all(items.map((i) => serializeItem(userId, i))) : undefined,
  };
}

anglesRouter.get("/options", (_req, res) => {
  res.json({
    imageAi: features.imageGeneration,
    angles: Object.entries(ANGLES).map(([key, a]) => ({ key, label: a.label, needsCheck: a.check })),
    counts: COUNTS, backgrounds: Object.keys(BACKGROUNDS), lights: Object.keys(LIGHTS), ratios: Object.keys(RATIOS), qualities: ["low", "medium", "high"],
  });
});

anglesRouter.get("/sessions", async (req, res) => {
  const user = currentUser(req);
  const rows = await all<SessionRow>("SELECT * FROM angle_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100", user.id);
  res.json({ items: await Promise.all(rows.map((s) => serializeSession(user.id, s, false))) });
});

anglesRouter.post("/sessions", requireVerified, async (req, res) => {
  const user = currentUser(req);
  const b = parseBody(req, z.object({ uploadId: z.uuid(), name: z.string().trim().min(1).max(120).optional() }));
  const up = await getOwnedUpload(user.id, b.uploadId);
  const id = newId(), now = nowIso();
  const name = b.name ?? ((up.original_name ?? "").replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim().slice(0, 120) || "Product");
  await run("INSERT INTO angle_sessions (id,user_id,name,upload_id,settings_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", id, user.id, name, up.id, "{}", now, now);
  // kept in My Projects so it can be reopened later
  await run("INSERT OR IGNORE INTO projects (id,user_id,type,ref_id,title,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", newId(), user.id, "angle_session", id, `Angles — ${name}`, now, now);
  res.status(201).json({ session: await serializeSession(user.id, (await ownedSession(user.id, id))) });
});

anglesRouter.get("/sessions/:id", async (req, res) => {
  const user = currentUser(req);
  res.json({ session: await serializeSession(user.id, await ownedSession(user.id, param(req, "id"))) });
});

anglesRouter.patch("/sessions/:id", async (req, res) => {
  const user = currentUser(req);
  const s = await ownedSession(user.id, param(req, "id"));
  const b = parseBody(req, z.object({
    name: z.string().trim().min(1).max(120).optional(),
    cardGroups: z.array(z.uuid()).max(50).optional(),
  }));
  const settings = safeJson<Record<string, unknown>>(s.settings_json, {});
  if (b.cardGroups) settings.cardGroups = [...new Set(b.cardGroups)];
  await run("UPDATE angle_sessions SET name = ?, settings_json = ?, updated_at = ? WHERE id = ?", b.name ?? s.name, JSON.stringify(settings), nowIso(), s.id);
  if (b.name) await run("UPDATE projects SET title = ? WHERE user_id = ? AND type = 'angle_session' AND ref_id = ?", `Angles — ${b.name}`, user.id, s.id);
  res.json({ session: await serializeSession(user.id, await ownedSession(user.id, s.id)) });
});

anglesRouter.delete("/sessions/:id", async (req, res) => {
  const user = currentUser(req);
  const s = await ownedSession(user.id, param(req, "id"));
  await run("DELETE FROM angle_items WHERE session_id = ? AND user_id = ?", s.id, user.id);
  await run("DELETE FROM angle_sessions WHERE id = ?", s.id);
  await run("DELETE FROM projects WHERE user_id = ? AND type = 'angle_session' AND ref_id = ?", user.id, s.id);
  res.json({ ok: true });
});

const genSchema = z.object({
  angles: z.array(z.enum(Object.keys(ANGLES) as [AngleKey, ...AngleKey[]])).min(1, "Choose at least one angle").max(15),
  count: z.number().int().refine((n) => (COUNTS as readonly number[]).includes(n), "Choose 2, 4, 6, 8 or 12 images"),
  background: z.enum(Object.keys(BACKGROUNDS) as [keyof typeof BACKGROUNDS, ...(keyof typeof BACKGROUNDS)[]]).default("white"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  lighting: z.enum(Object.keys(LIGHTS) as [keyof typeof LIGHTS, ...(keyof typeof LIGHTS)[]]).default("studio"),
  quality: z.enum(["low", "medium", "high"]).default("medium"),
  ratio: z.enum(Object.keys(RATIOS) as [keyof typeof RATIOS, ...(keyof typeof RATIOS)[]]).default("1:1"),
});

/** Start one AI image for a view; returns the new item row id. */
/** Two images of the multi-angle generator use one request of the plan: each pair shares a quotaRef. */
async function startImage(userId: string, s: SessionRow, angle: AngleKey, g: GenSettings, quotaRef: string) {
  const generation = await createGeneration(userId, {
    uploadId: s.upload_id, productName: s.name, category: "Other", style: "auto", background: "auto",
    settings: {
      quotaRef,
      size: RATIOS[g.ratio], quality: g.quality, lighting: "soft", instructions: `${ANGLES[angle].label} · ${g.background} · ${g.lighting}`,
      customPrompt: buildAnglePrompt({ angle, background: g.background, color: g.color, lighting: g.lighting, productName: s.name, variant: g.variant, variants: g.variants }),
    },
  });
  return generation.id as string;
}

/**
 * Generate `count` images: the chosen angles one after another (with more images than angles, each angle
 * gets variations). Stops at the plan's limit and keeps what was started.
 */
anglesRouter.post("/sessions/:id/generate", requireVerified, serviceLimiter, async (req, res) => {
  const user = currentUser(req);
  const s = await ownedSession(user.id, param(req, "id"));
  const b = parseBody(req, genSchema);
  const angles = [...new Set(b.angles)];
  const plan = Array.from({ length: b.count }, (_, i) => ({ angle: angles[i % angles.length], variant: Math.floor(i / angles.length), variants: Math.ceil(b.count / angles.length) }));
  const created: ItemRow[] = [];
  let limitMessage: string | null = null;
  let limitResetsAt: string | null = null;
  const batch = newId();
  for (const [k, p] of plan.entries()) {
    const g: GenSettings = { background: b.background, color: b.color, lighting: b.lighting, quality: b.quality, ratio: b.ratio, variant: p.variant, variants: p.variants };
    try {
      const generationId = await startImage(user.id, s, p.angle, g, `angles:${batch}:${Math.floor(k / 2)}`);
      const row: ItemRow = { id: newId(), session_id: s.id, user_id: user.id, generation_id: generationId, angle: p.angle, needs_check: ANGLES[p.angle].check ? 1 : 0, settings_json: JSON.stringify(g), created_at: nowIso() };
      await run("INSERT INTO angle_items (id,session_id,user_id,generation_id,angle,needs_check,settings_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
        row.id, row.session_id, row.user_id, row.generation_id, row.angle, row.needs_check, row.settings_json, row.created_at);
      created.push(row);
    } catch (err) {
      // the plan's limit ends part way: keep what was started and say so
      if (err instanceof Error && "status" in err && (err as { status: number }).status === 429) {
        if (!created.length) throw err;
        limitMessage = err.message;
        limitResetsAt = resetsAtOf(err);
        break;
      }
      throw err;
    }
  }
  const settings = { ...safeJson<Record<string, unknown>>(s.settings_json, {}), last: { angles, count: b.count, background: b.background, color: b.color, lighting: b.lighting, quality: b.quality, ratio: b.ratio } };
  await run("UPDATE angle_sessions SET settings_json = ?, updated_at = ? WHERE id = ?", JSON.stringify(settings), nowIso(), s.id);
  res.status(202).json({ items: await Promise.all(created.map((i) => serializeItem(user.id, i))), limitMessage, limitResetsAt, planned: plan.length });
});

/** When the plan's limit renews (from a LIMIT_REACHED error), so the app can show it. */
function resetsAtOf(err: unknown): string | null {
  const d = (err as { details?: { resetsAt?: unknown } }).details;
  return typeof d?.resetsAt === "string" ? d.resetsAt : null;
}

async function ownedItem(userId: string, id: string) {
  const i = await get<ItemRow>("SELECT * FROM angle_items WHERE id = ? AND user_id = ?", id, userId);
  if (!i) throw notFound("Image not found");
  return i;
}

/**
 * Regenerated images are paired too: the first one opens a request, the next one (within an hour) uses the
 * same request. So two regenerated images also cost one request.
 */
async function regenRef(userId: string, sessionId: string) {
  const s = await ownedSession(userId, sessionId);
  const st = safeJson<Record<string, unknown>>(s.settings_json, {});
  const open = typeof st.openRegen === "string" ? st.openRegen : null;
  let ref: string | null = null;
  if (open) {
    const users = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM generations WHERE user_id = ? AND json_extract(settings_json, '$.quotaRef') = ?", userId, open))?.n ?? 0;
    const held = await get("SELECT 1 FROM usage_events WHERE user_id = ? AND service = 'generation' AND ref_id = ? AND created_at >= ?", userId, open, new Date(Date.now() - 3600_000).toISOString());
    if (users === 1 && held) ref = open;
  }
  const next = ref ? null : `angles-regen:${newId()}`;
  await run("UPDATE angle_sessions SET settings_json = ? WHERE id = ?", JSON.stringify({ ...st, openRegen: next }), s.id);
  return ref ?? next!;
}

/** Make the same view again (one more AI image); the item then shows the new picture. */
anglesRouter.post("/items/:id/regenerate", requireVerified, serviceLimiter, async (req, res) => {
  const user = currentUser(req);
  const i = await ownedItem(user.id, param(req, "id"));
  const s = await ownedSession(user.id, i.session_id);
  const g = safeJson<GenSettings>(i.settings_json, { background: "white", lighting: "studio", quality: "medium", ratio: "1:1", variant: 0, variants: 1 });
  const generationId = await startImage(user.id, s, i.angle as AngleKey, g, await regenRef(user.id, s.id));
  await run("UPDATE angle_items SET generation_id = ?, created_at = ? WHERE id = ?", generationId, nowIso(), i.id);
  await run("UPDATE angle_sessions SET updated_at = ? WHERE id = ?", nowIso(), s.id);
  res.status(202).json({ item: await serializeItem(user.id, await ownedItem(user.id, i.id)) });
});

anglesRouter.delete("/items/:id", async (req, res) => {
  const user = currentUser(req);
  const i = await ownedItem(user.id, param(req, "id"));
  await run("DELETE FROM angle_items WHERE id = ?", i.id);
  res.json({ ok: true });
});

/** For My Projects. */
export async function angleSessionSummary(userId: string, id: string) {
  const s = await ownedSession(userId, id);
  const rows = await all<ItemRow>("SELECT * FROM angle_items WHERE session_id = ? AND user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 12", s.id, userId);
  let thumb: string | null = null;
  for (const r of rows) { const it = await serializeItem(userId, r); if (it.resultUrl) { thumb = it.resultUrl; break; } }
  const n = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM angle_items WHERE session_id = ?", s.id))?.n ?? 0;
  return { name: s.name, thumbnailUrl: thumb ?? `/api/files/${s.upload_id}`, imageCount: n };
}

