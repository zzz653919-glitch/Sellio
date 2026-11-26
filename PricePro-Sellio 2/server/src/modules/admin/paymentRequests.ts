import { Router } from "express";
import { z } from "zod";
import { all, get } from "../../db/index.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { param, parseBody, parseQuery } from "../../lib/validate.js";
import { currentUser } from "../../middleware/auth.js";
import { logAudit } from "../../services/audit.js";
import { approvePayment, rejectPayment, shapePayment, type PaymentRow } from "../../services/payments.js";
import { sendPrivateFile } from "../../services/storage.js";
import { requirePermission } from "./permissions.js";
import { confirmPassword, like, pageOf } from "./util.js";

/** Payment Requests: administrators review receipts and approve or reject manual card payments. */
export const paymentRequestsAdminRouter = Router();

type Row = PaymentRow & { email: string; first_name: string; last_name: string; current_plan: string; reviewer_email: string | null };
const SELECT = `SELECT p.*, u.email, u.first_name, u.last_name, u.plan AS current_plan, rv.email AS reviewer_email
  FROM payment_requests p JOIN users u ON u.id = p.user_id LEFT JOIN users rv ON rv.id = p.reviewed_by`;
const shape = (r: Row) => ({
  ...shapePayment(r),
  user: { id: r.user_id, email: r.email, name: `${r.first_name} ${r.last_name}`, plan: r.current_plan },
  reviewedBy: r.reviewer_email,
});

const listSchema = z.object({ status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"), q: z.string().trim().max(200).optional() });

paymentRequestsAdminRouter.get("/payment-requests", requirePermission("payments.review"), async (req, res) => {
  const q = parseQuery(req, listSchema.passthrough());
  const { page, limit, offset } = pageOf(req);
  // Requests the user has not sent for review yet are not shown (they have no receipt to check).
  const where = ["p.submitted_at IS NOT NULL"]; const params: (string | number)[] = [];
  if (q.status !== "all") { where.push("p.status = ?"); params.push(q.status); }
  if (q.q) { where.push("(u.email LIKE ? ESCAPE '\\' OR p.user_id = ? OR p.id = ?)"); params.push(like(q.q), q.q, q.q); }
  const w = `WHERE ${where.join(" AND ")}`;
  const rows = await all<Row>(`${SELECT} ${w} ORDER BY ${q.status === "pending" ? "p.submitted_at ASC" : "p.submitted_at DESC"} LIMIT ? OFFSET ?`, ...params, limit, offset);
  const total = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM payment_requests p JOIN users u ON u.id = p.user_id ${w}`, ...params))?.n ?? 0;
  const counts = await all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM payment_requests WHERE submitted_at IS NOT NULL GROUP BY status");
  res.json({ items: rows.map(shape), total, page, limit, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
});

async function find(id: string) {
  const r = await get<Row>(`${SELECT} WHERE p.id = ?`, id);
  if (!r || !r.submitted_at) throw notFound("Payment request not found");
  return r;
}

paymentRequestsAdminRouter.get("/payment-requests/:id", requirePermission("payments.review"), async (req, res) => {
  const r = await find(param(req, "id"));
  const history = await all<Row>(`${SELECT} WHERE p.user_id = ? AND p.id != ? AND p.submitted_at IS NOT NULL ORDER BY p.created_at DESC LIMIT 10`, r.user_id, r.id);
  res.json({ payment: shape(r), otherPayments: history.map(shape) });
});

/** Receipts are only streamed to administrators with the review permission (and to their owner, in /api/payments). */
paymentRequestsAdminRouter.get("/payment-requests/:id/receipt", requirePermission("payments.review"), async (req, res) => {
  const r = await find(param(req, "id"));
  if (!r.receipt_key || !r.receipt_mime) throw badRequest("No receipt uploaded.");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "inline");
  await sendPrivateFile(res, r.receipt_key, r.receipt_mime);
});

paymentRequestsAdminRouter.post("/payment-requests/:id/approve", requirePermission("payments.review"), async (req, res) => {
  const { password } = parseBody(req, z.object({ password: z.string().min(1) }));
  await confirmPassword(req, password);
  const admin = currentUser(req);
  const p = await approvePayment(admin.id, admin.email, param(req, "id"));
  await logAudit(req, "payment.approved", { type: "payment", id: p.id },
    `Approved payment ${p.amountUzs.toLocaleString("en-US")} UZS: ${p.plan} (${p.interval}) for user ${p.userId}, active until ${p.periodEnd?.slice(0, 10)}`);
  res.json({ payment: p });
});

paymentRequestsAdminRouter.post("/payment-requests/:id/reject", requirePermission("payments.review"), async (req, res) => {
  const { reason } = parseBody(req, z.object({ reason: z.string().trim().max(300).optional() }));
  const admin = currentUser(req);
  const p = await rejectPayment(admin.id, param(req, "id"), reason || null);
  await logAudit(req, "payment.rejected", { type: "payment", id: p.id }, `Rejected payment of user ${p.userId}${reason ? `: ${reason}` : ""}`);
  res.json({ payment: p });
});
