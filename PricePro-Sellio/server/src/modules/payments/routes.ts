import { Router } from "express";
import { z } from "zod";
import { badRequest } from "../../lib/errors.js";
import { imageUpload } from "../../lib/upload.js";
import { param, parseBody } from "../../lib/validate.js";
import { currentUser, requireAuth, requireVerified } from "../../middleware/auth.js";
import { serviceLimiter } from "../../middleware/rateLimit.js";
import {
  attachReceipt, cancelPayment, createPaymentRequest, listPayments, ownRequest, paymentConfig, submitPayment,
} from "../../services/payments.js";
import { sendPrivateFile } from "../../services/storage.js";

/** Manual card payments, user side. Nothing here changes the user's plan; only an administrator's approval does. */
export const paymentsRouter = Router();
paymentsRouter.use(requireAuth);

paymentsRouter.get("/config", (_req, res) => {
  res.json(paymentConfig());
});

paymentsRouter.get("/", async (req, res) => {
  const items = await listPayments(currentUser(req).id);
  res.json({ items, open: items.find((p) => p.status === "pending") ?? null });
});

const createSchema = z.object({ plan: z.enum(["pro", "max"]), interval: z.enum(["month", "year"]).default("month") });

paymentsRouter.post("/", requireVerified, serviceLimiter, async (req, res) => {
  const user = currentUser(req);
  const b = parseBody(req, createSchema);
  res.status(201).json({ payment: await createPaymentRequest(user.id, user.plan, b.plan, b.interval) });
});

paymentsRouter.post("/:id/receipt", requireVerified, serviceLimiter, imageUpload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest("Choose the receipt file (image or PDF).");
  res.json({ payment: await attachReceipt(currentUser(req).id, param(req, "id"), file.buffer, file.originalname || "receipt") });
});

/** "To'lovni tasdiqlash" — sends the receipt to the administrators for review. */
paymentsRouter.post("/:id/submit", requireVerified, async (req, res) => {
  res.json({ payment: await submitPayment(currentUser(req).id, param(req, "id")) });
});

paymentsRouter.delete("/:id", async (req, res) => {
  await cancelPayment(currentUser(req).id, param(req, "id"));
  res.json({ ok: true });
});

/** The owner may open their own receipt. */
paymentsRouter.get("/:id/receipt", async (req, res) => {
  const r = await ownRequest(currentUser(req).id, param(req, "id"));
  if (!r.receipt_key || !r.receipt_mime) throw badRequest("No receipt uploaded.");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "inline");
  await sendPrivateFile(res, r.receipt_key, r.receipt_mime);
});
