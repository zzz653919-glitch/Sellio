import { Router } from "express";
import { get } from "../../db/index.js";
import { badRequest } from "../../lib/errors.js";
import { param } from "../../lib/validate.js";
import { currentUser, requireAuth } from "../../middleware/auth.js";
import { deleteUpload, getOwnedUpload, sendUpload } from "../../services/storage.js";

export const filesRouter = Router();
filesRouter.use(requireAuth);

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Streams a file the current user owns. ?download=1 forces a download. */
filesRouter.get("/:id", async (req, res) => {
  const user = currentUser(req);
  const row = await getOwnedUpload(user.id, param(req, "id"));
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.query.download === "1") {
    const base = (row.original_name ?? `vendora-${row.kind}`).replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.-]+/g, "_").slice(0, 80);
    res.attachment(`${base || "vendora"}.${EXT[row.mime] ?? "bin"}`);
  }
  await sendUpload(res, row);
});

filesRouter.delete("/:id", async (req, res) => {
  const user = currentUser(req);
  const id = param(req, "id");
  const row = await getOwnedUpload(user.id, id);
  if (row.kind !== "product") throw badRequest("Only uploaded product images can be deleted here.");
  const used = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM generations WHERE user_id = ? AND upload_id = ?", user.id, id))?.n ?? 0;
  if (used > 0 && req.query.force !== "1") {
    throw badRequest(`This image is used by ${used} advertisement generation(s). Deleting it also deletes them.`, { generations: used });
  }
  await deleteUpload(user.id, id);
  res.json({ ok: true });
});
