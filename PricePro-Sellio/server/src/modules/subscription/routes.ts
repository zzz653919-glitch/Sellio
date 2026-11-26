import { Router } from "express";
import { all, get } from "../../db/index.js";
import { currentUser, requireAuth } from "../../middleware/auth.js";
import { getPlans, usage, type Plan } from "../../services/plans.js";

/**
 * The user's plan, limits and history. Paid plans are bought by bank card on the payment page
 * (services/payments.ts) and activated only when an administrator approves the receipt.
 */
export const subscriptionRouter = Router();
subscriptionRouter.use(requireAuth);

type SubRow = { user_id: string; plan: Plan; status: string; billing_interval: string | null; provider: string | null; current_period_end: string | null; cancel_at_period_end: number; updated_at: string };

subscriptionRouter.get("/", async (req, res) => {
  const user = currentUser(req);
  const [sub, history, usageNow] = await Promise.all([
    get<SubRow>("SELECT * FROM subscriptions WHERE user_id = ?", user.id),
    all<{ id: string; type: string; plan: string | null; amount_cents: number | null; currency: string | null; created_at: string }>(
      "SELECT id, type, plan, amount_cents, currency, created_at FROM subscription_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
      user.id,
    ),
    usage(user.id),
  ]);
  res.json({
    plan: user.plan,
    subscription: sub
      ? { plan: sub.plan, status: sub.status, provider: sub.provider, interval: sub.billing_interval, currentPeriodEnd: sub.current_period_end, cancelAtPeriodEnd: sub.cancel_at_period_end === 1 }
      : null,
    plans: getPlans(),
    usage: usageNow,
    history: history.map((h) => ({ id: h.id, type: h.type, plan: h.plan, amountCents: h.amount_cents, currency: h.currency, createdAt: h.created_at })),
  });
});
