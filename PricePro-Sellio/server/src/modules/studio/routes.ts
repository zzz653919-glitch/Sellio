import { Router } from "express";
import { z } from "zod";
import { features } from "../../config.js";
import { badRequest } from "../../lib/errors.js";
import { validateProductImage } from "../../lib/image.js";
import { imageUpload } from "../../lib/upload.js";
import { pagination, param, parseBody, parseQuery } from "../../lib/validate.js";
import { currentUser, requireAuth, requireVerified } from "../../middleware/auth.js";
import { serviceLimiter } from "../../middleware/rateLimit.js";
import { BACKGROUNDS, CATEGORIES, LIGHTING, QUALITIES, SIZES, STYLES } from "./options.js";
import * as studio from "./service.js";

export const studioRouter = Router();
studioRouter.use(requireAuth);

studioRouter.get("/options", (_req, res) => {
  res.json({
    configured: features.imageGeneration,
    categories: CATEGORIES,
    styles: Object.entries(STYLES).map(([value, s]) => ({ value, label: s.label })),
    backgrounds: Object.entries(BACKGROUNDS).map(([value, b]) => ({ value, label: b.label })),
    sizes: Object.entries(SIZES).map(([value, s]) => ({ value, label: s.label, pixels: s.value })),
    qualities: QUALITIES,
    lighting: Object.keys(LIGHTING),
    limits: { maxBytes: 10 * 1024 * 1024, minSide: 256, maxSide: 8000, formats: ["image/png", "image/jpeg", "image/webp"] },
  });
});

studioRouter.post("/uploads", requireVerified, imageUpload.single("file"), (req, res) => {
  const user = currentUser(req);
  if (!req.file) throw badRequest("Choose an image to upload.");
  const info = validateProductImage(req.file.buffer);
  const saved = studio.uploadProductImage(user.id, req.file.buffer, req.file.originalname, info);
  res.status(201).json({
    upload: { id: saved.id, url: `/api/files/${saved.id}`, width: saved.width, height: saved.height, mime: saved.mime, size: saved.size, name: saved.original_name },
  });
});

const generationSchema = z.object({
  uploadId: z.uuid(),
  productName: z.string().trim().min(1, "Product name is required").max(120),
  category: z.enum(CATEGORIES),
  style: z.enum(Object.keys(STYLES) as [keyof typeof STYLES, ...(keyof typeof STYLES)[]]),
  background: z.enum(Object.keys(BACKGROUNDS) as [keyof typeof BACKGROUNDS, ...(keyof typeof BACKGROUNDS)[]]),
  settings: z.object({
    size: z.enum(Object.keys(SIZES) as [keyof typeof SIZES, ...(keyof typeof SIZES)[]]).default("square"),
    quality: z.enum(QUALITIES).default("medium"),
    lighting: z.enum(Object.keys(LIGHTING) as [keyof typeof LIGHTING, ...(keyof typeof LIGHTING)[]]).default("soft"),
    brandColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Brand colour must be a hex colour like #1F5BE0")
      .optional(),
    instructions: z.string().trim().max(300).optional(),
  }),
});

studioRouter.post("/generations", requireVerified, serviceLimiter, (req, res) => {
  const user = currentUser(req);
  const input = parseBody(req, generationSchema);
  res.status(202).json({ generation: studio.createGeneration(user.id, input) });
});

studioRouter.get("/generations", (req, res) => {
  const { limit, offset } = parseQuery(req, pagination);
  res.json(studio.listGenerations(currentUser(req).id, limit, offset));
});

studioRouter.get("/generations/:id", (req, res) => {
  res.json({ generation: studio.getGeneration(currentUser(req).id, param(req, "id")) });
});

studioRouter.post("/generations/:id/retry", requireVerified, serviceLimiter, (req, res) => {
  res.status(202).json({ generation: studio.retryGeneration(currentUser(req).id, param(req, "id")) });
});

studioRouter.delete("/generations/:id", (req, res) => {
  studio.deleteGeneration(currentUser(req).id, param(req, "id"));
  res.json({ ok: true });
});
