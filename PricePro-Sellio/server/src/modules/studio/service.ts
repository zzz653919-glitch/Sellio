import { savedRefs, type SavedRefs } from "../../services/savedRefs.js";
import { waitUntil } from "@vercel/functions";
import { all, get, run } from "../../db/index.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { inspectImage } from "../../lib/image.js";
import { newId, nowIso, safeJson } from "../../lib/util.js";
import { logActivity } from "../../services/activity.js";
import { notify } from "../../services/notifications.js";
import { consumeRequest, releaseRequest, reserveRequest } from "../../services/quota.js";
import { deleteUpload, getOwnedUpload, readUpload, saveImage } from "../../services/storage.js";
import { buildPrompt, SIZES, STYLES, type BackgroundKey, type LightingKey, type SizeKey, type StyleKey } from "./options.js";
import { getImageProvider } from "./provider.js";

export type GenerationInput = {
  uploadId: string;
  productName: string;
  category: string;
  style: StyleKey;
  background: BackgroundKey;
  settings: {
    size: SizeKey;
    quality: "low" | "medium" | "high";
    lighting: LightingKey;
    brandColor?: string;
    instructions?: string;
  };
};

type GenerationRow = {
  id: string; user_id: string; upload_id: string; result_upload_id: string | null;
  product_name: string; category: string; style: string; background: string; settings_json: string;
  prompt: string; status: "queued" | "processing" | "succeeded" | "failed"; provider: string; model: string;
  error: string | null; retry_of: string | null; created_at: string; updated_at: string; completed_at: string | null;
};

export async function serializeGeneration(g: GenerationRow, userId: string, refs?: SavedRefs) {
  const project = refs ? (refs.project.has(g.id) ? { id: refs.project.get(g.id)! } : undefined) : await get<{ id: string }>("SELECT id FROM projects WHERE user_id = ? AND type = 'advertisement' AND ref_id = ?", userId, g.id);
  const favorite = refs ? (refs.favorite.has(g.id) ? { id: refs.favorite.get(g.id)! } : undefined) : await get<{ id: string }>("SELECT id FROM favorites WHERE user_id = ? AND item_type = 'advertisement' AND ref_id = ?", userId, g.id);
  return {
    id: g.id,
    status: g.status,
    productName: g.product_name,
    category: g.category,
    style: g.style,
    styleLabel: g.provider === "vendora-templates" ? "Banner template" : (STYLES[g.style as StyleKey]?.label ?? g.style),
    background: g.background,
    settings: safeJson(g.settings_json, {}),
    provider: g.provider,
    model: g.model,
    error: g.error,
    retryOf: g.retry_of,
    originalUrl: `/api/files/${g.upload_id}`,
    uploadId: g.upload_id,
    resultUrl: g.result_upload_id ? `/api/files/${g.result_upload_id}` : null,
    resultUploadId: g.result_upload_id,
    projectId: project?.id ?? null,
    favoriteId: favorite?.id ?? null,
    createdAt: g.created_at,
    completedAt: g.completed_at,
  };
}

// ---------------------------------------------------------------- job queue
const MAX_CONCURRENT = 2;
const queue: string[] = [];
let active = 0;
const listeners = new Set<(id: string) => void>();

/** Test hook: resolve when a generation finishes. */
export function onGenerationSettled(fn: (id: string) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function enqueue(id: string) {
  queue.push(id);
  pump();
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const id = queue.shift()!;
    active++;
    const job = processGeneration(id)
      .catch((err) => console.error("[studio] unexpected job error", err))
      .finally(() => {
        active--;
        listeners.forEach((fn) => fn(id));
        pump();
      });
    // On Vercel the function is frozen after the response unless the work is registered here.
    // Outside Vercel this is a no-op.
    waitUntil(job);
  }
}

async function processGeneration(id: string) {
  const g = await get<GenerationRow>("SELECT * FROM generations WHERE id = ?", id);
  if (!g || g.status !== "queued") return;
  const started = Date.now();
  await run("UPDATE generations SET status = 'processing', updated_at = ? WHERE id = ?", nowIso(), id);
  try {
    const provider = getImageProvider();
    const upload = await getOwnedUpload(g.user_id, g.upload_id);
    const settings = safeJson<GenerationInput["settings"]>(g.settings_json, { size: "square", quality: "medium", lighting: "soft" });
    const output = await provider.edit({
      image: await readUpload(upload),
      mime: upload.mime,
      prompt: g.prompt,
      size: SIZES[settings.size]?.value ?? "1024x1024",
      quality: settings.quality,
      transparent: g.background === "transparent",
    });
    // Never trust the provider blindly: the result must be a real image.
    const info = inspectImage(output);
    const saved = await saveImage(g.user_id, "generated", output, info, `${g.product_name}-ad`);
    const now = nowIso();
    await run(
      "UPDATE generations SET status = 'succeeded', result_upload_id = ?, error = NULL, updated_at = ?, completed_at = ? WHERE id = ?",
      saved.id, now, now, id,
    );
    await consumeRequest("generation", id);
    await logActivity(g.user_id, "ad_created", "studio", `Advertisement created: ${g.product_name}`, { refId: id, durationMs: Date.now() - started });
    await notify(g.user_id, "generation", "Advertisement ready", `Your advertisement for "${g.product_name}" has been generated.`, `/studio?generation=${id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    const now = nowIso();
    await run("UPDATE generations SET status = 'failed', error = ?, updated_at = ?, completed_at = ? WHERE id = ?", message.slice(0, 500), now, now, id);
    await releaseRequest("generation", id);
    await logActivity(g.user_id, "ad_failed", "studio", `Advertisement failed: ${g.product_name}`, { refId: id, success: false, durationMs: Date.now() - started });
    await notify(g.user_id, "generation", "Advertisement failed", `Generation for "${g.product_name}" failed: ${message}`, `/studio?generation=${id}`);
  }
}

/**
 * Jobs run in-process. Anything left unfinished is marked failed so the user can retry:
 * on a single server everything at startup; on Vercel (many short-lived instances) only jobs
 * older than the longest possible function run.
 */
export const STALE_JOB_MS = 15 * 60 * 1000;
export async function recoverInterruptedGenerations(olderThanMs = 0) {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  await run(
    "UPDATE generations SET status = 'failed', error = 'Interrupted before it finished. Use Retry to generate again.', updated_at = ?, completed_at = ? WHERE status IN ('queued','processing') AND updated_at <= ?",
    nowIso(), nowIso(), cutoff,
  );
  // Interrupted generations do not use up a request.
  await run("DELETE FROM usage_events WHERE service = 'generation' AND status = 'reserved' AND ref_id IN (SELECT id FROM generations WHERE status = 'failed')");
}

// ---------------------------------------------------------------- API
export async function uploadProductImage(userId: string, file: Buffer, originalName: string, info: ReturnType<typeof inspectImage>) {
  const saved = await saveImage(userId, "product", file, info, originalName);
  await logActivity(userId, "image_uploaded", "studio", `Product image uploaded: ${originalName}`, { refId: saved.id });
  return saved;
}

export async function createGeneration(userId: string, input: GenerationInput, retryOf?: string) {
  const provider = getImageProvider(); // throws SERVICE_NOT_CONFIGURED before anything is stored
  const upload = await getOwnedUpload(userId, input.uploadId);
  if (upload.kind !== "product") throw badRequest("Choose an uploaded product image.");
  const id = newId();
  // One request is reserved now; it is counted when the image is ready and given back if generation fails.
  await reserveRequest(userId, "generation", id);
  const now = nowIso();
  const prompt = buildPrompt({
    productName: input.productName,
    category: input.category,
    style: input.style,
    background: input.background,
    lighting: input.settings.lighting,
    brandColor: input.settings.brandColor,
    instructions: input.settings.instructions,
  });
  try {
    await run(
      `INSERT INTO generations (id,user_id,upload_id,product_name,category,style,background,settings_json,prompt,status,provider,model,retry_of,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?, 'queued', ?,?,?,?,?)`,
      id, userId, upload.id, input.productName, input.category, input.style, input.background,
      JSON.stringify(input.settings), prompt, provider.name, provider.model, retryOf ?? null, now, now,
    );
  } catch (err) {
    await releaseRequest("generation", id);
    throw err;
  }
  enqueue(id);
  return getGeneration(userId, id);
}

export async function getGeneration(userId: string, id: string) {
  const g = await get<GenerationRow>("SELECT * FROM generations WHERE id = ? AND user_id = ?", id, userId);
  if (!g) throw notFound("Generation not found");
  return serializeGeneration(g, userId);
}

export async function retryGeneration(userId: string, id: string) {
  const g = await get<GenerationRow>("SELECT * FROM generations WHERE id = ? AND user_id = ?", id, userId);
  if (!g) throw notFound("Generation not found");
  if (g.status === "queued" || g.status === "processing") throw badRequest("This generation is still in progress.");
  if (g.provider === "vendora-templates") throw badRequest("Template banners are edited in Ad Studio; they cannot be regenerated with AI.");
  return createGeneration(
    userId,
    {
      uploadId: g.upload_id,
      productName: g.product_name,
      category: g.category,
      style: g.style as StyleKey,
      background: g.background as BackgroundKey,
      settings: safeJson(g.settings_json, { size: "square", quality: "medium", lighting: "soft" }),
    },
    g.id,
  );
}

export async function listGenerations(userId: string, limit = 50, offset = 0) {
  const rows = await all<GenerationRow>(
    "SELECT * FROM generations WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    userId, limit, offset,
  );
  const total = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM generations WHERE user_id = ?", userId))?.n ?? 0;
  const refs = await savedRefs(userId, "advertisement");
  return { items: (await Promise.all(rows.map((g) => serializeGeneration(g, userId, refs)))), total };
}

export async function deleteGeneration(userId: string, id: string) {
  const g = await get<GenerationRow>("SELECT * FROM generations WHERE id = ? AND user_id = ?", id, userId);
  if (!g) throw notFound("Generation not found");
  if (g.status === "queued" || g.status === "processing") throw badRequest("Wait until the generation finishes before deleting it.");
  await run("DELETE FROM generations WHERE id = ? AND user_id = ?", id, userId);
  await run("DELETE FROM projects WHERE user_id = ? AND type = 'advertisement' AND ref_id = ?", userId, id);
  await run("DELETE FROM favorites WHERE user_id = ? AND item_type = 'advertisement' AND ref_id = ?", userId, id);
  if (g.result_upload_id) await deleteUpload(userId, g.result_upload_id);
}
