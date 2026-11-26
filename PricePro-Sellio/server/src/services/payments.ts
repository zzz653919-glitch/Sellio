/**
 * Manual card payments.
 *
 *  user: choose PRO / MAX → request "pending" → pays in the bank app → uploads the receipt → "To'lovni tasdiqlash" (submitted)
 *  admin: reviews the receipt → approve (plan activated) or reject (user may try again)
 *
 * Nothing here ever changes a plan except approvePayment(), which only an administrator with
 * the payments.review permission can call, never for their own request, and only once (atomic status change).
 */
import { all, get, run, transaction } from "../db/index.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { newId, nowIso, safeJson } from "../lib/util.js";
import { logActivity } from "./activity.js";
import { getPlans, type Plan } from "./plans.js";
import { removePrivateFile, storePrivateFile } from "./storage.js";
import { settings } from "./settings.js";
import { notify } from "./notifications.js";

export type PaidPlan = "pro" | "max";
export type Interval = "month" | "year";
export type PaymentStatus = "pending" | "approved" | "rejected" | "cancelled";

export type PaymentRow = {
  id: string; user_id: string; plan: PaidPlan; billing_interval: Interval; amount_usd: number; amount_uzs: number; card_json: string;
  status: PaymentStatus; receipt_key: string | null; receipt_mime: string | null; receipt_name: string | null; receipt_size: number | null;
  submitted_at: string | null; reviewed_by: string | null; reviewed_at: string | null; reject_reason: string | null; period_end: string | null;
  created_at: string; updated_at: string;
};

/** Receipt files: images or PDF, checked by their bytes (not by the name or the browser's type). */
export const RECEIPT_TYPES: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" };
export function receiptType(buf: Buffer): string | null {
  if (buf.length < 16) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return null;
}

/** Price of a plan for a billing interval, in USD and in so'm (rounded up to 1,000 so'm). */
export function priceOf(plan: PaidPlan, interval: Interval) {
  const info = getPlans()[plan];
  const usd = interval === "year" ? info.priceYearlyUsd : info.priceMonthlyUsd;
  if (usd === null || usd === undefined) return null;
  const rate = settings().manualPayment.uzsPerUsd;
  return { usd, uzs: Math.ceil((usd * rate) / 1000) * 1000 };
}

export function paymentConfig() {
  const m = settings().manualPayment;
  const plans = (["pro", "max"] as const).map((p) => {
    const info = getPlans()[p];
    return {
      key: p, name: info.name, enabled: info.enabled,
      month: priceOf(p, "month"), year: priceOf(p, "year"),
      requests: info.limits.requests, forecasts: info.limits.forecasts, requestPeriod: info.requestPeriod, periodHours: info.periodHours, ai: info.limits.ai,
    };
  });
  return { enabled: m.enabled, card: { number: m.cardNumber, holder: m.cardholder, bank: m.bank, type: m.cardType }, uzsPerUsd: m.uzsPerUsd, plans };
}

export function shapePayment(r: PaymentRow) {
  return {
    id: r.id, plan: r.plan, interval: r.billing_interval, amountUsd: r.amount_usd, amountUzs: r.amount_uzs,
    card: safeJson<{ number: string; holder: string; bank: string; type: string }>(r.card_json, { number: "", holder: "", bank: "", type: "" }),
    status: r.status, submitted: Boolean(r.submitted_at), submittedAt: r.submitted_at,
    receipt: r.receipt_key ? { name: r.receipt_name, mime: r.receipt_mime, size: r.receipt_size } : null,
    reviewedAt: r.reviewed_at, rejectReason: r.reject_reason, periodEnd: r.period_end, createdAt: r.created_at,
  };
}

async function ownRequest(userId: string, id: string) {
  const r = await get<PaymentRow>("SELECT * FROM payment_requests WHERE id = ? AND user_id = ?", id, userId);
  if (!r) throw notFound("Payment request not found");
  return r;
}

// ---------------------------------------------------------------- user side
/** Start (or change) the open payment request. Never changes the user's plan. */
export async function createPaymentRequest(userId: string, currentPlan: Plan, plan: PaidPlan, interval: Interval) {
  const m = settings().manualPayment;
  if (!m.enabled) throw badRequest("Card payments are not available right now.");
  const info = getPlans()[plan];
  if (!info.enabled) throw badRequest(`The ${info.name} plan is not available for purchase right now.`);
  const price = priceOf(plan, interval);
  if (!price) throw badRequest(`${info.name} cannot be paid ${interval === "year" ? "yearly" : "monthly"}.`);
  if (currentPlan === plan) throw badRequest(`You are already on the ${info.name} plan.`);
  const card = JSON.stringify({ number: m.cardNumber, holder: m.cardholder, bank: m.bank, type: m.cardType });
  const now = nowIso();
  const open = await get<PaymentRow>("SELECT * FROM payment_requests WHERE user_id = ? AND status = 'pending'", userId);
  if (open) {
    if (open.submitted_at) throw conflict("Your previous payment is being checked. Wait for the administrator's decision.");
    // Not sent yet: the user may switch plan or interval; the price and card are taken again.
    // A receipt uploaded for the other amount no longer fits, so it is dropped.
    const changed = open.plan !== plan || open.billing_interval !== interval;
    if (changed && open.receipt_key) await removePrivateFile(open.receipt_key).catch(() => undefined);
    await run(`UPDATE payment_requests SET plan = ?, billing_interval = ?, amount_usd = ?, amount_uzs = ?, card_json = ?, updated_at = ?${changed ? ", receipt_key = NULL, receipt_mime = NULL, receipt_name = NULL, receipt_size = NULL" : ""} WHERE id = ? AND status = 'pending' AND submitted_at IS NULL`,
      plan, interval, price.usd, price.uzs, card, now, open.id);
    return shapePayment((await get<PaymentRow>("SELECT * FROM payment_requests WHERE id = ?", open.id))!);
  }
  const id = newId();
  try {
    await run(
      "INSERT INTO payment_requests (id,user_id,plan,billing_interval,amount_usd,amount_uzs,card_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'pending',?,?)",
      id, userId, plan, interval, price.usd, price.uzs, card, now, now,
    );
  } catch {
    // A parallel request created the open one first (unique index on the open request).
    const again = await get<PaymentRow>("SELECT * FROM payment_requests WHERE user_id = ? AND status = 'pending'", userId);
    if (again) return shapePayment(again);
    throw conflict("Could not start the payment. Please try again.");
  }
  await logActivity(userId, "payment_started", "account", `Payment started: ${info.name} (${interval === "year" ? "yearly" : "monthly"})`, { refId: id });
  return shapePayment((await get<PaymentRow>("SELECT * FROM payment_requests WHERE id = ?", id))!);
}

/** Attach (or replace) the receipt while the request is not yet sent for review. */
export async function attachReceipt(userId: string, id: string, data: Buffer, originalName: string) {
  const r = await ownRequest(userId, id);
  if (r.status !== "pending" || r.submitted_at) throw badRequest("This payment can no longer be changed.");
  const mime = receiptType(data);
  if (!mime) throw badRequest("Upload the receipt as an image (JPG, PNG, WEBP) or a PDF file.");
  const key = await storePrivateFile(`receipts/${newId()}${RECEIPT_TYPES[mime]}`, data, mime);
  const { changes } = await run(
    "UPDATE payment_requests SET receipt_key = ?, receipt_mime = ?, receipt_name = ?, receipt_size = ?, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'pending' AND submitted_at IS NULL",
    key, mime, originalName.slice(0, 160), data.length, nowIso(), id, userId,
  );
  if (changes === 0) {
    await removePrivateFile(key);
    throw badRequest("This payment can no longer be changed.");
  }
  if (r.receipt_key) await removePrivateFile(r.receipt_key);
  return shapePayment((await get<PaymentRow>("SELECT * FROM payment_requests WHERE id = ?", id))!);
}

/** "To'lovni tasdiqlash": send the receipt to the administrators. The plan does NOT change here. */
export async function submitPayment(userId: string, id: string) {
  const r = await ownRequest(userId, id);
  if (r.status !== "pending") throw badRequest("This payment is already closed.");
  if (!r.receipt_key) throw badRequest("Upload the payment receipt first.");
  if (r.submitted_at) return shapePayment(r); // a double click does not send it twice
  const now = nowIso();
  await run("UPDATE payment_requests SET submitted_at = ?, updated_at = ? WHERE id = ? AND status = 'pending' AND submitted_at IS NULL", now, now, id);
  await logActivity(userId, "payment_submitted", "account", `Payment receipt sent for review: ${getPlans()[r.plan].name}`, { refId: id });
  await notify(userId, "account", "Payment sent for review", "Your payment is being checked. An administrator will confirm it soon.", "/payment");
  return shapePayment((await get<PaymentRow>("SELECT * FROM payment_requests WHERE id = ?", id))!);
}

/** Cancel an open request that has not been sent for review. */
export async function cancelPayment(userId: string, id: string) {
  const r = await ownRequest(userId, id);
  if (r.status !== "pending" || r.submitted_at) throw badRequest("A payment that is being checked cannot be cancelled.");
  await run("UPDATE payment_requests SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'pending' AND submitted_at IS NULL", nowIso(), id);
  if (r.receipt_key) {
    await removePrivateFile(r.receipt_key);
    await run("UPDATE payment_requests SET receipt_key = NULL WHERE id = ?", id);
  }
}

export async function listPayments(userId: string) {
  return (await all<PaymentRow>("SELECT * FROM payment_requests WHERE user_id = ? AND status != 'cancelled' ORDER BY created_at DESC LIMIT 50", userId)).map(shapePayment);
}

export { ownRequest };

// ---------------------------------------------------------------- admin side
const addPeriod = (from: Date, interval: Interval) => {
  const d = new Date(from);
  if (interval === "year") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
};

/**
 * Approve a submitted payment and activate the plan. Exactly one approval can succeed:
 * the status changes from pending to approved in one conditional UPDATE.
 */
export async function approvePayment(adminId: string, adminEmail: string, id: string) {
  const r = await get<PaymentRow>("SELECT * FROM payment_requests WHERE id = ?", id);
  if (!r) throw notFound("Payment request not found");
  if (r.user_id === adminId) throw forbidden("You cannot approve your own payment.");
  if (r.status !== "pending") throw conflict(`This payment is already ${r.status}.`);
  if (!r.submitted_at || !r.receipt_key) throw badRequest("The user has not sent a receipt yet.");
  const now = new Date();
  // An active manual plan of the same kind is extended from its current end, otherwise from today.
  const sub = await get<{ plan: string; provider: string | null; current_period_end: string | null }>("SELECT plan, provider, current_period_end FROM subscriptions WHERE user_id = ?", r.user_id);
  const base = sub?.provider === "manual" && sub.plan === r.plan && sub.current_period_end && Date.parse(sub.current_period_end) > now.getTime() ? new Date(sub.current_period_end) : now;
  const periodEnd = addPeriod(base, r.billing_interval);
  const iso = now.toISOString();
  const { changes } = await run(
    "UPDATE payment_requests SET status = 'approved', reviewed_by = ?, reviewed_at = ?, period_end = ?, updated_at = ? WHERE id = ? AND status = 'pending' AND submitted_at IS NOT NULL",
    adminId, iso, periodEnd, iso, id,
  );
  if (changes === 0) throw conflict("This payment was already handled by another administrator.");
  const amountCents = r.amount_uzs * 100;
  await transaction([
    ["UPDATE users SET plan = ?, plan_source = 'manual_payment', updated_at = ? WHERE id = ?", r.plan, iso, r.user_id],
    [`INSERT INTO subscriptions (user_id, plan, status, provider, current_period_end, cancel_at_period_end, billing_interval, updated_at)
      VALUES (?, ?, 'active', 'manual', ?, 0, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, status = 'active', provider = 'manual', current_period_end = excluded.current_period_end,
        cancel_at_period_end = 0, billing_interval = excluded.billing_interval, updated_at = excluded.updated_at`,
      r.user_id, r.plan, periodEnd, r.billing_interval, iso],
    ["INSERT INTO subscription_events (id,user_id,type,plan,amount_cents,currency,provider_ref,created_at) VALUES (?,?,?,?,?,?,?,?)",
      newId(), r.user_id, "upgraded", r.plan, null, null, `manual:${id}`, iso],
    ["INSERT INTO subscription_events (id,user_id,type,plan,amount_cents,currency,provider_ref,created_at) VALUES (?,?,?,?,?,?,?,?)",
      newId(), r.user_id, "payment", r.plan, amountCents, "uzs", `manual:${id}:${adminEmail}`, iso],
  ]);
  const name = getPlans()[r.plan].name;
  await logActivity(r.user_id, "plan_changed", "account", `Plan changed to ${name}`, { refId: id });
  await notify(r.user_id, "account", `Your ${name} plan is active`, `Your payment was confirmed. ${name} limits are active until ${periodEnd.slice(0, 10)}.`, "/subscription");
  return { ...shapePayment((await get<PaymentRow>("SELECT * FROM payment_requests WHERE id = ?", id))!), userId: r.user_id };
}

export async function rejectPayment(adminId: string, id: string, reason: string | null) {
  const r = await get<PaymentRow>("SELECT * FROM payment_requests WHERE id = ?", id);
  if (!r) throw notFound("Payment request not found");
  if (r.user_id === adminId) throw forbidden("You cannot review your own payment.");
  if (r.status !== "pending") throw conflict(`This payment is already ${r.status}.`);
  if (!r.submitted_at) throw badRequest("The user has not sent a receipt yet.");
  const now = nowIso();
  const { changes } = await run(
    "UPDATE payment_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, reject_reason = ?, updated_at = ? WHERE id = ? AND status = 'pending' AND submitted_at IS NOT NULL",
    adminId, now, reason, now, id,
  );
  if (changes === 0) throw conflict("This payment was already handled by another administrator.");
  await notify(r.user_id, "account", "Payment not confirmed",
    `Your payment for ${getPlans()[r.plan].name} was not confirmed. Reason: ${reason || "not given"}. You can upload a new receipt and send it again.`, "/payment");
  return { ...shapePayment((await get<PaymentRow>("SELECT * FROM payment_requests WHERE id = ?", id))!), userId: r.user_id };
}

/** A paid plan bought by card ends at its period end; the user returns to Free. */
export async function expireManualPlan(userId: string) {
  const now = nowIso();
  const sub = await get<{ plan: string; current_period_end: string | null }>(
    "SELECT plan, current_period_end FROM subscriptions WHERE user_id = ? AND provider = 'manual' AND status = 'active'", userId);
  if (!sub?.current_period_end || sub.current_period_end > now) return false;
  const { changes } = await run("UPDATE subscriptions SET status = 'expired', plan = 'free', updated_at = ? WHERE user_id = ? AND provider = 'manual' AND status = 'active' AND current_period_end <= ?", now, userId, now);
  if (!changes) return false;
  await transaction([
    ["UPDATE users SET plan = 'free', plan_source = NULL, updated_at = ? WHERE id = ?", now, userId],
    ["INSERT INTO subscription_events (id,user_id,type,plan,created_at) VALUES (?,?,?,?,?)", newId(), userId, "expired", "free", now],
  ]);
  await notify(userId, "account", "Your paid plan has ended", "The paid period is over. You are on the Free plan now. You can pay again on the Payment page.", "/payment");
  return true;
}

/** Daily cron: end every expired card-paid plan. */
export async function expireManualPlans() {
  const rows = await all<{ user_id: string }>("SELECT user_id FROM subscriptions WHERE provider = 'manual' AND status = 'active' AND current_period_end <= ?", nowIso());
  for (const r of rows) await expireManualPlan(r.user_id);
  return rows.length;
}
